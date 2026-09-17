"""evergabe-online.de (Bund): Wicket app, anonymous ZIP behind a cookie check and a Referer.

The first GET redirects through a cookie check, so a cookie jar is required. The
"all documents" ZIP is the stateful Wicket button; it answers 403 without a Referer
pointing at the documents page of the same tender.
"""

from __future__ import annotations

import urllib.parse

from . import Files, http_get, opener_with_cookies

BASE = "https://www.evergabe-online.de/tenderdocuments.html"


def fetch(url: str) -> Files:
    tender_id = urllib.parse.parse_qs(urllib.parse.urlparse(url).query).get("id", [None])[0]
    if not tender_id:
        raise RuntimeError("evergabe-online: no id in url")
    opener = opener_with_cookies()
    page, final_url, _ = http_get(f"{BASE}?id={tender_id}", opener)
    if len(page) < 10_000:                      # the cookie-check interstitial; follow once more
        page, final_url, _ = http_get(final_url, opener)
    zip_url = f"{BASE}?0--documentsTableContainer-zipDownloadButton&id={tender_id}"
    package, _, headers = http_get(zip_url, opener, headers={"Referer": final_url})
    if not package.startswith(b"PK"):
        raise RuntimeError(f"evergabe-online: zip button did not return a ZIP ({headers.get('Content-Type')})")
    return [("Ausschreibungsunterlagen.zip", package)]
