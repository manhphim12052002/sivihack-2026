"""Postgres (Supabase) store for the tender golden dataset.

Grain is the lot, not the notice: a EUR 14M procedure may contain one EUR 700k
lot that fits a small contractor, so a notice-grained row would hide the cases
that matter. Every notice version is kept rather than overwritten; callers read
the `lots_latest` view to get one row per lot.

Facts and requirements live in `observation`, one row per (scope, attribute,
extractor, source). Per ADR 0001 those rows are immutable: `insert_observations`
uses ON CONFLICT DO NOTHING and nothing here ever updates or deletes one.
Which observation the application shows is decided at read time by the
`observations_resolved` view (extractor precedence, agreement merges evidence,
disagreement yields CONFLICTING); `resolve()` only reads that view.

Schema lives in `supabase/migrations/`. This module carries no business logic:
SQL is built from the keys of the row dicts it is handed, so adding a column to
the migration needs no change here.
"""

from __future__ import annotations

import os
import re
from collections import defaultdict
from typing import Any, Iterable

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

DATABASE_URL_ENV = "DATABASE_URL"

# Natural key of a lot row; `lot_key` itself is a generated column in the DB.
LOT_CONFLICT_COLUMNS = ("source", "notice_id", "notice_version", "lot_id")

# `sources` is shared with the company-intelligence pipeline (see the init migration). Rows the
# tender pipeline writes use: entity_type='tender', entity_id=procedure_key, type in
# EFORMS|PDF|DOCX|XLSX|TXT, origin in EFORM_API|PORTAL_FETCH|MANUAL_INPUT, status in
# AVAILABLE|GATED|UNREACHABLE|SCANNED|SKIPPED, id 'notice:<id>:<version>' or 'doc:<sha256>'.
# `chunks` rows use id '<source_id>#p<page>' so re-inserting a page is a no-op.
# Columns a re-fetch of the same source may legitimately change.
SOURCE_UPDATE_COLUMNS = ("status", "fetched_at", "pages", "bytes", "rejected_items")

# Columns declared as Postgres arrays (text[]) rather than jsonb in the migration.
# psycopg adapts Python lists to arrays natively, so these pass through unwrapped;
# every other list/dict value is sent as Jsonb. Keep in sync with the migration.
ARRAY_COLUMNS = frozenset({"qualification_text", "document_urls"})
# Generated stored columns on `lot`; never sent in an INSERT.
GENERATED_LOT_COLUMNS = frozenset({"lot_key", "procedure_key"})

COUNTED_TABLES = ("lots", "observations", "sources", "documents", "chunks", "companies", "verdicts", "ingest_jobs")

_IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")


# --- connection -----------------------------------------------------------------


def connect(dsn: str | None = None) -> psycopg.Connection:
    """Open a connection; the DSN comes from the argument or `DATABASE_URL`.

    Transactions are explicit (autocommit off): callers commit per batch so a
    half-loaded notice version never becomes visible.
    """
    dsn = dsn or os.environ.get(DATABASE_URL_ENV)
    if not dsn:
        raise RuntimeError(
            f"no database DSN: pass connect(dsn=...) or set the {DATABASE_URL_ENV} "
            "environment variable (see README, 'Run the pipeline and tests')"
        )
    return psycopg.connect(dsn, autocommit=False, row_factory=dict_row)


# --- keys -----------------------------------------------------------------------
# Both keys must produce byte-for-byte the same string as the generated columns in
# the migration (source||'|'||notice_id||'|'||notice_version||'|'||lot_id and
# source||'|'||notice_id). Observations reference lots by these strings, so a
# change here without a matching migration silently orphans every observation.


# A notice without a VersionID is its first publication. The publisher's rich profile
# zero-pads ('01'); the national profile ships bare integers ('3'), which is fine
# because lots_latest orders by (length, text). Every writer must use this one default:
# the lots row, the lot key and the notice source id have to agree byte for byte.
DEFAULT_NOTICE_VERSION = "01"


def notice_version(version: str | None) -> str:
    """The stored notice version string, defaulting a missing VersionID."""
    return version or DEFAULT_NOTICE_VERSION


def lot_key(source: str, notice_id: str, version: str | None, lot_id: str) -> str:
    """Stable identity for one lot at one notice version (LOT scope key)."""
    return "|".join((source, notice_id, notice_version(version), lot_id))


def procedure_key(source: str, notice_id: str) -> str:
    """Stable identity for a procedure across its notice versions (PROCEDURE scope key)."""
    return "|".join((source, notice_id))


# --- SQL builders (pure, tested without a database) -----------------------------


def _check_identifiers(names: Iterable[str]) -> list[str]:
    """Column names come from our own dicts, but refuse anything that is not a plain identifier."""
    out = list(names)
    bad = [n for n in out if not _IDENTIFIER.match(n)]
    if bad:
        raise ValueError(f"unsafe column name(s): {bad}")
    return out


def _upsert_sql(
    table: str,
    keys: Iterable[str],
    conflict_cols: Iterable[str],
    update: bool | Iterable[str] = True,
) -> str:
    """INSERT ... ON CONFLICT statement with `%(name)s` placeholders for `keys`.

    `update=True` updates every non-conflict column, `False` does nothing on
    conflict (immutable rows), an iterable updates exactly those columns.
    """
    cols = _check_identifiers(keys)
    conflict = _check_identifiers(conflict_cols)
    _check_identifiers([table])
    if update is True:
        targets = [c for c in cols if c not in conflict]
    elif update is False:
        targets = []
    else:
        targets = [c for c in _check_identifiers(update) if c in cols and c not in conflict]

    sql = (
        f"INSERT INTO {table} ({', '.join(cols)}) "
        f"VALUES ({', '.join(f'%({c})s' for c in cols)}) "
        f"ON CONFLICT ({', '.join(conflict)}) "
    )
    if targets:
        sql += "DO UPDATE SET " + ", ".join(f"{c} = EXCLUDED.{c}" for c in targets)
    else:
        sql += "DO NOTHING"
    return sql


