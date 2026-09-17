---
title: "Tender ingestion pipeline and data layer"
description: "Ingest German public construction tenders into a lot-grained golden store with per-attribute provenance, serving the screening API the web app is coded against"
status: ready
priority: P1
effort: "8h"
tags: [sivihack, track-2, backend, ingestion, data-layer]
created: 2026-09-17
owner: backend builder
counterpart: docs/design.md (frontend, separate owner)
---
> Storage superseded by docs/adr/0005-supabase-postgres-over-sqlite.md (Supabase Postgres, 17.09).

# Tender ingestion pipeline and data layer

## Problem Statement

An estimator at a 140-person civil engineering firm in Augsburg opens forty new public tenders
every Monday and can bid on three. They decide by opening each one and skimming until something
disqualifies it, or until Monday is over. Two weeks later the estimating team has priced a job
the company was never eligible for, because the requirement — *three comparable rail-side
projects in the last five years* — was in the third attachment.

The decision is made on a title, a place and a rough value, because reading everything is not
physically possible. Two failure modes, both expensive: chasing a tender that was never winnable,
and never seeing the one that fit.

What makes this a data problem rather than a ranking problem: **the facts that disqualify a bid
are mostly not in the public notice.** Measured across 3,201 construction lots from 14 days of
the German federal notice service:

| fact an estimator screens on | present in notice metadata |
|---|---|
| CPV / trade | 100% |
| Place (NUTS) | 92% |
| Submission deadline | 94% |
| Qualification criteria prose | 42% overall — **1%** on the sub-threshold feed |
| Construction window | 36% overall — **0%** on the sub-threshold feed |
| Guarantee required | 23% overall — **0%** on the sub-threshold feed |
| Estimated contract value | **4.9%** overall — **0%** on the sub-threshold feed |
| Self-performance share (Eigenleistung) | **no field exists in the schema** |
| Penalty clause (Vertragsstrafe) | **no field exists in the schema** |

The sub-threshold feed is 56% of all lots, and it is precisely the €400k–€4M municipal work a
regional contractor bids on. So a screening system built on notice metadata alone is blind on
exactly the tenders its user cares about, and it cannot tell the difference between "this tender
has no guarantee requirement" and "nobody published the guarantee requirement."

## Solution

A data layer that ingests tenders continuously, records every extracted fact **with the evidence
it came from**, and treats *unknown* as a real answer rather than a silent zero.

From the estimator's perspective:

- Monday's batch is already loaded — no waiting for a download, because new notices are picked
  up within minutes of publication rather than the next day.
- Each tender has a fact sheet of the fifteen things they screen on. Every field says how sure
  the system is and shows the German sentence it was read from, with the document name and page.
- Where the tender documents were readable, the facts that actually kill bids — references,
  guarantees, penalties, self-performance minimums — are extracted from them, not guessed from
  the title.
- Where the documents sit behind a registration wall, the tender says so plainly and names what
  could not be checked, instead of quietly scoring it as fine.
- A field the documents did not mention reads `Unknown`. It never reads `0` and never reads `OK`.
- Picking a different company re-runs the decision against that company's own constraints, so a
  road builder in Bavaria and a general contractor in Hamburg get different shortlists.
- A tender nobody has seen before can be pasted in and appears on the same briefing page within
  a minute.

## User Stories

**Acquiring notices**

1. As an estimator, I want this week's construction tenders already in the system on Monday morning, so that I spend my time reviewing rather than downloading.
2. As an estimator, I want a tender published an hour ago to be available now, so that I am not always working a day behind the market.
3. As a backend builder, I want ingestion to pick up only what changed since the last run, so that a poll costs one request instead of a full re-download.
4. As a backend builder, I want the bulk day/month export retained as a backfill path, so that history can be loaded and so that ingestion still works if the live index changes shape.
5. As a backend builder, I want only construction tenders ingested (CPV prefix 45), so that the store is not diluted by the ~95% of notices that are irrelevant.
6. As a backend builder, I want the source and schema profile recorded on every record, so that a second source can be added later without rewriting what exists.
7. As a curator, I want ingestion to be resumable, so that an interrupted run can continue instead of starting over.
8. As a backend builder, I want polling to be gentle and identify itself, so that we are not abusing a public body's search service.

