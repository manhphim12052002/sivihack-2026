# Tender pipeline

Python package `tender_extract`: pulls eForms notices from the oeffentlichevergabe.de bulk
export, parses construction lots (CPV 45*), and loads lots, sources and immutable observations
into the Supabase Postgres schema in `../../supabase/migrations/` (see `docs/adr/0001`). `db.py`
is the only module that talks to the database.

## Setup and run (from the repo root)

```bash
uv venv .venv && uv pip install -e apps/pipeline           # Python 3.12 via .python-version
.venv/bin/python -m tender_extract --help                  # CLI; data paths are relative to the repo root
.venv/bin/python -m unittest discover -s apps/pipeline/tests -t apps/pipeline
```

`cd apps/pipeline && ../../.venv/bin/python -m unittest` runs the same tests. They use the
stdlib only and never touch a database or the network.

## Pipeline commands (need `DATABASE_URL`)

```bash
python -m tender_extract.load --zip data/cache/2026-09-16-eforms.zip   # one cached day → lots, sources, xpath observations
python -m tender_extract.load --cache data/cache                       # every cached day (the 14-day batch)
python -m tender_extract.backfill --start 2026-09-03 --end 2026-09-16  # download missing days, then load them
python -m tender_extract.poll                                          # lot search index from the sync_state watermark
python -m tender_extract.poll --since 2026-09-17T00:00:00Z             # override the watermark once
```

All three writers are idempotent: re-running upserts the same lot rows and inserts no new
observations. `poll` keeps `poll_watermark` and `last_poll_at` in `sync_state`; `load` and
`backfill` record `load.last_run_at` and `load.dropped_awarded_by_title`. Read screening
candidates from the `lots_current` view (newest version per notice, corrigenda collapsed);
`lots_latest` keeps every notice id.

## Environment variables (names only; values live in an untracked env file)

- `DATABASE_URL` — Postgres DSN read by `tender_extract.db.connect()`; `supabase start` prints a local one.
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` — LLM extraction over notice text and documents.
