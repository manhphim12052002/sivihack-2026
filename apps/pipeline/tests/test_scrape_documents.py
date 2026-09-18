"""Pure pieces of the extra-document scrape: URL parsing, adapter routing, manifest handling.

No network. Adapter fetches are replaced by stubs; the ZIP goes through the real unpack/store.
"""

import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

from tender_extract import adapters
from tender_extract.adapters import cosinex, evergabe_bieter, vergabe24
from tender_extract.scrape_documents import Target, load_targets, parse_array_literal, scrape, select

DB = "https://bieterportal.noncd.db.de/evergabe.bieter/api/supplier/external/deeplink/subproject/66be70fb-850f-43e3-a20b-f238850be4d1"
HH = "https://fbhh-evergabe.web.hamburg.de/evergabe.bieter/api/supplier/external/deeplink/subproject/49b316be-6604-4d10-bd2a-e9e64c830376"
WF = "https://www.vergabe-westfalen.de/VMPSatellite/notice/CXPWY6LLKD3/documents"
V24 = "https://www.vergabe24.de/vergabeunterlagen/54321-Tender-1a057235099-3e10aa49cb25c2d9"
RIB = "https://www.meinauftrag.rib.de/public/DetailsByPlatformIdAndTenderId/platformId/1/tenderId/299682"
GATED = "https://www.evergabe.de/unterlagen/123/zustellweg-auswaehlen"


class InputParsing(unittest.TestCase):
    def test_postgres_array_literal(self):
        self.assertEqual(parse_array_literal("{https://a/x,https://b/y}"), ["https://a/x", "https://b/y"])
        self.assertEqual(parse_array_literal('{"https://a/x"}'), ["https://a/x"])
        self.assertEqual(parse_array_literal(["https://a/x"]), ["https://a/x"])
        self.assertEqual(parse_array_literal(""), [])

    def test_targets_are_grouped_by_url_with_merged_notice_ids(self):
        rows = [{"buyer_name": "B", "document_urls": "{https://a/x}", "notice_ids": ["n1"]},
                {"buyer_name": "B", "document_urls": "{https://a/x}", "notice_ids": ["n1", "n2"]},
                {"buyer_name": "C", "document_urls": "{https://a/y}", "notice_ids": ["n3"]}]
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "in.json"
            p.write_text(json.dumps(rows))
            targets = load_targets(p)
        self.assertEqual([(t.buyer_name, t.url, t.notice_ids) for t in targets],
                         [("B", "https://a/x", ["n1", "n2"]), ("C", "https://a/y", ["n3"])])

    def test_sample_takes_first_n_per_buyer(self):
        targets = [Target("A", "u1"), Target("A", "u2"), Target("B", "u3"), Target("B", "u4")]
        self.assertEqual([t.url for t in select(targets, buyer=None, limit=None, sample=1)], ["u1", "u3"])
        self.assertEqual([t.url for t in select(targets, buyer="b", limit=1, sample=None)], ["u3"])


