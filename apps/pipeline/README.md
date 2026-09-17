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

## Environment variables (names only; values live in an untracked env file)

- `DATABASE_URL` — Postgres DSN read by `tender_extract.db.connect()`; `supabase start` prints a local one.
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` — LLM extraction over notice text and documents.
