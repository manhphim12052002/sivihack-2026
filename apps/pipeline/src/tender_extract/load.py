"""Load stage: parsed eForms notices into Supabase Postgres.

Reads either the cached bulk day exports (backfill) or a single notice fetched on
demand (the live path a judge's unseen notice takes). Both go through the same
parse-and-write code so the live path cannot drift from the batch one.

Per notice version: register the notice as a `sources` row, upsert one `lots`
row per construction lot, append the `xpath` observations. Prose and document
reading happen in enrich, which runs separately so the rules can be iterated
without re-parsing 3,000 notices.

Idempotent: re-running over the same input upserts the same lot rows and hits
the observations primary key (ON CONFLICT DO NOTHING), so nothing changes.

    python -m tender_extract.load --zip data/cache/2026-09-16-eforms.zip
    python -m tender_extract.load --cache data/cache          # every cached day
"""

from __future__ import annotations

import argparse
import sys
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import psycopg

from . import db
from .eforms import COMPETITION_TYPES, parse_notice
from .factsheet import ATTRIBUTES, coverage, lot_row, notice_source_id, xpath_observations

# sync_state keys written after a batch, read by /health and the demo notes.
STATE_LAST_LOAD_AT = "load.last_run_at"
STATE_DROPPED_AWARDED = "load.dropped_awarded_by_title"

# Stats keys with this prefix are per-attribute coverage counts, printed separately.
COVERAGE_PREFIX = "observation:"


def load_notice_bytes(
    conn: psycopg.Connection,
    xml: bytes,
    *,
    cpv_prefix: str | None = "45",
    competition_only: bool = True,
    stats: Counter[str] | None = None,
) -> list[str]:
    """Parse one notice and write its lots. Returns the lot_keys written.

    Does not commit: the caller decides the transaction boundary (a whole day's
    export, one poll page, or one live notice).
    """
    stats = stats if stats is not None else Counter()
    try:
        records = parse_notice(xml, cpv_prefix=cpv_prefix)
    except Exception as exc:  # a single malformed notice must not kill a run
        stats["parse_error"] += 1
        stats[f"parse_error:{type(exc).__name__}"] += 1
        return []

    if not records:
        stats["no_matching_lots"] += 1
        return []

    first = records[0]
    if competition_only:
        # The subtype code (cn-standard, can-modif, …) is carried on notice_type;
        # the notice_subtype field is never populated by this feed.
        if first.notice_type not in COMPETITION_TYPES:
            stats["skipped_not_competition"] += 1
            stats[f"skipped:{first.notice_type}"] += 1
            return []
        if first.title_marks_awarded:
            stats["skipped_awarded_by_title"] += 1
            return []

    # The notice version is the Source every xpath observation cites (Flow 4);
    # it must exist before the observations that reference it.
    db.upsert_source(conn, {
        "id": notice_source_id(first),
        "entity_type": "tender",
        "entity_id": db.procedure_key(first.source, first.notice_id),
        "type": "EFORMS",
        "origin": "EFORM_API",
        "status": "AVAILABLE",
        "url": first.notice_url,
        "fetched_at": datetime.now(timezone.utc),
    })

    written: list[str] = []
    observations: list[dict] = []
    for record in records:
        written.append(db.upsert_lot(conn, lot_row(record, lot_count=len(records))))
        observations.extend(xpath_observations(record))
        stats["lots"] += 1
        stats[f"profile:{record.schema_profile}"] += 1

    stats["observations"] += db.insert_observations(conn, observations)
    for attr, n in coverage(observations).items():
        if n:
            stats[f"{COVERAGE_PREFIX}{attr}"] += n
    return written


def load_zip(
    conn: psycopg.Connection,
    zip_path: Path,
    *,
    cpv_prefix: str | None = "45",
    competition_only: bool = True,
    stats: Counter[str] | None = None,
) -> int:
    """Load every notice in one bulk export zip, committing once at the end."""
    stats = stats if stats is not None else Counter()
    count = 0
    with zipfile.ZipFile(zip_path) as zf:
        for name in zf.namelist():
            if name.endswith("/"):
                continue
            stats["notices_read"] += 1
            count += len(load_notice_bytes(
                conn, zf.read(name),
                cpv_prefix=cpv_prefix, competition_only=competition_only, stats=stats,
            ))
    conn.commit()
    return count


# --- shared by the load and backfill CLIs ---------------------------------------


def add_load_args(parser: argparse.ArgumentParser) -> None:
    """Options every command that writes lots accepts."""
    parser.add_argument("--dsn", help="Postgres DSN (default: $DATABASE_URL)")
    parser.add_argument("--cpv", default="45",
                        help="CPV prefix to keep; empty string keeps everything")
    parser.add_argument("--all-notice-types", action="store_true",
                        help="keep awards and results, not just open competitions")


def load_archive(conn: psycopg.Connection, path: Path, args: argparse.Namespace,
                 stats: Counter[str]) -> None:
    """Load one export zip with the CLI's filters and log how many lots it held."""
    before = stats["lots"]
    load_zip(conn, path, cpv_prefix=args.cpv or None,
             competition_only=not args.all_notice_types, stats=stats)
    print(f"  {path.name}: {stats['lots'] - before} lots", file=sys.stderr)


def record_batch_state(conn: psycopg.Connection, stats: Counter[str]) -> None:
    """Persist the batch's headline numbers so /health and the demo can show them."""
    db.set_state(conn, STATE_LAST_LOAD_AT, datetime.now(timezone.utc).isoformat(timespec="seconds"))
    db.set_state(conn, STATE_DROPPED_AWARDED, str(stats["skipped_awarded_by_title"]))
    conn.commit()


def print_stats(stats: Counter[str]) -> None:
    print("\nstats:", file=sys.stderr)
    for key in sorted(stats):
        if not key.startswith(COVERAGE_PREFIX):
            print(f"  {key:34} {stats[key]:6}", file=sys.stderr)


def report(stats: Counter[str], conn: psycopg.Connection) -> None:
    print_stats(stats)
    print("\nfact-sheet coverage (xpath only):", file=sys.stderr)
    total = stats["lots"] or 1
    for attr in ATTRIBUTES:
        n = stats.get(f"{COVERAGE_PREFIX}{attr}", 0)
        note = "" if n else "   <- needs enrich"
        print(f"  {attr:26} {n:6} {100 * n / total:5.1f}%{note}", file=sys.stderr)
    print("\nstore:", db.counts(conn), file=sys.stderr)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m tender_extract.load",
        description="Load cached eForms bulk exports into Supabase Postgres.",
    )
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--zip", type=Path, help="one *-eforms.zip bulk export")
    source.add_argument("--cache", type=Path, default=Path("data/cache"),
                        help="directory of *-eforms.zip bulk exports (default: data/cache)")
    add_load_args(parser)
    args = parser.parse_args(argv)

    zips = [args.zip] if args.zip else sorted(args.cache.glob("*-eforms.zip"))
    if not zips:
        print(f"no bulk exports found in {args.cache}", file=sys.stderr)
        return 1

    stats: Counter[str] = Counter()
    with db.connect(args.dsn) as conn:
        for path in zips:
            load_archive(conn, path, args, stats)
        record_batch_state(conn, stats)
        report(stats, conn)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
