# Tracer-bullet procedure (W3.1)

Chosen 17.09.2026 23:50 from the 14-day batch (`data/tenders.jsonl`, 3,201 lots).

| | |
|---|---|
| Notice id | `0f60a327-2519-4e0a-8bf6-eca4edeb1fde`, version `01` (eforms-de-2.1, EU threshold) |
| Lot | `LOT-0001` → lot key `oeffentlichevergabe.de\|0f60a327-2519-4e0a-8bf6-eca4edeb1fde\|01\|LOT-0001` |
| Title | Erweiterung der Berufsschule München Land mit Sporthalle, Wärmeversorgungsanlagen (VE 402) |
| Notice | https://oeffentlichevergabe.de/ui/de/notice/0f60a327-2519-4e0a-8bf6-eca4edeb1fde |
| Documents | https://plattform.aumass.de/Veroeffentlichung/av284b53-eu (aumass id `AV284B53-EU`) |
| Deadline | 2026-10-19 |
| Sibling notices | `5b35a3cd…`, `b700e721…`, `d8d7fb52…`, `358aa36b…` (same campus, other trades, 19./20.10.) |

## Why this one

- **Open until 19.10.**, so it survives the whole hack and the judging day.
- **All five prose signals fire on the notice** (Referenzen, Präqualifikation, Eigenleistung,
  Bietergemeinschaft, Umsatz): the BT-750 text is rich enough for the rules and for a model
  comparison against the documents.
- **Documents are anonymously downloadable** (aumass all-files ZIP, ADR 0004 DIRECT class) and the
  package lists the conditions documents the router is built for:
  `V - 212EU Teilnahmebedingungen EU.pdf` (3 p.), `V - 214.H-Besondere-Vertragsbedingungen VE402.pdf`
  (2 p.), `V - 211EU Aufforderung zur Abgabe eines Angebots EU_Hochbau.pdf` (5 p.),
  `R - 124 Eigenerklärung zur Eignung.pdf` (3 p.), plus a 306-page LV and a GAEB file that must be skipped.
- **Rich profile** (`eforms-de-2.1`), so every structured field the fact sheet needs is present and
  the document reading adds the four things eForms cannot express.

## Not chosen

- The Feuerwehrhaus Möglingen lot (`d62756f0…`, aumass, amended) closed on 17.09.
- No open aumass notice has more than one construction lot; lot-scope handling is covered by the
  multi-lot EU notices on other platforms instead.

## Fixture status (18.09, updated)

The aumass all-files ZIP for this notice could not be downloaded from this environment's
network (three retries, each timing out after 3 minutes; a RIB package on the same
connection did complete, so it is a slow-host issue, not a code defect — see
`plans/260917-2051-pipeline-parallel-workloads/phase-02-documents-and-enrich.md`). No
`apps/pipeline/tests/fixtures/` directory or extracted Teilnahmebedingungen text exists
yet. `tests/test_rules.py` uses real BT-750/description sentences from `data/tenders.jsonl`
instead, which needed no document fetch. Re-run
`python -m tender_extract.enrich --lot "oeffentlichevergabe.de|0f60a327-2519-4e0a-8bf6-eca4edeb1fde|01|LOT-0001"`
from a normal connection to populate the package into `data/documents/` (gitignored,
content-addressed by sha256) and, if a fixture is still wanted, save the routed PDF's
`pdftotext -layout` output under `apps/pipeline/tests/fixtures/`.
