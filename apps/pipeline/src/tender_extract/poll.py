"""Poll stage: watermark query against the lot search index, load the deltas.

Two phases per run (PRD "Source and acquisition", ADR 0002):

1. Page through lot stubs with `publicationDate >= watermark`, newest first.
2. Diff the stubs against `lots` on (notice_id, notice_version, lot_id); for each
   notice version not yet stored, fetch the full eForms XML and run it through
   the same `load_notice_bytes` the batch path uses.

The watermark is the newest publication timestamp seen and is advanced only
after every page of the run has been loaded: results arrive newest-first, so
advancing it earlier would skip the older pages if the run died half-way.
Re-seeing a notice is harmless (the diff makes it a no-op), skipping one is not.

Single-threaded, one polite request at a time, identifying User-Agent. A 429 or
5xx backs off and retries; it never parallelises.

    python -m tender_extract.poll                  # from the stored watermark
    python -m tender_extract.poll --since 2026-09-17T00:00:00Z
"""

from __future__ import annotations

import argparse
import sys
import time
import urllib.error
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any

import psycopg

from . import db
from .eforms import COMPETITION_TYPES
from .fetch import SEARCH_MAX_RESULTS, fetch_notice, search_lots
from .load import load_notice_bytes, print_stats

WATERMARK_KEY = "poll_watermark"     # newest publicationDate loaded so far (ISO timestamp)
LAST_POLL_KEY = "last_poll_at"       # read by /health
DEFAULT_LOOKBACK = timedelta(days=1)  # first run with no watermark
BACKOFF_SECONDS = (5, 15, 45)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _with_backoff(call, *args: Any, **kwargs: Any) -> Any:
    """Retry a request on 429/5xx with growing pauses; anything else raises at once."""
    for pause in BACKOFF_SECONDS:
        try:
            return call(*args, **kwargs)
        except urllib.error.HTTPError as exc:
            if exc.code != 429 and exc.code < 500:
                raise
            print(f"  HTTP {exc.code}, backing off {pause}s", file=sys.stderr)
            time.sleep(pause)
    return call(*args, **kwargs)


def known_lots(conn: psycopg.Connection, notice_ids: set[str]) -> set[tuple[str, str, str]]:
    """(notice_id, notice_version, lot_id) triples already stored for these notices."""
    if not notice_ids:
        return set()
    rows = conn.execute(
        "SELECT notice_id, notice_version, lot_id FROM lots WHERE notice_id = ANY(%(ids)s)",
        {"ids": sorted(notice_ids)},
    ).fetchall()
    return {(r["notice_id"], r["notice_version"], r["lot_id"]) for r in rows}


def deltas(stubs: list[dict[str, Any]], known: set[tuple[str, str, str]],
           stats: Counter[str]) -> set[tuple[str, str]]:
    """Notice versions worth fetching: at least one lot stub is unknown and the notice is open."""
    out: set[tuple[str, str]] = set()
    for stub in stubs:
        key = (stub["noticeIdentifier"], stub["noticeVersion"], stub["lotIdentifier"])
        if key in known:
            stats["stubs_known"] += 1
            continue
        # Award and result notices would be dropped by load anyway; skip the fetch.
        if stub.get("noticeType") not in COMPETITION_TYPES:
            stats["stubs_not_competition"] += 1
            continue
        out.add(key[:2])
    return out


def poll(
    conn: psycopg.Connection,
    *,
    since: str | None = None,
    page_size: int = 100,
    sleep: float = 1.0,
    cpv_prefix: str | None = "45",
    stats: Counter[str] | None = None,
) -> Counter[str]:
    """Run one poll: page the index from the watermark, load every delta, advance the watermark."""
    stats = stats if stats is not None else Counter()
    watermark = since or db.get_state(conn, WATERMARK_KEY) \
        or (datetime.now(timezone.utc) - DEFAULT_LOOKBACK).isoformat(timespec="seconds")
    print(f"poll from {watermark}", file=sys.stderr)

    newest = watermark
    fetched: set[tuple[str, str]] = set()
    page = 0
    while True:
        result = _with_backoff(search_lots, watermark, page=page, size=page_size, cpv_prefix=cpv_prefix)
        stubs = result.get("elements") or []
        total = result.get("totalElements", 0)
        stats["pages"] += 1
        stats["stubs"] += len(stubs)
        newest = max([newest] + [s["publicationDate"] for s in stubs if s.get("publicationDate")],
                     key=datetime.fromisoformat)

        todo = deltas(stubs, known_lots(conn, {s["noticeIdentifier"] for s in stubs}), stats) - fetched
        written = 0
        for notice_id, version in sorted(todo):
            xml = _with_backoff(fetch_notice, notice_id, version)
            stats["notices_fetched"] += 1
            written += len(load_notice_bytes(conn, xml, cpv_prefix=cpv_prefix, stats=stats))
            fetched.add((notice_id, version))
            time.sleep(sleep)
        conn.commit()
        print(f"  page {page}: {len(stubs)} stubs, {len(todo)} new notice versions, "
              f"{written} lots written", file=sys.stderr)

        # A short page is the last page whatever the envelope says; the total is a
        # second stop so a renamed key cannot turn one page into an endless loop.
        if len(stubs) < page_size or result.get("offset", page * page_size) + len(stubs) >= total:
            break
        if (page + 1) * page_size >= SEARCH_MAX_RESULTS:
            print(f"  WARNING: {total} results exceed the {SEARCH_MAX_RESULTS} ceiling; "
                  "the rest were not read. Window the run with --since, or use backfill.",
                  file=sys.stderr)
            stats["ceiling_hit"] += 1
            break
        page += 1
        time.sleep(sleep)

    db.set_state(conn, WATERMARK_KEY, newest)
    db.set_state(conn, LAST_POLL_KEY, _now_iso())
    conn.commit()
    stats["watermark_advanced"] += int(newest != watermark)
    return stats


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m tender_extract.poll",
        description="Poll the lot search index from the stored watermark and load new notices.",
    )
    parser.add_argument("--since", help="ISO timestamp to poll from instead of the stored watermark")
    parser.add_argument("--page-size", type=int, default=100)
    parser.add_argument("--sleep", type=float, default=1.0, help="seconds between requests")
    parser.add_argument("--cpv", default="45", help="CPV prefix to keep; empty string keeps everything")
    parser.add_argument("--dsn", help="Postgres DSN (default: $DATABASE_URL)")
    args = parser.parse_args(argv)

    with db.connect(args.dsn) as conn:
        stats = poll(conn, since=args.since, page_size=args.page_size, sleep=args.sleep,
                     cpv_prefix=args.cpv or None)
        print_stats(stats)
        print(f"\nwatermark {db.get_state(conn, WATERMARK_KEY)}  last_poll_at {db.get_state(conn, LAST_POLL_KEY)}",
              file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
