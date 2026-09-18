# JSON data backend

The web app reads and writes through one data-access port (`apps/web/src/lib/db`) instead of
importing the Supabase client directly. Two implementations sit behind it:

| Backend | Module | Storage |
|---|---|---|
| `json` (default) | `lib/db/json/` | local JSON files, one per relation |
| `supabase` | `lib/db/supabase.ts` | the Supabase/Postgres instance |

Select one with `DATA_BACKEND`:

```bash
# default: no services, no keys needed
DATA_BACKEND=json npm run dev
# Postgres via PostgREST; needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
DATA_BACKEND=supabase npm run dev
```

Nothing else in the app knows which backend is active: route handlers and `lib/**` call
`db.from(table)…` / `db.rpc(...)` with PostgREST semantics either way.

## File layout

One file per relation, in `data/json-db/` (override with `JSON_DB_DIR`):

```
data/json-db/<relation>.json   # JSON array of row objects
```

Row keys are the Postgres column names, values are JSON (`jsonb` columns stay objects/arrays,
`timestamptz` and `date` columns are strings). A missing file is an empty table, so the store can
be filled in relation by relation.

`apps/web/src/lib/db/schema.ts` is the authority for which relations exist and what their primary
keys are; it mirrors `supabase/migrations/*.sql` and
`apps/web/supabase/migrations/20260918_company_intelligence.sql`. Writing to a relation that is
not listed there fails with `42P01`, the same as an unknown table in Postgres.

Relations the app reads today:

- tenders — `lots_latest.json`, `observations_resolved.json`
- companies — `companies.json` plus `company_capabilities`, `company_references`,
  `company_qualifications`, `company_resources`, `company_capacity`, `company_constraints`,
  `company_preferences`, `company_knowledge_gaps`
- documents — `sources.json`, `chunks.json`
- matching — `match_evaluations.json`, `matching_tasks.json`, `match_results.json`,
  `match_knowledge_gaps.json`
- demo board — `company_profiles.json`, `demo_lots.json`; the flat CompanyProfile / TenderDetail
  shapes the triage UI screens on (see `apps/web/src/lib/assets.ts`)

### The demo board relations are checked in

`company_profiles.json` and `demo_lots.json` are the demo content itself, so unlike the pipeline
snapshots they are tracked in git and are the only copy — there is no bundled fixture behind them.
Editing a lot or a company profile means editing those files. `POST /api/companies` appends to
`company_profiles.json`, so a company created in the UI survives a restart.

For `DATA_BACKEND=supabase`, load the same two files into Postgres (safe to re-run; rows merge on
their primary key):

```bash
node scripts/load-demo-board.mjs
```

### Views must be exported resolved

`lots_latest` and `observations_resolved` are Postgres views: the "latest notice version per lot"
and the observation-resolution rules (extractor precedence, agreement, conflict detection — see
`supabase/migrations/20260917210000_init.sql`) run in SQL. The JSON backend does not reimplement
them, it reads the view's output. An export must therefore contain the resolved rows, and these
files are read-only — a write to them fails with `42809`, as it would against a view.

## Behaviour and limits

- **Reads** support `eq`, `in`, ordering (nulls last), `limit`, column projection, `single`
  (exactly one row, else `PGRST116`) and `maybeSingle`.
- **Writes** persist to the file: `insert` applies the column defaults from `schema.ts` and fails
  on a duplicate primary key with `23505`; `upsert` merges the supplied columns over the existing
  row (`on conflict do update`); `update`/`delete` apply every filter in the chain. A write with
  `.select()` returns the affected rows.
- **Concurrency**: writes to one file are serialized in-process and land atomically (temp file +
  rename). This assumes a single Next.js process owns the store.
- **Reload**: a file replaced on disk is picked up on the next read (mtime check), so a fresh
  export does not need a server restart.
- **No transactions across files.** `save_company_intelligence` — ported from the stored
  procedure, including the `companies.revision` optimistic-concurrency check and `PROFILE_CONFLICT`
  — replaces each child collection in its own file, so a crash mid-save can leave the aggregate
  half-written. The next save replays the whole aggregate.
- The Python pipeline (`apps/pipeline`) still writes to Postgres directly; the JSON store is a
  snapshot of its output, not a second writer.

Coverage for all of the above: `apps/web/src/lib/db/__tests__/json-backend.test.ts`.
