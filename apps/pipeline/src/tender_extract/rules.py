"""Extraction rules: regexes over German notice prose that yield typed Requirements.

This is the first stage of the cascade (PRD "The extraction cascade"): cheap, high
precision, low recall. A sentence that names a number next to a requirement keyword
becomes a `rule` observation with the sentence as its quote. A sentence that defers
the requirement to the Vergabeunterlagen becomes a REFERRED_TO_DOCUMENTS row, which
is what tells enrich that reading the documents is worth it. Anything the rules
cannot type is left to the model; they never guess.

Output rows carry everything an observation needs except scope and source, which the
caller knows and the rules do not.
"""

from __future__ import annotations

import re
from typing import Any

from .confidence import CONFIDENCE_BY_EXTRACTOR

# The six Requirement kinds (CONTEXT.md, pipeline doc 4.2) with their condition shapes.
PERFORMANCE_GUARANTEE = "PERFORMANCE_GUARANTEE"       # {percent_of_contract_value}
COMPARABLE_REFERENCES = "COMPARABLE_REFERENCES"       # {minimum_count, lookback_years, project_type}
CONSTRUCTION_WINDOW = "CONSTRUCTION_WINDOW"           # {start, end}
SELF_PERFORMANCE_MINIMUM = "SELF_PERFORMANCE_MINIMUM"  # {percent}
PENALTY_CLAUSE = "PENALTY_CLAUSE"                     # {percent_per_day, cap_percent}
CONTRACTOR_ROLE = "CONTRACTOR_ROLE"                   # {role}
REQUIREMENT_KINDS = (PERFORMANCE_GUARANTEE, COMPARABLE_REFERENCES, CONSTRUCTION_WINDOW,
                     SELF_PERFORMANCE_MINIMUM, PENALTY_CLAUSE, CONTRACTOR_ROLE)

LOCATOR = "xpath:BT-750"

# Bridge to the fact sheet (factsheet.ATTRIBUTES): the fifteen-field briefing page reads
# `observations_resolved` grouped by (scope_key, attribute) using ITS OWN attribute
# vocabulary, not the Requirement kind names above. Six of its fields correspond 1:1 to a
# Requirement kind (factsheet.DOCUMENT_ONLY plus the two xpath already partially covers:
# "guarantees" as a bool, "construction_window" only when both dates are structured).
# Every requirement row this module emits is mirrored as a `fact` row under the matching
# name so a document's finding actually reaches the fact sheet instead of only being
# visible to a future decision rule that reads the Requirement kind directly.
FACT_ATTRIBUTE_BY_KIND = {
    PERFORMANCE_GUARANTEE: "guarantees",
    COMPARABLE_REFERENCES: "references_required",
    CONSTRUCTION_WINDOW: "construction_window",
    SELF_PERFORMANCE_MINIMUM: "self_performance_min_pct",
    PENALTY_CLAUSE: "penalty",
    CONTRACTOR_ROLE: "contractor_role",
}

# Which condition field is the fact sheet's single comparable value per kind, so
# `observations_resolved`'s value_key = coalesce(value_num, value_text, condition) has a
# real number or string to compare instead of falling back to the whole condition blob.
_PRIMARY_CONDITION_FIELD = {
    PERFORMANCE_GUARANTEE: "percent_of_contract_value",
    SELF_PERFORMANCE_MINIMUM: "percent",
    PENALTY_CLAUSE: "percent_per_day",
    COMPARABLE_REFERENCES: "minimum_count",
    CONTRACTOR_ROLE: "role",
    # CONSTRUCTION_WINDOW has two fields, neither alone comparable; value_text below.
}


def primary_value(kind: str, condition: dict[str, Any] | None) -> tuple[float | None, str | None]:
    """(value_num, value_text) the fact row and the requirement row both carry.

    A missing or partial condition (e.g. only a cap, no rate) yields (None, None); the
    row still carries the full condition for `observations_resolved`'s CONFLICTING check.
    """
    if not condition:
        return None, None
    field = _PRIMARY_CONDITION_FIELD.get(kind)
    if field:
        value = condition.get(field)
        if value is None:
            return None, None
        return (float(value), None) if isinstance(value, (int, float)) else (None, str(value))
    if kind == CONSTRUCTION_WINDOW and condition.get("start") and condition.get("end"):
        return None, f"{condition['start']} … {condition['end']}"
    return None, None

