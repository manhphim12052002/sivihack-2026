"""Map a parsed eForms lot onto a `lots` row and its `xpath` observations.

The fact sheet is the contract between this pipeline and the screening rules, and
its field names are fixed by the published API contract — not invented here.

Only *interpreted* facts become observations. Raw German prose (the BT-750
Eignungskriterien, the lot description) is kept on the lot row and is the input
the enrich stage reads. The one exception is the BT-750 text itself, also stored
as a lot-scoped observation so the briefing page can show "what the buyer wrote"
next to what the rules made of it, with the notice version as its Source.

Nine of the fifteen fact-sheet attributes can be read straight from the
structured notice and land here with extractor `xpath` and high confidence. The
other six have no structured source for most of the feed and stay absent until
enrich supplies them from prose or documents. Absent means no row, never a
default value: on the national sub-threshold feed, which is 56% of lots, the
contract value and guarantee fields are empty 100% of the time, and reading that
as "no guarantee required" would make every such lot look eligible.
"""

from __future__ import annotations

from typing import Any

from .confidence import CONFIDENCE_BY_EXTRACTOR
from .db import lot_key, notice_version, procedure_key
from .eforms import LotRecord

# The 15 fields, in the order the briefing page renders them.
ATTRIBUTES = (
    "trade_scope",
    "place_of_performance",
    "estimated_value",
    "lots",
    "references_required",
    "eligibility_proofs",
    "construction_window",
    "guarantees",
    "penalty",
    "self_performance_min_pct",
    "side_offers_allowed",
    "consortium_allowed",
    "submission_deadline",
    "special_qualifications",
    "contractor_role",
)

# Attributes with no structured source for most of the feed. Left to enrich, and
# reported as not_found until it runs, so a gap is visible rather than implied.
DOCUMENT_ONLY = (
    "penalty",
    "self_performance_min_pct",
    "consortium_allowed",
    "contractor_role",
)

def notice_source_id(record: LotRecord) -> str:
    """`sources.id` of the notice version a record was parsed from."""
    return f"notice:{record.notice_id}:{notice_version(record.notice_version)}"


def _timestamp(date: str | None, time: str | None) -> str | None:
    """Join eForms date and time parts into one timestamptz literal."""
    if not date:
        return None
    return f"{date}T{time}" if time else date


def lot_row(record: LotRecord, lot_count: int = 1) -> dict[str, Any]:
    """Flatten a LotRecord into the `lots` table's columns.

    Prose that enrich will read and the fields the screening rules never touch
    go into `extra` rather than earning a column each — the record has ~50
    fields and only the queryable ones deserve indexing. `qualification_text`
    and `document_urls` are real columns because enrich queries on them.
    """
    extra = {
        "prose_signals": record.prose_signals,
        "award_criteria": record.award_criteria,
        "exclusion_grounds": record.exclusion_grounds,
        "selection_criteria": record.selection_criteria,
        "construction_start": record.construction_start,
        "construction_end": record.construction_end,
        "construction_duration": record.construction_duration,
        "tender_validity_days": record.tender_validity_days,
        "guarantee_required": record.guarantee_required,
        "variants_allowed": record.variants_allowed,
        "lots_max_awarded": record.lots_max_awarded,
        "legal_basis": record.legal_basis,
        "procedure_type": record.procedure_type,
        "buyer_nuts": record.buyer_nuts,
        "buyer_city": record.buyer_city,
        "place_postcode": record.place_postcode,
        "submission_deadline_time": record.submission_deadline_time,
        "bid_opening": record.bid_opening,
        "sme_suitable": record.sme_suitable,
        "esubmission": record.esubmission,
        "language": record.language,
        "nature": record.nature,
    }
    return {
        "source": record.source,
        "notice_id": record.notice_id,
        "notice_version": notice_version(record.notice_version),
        "lot_id": record.lot_id,
        "source_format": record.source_format,
        "schema_profile": record.schema_profile,
        "notice_type": record.notice_type,
        "procedure_id": record.project_id,
        "ocid": None,
        "changed_notice_id": record.changed_notice_id,
        "published": record.published,
        "notice_url": record.notice_url,
        "title": record.title or record.project_title,
        "description": record.description,
        "buyer_name": record.buyer_name,
        "place_city": record.place_city,
        "place_nuts": record.place_nuts,
        "cpv_main": record.cpv_main,
        "cpv_additional": record.cpv_additional,
        "estimated_value": record.estimated_value,
        "estimated_value_currency": record.estimated_value_currency,
        "submission_deadline": _timestamp(record.submission_deadline, record.submission_deadline_time),
        "question_deadline": record.question_deadline,
        "lot_count": lot_count,
        "qualification_text": record.qualification_text,
        "document_urls": record.document_urls,
        "extra": extra,
    }


