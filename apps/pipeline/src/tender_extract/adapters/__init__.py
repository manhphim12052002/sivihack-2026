"""Per-platform document adapters (ADR 0004: plain HTTP only, no browser, no registration).

Each adapter takes the notice's document URL and returns the files it could fetch
anonymously, as `(filename, bytes)` pairs. A ZIP package comes back as one pair and is
unpacked by `documents`. Adapters raise on transport errors; `documents` turns that into
an UNREACHABLE record with the platform named.

Host classes come from the two probe reports (plans/reports/researcher-260917-1854-*,
-2010-*): DIRECT hosts get an adapter, registration walls are GATED, notice-only PDFs are
SKIPPED, JavaScript shells are UNREACHABLE.
"""

from __future__ import annotations

import http.client
import http.cookiejar
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Callable

from ..fetch import USER_AGENT

Files = list[tuple[str, bytes]]
# Every adapter now takes an optional file filter, even the three that fetch one whole
# package and ignore it (rib.fetch is the only listing adapter that uses it to skip
# drawings before downloading them) — a uniform signature so documents.py can call any
# adapter the same way, no isinstance/identity check needed.
Adapter = Callable[[str, "Callable[[str], bool] | None"], Files]

MAX_BYTES = 80 * 1024 * 1024   # a package above this is not a conditions document set
TIMEOUT = 180


class TooLarge(RuntimeError):
    pass


def opener_with_cookies() -> urllib.request.OpenerDirector:
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


RETRIES = 3
CHUNK = 1 << 20   # stream in 1 MiB reads so a slow package never trips the per-read timeout


def http_get(url: str, opener: urllib.request.OpenerDirector | None = None,
             headers: dict[str, str] | None = None, data: bytes | None = None,
             max_bytes: int = MAX_BYTES) -> tuple[bytes, str, dict[str, str]]:
    """GET (or POST when `data` is given). Returns (body, final_url, headers).

    Portals drop or reset long anonymous downloads now and then; a truncated or reset
    transfer is retried a few times with a fresh connection before it counts as
    UNREACHABLE. Anything else (4xx, too large) fails at once.
    """
    last: Exception | None = None
    for attempt in range(RETRIES):
        req = urllib.request.Request(
            url, data=data, method="POST" if data is not None else "GET",
            headers={"User-Agent": USER_AGENT, "Connection": "close", **(headers or {})})
        try:
            with (opener or urllib.request.build_opener()).open(req, timeout=TIMEOUT) as resp:
                parts: list[bytes] = []
                size = 0
                while chunk := resp.read(CHUNK):
                    parts.append(chunk)
                    size += len(chunk)
                    if size > max_bytes:
                        raise TooLarge(f"{url} exceeds {max_bytes} bytes")
                return b"".join(parts), resp.url, dict(resp.headers)
        except (http.client.IncompleteRead, ConnectionResetError, TimeoutError) as exc:
            last = exc
        except urllib.error.URLError as exc:
            if isinstance(exc.reason, (ConnectionResetError, TimeoutError, OSError)) and not isinstance(exc, urllib.error.HTTPError):
                last = exc
            else:
                raise
        if attempt < RETRIES - 1:
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"gave up after {RETRIES} attempts: {type(last).__name__}: {last}")


def host_of(url: str) -> str:
    return urllib.parse.urlparse(url).netloc.lower()


from . import aumass, evergabe_online, rib, staatsanzeiger  # noqa: E402  (need helpers above)

ADAPTERS: dict[str, Adapter] = {
    "plattform.aumass.de": aumass.fetch,
    "www.aumass.de": aumass.fetch,
    "aumass.de": aumass.fetch,
    "www.meinauftrag.rib.de": rib.fetch,
    "meinauftrag.rib.de": rib.fetch,
    "www.evergabe-online.de": evergabe_online.fetch,
    "evergabe-online.de": evergabe_online.fetch,
    "www.staatsanzeiger-eservices.de": staatsanzeiger.fetch,
}

# Registration or order-form wall before any file (probe reports, both rounds).
GATED_HOSTS = frozenset({
    "www.evergabe.de", "www.dtvp.de", "vergabe.niedersachsen.de", "vergabemarktplatz.brandenburg.de",
    "www.vergabe-westfalen.de", "www.vergabe.metropoleruhr.de", "www.evergabe.nrw.de",
    "www.deutsche-evergabe.de", "portal.deutsche-evergabe.de", "bieterzugang.deutsche-evergabe.de",
    "www.vergabe24.de", "bund.vergabe24.de", "www.deutsches-ausschreibungsblatt.de",
    "www.sachsen-vergabe.de", "vergabe.autobahn.de", "vergabe.hessen.de", "www.xvergabe.de",
})
# Serve only the Bekanntmachung PDF, which we already hold structured: nothing to read.
NOTICE_ONLY_HOSTS = frozenset({"www.subreport-elvis.de", "www.had.de"})
# JavaScript shells: no content without a browser, which ADR 0004 rules out.
JS_SHELL_HOSTS = frozenset({"bieterportal.noncd.db.de", "www.subreport.de"})


def classify(url: str) -> str:
    """'ADAPTER' | 'GATED' | 'NOTICE_ONLY' | 'JS_SHELL' | 'UNKNOWN' for a document URL."""
    host = host_of(url)
    if "VMPSatellite" in url or "/Satellite/" in url:   # cosinex Vergabemarktplatz stack
        return "GATED"
    if host in ADAPTERS:
        if ADAPTERS[host] is staatsanzeiger.fetch and staatsanzeiger.is_notice_only(url):
            return "NOTICE_ONLY"
        return "ADAPTER"
    if host in GATED_HOSTS:
        return "GATED"
    if host in NOTICE_ONLY_HOSTS:
        return "NOTICE_ONLY"
    if host in JS_SHELL_HOSTS:
        return "JS_SHELL"
    return "UNKNOWN"
