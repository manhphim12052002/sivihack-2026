---
status: accepted
date: 2026-09-17
---

# Store the golden dataset in Supabase Postgres, not a committed SQLite file

The PRD chose a single SQLite file committed to the repo. We replace it with one Supabase
Postgres database, defined by additive migrations under `supabase/migrations/` and applied with
the Supabase CLI. Three people load, fetch and enrich into the same store during the hack, so
the store must accept concurrent writers rather than pass a file around; the job runner claims
`ingest_job` rows with `FOR UPDATE SKIP LOCKED`, so the API, a worker and the CLI can drain one
queue without a second queue system; the resolution rules of ADR 0001 are one SQL view
(`observation_resolved`) that every reader shares; and the web can read the same tables through
the Data API if it needs to, without a second copy of the data. Lots are keyed by generated
`lot_key` and `procedure_key` columns, so the two Scope keys are computed once in the schema and
never hand-built in application code.

The cost is the offline demo. A committed SQLite file needed nothing; now the demo laptop needs
Docker and `supabase start`, and the golden dataset travels as a committed `supabase/seed.sql`
snapshot that `supabase db reset` loads after the migrations. Row-level security stays off: the
pipeline and the API connect server-side with the service-role key or `DATABASE_URL`, no browser
holds a key, and the anon and authenticated roles receive no grants. Observation rows are
immutable at the database level through a trigger that rejects `UPDATE` and `DELETE`, so a
re-run at 2am cannot destroy a better earlier reading. The language model behind the `llm_doc`
and `llm_notice` extractors is Claude Sonnet via OpenRouter (`OPENROUTER_MODEL=anthropic/claude-sonnet-5`),
swappable to a GPT model by changing that one environment variable.

## Consequences

- Migrations are additive only; a file under `supabase/migrations/` is never edited once applied.
  Resetting during the hack is `supabase db reset` (destroys data; dump first).
- The offline fallback is rehearsed, not assumed: `supabase start` plus `supabase db reset` on
  the demo laptop must reproduce the shortlist from `seed.sql` before the technical check.
- Local development runs on the `553xx` port block (`supabase/config.toml`) so the stack can
  coexist with another local Supabase project; the local database URL is
  `postgresql://postgres:postgres@127.0.0.1:55322/postgres`.
- Hosted project URL, service-role key and `DATABASE_URL` live in the untracked env file only.
- Concurrency rules for three writers: `lot` and `source` upserts are idempotent, `observation`
  inserts use `on conflict do nothing`, and nothing deletes.
- `supabase/tests/resolution_smoke.sql` is the executable statement of the resolution rules;
  run it after any change to the views.
