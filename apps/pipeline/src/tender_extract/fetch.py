"""Download and cache the daily bulk notice exports.

API: GET https://oeffentlichevergabe.de/api/notice-exports
     ?pubDay=YYYY-MM-DD | pubMonth=YYYY-MM  (mutually exclusive)
     &format=eforms.zip | ocds.zip | csv.zip
No authentication, no API key. Data is CC0 (Beschaffungsamt des BMI).
"""

from __future__ import annotations

import datetime as dt
import json
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from typing import Any

API = "https://oeffentlichevergabe.de/api/notice-exports"
FORMATS = ("eforms.zip", "ocds.zip", "csv.zip")
USER_AGENT = "sivihack-2026-tender-extract/1.0 (hackathon prototype)"


def available_formats() -> tuple[str, ...]:
    return FORMATS


def _download(url: str, dest: Path, timeout: int) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        dest.write_bytes(resp.read())


def fetch_day(
    day: dt.date,
    cache_dir: Path,
    fmt: str = "eforms.zip",
    timeout: int = 180,
    refresh: bool = False,
) -> Path | None:
    """Return the path to the cached export ZIP for `day`, downloading if needed.

    Returns None when the service has no export for that day (weekends and
    holidays are published as empty or missing rather than as an error).
    """
    if fmt not in FORMATS:
        raise ValueError(f"unknown format {fmt!r}, expected one of {FORMATS}")

    cache_dir.mkdir(parents=True, exist_ok=True)
    dest = cache_dir / f"{day.isoformat()}-{fmt}"

    if dest.exists() and not refresh:
        return dest

    url = f"{API}?pubDay={day.isoformat()}&format={fmt}"
    try:
        _download(url, dest, timeout)
    except urllib.error.HTTPError as exc:
        if exc.code in (404, 204):
            return None
        # The service rejects today and future dates with 400 ("must lie in the
        # past") rather than an empty export. That is a normal edge of the
        # range, not a failure worth aborting a multi-day run for.
        if exc.code == 400 and b"range" in (exc.read() or b""):
            return None
        raise

    # A ZIP that will not open means a truncated or error-page response; drop it
    # so a rerun retries instead of parsing garbage.
    if not zipfile.is_zipfile(dest):
        dest.unlink(missing_ok=True)
        return None

    return dest


def iter_days(start: dt.date, end: dt.date):
    day = start
    while day <= end:
        yield day
        day += dt.timedelta(days=1)


NOTICE_API = "https://oeffentlichevergabe.de/api/notices"
NOTICE_UI = "https://oeffentlichevergabe.de/ui/de/notice"


def fetch_notice(notice_id: str, version: str | None = None, timeout: int = 60) -> bytes:
    """Return the eForms XML for a single notice.

    Useful for ingesting one tender by id — a judge naming an unseen notice, or
    refreshing a corrected one — without pulling a whole day's export. The id is
    the bare notice id (no "-01" suffix); without `version` the service returns
    the newest version.
    """
    url = f"{NOTICE_API}/{notice_id}?format=eforms"
    if version:
        url += f"&noticeVersion={version}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


# The lot-grained search index behind the site's own UI (ADR 0002). Keyless and
# near-real-time, unlike the T+1 bulk export; undocumented, so `backfill` over the
# bulk export stays the fallback if it changes shape.
SEARCH_API = "https://oeffentlichevergabe.de/bkmk/searches"
SEARCH_MAX_RESULTS = 10_000   # hard ceiling per query; deeper history is windowed by date


def search_lots(
    published_since: str,
    page: int = 0,
    size: int = 100,
    cpv_prefix: str | None = "45",
    timeout: int = 60,
) -> dict[str, Any]:
    """One page of lot stubs published at or after `published_since` (ISO timestamp).

    Returns the service envelope: {"totalElements", "offset", "elements"}; each
    element is a 13-field stub (noticeIdentifier, noticeVersion, lotIdentifier,
    noticeType, mainCpvCode, publicationDate, …) with no deadline, value or
    eligibility, so the full notice is fetched separately per delta.
    """
    where: list[dict[str, Any]] = []
    if cpv_prefix:
        where.append({"fields": ["allCpvCodes"], "operator": "STARTS_WITH", "operands": [cpv_prefix]})
    # Always an ISO timestamp: a bare date is parsed differently by the service.
    where.append({"fields": ["publicationDate"], "operator": ">=", "operands": [published_since]})
    body = {
        "SELECT": "ALL",
        "FROM": "lots",
        "WHERE": where,
        "PAGE": {"number": page, "size": size},
        "ORDER": {"field": "publicationDate", "direction": "DESC"},
    }
    req = urllib.request.Request(
        SEARCH_API,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "User-Agent": USER_AGENT,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def notice_url(notice_id: str) -> str:
    """Human-openable permalink for a notice, for 'show me the source' links."""
    return f"{NOTICE_UI}/{notice_id}"