**Identity, versions and grain**

9. As an estimator, I want a tender split into lots to be screened per lot, so that one €700k lot inside a €14M tender is not hidden behind the total.
10. As an estimator, I want the triage list to show one row per tender with its lots summarised, so that I am not reading the same buyer eight times.
11. As an estimator, I want a corrected notice to replace the original in my list, so that I never work from a superseded deadline.
12. As an estimator, I want to see that a tender was amended, so that I know to re-check what changed.
13. As a backend builder, I want every notice version kept rather than overwritten, so that amendment history is available and re-ingestion is non-destructive.
14. As a backend builder, I want procedure lineage identifiers stored where published, so that notices belonging to one procedure can be linked later.

**Facts and provenance**

15. As an estimator, I want each fact to show the German sentence it came from, so that I can judge whether the system read it correctly.
16. As an estimator, I want the document name and page next to each quote, so that I can open the source and check it myself.
17. As an estimator, I want to know whether a fact came from the structured notice or from a model reading a PDF, so that I know how much to trust it.
18. As an estimator, I want a fact the documents never mentioned to read `Unknown`, so that I am never told a requirement is absent when it simply was not published.
19. As an estimator, I want to see when the notice and the contract documents disagree, so that I can act on the discrepancy rather than have it averaged away.
20. As a backend builder, I want competing values for one attribute stored side by side with a fixed precedence, so that re-running extraction never destroys a better earlier answer.
21. As a backend builder, I want re-running extraction to be idempotent per attribute and extractor, so that I can iterate on the rules at 2am without rebuilding the store.
22. As a web builder, I want each fact to carry a coarse confidence level, so that the UI can render it without knowing anything about extractors.

**Documents**

23. As an estimator, I want the facts that actually kill bids read out of the tender documents, so that I am not screening on the title.
24. As an estimator, I want to be told when documents could not be retrieved and which criteria therefore could not be checked, so that I can decide whether to open the portal myself.
25. As an estimator, I want a tender whose documents require registration to say so and name the platform, so that the gap is attributable rather than mysterious.
26. As a backend builder, I want documents fetched only for tenders that survive the cheap checks and still have unknowns, so that we download a handful per company per week instead of thousands.
27. As a backend builder, I want the conditions documents read and the drawing bundles skipped, so that we process 5KB of relevant German text rather than 11MB of floor plans.
28. As a backend builder, I want documents stored content-addressed, so that re-runs never re-download and identical files are stored once.
29. As a backend builder, I want a scanned PDF with no text layer to be marked as such, so that it reads `Unknown` rather than silently contributing nothing.
30. As a backend builder, I want the document fetcher to be one interface with per-platform adapters, so that adding a platform later is additive.

**Company profiles**

31. As a bid manager, I want my company's constraints held as explicit numbers and lists, so that a decision about my company is made on my actual limits.
32. As a bid manager, I want to paste our company description as prose and have it normalised into those fields, so that I do not fill in a form.
33. As a bid manager, I want to correct the normalised profile before it is used, so that a misread limit does not drive a wrong shortlist.
34. As a bid manager, I want my free-text notes preserved alongside the typed fields, so that the parts of our situation that do not fit a schema are not lost.
35. As a judge, I want to hand over a company profile the team has never seen and get a working shortlist, so that I can check the system generalises.

**Screening and reasons**

36. As an estimator, I want each criterion to come back as Blocker, Risk, OK or Unknown, so that I can tell a hard no from a maybe from a gap.
37. As an estimator, I want the reason stated as a comparison between a tender fact and a company fact, so that I can disagree with it.
38. As an estimator, I want no similarity score anywhere, so that I am never asked to trust a number I cannot audit.
39. As an estimator, I want the shortlist ordered by how much is wrong and how much is unknown, so that the clearest opportunities come first.
40. As an estimator, I want the same tender to be a yes for one of our companies and a no for another, so that I can see the system is deciding rather than matching text.
41. As an estimator, I want reasons written in English with the German term kept in parentheses and the German quote verbatim, so that the output is usable by my colleagues who work in German.
42. As a judge, I want the verdict to be reproducible from the stored facts, so that the same inputs give the same answer twice.
43. As a curator, I want the decision logic to keep working when the network is down, so that the demo does not depend on the venue wifi.

