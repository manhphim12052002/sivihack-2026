# Three Out of Forty — SiviHack 2026, Track 2 (Arctis AI)

A construction company sees forty new public tenders a week and can bid on three. This tool
shows a shortlist per company with reasons an estimator can argue with, and lets a judge
ingest an unseen tender and company. Frontend design: `docs/design.md`.

## Run the web app

Node 24, no services, no keys:

```bash
cd apps/web && npm install && npm run dev          # http://localhost:3000
```

The app reads and writes `data/json-db/` through its data port (`docs/json-data-backend.md`);
the committed snapshot holds the demo lot, its documents, seven company profiles and the
pre-computed evaluations, so the board and the briefing work offline. Set `OPENROUTER_API_KEY`
(and optionally `OPENROUTER_MODEL`) to let layer 2 re-read the documents with a model; without
it those checks show as UNCERTAIN with the reason stated. `DATA_BACKEND=supabase` switches to
Postgres.

## Run the pipeline

Python 3.12 with [uv](https://docs.astral.sh/uv/); details, env var names and the test command
in `apps/pipeline/README.md`:

```bash
uv venv .venv && uv pip install -e apps/pipeline
.venv/bin/python -m tender_extract --help
```

## Data

`data/tenders.jsonl` — one record per lot, pulled from the oeffentlichevergabe.de eForms
export (CC0), filtered to CPV 45*. Produced by `apps/pipeline`, see
`docs/tender-data-extraction.md`.

## Supabase migration CI

`.github/workflows/supabase-migration-dry-run.yml` runs on every PR touching
`supabase/migrations/**` and posts a `supabase db push --dry-run` plan as a PR comment — review
it before merging. `.github/workflows/supabase-migration-deploy.yml` runs on push to `main`,
backs up the remote DB (`supabase db dump`, uploaded as a workflow artifact) then applies the
migration for real.

One-time setup — add these repo secrets (`gh secret set <NAME>` or Settings → Secrets and
variables → Actions):

- `SUPABASE_ACCESS_TOKEN` — personal access token from https://supabase.com/dashboard/account/tokens
- `SUPABASE_PROJECT_ID` — the shared project's ref (Settings → General → Reference ID)
- `SUPABASE_DB_PASSWORD` — the shared project's database password

## Layout

```
apps/web/            Next.js: triage, tender briefing, companies, ingest
apps/pipeline/       Python: notice export → lots, observations, Supabase load (src/tender_extract)
supabase/            migrations and seed for the shared Postgres
data/                batch data
docs/                design.md, tender-data-extraction.md, proposals, specs
plans/               implementation plans and research reports
```
