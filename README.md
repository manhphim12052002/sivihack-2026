# Three Out of Forty — SiviHack 2026, Track 2 (Arctis AI)

A construction company sees forty new public tenders a week and can bid on three. This tool
shows a shortlist per company with reasons an estimator can argue with, and lets a judge
ingest an unseen tender and company. Frontend design: `docs/design.md`.

## Run the web app

Node 24:

```bash
cd apps/web && npm install && npm run dev          # http://localhost:3000
```

The UI expects an API at `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`) and shows an
offline banner when none is running. The backend is developed separately.

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

## Layout

```
apps/web/            Next.js: triage, tender briefing, companies, ingest
apps/pipeline/       Python: notice export → lots, observations, Supabase load (src/tender_extract)
supabase/            migrations and seed for the shared Postgres
data/                batch data
docs/                design.md, tender-data-extraction.md, proposals, specs
plans/               implementation plans and research reports
```
