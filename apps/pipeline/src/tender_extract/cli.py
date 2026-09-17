"""CLI: download a date range and write one JSON record per construction lot.

    python -m tender_extract --days 7 --out data/tenders.jsonl
    python -m tender_extract --start 2026-09-10 --end 2026-09-16
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import sys
import zipfile
from pathlib import Path
from xml.etree.ElementTree import ParseError

from .eforms import parse_notice
from .fetch import fetch_day, iter_days

# A call for tenders is something you can still bid on; an award notice (can-*)
# records a finished procedure. Screening only makes sense on the former.
COMPETITION_TYPES = {"cn-standard", "cn-social", "cn-desg", "pin-rtl", "pin-buyer"}


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="tender_extract",
        description="Extract German public construction tenders (CPV 45*) "
        "from the oeffentlichevergabe.de bulk export.",
    )
    p.add_argument("--days", type=int, default=7,
                   help="number of days back from --end (default: 7)")
    p.add_argument("--start", type=dt.date.fromisoformat,
                   help="first publication day (YYYY-MM-DD); overrides --days")
    # The export for a given day only exists once that day is over.
    p.add_argument("--end", type=dt.date.fromisoformat,
                   default=dt.date.today() - dt.timedelta(days=1),
                   help="last publication day (default: yesterday)")
    p.add_argument("--cpv", default="45",
                   help="CPV prefix to keep, '' for all (default: 45 = construction)")
    p.add_argument("--out", type=Path, default=Path("data/tenders.jsonl"),
                   help="output JSONL path (default: data/tenders.jsonl)")
    p.add_argument("--cache", type=Path, default=Path("data/cache"),
                   help="directory for downloaded export ZIPs")
    p.add_argument("--refresh", action="store_true",
                   help="re-download days already in the cache")
    p.add_argument("--only-open", action="store_true",
                   help="keep only lots still open for bidding (deadline >= today)")
    p.add_argument("--kind", choices=("competition", "all"), default="competition",
                   help="'competition' keeps calls for tenders only, dropping "
                        "award notices (default); 'all' keeps every notice type")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    start = args.start or args.end - dt.timedelta(days=args.days - 1)
    if start > args.end:
        print(f"error: start {start} is after end {args.end}", file=sys.stderr)
        return 2

    cpv_prefix = args.cpv or None
    today = dt.date.today().isoformat()
    args.out.parent.mkdir(parents=True, exist_ok=True)

    stats: collections.Counter[str] = collections.Counter()
    seen: set[tuple[str, str]] = set()
    records = []

    for day in iter_days(start, args.end):
        archive = fetch_day(day, args.cache, refresh=args.refresh)
        if archive is None:
            print(f"{day}  no export published", file=sys.stderr)
            stats["days_missing"] += 1
            continue

        stats["days_fetched"] += 1
        day_lots = 0
        with zipfile.ZipFile(archive) as zf:
            names = [n for n in zf.namelist() if n.endswith(".xml")]
            stats["notices_total"] += len(names)
            for name in names:
                try:
                    lots = parse_notice(zf.read(name), cpv_prefix=cpv_prefix)
                except ParseError:
                    stats["notices_unparseable"] += 1
                    continue
                for lot in lots:
                    if args.kind == "competition":
                        if lot.notice_type not in COMPETITION_TYPES:
                            stats["dropped_not_competition"] += 1
                            continue
                        if lot.title_marks_awarded:
                            stats["dropped_awarded_by_title"] += 1
                            continue
                    # A corrected notice is republished under a new version;
                    # keep the newest version of each notice/lot pair.
                    key = (lot.notice_id, lot.lot_id)
                    if key in seen:
                        stats["duplicate_lots"] += 1
                        continue
                    if args.only_open and (
                        not lot.submission_deadline or lot.submission_deadline < today
                    ):
                        stats["dropped_closed"] += 1
                        continue
                    seen.add(key)
                    records.append(lot)
                    day_lots += 1

        print(f"{day}  {len(names):5d} notices -> {day_lots:4d} construction lots",
              file=sys.stderr)

    records.sort(key=lambda r: (r.submission_deadline or "9999-12-31", r.notice_id))

    with args.out.open("w", encoding="utf-8") as fh:
        for rec in records:
            fh.write(json.dumps(rec.as_dict(), ensure_ascii=False) + "\n")

    stats["lots_written"] = len(records)
    _report(records, stats, args.out)
    return 0


def _report(records, stats, out: Path) -> None:
    print(f"\nwrote {len(records)} lots -> {out}", file=sys.stderr)
    for key in ("days_fetched", "days_missing", "notices_total",
                "notices_unparseable", "dropped_not_competition",
                "dropped_awarded_by_title",
                "duplicate_lots", "dropped_closed"):
        if stats[key]:
            print(f"  {key:22s} {stats[key]}", file=sys.stderr)

    if not records:
        return

    def coverage(name, predicate):
        n = sum(1 for r in records if predicate(r))
        print(f"  {name:22s} {n:5d}/{len(records)}  {n / len(records):5.1%}",
              file=sys.stderr)

    print("\nfield coverage:", file=sys.stderr)
    coverage("submission_deadline", lambda r: r.submission_deadline)
    coverage("place_nuts", lambda r: r.place_nuts)
    coverage("estimated_value", lambda r: r.estimated_value is not None)
    coverage("construction_period", lambda r: r.construction_start or r.construction_end)
    coverage("documents", lambda r: r.has_documents)
    coverage("qualification_text", lambda r: r.qualification_text)

    regions = collections.Counter(r.place_nuts[:3] for r in records if r.place_nuts)
    print(f"\ntop regions: {regions.most_common(8)}", file=sys.stderr)
    signals = collections.Counter(s for r in records for s in r.prose_signals)
    print(f"prose signals: {signals.most_common()}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
