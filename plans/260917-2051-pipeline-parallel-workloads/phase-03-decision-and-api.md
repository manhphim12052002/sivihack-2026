# W3 · Decision and API (backend A after W1.3; W3.1 can be pulled forward by backend B or the web owner)

**Goal:** `screen(company, resolved_facts) -> CriterionResult[]` is a tested pure function; FastAPI serves the
contract the web already uses, reading Supabase; a worker drains `ingest_jobs`; `ingest-one` is `load` + `enrich`.
**Spec:** PRD "Decision rules", "API contract", pipeline doc §5a triggers; ADR 0003.

## Tickets

### W3.1 · `screen()` with golden tests — blocked by W0.3, W5.2 (profiles); no DB
- `screen.py`: nine criteria (region, trade, contract size, guarantee, references, availability, self-performance, penalty,
  contractor role), each one company constraint × one resolved fact → `Blocker | Risk | OK | Unknown`.
  Missing fact or `REFERRED_TO_DOCUMENTS`/`CONFLICTING` → `Unknown`, never `OK`. Rollup: any Blocker → `NoGo`;
  Risk or Unknown → `Consider`; else `Bid`. Order `(blockers, unknowns, risks)` asc, then deadline.
- `templates.py`: English reason templates with the German term in parentheses and the untranslated quote; `company_fact` filled.
- `apps/pipeline/tests/test_screen.py` (most cases live here): three seeded profiles × fixture fact sheets → shortlists differ; missing fact
  → `Unknown`; Blocker → `NoGo`; every result has non-empty `reason_en` and `company_fact`; deterministic on repeat.
- Acceptance: tests green; no I/O in the module.

### W3.2 · Company normalisation — blocked by W0.4
- `company.py`: prose (or uploaded PDF/DOCX text via `pdftotext`) → one LLM call → typed `CompanyProfile` fields;
  `raw_text` preserved; returned for correction before use. Runs synchronously inside `POST /companies`.
- Acceptance: the three seeded prose profiles normalise to the committed typed JSON in `data/companies/` (W5.2) with at most
  manual corrections noted there.

### W3.3 · FastAPI over Postgres — blocked by W0.2, W0.3
- `apps/api/main.py` (+ routers): implement exactly the paths in `apps/web/src/lib/api.ts`:
  `GET /health` (adds `last_poll_at`, `queued_jobs`), `GET /tenders`, `GET /tenders/{id}`, `GET/POST/PUT /companies[/{id}]`,
  `POST /screen`, `POST /ingest` (JSON `notice_url` or multipart files), `GET /jobs/{id}`, `GET /contract`, `/openapi.json`. CORS for `localhost:3000`.
- Projection: storage is lot-grained, contract is notice-grained. `TenderSummary` aggregates a notice's `lots_latest` rows
  (`lot_count`), `TenderDetail.lots[]` lists them, `fact_sheet` comes from `observations_resolved` (procedure rows inherited),
  `documents[]` from `documents`+`sources`. Verdict per lot; best-fitting lot surfaced at notice level, lot named in `reason_en`.
- Contract additions (regenerate types in W4.2): `Fact.state` (four states) alongside `confidence`;
  `TenderDetail.unmatched_requirements[]` {category, quote_de, doc, page, scope}; optional `CriterionResult.lot_id`.
- Acceptance: `uvicorn apps.api.main:app --port 8000`; web triage renders real rows; `/openapi.json` diff vs `api-types.d.ts`
  shows only the additions above.

### W3.4 · `screen` on read with `verdicts` cache — blocked by W3.1, W3.3
- `POST /screen`: for each lot in scope, reuse `verdicts` rows newer than the latest observation and profile update; else compute and upsert.
- Acceptance: second call for the same company is served from cache (log), and editing the profile invalidates it.

### W3.5 · Job worker + `ingest-one` — blocked by W1.1, W2.5, W3.3
- `POST /ingest` inserts `ingest_job(payload)`; background task claims with `FOR UPDATE SKIP LOCKED` (W0.2), runs
  `load_notice_bytes(fetch_notice(id))` → `enrich(lot_keys, all kinds, no company filter)` updating `stage/pct/message` through
  `queued → downloading → extracting_text → extracting_facts → done | error`; `tender_id` set on done.
- P1 inputs, all text-based: `notice_url`, a bare notice id, or `text` (pasted tender text). Pasted text is registered as a
  `source(kind='document', name='pasted')` with one chunk per ~page of text and goes through the same rules → LLM → evidence gate
  as a fetched document, so nothing downstream is special-cased. `text` is an additive field on `IngestRequest` (regenerate types in W4.2).
- P2: PDF/ZIP upload without a notice (same path as pasted text after `pdftotext`).
- CLI twin: `python -m tender_extract.ingest_one <notice-id|url>` calls the same two functions.
- Acceptance: a notice id not in the store appears on `/tenders/[id]` within a minute; a platform fetch failure does not fail the job.

### W3.6 · Precompute verdicts for the three companies — blocked by W2.6, W3.4
- Run `POST /screen` (or CLI) per seeded company over the enriched slice; confirm the three shortlists differ and the
  "On the desk" top-3 each carry at least one document-quoted criterion.

## Validation
- `python -m unittest`; live click-through with W4; `curl /health` shows a fresh `last_poll_at`.

## Risks
- Contract drift breaks the web at 08:00 → additions only, never renames. Rules leaking into the LLM → review against ADR 0003 in `/code-review`.
