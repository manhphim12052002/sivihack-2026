"""Behavioural tests for `parse_notice`, the pure eForms seam.

Fixtures are ten real notices under data/format-comparison/: five in the rich
eforms-de-2.1 profile (cbc:/cac: prefixes) and five in the thin eforms-sdk-0.1
profile (four of them bind UBL to ns3:/ns5:). Expected values are literals read
from the XML by hand, never recomputed from the parser.
"""

import unittest
from pathlib import Path

from tender_extract.eforms import parse_notice

FIXTURES = Path(__file__).resolve().parents[3] / "data" / "format-comparison"

RICH_REFERENCES = "005970e4-fa83-4d72-b88d-6b8acfe47c4a-01"   # eforms-de-2.1, BT-750 with slc codes
RICH_WEIGHTED = "0154f570-03d0-4766-90ab-501c3e9c9727-01"     # eforms-de-2.1, four weighted award criteria
RICH_AMENDED = "03ddf5d7-0650-411f-a1ac-d0fca9374811-01"      # eforms-de-2.1, corrects an earlier notice
THIN_NS3 = "25659566-4"                                       # eforms-sdk-0.1, ns3:/ns5: prefixes
THIN_CBC = "200ff04c-a468-4b9e-bd0f-b1b7643c3f77-1"           # eforms-sdk-0.1, cbc:/cac: prefixes


def fixture(name: str) -> bytes:
    return (FIXTURES / name / "eforms.xml").read_bytes()


def one_lot(name: str, **kwargs):
    records = parse_notice(fixture(name), **kwargs)
    assert len(records) == 1, f"{name} should yield exactly one lot, got {len(records)}"
    return records[0]


class SelectionCriteriaTests(unittest.TestCase):
    """BT-750 is the only notice-level source of the Eignungskriterien prose."""

    def test_rich_profile_reads_selection_criteria_with_codes(self):
        lot = one_lot(RICH_REFERENCES)
        by_code = {c["type"]: c["description"] for c in lot.selection_criteria}
        self.assertIn("slc-abil-ref-work", by_code)
        self.assertTrue(by_code["slc-abil-ref-work"].startswith(
            "Die Ausführung von Leistungen in den letzten 3 abgeschlossenen Geschäftsjahren"))

    def test_selection_criteria_prose_feeds_qualification_text(self):
        lot = one_lot(RICH_REFERENCES)
        self.assertTrue(any(
            t.startswith("Die Ausführung von Leistungen in den letzten 3") for t in lot.qualification_text))
        self.assertIn("referenzen", lot.prose_signals)

    def test_thin_profile_reads_uncoded_selection_criteria(self):
        lot = one_lot(THIN_CBC)
        self.assertEqual(len(lot.selection_criteria), 1)
        self.assertIsNone(lot.selection_criteria[0]["type"])
        self.assertTrue(lot.selection_criteria[0]["description"].startswith(
            "Bezug zum Formblatt: siehe Vergabeunterlagen; FB 124 oder PQ"))


