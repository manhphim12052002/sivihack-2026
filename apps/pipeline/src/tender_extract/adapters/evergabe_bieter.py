"""Healy Hudson eVergabe ("evergabe.bieter"): anonymous all-files ZIP behind an Angular shell.

The notice links `/evergabe.bieter/api/supplier/external/deeplink/subproject/<uuid>`, which
302s into an Angular SPA that curl cannot render. The SPA's own project service
(`getAllProjectFilesZipDownloadUrl`, webpack chunk 611) downloads the whole package from
`/evergabe.bieter/api/supplier/subproject/<uuid>/projectFilesZip` with no session, and that
endpoint answers anonymously on every tenant host seen so far (DB InfraGO
`bieterportal.noncd.db.de`, Hamburg `fbhh-evergabe.web.hamburg.de`). Packages run to
40+ MB, above the default adapter limit. A closed procedure redirects the deeplink to
`ErrorMessage.aspx?ErrorMessageKey=SubProject.NotAvailable`; the ZIP endpoint then errors
and the caller records UNREACHABLE.
"""

from __future__ import annotations

import re
import urllib.parse
from typing import Callable

from . import Files, attachment_filename, http_get

SUBPROJECT = re.compile(r"/evergabe\.bieter/.*?/subproject/([0-9a-f-]{36})", re.I)
MAX_PACKAGE_BYTES = 400 * 1024 * 1024


def is_evergabe_bieter(url: str) -> bool:
    return SUBPROJECT.search(url) is not None


def zip_url(url: str) -> str:
    m = SUBPROJECT.search(url)
    if not m:
        raise RuntimeError("evergabe.bieter: no subproject id in url")
    parsed = urllib.parse.urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}/evergabe.bieter/api/supplier/subproject/{m.group(1)}/projectFilesZip"


def fetch(url: str, wanted: Callable[[str], bool] | None = None) -> Files:
    package, _, headers = http_get(zip_url(url), max_bytes=MAX_PACKAGE_BYTES)
    if not package.startswith(b"PK"):
        raise RuntimeError(f"evergabe.bieter: projectFilesZip is not a ZIP ({headers.get('Content-Type')})")
    return [(attachment_filename(headers, "Vergabeunterlagen.zip"), package)]
