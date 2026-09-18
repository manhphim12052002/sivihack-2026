"""Behavioural tests for `llm.gate`, the evidence check every model item must pass.

An item survives only if its `chunk_id` names a page of the document being read AND its
quote is a whitespace-normalised substring of that page. Everything else is rejected and
counted, so the demo can show how many model items the gate threw away.
"""

import unittest

from tender_extract import llm

PAGES = {
    "doc:abc#p1": "8. Sicherheiten\nDer Auftragnehmer   hat eine Vertragserfüllungsbürgschaft in Höhe von\n"
                  "5 % der Auftragssumme zu stellen.",
    "doc:abc#p2": "Nachunternehmer dürfen nur mit Zustimmung des Auftraggebers eingesetzt werden.",
}


def item(quote, chunk_id="doc:abc#p1", **extra):
    return {"kind": "PERFORMANCE_GUARANTEE", "condition": {"percent_of_contract_value": 5},
            "scope": {"type": "PROCEDURE"}, "evidence": [{"chunk_id": chunk_id, "quote": quote}], **extra}


class EvidenceGateTests(unittest.TestCase):
    def test_exact_quote_passes(self):
        kept, rejected = llm.gate([item("5 % der Auftragssumme zu stellen")], PAGES)
        self.assertEqual((len(kept), rejected), (1, 0))

    def test_whitespace_differences_are_ignored(self):
        kept, rejected = llm.gate([item("Der Auftragnehmer hat eine Vertragserfüllungsbürgschaft in Höhe von 5 %")], PAGES)
        self.assertEqual((len(kept), rejected), (1, 0))

    def test_fabricated_quote_is_rejected_and_counted(self):
        kept, rejected = llm.gate([item("Sicherheit in Höhe von 10 % der Auftragssumme")], PAGES)
        self.assertEqual((kept, rejected), ([], 1))

    def test_unknown_chunk_id_is_rejected(self):
        kept, rejected = llm.gate([item("5 % der Auftragssumme", chunk_id="doc:abc#p9")], PAGES)
        self.assertEqual((kept, rejected), ([], 1))

    def test_item_with_no_evidence_is_rejected(self):
        bad = item("x"); bad["evidence"] = []
        self.assertEqual(llm.gate([bad], PAGES), ([], 1))

    def test_partially_valid_evidence_keeps_item_with_only_the_valid_pointers(self):
        two = item("5 % der Auftragssumme")
        two["evidence"].append({"chunk_id": "doc:abc#p2", "quote": "nicht im Text"})
        kept, rejected = llm.gate([two], PAGES)
        self.assertEqual(rejected, 0)
        self.assertEqual([e["chunk_id"] for e in kept[0]["evidence"]], ["doc:abc#p1"])


if __name__ == "__main__":
    unittest.main()
