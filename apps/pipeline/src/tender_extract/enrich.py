"""Enrich stage: rules over notice prose, then documents → pages → model → gate → observations.

For each lot: run the extraction rules over its BT-750 prose and description (extractor
`rule`, source = the notice version), then fetch its Vergabeunterlagen through the platform
adapters, route the files by name, read the routed PDFs page by page, send each document
once to the model and keep only items whose quote is really on the page it cites
(extractor `llm_doc`, source = the document). Gated or unreachable platforms are recorded
on `documents` with the host named, so a Requirement the notice deferred to the documents
stays REFERRED_TO_DOCUMENTS with a reason.

Idempotent: observations are insert-only; a document already extracted with the current
prompt version is not sent to the model again; a package already retrieved for a lot is
not downloaded again. `ingest-one` calls the same `enrich_lot` for one notice.

    python -m tender_extract.enrich --all-rules          # rule stage over every current lot
    python -m tender_extract.enrich --limit 300          # model stage over open, fetchable lots
    python -m tender_extract.enrich --lot <lot_key>      # one lot, everything
"""

from __future__ import annotations

import argparse
import hashlib
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg

from . import adapters, db, llm, rules
from .documents import DEFAULT_STORE, File, Retrieved, fetch_documents
from .factsheet import CONFIDENCE_BY_EXTRACTOR
from .load import print_stats
from .reader import is_scanned, lot_hint, pdf_pages, route

STATE_PREFIX = "enrich."

LOT_COLUMNS = ("source, notice_id, notice_version, lot_id, lot_key, procedure_key, title, buyer_name, "
               "description, qualification_text, document_urls, submission_deadline")


# --- selecting lots ----------------------------------------------------------------


def lots_current(conn: psycopg.Connection, where: str = "", params: dict[str, Any] | None = None) -> list[dict]:
    return conn.execute(f"SELECT {LOT_COLUMNS} FROM lots_current {where} ORDER BY submission_deadline NULLS LAST",
                        params or {}).fetchall()


def fetchable(lot: dict) -> bool:
    return any(adapters.classify(u) == "ADAPTER" for u in lot["document_urls"] or [])


def model_slice(conn: psycopg.Connection, limit: int | None) -> list[dict]:
    """Open lots whose document URLs resolve to a supported adapter host, soonest deadline first."""
    rows = lots_current(conn, "WHERE submission_deadline >= now() AND cardinality(document_urls) > 0")
    rows = [r for r in rows if fetchable(r)]
    return rows[:limit] if limit else rows


def notice_lots(conn: psycopg.Connection, lot: dict) -> list[dict]:
    """Every lot of the same notice version, for the model's scope list."""
    return conn.execute(
        "SELECT lot_id, lot_key, title FROM lots WHERE source=%(s)s AND notice_id=%(n)s AND notice_version=%(v)s "
        "ORDER BY lot_id", {"s": lot["source"], "n": lot["notice_id"], "v": lot["notice_version"]}).fetchall()


# --- rule stage ----------------------------------------------------------------------


def rule_stage(conn: psycopg.Connection, lot: dict, stats: Counter[str]) -> int:
    """Regex requirements over the notice prose; source is the notice version itself.

    BT-750 (qualification_text) and the lot description are run separately so a rule
    hit is attributed to the field it actually came from, not blanket-stamped BT-750.
    """
    source_id = f"notice:{lot['notice_id']}:{lot['notice_version']}"
    blocks = [("\n".join(lot["qualification_text"] or []), rules.LOCATOR),
              (lot["description"] or "", "notice:description")]
    rows = [
        {**row, "scope_type": "LOT", "scope_key": lot["lot_key"], "source_id": source_id}
        for text, locator in blocks
        for row in rules.extract(text, locator=locator)
    ]
    n = db.insert_observations(conn, rows)
    stats["rule_rows"] += n
    stats["rule_lots"] += 1
    return n


# --- document stage ------------------------------------------------------------------


# db.py's documented `sources.type` vocabulary (init migration comment): PDF|DOCX|XLSX|TXT|
# MANUAL|EFORMS. A package can hold file kinds outside that set (GAEB .X83, plain .zip
# member with no extension); those get the additive "OTHER" rather than an invented code.
_SOURCE_TYPE_BY_EXTENSION = {"pdf": "PDF", "docx": "DOCX", "doc": "DOCX", "xlsx": "XLSX",
                            "xls": "XLSX", "txt": "TXT"}


