"""Export the pipeline's Postgres relations as the web app's JSON data files.

The web reads through one data port (`apps/web/src/lib/db`, see `docs/json-data-backend.md`);
its default backend is a directory of JSON files, one per relation, with the Postgres column
names as keys. Views are exported resolved: `lots_latest`, `lots_current` and
`observations_resolved` are the outputs of the SQL views, so the resolution rules run here, once,
and the web only reads.

The export is trimmed to what the board and the briefing need, so the files stay small enough
to commit: every lot whose documents were read, plus the `--open-lots` soonest-deadline open
lots, with their observations, sources, chunks and document links.

    python -m tender_extract.export_json                     # data/json-db, 200 open lots
    python -m tender_extract.export_json --out data/json-db --open-lots 300
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

import psycopg

from . import db

DEFAULT_OUT = Path("data/json-db")


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    raise TypeError(f"not JSON serialisable: {type(value).__name__}")


def write(out: Path, table: str, rows: list[dict[str, Any]]) -> None:
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"{table}.json"
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=1, default=_json_default) + "\n", "utf-8")
    print(f"  {table:24} {len(rows):6} rows  {path.stat().st_size / 1024:8.0f} kB", file=sys.stderr)


def select_lots(conn: psycopg.Connection, open_lots: int) -> list[dict[str, Any]]:
    """Lots with retrieved documents first, then the soonest open deadlines; newest notice version."""
    return conn.execute(
        """
        WITH with_docs AS (SELECT DISTINCT lot_key FROM documents WHERE status = 'RETRIEVED'),
             open_soon AS (
               SELECT lot_key FROM lots_current
                WHERE submission_deadline >= now()
                ORDER BY submission_deadline
                LIMIT %(n)s)
        SELECT l.* FROM lots_latest l
         WHERE l.lot_key IN (SELECT lot_key FROM with_docs UNION SELECT lot_key FROM open_soon)
         ORDER BY l.submission_deadline NULLS LAST
        """,
        {"n": open_lots},
    ).fetchall()


def export(conn: psycopg.Connection, out: Path, open_lots: int) -> None:
    lots = select_lots(conn, open_lots)
    lot_keys = [l["lot_key"] for l in lots]
    scope_keys = lot_keys + sorted({l["procedure_key"] for l in lots})
    write(out, "lots_latest", lots)
    write(out, "lots_current", [l for l in lots if conn.execute(
        "SELECT 1 FROM lots_current WHERE lot_key = %(k)s", {"k": l["lot_key"]}).fetchone()])

    observations = conn.execute(
        "SELECT * FROM observations_resolved WHERE scope_key = ANY(%(k)s)", {"k": scope_keys}).fetchall()
    write(out, "observations_resolved", observations)

    documents = conn.execute("SELECT * FROM documents WHERE lot_key = ANY(%(k)s)", {"k": lot_keys}).fetchall()
    write(out, "documents", documents)
    files = conn.execute("SELECT * FROM document_files WHERE lot_key = ANY(%(k)s)", {"k": lot_keys}).fetchall()
    write(out, "document_files", files)

    source_ids = sorted({f["source_id"] for f in files} | {
        e["source_id"] for o in observations for e in (o["evidence"] or []) if e.get("source_id")})
    sources = conn.execute("SELECT * FROM sources WHERE id = ANY(%(ids)s)", {"ids": source_ids}).fetchall()
    write(out, "sources", sources)
    # Horizontal whitespace runs from `pdftotext -layout` are collapsed: the evidence gate
    # compares whitespace-normalised text on both sides, and layout-heavy plan pages shrink tenfold.
    chunks = conn.execute(
        "SELECT id, source_id, page, section, paragraph, cell_range, created_at, "
        "regexp_replace(text, '[ \t]{2,}', ' ', 'g') AS text FROM chunks WHERE source_id = ANY(%(ids)s)",
        {"ids": source_ids}).fetchall()
    write(out, "chunks", chunks)

    cpv = conn.execute("SELECT * FROM cpv_descriptions").fetchall()
    if cpv:
        write(out, "cpv_descriptions", cpv)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m tender_extract.export_json",
                                     description="Export the pipeline relations as JSON files for the web's data port.")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--open-lots", type=int, default=200, help="soonest-deadline open lots to include besides lots with documents")
    parser.add_argument("--dsn", help="Postgres DSN (default: $DATABASE_URL)")
    args = parser.parse_args(argv)
    with db.connect(args.dsn) as conn:
        export(conn, args.out, args.open_lots)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
