"""meinauftrag.rib.de: RIB white-label landing page with one link per file.

The public page (server-rendered, redirects to `/public/publications/<id>`) embeds
the document table as JSON in a script block; each file is an anchor to a regional
backend such as `my.vergabe.bayern.de/remote/download.php?k=<hash>` with the filename
as anchor text. Files are downloaded one by one; the caller decides which names are
worth fetching so drawings are never pulled, and a file over the size limit is skipped.
"""

from __future__ import annotations

import html
import re
from typing import Callable

import sys

from . import Files, TooLarge, http_get

LINK = re.compile(r'<a[^>]+href=\\?"(?P<url>https?:[^"\\]+/remote/download\.php\?k=[A-Za-z0-9]+)\\?"[^>]*>'
                  r'(?P<name>[^<]{1,200}?)<\\?/a>', re.I)


def listing(page: str) -> list[tuple[str, str]]:
    """(filename, url) pairs from the landing page; JSON-escaped slashes are undone."""
    out: list[tuple[str, str]] = []
    seen: set[str] = set()
    for m in LINK.finditer(page):
        url = html.unescape(m.group("url")).replace("\\/", "/")
        name = html.unescape(m.group("name")).strip()
        if url not in seen and name:
            seen.add(url)
            out.append((name, url))
    return out


def fetch(url: str, wanted: Callable[[str], bool] | None = None) -> Files:
    page, final_url, _ = http_get(url)
    files = listing(page.decode("utf-8", "replace").replace("\\/", "/"))
    if not files:
        raise RuntimeError("rib: no download links on page")
    out: Files = []
    for name, file_url in files:
        if wanted is not None and not wanted(name):
            continue
        try:
            body, _, _ = http_get(file_url, headers={"Referer": final_url})
        except TooLarge:   # a single oversize drawing must not sink the rest of the listing
            print(f"    rib: skipped {name} (over the per-file size limit)", file=sys.stderr)
            continue
        out.append((name, body))
    return out
