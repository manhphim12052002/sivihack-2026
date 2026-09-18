"""GAEB DA XML (X83) reader: the bill of quantities (Leistungsverzeichnis) as addressable chunks.

An X83 is the buyer's own structured export of the LV, so positions, quantities, units and the
German texts come out exactly, without a PDF text layer or a model in between. Three kinds of
text live in it and each becomes one or more Chunks so the extractor can cite them:

    #pos<NN.NN>   one per priced position: short text + long text, quantity and unit
    #ztv<n>       one per BoQ remark block, the trade's technical contract preambles (ZTV)
    #din<n>       the DIN 18299 site information (Award/AddText), split at paragraph boundaries

Chunk ids follow the pipeline convention `<source_id>#<locator>`; `section` carries the
position number or heading so the UI can say where a quote came from.
"""

from __future__ import annotations

import html
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator

NS_PREFIX = "http://www.gaeb.de/GAEB_DA_XML/"   # version-specific suffix (DA83/3.2, DA83/3.3 ...)
MAX_CHUNK_CHARS = 3000

# GAEB embeds HTML as namespaced elements, so a serialised paragraph reads "<ns0:p>".
_BLOCK_TAGS = re.compile(r"</?(?:\w+:)?(p|br|div|li|tr|h\d)\b[^>]*>", re.I)
# Windows-1252 quotes that arrive as C1 control characters in some exports.
_C1_QUOTES = {"\x84": "\u201e", "\x93": "\u201c", "\x94": "\u201d", "\x96": "\u2013", "\x91": "\u2018", "\x92": "\u2019"}
_TAGS = re.compile(r"<[^>]+>")


@dataclass
class Position:
    number: str          # "01.02": category RNoPart + item RNoPart
    short_text: str
    long_text: str
    quantity: float | None
    unit: str | None

    @property
    def text(self) -> str:
        head = f"Pos. {self.number}  {self.short_text}"
        qty = f"Menge: {self.quantity:g} {self.unit or ''}".strip() if self.quantity is not None else ""
        return "\n".join(p for p in (head, qty, self.long_text) if p)


@dataclass
class Boq:
    label: str
    positions: list[Position] = field(default_factory=list)
    remarks: list[str] = field(default_factory=list)      # ZTV blocks, HTML already stripped
    site_information: str = ""                            # DIN 18299 AddText, stripped


def html_to_text(fragment: str) -> str:
    """Strip GAEB's inline HTML to plain text, one line per block element, entities decoded."""
    text = _BLOCK_TAGS.sub("\n", fragment)
    text = _TAGS.sub(" ", text)
    text = html.unescape(text)
    for bad, good in _C1_QUOTES.items():
        text = text.replace(bad, good)
    lines = [re.sub(r"[ \t ]+", " ", line).strip() for line in text.split("\n")]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _child(elem: ET.Element, name: str) -> ET.Element | None:
    for c in elem:
        if _local(c.tag) == name:
            return c
    return None


def _find(elem: ET.Element, name: str) -> ET.Element | None:
    for c in elem.iter():
        if _local(c.tag) == name:
            return c
    return None


def _inner(elem: ET.Element | None) -> str:
    if elem is None:
        return ""
    return html_to_text(ET.tostring(elem, encoding="unicode"))


def _number(text: str | None) -> float | None:
    if not text:
        return None
    try:
        return float(text.replace(",", "."))
    except ValueError:
        return None


def _walk_items(body: ET.Element, prefix: str) -> Iterator[Position]:
    for node in body:
        name = _local(node.tag)
        if name == "BoQCtgy":
            rno = node.get("RNoPart") or ""
            inner_body = _child(node, "BoQBody")
            if inner_body is not None:
                yield from _walk_items(inner_body, f"{prefix}{rno}.")
        elif name == "Itemlist":
            for item in node:
                if _local(item.tag) != "Item":
                    continue
                desc = _child(item, "Description")
                yield Position(
                    number=f"{prefix}{item.get('RNoPart') or ''}",
                    short_text=_inner(_find(desc, "OutlineText") if desc is not None else None).strip("- ").strip(),
                    # DetailTxt is the long text alone; CompleteText also nests the OutlineText.
                    long_text=_inner(_find(desc, "DetailTxt") if desc is not None else None),
                    quantity=_number(item.findtext("{*}Qty")),
                    unit=item.findtext("{*}QU"),
                )


def parse(path: Path | str) -> Boq:
    """Read one X83 file. Any GAEB DA XML version is accepted; tags are matched by local name."""
    root = ET.parse(path).getroot()
    if not root.tag.startswith("{" + NS_PREFIX):
        raise ValueError(f"{path}: not a GAEB DA XML document ({root.tag})")
    boq_elem = _find(root, "BoQ")
    if boq_elem is None:
        raise ValueError(f"{path}: no BoQ element")
    info = _child(boq_elem, "BoQInfo")
    boq = Boq(label=(info.findtext("{*}LblBoQ") if info is not None else None) or "")
    body = _child(boq_elem, "BoQBody")
    if body is not None:
        boq.positions = list(_walk_items(body, ""))
        # Only the remark's text body; flags such as <Fixed>Yes</Fixed> are not prose.
        boq.remarks = [_inner(_find(r, "DetailTxt") or _find(r, "CompleteText") or r)
                       for r in body if _local(r.tag) == "Remark"]
        boq.remarks = [r for r in boq.remarks if r]
    add_text = _find(root, "AddText")
    if add_text is not None:
        boq.site_information = _inner(_find(add_text, "DetailAddText"))
    return boq


def split_paragraphs(text: str, max_chars: int = MAX_CHUNK_CHARS) -> list[str]:
    """Split long prose at blank lines so no chunk exceeds `max_chars` (a single huge paragraph
    is kept whole rather than cut mid-sentence)."""
    out: list[str] = []
    current = ""
    for para in re.split(r"\n\s*\n", text):
        para = para.strip()
        if not para:
            continue
        if current and len(current) + len(para) + 2 > max_chars:
            out.append(current)
            current = para
        else:
            current = f"{current}\n\n{para}" if current else para
    if current:
        out.append(current)
    return out


def _heading(text: str) -> str:
    """First two non-empty lines: GAEB preambles put the generic title and the trade name on separate lines."""
    lines = [l for l in text.split("\n") if l.strip()][:2]
    return " ".join(lines)[:120]


def chunks(boq: Boq, source_id: str) -> list[dict[str, Any]]:
    """Chunk rows for `db.insert_chunks`: id, source_id, section, text (page stays null)."""
    rows: list[dict[str, Any]] = []
    for pos in boq.positions:
        rows.append({"id": f"{source_id}#pos{pos.number}", "source_id": source_id, "page": None,
                     "section": f"Pos. {pos.number}", "text": pos.text})
    for i, remark in enumerate(boq.remarks, start=1):
        for j, part in enumerate(split_paragraphs(remark), start=1):
            rows.append({"id": f"{source_id}#ztv{i}.{j}", "source_id": source_id, "page": None,
                         "section": _heading(remark), "text": part})
    for j, part in enumerate(split_paragraphs(boq.site_information), start=1):
        rows.append({"id": f"{source_id}#din{j}", "source_id": source_id, "page": None,
                     "section": "DIN 18299 Angaben zur Baustelle", "text": part})
    return rows