**Live ingestion**

44. As an estimator, I want to paste the URL of a tender I heard about and have it screened, so that I am not limited to what the batch found.
45. As an estimator, I want visible progress while a tender is being ingested, so that I know it is working rather than hung.
46. As an estimator, I want a newly ingested tender to open on the same briefing page as the batch ones, so that there is nothing special about it.
47. As a judge, I want an unseen tender ingested in front of me, so that I can confirm the pipeline is real and not a fixture.

**Serving the app**

48. As a web builder, I want one HTTP contract published as OpenAPI, so that I can regenerate my types instead of hand-writing shapes.
49. As a web builder, I want a health endpoint, so that the UI can show an honest offline state.
50. As a web builder, I want field names and enums to match what my components already render, so that wiring the real backend is a swap rather than a rewrite.
51. As a curator, I want the store to ship as a single file in the repo, so that a reviewer can clone and run the demo without network access.
52. As a technical assistant reviewing the code, I want the stored data to match what the slides claim, so that the demo is verifiable against the codebase.

## Implementation Decisions

### Source and acquisition

- **oeffentlichevergabe.de only.** TED is above-threshold, largely a subset of the same publisher's rich feed, and would add a second schema for little gain. service.bund.de is described by the publisher as largely covered. `source` and `source_format` columns keep a second source additive.
- **Primary acquisition is the lot-grained search index**, an undocumented endpoint discovered by reading the site's own client bundle. It is keyless and near-real-time (verified returning a notice published 40 minutes earlier), unlike the documented bulk export which is explicitly T+1 and therefore unusable as an event source.
- Query language, envelope shape confirmed live:

```json
{"SELECT":"ALL","FROM":"lots",
 "WHERE":[{"fields":["allCpvCodes"],"operator":"STARTS_WITH","operands":["45"]},
          {"fields":["publicationDate"],"operator":">=","operands":["2026-09-17T12:00:00Z"]}],
 "PAGE":{"number":0,"size":100},
 "ORDER":{"field":"publicationDate","direction":"DESC"}}
```

- Operators available: `IN`, `STARTS_WITH`, `=`, `>=`, `<`, `<=`, `RANGE_DAYS`. Filterable fields include `allCpvCodes`, `allPlacesOfPerformanceNutsCodes`, `allDeadlines`, `firstDeadline`, `estimatedValue`, `publicationDate`, `noticeType`, `procedureType`, `buyers.name`, `contractingPlatform`, `active`, `allFreeText`.
- **Watermark polling, two-phase.** Poll with `publicationDate >= last_seen_at`, diff the returned stubs against the store on `(notice_id, notice_version, lot_id)`, then fetch full records only for deltas. Results are 13-field stubs with no deadline, value or eligibility, so the full record must be fetched separately.
- Constraints to respect: `active` requires a JSON boolean not a string; bare dates parse differently from timestamps so always send ISO timestamps; **hard ceiling of 10,000 results per query**, so deeper history must be windowed by date. Poll interval 5 minutes (publication rate is ~90 construction lots/day), single-threaded, polite identifying User-Agent.
- **Per-notice fetch** for full records and for the live path: the single-notice endpoint accepts a format parameter (`eforms` default, `ocds` available, `csv` returns 406). Undocumented but stable in behaviour.
- The documented bulk day/month export is demoted to a `backfill` command for history and as a fallback if the search index changes.
- **eForms is the ingestion format.** It is the publisher's original submission format — all others are conversions of it — and it is the only one carrying the submission deadline and eligibility prose. OCDS remains available per-notice if amendment history is wanted later.

### Schema profiles

Three profiles appear in the feed, distinguished only by `CustomizationID`: `eforms-de-2.1`
(rich, EU threshold, 1,408 of 3,201 lots), `eforms-sdk-0.1` (thin, national sub-threshold, 1,781
lots), `eforms-sdk-1.0` (12 lots). The thin profile has **no machine-readable field dictionary
published** — the EU SDK at that version ships XSDs and Schematrons only — so its handling is
derived from instances. The rich profile is fully specified: 1,260 declared fields with absolute
XPaths, 360 business terms, types and code lists.

