"""Download and cache the daily bulk notice exports.

API: GET https://oeffentlichevergabe.de/api/notice-exports
     ?pubDay=YYYY-MM-DD | pubMonth=YYYY-MM  (mutually exclusive)
     &format=eforms.zip | ocds.zip | csv.zip
No authentication, no API key. Data is CC0 (Beschaffungsamt des BMI).
"""

from __future__ import annotations

import datetime as dt
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

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


def fetch_notice(notice_id: str, timeout: int = 60) -> bytes:
    """Return the eForms XML for a single notice.

    Useful for ingesting one tender by id — a judge naming an unseen notice, or
    refreshing a corrected one — without pulling a whole day's export.
    """
    req = urllib.request.Request(
        f"{NOTICE_API}/{notice_id}", headers={"User-Agent": USER_AGENT}
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def notice_url(notice_id: str) -> str:
    """Human-openable permalink for a notice, for 'show me the source' links."""
    return f"{NOTICE_UI}/{notice_id}"
