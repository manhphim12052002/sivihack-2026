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
         num: float | None = None, unit: str | None = None) -> dict[str, Any]:
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
        "locator": LOCATOR,
        "confidence": "medium" if state == "KNOWN" else "not_found",
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


def extract(text: str) -> list[dict[str, Any]]:
    """Requirement rows found in `text`, at most one per kind (first sentence wins).

    A KNOWN row beats a REFERRED_TO_DOCUMENTS row for the same kind, so a notice that
    both states "5 %" and says "siehe Vergabeunterlagen" elsewhere keeps the value.
    """
    found: dict[str, dict[str, Any]] = {}
    for sentence in sentences(text):
        for fn in EXTRACTORS:
            row = fn(sentence)
            if row is None:
                continue
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
    return [row for row in found.values() if row["state"] != "KNOWN" or any(v is not None for v in row["condition"].values())]