**Namespace prefixes are not stable across the feed** — four of ten sampled notices bind the UBL
namespaces to `ns3:`/`ns5:` rather than `cbc:`/`cac:`. All XPath resolution must be
namespace-URI-aware; prefix string matching is forbidden.

### Storage

**SQLite, single file, committed in seeded form.** Chosen because it ships inside the repo so a
reviewer can run the demo with no network, needs no ops, gives FTS5 for German text and JSON1
for the sparse tail, and supports the write-on-hot-path that live ingestion needs. DuckDB is
analytics-shaped with weak concurrent writes; Postgres is ops we cannot afford; flat files cannot
express "latest version per lot" as a view.

**Grain is the lot** — the lot is the biddable atom, and a €14M tender may contain one €700k lot
that fits. Every notice version is stored rather than overwritten; the application reads a
latest-version view.

```sql
-- identity: one row per lot per notice version
CREATE TABLE lot (
  source TEXT NOT NULL, notice_id TEXT NOT NULL, notice_version TEXT NOT NULL,
  lot_id TEXT NOT NULL,
  source_format TEXT, schema_profile TEXT,
  procedure_id TEXT, ocid TEXT, changed_notice_id TEXT,   -- lineage, nullable
  notice_type TEXT, published TEXT, notice_url TEXT,
  title TEXT, description TEXT, buyer_name TEXT,
  place_city TEXT, place_nuts TEXT,
  cpv_main TEXT, cpv_additional TEXT,                      -- JSON array
  submission_deadline TEXT, estimated_value REAL, estimated_value_currency TEXT,
  extra JSON,
  ingested_at TEXT NOT NULL,
  PRIMARY KEY (source, notice_id, notice_version, lot_id)
);

-- every extracted fact, with the evidence it came from
CREATE TABLE claim (
  lot_key TEXT NOT NULL,            -- the four identity columns joined
  attribute TEXT NOT NULL,          -- one of the 15 fact-sheet fields
  value_text TEXT, value_num REAL, unit TEXT,
  evidence_quote TEXT,              -- verbatim German, never translated
  locator TEXT,                     -- 'xpath:BT-750' or 'Bedingungen.pdf#p.2'
  extractor TEXT NOT NULL,          -- xpath | rule | llm_doc | llm_notice
  confidence TEXT NOT NULL,         -- high | medium | low | not_found
  conflict INTEGER NOT NULL DEFAULT 0,
  extracted_at TEXT NOT NULL,
  PRIMARY KEY (lot_key, attribute, extractor)   -- makes re-extraction idempotent
);

CREATE TABLE document (
  lot_key TEXT NOT NULL, url TEXT NOT NULL, name TEXT, sha256 TEXT,
  pages INTEGER, bytes INTEGER,
  status TEXT NOT NULL,             -- retrieved | gated | unreachable | scanned | skipped
  platform TEXT, fetched_at TEXT,
  PRIMARY KEY (lot_key, url)
);

CREATE TABLE company (           -- typed core + preserved prose
  id TEXT PRIMARY KEY, name TEXT NOT NULL, home_base TEXT,
  regions JSON, radius_km REAL, trades JSON, cpv_prefixes JSON,
  contract_min_eur REAL, contract_max_eur REAL, partner_threshold_eur REAL,
  references_held JSON, hard_exclusions JSON,
  guarantee_capacity_eur REAL, self_perform_share_pct REAL,
  earliest_start TEXT, capacity_per_week INTEGER NOT NULL DEFAULT 3,
  raw_text TEXT NOT NULL DEFAULT ''
);

CREATE TABLE verdict (
  lot_key TEXT NOT NULL, company_id TEXT NOT NULL,
  criterion TEXT NOT NULL,
  status TEXT NOT NULL,             -- Blocker | Risk | OK | Unknown
  kind TEXT NOT NULL,               -- numeric | semantic
  reason_en TEXT NOT NULL, company_fact TEXT, claim_ids JSON,
  computed_at TEXT NOT NULL,
  PRIMARY KEY (lot_key, company_id, criterion)
);

CREATE TABLE sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);  -- holds the watermark
CREATE TABLE ingest_job (
  id TEXT PRIMARY KEY, stage TEXT NOT NULL, pct INTEGER NOT NULL DEFAULT 0,
  message TEXT, tender_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
```

