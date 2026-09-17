# W2 · Documents and enrich (backend B, starts at W0; DB needed only from W2.5)

**Goal:** for a lot with readable documents, the six Requirement kinds and the unmatched list are in
`observations` with a verbatim quote, source id and page; unreadable documents are recorded with the
platform named; the same code runs for one notice (`ingest-one`) and for the batch.
**Spec:** pipeline doc Flows 4–6, 10; ADR 0003, 0004; PRD "The extraction cascade", "Document tier".

## Status (18.09 01:10, branch `manhphim12052002/w2-w3-enrich-and-seed`)

W2.1-W2.5 and W2.7 implemented and unit-tested; W2.6 (the batch run) could not complete in
this environment — see below.

| ticket | result |
|---|---|
| W2.1 | 4 adapters (aumass, RIB, evergabe-online, staatsanzeiger); `classify()` sorts every other host into GATED/NOTICE_ONLY/JS_SHELL. One real round-trip verified live (RIB, `documents_RETRIEVED`, idempotent reuse on a second run — `documents_reused`, zero re-fetch). aumass, evergabe-online and staatsanzeiger all attempted real network calls and hit `UNREACHABLE` after 3 retries each on this environment's connection (measured ~26 KB/s at one point); their error-handling path is exercised and correct, not their happy path. |
| W2.2 | `reader.route`/`reader.pdf_pages`; 8 tests including a real filename set from the tracer's RIB-equivalent listing. Not run against a real conditions PDF end to end (needs a completed download; see W2.6). |
| W2.3 | `rules.py`: 15 tests on real BT-750/description sentences from the batch. Every Requirement mirrored onto the fact sheet's own attribute name (see the review note below) — verified live: `observations_resolved` now shows `guarantees`/`penalty`/`construction_window`/`references_required`/`self_performance_min_pct`/`contractor_role` populated from `rule` observations. |
| W2.4 | `llm.py`: schema, evidence gate, `unavailable` fallback. 6 tests on the gate (exact quote, whitespace-normalised quote, fabricated quote rejected+counted, unknown chunk id rejected, no-evidence item rejected, partial evidence kept). Not run against the real model: no LLM access configured in this environment. |
| W2.5 | `enrich.py`: rules → documents → pages → model → gate → observations, one function (`enrich_lot`) for both the batch and `ingest-one`. Deliberately runs `--all-rules` over `lots_current`, not `lots_latest` as written above — see the dependency-graph note in W1's phase-01 status. |
| W2.6 | **Not run.** The model-stage batch needs (a) a network that can sustain multi-MB portal downloads — three adapters here timed out after 3 retries each, one taking 15+ minutes before giving up — and (b) an LLM access credential, neither available in this environment. Rerun `python -m tender_extract.enrich --limit 300` from a normal connection with the credential set before relying on document/model observations for the demo. |
| W2.7 | `ingest_one.py` calls the same `enrich_lot` the batch uses, plus `--text` for pasted notice text (extractor `llm_notice`). Not run live (depends on the same network/credential gap as W2.6). |

**Two-axis review found and fixed a structural bug**: the rule and model stages wrote Requirement
observations under their kind name (`PERFORMANCE_GUARANTEE`, …), but the fact sheet's
`observations_resolved` reads are grouped by ITS OWN attribute vocabulary (`guarantees`, `penalty`, …
factsheet.ATTRIBUTES) — the two never merged, so a document finding would never have reached the
briefing page. Fixed: every Requirement row is now mirrored onto its fact-sheet attribute
(`rules.FACT_ATTRIBUTE_BY_KIND`), for both the rule stage and the model stage. Also fixed: the model
requirement's comparable value was accidentally `statement_type` ("EXPLICIT"/"INFERRED") instead of
the actual condition value, which would have made `observations_resolved`'s CONFLICTING detection
compare the wrong thing. Full list in commit `06e7212`.

## Tracer fixture (from W3.1)
One `plattform.aumass.de` lot (anonymous ZIP confirmed end to end in both probe rounds). Save its package under
`data/documents/` (gitignored) and, for tests, the ~5KB text of its conditions PDF as a fixture under `apps/pipeline/tests/fixtures/`.

## Tickets

### W2.1 · Fetch interface and first adapters — no blockers
- `documents.py`: `fetch_documents(lot) -> Retrieved(files) | Gated(platform) | Unreachable(platform)`; host → adapter
  map; content-addressed store `data/documents/<sha256>.<ext>`; never re-download a known hash.
- Adapters, by lots covered (both probe reports): `plattform.aumass.de` / `aumass.de` (server-rendered tables, anonymous),
  RIB/`meinauftrag.rib.de` white-labels (217 lots), `evergabe-online.de` (cookie jar + Referer),
  `staatsanzeiger-eservices.de` `EFormsBekVuUrl` type (POST form "Anonym als Zip", 53 lots).
  Skip `subreport-elvis` and `BekLanding4Bund` (notice PDF only, no value). Everything else → `gated`/`unreachable` with platform.
