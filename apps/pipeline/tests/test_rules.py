"""Behavioural tests for `rules.extract`, the regex stage over notice prose.

Every input is a real sentence from data/tenders.jsonl (BT-750 or the lot description),
lightly trimmed. Expected values are read by a human from the German text, never computed
the way the rules compute them.
"""

import unittest

from tender_extract import rules


def by_kind(rows):
    return {r["attribute"]: r for r in rows}


class GuaranteeTests(unittest.TestCase):
    def test_percent_of_contract_value(self):
        rows = rules.extract("t) geforderte Sicherheiten  5 % der Auftragssumme netto  u) Wesentliche "
                             "Finanzierungs- und Zahlungsbedingungen")
        g = by_kind(rows)["PERFORMANCE_GUARANTEE"]
        self.assertEqual(g["state"], "KNOWN")
        self.assertEqual(g["condition"], {"percent_of_contract_value": 5.0})
        self.assertIn("5 % der Auftragssumme", g["evidence_quote"])
        self.assertEqual((g["extractor"], g["confidence"], g["locator"], g["kind"]),
                         ("rule", "medium", "xpath:BT-750", "requirement"))

    def test_german_word_and_vh_percent_forms(self):
        self.assertEqual(
            by_kind(rules.extract("Sicherheit für die Vertragserfüllung: zehn Prozent der Auftragssumme."))
            ["PERFORMANCE_GUARANTEE"]["condition"]["percent_of_contract_value"], 10.0)
        self.assertEqual(
            by_kind(rules.extract("Sicherheitsleistung 5 v.H. der Auftragssumme."))
            ["PERFORMANCE_GUARANTEE"]["condition"]["percent_of_contract_value"], 5.0)

    def test_deferred_to_documents(self):
        rows = rules.extract("t) geforderte Sicherheiten  Siehe Vergabeunterlagen.  u) Wesentliche "
                             "Finanzierungs- und Zahlungsbedingungen")
        g = by_kind(rows)["PERFORMANCE_GUARANTEE"]
        self.assertEqual(g["state"], "REFERRED_TO_DOCUMENTS")
        self.assertIsNone(g["condition"])


class PenaltyTests(unittest.TestCase):
    def test_rate_and_cap(self):
        rows = rules.extract(
            "Vertragsstrafe: 0,2% der Auftragssumme bei Überschreitung der Ausführungsfrist; bei "
            "Einzelfristen je 0,2% der Auftragssumme. Die Vertragsstrafe wird auf insgesamt 5% der "
            "Auftragssumme begrenzt. u) Finanzierungs- und Zahlungsbedingungen")
        p = by_kind(rows)["PENALTY_CLAUSE"]
        self.assertEqual(p["condition"], {"percent_per_day": 0.2, "cap_percent": 5.0})

    def test_rate_without_cap(self):
        p = by_kind(rules.extract("t) geforderte Sicherheiten  Vertragsstrafe 0,3%  u) Wesentliche"))["PENALTY_CLAUSE"]
        self.assertEqual(p["condition"], {"percent_per_day": 0.3, "cap_percent": None})


class SelfPerformanceTests(unittest.TestCase):
    def test_minimum_share_in_own_business(self):
        s = by_kind(rules.extract("Es müssen mindestens 60 % der Leistungen im eigenen Betrieb erbracht werden."))
        self.assertEqual(s["SELF_PERFORMANCE_MINIMUM"]["condition"], {"percent": 60.0})

    def test_subcontractor_share_threshold_is_not_self_performance(self):
        rows = rules.extract("mit mehr als zehn Prozent, gemessen am Auftragswert, beteiligte "
                             "Unterauftragnehmer, Lieferanten oder Leistungserbringer")
        self.assertNotIn("SELF_PERFORMANCE_MINIMUM", by_kind(rows))


class ReferencesTests(unittest.TestCase):
    def test_count_and_lookback(self):
        rows = rules.extract("Referenzen der ausführenden Niederlassung und des vorgesehenen Projektteams: "
                             "Mindestens 3 Referenzprojekte mit schriftlicher Bestätigung des AG aus den "
                             "letzten 5 Jahren, Mindestvolumen 2 Mio EUR")
        r = by_kind(rows)["COMPARABLE_REFERENCES"]
        self.assertEqual(r["condition"]["minimum_count"], 3)
        self.assertEqual(r["condition"]["lookback_years"], 5)

    def test_reference_mention_without_numbers_yields_nothing(self):
        rows = rules.extract("Referenznachweise mit den im Formblatt Eigenerklärung zur Eignung genannten "
                             "Angaben - Erklärung zur Zahl der in den letzten 3 Jahren jahresdurchschnittlich "
                             "beschäftigten Arbeitskräfte")
        self.assertNotIn("COMPARABLE_REFERENCES", by_kind(rows))


class ConstructionWindowTests(unittest.TestCase):
    def test_begin_and_end_dates(self):
        rows = rules.extract("g) Liefer-/Ausführungsfrist:  Beginn: 08.03.2027 Ende: 15.10.2027 Einzelfristen "
                             "siehe Vertragsbedingungen Bauleistungen  h) Sicherheiten")
        self.assertEqual(by_kind(rows)["CONSTRUCTION_WINDOW"]["condition"],
                         {"start": "2027-03-08", "end": "2027-10-15"})


class EmptyInputTests(unittest.TestCase):
    def test_no_prose_no_rows(self):
        self.assertEqual(rules.extract(""), [])
        self.assertEqual(rules.extract("Los 1: Rohbauarbeiten"), [])


class FactSheetBridgeTests(unittest.TestCase):
    """Every requirement row is mirrored under the fact sheet's own attribute name."""

    def test_guarantee_percent_also_lands_as_a_guarantees_fact(self):
        rows = rules.extract("t) geforderte Sicherheiten  5 % der Auftragssumme netto  u) Wesentliche")
        fact = by_kind(rows)["guarantees"]
        self.assertEqual(fact["kind"], "fact")
        self.assertEqual(fact["state"], "KNOWN")
        self.assertEqual(fact["value_num"], 5.0)
        self.assertEqual(fact["condition"], {"percent_of_contract_value": 5.0})
        # The requirement row under its own kind name is still present, unchanged.
        self.assertIn("PERFORMANCE_GUARANTEE", by_kind(rows))

    def test_referred_to_documents_state_carries_through_to_the_fact(self):
        rows = rules.extract("t) geforderte Sicherheiten  Siehe Vergabeunterlagen.  u) Wesentliche")
        self.assertEqual(by_kind(rows)["guarantees"]["state"], "REFERRED_TO_DOCUMENTS")

    def test_construction_window_fact_uses_a_formatted_text_value(self):
        rows = rules.extract("g) Liefer-/Ausführungsfrist:  Beginn: 08.03.2027 Ende: 15.10.2027")
        fact = by_kind(rows)["construction_window"]
        self.assertIsNone(fact["value_num"])
        self.assertEqual(fact["value_text"], "2027-03-08 … 2027-10-15")

    def test_custom_locator_overrides_the_bt750_default(self):
        rows = rules.extract("Vertragsstrafe 0,3% der Auftragssumme.", locator="notice:description")
        self.assertEqual(by_kind(rows)["PENALTY_CLAUSE"]["locator"], "notice:description")
        self.assertEqual(by_kind(rows)["penalty"]["locator"], "notice:description")


if __name__ == "__main__":
    unittest.main()
