# Three Out of Forty — Design (SiviHack 2026, Track 2, Arctis AI)

Status: agreed in brainstorm 17.09.2026 17:15. Deadline 18.09 15:00. Pitch slot 18.09 16:00–20:00.

## Outcome

An estimator picks a company and sees which tenders of this week's batch go on the desk
and why every other one was set aside — each reason pointing at a field in the tender
documents and the company fact it was compared against. Switching company re-runs the
decision and produces a different shortlist.

## Constraints

- ~22 hours, 2 builders + 1 curator/pitcher.
- Demo runs locally on the tech-checked laptop; no hosting. Demo is shown via real
  screenshots in slides; live click-through in Q&A.
- Judges bring unseen tender/company pairs → live ingest UI is mandatory.
- Documents are German; UI is English, German quotes and terms shown verbatim.
- LLM via OpenRouter (~$400 credit). No local models.
- Storage: JSON files under `data/`. No database.

## Non-goals

- Login, hosting, perfect German, accuracy metrics, embeddings/similarity ranking.
- Adapters for every procurement portal. TED document fetching.
- Effort estimation, deadline calendar (mention as extensions only).

## Acceptance criteria

1. Load Brenner & Sohn → top-3 are Bavarian civil jobs; a rail-adjacent tender shows
   `Blocker: Referenzen …` with a German quote, document name and page.
2. Switch to Hanseatische Bau → different top-3; the road jobs are No-go with the reason
   "civil engineering as lead contractor".
3. Elektro Vogtland → a multi-lot building tender is recommended because of one fitting
   electrical lot, not the €14M total.
4. Upload an unseen tender (PDF/ZIP) and paste an unseen company → verdict with
   checklist in under ~2 minutes with visible progress.
5. Every verdict line = status + reason + evidence quote + page + company fact. No score.
6. Fields not found in the documents show as `Unknown`, never guessed.
7. Code matches what the slides say (codebase is reviewed by TAs + AI).

## Architecture: extract → decide → narrate

```
bulk export (OCDS zip, per day)            judge upload (PDF/ZIP) / notice URL
        │ filter CPV 45*, NUTS                      │
        ▼                                           ▼
   portal adapter (aumass.de full ZIP; subreport notice PDF; else metadata-only)
        │
        ▼
   PyMuPDF text + "[Seite N]" markers  (scan pages → images)
        │
        ▼
   LLM extraction → TenderFactSheet (15 fields, each {value, confidence, evidence[]})
        │  cached per tender in data/tenders/<id>/fact-sheet.json
        ▼
   Rule engine × CompanyProfile → Verdict (checklist of CriterionResult)
        │  numeric rules: deterministic, no LLM
        │  semantic rules (Referenzen, special quals, trade match): LLM per criterion,
        │  cached per (company, tender)
        ▼
   LLM narration → 2-sentence estimator summary per tender (optional, cached)
        │
        ▼
   Next.js: weekly triage view · tender briefing page · company paste/edit · ingest job
```

Why: reasons an estimator can argue with (bonus 1), depth into documents (bonus 2),
company switch re-runs in ms, AI sits only where it adds value (criterion 1.4).

## Schemas (Pydantic in `apps/api`, TS types generated from OpenAPI)

### TenderFactSheet (15 fields)

Each field: `value`, `confidence: high|medium|low|not_found`, `evidence: [{doc, page, quote_de}]`.

| # | field | type |
|---|---|---|
| 1 | trade_scope | CPV list + main LV headings + free text |
| 2 | place_of_performance | text, NUTS, geocoded lat/lon |
| 3 | estimated_value | € total; per lot |
| 4 | lots | [{id, title, cpv, value, trade}] |
| 5 | references_required | {count, kind, years_back, min_value, text} |
| 6 | eligibility_proofs | list (PQ-VOB, certificates, Umsatz, Mitarbeiter…) |
| 7 | construction_window | {start, end, duration_days} |
| 8 | guarantees | {performance_pct, warranty_pct, eur_estimate, duration} |
| 9 | penalty | {rate_pct_per_day, cap_pct} |
| 10 | self_performance_min_pct | number |
| 11 | side_offers_allowed | bool |
| 12 | consortium_allowed | bool |
| 13 | submission_deadline | date |
| 14 | special_qualifications | [rail/DB, Ex-protection, high voltage, …] |
| 15 | contractor_role | main_contractor | single_trade | unknown |

Plus provenance: source notice id, portal, documents list, docs_retrieved: bool.

### CompanyProfile

home_base (geocoded), regions, radius_km, trades (CPV-ish + text), contract_min/max €,
partner_threshold €, references_held [text], hard_exclusions [text], guarantee_capacity €,
self_perform_share_pct, earliest_start, capacity_per_week (default 3), raw_text.
Created from paste / PDF / DOCX via LLM normalizer; editable in UI.

### Verdict

`overall: Bid | Consider | NoGo`, `criteria: [CriterionResult]`, `summary_en`.
`CriterionResult = {criterion, status: Blocker|Risk|OK|Unknown, reason_en, tender_evidence, company_fact, kind: numeric|semantic}`.

## Rule engine

| criterion | kind | Blocker | Risk | OK | Unknown |
|---|---|---|---|---|---|
| region | numeric | distance > radius × 1.25 | radius < d ≤ radius×1.25 | d ≤ radius | no geocode |
| value | numeric | outside band by >25% (per lot if lots) | outside by ≤25% | in band | no value |
| guarantee | numeric | eur > guarantee_capacity | > 70% of capacity | else | no % or value |
| self-performance | numeric | min_pct > company share | within 10 pts | else | not stated |
| construction start | numeric | start < earliest_start − 30d | start < earliest_start | else | no dates |
| penalty | numeric | — | cap > 5% or rate > 0.3%/day | else | not stated |
| deadline | numeric | passed | < 10 days | else | — |
| trade match | semantic | LLM | LLM | LLM | — |
| references | semantic | LLM: cannot show comparable | partial | can show | not_found → Unknown |
| special quals | semantic | required & company lacks | — | — | none required → OK |
| contractor role | semantic | subcontractor-only co. vs main_contractor role | — | — | unknown |