def _source_row(lot: dict, file: File, url: str, platform: str, status: str, pages: int | None) -> dict:
    ext = file.path.suffix.lstrip(".").lower()
    return {
        "id": file.source_id, "entity_type": "tender", "entity_id": lot["procedure_key"],
        "type": _SOURCE_TYPE_BY_EXTENSION.get(ext, "OTHER"), "filename": file.name,
        "origin": "PORTAL_FETCH", "sha256": file.sha256, "status": status,
        "url": f"{url}#{file.name}", "bytes": file.size, "pages": pages, "platform": platform,
        "fetched_at": datetime.now(timezone.utc),
    }


def already_retrieved(conn: psycopg.Connection, lot: dict, url: str) -> list[File] | None:
    """Files of a package this lot already fetched, via `document_files`; None if never fetched.

    None means "fetch it"; an empty list would wrongly mean "fetched, zero files" (and would
    permanently skip a package whose local store copy was pruned, since it never re-checks).
    """
    row = conn.execute("SELECT status FROM documents WHERE lot_key=%(k)s AND url=%(u)s",
                       {"k": lot["lot_key"], "u": url}).fetchone()
    if not row or row["status"] != "RETRIEVED":
        return None
    files = db.document_file_sources(conn, lot["lot_key"], url)
    out = []
    for f in files:
        ext = f["filename"].rsplit(".", 1)[-1].lower() if "." in f["filename"] else "bin"
        path = DEFAULT_STORE / f"{f['sha256']}.{ext}"
        if path.exists():
            out.append(File(name=f["filename"], path=path, sha256=f["sha256"], size=f["bytes"] or 0))
    return out if out else None


def document_stage(conn: psycopg.Connection, lot: dict, *, model: bool, store: Path,
                   stats: Counter[str], prompt_version: str) -> None:
    for url in lot["document_urls"] or []:
        files = already_retrieved(conn, lot, url)
        if files is None:
            outcome = fetch_documents(url, store)
            stats[f"documents_{outcome.status}"] += 1
            db.upsert_document(conn, {"lot_key": lot["lot_key"], "url": url, "status": outcome.status,
                                      "platform": outcome.platform, "fetched_at": datetime.now(timezone.utc)})
            if not isinstance(outcome, Retrieved):
                print(f"    {outcome.status:11} {outcome.platform}  {getattr(outcome, 'reason', '')}", file=sys.stderr)
                continue
            files = outcome.files
        else:
            stats["documents_reused"] += 1
        platform = adapters.host_of(url)
        for file in files:
            read_file(conn, lot, file, url, platform, model=model, stats=stats, prompt_version=prompt_version)
        if files:
            # Linked after each file's Source row exists (document_files.source_id is a
            # foreign key); re-running is a no-op via the (lot_key, url, source_id) PK.
            db.insert_document_files(conn, lot["lot_key"], url, [f.source_id for f in files])
        conn.commit()


def read_file(conn: psycopg.Connection, lot: dict, file: File, url: str, platform: str, *,
              model: bool, stats: Counter[str], prompt_version: str) -> None:
    decision = route(file.name)
    if decision != "READ":
        db.upsert_source(conn, _source_row(lot, file, url, platform, "SKIPPED", None))
        stats[f"files_{decision.lower()}"] += 1
        return
    try:
        pages = pdf_pages(file.path)
    except Exception as exc:
        db.upsert_source(conn, _source_row(lot, file, url, platform, "UNREACHABLE", None))
        stats["files_unreadable"] += 1
        print(f"    unreadable {file.name}: {exc}", file=sys.stderr)
        return
    if is_scanned(pages):
        db.upsert_source(conn, _source_row(lot, file, url, platform, "SCANNED", len(pages)))
        stats["files_scanned"] += 1
        return
    db.upsert_source(conn, _source_row(lot, file, url, platform, "AVAILABLE", len(pages)))
    # chunk id -> page text, one entry per page; the same map is the model's document text
    # and the evidence gate's page lookup, so the id and the page number never drift apart.
    page_texts = {f"{file.source_id}#p{page}": text for page, text in enumerate(pages, start=1)}
    db.insert_chunks(conn, [{"id": cid, "source_id": file.source_id, "page": page, "text": text}
                            for page, (cid, text) in enumerate(page_texts.items(), start=1)])
    stats["files_read"] += 1
    if model:
        model_stage(conn, lot, file, page_texts, stats=stats, prompt_version=prompt_version)


# --- model stage ---------------------------------------------------------------------


def _extracted_before(conn: psycopg.Connection, source_id: str, prompt_version: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM observations WHERE source_id=%(s)s AND extractor='llm_doc' AND prompt_version=%(p)s LIMIT 1",
        {"s": source_id, "p": prompt_version}).fetchone() is not None