# German number words up to twenty, the range that appears in percentages and counts.
NUMBER_WORDS = {
    "ein": 1, "eine": 1, "einer": 1, "einem": 1, "zwei": 2, "drei": 3, "vier": 4, "fünf": 5,
    "fuenf": 5, "sechs": 6, "sieben": 7, "acht": 8, "neun": 9, "zehn": 10, "elf": 11,
    "zwölf": 12, "zwoelf": 12, "fünfzehn": 15, "zwanzig": 20,
}
_WORD = "|".join(sorted(NUMBER_WORDS, key=len, reverse=True))
# "5 %", "0,2%", "10 v.H.", "zehn Prozent". Unnamed groups so a pattern can be used twice
# in one regex; callers take the first non-empty group.
PERCENT = rf"(\d{{1,2}}(?:[.,]\d{{1,2}})?|{_WORD})\s*(?:%|v\.\s?h\.|prozent|von hundert)"
COUNT = rf"(\d{{1,2}}|{_WORD})"
DATE = r"(\d{1,2}\.\d{1,2}\.\d{4})"


def _first_group(match: re.Match[str]) -> str:
    return next(g for g in match.groups() if g)

# A sentence that hands the requirement to the documents instead of stating it.
REFERRED = re.compile(r"(?:siehe|s\.|gemäß|gemaess|entsprechend|laut|vgl\.)\s+(?:den\s+|die\s+)?"
                      r"(?:vergabe|ausschreibungs|vertrags)unterlagen", re.I)

GUARANTEE_KW = re.compile(r"sicherheit(?:sleistung|en)?\b|bürgschaft|buergschaft|vertragserfüllung", re.I)
PENALTY_KW = re.compile(r"vertragsstrafe|verzugsstrafe|pönale|poenale", re.I)
SELF_PERFORM_KW = re.compile(r"eigenleistung|im eigenen betrieb|selbst (?:aus)?zuführen|selbst ausführ", re.I)
REFERENCES_KW = re.compile(r"referenz", re.I)
WINDOW_KW = re.compile(r"ausführungsfrist|ausfuehrungsfrist|bauzeit|baubeginn|ausführungszeit|fertigstellung", re.I)


def number(token: str) -> float:
    """'0,2' → 0.2, 'zehn' → 10."""
    token = token.strip().lower()
    if token in NUMBER_WORDS:
        return float(NUMBER_WORDS[token])
    return float(token.replace(",", "."))


def iso_date(token: str) -> str:
    day, month, year = token.split(".")
    return f"{year}-{int(month):02d}-{int(day):02d}"


def sentences(text: str) -> list[str]:
    """Split on sentence ends and on the lettered/bulleted list markers national notices use."""
    text = re.sub(r"\s+", " ", text or "").strip()
    if not text:
        return []
    parts = re.split(r"(?<=[.;!?])\s+(?=[A-ZÄÖÜ(])|\s+(?=[a-z]\)\s)|\s+-(?=[A-ZÄÖÜ])", text)
    return [p.strip(" -") for p in parts if p.strip(" -")]


def _row(kind: str, sentence: str, condition: dict[str, Any] | None, state: str = "KNOWN",
         num: float | None = None, unit: str | None = None, locator: str = LOCATOR) -> dict[str, Any]:
    return {
        "kind": "requirement",
        "attribute": kind,
        "extractor": "rule",
        "state": state,
        "condition": condition,
        "value_num": num,
        "unit": unit,
        "value_text": None,
        "evidence_quote": sentence,
        "locator": locator,
        "confidence": CONFIDENCE_BY_EXTRACTOR["rule"] if state == "KNOWN" else "not_found",
    }


def _guarantee(s: str) -> dict[str, Any] | None:
    if not GUARANTEE_KW.search(s):
        return None
    if REFERRED.search(s):
        return _row(PERFORMANCE_GUARANTEE, s, None, state="REFERRED_TO_DOCUMENTS")
    m = re.search(PERCENT, s, re.I)
    if not m:
        return None
    pct = number(m.group(1))
    return _row(PERFORMANCE_GUARANTEE, s, {"percent_of_contract_value": pct}, num=pct, unit="%")


def _penalty(s: str) -> dict[str, Any] | None:
    if not PENALTY_KW.search(s):
        return None
    if REFERRED.search(s):
        return _row(PENALTY_CLAUSE, s, None, state="REFERRED_TO_DOCUMENTS")
    percents = [number(m.group(1)) for m in re.finditer(PERCENT, s, re.I)]
    if not percents:
        return None
    cap = None
    cap_match = re.search(rf"(?:höchstens|hoechstens|maximal|max\.|insgesamt|begrenzt)[^.;]{{0,40}}?{PERCENT}"
                          rf"|{PERCENT}[^.;]{{0,40}}?(?:begrenzt|beschränkt|gedeckelt)", s, re.I)
    if cap_match:
        cap = number(_first_group(cap_match))
        # A sentence that only states the cap ("wird auf insgesamt 5 % begrenzt") has no rate.
        rates = [p for p in percents if p != cap]
    else:
        rates = percents
    rate = rates[0] if rates else None
    return _row(PENALTY_CLAUSE, s, {"percent_per_day": rate, "cap_percent": cap}, num=rate, unit="%/Tag")


