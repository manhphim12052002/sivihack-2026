"""Tests for the GAEB X83 reader: positions, quantities, German text, chunk addressing."""

import tempfile
import unittest
from pathlib import Path

from tender_extract import gaeb

SAMPLE = """<?xml version="1.0" encoding="UTF-8"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.2">
 <Award><AddText><OutlineAddText><p>DIN 18299</p></OutlineAddText>
  <DetailAddText><p><span style="x">0.1 Angaben zur Baustelle</span></p><p>Bauherr: Gemeinde Anr&#246;chte</p></DetailAddText>
 </AddText></Award>
 <BoQ><BoQInfo><LblBoQ>3027-ALUt&#252;ren</LblBoQ></BoQInfo>
  <BoQBody>
   <Remark><Description><CompleteText><DetailTxt><Text><p><span>ZTV Alu-04 Brandschutz</span></p>
     <p>Die Brandschutzkonstruktionen sind zulassungspflichtige Bauteile.</p></Text></DetailTxt></CompleteText></Description></Remark>
   <BoQCtgy RNoPart="01"><BoQBody><Itemlist>
     <Item RNoPart="02"><Qty>2.000</Qty><QU>Stck</QU><Description>
       <CompleteText><DetailTxt><Text><p>Au&#223;ent&#252;relement in Aluminiumbauweise,</p><p>Ma&#223;e: ca. B/H = 2,26 / 2,51 m</p></Text></DetailTxt>
       <OutlineText><OutlTxt><TextOutlTxt><p><span>-AT-02-2,26x2,51-1125 n.a.PA</span></p></TextOutlTxt></OutlTxt></OutlineText></CompleteText>
     </Description></Item>
   </Itemlist></BoQBody></BoQCtgy>
  </BoQBody></BoQ>
</GAEB>"""


class GaebTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile("w", suffix=".x83", delete=False, encoding="utf-8")
        self.tmp.write(SAMPLE)
        self.tmp.close()
        self.boq = gaeb.parse(Path(self.tmp.name))

    def test_positions_carry_number_quantity_and_german_text(self):
        self.assertEqual(self.boq.label, "3027-ALUtüren")
        self.assertEqual(len(self.boq.positions), 1)
        pos = self.boq.positions[0]
        self.assertEqual((pos.number, pos.quantity, pos.unit), ("01.02", 2.0, "Stck"))
        self.assertEqual(pos.short_text, "AT-02-2,26x2,51-1125 n.a.PA")
        self.assertIn("Außentürelement in Aluminiumbauweise,", pos.long_text)
        self.assertIn("Maße: ca. B/H = 2,26 / 2,51 m", pos.long_text)
        self.assertNotIn("AT-02", pos.long_text)   # the short text is not repeated in the long text

    def test_remarks_and_site_information_are_plain_text(self):
        self.assertEqual(len(self.boq.remarks), 1)
        self.assertIn("zulassungspflichtige Bauteile", self.boq.remarks[0])
        self.assertTrue(self.boq.site_information.startswith("0.1 Angaben zur Baustelle"))
        self.assertNotIn("<", self.boq.remarks[0] + self.boq.site_information)

    def test_chunks_are_addressable_by_position_and_block(self):
        rows = gaeb.chunks(self.boq, "doc:abc")
        ids = [r["id"] for r in rows]
        self.assertEqual(ids, ["doc:abc#pos01.02", "doc:abc#ztv1.1", "doc:abc#din1"])
        self.assertEqual(rows[0]["section"], "Pos. 01.02")
        self.assertIn("Menge: 2 Stck", rows[0]["text"])
        self.assertTrue(all(r["page"] is None and r["source_id"] == "doc:abc" for r in rows))

    def test_split_paragraphs_respects_limit_at_blank_lines(self):
        text = "\n\n".join(f"Absatz {i} " + "x" * 100 for i in range(10))
        parts = gaeb.split_paragraphs(text, max_chars=250)
        self.assertGreater(len(parts), 3)
        self.assertTrue(all(len(p) <= 250 for p in parts))
        self.assertEqual("\n\n".join(parts), text)

    def test_non_gaeb_xml_is_rejected(self):
        other = Path(self.tmp.name).with_suffix(".xml")
        other.write_text("<root/>", encoding="utf-8")
        with self.assertRaises(ValueError):
            gaeb.parse(other)


if __name__ == "__main__":
    unittest.main()
