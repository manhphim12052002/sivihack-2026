"""cosinex Vergabemarktplatz (VMPSatellite): anonymous package ZIP from the documents page.

`/VMPSatellite/notice/<id>/documents` 302s to
`/VMPSatellite/public/company/project/<id>/de/documents`, a server-rendered Wicket page that
lists every file by category and links `./documents/archive/Vergabeunterlagen_<id>.zip`. The
registration wall on these portals guards participation and messaging, not this download
(verified 18.09 on vergabe-westfalen.de: 13.5 MB ZIP, no cookie). Only the `/documents` URL
shape is handled here; other VMPSatellite links keep their GATED classification.
"""

from __future__ import annotations

import html
import re
import urllib.parse
from typing import Callable

from . import Files, attachment_filename, http_get

DOCUMENTS_PAGE = re.compile(r"/VMPSatellite/notice/([A-Z0-9]+)/documents", re.I)
ARCHIVE_LINK = re.compile(r"""href=["']([^"']*documents/archive/[^"']+\.zip[^"']*)["']""", re.I)
MAX_PACKAGE_BYTES = 400 * 1024 * 1024


def is_documents_page(url: str) -> bool:
    return DOCUMENTS_PAGE.search(url) is not None


def archive_url(notice_url: str, page_url: str, page: str) -> str:
    """The package link on the documents page, or the conventional path when the page lacks it."""
    m = ARCHIVE_LINK.search(page)
    if m:
        return urllib.parse.urljoin(page_url, html.unescape(m.group(1)))
    notice = DOCUMENTS_PAGE.search(notice_url)
    if not notice:
        raise RuntimeError("cosinex: no notice id in url")
    parsed = urllib.parse.urlparse(notice_url)
    nid = notice.group(1)
    return (f"{parsed.scheme}://{parsed.netloc}/VMPSatellite/public/company/project/{nid}"
            f"/de/documents/archive/Vergabeunterlagen_{nid}.zip")


def fetch(url: str, wanted: Callable[[str], bool] | None = None) -> Files:
    page, final_url, _ = http_get(url)
    zip_link = archive_url(url, final_url, page.decode("utf-8", "replace"))
    package, _, headers = http_get(zip_link, headers={"Referer": final_url}, max_bytes=MAX_PACKAGE_BYTES)
    if not package.startswith(b"PK"):
        raise RuntimeError(f"cosinex: archive link did not return a ZIP ({headers.get('Content-Type')})")
    return [(attachment_filename(headers, zip_link.rsplit("/", 1)[-1]), package)]
