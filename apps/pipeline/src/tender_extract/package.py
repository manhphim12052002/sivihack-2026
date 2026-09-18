"""Package intake: a manually downloaded Vergabeunterlagen folder becomes Sources, Chunks and
Observations of one lot, exactly as a portal fetch would.

Gated portals (cosinex, evergabe.de, ...) hand out the package only after a form, which
ADR 0004 rules out automating. An estimator downloads the ZIP by hand; this command reads the
unpacked folder and runs the same stages `enrich` runs on a fetched package:

    file → sha256 store → sources row
         → GAEB X83: positions / ZTV / DIN 18299 chunks (gaeb.py, deterministic)
         → PDF: pdftotext pages (reader.py); drawings and the LV print are skipped
         → model extraction + evidence gate → observations (enrich.model_stage)
    documents + document_files link every file to the lot.

    python -m tender_extract.package --lot "<lot_key>" --dir data/Vergabeunterlagen_CXPWY6LLKDU
    python -m tender_extract.package --lot "<lot_key>" --dir ... --url https://portal/... --no-model

Idempotent: re-running re-links the same content hashes and sends nothing already extracted
with the current prompt version to the model again.
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import psycopg

from . import db, gaeb, llm
from .documents import DEFAULT_STORE, File, store_file
from .enrich import _source_row, lots_current, model_stage, record_totals, rule_stage
from .load import print_stats
from .reader import SKIP, is_scanned, pdf_pages

# A PDF whose pages carry fewer characters than this on average is a drawing or a form
# rendered as graphics: nothing normative to read, so it is recorded SKIPPED, not sent.
DRAWING_CHARS_PER_PAGE = 400
SOURCE_TYPE = {"pdf": "PDF", "x83": "GAEB", "d83": "GAEB", "docx": "DOCX", "xlsx": "XLSX", "txt": "TXT"}


def collect(folder: Path) -> list[tuple[str, bytes]]:
    """(relative name, bytes) for every regular file, folder order kept stable."""
    return [(str(p.relative_to(folder)), p.read_bytes())
            for p in sorted(folder.rglob("*")) if p.is_file() and not p.name.startswith(".")]


def decide(name: str, names: list[str]) -> str:
    """'GAEB' | 'PDF' | 'SKIP:<reason>' for one file of the package."""
    lower = name.lower()
    ext = lower.rsplit(".", 1)[-1] if "." in lower else ""
    if ext == "x83":
        return "GAEB"
    if ext == "d83":
        return "SKIP:D83 duplicate of the X83"
    if ext != "pdf":
        return f"SKIP:{ext or 'no'} files are not read (P2)"
    if SKIP.search(name):
        return "SKIP:drawing, quantities or notice by filename"
    # The printed LV is the X83's PDF rendering (here even a machine translation): read the X83.
    if "lv" in lower.replace("-", " ").replace("_", " ").split() or lower.endswith("-lv.pdf"):
        if any(n.lower().endswith(".x83") for n in names):
            return "SKIP:LV print, the X83 is read instead"
    return "PDF"


def read_pdf(file: File) -> tuple[str, dict[str, str] | None]:
    """('AVAILABLE', chunk texts) or ('SCANNED' | 'DRAWING' | 'UNREACHABLE', None)."""
    try:
        pages = pdf_pages(file.path)
    except Exception as exc:  # pdftotext missing or a broken file: recorded, never fatal
        print(f"    unreadable {file.name}: {exc}", file=sys.stderr)
        return "UNREACHABLE", None
    if is_scanned(pages):
        return "SCANNED", None
    if sum(len(p.strip()) for p in pages) / max(len(pages), 1) < DRAWING_CHARS_PER_PAGE:
        return "DRAWING", None
    return "AVAILABLE", {f"{file.source_id}#p{i}": text for i, text in enumerate(pages, start=1)}


def ingest(conn: psycopg.Connection, lot: dict, folder: Path, url: str, *, model: bool,
           store: Path = DEFAULT_STORE, stats: Counter[str] | None = None,
           prompt_version: str = llm.PROMPT_VERSION) -> Counter[str]:
    stats = stats if stats is not None else Counter()
    platform = "manual download"
    rule_stage(conn, lot, stats)
    entries = collect(folder)
    names = [n for n, _ in entries]
    files: list[File] = []
    for name, data in entries:
        file = store_file(name, data, store)
        files.append(file)
        decision = decide(name, names)
        ext = file.path.suffix.lstrip(".").lower()
        if decision.startswith("SKIP:"):
            db.upsert_source(conn, {**_source_row(lot, file, url, platform, "SKIPPED", None),
                                    "type": SOURCE_TYPE.get(ext, "OTHER")})
            stats["files_skipped"] += 1
            print(f"    skipped    {name[:70]}  ({decision[5:]})", file=sys.stderr)
            continue
        if decision == "GAEB":
            boq = gaeb.parse(file.path)
            rows = gaeb.chunks(boq, file.source_id)
            db.upsert_source(conn, {**_source_row(lot, file, url, platform, "AVAILABLE", None), "type": "GAEB",
                                    "pages": len(boq.positions)})
            db.insert_chunks(conn, rows)
            stats["files_read"] += 1
            stats["positions"] += len(boq.positions)
            print(f"    gaeb       {name[:70]}  {len(boq.positions)} positions, {len(rows)} chunks", file=sys.stderr)
            chunk_texts = {r["id"]: r["text"] for r in rows}
        else:
            status, chunk_texts = read_pdf(file)
            if chunk_texts is None:
                db.upsert_source(conn, _source_row(lot, file, url, platform, "SKIPPED" if status == "DRAWING" else status, None))
                stats[f"files_{status.lower()}"] += 1
                print(f"    {status.lower():10} {name[:70]}", file=sys.stderr)
                continue
            db.upsert_source(conn, _source_row(lot, file, url, platform, "AVAILABLE", len(chunk_texts)))
            db.insert_chunks(conn, [{"id": cid, "source_id": file.source_id, "page": i, "text": text}
                                    for i, (cid, text) in enumerate(chunk_texts.items(), start=1)])
            stats["files_read"] += 1
            print(f"    pdf        {name[:70]}  {len(chunk_texts)} pages", file=sys.stderr)
        if model:
            model_stage(conn, lot, file, chunk_texts, stats=stats, prompt_version=prompt_version)
    db.upsert_document(conn, {"lot_key": lot["lot_key"], "url": url, "status": "RETRIEVED",
                              "platform": platform, "fetched_at": datetime.now(timezone.utc)})
    db.insert_document_files(conn, lot["lot_key"], url, [f.source_id for f in files])
    conn.commit()
    stats["lots_enriched"] += 1
    return stats


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m tender_extract.package",
                                     description="Read a downloaded Vergabeunterlagen folder into one lot's sources, chunks and observations.")
    parser.add_argument("--lot", required=True, help="lot_key (see lots_current)")
    parser.add_argument("--dir", required=True, type=Path, help="unpacked package folder")
    parser.add_argument("--url", help="portal URL the package came from (default: the lot's first document URL)")
    parser.add_argument("--no-model", action="store_true", help="sources and chunks only, no extraction")
    parser.add_argument("--store", type=Path, default=DEFAULT_STORE)
    parser.add_argument("--dsn", help="Postgres DSN (default: $DATABASE_URL)")
    args = parser.parse_args(argv)

    if not args.dir.is_dir():
        raise SystemExit(f"{args.dir} is not a directory")
    stats: Counter[str] = Counter()
    with db.connect(args.dsn) as conn:
        lots = lots_current(conn, "WHERE lot_key = %(k)s", {"k": args.lot})
        if not lots:
            raise SystemExit(f"lot {args.lot!r} not found in lots_current (load or ingest_one the notice first)")
        lot = lots[0]
        url = args.url or (lot["document_urls"] or [f"manual:{args.dir.name}"])[0]
        print(f"  {lot['lot_key']}  {(lot['title'] or '')[:60]}\n  package {args.dir} → {url}", file=sys.stderr)
        ingest(conn, lot, args.dir, url, model=not args.no_model, store=args.store, stats=stats)
        record_totals(conn, stats)
        print_stats(stats)
        resolved = db.resolve(conn, [lot["lot_key"], lot["procedure_key"]])
        for scope, items in resolved.items():
            for attribute, row in sorted(items.items()):
                if row["kind"] != "fact":
                    continue
                value = row["value_text"] or (row["condition"] if row["condition"] else "")
                print(f"  {attribute:28} {row['state']:22} {row['extractor']:10} {str(value)[:60]}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