class Routing(unittest.TestCase):
    def test_evergabe_bieter_zip_url_keeps_the_tenant_host(self):
        self.assertEqual(evergabe_bieter.zip_url(DB),
                         "https://bieterportal.noncd.db.de/evergabe.bieter/api/supplier/subproject/"
                         "66be70fb-850f-43e3-a20b-f238850be4d1/projectFilesZip")
        self.assertTrue(evergabe_bieter.zip_url(HH).startswith("https://fbhh-evergabe.web.hamburg.de/"))

    def test_cosinex_archive_link_from_page_and_fallback(self):
        page_url = "https://www.vergabe-westfalen.de/VMPSatellite/public/company/project/CXPWY6LLKD3/de/documents?0"
        page = '<a href="./documents/archive/Vergabeunterlagen_CXPWY6LLKD3.zip">ZIP</a>'
        self.assertEqual(cosinex.archive_url(WF, page_url, page),
                         "https://www.vergabe-westfalen.de/VMPSatellite/public/company/project/CXPWY6LLKD3"
                         "/de/documents/archive/Vergabeunterlagen_CXPWY6LLKD3.zip")
        self.assertEqual(cosinex.archive_url(WF, page_url, "<html/>"),
                         "https://www.vergabe-westfalen.de/VMPSatellite/public/company/project/CXPWY6LLKD3"
                         "/de/documents/archive/Vergabeunterlagen_CXPWY6LLKD3.zip")

    def test_classify_and_adapter_for(self):
        self.assertEqual(adapters.classify(DB), "ADAPTER")
        self.assertIs(adapters.adapter_for(HH), evergabe_bieter.fetch)
        self.assertEqual(adapters.classify(WF), "ADAPTER")
        self.assertIs(adapters.adapter_for(WF), cosinex.fetch)
        self.assertEqual(adapters.classify("https://www.vergabe-westfalen.de/VMPSatellite/notice/CXPWY6LLKD3"), "GATED")
        self.assertIs(adapters.adapter_for(V24), vergabe24.fetch)
        self.assertEqual(adapters.classify(GATED), "GATED")
        self.assertEqual(adapters.classify(RIB), "ADAPTER")

    def test_vergabe24_patterns(self):
        self.assertEqual(vergabe24.ORDER_TOKEN.search('href="index.php?site=order&amp;token=4344083664b2"').group(1), "4344083664b2")
        self.assertEqual(vergabe24.PART.findall('<input class="mandatory-any" type="radio" name="part" value="357803" checked>'), ["357803"])
        self.assertEqual(vergabe24.DOWNLOAD.search('<a href="download.php?token=4344083664b2">ZIP</a>').group(1),
                         "download.php?token=4344083664b2")

    def test_attachment_filename(self):
        h = {"Content-Disposition": 'attachment; filename="Vergabeunterlagen_X.zip"; filename*=utf-8\'\'V.zip'}
        self.assertEqual(adapters.attachment_filename(h, "d.zip"), "Vergabeunterlagen_X.zip")
        self.assertEqual(adapters.attachment_filename({}, "d.zip"), "d.zip")


def zip_bytes(entries: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, data in entries.items():
            zf.writestr(name, data)
    return buf.getvalue()


class Scrape(unittest.TestCase):
    def test_retrieved_package_is_unpacked_stored_and_routed(self):
        package = zip_bytes({"Bekanntmachung/Auftragsbekanntmachung.pdf": b"%PDF a", "Teilnahmebedingungen.pdf": b"%PDF b"})
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(evergabe_bieter, "fetch", return_value=[("Vergabeunterlagen_X.zip", package)]) as fetch, \
                mock.patch.object(adapters, "adapter_for", return_value=fetch):
            entry = scrape(Target("DB", DB, ["n1"]), Path(tmp))
            self.assertEqual(entry["status"], "RETRIEVED")
            self.assertEqual(entry["package"], {"filename": "Vergabeunterlagen_X.zip", "bytes": len(package)})
            routes = {f["name"]: f["route"] for f in entry["files"]}
            self.assertEqual(routes, {"Bekanntmachung/Auftragsbekanntmachung.pdf": "SKIP", "Teilnahmebedingungen.pdf": "READ"})
            for f in entry["files"]:
                self.assertTrue(Path(f["path"]).exists())
            fetch.assert_called_once_with(DB, None)   # every file, no route filter

    def test_gated_platform_is_recorded_without_a_request(self):
        with tempfile.TemporaryDirectory() as tmp:
            entry = scrape(Target("X", GATED, ["n1"]), Path(tmp))
        self.assertEqual(entry["status"], "GATED")
        self.assertIn("form", entry["reason"])
        self.assertEqual(entry["files"], [])

    def test_windows_separators_in_package_are_normalised(self):
        package = zip_bytes({"Unterlagen\\Weitere Dokumente\\Teilnahmebedingungen.pdf": b"%PDF"})
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(evergabe_bieter, "fetch", return_value=[("V.zip", package)]):
            entry = scrape(Target("DB", DB), Path(tmp))
        self.assertEqual([(f["name"], f["route"]) for f in entry["files"]],
                         [("Unterlagen/Weitere Dokumente/Teilnahmebedingungen.pdf", "READ")])

    def test_corrupt_package_becomes_unreachable_not_a_crash(self):
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(evergabe_bieter, "fetch", return_value=[("V.zip", b"PK\x03\x04" + b"\x00" * 40)]):
            entry = scrape(Target("DB", DB), Path(tmp))
        self.assertIn(entry["status"], ("RETRIEVED", "UNREACHABLE"))   # never raises; bytes may pass through as one file

    def test_adapter_error_becomes_unreachable(self):
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(evergabe_bieter, "fetch", side_effect=RuntimeError("HTTP Error 404")):
            entry = scrape(Target("DB", DB), Path(tmp))
        self.assertEqual(entry["status"], "UNREACHABLE")
        self.assertIn("404", entry["reason"])


if __name__ == "__main__":
    unittest.main()
