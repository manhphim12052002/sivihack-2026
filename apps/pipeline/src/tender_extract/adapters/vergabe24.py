"""vergabe24.de Direkt-Kiosk: anonymous package ZIP behind a three-step request flow.

`/vergabeunterlagen/<id>` 301s to `europa.vergabe24.de/?tt=<id>` and on to
`index.php?site=tenderDetails&token=<t>` (server-rendered, session cookie). The detail page
links `index.php?site=order&token=<t>`, whose form lists the package variants as radio
buttons `part`. Posting the chosen part to `site=order&step=1` answers a page headed
"Download ohne Registrierung" that links `download.php?token=<t>`, which streams the ZIP.
No contact data is asked for on that path; the optional registration form is never
submitted (ADR 0004). An expired procedure says "Das Verfahren ist bereits abgelaufen" and
has no order form, which becomes an UNREACHABLE record with that reason.
"""

from __future__ import annotations

import re
import urllib.parse
from typing import Callable

from . import Files, attachment_filename, http_get, opener_with_cookies

ORDER_TOKEN = re.compile(r"site=order&(?:amp;)?token=([a-z0-9]+)", re.I)
PART = re.compile(r'name="part"\s+value="(\d+)"')
DOWNLOAD = re.compile(r'href="(download\.php\?token=[a-z0-9]+)"', re.I)
EXPIRED = "Das Verfahren ist bereits abgelaufen"
MAX_PACKAGE_BYTES = 400 * 1024 * 1024


def fetch(url: str, wanted: Callable[[str], bool] | None = None) -> Files:
    opener = opener_with_cookies()
    detail, detail_url, _ = http_get(url, opener)
    page = detail.decode("utf-8", "replace")
    m = ORDER_TOKEN.search(page)
    if not m:
        raise RuntimeError("vergabe24: procedure expired, no order form" if EXPIRED in page
                           else "vergabe24: no order link on detail page")
    parsed = urllib.parse.urlparse(detail_url)
    base = f"{parsed.scheme}://{parsed.netloc}/"
    order_url = f"{base}index.php?site=order&token={m.group(1)}"
    order, _, _ = http_get(order_url, opener, headers={"Referer": detail_url})
    parts = PART.findall(order.decode("utf-8", "replace"))
    if not parts:
        raise RuntimeError("vergabe24: order page lists no package variant")
    out: Files = []
    for part in parts:                               # one ZIP per package variant (typically a Los each)
        step1, step1_url, _ = http_get(f"{order_url}&step=1", opener,
                                       headers={"Referer": order_url, "Content-Type": "application/x-www-form-urlencoded"},
                                       data=urllib.parse.urlencode({"part": part}).encode())
        link = DOWNLOAD.search(step1.decode("utf-8", "replace"))
        if not link:
            raise RuntimeError("vergabe24: no anonymous download link after package selection")
        package, _, headers = http_get(base + link.group(1), opener, headers={"Referer": step1_url},
                                       max_bytes=MAX_PACKAGE_BYTES)
        if not package.startswith(b"PK"):
            raise RuntimeError(f"vergabe24: download.php did not return a ZIP ({headers.get('Content-Type')})")
        out.append((attachment_filename(headers, f"Vergabeunterlagen_{part}.zip"), package))
    return out