def _self_performance(s: str) -> dict[str, Any] | None:
    if not SELF_PERFORM_KW.search(s):
        return None
    if REFERRED.search(s):
        return _row(SELF_PERFORMANCE_MINIMUM, s, None, state="REFERRED_TO_DOCUMENTS")
    m = re.search(PERCENT, s, re.I)
    if not m:
        return None
    pct = number(m.group(1))
    return _row(SELF_PERFORMANCE_MINIMUM, s, {"percent": pct}, num=pct, unit="%")


def _references(s: str) -> dict[str, Any] | None:
    if not REFERENCES_KW.search(s):
        return None
    if REFERRED.search(s):
        return _row(COMPARABLE_REFERENCES, s, None, state="REFERRED_TO_DOCUMENTS")
    count = re.search(rf"(?:mindestens|mind\.|min\.|wenigstens)\s+{COUNT}\s+(?:vergleichbare?n?\s+)?referenz"
                      rf"|{COUNT}\s+(?:vergleichbare?n?\s+)?referenz(?:en|projekte|objekte|nachweise)", s, re.I)
    if not count:
        return None
    n = int(number(_first_group(count)))
    years = re.search(rf"letzten\s+{COUNT}\s+(?:abgeschlossenen\s+)?(?:geschäfts|kalender)?jahren?", s, re.I)
    condition: dict[str, Any] = {
        "minimum_count": n,
        "lookback_years": int(number(years.group(1))) if years else None,
        "project_type": None,
    }
    return _row(COMPARABLE_REFERENCES, s, condition, num=float(n), unit="Referenzen")


def _window(s: str) -> dict[str, Any] | None:
    if not WINDOW_KW.search(s):
        return None
    if REFERRED.search(s) and not re.search(DATE, s):
        return _row(CONSTRUCTION_WINDOW, s, None, state="REFERRED_TO_DOCUMENTS")
    dates = [iso_date(m.group(1)) for m in re.finditer(DATE, s)]
    if len(dates) < 2:
        return None
    return _row(CONSTRUCTION_WINDOW, s, {"start": dates[0], "end": dates[1]})


EXTRACTORS = (_guarantee, _penalty, _self_performance, _references, _window)


def _fact_row(requirement: dict[str, Any]) -> dict[str, Any] | None:
    """The fact-sheet mirror of a requirement row, or None for a kind with no mapping.

    Same state and evidence; attribute and value use the fact sheet's own vocabulary
    (factsheet.ATTRIBUTES) so `observations_resolved` actually merges this finding onto
    the briefing page instead of only being reachable by the Requirement kind name.
    """
    attribute = FACT_ATTRIBUTE_BY_KIND.get(requirement["attribute"])
    if attribute is None:
        return None
    value_num, value_text = primary_value(requirement["attribute"], requirement["condition"])
    return {**requirement, "kind": "fact", "attribute": attribute,
            "value_num": value_num, "value_text": value_text}


def extract(text: str, locator: str = LOCATOR) -> list[dict[str, Any]]:
    """Requirement rows found in `text`, at most one per kind (first sentence wins), each
    mirrored as a fact row under the fact sheet's own attribute name (see `_fact_row`).

    A KNOWN row beats a REFERRED_TO_DOCUMENTS row for the same kind, so a notice that
    both states "5 %" and says "siehe Vergabeunterlagen" elsewhere keeps the value.
    `locator` names where `text` itself came from (default: BT-750, the eForms
    Eignungskriterien); pass the real source when running the rules over other prose so
    the evidence locator does not falsely cite BT-750 for it.
    """
    found: dict[str, dict[str, Any]] = {}
    for sentence in sentences(text):
        for fn in EXTRACTORS:
            row = fn(sentence)
            if row is None:
                continue
            row["locator"] = locator
            kind = row["attribute"]
            current = found.get(kind)
            if current is None or (current["state"] != "KNOWN" and row["state"] == "KNOWN"):
                found[kind] = row
            elif current["state"] == "KNOWN" and row["state"] == "KNOWN" and current["condition"] and row["condition"]:
                # The rate and the cap of a penalty are often two sentences: fill the gaps.
                for key, value in row["condition"].items():
                    if current["condition"].get(key) is None and value is not None:
                        current["condition"][key] = value
                        current["evidence_quote"] += " " + row["evidence_quote"]
    requirements = [row for row in found.values()
                    if row["state"] != "KNOWN" or any(v is not None for v in row["condition"].values())]
    facts = [fact for req in requirements if (fact := _fact_row(req)) is not None]
    return requirements + facts
