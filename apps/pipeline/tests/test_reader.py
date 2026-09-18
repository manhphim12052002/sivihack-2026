"""Tests for the filename router (reader.route) and the Los-N filename hint.

Filenames are drawn from the real tracer package listing (data/tracer.md) and the
PRD's filename-router example, so expectations match documents actually seen.
"""

import unittest

from tender_extract.reader import lot_hint, route


class RouteTests(unittest.TestCase):
    def test_conditions_documents_are_read(self):
        for name in (
            "V - 212EU Teilnahmebedingungen EU.pdf",
            "V - 214.H-Besondere-Vertragsbedingungen VE402.pdf",
            "V - 211EU Aufforderung zur Abgabe eines Angebots EU_Hochbau.pdf",
            "R - 124 Eigenerklärung zur Eignung.pdf",
            "Beiblatt_212.pdf",
            "Merkblatt Baulärm.pdf",
        ):
            self.assertEqual(route(name), "READ", name)

    def test_drawings_and_quantities_are_skipped(self):
        for name in (
            "Anlage 3 Lageplan.pdf",
            "LV Wärmeversorgungsanlagen.X83",
            "LV_Wärmeversorgungsanlagen.pdf",
            "Bekanntmachung.pdf",
            "Anlage_GR.pdf",
            "__MACOSX/._file.pdf",
        ):
            self.assertEqual(route(name), "SKIP", name)

    def test_skip_wins_over_read_when_both_match(self):
        # A drawing filed under an "Anlage" folder that also mentions Vertragsbedingungen.
        self.assertEqual(route("Anlage 3 Vertragsbedingungen.pdf"), "SKIP")

    def test_non_pdf_is_skipped_even_if_the_name_matches(self):
        self.assertEqual(route("Teilnahmebedingungen.docx"), "SKIP")

    def test_unrecognised_pdf_is_other(self):
        self.assertEqual(route("R - 234 Bietergemeinschaft.pdf"), "OTHER")

    def test_route_uses_only_the_basename_for_the_read_pattern(self):
        # A path segment that happens to contain "eignung" should not force a read
        # decision by itself once a skip pattern in the same path already fires.
        self.assertEqual(route("Anlage/Eignung/Lageplan.pdf"), "SKIP")


class LotHintTests(unittest.TestCase):
    def test_los_number_in_filename(self):
        self.assertEqual(lot_hint("Los_2_Beiblatt.pdf"), "LOT-0002")
        self.assertEqual(lot_hint("Los 12 Vertragsbedingungen.pdf"), "LOT-0012")
        self.assertEqual(lot_hint("los-3-eignung.pdf"), "LOT-0003")

    def test_no_los_number_is_none(self):
        self.assertIsNone(lot_hint("Teilnahmebedingungen.pdf"))


if __name__ == "__main__":
    unittest.main()