class FixedFieldTests(unittest.TestCase):
    """The four other fields the PRD lists as unread or read from the wrong path."""

    def test_bt758_changed_notice_id_names_the_amended_notice(self):
        self.assertEqual(one_lot(RICH_AMENDED).changed_notice_id,
                         "7abb1e09-7c7b-4061-ae3a-d5bf690da54d-01")
        self.assertIsNone(one_lot(RICH_REFERENCES).changed_notice_id)

    def test_bt758_thin_profile_publishes_only_the_previous_version(self):
        # eforms-sdk-0.1 keeps the notice id and writes the predecessor's bare version
        # number ("3") into Change/ChangedNoticeIdentifier; normalise to "<id>-<version>"
        # so both profiles name the amended notice the same way.
        self.assertEqual(one_lot(THIN_NS3).changed_notice_id, "25659566-3")

    def test_bt13d_question_deadline_is_a_plain_date(self):
        self.assertEqual(one_lot(RICH_WEIGHTED).question_deadline, "2026-10-01")
        self.assertIsNone(one_lot(RICH_REFERENCES).question_deadline)

    def test_bt541_award_criterion_weights(self):
        lot = one_lot(RICH_WEIGHTED)
        weights = {c["name"]: c.get("weight") for c in lot.award_criteria}
        self.assertEqual(
            weights["Gesamtpreis aus Errichtung und optionalen Leistungen, insb. Wartung"], "65.0")
        self.assertEqual(sorted(weights.values()), ["10.0", "10.0", "15.0", "65.0"])

    def test_bt33_lots_max_awarded_read_from_notice_tendering_terms(self):
        # No fixture publishes BT-33; splice it into the notice-level TenderingTerms
        # (the first <cac:TenderingTerms> in the file) where the SDK dictionary puts it.
        xml = fixture(RICH_REFERENCES).decode("utf-8").replace(
            "<cac:TenderingTerms>",
            "<cac:TenderingTerms><cac:LotDistribution>"
            "<cbc:MaximumLotsAwardedNumeric>2</cbc:MaximumLotsAwardedNumeric>"
            "</cac:LotDistribution>",
            1,
        )
        self.assertEqual(parse_notice(xml.encode("utf-8"))[0].lots_max_awarded, "2")
        self.assertIsNone(one_lot(RICH_REFERENCES).lots_max_awarded)


class NormalisationTests(unittest.TestCase):
    def test_cpv_with_check_digit_normalises_to_eight_digits(self):
        # The feed publishes both "45000000" and "45000000-7"; a prefix filter must see one shape.
        xml = fixture(RICH_REFERENCES).replace(b'listName="cpv">45000000<', b'listName="cpv">45000000-7<')
        lot = parse_notice(xml)[0]
        self.assertEqual(lot.cpv_main, "45000000")
        self.assertTrue(all(len(c) == 8 and c.isdigit() for c in lot.cpv_additional))


class ThinProfileTests(unittest.TestCase):
    """eforms-sdk-0.1 notices carry a fraction of the fields; absent must stay absent."""

    def test_thin_notice_yields_one_lot_with_absent_fields(self):
        lot = one_lot(THIN_NS3)
        self.assertEqual((lot.notice_id, lot.notice_version, lot.lot_id), ("25659566", "4", "LOT-0000"))
        self.assertEqual(lot.schema_profile, "eforms-sdk-0.1")
        self.assertEqual(lot.cpv_main, "45234116")
        self.assertEqual(lot.submission_deadline, "2026-10-05")
        self.assertIsNone(lot.estimated_value)
        self.assertIsNone(lot.guarantee_required)
        self.assertIsNone(lot.lots_max_awarded)
        self.assertEqual(lot.award_criteria, [])


class NamespacePrefixTests(unittest.TestCase):
    """XPaths resolve by namespace URI, so the prefix a publisher chose is irrelevant."""

    PREFIXES = {"cbc": "ns3", "cac": "ns5", "ext": "ns2", "efac": "ns4", "efext": "ns6", "efbc": "ns7"}

    def test_ns_prefixed_copy_parses_identically_to_cbc_original(self):
        original = fixture(RICH_REFERENCES).decode("utf-8")
        rebound = original
        for old, new in self.PREFIXES.items():
            rebound = (rebound.replace(f"<{old}:", f"<{new}:")
                              .replace(f"</{old}:", f"</{new}:")
                              .replace(f"xmlns:{old}=", f"xmlns:{new}="))
        self.assertNotEqual(original, rebound)
        self.assertEqual(
            [r.as_dict() for r in parse_notice(rebound.encode("utf-8"))],
            [r.as_dict() for r in parse_notice(original.encode("utf-8"))],
        )

    def test_real_ns3_fixture_reads_the_same_fields_as_a_cbc_thin_fixture(self):
        ns3, cbc = one_lot(THIN_NS3), one_lot(THIN_CBC)
        self.assertEqual(ns3.schema_profile, cbc.schema_profile)
        for name in ("notice_id", "notice_version", "title", "cpv_main", "submission_deadline",
                     "submission_deadline_time", "procedure_type", "notice_type"):
            self.assertIsNotNone(getattr(ns3, name), name)
            self.assertIsNotNone(getattr(cbc, name), name)


if __name__ == "__main__":
    unittest.main()
