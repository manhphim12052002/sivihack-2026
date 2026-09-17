"""plattform.aumass.de: server-rendered publication page, anonymous all-files ZIP.

The page states "Sie können die Vergabeunterlagen ohne Anmeldung oder Registrierung
herunterladen". The whole package is one GET on
`/Document/GetDocument?doctype=allfiles&aumassid=<id>`; the id is the publication's
internal id, found in the page (TenderPreview link / download script).
"""

from __future__ import annotations

import re
import urllib.parse

from typing import Callable

from . import Files, http_get

ID_PATTERNS = (
    re.compile(r"aumassid=([A-Za-z0-9-]+)"),
    re.compile(r"TenderPreview(?:QrCode)?(?:%3F|\?)id(?:%3D|=)([A-Za-z0-9-]+)", re.I),
)


def publication_id(page: str) -> str | None:
    for pattern in ID_PATTERNS:
        m = pattern.search(page)
        if m:
            return m.group(1)
    return None


def fetch(url: str, wanted: Callable[[str], bool] | None = None) -> Files:
    page, final_url, _ = http_get(url)
    aumass_id = publication_id(page.decode("utf-8", "replace"))
    if not aumass_id:
        raise RuntimeError("aumass: no publication id on page")
    base = f"{urllib.parse.urlparse(final_url).scheme}://{urllib.parse.urlparse(final_url).netloc}"
    package, _, headers = http_get(f"{base}/Document/GetDocument?doctype=allfiles&aumassid={aumass_id}",
                                   headers={"Referer": final_url})
    if not package.startswith(b"PK"):
        raise RuntimeError(f"aumass: all-files download is not a ZIP ({headers.get('Content-Type')})")
    return [("Vergabeunterlagen.zip", package)]
