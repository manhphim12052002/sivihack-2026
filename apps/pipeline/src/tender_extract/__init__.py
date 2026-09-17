"""Extraction of German public construction tenders from oeffentlichevergabe.de.

The federal notice service publishes no search API — only keyless bulk exports
per day or month. We download the eForms-DE variant because it is the native
format and the only one carrying the submission deadline and the qualification
criteria prose; the OCDS and CSV variants are lossy derivations of it.
"""

from .fetch import available_formats, fetch_day
from .eforms import parse_notice, LotRecord

__all__ = ["available_formats", "fetch_day", "parse_notice", "LotRecord"]
