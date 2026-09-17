"""Filename router and PDF page reader.

The eligibility text of a tender package lives in a handful of small conditions
documents (Teilnahmebedingungen, Vertragsbedingungen, Eignung, Aufforderung ...),
while the bulk of the package is drawings, bills of quantities and forms with no
normative prose. The router decides by filename which files are read; `pdftotext`
(poppler, subprocess) turns a routed PDF into one text chunk per page so every
quote can be located. No OCR: a PDF without a text layer is reported as scanned.
"""

from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

READ = re.compile(r"teilnahme|vertragsbedingungen|bewerbungsbedingungen|eignung|aufforderung|"
                  r"leistungsbeschreibung|beiblatt|merkblatt", re.I)
SKIP = re.compile(r"anlage|plan|_ep\b|_gr\b|_wp\b|\blv[-_ ]|bekanntmachung|__macosx", re.I)
READABLE_SUFFIXES = (".pdf",)   # DOCX/XLSX are P2 (pipeline doc Flow 5)

# Below this many characters over the whole file the text layer is missing (scanned).
SCANNED_THRESHOLD = 40


def route(filename: str) -> str:
    """'READ' for conditions documents, 'SKIP' for drawings/quantities/notices, 'OTHER' otherwise.

    Skip patterns win over read patterns so "Anlage 3 Vertragsbedingungen" is not read
    twice through an attachment ZIP, and only PDFs are readable in v1.
    """
    name = filename.rsplit("/", 1)[-1]
    if SKIP.search(filename):
        return "SKIP"
    if not name.lower().endswith(READABLE_SUFFIXES):
        return "SKIP"
    return "READ" if READ.search(name) else "OTHER"


def lot_hint(filename: str) -> str | None:
    """'Los_2' / 'Los 2' in a filename names the lot the file applies to."""
    m = re.search(r"\blos[ _-]?(\d{1,2})\b", filename, re.I)
    return f"LOT-{int(m.group(1)):04d}" if m else None


def pdftotext_available() -> bool:
    return shutil.which("pdftotext") is not None


def pdf_pages(path: Path, timeout: int = 120) -> list[str]:
    """Page texts of a PDF via `pdftotext -layout`; pages split on the form feed it emits."""
    result = subprocess.run(
        ["pdftotext", "-layout", "-enc", "UTF-8", str(path), "-"],
        capture_output=True, timeout=timeout, check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"pdftotext failed on {path.name}: {result.stderr.decode('utf-8', 'replace')[:200]}")
    text = result.stdout.decode("utf-8", "replace")
    pages = text.split("\f")
    if pages and not pages[-1].strip():
        pages.pop()
    return pages


def is_scanned(pages: list[str]) -> bool:
    return sum(len(p.strip()) for p in pages) < SCANNED_THRESHOLD