### Determinism is a property of provenance, not of the attribute

The original architecture sketch split attributes into deterministic and non-deterministic sets.
That does not survive the data: `estimated_value` is structured in 11% of rich-feed lots and
absent from 100% of thin-feed lots; `guarantee_required` is 53% and 0%. The same logical
attribute arrives by different routes for different tenders. Hence the `claim` table keyed by
`(attribute, extractor)` rather than two columns of buckets.

**Precedence, highest first: `xpath` > `rule` > `llm_doc` > `llm_notice`.** The structured notice
is the publisher's own legally binding assertion; a document is richer but extraction is
fallible. Resolution happens in a read-time view; losing claims are never deleted.

**Contradiction is not merged.** A document claim whose value conflicts with a structured claim
sets `conflict = 1` and both are shown. "Notice says no guarantee; § 12 of the contract says 5%"
is information an estimator acts on.

**Confidence is derived from the extractor**, not invented: `xpath` → high, `rule` → medium,
`llm_doc` → medium, `llm_notice` → low, absent after reading → `not_found`.

### The extraction cascade

Two rule stages, deliberately distinct, because conflating them is how this design would go wrong:

- **Extraction rules** — regex/keyword over German text blobs. Cheap, high precision, low recall.
- **Decision rules** — the eligibility verdict. A pure function of typed facts × company profile. Never an LLM.

**Blob router.** Route on declared type first, length second. Fields typed `code`, `date`,
`amount`, `indicator`, `integer`, `id` in the SDK dictionary are terminal — taken as-is with
`extractor='xpath'`, confidence high. That settles 588 of 1,260 declared fields with no cascade.
Fields typed `text`, `text-multilingual`, `url` enter the cascade when the value exceeds ~120
characters or contains a sentence terminator; below that it is a label, not a claim source.

Inside the cascade: extraction rules first, escalating to the LLM only when a pattern matched but
yielded no typed value, or when the input is a document page. A blob no rule and no company
constraint asks about is never sent to the LLM.

**LLM via OpenRouter**, behind a single module with one function so it is swappable and mockable.
Model to be chosen by the owner; requirement is long-context and reliable structured output over
German. It extracts *claims with a verbatim quote and a locator* — it never decides and never
ranks. **Fallback when the network dies is the extraction rules alone**, with everything else
`Unknown`; a local model is not a viable substitute for structured extraction on this timescale.

**When the LLM runs: pre-computed demo slice, lazy thereafter.** Pre-compute the union of lots
surviving region + CPV + size screening for the seeded companies (order of a few hundred lots,
not 3,201), cache the claims, extract lazily on first view for anything else. A
`--precompute-for <company>` flag widens the slice.

### Document tier

**Plain HTTP only. No headless browser, no attempt on registration walls.** One interface,
`fetch_documents(lot) -> list[File] | Gated | Unreachable`, with per-platform adapters. Measured
across 3,176 document-bearing lots on 89 distinct hosts (top 20 hosts = 80% of links):

| class | share of lots | notes |
|---|---|---|
| real documents, anonymous HTTP | **11.2%** | RIB/meinauftrag white-labels (217 lots), evergabe-online (140, needs cookie jar + Referer), aumass (~73) |
| notice PDF only | 9.2% | subreport-elvis serves a 3-page Bekanntmachung — data we already hold structured; **no adapter, no value** |
| registration-walled | 33.1% | seven hosts, four on one shared platform stack |
| JS shell, gating unverified | 10.5% | would need a browser, unproven it helps |
| unsampled | 33.7% | ~7 hosts; a timeboxed probe is worth running |

Crucially the correlation runs in our favour: the thin feed with no structured data is **28%**
anonymously downloadable versus 11% for the rich feed. And per seeded company the readable count
is 22 / 10 / 15 lots against a need of three — a surplus, not a constraint. Registration walls
are out of scope not only on effort grounds but because getting past them means submitting
company registration data; the challenge brief explicitly says to move on instead of fighting it.

