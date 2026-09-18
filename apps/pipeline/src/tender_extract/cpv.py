"""CPV code -> description, resolved from the official eForms SDK codelist.

CPV (Common Procurement Vocabulary) codes are a fixed, EU-published vocabulary;
`eforms.py` normalises the notice's code to 8 digits but never carries a description
-- the source publisher's eForms rendering states only the code (e.g. "45311200"),
never the label ("Electrical fitting work"). That label is useful for feasibility
screening because CPV additionalClassifications often name the actual trades a lot
needs (see the OCDS excerpt that started this: one lot's electrical CPV block reads
"Electrical fitting work" / "Installation of cable laying" / "Emergency lighting
equipment" -- exactly the kind of trade-scope signal a bare code hides).

The vocabulary lives in the eForms SDK itself, the same distribution this project's
eForms-DE spec is tailored from (docs/specifications/eforms-de/README.md links it:
https://github.com/OP-TED/eForms-SDK/tree/main/codelists), as `codelists/cpv.gc` --
an OASIS Genericode 1.0 XML file, one row per CPV code with a `code` column and one
or more `label-*` language columns. Pinned to the SDK version this eForms-DE
distribution tailors (1.15.1, from eforms-de-codelist's pom.xml), so the vocabulary
never drifts against notices without a matching schema_profile bump.

NOT VERIFIED against the real file this session: this environment's network could
not sustain the ~32MB download (raw.githubusercontent.com timed out on every retry;
see the session's git history around this file's commit for the numbers). The
parser below is written from the OASIS Genericode 1.0 schema all eForms SDK
codelists use elsewhere in this repo's spec bundle, walking columns by name instead
of assuming a fixed position, which should tolerate the exact `label-*` column name
being other than guessed -- but it has not run against a real CPV file. Before
relying on this in a demo:

    python -m tender_extract.cpv --fetch     # downloads codelists/cpv.gc (~32MB)
    python -m tender_extract.cpv --check      # prints the row count and 5 samples

Both commands print what they find; if the column-name guess is wrong, `--check`
will show zero rows or garbage labels rather than crash, and the fix is a one-line
change to LABEL_COLUMN_PREFERENCE below once the real column names are known.
"""

from __future__ import annotations

import argparse
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

SDK_VERSION = "1.15.1"  # pinned to eforms-de-codelist's <eforms-sdk.version> (pom.xml)
SOURCE_URL = f"https://raw.githubusercontent.com/OP-TED/eForms-SDK/{SDK_VERSION}/codelists/cpv.gc"
DEFAULT_PATH = Path("data/reference/cpv.gc")

# OASIS Genericode 1.0 namespace every eForms SDK codelist uses.
GC_NS = "http://docs.oasis-open.org/codelist/ns/genericode/1.0/"
NS = {"gc": GC_NS}

# Preferred description column, most specific first; the first one present wins.
# CPV is EU-wide, so the file may carry one label per official language.
LABEL_COLUMN_PREFERENCE = ("label-eng", "label-en", "label", "name-eng", "name")

_cache: dict[str, str] | None = None


def _column_id_by_shortname(root: ET.Element, shortname: str) -> str | None:
    """The Column @Id whose ShortName matches `shortname` (case-insensitive)."""
    for column in root.findall(".//gc:ColumnSet/gc:Column", NS):
        short = column.findtext("gc:ShortName", namespaces=NS)
        if short and short.strip().lower() == shortname.lower():
            return column.get("Id")
    return None


def _pick_label_column(root: ET.Element) -> str | None:
    for name in LABEL_COLUMN_PREFERENCE:
        column_id = _column_id_by_shortname(root, name)
        if column_id:
            return column_id
    # Fall back to any column whose short name starts with "label", so an
    # unexpected language suffix (e.g. "label-deu") still resolves to something.
    for column in root.findall(".//gc:ColumnSet/gc:Column", NS):
        short = column.findtext("gc:ShortName", namespaces=NS) or ""
        if short.strip().lower().startswith("label"):
            return column.get("Id")
    return None


def parse_genericode(xml_bytes: bytes) -> dict[str, str]:
    """CPV code -> description from a Genericode 1.0 codelist's bytes.

    Pure and offline: takes bytes, not a path, so it is testable without touching
    the filesystem or the network once a sample file exists.
    """
    root = ET.fromstring(xml_bytes)
    code_col = _column_id_by_shortname(root, "code")
    label_col = _pick_label_column(root)
    if not code_col or not label_col:
        return {}

    out: dict[str, str] = {}
    for row in root.findall(".//gc:SimpleCodeList/gc:Row", NS):
        code = label = None
        for value in row.findall("gc:Value", NS):
            simple = value.findtext("gc:SimpleValue", namespaces=NS)
            if value.get("ColumnRef") == code_col:
                code = simple
            elif value.get("ColumnRef") == label_col:
                label = simple
        if code and label:
            out[code.strip()] = label.strip()
    return out


def load_descriptions(path: Path = DEFAULT_PATH) -> dict[str, str]:
    """CPV code -> description, cached in memory. {} if the codelist was never fetched.

    Never raises: a description is an optional enrichment (unlike a Fact read from a
    notice, it carries no evidence of its own), so a missing or unparsable codelist
    must not stop the pipeline from loading lots.
    """
    global _cache
    if _cache is not None:
        return _cache
    if not path.exists():
        _cache = {}
        return _cache
    try:
        _cache = parse_genericode(path.read_bytes())
    except ET.ParseError:
        _cache = {}
    return _cache


def describe(code: str | None, path: Path = DEFAULT_PATH) -> str | None:
    """English description for an 8-digit CPV code, or None if unknown or unavailable."""
    if not code:
        return None
    return load_descriptions(path).get(code)


def fetch_codelist(dest: Path = DEFAULT_PATH, version: str = SDK_VERSION, timeout: int = 300) -> Path:
    """Download the pinned eForms SDK CPV codelist. ~32MB; run once, not per lot."""
    url = f"https://raw.githubusercontent.com/OP-TED/eForms-SDK/{version}/codelists/cpv.gc"
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "sivihack-2026-tender-extract/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp, dest.open("wb") as f:
        while chunk := resp.read(1 << 20):
            f.write(chunk)
    return dest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m tender_extract.cpv",
        description="Fetch and inspect the eForms SDK CPV codelist.",
    )
    parser.add_argument("--fetch", action="store_true", help=f"download {SOURCE_URL}")
    parser.add_argument("--check", action="store_true", help="parse the codelist and print a sample")
    parser.add_argument("--path", type=Path, default=DEFAULT_PATH)
    args = parser.parse_args(argv)

    if args.fetch:
        print(f"downloading {SOURCE_URL} -> {args.path}", file=sys.stderr)
        fetch_codelist(args.path)
    if args.check or not args.fetch:
        table = load_descriptions(args.path)
        print(f"{len(table)} CPV codes loaded from {args.path}", file=sys.stderr)
        for code, label in list(table.items())[:5]:
            print(f"  {code}  {label}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
