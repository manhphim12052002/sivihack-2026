"""staatsanzeiger-eservices.de (Bayern): two URL shapes.

`/aJs/EFormsBekVuUrl?z_param=<id>` is a "Download von Vergabeunterlagen" page with a
POST form "Anonym als Zip" (`DownlAsAnonym`, field `z_param`). With the session cookie
from the landing page, the POST answers a page that links the package ZIP directly.
`/besuJs/BekLanding4Bund` serves only the Bekanntmachung PDF, which we already hold
structured, so it is classified notice-only and never fetched.
"""

from __future__ import annotations

import re
import urllib.parse

from typing import Callable

from . import Files, http_get, opener_with_cookies

ZIP_LINK = re.compile(r'href="(https?://[^"]+\.zip)"', re.I)


def is_notice_only(url: str) -> bool:
    return "BekLanding4Bund" in url or "EFormsBekVuUrl" not in url


def fetch(url: str, wanted: Callable[[str], bool] | None = None) -> Files:
    parsed = urllib.parse.urlparse(url)
    z_param = urllib.parse.parse_qs(parsed.query).get("z_param", [None])[0]
    if not z_param:
        raise RuntimeError("staatsanzeiger: no z_param in url")
    opener = opener_with_cookies()
    _, landing, _ = http_get(url, opener)
    form_url = f"{parsed.scheme}://{parsed.netloc}/aJs/DownlAsAnonym"
    page, _, _ = http_get(form_url, opener, data=urllib.parse.urlencode({"z_param": z_param}).encode(),
                          headers={"Referer": landing, "Content-Type": "application/x-www-form-urlencoded"})
    m = ZIP_LINK.search(page.decode("utf-8", "replace"))
    if not m:
        raise RuntimeError("staatsanzeiger: anonymous download page has no zip link")
    package, _, headers = http_get(m.group(1), opener, headers={"Referer": form_url})
    if not package.startswith(b"PK"):
        raise RuntimeError(f"staatsanzeiger: link did not return a ZIP ({headers.get('Content-Type')})")
    return [(m.group(1).rsplit("/", 1)[-1], package)]