- Nested ZIPs, cp437/UTF-8 filename mojibake decoded defensively, `__MACOSX/` skipped.
- Acceptance: tracer lot yields files; a cosinex (`VMPSatellite`) URL yields `Gated('evergabe.nrw.de')`.

### W2.2 · Filename router + `pdftotext` page chunks — blocked by W3.1 (fixture)
- Read `Teilnahme|Vertragsbedingungen|Bewerbungsbedingungen|Eignung|Aufforderung|Leistungsbeschreibung|Beiblatt|Merkblatt`;
  skip `Anlage|Plan|_EP|_GR|_WP|LV_|Bekanntmachung`. `pdftotext -layout` subprocess, split on form-feed → `Chunk(page, text)`.
  Empty text layer → `source.status='scanned'`.
- Acceptance: tracer package → exactly the conditions PDF(s) routed; drawings ZIP skipped; page count matches `pdfinfo`.

### W2.3 · Extraction rules over notice prose — no blockers
- `rules.py`: regexes over BT-750 / lot description for guarantee %, references count + lookback years, self-performance %,
  penalty % per day + cap, construction window dates; German number/percent normalisation ("zehn Prozent", "10 v.H.").
  Emit `extractor='rule'`, confidence medium, quote = matched sentence, locator `xpath:BT-750`.
  "gemäß Vergabeunterlagen"/"siehe Vergabeunterlagen" → `state='REFERRED_TO_DOCUMENTS'`.
- Acceptance: unit tests on 10 real BT-750 strings pulled from `data/tenders.jsonl`.

### W2.4 · LLM client + extraction schema + evidence check — blocked by W3.1 (fixture)
- `llm.py`: one function `extract(document_text, procedure_context, prompt_version) -> ExtractionResult` over OpenRouter,
  JSON-schema-enforced output with `facts[]`, `requirements[]` (six kinds, typed `condition`), `unmatched_requirements[]`
  (category, quote, scope). Prompt carries procedure title and lot ids/titles; default scope `PROCEDURE`, filename `Los_2` hint.
- Evidence gate: keep an item only if `chunk_id` exists **and** the quote is a whitespace-normalised substring of that page;
  count rejections per document and store on `sources` (`rejected_items int`).
- Network failure → return empty result flagged `unavailable`; enrich continues with rules only (ADR 0003 fallback).
- Acceptance: tracer conditions PDF → at least guarantee and references extracted with quotes that pass the gate; a
  fabricated quote in a mocked response is rejected and counted.

### W2.5 · `enrich` command — blocked by W2.1–W2.4, W0.2
- `enrich.py`: for each lot key (default: the slice below), run rules over notice prose → fetch documents →
  route → chunk → model per routed document → gate → write `observations` rows (`on conflict do nothing`),
  `sources`, `chunks`, `documents`. Idempotency key: document sha256 + `prompt_version`.
- Slice selection (no company profiles in this scope): `--all-rules` runs the rule stage over every lot in
  `lots_latest`; the model stage runs over open lots (`submission_deadline >= today`) whose document URLs
  resolve to a supported adapter host, ordered by deadline, `--limit N`; `--lot <lot_key>` targets one lot.
- Unknown after reading = `NOT_FOUND` row per attribute per document source; notice text deferring to the
  documents = `REFERRED_TO_DOCUMENTS`; gated/unreachable platform recorded on `documents` with the host.
- Acceptance: run twice on the tracer lot → second run makes zero model calls and zero new rows.

### W2.6 · Enrich the batch — blocked by W1.3
- `enrich --all-rules` then `enrich --limit 300` (adjust to budget; ~24% of lots have readable documents).
- Totals written to `sync_state` (see W3.2): lots enriched, documents by status, model calls, rejections.
- Acceptance: `select status, count(*) from documents group by 1` shows the five statuses
  (`RETRIEVED|GATED|UNREACHABLE|SCANNED|SKIPPED`) populated with platforms; `select extractor, count(*)
  from observations group by 1` shows all four extractors.

### W2.7 · `ingest-one` CLI — blocked by W1.1, W2.5
- `python -m tender_extract.ingest_one <notice-id|url>`: `fetch_notice` → `load_notice_bytes` →
  `enrich --lot` for every lot of that notice, all six kinds plus the unmatched list, no slice filter.
  Same two functions the batch uses; nothing else. Prints the lot keys and a summary of what was read.
- P2: `--text <file>` registers pasted notice text as a `sources` row (`type='TXT'`, `origin='MANUAL_INPUT'`)
  and runs the same extraction over it.
- Acceptance: a notice id not in the store has rows in `observations_resolved` within a minute; a platform
  fetch failure is recorded on `documents` and does not abort the run.

## Validation
- Tests for rules and the evidence gate (`/tdd`); adapters and the LLM verified by running on the tracer lot.

## Risks
- Adapter breakage on a host → mark `unreachable`, move on (ADR 0004). Large PDFs → select pages by the German keyword regexes, no embeddings.
