"""Backfill stage: bulk day exports for history, and the fallback if the search index changes.

Thin wrapper: `fetch_day` for each day in the range, then the same `load_zip`
the batch load uses. There is no second code path.

    python -m tender_extract.backfill --start 2026-09-03 --end 2026-09-16
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys
from collections import Counter
from pathlib import Path

from . import db
from .fetch import fetch_day, iter_days
from .load import load_zip, record_batch_state, report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m tender_extract.backfill",
        description="Download bulk day exports for a date range and load them into Postgres.",
    )
    parser.add_argument("--start", type=dt.date.fromisoformat, required=True,
                        help="first publication day (YYYY-MM-DD)")
    # The export for a given day only exists once that day is over.
    parser.add_argument("--end", type=dt.date.fromisoformat,
                        default=dt.date.today() - dt.timedelta(days=1),
                        help="last publication day (default: yesterday)")
    parser.add_argument("--cache", type=Path, default=Path("data/cache"),
                        help="directory for downloaded export ZIPs")
    parser.add_argument("--refresh", action="store_true", help="re-download cached days")
    parser.add_argument("--cpv", default="45", help="CPV prefix to keep; empty string keeps everything")
    parser.add_argument("--all-notice-types", action="store_true",
                        help="keep awards and results, not just open competitions")
    parser.add_argument("--dsn", help="Postgres DSN (default: $DATABASE_URL)")
    args = parser.parse_args(argv)

    if args.start > args.end:
        print(f"error: start {args.start} is after end {args.end}", file=sys.stderr)
        return 2

    stats: Counter[str] = Counter()
    with db.connect(args.dsn) as conn:
        for day in iter_days(args.start, args.end):
            archive = fetch_day(day, args.cache, refresh=args.refresh)
            if archive is None:
                print(f"{day}  no export published", file=sys.stderr)
                stats["days_missing"] += 1
                continue
            stats["days_loaded"] += 1
            before = stats["lots"]
            load_zip(conn, archive, cpv_prefix=args.cpv or None,
                     competition_only=not args.all_notice_types, stats=stats)
            print(f"{day}  {archive.name}: +{stats['lots'] - before} lots", file=sys.stderr)
        record_batch_state(conn, stats)
        report(stats, conn)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