def _scope(item: dict, lot: dict, lots: list[dict]) -> tuple[str, str]:
    scope = item.get("scope") or {}
    if scope.get("type") == "LOT":
        for other in lots:
            if other["lot_id"] == scope.get("id"):
                return "LOT", other["lot_key"]
        return "LOT", lot["lot_key"]
    return "PROCEDURE", lot["procedure_key"]


def _page_of(chunk_id: str) -> int | None:
    try:
        return int(chunk_id.rsplit("#p", 1)[1])
    except (IndexError, ValueError):
        return None


def observation_rows(result: llm.ExtractionResult, kept: dict[str, list[dict]], lot: dict, lots: list[dict],
                     file: File, *, extractor: str = "llm_doc") -> list[dict]:
    """Typed observation rows from gated model items, plus NOT_FOUND for every kind the document lacks.

    Each Requirement is written twice, exactly like the rule stage (`rules._fact_row`):
    once under its own kind name (`kind='requirement'`) for a future decision rule, and
    once mirrored onto the fact sheet's own attribute name (`kind='fact'`) so
    `observations_resolved` actually surfaces it on the briefing page. `value_num` /
    `value_text` come from the condition's primary field, not from `statement_type`
    (which is extraction metadata, not the value — comparing on it would make two
    documents that both say EXPLICIT look like they agree even when their percentages
    differ, and identical percentages with different statement_type look CONFLICTING).
    """
    rows: list[dict] = []
    base = {"extractor": extractor, "source_id": file.source_id, "prompt_version": result.prompt_version,
            "confidence": CONFIDENCE_BY_EXTRACTOR[extractor]}

    def evidence(item: dict) -> dict:
        ev = item["evidence"][0]
        page = _page_of(ev["chunk_id"])
        return {"evidence_quote": ev["quote"], "page": page, "locator": f"{file.name}#p.{page}"}

    found_kinds: set[str] = set()
    for item in kept["requirements"]:
        scope_type, scope_key = _scope(item, lot, lots)
        condition = {k: v for k, v in (item.get("condition") or {}).items() if v is not None}
        found_kinds.add(item["kind"])
        value_num, value_text = rules.primary_value(item["kind"], condition)
        requirement = {**base, **evidence(item), "scope_type": scope_type, "scope_key": scope_key,
                       "kind": "requirement", "attribute": item["kind"], "state": "KNOWN",
                       "condition": condition, "value_num": value_num, "value_text": value_text}
        rows.append(requirement)
        fact_attribute = rules.FACT_ATTRIBUTE_BY_KIND.get(item["kind"])
        if fact_attribute:
            rows.append({**requirement, "kind": "fact", "attribute": fact_attribute})
    for item in kept["unmatched_requirements"]:
        scope_type, scope_key = _scope(item, lot, lots)
        digest = hashlib.sha1(llm.normalise(item["quote"]).lower().encode()).hexdigest()[:8]
        rows.append({**base, **evidence(item), "scope_type": scope_type, "scope_key": scope_key,
                     "kind": "unmatched", "attribute": f"{item['category']}#{digest}",
                     "category": item["category"], "state": "KNOWN", "value_text": item["quote"]})
    for item in kept["facts"]:
        scope_type, scope_key = _scope(item, lot, lots)
        rows.append({**base, **evidence(item), "scope_type": scope_type, "scope_key": scope_key,
                     "kind": "fact", "attribute": item["attribute"], "state": "KNOWN",
                     "value_text": item["value"]})
    # Read and not stated is a finding too: NOT_FOUND per kind, so "Unknown" has a reason.
    # PROCEDURE scope matches _scope()'s own default (a requirement with no lot named
    # applies to the whole procedure), so a KNOWN row found at PROCEDURE scope and its
    # NOT_FOUND siblings for the other kinds share the same scope_key.
    for kind in rules.REQUIREMENT_KINDS:
        if kind not in found_kinds:
            not_found = {**base, "scope_type": "PROCEDURE", "scope_key": lot["procedure_key"],
                        "kind": "requirement", "attribute": kind, "state": "NOT_FOUND",
                        "confidence": "not_found", "locator": file.name}
            rows.append(not_found)
            fact_attribute = rules.FACT_ATTRIBUTE_BY_KIND.get(kind)
            if fact_attribute:
                rows.append({**not_found, "kind": "fact", "attribute": fact_attribute})
    return rows