**Filename router before the reader.** A real package was inspected: the eligibility text lived
in a 2-page, 80KB `Weitere Teilnahme- und Vertragsbedingungen.pdf` yielding 5.5KB of text
containing Sicherheitsleistung, Nachunternehmer, Präqualifikation, Eignungsnachweis and
Bietergemeinschaft rules — four of the five things eForms cannot express. The same package's
`Anlagen*.zip` was 11.4MB of architectural drawings with no eligibility text at all. So: read
files matching `Teilnahme|Vertragsbedingungen|Bewerbungsbedingungen|Eignung|Aufforderung|Leistungsbeschreibung|Beiblatt|Merkblatt`;
skip `Anlage|Plan|_EP|_GR|_WP|LV_|Bekanntmachung` and anything under `__MACOSX/`. ZIPs nest and
their filename encoding is unreliable (cp437/UTF-8 mojibake observed), so decode defensively.

**Text extraction via `pdftotext` (poppler), already installed, called as a subprocess.** Pages
split on the form-feed it emits, giving page-level locators. This keeps the project at **zero
third-party Python dependencies**, which it is today. No OCR — a PDF without a text layer is
recorded `status='scanned'` and reads `Unknown`. No Docling. Bills of quantities and GAEB are out
of scope: the disqualifiers live in the conditions prose, not the quantities.

### Decision rules

**Four-valued, matching the published contract: `Blocker | Risk | OK | Unknown`.** `Unknown` must
be distinct from `OK` — if missing data reads as a pass, every thin-feed lot looks eligible and
the shortlist is worthless; if it reads as a fail, 56% of the dataset is discarded including
everything the regional contractor would actually bid on. `Unknown` is also what *triggers*
document fetching, which is what keeps the document tier tractable.

Overall rollup: any Blocker → `NoGo`; no Blocker and any Risk or Unknown → `Consider`; otherwise
`Bid`. Ordering within a company is by `(blockers, unknowns, risks)` ascending, then deadline.
Nine criteria, each a comparison between one company constraint and one tender fact:

| criterion | company constraint | tender fact | kind | data reality |
|---|---|---|---|---|
| region | regions + radius | place_of_performance | numeric | notice, 92% |
| trade | cpv_prefixes | trade_scope | numeric | notice, 100% |
| contract size | contract_min/max_eur | estimated_value | numeric | **4.9% notice → mostly documents or Unknown** |
| guarantee | guarantee_capacity_eur | guarantees | numeric | 23%/0% → documents |
| references | references_held, hard_exclusions | references_required | semantic | 42%/1% → documents |
| availability | earliest_start | construction_window | numeric | 36%/0% → documents |
| self-performance | self_perform_share_pct | self_performance_min_pct | numeric | **documents only** |
| penalty | tolerance | penalty | semantic | **documents only** |
| contractor role | inferred from CPV breadth | contractor_role | semantic | weakest; inference, flagged as such |

**Reason text: German templates plus verbatim quotes.** The verdict fills a template; the evidence
quote is pasted **untranslated** from the source, because quoting the original is what makes the
claim checkable. The LLM's only role in the render path is a one-sentence headline per tender.
Templates cannot hallucinate, behave identically on unseen company/tender pairs, and keep working
with no network. If the LLM wrote the reasons, an unseen company would get fluent prose that does
not match the rule that fired.

### Company profiles

Typed core fields plus a preserved `raw_text`. Pure typed cannot express "we lose on price to
bigger players half the time"; pure free text collapses back into similarity matching. Profiles
are created by **pasting prose and having the LLM normalise it into the typed fields**, then shown
for correction before use — this is what makes an unseen company profile work at judging time.
The typed fields are the decision rules' input contract and are owned by this data layer.

### Pipeline stages

Five commands, each idempotent and resumable, each writing to the store:

```
poll      → watermark query, diff stubs, enqueue deltas
load      → fetch full eForms per delta, parse to lot + xpath claims
enrich    → blob router → extraction rules → LLM escalation; fetch + read documents
screen    → company × lot → verdicts
backfill  → bulk day/month export for history (fallback path)

ingest-one <notice-id|url>   → load + enrich for a single notice (the live path)
```

`ingest-one` shares the identical code path as the batch — not a parallel implementation — which
is what makes "a judge hands over an unseen tender" a demo rather than an apology. Job progress is
reported through the stages the UI already renders: `queued → downloading → extracting_text →
extracting_facts → done | error`. No cron, no daemon.

