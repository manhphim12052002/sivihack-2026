"""ingest-one: the live path for a notice the store has never seen.

`fetch_notice` → `load_notice_bytes` → `enrich_lot` for every lot of that notice: the same
two functions the batch runs, nothing else, so a judge's unseen tender takes exactly the
path the 3,000 batch lots took. Optionally registers pasted notice text as a MANUAL_INPUT
source and runs the rule and model extraction over it.

    python -m tender_extract.ingest_one 25812152
    python -m tender_extract.ingest_one https://oeffentlichevergabe.de/ui/de/notice/0f60a327-... --version 01
    python -m tender_extract.ingest_one 25812152 --text pasted.txt
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import psycopg

from . import db, llm, rules
from .enrich import enrich_lot, lots_current, notice_lots, observation_rows, record_totals
from .documents import File
from .fetch import fetch_notice
from .load import load_notice_bytes, print_stats

NOTICE_ID = re.compile(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{6,})(?:-(\d{1,2}))?", re.I)


def parse_reference(ref: str) -> tuple[str, str | None]:
    """Bare id, '<id>-<version>' or a notice URL → (notice_id, version or None)."""
    m = NOTICE_ID.search(ref)
    if not m:
        raise SystemExit(f"cannot find a notice id in {ref!r}")
    return m.group(1), m.group(2)


def ingest_text(conn: psycopg.Connection, lot: dict, path: Path, stats: Counter[str]) -> None:
    """Pasted notice text as a MANUAL_INPUT source: rules and model over it, procedure scope."""
    text = path.read_text(encoding="utf-8")
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    # "doc:<sha256>" is db.py's one documented form for a content-addressed source
    # (the other is "notice:<id>:<version>"); pasted text is content-addressed like any
    # fetched document, just origin=MANUAL_INPUT instead of PORTAL_FETCH.
    source_id = f"doc:{digest}"
    db.upsert_source(conn, {"id": source_id, "entity_type": "tender", "entity_id": lot["procedure_key"],
                            "type": "TXT", "filename": path.name, "origin": "MANUAL_INPUT", "sha256": digest,
                            "status": "AVAILABLE", "bytes": len(text.encode("utf-8")), "pages": 1,
                            "fetched_at": datetime.now(timezone.utc)})
    page_texts = {f"{source_id}#p1": text}
    db.insert_chunks(conn, [{"id": f"{source_id}#p1", "source_id": source_id, "page": 1, "text": text}])
    stats["rule_rows"] += db.insert_observations(conn, [
        {**row, "scope_type": "PROCEDURE", "scope_key": lot["procedure_key"], "source_id": source_id,
         "locator": path.name} for row in rules.extract(text)])
    lots = notice_lots(conn, lot)
    result = llm.extract(f"[{source_id}#p1]\n{text}", {"title": lot["title"], "buyer_name": lot["buyer_name"],
                                                        "filename": path.name, "lots": lots})
    if result.unavailable:
        stats["model_unavailable"] += 1
        return
    stats["model_calls"] += 1
    kept = {name: llm.gate(getattr(result, name), page_texts)[0]
            for name in ("facts", "requirements", "unmatched_requirements")}
    pseudo = File(name=path.name, path=path, sha256=digest, size=len(text))
    # extractor="llm_notice" (model over notice text, not a document): lower precedence
    # and lower base confidence than llm_doc, per ADR 0003's extractor precedence table.
    rows = observation_rows(result, kept, lot, lots, pseudo, extractor="llm_notice")
    stats["llm_rows"] += db.insert_observations(conn, rows)
    conn.commit()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m tender_extract.ingest_one",
                                     description="Load and enrich one notice by id or URL (the live path).")
    parser.add_argument("reference", help="notice id, '<id>-<version>', or oeffentlichevergabe.de notice URL")
    parser.add_argument("--version", help="notice version (default: newest)")
    parser.add_argument("--text", type=Path, help="pasted notice text to extract from as an extra source")
    parser.add_argument("--no-model", action="store_true")
    parser.add_argument("--all-notice-types", action="store_true", help="also accept award/result notices")
    parser.add_argument("--dsn", help="Postgres DSN (default: $DATABASE_URL)")
    args = parser.parse_args(argv)

    notice_id, version = parse_reference(args.reference)
    version = args.version or version
    stats: Counter[str] = Counter()
    with db.connect(args.dsn) as conn:
        xml = fetch_notice(notice_id, version)
        lot_keys = load_notice_bytes(conn, xml, competition_only=not args.all_notice_types, stats=stats)
        conn.commit()
        if not lot_keys:
            print(f"notice {notice_id} produced no construction lots ({dict(stats)})", file=sys.stderr)
            return 1
        print(f"loaded {len(lot_keys)} lot(s): {', '.join(lot_keys)}", file=sys.stderr)
        for lot_key in lot_keys:
            lot = lots_current(conn, "WHERE lot_key = %(k)s", {"k": lot_key})
            if not lot:   # superseded by a corrigendum already in the store
                lot = conn.execute("SELECT * FROM lots_latest WHERE lot_key = %(k)s", {"k": lot_key}).fetchall()
            enrich_lot(conn, lot[0], model=not args.no_model, stats=stats)
            if args.text:
                ingest_text(conn, lot[0], args.text, stats)
        record_totals(conn, stats)
        print_stats(stats)
        for lot_key in lot_keys:
            resolved = db.resolve(conn, [lot_key]).get(lot_key, {})
            print(f"\n{lot_key}: {len(resolved)} resolved items", file=sys.stderr)
            for attribute, row in sorted(resolved.items()):
                value = row["value_text"] or (row["condition"] if row["condition"] else "")
                print(f"  {attribute:28} {row['state']:22} {row['extractor']:10} {str(value)[:60]}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