def model_stage(conn: psycopg.Connection, lot: dict, file: File, page_texts: dict[str, str], *,
                stats: Counter[str], prompt_version: str) -> None:
    if _extracted_before(conn, file.source_id, prompt_version):
        stats["model_cached"] += 1
        return
    lots = notice_lots(conn, lot)
    context = {"title": lot["title"], "buyer_name": lot["buyer_name"], "filename": file.name,
               "lots": lots, "lot_hint": lot_hint(file.name)}
    text = "\n\n".join(f"[{cid}]\n{page}" for cid, page in page_texts.items())
    result = llm.extract(text, context, prompt_version)
    if result.unavailable:
        stats["model_unavailable"] += 1
        return
    stats["model_calls"] += 1
    kept: dict[str, list[dict]] = {}
    rejected = 0
    for name in ("facts", "requirements", "unmatched_requirements"):
        kept[name], n = llm.gate(getattr(result, name), page_texts)
        rejected += n
    stats["model_items_kept"] += sum(len(v) for v in kept.values())
    stats["model_items_rejected"] += rejected
    conn.execute("UPDATE sources SET rejected_items = %(r)s WHERE id = %(id)s",
                 {"r": rejected, "id": file.source_id})
    stats["llm_rows"] += db.insert_observations(conn, observation_rows(result, kept, lot, lots, file))
    print(f"    model {file.name[:60]}: kept {sum(len(v) for v in kept.values())}, rejected {rejected}",
          file=sys.stderr)


# --- one lot, and totals -------------------------------------------------------------


def enrich_lot(conn: psycopg.Connection, lot: dict, *, model: bool = True, store: Path = DEFAULT_STORE,
               stats: Counter[str] | None = None, prompt_version: str = llm.PROMPT_VERSION) -> Counter[str]:
    """Rules, documents and model for one lot. The batch and ingest-one both call this."""
    stats = stats if stats is not None else Counter()
    print(f"  {lot['lot_key']}  {(lot['title'] or '')[:60]}", file=sys.stderr)
    rule_stage(conn, lot, stats)
    document_stage(conn, lot, model=model, store=store, stats=stats, prompt_version=prompt_version)
    conn.commit()
    stats["lots_enriched"] += 1
    return stats


def record_totals(conn: psycopg.Connection, stats: Counter[str]) -> None:
    """The numbers said on stage, written by the pipeline itself (W3.2)."""
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    values: dict[str, Any] = {
        "last_run_at": now,
        "last_run.lots_enriched": stats["lots_enriched"],
        "last_run.model_calls": stats["model_calls"],
        "last_run.items_rejected": stats["model_items_rejected"],
    }
    for row in conn.execute("SELECT status, count(*) AS n FROM documents GROUP BY 1"):
        values[f"documents.{row['status']}"] = row["n"]
    for row in conn.execute("SELECT extractor, count(*) AS n FROM observations GROUP BY 1"):
        values[f"observations.{row['extractor']}"] = row["n"]
    values["lots_with_retrieved_document"] = conn.execute(
        "SELECT count(DISTINCT lot_key) AS n FROM documents WHERE status='RETRIEVED'").fetchone()["n"]
    values["sources.rejected_items"] = conn.execute(
        "SELECT coalesce(sum(rejected_items),0) AS n FROM sources").fetchone()["n"]
    for view in ("lots", "lots_latest", "lots_current"):
        values[f"{view}.count"] = conn.execute(f"SELECT count(*) AS n FROM {view}").fetchone()["n"]
    for key, value in values.items():
        db.set_state(conn, STATE_PREFIX + key, str(value))
    conn.commit()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m tender_extract.enrich",
                                     description="Rules, documents and model extraction into observations.")
    target = parser.add_mutually_exclusive_group()
    target.add_argument("--lot", help="one lot_key")
    target.add_argument("--all-rules", action="store_true", help="rule stage over every lot in lots_current")
    parser.add_argument("--limit", type=int, help="model stage: open fetchable lots to process (default: all)")
    parser.add_argument("--no-model", action="store_true", help="skip the model, rules and documents only")
    parser.add_argument("--store", type=Path, default=DEFAULT_STORE, help="content-addressed document store")
    parser.add_argument("--sleep", type=float, default=1.0, help="seconds between lots that fetched documents")
    parser.add_argument("--dsn", help="Postgres DSN (default: $DATABASE_URL)")
    args = parser.parse_args(argv)

    stats: Counter[str] = Counter()
    with db.connect(args.dsn) as conn:
        if args.all_rules:
            for lot in lots_current(conn):
                rule_stage(conn, lot, stats)
            conn.commit()
        else:
            lots = lots_current(conn, "WHERE lot_key = %(k)s", {"k": args.lot}) if args.lot \
                else model_slice(conn, args.limit)
            print(f"{len(lots)} lot(s) to enrich", file=sys.stderr)
            for lot in lots:
                enrich_lot(conn, lot, model=not args.no_model, store=args.store, stats=stats)
                time.sleep(args.sleep)
        record_totals(conn, stats)
        print_stats(stats)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
