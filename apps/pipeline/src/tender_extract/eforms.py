"""Parse eForms-DE notices into one flat record per lot.

The lot is the screening unit, not the notice: a EUR 14M tender may contain a
single EUR 700k lot that fits a small contractor perfectly, so collapsing a
notice into one row would hide exactly the cases that matter.

Lot elements fall back to the notice-level ProcurementProject when absent,
which is how eForms expresses "same as the overall project".
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field, asdict
from typing import Any

NS = {
    "cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    "efac": "http://data.europa.eu/p27/eforms-ubl-extension-aggregate-components/1",
    "efbc": "http://data.europa.eu/p27/eforms-ubl-extension-basic-components/1",
    "efext": "http://data.europa.eu/p27/eforms-ubl-extensions/1",
    "ext": "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
}

# Sub-threshold national notices reuse listName="competition" even to announce a
# finished award, so the notice type cannot be trusted for them. The German title
# prefix is the only signal the source actually provides.
AWARDED_TITLE = re.compile(
    r"^\s*(vergebener auftrag|vergabebekanntmachung|transparenzbekanntmachung"
    r"|auftragsbekanntmachung – ergebnis|bekanntmachung vergebener)", re.I
)


# Terms an estimator screens on that eForms has no field for — they appear only
# as prose in the qualification criteria. Flagging them tells the downstream
# screener where a hard disqualifier is likely to be hiding.
PROSE_SIGNALS = {
    "referenzen": r"referenz",
    "praequalifikation": r"präqualifi|praequalifi|pq-vob|pq-nummer",
    "buergschaft": r"bürgschaft|buergschaft|sicherheitsleistung|vertragserfüllung",
    "eigenleistung": r"eigenleistung|selbst ausführ|nachunternehmer",
    "bietergemeinschaft": r"bietergemeinschaft|arge\b",
    "vertragsstrafe": r"vertragsstrafe|verzugsstrafe",
    "bauzeit": r"bauzeit|ausführungsfrist",
    "umsatz": r"jahresumsatz|mindestumsatz|umsatz der letzten",
}


# Buyers fill unused mandatory fields with filler rather than leaving them out.
PLACEHOLDERS = {"", "-", "--", "---", ".", "..", "n/a", "na", "k.a.", "keine",
                "entfällt", "entfaellt", "siehe vergabeunterlagen", "0"}


def _clean(value: str | None) -> str | None:
    """Drop filler values so downstream code can trust a non-null field."""
    if value is None:
        return None
    value = value.strip()
    return None if value.lower() in PLACEHOLDERS else value


def _txt(node: ET.Element | None, path: str) -> str | None:
    if node is None:
        return None
    found = node.find(path, NS)
    if found is None or found.text is None:
        return None
    return _clean(found.text)


def _all_txt(node: ET.Element | None, path: str) -> list[str]:
    if node is None:
        return []
    out = []
    for el in node.findall(path, NS):
        if el.text and el.text.strip():
            out.append(el.text.strip())
    return out


def _coded(node: ET.Element | None, path: str, list_name: str) -> str | None:
    """Read a code element constrained to a given eForms `listName`."""
    if node is None:
        return None
    for el in node.findall(path, NS):
        if el.get("listName") == list_name and el.text:
            return el.text.strip()
    return None


def _cpv(value: str | None) -> str | None:
    """Normalise a CPV code to its 8 digits.

    Buyers publish the code either bare (45233120) or with the ISO check digit
    (45233120-8). Left mixed, a prefix filter silently misses half the matches.
    """
    if not value:
        return None
    digits = value.strip().split("-")[0]
    return digits if digits.isdigit() else value.strip()


def _date(value: str | None) -> str | None:
    """eForms dates carry a UTC offset (2026-10-16+02:00); keep the plain date."""
    if not value:
        return None
    return value[:10]


@dataclass
class LotRecord:
    # identity
    notice_id: str
    notice_version: str | None
    lot_id: str
    source: str = "oeffentlichevergabe.de"
    source_format: str = "eforms-de"
    notice_url: str | None = None

    # publication / procedure
    notice_type: str | None = None
    notice_subtype: str | None = None
    schema_profile: str | None = None
    title_marks_awarded: bool = False
    # BT-758: the earlier notice this version corrects; None for a first publication.
    changed_notice_id: str | None = None
    published: str | None = None
    language: str | None = None
    legal_basis: str | None = None
    procedure_type: str | None = None
    accelerated: str | None = None

    # buyer
    buyer_name: str | None = None
    buyer_city: str | None = None
    buyer_postcode: str | None = None
    buyer_nuts: str | None = None
    buyer_country: str | None = None
    buyer_url: str | None = None
    buyer_legal_type: str | None = None

    # what the work is
    project_id: str | None = None
    project_title: str | None = None
    title: str | None = None
    description: str | None = None
    nature: str | None = None
    cpv_main: str | None = None
    cpv_additional: list[str] = field(default_factory=list)

    # where
    place_street: str | None = None
    place_city: str | None = None
    place_postcode: str | None = None
    place_nuts: str | None = None
    place_country: str | None = None

    # money
    estimated_value: float | None = None
    estimated_value_currency: str | None = None

    # time
    submission_deadline: str | None = None
    submission_deadline_time: str | None = None
    question_deadline: str | None = None   # BT-13(d): last day to ask the buyer questions
    bid_opening: str | None = None
    construction_start: str | None = None
    construction_end: str | None = None
    construction_duration: str | None = None
    tender_validity_days: str | None = None

    # terms an estimator screens on
    award_criteria: list[dict[str, Any]] = field(default_factory=list)
    variants_allowed: str | None = None
    guarantee_required: str | None = None
    sme_suitable: str | None = None
    esubmission: str | None = None
    lots_max_awarded: str | None = None

    # eligibility prose — the usual home of the real disqualifier
    exclusion_grounds: list[str] = field(default_factory=list)
    # BT-750 Eignungskriterien: {"type": selection-criterion code or None, "description": prose}.
    # The code (slc-abil-ref-work = comparable references) is the only structured
    # hint of what the prose demands; the thin profile omits it.
    selection_criteria: list[dict[str, str | None]] = field(default_factory=list)
    qualification_text: list[str] = field(default_factory=list)
    prose_signals: list[str] = field(default_factory=list)

    # documents
    document_urls: list[str] = field(default_factory=list)
    has_documents: bool = False

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def _organizations(root: ET.Element) -> dict[str, dict[str, str | None]]:
    """Map ORG-xxxx ids to their details from the eForms extension block."""
    orgs: dict[str, dict[str, str | None]] = {}
    for org in root.findall(
        ".//efext:EformsExtension/efac:Organizations/efac:Organization", NS
    ):
        company = org.find("efac:Company", NS)
        if company is None:
            continue
        org_id = _txt(company, "cac:PartyIdentification/cbc:ID")
        if not org_id:
            continue
        addr = company.find("cac:PostalAddress", NS)
        orgs[org_id] = {
            "name": _txt(company, "cac:PartyName/cbc:Name"),
            "city": _txt(addr, "cbc:CityName"),
            "postcode": _txt(addr, "cbc:PostalZone"),
            "nuts": _txt(addr, "cbc:CountrySubentityCode"),
            "country": _txt(addr, "cac:Country/cbc:IdentificationCode"),
            "url": _txt(company, "cbc:WebsiteURI"),
        }
    return orgs


def _qualification(node: ET.Element | None) -> tuple[list[str], list[str]]:
    """Split qualification requests into exclusion-ground codes and free prose."""
    grounds: list[str] = []
    prose: list[str] = []
    if node is None:
        return grounds, prose
    for req in node.findall(
        "cac:TendererQualificationRequest/cac:SpecificTendererRequirement", NS
    ):
        for code in req.findall("cbc:TendererRequirementTypeCode", NS):
            if code.get("listName") == "exclusion-ground" and code.text:
                grounds.append(code.text.strip())
        text = _txt(req, "cbc:Description")
        if text:
            prose.append(text)
    return grounds, prose


def _selection_criteria(terms: ET.Element | None) -> list[dict[str, str | None]]:
    """BT-750: selection criteria from the eForms extension block of TenderingTerms.

    The rich profile pairs each description with a `selection-criterion` code;
    the thin profile publishes the description alone.
    """
    out: list[dict[str, str | None]] = []
    if terms is None:
        return out
    for crit in terms.findall(".//efext:EformsExtension/efac:SelectionCriteria", NS):
        entry = {
            "type": _coded(crit, "cbc:TendererRequirementTypeCode", "selection-criterion"),
            "description": _txt(crit, "cbc:Description"),
        }
        if entry["description"] or entry["type"]:
            out.append(entry)
    return out


def _location(node: ET.Element | None) -> dict[str, str | None]:
    addr = node.find("cac:RealizedLocation/cac:Address", NS) if node is not None else None
    return {
        "street": _txt(addr, "cbc:StreetName"),
        "city": _txt(addr, "cbc:CityName"),
        "postcode": _txt(addr, "cbc:PostalZone"),
        "nuts": _txt(addr, "cbc:CountrySubentityCode"),
        "country": _txt(addr, "cac:Country/cbc:IdentificationCode"),
    }


def _value(node: ET.Element | None) -> tuple[float | None, str | None]:
    amount = node.find(
        "cac:RequestedTenderTotal/cbc:EstimatedOverallContractAmount", NS
    ) if node is not None else None
    if amount is None or not amount.text:
        return None, None
    try:
        return float(amount.text), amount.get("currencyID")
    except ValueError:
        return None, amount.get("currencyID")


def _award_criteria(terms: ET.Element | None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if terms is None:
        return out
    for crit in terms.findall(
        "cac:AwardingTerms/cac:AwardingCriterion/cac:SubordinateAwardingCriterion", NS
    ):
        entry = {
            "type": _coded(crit, "cbc:AwardingCriterionTypeCode", "award-criterion-type"),
            "name": _txt(crit, "cbc:Name"),
            "description": _txt(crit, "cbc:Description"),
        }
        # BT-541: the weight is the parameter whose code list is `number-weight`;
        # the same block can also carry fixed values or order-of-importance codes.
        for param in crit.findall(".//efac:AwardCriterionParameter", NS):
            code = param.find("efbc:ParameterCode", NS)
            number = _txt(param, "efbc:ParameterNumeric")
            if code is not None and code.get("listName") == "number-weight" and number:
                entry["weight"] = number
                break
        if any(entry.values()):
            out.append(entry)
    return out


def parse_notice(xml_bytes: bytes, cpv_prefix: str | None = "45") -> list[LotRecord]:
    """Parse one eForms notice into its lot records.

    With `cpv_prefix` set, only lots whose CPV code carries that prefix are
    returned (45 = construction work). Pass None to keep every lot.
    """
    root = ET.fromstring(xml_bytes)

    notice_id = _txt(root, "cbc:ID") or ""
    notice_version = _txt(root, "cbc:VersionID")
    notice_type_el = root.find("cbc:NoticeTypeCode", NS)
    notice_type = notice_type_el.text.strip() if notice_type_el is not None and notice_type_el.text else None
    form_type = notice_type_el.get("listName") if notice_type_el is not None else None
    subtype = _txt(root, ".//efext:EformsExtension/efbc:NoticeSubType/cbc:SubTypeCode")
    schema_profile = _txt(root, "cbc:CustomizationID")

    orgs = _organizations(root)
    buyer_id = _txt(root, "cac:ContractingParty/cac:Party/cac:PartyIdentification/cbc:ID")
    buyer = orgs.get(buyer_id or "", {})

    notice_terms = root.find("cac:TenderingTerms", NS)
    notice_grounds, notice_prose = _qualification(notice_terms)
    notice_selection = _selection_criteria(notice_terms)
    # BT-758 lives in the notice-level extension block, not under any lot.
    changed_notice_id = _txt(
        root,
        "ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent/efext:EformsExtension/"
        "efac:Changes/efbc:ChangedNoticeIdentifier",
    )
    # BT-33 sits under the notice-level TenderingTerms, not TenderingProcess.
    lots_max_awarded = _txt(
        notice_terms, "cac:LotDistribution/cbc:MaximumLotsAwardedNumeric"
    )

    project = root.find("cac:ProcurementProject", NS)
    project_location = _location(project)
    project_value, project_currency = _value(project)
    project_cpv = _cpv(
        _coded(
            project, "cac:MainCommodityClassification/cbc:ItemClassificationCode", "cpv"
        )
    )

    records: list[LotRecord] = []
    for lot in root.findall("cac:ProcurementProjectLot", NS):
        lot_id = _txt(lot, "cbc:ID") or "LOT-0000"
        lot_project = lot.find("cac:ProcurementProject", NS)
        lot_terms = lot.find("cac:TenderingTerms", NS)
        lot_process = lot.find("cac:TenderingProcess", NS)

        cpv_main = _cpv(
            _coded(
                lot_project,
                "cac:MainCommodityClassification/cbc:ItemClassificationCode",
                "cpv",
            )
        ) or project_cpv
        if cpv_prefix and not (cpv_main or "").startswith(cpv_prefix):
            continue

        cpv_additional = [
            code
            for code in (
                _cpv(el.text)
                for el in (lot_project or root).findall(
                    "cac:AdditionalCommodityClassification/cbc:ItemClassificationCode", NS
                )
                if el.text and el.get("listName") == "cpv"
            )
            if code
        ]

        location = _location(lot_project)
        if not any(location.values()):
            location = project_location

        value, currency = _value(lot_project)
        if value is None:
            value, currency = project_value, project_currency

        lot_grounds, lot_prose = _qualification(lot_terms)
        selection_criteria = notice_selection + _selection_criteria(lot_terms)
        # BT-750 prose joins the qualification blob so the rules and the prose
        # signals see the Eignungskriterien, not only the exclusion-ground text.
        qualification_text = notice_prose + lot_prose + [
            c["description"] for c in selection_criteria if c["description"]
        ]

        doc_urls = _all_txt(
            lot_terms,
            "cac:CallForTendersDocumentReference/cac:Attachment/"
            "cac:ExternalReference/cbc:URI",
        )
        doc_urls += _all_txt(lot_terms, "cbc:AccessToolsURI")

        resolved_title = _txt(lot_project, "cbc:Name") or _txt(project, "cbc:Name")

        blob = " ".join(qualification_text + [_txt(lot_project, "cbc:Description") or ""]).lower()
        signals = [name for name, pat in PROSE_SIGNALS.items() if re.search(pat, blob)]

        records.append(
            LotRecord(
                notice_id=notice_id,
                notice_version=notice_version,
                lot_id=lot_id,
                notice_url=f"https://oeffentlichevergabe.de/ui/de/notice/{notice_id}"
                if notice_id
                else None,
                notice_type=notice_type,
                notice_subtype=subtype,
                schema_profile=schema_profile,
                published=_date(_txt(root, "cbc:IssueDate")),
                language=_txt(root, "cbc:NoticeLanguageCode"),
                legal_basis=_txt(
                    notice_terms, "cac:ProcurementLegislationDocumentReference/cbc:ID"
                ),
                procedure_type=_coded(
                    root, "cac:TenderingProcess/cbc:ProcedureCode",
                    "procurement-procedure-type",
                ),
                accelerated=_coded(
                    root,
                    "cac:TenderingProcess/cac:ProcessJustification/cbc:ProcessReasonCode",
                    "accelerated-procedure",
                ),
                buyer_name=buyer.get("name"),
                buyer_city=buyer.get("city"),
                buyer_postcode=buyer.get("postcode"),
                buyer_nuts=buyer.get("nuts"),
                buyer_country=buyer.get("country"),
                buyer_url=_txt(root, "cac:ContractingParty/cbc:BuyerProfileURI")
                or buyer.get("url"),
                buyer_legal_type=_coded(
                    root,
                    "cac:ContractingParty/cac:ContractingPartyType/cbc:PartyTypeCode",
                    "buyer-legal-type",
                ),
                project_id=_txt(project, "cbc:ID"),
                project_title=_txt(project, "cbc:Name"),
                title=resolved_title,
                title_marks_awarded=bool(
                    resolved_title and AWARDED_TITLE.match(resolved_title)
                ),
                changed_notice_id=changed_notice_id,
                description=_txt(lot_project, "cbc:Description")
                or _txt(project, "cbc:Description"),
                nature=_coded(lot_project, "cbc:ProcurementTypeCode", "contract-nature")
                or _coded(project, "cbc:ProcurementTypeCode", "contract-nature"),
                cpv_main=cpv_main,
                cpv_additional=cpv_additional,
                place_street=location["street"],
                place_city=location["city"],
                place_postcode=location["postcode"],
                place_nuts=location["nuts"],
                place_country=location["country"],
                estimated_value=value,
                estimated_value_currency=currency,
                submission_deadline=_date(
                    _txt(lot_process, "cac:TenderSubmissionDeadlinePeriod/cbc:EndDate")
                ),
                submission_deadline_time=_txt(
                    lot_process, "cac:TenderSubmissionDeadlinePeriod/cbc:EndTime"
                ),
                question_deadline=_date(
                    _txt(lot_process, "cac:AdditionalInformationRequestPeriod/cbc:EndDate")
                ),
                bid_opening=_date(
                    _txt(lot_process, "cac:OpenTenderEvent/cbc:OccurrenceDate")
                ),
                construction_start=_date(
                    _txt(lot_project, "cac:PlannedPeriod/cbc:StartDate")
                ),
                construction_end=_date(
                    _txt(lot_project, "cac:PlannedPeriod/cbc:EndDate")
                ),
                construction_duration=_txt(
                    lot_project, "cac:PlannedPeriod/cbc:DurationMeasure"
                ),
                tender_validity_days=_txt(
                    lot_terms, "cac:TenderValidityPeriod/cbc:DurationMeasure"
                ),
                award_criteria=_award_criteria(lot_terms),
                variants_allowed=_coded(
                    lot_terms, "cbc:VariantConstraintCode", "permission"
                ),
                guarantee_required=_coded(
                    lot_terms,
                    "cac:RequiredFinancialGuarantee/cbc:GuaranteeTypeCode",
                    "tender-guarantee-required",
                ),
                sme_suitable=_txt(lot_project, "cbc:SMESuitableIndicator"),
                esubmission=_coded(
                    lot_process, "cbc:SubmissionMethodCode", "esubmission"
                ),
                lots_max_awarded=lots_max_awarded,
                exclusion_grounds=sorted(set(notice_grounds + lot_grounds)),
                selection_criteria=selection_criteria,
                qualification_text=qualification_text,
                prose_signals=signals,
                document_urls=doc_urls,
                has_documents=bool(doc_urls),
            )
        )

    return records