def _adapt(row: dict[str, Any]) -> dict[str, Any]:
    """Wrap list/dict values as Jsonb except for declared array columns."""
    return {
        k: Jsonb(v) if isinstance(v, (list, dict)) and k not in ARRAY_COLUMNS else v
        for k, v in row.items()
    }


def _group_by_keys(rows: Iterable[dict[str, Any]]) -> dict[tuple[str, ...], list[dict[str, Any]]]:
    """Bucket rows by their key set so each bucket shares one statement for executemany."""
    groups: dict[tuple[str, ...], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[tuple(row)].append(_adapt(row))
    return groups


def _insert_many(conn: psycopg.Connection, table: str, rows: Iterable[dict[str, Any]],
                 conflict_cols: Iterable[str]) -> int:
    """ON CONFLICT DO NOTHING insert; returns the number of rows actually inserted."""
    conflict = tuple(conflict_cols)
    inserted = 0
    with conn.cursor() as cur:
        for keys, group in _group_by_keys(rows).items():
            cur.executemany(_upsert_sql(table, keys, conflict, update=False), group)
            inserted += max(cur.rowcount, 0)
    return inserted


# --- lots and sources -----------------------------------------------------------


def upsert_lot(conn: psycopg.Connection, row: dict[str, Any]) -> str:
    """Insert or update one lot at one notice version. Returns its lot_key.

    Accepts the same row shape `store.py` did. `lot_key` and `procedure_key`
    are dropped if present: both are generated columns in the schema, and
    Postgres rejects explicit values for them.
    """
    row = {k: v for k, v in row.items() if k not in GENERATED_LOT_COLUMNS}
    conn.execute(_upsert_sql("lots", row, LOT_CONFLICT_COLUMNS), _adapt(row))
    return lot_key(row["source"], row["notice_id"], row["notice_version"], row["lot_id"])


def upsert_source(conn: psycopg.Connection, row: dict[str, Any]) -> str:
    """Insert or refresh one Source (notice version or fetched document). Returns its id."""
    conn.execute(_upsert_sql("sources", row, ("id",), update=SOURCE_UPDATE_COLUMNS), _adapt(row))
    return row["id"]


def upsert_document(conn: psycopg.Connection, row: dict[str, Any]) -> None:
    """Insert or update the fetch outcome of one (lot, url) document link."""
    conn.execute(_upsert_sql("documents", row, ("lot_key", "url")), _adapt(row))


def insert_document_files(conn: psycopg.Connection, lot_key: str, url: str, source_ids: Iterable[str]) -> None:
    """Record which Sources came from unpacking one (lot, url) package.

    `documents.source_id` is a single nullable column (one document link, one Source);
    a package unpacks into many files, so the actual link is this table. Idempotent:
    re-fetching the same package re-links the same source ids, nothing new happens.
    """
    rows = [{"lot_key": lot_key, "url": url, "source_id": sid} for sid in source_ids]
    if rows:
        _insert_many(conn, "document_files", rows, ("lot_key", "url", "source_id"))


def document_file_sources(conn: psycopg.Connection, lot_key: str, url: str) -> list[dict[str, Any]]:
    """The Sources already fetched for one (lot, url) package, for reuse without re-fetching."""
    return conn.execute(
        "SELECT s.id, s.filename, s.sha256, s.bytes FROM document_files df "
        "JOIN sources s ON s.id = df.source_id WHERE df.lot_key = %(k)s AND df.url = %(u)s",
        {"k": lot_key, "u": url}).fetchall()


def insert_chunks(conn: psycopg.Connection, rows: Iterable[dict[str, Any]]) -> int:
    """Insert page text per (source_id, page); existing pages are left untouched."""
    return _insert_many(conn, "chunks", rows, ("id",))


# --- observations ---------------------------------------------------------------

OBSERVATION_CONFLICT_COLUMNS = ("scope_key", "attribute", "extractor", "source_id")


def insert_observations(conn: psycopg.Connection, rows: Iterable[dict[str, Any]]) -> int:
    """Append observations. Never updates: an existing reading is kept as is (ADR 0001)."""
    return _insert_many(conn, "observations", rows, OBSERVATION_CONFLICT_COLUMNS)


def resolve(conn: psycopg.Connection, scope_keys: list[str]) -> dict[str, dict[str, dict[str, Any]]]:
    """Resolved value per attribute for each scope key, from `observations_resolved`.

    Returns {scope_key: {attribute: row}}; a scope key with no observations is absent.
    """
    if not scope_keys:
        return {}
    out: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT * FROM observations_resolved WHERE scope_key = ANY(%(keys)s)",
            {"keys": list(scope_keys)},
        )
        for row in cur:
            out[row["scope_key"]][row["attribute"]] = row
    return dict(out)


# --- sync state and reporting ---------------------------------------------------


def get_state(conn: psycopg.Connection, key: str, default: str | None = None) -> str | None:
    row = conn.execute("SELECT value FROM sync_state WHERE key = %s", (key,)).fetchone()
    return row["value"] if row else default


def set_state(conn: psycopg.Connection, key: str, value: str) -> None:
    conn.execute(
        _upsert_sql("sync_state", ("key", "value"), ("key",)),
        {"key": key, "value": value},
    )


def counts(conn: psycopg.Connection) -> dict[str, int]:
    """Row counts for the CLI to report after a run."""
    return {
        table: conn.execute(f"SELECT COUNT(*) AS n FROM {table}").fetchone()["n"]
        for table in COUNTED_TABLES
    }
