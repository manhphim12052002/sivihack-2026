# W0 · Foundations (solo, ~1h, blocks everything)

**Owner:** backend A. **Start:** immediately. **Done when:** M0 (17.09 22:00).

## Context

Three things stop the team from working in parallel today: the web's `src/lib/` is gitignored by a
Python template rule, there is no shared database, and there is no Python project or test runner.
Fix all three in one short commit series, then hand off.

## Tickets

### W0.1 · Unignore `apps/web/src/lib` and commit the contract
- Root `.gitignore` line 17 `lib/` (Python template) swallows `apps/web/src/lib/{api.ts,status.ts,api-types.d.ts}`.
  Change to `/lib/` and `/lib64/` (root-anchored), or add `!apps/web/src/lib/`.
- Copy the three files from the main checkout (`apps/web/src/lib/`), commit as `fix(web): track src/lib, unignore Python lib/ pattern`.
- Acceptance: fresh clone, `cd apps/web && npm ci && npm run build` passes.
- Unblocks: W4.

### W0.2 · Supabase project, schema migration, ADR 0005
- Create the Supabase project (human step; use `/wizard` to capture `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `DATABASE_URL` into the untracked env file and never into git). Install the Supabase CLI, `supabase init`, `supabase link`.
- `supabase/migrations/0001_init.sql`, additive, derived from `store.py` SCHEMA + pipeline doc Flow 13 deltas.
  Sketch below is superseded by the merged shared schema in `supabase/migrations/20260917210000_init.sql` (plural names, `sources`/`chunks`/`companies` shared with the company-intelligence pipeline):

```sql
create table lot (                       -- one row per lot per notice version (store.py columns, unchanged)
  source text not null, notice_id text not null, notice_version text not null, lot_id text not null,
  lot_key text generated always as (source||'|'||notice_id||'|'||notice_version||'|'||lot_id) stored,
  procedure_key text not null,           -- source|notice_id, the PROCEDURE scope key
  source_format text, schema_profile text, procedure_id text, ocid text, changed_notice_id text,
  notice_type text, published timestamptz, notice_url text, title text, description text, buyer_name text,
  place_city text, place_nuts text, cpv_main text, cpv_additional jsonb, submission_deadline timestamptz,
  estimated_value numeric, estimated_value_currency text, qualification_text text[], document_urls text[],
  extra jsonb, ingested_at timestamptz not null default now(),
  primary key (source, notice_id, notice_version, lot_id)
);
create table source (                    -- Notice versions and fetched documents are both Sources
  id text primary key,                   -- 'notice:<notice_id>:<version>' or 'doc:<sha256>'
  kind text not null check (kind in ('notice','document')),
  url text, name text, sha256 text, pages int, bytes int,
  status text not null check (status in ('available','gated','unreachable','scanned','skipped')),
  platform text, fetched_at timestamptz
);
create table document (                  -- which lot linked which document, with its fetch outcome
  lot_key text not null, url text not null, source_id text references source(id),
  status text not null, platform text, fetched_at timestamptz, primary key (lot_key, url)
);
create table chunk (source_id text references source(id), page int, text text, primary key (source_id, page));
create table observation (               -- ADR 0001: immutable, never updated
  scope_type text not null check (scope_type in ('PROCEDURE','LOT')),
  scope_key text not null,               -- procedure_key or lot_key
  kind text not null check (kind in ('fact','requirement','unmatched')),
  attribute text not null,               -- fact-sheet field or Requirement kind or unmatched category
  extractor text not null check (extractor in ('xpath','rule','llm_doc','llm_notice')),
  source_id text not null references source(id),
  value_text text, value_num numeric, unit text, condition jsonb, category text,
  state text not null check (state in ('KNOWN','NOT_FOUND','REFERRED_TO_DOCUMENTS')),
  evidence_quote text, locator text, page int,
  confidence text not null check (confidence in ('high','medium','low','not_found')),
  prompt_version text, extracted_at timestamptz not null default now(),
  primary key (scope_key, attribute, extractor, source_id)
);
create table company (like the PRD company table; jsonb for arrays; raw_text not null default '');
create table verdict (lot_key text, company_id text references company(id), criterion text,
  status text check (status in ('Blocker','Risk','OK','Unknown')), kind text, reason_en text not null,
  company_fact text, observation_refs jsonb, computed_at timestamptz not null, primary key (lot_key, company_id, criterion));
create table sync_state (key text primary key, value text not null);
create table ingest_job (id text primary key, stage text not null default 'queued', pct int not null default 0,
  message text, tender_id text, payload jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
create view lots_latest as select distinct on (source, notice_id, lot_id) * from lot
  order by source, notice_id, lot_id, notice_version desc;
-- observations_resolved: rank by extractor precedence (xpath=1 … llm_notice=4); at the best rank,
-- agreeing rows merge evidence, disagreeing rows yield state CONFLICTING and no value. Written as SQL, tested in W3.
```

- Job claim (used by W3.5): `update ingest_job set stage='downloading', updated_at=now() where id = (select id from ingest_job where stage='queued' order by created_at for update skip locked limit 1) returning *;`
- `docs/adr/0005-supabase-postgres-over-sqlite.md`: decision, the offline trade-off, and that the seed is `supabase/seed.sql`. Use `/domain-modeling` to keep vocabulary aligned with `CONTEXT.md` (Observation, Source, Chunk, Scope).
- Acceptance: `supabase db push` applies cleanly; `psql $DATABASE_URL -c '\dv'` lists both views.
- Unblocks: W1, W2, W3.

### W0.3 · Python project and DB module
- `apps/pipeline/pyproject.toml`: package `tender_extract` from `src/`; root `pyproject.toml` is a uv workspace with `members = ["apps/pipeline"]`, deps `psycopg[binary]`, `fastapi`, `uvicorn`, `python-multipart`; dev: none (stdlib `unittest`). Pin Python ≥3.11.
- `apps/pipeline/src/tender_extract/db.py`: `connect()` from `DATABASE_URL`; helpers `upsert_lot`, `insert_observations` (`on conflict do nothing`, immutability), `upsert_source`, `get_state/set_state`, `resolve(scope_keys)` reading `observations_resolved`. Same call shapes as `store.py` so `load.py` ports by import swap.
- `apps/pipeline/tests/__init__.py`, run with `python -m unittest`. Add `README` run lines for API and pipeline.
- Acceptance: `python -m unittest` runs (zero tests OK); `python -c 'from tender_extract import db'` imports.

### W0.4 · Record the LLM model
- Decided: Claude Sonnet via OpenRouter, `OPENROUTER_MODEL=anthropic/claude-sonnet-5`; GPT as swap-in. One line in ADR 0005
  and in `docs/tender_document_pipeline.md` Flow 6. Key lives in the env file only. `llm.py` reads the model from the env var so the swap is config.

## Validation
- Fresh clone + env file → `npm run build` (web), `supabase db push`, `python -m unittest` all green.

## Rollback
- Migrations are additive; to reset during the hack: `supabase db reset` (destroys data; only before M2). Back up with `supabase db dump` first.