Lots: if any lot passes region+trade+value, evaluate that lot; total value not a Blocker.
Overall: any Blocker → NoGo; else any Risk → Consider; else Bid.
Shortlist: Bids ordered by (fewest Risks, fewest Unknowns, |value − band midpoint|), top
`capacity_per_week`; then Considers.

## API (FastAPI, `apps/api`)

- `GET /tenders` — batch summaries (title, buyer, place, value, cpv, docs_retrieved)
- `GET /tenders/{id}` — fact sheet + documents + raw notice
- `POST /companies` — {text} | multipart PDF/DOCX → normalized CompanyProfile
- `GET/PUT /companies/{id}`
- `POST /screen` — {company_id} → [Verdict] for whole batch (cached)
- `POST /ingest` — multipart PDF/ZIP (+ optional title/buyer) or {notice_url} → job_id
- `GET /jobs/{id}` — {stage: downloading|extracting_text|extracting_facts|done|error, pct, message}

## Repo layout

```
src/tender_extract/   Python pipeline (exists): oeffentlichevergabe.de eForms export client, CPV/region
                      filter, one JSON record per lot -> data/tenders.jsonl. Grows: portal adapters,
                      pdf text, fact-sheet extraction, rule engine. See docs/tender-data-extraction.md.
apps/api/             FastAPI over the pipeline (endpoints above).
apps/web/             Next.js: / (triage) . /tenders/[id] (briefing) . /companies (paste/edit) . /ingest
data/                 tenders.jsonl, tenders/<id>/{docs/, text/, fact-sheet.json}, companies/*.json,
                      verdicts/<company>/<tender>.json, geocode-cache.json. data/cache/ is gitignored.
scripts/              curate-batch.py, extract-batch.py, generalization-test.py
docs/                 design.md (this), tender-data-extraction.md, proposals/, specifications/
```

## Batch curation (curator)

Target ~40 from two export days, CPV 45*: ~15 Bavarian civil (Brenner), ~10 northern
building ≥ €5M (Hanseatische), ~8 eastern electrical 4531x (Vogtland), ~7 decoys
(rail-adjacent civil, bridge, multi-lot building with small electrical lot, brutal Bauzeit
or penalty, Austria/outside DE, one with docs behind a wall). Prefer aumass.de (full docs).
Docs-retrieved coverage matters more than count: 20 with documents > 40 metadata-only.

## Live ingest (judges' unseen pairs)

Must: upload PDF(s)/ZIP + company paste/PDF/DOCX; progress UI; result = same briefing
page. Should (only if ahead): notice URL for oeffentlichevergabe.de + aumass.de.
Won't: TED, arbitrary portals. Unsupported → "documents not retrievable, upload them".
Action: ask Arctis on site when/how the unseen pairs are handed over.

## Robustness for arbitrary / complex / obscure tenders

- Big packages: extract per document, then merge fact sheets (LLM merge pass) — no single
  call over 300 pages.
- Scans: page has no text → render to PNG → vision call, same schema.
- Non-PDF in ZIP: .docx/.xlsx → text via python-docx/openpyxl; GAEB .x8x/.d8x (LV) →
  treat as XML/text, pull headings only; unknown → listed, skipped, shown as not read.
- Multi-lot: per-lot evaluation (see rules).
- Nothing found: `Unknown`, never fabricated; the sheet shows which docs were read.
- Bietergemeinschaft allowed + value/references Blocker → downgrade to Risk with note
  "possible via ARGE".
- Generalization test before tech check: 3–5 tenders not in the batch + 1 invented company;
  fix schema/prompt gaps found there, not on stage.

## Work split (who = TBD)

- **Pipeline**: export client, aumass adapter, pdf text, extraction, rules, FastAPI, ingest job.
- **Web**: Next.js pages, ingest progress, wiring, screenshots for slides.
- **Curation + pitch**: batch selection, decoy hunting, 3 profiles + 1 invented, README, slides, Q&A role split.

## Timeline (Europe/Berlin)

| when | pipeline | web | curation/pitch |
|---|---|---|---|
| 17.09 17:30–19:00 | scaffold, Pydantic models, OpenAPI, export download + CPV filter | Next scaffold, mock JSON, triage view | read exports, pick candidates |
| 19:00–22:00 | aumass adapter, pdf text, extraction prompt → first 5 sheets | briefing page + checklist UI on mock | finalize 40, decoys |
| 22:00–01:00 | rule engine, semantic checks, company normalizer, /screen | wire real API, company paste/edit | 3 profiles, README draft |
| 01:00–03:00 | ingest job + endpoint; batch extraction running | ingest page + progress | slides skeleton |
| 18.09 08:00–11:00 | generalization test, fixes | polish, screenshots | slides, Q&A roles |
| 11:00–13:00 | freeze code | freeze | tech check, README final |
| 13:00–14:30 | — | — | rehearsal ×3 with timer; submit by 14:30 |

## Open items

- Ask Arctis: how/when unseen pairs are delivered.
- Verify exact OpenRouter model ids for latest Claude Sonnet + Gemini 2.5 Flash.
- staatsanzeiger "Anonym als Zip" adapter only if time.
