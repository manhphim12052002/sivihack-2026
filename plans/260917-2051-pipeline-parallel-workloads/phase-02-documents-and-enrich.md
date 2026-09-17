# W2 · Documents and enrich (backend B, starts at W0; DB needed only from W2.5)

**Goal:** for a lot with readable documents, the six Requirement kinds and the unmatched list are in
`observation` with a verbatim quote, source id and page; unreadable documents are recorded with the
platform named; the same code runs for one notice (`ingest-one`) and for the batch.
**Spec:** pipeline doc Flows 4–6, 10; ADR 0003, 0004; PRD "The extraction cascade", "Document tier".

## Tracer fixture (from W5.1)
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

### W2.2 · Filename router + `pdftotext` page chunks — blocked by W5.1 (fixture)
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

### W2.4 · LLM client + extraction schema + evidence check — blocked by W0.4 (model), W5.1 (fixture)
- `llm.py`: one function `extract(document_text, procedure_context, prompt_version) -> ExtractionResult` over OpenRouter,
  JSON-schema-enforced output with `facts[]`, `requirements[]` (six kinds, typed `condition`), `unmatched_requirements[]`
  (category, quote, scope). Prompt carries procedure title and lot ids/titles; default scope `PROCEDURE`, filename `Los_2` hint.
- Evidence gate: keep an item only if `chunk_id` exists **and** the quote is a whitespace-normalised substring of that page;
  count rejections per document and store on `source` (`rejected_items int`).
- Network failure → return empty result flagged `unavailable`; enrich continues with rules only (ADR 0003 fallback).
- Acceptance: tracer conditions PDF → at least guarantee and references extracted with quotes that pass the gate; a
  fabricated quote in a mocked response is rejected and counted.

### W2.5 · `enrich` command — blocked by W2.1–W2.4, W0.2
- `enrich.py`: for each lot key (or `--for-company <id>`: lots passing region + CPV that still have Unknowns), run rules over notice
  prose → fetch documents → route → chunk → LLM per routed document → gate → write `observation` rows
  (`on conflict do nothing`), `source`, `chunk`, `document`. Idempotency key: document sha256 + `prompt_version`.
- Unknown after reading = `NOT_FOUND` row per attribute per document source (so the UI can say "read, not stated").
- Acceptance: run twice on the tracer lot → second run makes zero LLM calls and zero new rows.

### W2.6 · Enrich the batch slice — blocked by W1.3, W5.2
- `enrich --for-company` for each seeded company; expect a few hundred lots, ~24% with readable documents.
- Record totals in `sync_state`: lots enriched, documents retrieved/gated/unreachable/scanned, LLM calls, rejections.
- Acceptance: `select status, count(*) from document group by 1` shows all five statuses populated with platforms.

## Validation
- Tests for rules and the evidence gate (`/tdd`); adapters and the LLM verified by running on the tracer lot.

## Risks
- Adapter breakage on a host → mark `unreachable`, move on (ADR 0004). Large PDFs → select pages by the German keyword regexes, no embeddings.
