# Three Out of Forty — SiviHack 2026, Track 2 (Arctis AI)

## 1. What the product is

A German construction company sees ~40 new public tenders a week and has capacity to bid on
three. **Three Out of Forty** screens those tenders against a company's real eligibility —
region, contract size, financial guarantee limits, reference-project requirements, construction
window, penalty clauses — not text similarity, and shows a shortlist per company with a reason
an estimator can argue with, backed by a verbatim quote from the actual tender documents.

- Pick a company → see the recommended tenders and why each one fits or was set aside.
- Pick a different company profile → the shortlist changes, because it's a real decision, not a
  similarity score.
- A judge can paste an unseen tender/company pair at judging time (`ingest_one`) and get the same
  reasoned answer.

Frontend/UX notes: `docs/design.md`. Domain vocabulary (Procedure, Lot, Fact, Requirement,
Observation, Confidence, …): `CONTEXT.md`. Challenge brief: `docs/proposals/Track-2.md`.

## 2. Setup & run the demo

### Web app — the demo board (Node 24, no services, no keys required)

```bash
cd apps/web && npm install && npm run dev          # http://localhost:3000
```

The web app talks to one data-access port (`apps/web/src/lib/db`, `docs/json-data-backend.md`)
with two interchangeable backends, selected by `DATA_BACKEND`:

- **`json` (default)** — reads/writes local files in `data/json-db/`, one per relation. This is
  what makes the demo run with no services and no keys, and it's what we default to locally for
  fast iteration.
- **`supabase`** — the same reads/writes go straight to Postgres via PostgREST
  (`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`).

`data/json-db/` is **not** the source of truth — it's an export of the Supabase schema
(`tender_extract.export_json`, views resolved) that the Python pipeline produces after ingesting
tender notices/documents into Postgres. The committed snapshot already holds the demo lot, its
documents, seven company profiles and pre-computed match evaluations, so the triage board,
company list and tender briefing work fully offline. (The `company_*` and `match_*` files in that
snapshot are the exception — those get written by the web app itself on first use, since seeding
demo company profiles and warming the match board doesn't need the pipeline.)

- Set `OPENROUTER_API_KEY` (and optionally `OPENROUTER_MODEL`) to let the decision engine's second
  layer re-read the actual tender documents live with a model; without it, those checks show as
  `UNCERTAIN` with the reason stated instead of failing silently.
- Set `DATA_BACKEND=supabase` (plus the two env vars above) to point the same app at the live
  Postgres instance instead of the local JSON snapshot.

### Pipeline — rebuilding the data from source (Python 3.12 via `uv`)

Full commands, env vars and the test suite are in `apps/pipeline/README.md`; quick start:

```bash
uv venv .venv && uv pip install -e apps/pipeline
.venv/bin/python -m tender_extract --help
```

## 3. Tech stack

| Layer | Tech |
|---|---|
| Web app (demo UI) | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Web app tests | Vitest |
| Decision/document engine | TypeScript, `openai` SDK pointed at OpenRouter, `langsmith` for tracing |
| File parsing (web) | `pdf-parse`, `mammoth` (DOCX), `xlsx` |
| Data pipeline | Python 3.12, `uv`, FastAPI/`uvicorn` (CLI + service), `psycopg` |
| Storage | Supabase Postgres is the system of record (pipeline writes here); `data/json-db/` is a committed export of it, used as the local/offline dev backend behind the same data-access port |
| CI | GitHub Actions — Supabase migration dry-run on PRs, backup + deploy on merge to `main` |

## 4. Datasets, APIs, libraries

- **Dataset:** German public construction tenders (CPV code `45*`), sourced as raw **eForms XML**
  from the [oeffentlichevergabe.de](https://www.oeffentlichevergabe.de) bulk notice export (CC0,
  open data; extraction method in `docs/tender-data-extraction.md`). `apps/pipeline`
  (`tender_extract`) parses that XML into lots/sources/chunks/observations in Postgres, and
  `data/json-db/` — what the web app actually reads — is the exported, view-resolved result of
  running that pipeline end to end (`docs/json-data-backend.md`). `data/tenders.jsonl` is a
  separate, earlier CLI output of the same day-batch extraction step, not the dataset behind the
  demo board.
- **Tender documents:** actual attachment PDFs/DOCX/XLSX downloaded per lot (see
  `docs/arctis_company_intelligence_pipeline.md` / `docs/tender_document_pipeline.md`) — the
  engine reads these, not just the notice metadata, per the challenge's judging bonus.
- **LLM API:** OpenRouter (`openai` SDK-compatible), used by both the web decision engine and the
  Python pipeline's model-based extraction stage. Configured via `OPENROUTER_API_KEY` /
  `OPENROUTER_MODEL`; the product degrades gracefully (marks facts `UNCERTAIN`/`model_unavailable`)
  when the key is absent, it never fabricates an answer.
- **Requirements/dependencies:**
  - Web: `apps/web/package.json` (`npm install` installs everything; no `requirements.txt`, this
    part of the stack is Node/TypeScript).
  - Pipeline: `apps/pipeline/pyproject.toml`, installed with `uv pip install -e apps/pipeline`
    (uv workspace root: `pyproject.toml`) — the Python equivalent of `requirements.txt` for this
    stack.
- **Storage backend (optional, for the shared/live setup):** Supabase Postgres, schema and seed in
  `supabase/`.

## 5. Layout

```
apps/web/            Next.js: triage board, tender briefing, companies, ingest
apps/pipeline/       Python: notice export → lots, observations, Supabase load (src/tender_extract)
supabase/            migrations and seed for the shared Postgres
data/                batch data (tenders.jsonl, json-db snapshot, sample tender package)
docs/                design.md, tender-data-extraction.md, proposals, specs, ADRs
plans/               implementation plans and research reports
```

## 6. Supabase migration CI

`.github/workflows/supabase-migration-dry-run.yml` runs on every PR touching
`supabase/migrations/**` and posts a `supabase db push --dry-run` plan as a PR comment — review it
before merging. `.github/workflows/supabase-migration-deploy.yml` runs on push to `main`, backs up
the remote DB (`supabase db dump`, uploaded as a workflow artifact) then applies the migration for
real.

One-time setup — add these repo secrets (`gh secret set <NAME>` or Settings → Secrets and
variables → Actions):

- `SUPABASE_ACCESS_TOKEN` — personal access token from https://supabase.com/dashboard/account/tokens
- `SUPABASE_PROJECT_ID` — the shared project's ref (Settings → General → Reference ID)
- `SUPABASE_DB_PASSWORD` — the shared project's database password

## 7. Current limitations

- Works only for German construction tenders (CPV `45*`) sourced from
  oeffentlichevergabe.de/TED; not a general procurement screener.
- Document-based checks depend on `OPENROUTER_API_KEY`; without it those checks surface as
  `UNCERTAIN`/`model_unavailable` rather than a pass/fail.
- ~24% of document-bearing lots sit behind gated portals that can't be fetched automatically
  (`GATED`/`UNREACHABLE`); an estimator still has to open those by hand.
- No authentication/login, and the JSON-snapshot demo mode is single-writer, not built for
  concurrent multi-user production use.