def _observation(scope_type: str, scope_key: str, source_id: str, attribute: str, locator: str, *,
                 text: Any = None, num: float | None = None, unit: str | None = None,
                 quote: str | None = None) -> dict[str, Any]:
    return {
        "scope_type": scope_type,
        "scope_key": scope_key,
        "kind": "fact",
        "attribute": attribute,
        "extractor": "xpath",
        "source_id": source_id,
        "value_text": None if text is None else str(text),
        "value_num": num,
        "unit": unit,
        "state": "KNOWN",
        # A structured field is its own evidence: the locator names the business
        # term, so an estimator can check it against the published notice.
        "evidence_quote": quote,
        "locator": locator,
        "confidence": CONFIDENCE_BY_EXTRACTOR["xpath"],
    }


def xpath_observations(record: LotRecord) -> list[dict[str, Any]]:
    """Observations readable straight from the structured notice.

    Emits nothing for an attribute the notice does not carry, which is what makes
    the difference between `Unknown` and a wrong `OK` downstream. Lot facts,
    including the BT-750 prose, carry the LOT scope key: a corrigendum publishes a
    new lot key, so the reworded text supersedes rather than conflicts. Buyer and
    procedure type carry the PROCEDURE key and are written once per notice version
    (the primary key absorbs the repeat from every other lot of the same notice);
    if a later version changes them, the resolution view flags CONFLICTING, which
    is the intended signal for a changed buyer or procedure.
    """
    source_id = notice_source_id(record)
    key = lot_key(record.source, record.notice_id, record.notice_version, record.lot_id)
    proc = procedure_key(record.source, record.notice_id)
    out: list[dict[str, Any]] = []

    def lot(attribute: str, locator: str, **kw: Any) -> None:
        out.append(_observation("LOT", key, source_id, attribute, locator, **kw))

    def procedure(attribute: str, locator: str, **kw: Any) -> None:
        out.append(_observation("PROCEDURE", proc, source_id, attribute, locator, **kw))

    if record.cpv_main:
        extra = [c for c in record.cpv_additional if c]
        lot("trade_scope", "xpath:BT-262/BT-263", text=record.cpv_main,
            quote=", ".join([record.cpv_main] + extra) if extra else record.cpv_main)

    place = " ".join(p for p in (record.place_city, record.place_nuts) if p)
    if place:
        lot("place_of_performance", "xpath:BT-5101/BT-5071", text=record.place_nuts, quote=place)

    if record.estimated_value is not None:
        currency = record.estimated_value_currency or "EUR"
        lot("estimated_value", "xpath:BT-27", num=record.estimated_value, unit=currency,
            text=f"{record.estimated_value:.0f} {currency}")

    if record.submission_deadline:
        lot("submission_deadline", "xpath:BT-131",
            text=_timestamp(record.submission_deadline, record.submission_deadline_time))

    # Only a window with at least one bound is a fact; an empty one is not.
    if record.construction_start or record.construction_end:
        lot("construction_window", "xpath:BT-536/BT-537",
            text=f"{record.construction_start or '?'} … {record.construction_end or '?'}")

    # The notice says only WHETHER a guarantee is required. The amount — the part
    # that decides whether it fits a company's credit line — is document-only.
    if record.guarantee_required is not None:
        lot("guarantees", "xpath:BT-75", text=record.guarantee_required)

    if record.variants_allowed is not None:
        lot("side_offers_allowed", "xpath:BT-63", text=record.variants_allowed)

    if record.lots_max_awarded is not None:
        lot("lots", "xpath:BT-33", text=record.lots_max_awarded)

    if record.exclusion_grounds:
        grounds = "; ".join(record.exclusion_grounds)
        lot("eligibility_proofs", "xpath:BT-67", text=grounds, quote=grounds)

    if record.buyer_name:
        procedure("buyer_name", "xpath:BT-500", text=record.buyer_name)

    if record.procedure_type:
        procedure("procedure_type", "xpath:BT-105", text=record.procedure_type)

    prose = [c["description"] for c in record.selection_criteria if c["description"]]
    if prose:
        text = "\n".join(prose)
        lot("selection_criteria_text", "xpath:BT-750", text=text, quote=text)

    return out


def coverage(observations: list[dict[str, Any]]) -> dict[str, int]:
    """Per-attribute observation counts, for the CLI's post-run report."""
    got = {a: 0 for a in ATTRIBUTES}
    for o in observations:
        if o["attribute"] in got:
            got[o["attribute"]] += 1
    return got
