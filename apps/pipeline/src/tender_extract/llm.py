"""Model extraction over document text, behind one function, with the evidence gate.

The model's only job (ADR 0003) is to turn German procurement text into typed items
that each carry a verbatim quote and the page it came from. It never ranks and never
decides. Output is schema-enforced JSON with three arrays: `facts`, `requirements`
(the six kinds, typed conditions) and `unmatched_requirements` (ontology category).

`extract` is the single network call (OpenRouter, OpenAI-compatible chat completions,
model from `OPENROUTER_MODEL`). Any failure returns an empty result flagged
`unavailable` so enrich can carry on with rules only. `gate` is pure and tested: an
item survives only if its chunk id names a page of this document and its quote is a
whitespace-normalised substring of that page.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any

from .rules import REQUIREMENT_KINDS

API_URL = "https://openrouter.ai/api/v1/chat/completions"
API_KEY_ENV = "OPENROUTER_API_KEY"
MODEL_ENV = "OPENROUTER_MODEL"
DEFAULT_MODEL = "anthropic/claude-sonnet-5"
PROMPT_VERSION = "v1"
TIMEOUT = 180

UNMATCHED_CATEGORIES = ("REFERENCE", "QUALIFICATION", "FINANCIAL", "INSURANCE", "TECHNICAL_CAPABILITY",
                        "PERSONNEL", "EXECUTION", "SUBMISSION", "CONTRACTUAL", "LEGAL", "OTHER")

# Facts the model may report from documents (same vocabulary as the fact sheet).
FACT_ATTRIBUTES = ("estimated_value", "construction_window", "guarantees", "penalty",
                   "self_performance_min_pct", "side_offers_allowed", "consortium_allowed",
                   "submission_deadline", "special_qualifications", "contractor_role")


@dataclass
class ExtractionResult:
    facts: list[dict[str, Any]] = field(default_factory=list)
    requirements: list[dict[str, Any]] = field(default_factory=list)
    unmatched_requirements: list[dict[str, Any]] = field(default_factory=list)
    unavailable: bool = False        # network or model failure: treat as "not read"
    model: str | None = None
    prompt_version: str = PROMPT_VERSION


def _evidence_schema() -> dict[str, Any]:
    return {
        "type": "array", "minItems": 1,
        "items": {"type": "object", "additionalProperties": False,
                  "required": ["chunk_id", "quote"],
                  "properties": {"chunk_id": {"type": "string"}, "quote": {"type": "string"}}},
    }


def _scope_schema() -> dict[str, Any]:
    return {"type": "object", "additionalProperties": False, "required": ["type", "id"],
            "properties": {"type": {"type": "string", "enum": ["PROCEDURE", "LOT"]},
                           "id": {"type": ["string", "null"]}}}


def response_schema() -> dict[str, Any]:
    """JSON schema the model must satisfy; typed per Requirement kind via a free-form condition object."""
    condition = {"type": "object", "additionalProperties": False,
                 "properties": {k: {"type": ["number", "string", "null"]} for k in (
                     "percent_of_contract_value", "minimum_count", "lookback_years", "project_type",
                     "start", "end", "percent", "percent_per_day", "cap_percent", "role")},
                 "required": ["percent_of_contract_value", "minimum_count", "lookback_years", "project_type",
                              "start", "end", "percent", "percent_per_day", "cap_percent", "role"]}
    return {
        "type": "object", "additionalProperties": False,
        "required": ["facts", "requirements", "unmatched_requirements"],
        "properties": {
            "facts": {"type": "array", "items": {
                "type": "object", "additionalProperties": False,
                "required": ["attribute", "value", "scope", "evidence"],
                "properties": {"attribute": {"type": "string", "enum": list(FACT_ATTRIBUTES)},
                               "value": {"type": "string"}, "scope": _scope_schema(),
                               "evidence": _evidence_schema()}}},
            "requirements": {"type": "array", "items": {
                "type": "object", "additionalProperties": False,
                "required": ["kind", "condition", "scope", "evidence", "statement_type"],
                "properties": {"kind": {"type": "string", "enum": list(REQUIREMENT_KINDS)},
                               "condition": condition, "scope": _scope_schema(),
                               "evidence": _evidence_schema(),
                               "statement_type": {"type": "string", "enum": ["EXPLICIT", "INFERRED", "AMBIGUOUS"]}}}},
            "unmatched_requirements": {"type": "array", "items": {
                "type": "object", "additionalProperties": False,
                "required": ["category", "quote", "scope", "evidence"],
                "properties": {"category": {"type": "string", "enum": list(UNMATCHED_CATEGORIES)},
                               "quote": {"type": "string"}, "scope": _scope_schema(),
                               "evidence": _evidence_schema()}}},
        },
    }


SYSTEM_PROMPT = """You read German public procurement documents (Vergabeunterlagen) for a construction
estimator. Report what the document STATES; never judge whether a company should bid.