### Extractor bugs to fix as part of `load`

Five fields are currently unread or read from the wrong path. Authoritative XPaths from the
eForms-DE SDK field dictionary:

| business term | field | path |
|---|---|---|
| **BT-750** | Selection Criteria Description | `…/cac:TenderingTerms/…/efac:SelectionCriteria/cbc:Description` |
| BT-541 | Award Criterion Number | `…/efac:AwardCriterionParameter[efbc:ParameterCode/@listName='number-weight']/efbc:ParameterNumeric` |
| BT-33 | Lots Max Awarded | `/*/cac:TenderingTerms/cac:LotDistribution/cbc:MaximumLotsAwardedNumeric` (currently read under `TenderingProcess`) |
| BT-13(d) | Additional Information Deadline | `…/cac:TenderingProcess/cac:AdditionalInformationRequestPeriod/cbc:EndDate` |
| BT-758 | Change Notice Version Identifier | `/*/…/efac:Changes/efbc:ChangedNoticeIdentifier` |

BT-750 is the highest priority: it holds the actual Eignungskriterien and is the field the entire
references criterion depends on. BT-758 enables amendment detection and correct newest-version
resolution.

Also carried over from the existing extractor and to be preserved: CPV codes are published both
bare and with a check digit and must be normalised to 8 digits; NUTS codes come at mixed
granularity and must be prefix-matched; placeholder values (`.`, `-`, `k.A.`, `siehe
Vergabeunterlagen`) must be nulled; and finished awards are mislabelled as open competitions in
the national feed with no structural marker, requiring a German title heuristic and a transparent
dropped count.

### API contract

The web app is already built against a provisional OpenAPI contract in
`apps/web/src/lib/api-types.d.ts`. **That contract is adopted as-is**, not redesigned — the
frontend's timeline has it wiring to the real backend at 08:00. Enums `Confidence`, `Status`,
`Overall`, `RuleKind`, `JobStage`, the 15-field `TenderFactSheet`, `Evidence{doc,page,quote_de}`
and the `CompanyProfile` fields are all treated as fixed. `/openapi.json` is the published
artifact; the frontend regenerates its types from it.