Return JSON only, matching the schema. Three arrays:
- requirements: conditions the buyer imposes on the bidder or the bid ("muss", "hat ... zu", "ist ... vorzulegen"),
  ONLY of these six kinds, each with its typed condition (numbers as numbers, dates as YYYY-MM-DD, unknown fields null):
  PERFORMANCE_GUARANTEE {percent_of_contract_value}  Vertragserfüllungsbürgschaft / Sicherheitsleistung in % der Auftragssumme
  COMPARABLE_REFERENCES {minimum_count, lookback_years, project_type}  geforderte Referenzen
  CONSTRUCTION_WINDOW {start, end}  Ausführungsfrist / Bauzeit
  SELF_PERFORMANCE_MINIMUM {percent}  Mindest-Eigenleistung, Grenze für Nachunternehmer
  PENALTY_CLAUSE {percent_per_day, cap_percent}  Vertragsstrafe
  CONTRACTOR_ROLE {role}  GENERAL | TRADE | SUBCONTRACTOR
- unmatched_requirements: every other normative condition (Präqualifikation, Versicherung, Umsatz, Personal,
  Rechtsform, Fristen, ...) with a category from the list.
- facts: descriptive statements of the listed attributes only.

Every item needs evidence: the chunk_id of the page it appears on (given as "<source>#p<page>" in the text)
and a VERBATIM German quote copied exactly from that page, 5 to 40 words. Do not translate, paraphrase or
fix typos in quotes. Scope is PROCEDURE unless the text or the filename names a specific lot (Los)."""


def _user_prompt(document_text: str, context: dict[str, Any]) -> str:
    lots = "\n".join(f"  - {lot['lot_id']}: {lot.get('title') or ''}" for lot in context.get("lots", []))
    return (f"Procedure: {context.get('title') or ''}\nBuyer: {context.get('buyer_name') or ''}\n"
            f"Lots:\n{lots or '  - (single lot)'}\nFile: {context.get('filename') or ''}\n"
            f"{'This file is for lot ' + context['lot_hint'] + '.' if context.get('lot_hint') else ''}\n\n"
            f"Document text, one block per page, each headed by its chunk_id:\n\n{document_text}")


def complete_json(messages: list[dict[str, str]], schema: dict[str, Any], model: str) -> dict[str, Any]:
    """The one network call. Raises on any transport or parsing problem."""
    key = os.environ.get(API_KEY_ENV)
    if not key:
        raise RuntimeError(f"{API_KEY_ENV} is not set")
    body = {
        "model": model,
        "messages": messages,
        "temperature": 0,
        "response_format": {"type": "json_schema",
                            "json_schema": {"name": "extraction", "strict": True, "schema": schema}},
    }
    req = urllib.request.Request(
        API_URL, data=json.dumps(body).encode("utf-8"), method="POST",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                 "HTTP-Referer": "https://github.com/manhphim12052002/sivihack-2026",
                 "X-Title": "sivihack-2026 tender pipeline"},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    content = payload["choices"][0]["message"]["content"]
    if isinstance(content, list):  # some providers return content parts
        content = "".join(part.get("text", "") for part in content)
    return json.loads(content)


def extract(document_text: str, procedure_context: dict[str, Any],
            prompt_version: str = PROMPT_VERSION) -> ExtractionResult:
    """One model call over one routed document. Never raises: failures come back `unavailable`."""
    model = os.environ.get(MODEL_ENV, DEFAULT_MODEL)
    messages = [{"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": _user_prompt(document_text, procedure_context)}]
    try:
        data = complete_json(messages, response_schema(), model)
    except (urllib.error.URLError, RuntimeError, KeyError, ValueError, TimeoutError, OSError) as exc:
        print(f"  model unavailable: {type(exc).__name__}: {str(exc)[:120]}", file=sys.stderr)
        return ExtractionResult(unavailable=True, model=model, prompt_version=prompt_version)
    return ExtractionResult(
        facts=list(data.get("facts") or []),
        requirements=list(data.get("requirements") or []),
        unmatched_requirements=list(data.get("unmatched_requirements") or []),
        model=model, prompt_version=prompt_version,
    )


# --- evidence gate (pure) ---------------------------------------------------------


def normalise(text: str) -> str:
    """Collapse whitespace so line breaks in the PDF text layer do not fail an honest quote."""
    return re.sub(r"\s+", " ", text or "").strip()


def gate(items: list[dict[str, Any]], pages: dict[str, str]) -> tuple[list[dict[str, Any]], int]:
    """Keep items whose evidence points at a real page and quotes it verbatim.

    `pages` maps chunk id → page text for the document that was sent. Evidence
    pointers that fail are dropped from a surviving item; an item with no surviving
    pointer is rejected and counted. Returns (kept_items, rejected_count).
    """
    normalised_pages = {cid: normalise(text) for cid, text in pages.items()}
    kept: list[dict[str, Any]] = []
    rejected = 0
    for item in items:
        valid = [
            ev for ev in item.get("evidence") or []
            if ev.get("chunk_id") in normalised_pages
            and normalise(ev.get("quote", ""))
            and normalise(ev["quote"]) in normalised_pages[ev["chunk_id"]]
        ]
        if not valid:
            rejected += 1
            continue
        kept.append({**item, "evidence": valid})
    return kept, rejected