**One reconciliation.** The contract is notice-grained (`TenderSummary` is "one record per notice;
lots nested") while storage is lot-grained. Storage stays lot-grained and the API projects: a
summary aggregates a notice's lots with `lot_count`, `TenderDetail.lots[]` carries them, and
verdicts are computed per lot with the best-fitting lot's verdict surfaced at notice level and the
lot named in `reason_en`. No contract change required.

**One honesty note for the UI:** `estimated_value_eur` appears in the triage row, and it is absent
from ~95% of notices. It will predominantly render as Unknown until documents are read. The UI
should not treat it as a reliable sort key.

## Testing Decisions

A good test here asserts **external behaviour at the highest available seam** and touches neither
the network nor the filesystem. Nothing about extractor internals, blob thresholds or SQL is
asserted directly; those are implementation and will change.

**Two seams, both pure functions.** Fewer would be better but these cover disjoint risk:

1. **`screen(company, fact_sheet) -> list[CriterionResult]`** — the primary seam. Every judged
   behaviour lives here and it has no I/O. Tests are golden: the three seeded companies against a
   handful of fixture fact sheets, asserting that the shortlists differ (the frontend's acceptance
   criterion), that a missing fact yields `Unknown` and never `OK`, that a Blocker forces `NoGo`,
   and that every result carries a non-empty `reason_en` and a company fact. This is where a
   regression would cost us the judged criteria, so it gets the most cases.

2. **`parse_notice(xml_bytes) -> lot + claims`** — the secondary seam, also pure. Fixtures already
   exist: ten real notices under `data/format-comparison/`, five of each schema profile. Tests
   assert the five fixed fields are now read (BT-750 in particular), that CPV normalises to 8
   digits, that a thin-profile notice yields a lot with `Unknown` rather than a crash, and that
   prefix-bound namespaces (`ns3:`) parse identically to `cbc:`.

Deliberately untested: `poll`, the document adapters and the LLM client. All three are I/O against
third parties whose behaviour we do not control; recorded fixtures would assert our recording, not
their behaviour, and the time is better spent on the two seams above. They are verified by running
them and by the `/health` endpoint. The LLM client sits behind one function specifically so the
`enrich` path can be exercised with it stubbed.

**Runner: stdlib `unittest`**, consistent with the zero-dependency decision. No prior art exists
in this repo — `src/tender_extract` has no tests and the only `test` directories are vendored
`node_modules`. So this establishes the pattern: `tests/`, one module per seam, run with
`python3 -m unittest`.

## Out of Scope

- **TED and service.bund.de ingestion.** Schema columns keep them additive.
- **Headless browsing and registration-walled platforms.** Explicitly excluded by the brief.
- **OCR.** Scanned PDFs are recorded as such and read `Unknown`.
- **Bills of quantities and GAEB parsing.** The disqualifiers are in the conditions prose.
- **Vector search and embeddings.** Nothing in the nine criteria needs semantic similarity, and similarity is the thing the challenge warns against.
- **Effort estimation and a deadline calendar.** Named as extensions only.
- **Login, hosting, multi-tenancy, migrations.** The store is regenerable; a seeded copy is committed.
- **Accuracy metrics.** Not a metric-based challenge; reasoning is what is judged.
- **The four web screens and any client-side scoring.** Owned by `docs/design.md`.
- **Cron or a long-running daemon.** `poll` is a command; it may be looped manually.

## Further Notes

**Risks, in order of how much they would cost.**

The search index is undocumented — it is the site's own client API, carries no stability
guarantee and could change without notice. Mitigation: `backfill` over the documented bulk export
remains a working path, and `poll` failing degrades to yesterday's data rather than to nothing.

Document coverage is 11.2% of all lots. This is survivable because the per-company readable counts
(22 / 10 / 15) exceed the need of three, but it means the honest product claim is *"we read the
documents where the platform permits it, and we tell you when it does not"* — not *"we read the
documents."* Worth being precise about this on stage; a judge who probes it will find the number.

Contract value is absent from ~95% of notices. Contract-size screening therefore depends on
documents or reads `Unknown`. This is the single largest gap between what the nine criteria want
and what the data provides.

Contractor role has no expressible source and is inferred from CPV breadth. It is the weakest of
the nine and should be labelled as an inference in the UI rather than presented as a read fact.

**Non-obvious facts worth keeping.** Eight of 3,201 lots have a submission deadline earlier than
their own publication date — a source error, not a parsing bug; validate rather than trust.
`ContractFolderID` is present on only 61.7% of notices so procedure lineage is mostly
unrecoverable from eForms, while the OCDS `ocid` is 100% present. The national feed labels
finished awards as open competitions with no structural marker.

**Specifications.** eForms-DE standard at `xeinkauf.de/eforms-de`, SDK with the 1,260-field
dictionary at `gitlab.opencode.de/OC000008125155/SDK-eforms-de`, OCDS 1.1 at
`standard.open-contracting.org`, and the publisher's own API documentation — which is the
authority on all three formats — served live at `/documentation/api/opendata`. A CSV business-term
mapping spreadsheet is published at
`/documentation/api/opendata/Documentation Bekanntmachungsservice CSV Format.ods`. Local copies of
the eForms-DE specs are under `docs/specifications/eforms-de/`.

## Unresolved Questions

1. **OpenRouter model** not chosen. Requirement: long context, reliable structured output, competent German. Key is not present in the shell environment; a `.env` exists at the project root but has not been read.
2. **The unsampled third of document hosts** (1,070 lots, ~7 hosts including a federal roads authority and a state gazette) is unclassified. A timeboxed probe was agreed and is the cheapest remaining coverage in the design.
3. **Per-lot versus per-notice verdicts** are reconciled by surfacing the best-fitting lot, but the contract has no `lot_id` on `CriterionResult`. If the UI wants to show which lot fit, one optional field is needed.
4. **How and when the judges hand over unseen tender/company pairs** is unknown — flagged as an on-site question in `docs/design.md`. It determines whether `ingest-one` needs to accept a PDF upload as well as a notice URL.
5. **Whether this PRD should be filed as a GitHub issue** on the `sivihack-2026` remote. The skill's issue-tracker and label vocabulary were not provided to this session, and creating an issue is an outward-facing action, so it has not been done.
