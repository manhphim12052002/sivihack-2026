-- Shared Supabase schema: tender screening pipeline + company intelligence pipeline.
--
-- This file merges two schemas that were written in parallel on 17.09: the tender pipeline's
-- (ADR 0005, vocabulary from CONTEXT.md) and the company intelligence pipeline's (formerly
-- apps/web/supabase/migration.sql, run by hand in the SQL editor). Shared entities are ONE table:
--   sources    every Notice version, fetched tender document, or uploaded company document
--   chunks     an addressable piece of a source's text (a page for PDFs)
--   companies  the typed Company profile the screening rules read, plus intelligence columns
-- Table names are plural because the web's route handlers already query `companies`.
--
-- Idempotent on purpose: `if not exists` everywhere, `create or replace` for views/functions,
-- `add column if not exists` where two definitions were merged. It therefore applies cleanly to a
-- fresh database AND to a hosted project where the company tables were already created by hand.
--
-- Row-level security is deliberately NOT enabled. Demo: the pipeline connects as postgres via
-- DATABASE_URL, the Next.js route handlers use the Supabase client server-side. Grants go to the
-- service role and, because those handlers currently use the publishable key, to anon as well.
-- Turning RLS on later is an additive migration.

-- =============================================================================================
-- Shared infrastructure
-- =============================================================================================

-- sources: anything text was read from. Column notes:
--   entity_type  'tender' | 'company'
--   entity_id    tender: lots.procedure_key; company: companies.id
--   type         PDF | DOCX | XLSX | TXT | MANUAL | EFORMS
--   origin       CUSTOMER_UPLOAD | MANUAL_INPUT | EFORM_API | PORTAL_FETCH
--   status       AVAILABLE | GATED | UNREACHABLE | SCANNED | SKIPPED (pipeline); free text kept for
--                the company side, which writes AVAILABLE only
--   id           pipeline convention: 'notice:<notice_id>:<version>' or 'doc:<sha256>'
create table if not exists sources (
  id           text primary key,
  entity_type  text not null,
  entity_id    text not null,
  type         text not null,
  filename     text,
  origin       text not null,
  sha256       text,                                 -- content hash; dedup key for documents
  storage_path text,                                 -- path in Supabase Storage (company uploads)
  status       text not null default 'AVAILABLE',
  created_at   timestamptz not null default now()
);
-- Tender-pipeline columns (fetch outcome and model bookkeeping).
alter table sources add column if not exists url            text;
alter table sources add column if not exists pages          int;
alter table sources add column if not exists bytes          bigint;
alter table sources add column if not exists platform       text;              -- e-procurement host, named even when gated
alter table sources add column if not exists fetched_at     timestamptz;
alter table sources add column if not exists rejected_items int not null default 0;  -- model items dropped by the quote-substring check
create index if not exists sources_entity on sources (entity_type, entity_id);

-- chunks: one addressable piece of a source's text so every evidence quote is checkable offline.
-- PDFs: one row per page, id '<source_id>#p<page>'. DOCX/XLSX use section/paragraph/cell_range.
create table if not exists chunks (
  id          text primary key,
  source_id   text not null references sources (id),
  page        integer,
  section     text,
  paragraph   integer,
  cell_range  text,                                  -- XLSX range e.g. "A12:F20"
  text        text not null,
  created_at  timestamptz not null default now()
);
create unique index if not exists chunks_source_page on chunks (source_id, page) where page is not null;

-- =============================================================================================
-- Companies (typed screening profile + intelligence pipeline tables)
-- =============================================================================================

create table if not exists companies (
  id                     text primary key,
  name                   text not null,
  headquarters           text not null default '',
  employees              integer,
  revenue_eur            numeric,
  website                text,
  description            text,
  status                 text not null default 'ONBOARDING',
  -- typed screening fields (CompanyProfile in apps/web/src/lib/api-types.d.ts)
  home_base              text not null default '',
  regions                jsonb,
  radius_km              numeric,
  trades                 jsonb,
  cpv_prefixes           jsonb,
  contract_min_eur       numeric,
  contract_max_eur       numeric,
  partner_threshold_eur  numeric,
  references_held        jsonb,
  hard_exclusions        jsonb,
  guarantee_capacity_eur numeric,
  self_perform_share_pct numeric,
  earliest_start         text,
  capacity_per_week      integer not null default 3,
  raw_text               text not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
-- Money and percentages were `real` in the hand-run version; float32 cannot hold EUR amounts
-- above ~16.7M exactly, so widen to numeric (no-op on a fresh database).
alter table companies alter column revenue_eur            type numeric;
alter table companies alter column radius_km              type numeric;
alter table companies alter column contract_min_eur       type numeric;
alter table companies alter column contract_max_eur       type numeric;
alter table companies alter column partner_threshold_eur  type numeric;
alter table companies alter column guarantee_capacity_eur type numeric;
alter table companies alter column self_perform_share_pct type numeric;
alter table companies add column if not exists home_base_geo jsonb;   -- {lat, lon} of home_base, for the region rule

create table if not exists company_capabilities (
  id         text primary key,
  company_id text not null references companies (id) on delete cascade,
  type       text not null,                          -- e.g. ROAD_CONSTRUCTION
  label      text not null,
  origin     text not null,                          -- DOCUMENT_EXTRACTED | CUSTOMER_PROVIDED
  status     text not null default 'PENDING',        -- PENDING | CONFIRMED | REJECTED
  evidence   jsonb,                                  -- chunk_id[]
  created_at timestamptz not null default now()
);

create table if not exists company_references (
  id                 text primary key,
  company_id         text not null references companies (id) on delete cascade,
  name               text not null,
  client             text,
  project_types      jsonb,
  location           text,
  contract_value_eur numeric,
  completed_at       text,
  capabilities       jsonb,
  origin             text not null,
  status             text not null default 'PENDING',
  evidence           jsonb,
  created_at         timestamptz not null default now()
);
alter table company_references alter column contract_value_eur type numeric;

create table if not exists company_qualifications (
  id          text primary key,
  company_id  text not null references companies (id) on delete cascade,
  type        text not null,
  label       text not null,
  status      text not null default 'PENDING',
  valid_from  text,
  valid_until text,
  freshness   text not null default 'CURRENT',
  origin      text not null,
  evidence    jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists company_preferences (
  id         text primary key,
  company_id text not null references companies (id) on delete cascade,
  type       text not null,
  value      text,
  unit       text,
  origin     text not null default 'CUSTOMER_PROVIDED',
  created_at timestamptz not null default now()
);

create table if not exists company_constraints (
  id         text primary key,
  company_id text not null references companies (id) on delete cascade,
  type       text not null,
  value      text,
  unit       text,
  origin     text not null default 'CUSTOMER_PROVIDED',
  created_at timestamptz not null default now()
);

create table if not exists company_knowledge_gaps (
  id         text primary key,
  company_id text not null references companies (id) on delete cascade,
  type       text not null,
  state      text not null default 'UNKNOWN',        -- KNOWN_PRESENT | KNOWN_ABSENT | UNKNOWN | STALE
  reason     text,
  created_at timestamptz not null default now()
);

-- Company document ingestion jobs (company side). Tender ingestion uses ingest_jobs below.
create table if not exists company_ingest_jobs (
  id         text primary key,
  company_id text not null references companies (id) on delete cascade,
  stage      text not null default 'queued',
  pct        integer not null default 0,
  message    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================================================
-- Tender pipeline
-- =============================================================================================

-- lots: one row per Lot per Notice version. Column set mirrors the SQLite store it replaces.
create table if not exists lots (
  source                   text not null,           -- feed: 'oeffentlichevergabe' | 'ted' | ...
  notice_id                text not null,
  notice_version           text not null,           -- publisher string, zero-padded ('01', '02')
  lot_id                   text not null,           -- 'LOT-0001'; a Procedure without lots has one
  -- Scope keys. lot_key is the LOT scope key; procedure_key is the PROCEDURE scope key shared by
  -- every version and every lot of the same Procedure.
  lot_key                  text generated always as (source || '|' || notice_id || '|' || notice_version || '|' || lot_id) stored,
  procedure_key            text generated always as (source || '|' || notice_id) stored,
  source_format            text,                    -- 'eforms' today; additive per ADR 0002
  schema_profile           text,
  notice_type              text,
  procedure_id             text,                    -- lineage, nullable
  ocid                     text,
  changed_notice_id        text,                    -- the notice this version amends
  published                timestamptz,
  notice_url               text,
  title                    text,
  description              text,
  buyer_name               text,
  place_city               text,
  place_nuts               text,
  cpv_main                 text,
  cpv_additional           jsonb,                   -- array of CPV codes
  estimated_value          numeric,
  estimated_value_currency text,
  submission_deadline      timestamptz,
  question_deadline        timestamptz,
  lot_count                int not null default 1,  -- lots in the notice this row came from
  qualification_text       text[],                  -- eligibility prose blobs, input to rules and the model
  document_urls            text[],                  -- Vergabeunterlagen links found in the notice
  extra                    jsonb,                   -- sparse tail of structured fields
  ingested_at              timestamptz not null default now(),
  primary key (source, notice_id, notice_version, lot_id),
  unique (lot_key)
);
create index if not exists lots_published on lots (published);
create index if not exists lots_cpv_main  on lots (cpv_main);

-- documents: which Lot linked which document URL, with the fetch outcome. Several lots can link
-- the same file; the content lives once in sources (by sha256).
create table if not exists documents (
  lot_key    text not null,
  url        text not null,
  source_id  text references sources (id),          -- null until the file was fetched and hashed
  status     text not null check (status in ('RETRIEVED', 'GATED', 'UNREACHABLE', 'SCANNED', 'SKIPPED')),
  platform   text,
  fetched_at timestamptz,
  primary key (lot_key, url)
);
create index if not exists documents_lot_key on documents (lot_key);

-- observations: one reading of one Fact or Requirement from one Source by one extractor.
-- Rows are immutable (ADR 0001): re-running an extractor inserts new rows (or hits the primary key
-- and does nothing); nothing ever updates or deletes a row. Resolution happens in the view below.
create table if not exists observations (
  scope_type     text not null check (scope_type in ('PROCEDURE', 'LOT')),
  scope_key      text not null,                     -- lots.procedure_key or lots.lot_key
  kind           text not null check (kind in ('fact', 'requirement', 'unmatched')),
  attribute      text not null,                     -- fact-sheet field, Requirement kind, or unmatched category
  extractor      text not null check (extractor in ('xpath', 'rule', 'llm_doc', 'llm_notice')),
  source_id      text not null references sources (id),
  value_text     text,
  value_num      numeric,
  unit           text,
  condition      jsonb,                             -- per-kind typed condition shape (Requirements)
  category       text,                              -- unmatched Requirements only
  state          text not null check (state in ('KNOWN', 'NOT_FOUND', 'REFERRED_TO_DOCUMENTS')),
  evidence_quote text,                              -- verbatim German, never translated
  locator        text,                              -- 'xpath:BT-750' or 'Bedingungen.pdf#p.2'
  page           int,
  confidence     text not null check (confidence in ('high', 'medium', 'low', 'not_found')),
  prompt_version text,
  extracted_at   timestamptz not null default now(),
  primary key (scope_key, attribute, extractor, source_id)
);
create index if not exists observations_scope_key on observations (scope_key);
comment on table observations is
  'Immutable (ADR 0001). One row per (scope, attribute, extractor, source); insert only, never update or delete. Reset the table with TRUNCATE.';

create or replace function observations_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'observations rows are immutable (ADR 0001): % on % rejected; insert a new row instead',
    tg_op, tg_table_name;
end
$$;

drop trigger if exists observations_immutable on observations;
create trigger observations_immutable
  before update or delete on observations
  for each row execute function observations_immutable();

-- verdicts: cached output of the pure screen() function, one row per (Lot, Company, criterion).
-- Recomputed when any Observation or the Company profile is newer than computed_at.
create table if not exists verdicts (
  lot_key          text not null,
  company_id       text not null references companies (id) on delete cascade,
  criterion        text not null,
  status           text not null check (status in ('Blocker', 'Risk', 'OK', 'Unknown')),
  kind             text not null check (kind in ('numeric', 'semantic')),
  reason_en        text not null,                   -- filled template; carries the untranslated quote
  company_fact     text,
  observation_refs jsonb,                           -- array of observation primary keys behind the reason
  computed_at      timestamptz not null,
  primary key (lot_key, company_id, criterion)
);

-- sync_state: the poll watermark and other single-value pipeline state.
create table if not exists sync_state (
  key   text primary key,
  value text not null
);

-- ingest_jobs: the tender job queue. The table is the contract; the web writes rows, a worker
-- claims them.
create table if not exists ingest_jobs (
  id         text primary key,
  stage      text not null default 'queued'
             check (stage in ('queued', 'downloading', 'extracting_text', 'extracting_facts', 'done', 'error')),
  pct        int not null default 0,
  message    text,
  tender_id  text,                                  -- lot_key once known; "tender" is the web's word
  payload    jsonb,                                 -- what was submitted: url, notice id, or pasted text
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ingest_jobs_stage_created on ingest_jobs (stage, created_at);

-- Claim the oldest queued job for this worker. SKIP LOCKED lets several workers (web background
-- task, CLI, a second process) drain the same table without handing one job to two of them.
-- Returns NULL when nothing is queued.
create or replace function claim_ingest_job() returns ingest_jobs
language sql as $$
  update ingest_jobs
     set stage = 'downloading', updated_at = now()
   where id = (
     select id from ingest_jobs
      where stage = 'queued'
      order by created_at
      limit 1
      for update skip locked
   )
  returning *;
$$;

-- lots_latest: one row per Lot at its newest Notice version.
-- Assumption: notice_version strings compare correctly by (length, text). The publisher
-- zero-pads ('01', '02'), which sorts lexically; the length key keeps a bare '10' after '9' if a
-- feed ever sends unpadded integers.
create or replace view lots_latest as
  select distinct on (source, notice_id, lot_id) *
    from lots
   order by source, notice_id, lot_id, length(notice_version) desc, notice_version desc;

-- observations_resolved: the Resolved value per (scope_key, attribute), per ADR 0001.
--
--   1. KNOWN rows beat REFERRED_TO_DOCUMENTS rows, which beat NOT_FOUND rows.
--   2. Within that state, the best extractor precedence wins:
--      xpath (structured notice field) > rule (rule over notice text)
--      > llm_doc (model over document) > llm_notice (model over notice text).
--   3. All rows at the winning precedence are compared on their value. Agreeing rows merge their
--      evidence into one Resolved value; disagreeing rows yield state CONFLICTING with no value.
--   4. A lower-precedence KNOWN row that disagrees with the winner does not change the value but
--      sets has_lower_precedence_disagreement, so "notice says no guarantee, contract says 5%"
--      is flagged rather than hidden.
--
-- Values are compared as text: numbers with trailing zeros trimmed, else the text value, else the
-- typed condition JSON. Procedure-scoped rows are not inherited here; readers join them by
-- lots.procedure_key.
create or replace view observations_resolved as
with ranked as (
  select o.*,
         case o.extractor
           when 'xpath'      then 1
           when 'rule'       then 2
           when 'llm_doc'    then 3
           else                   4   -- llm_notice
         end as precedence,
         case o.state
           when 'KNOWN'                 then 1
           when 'REFERRED_TO_DOCUMENTS' then 2
           else                              3   -- NOT_FOUND
         end as state_rank,
         case o.confidence
           when 'high'   then 1
           when 'medium' then 2
           when 'low'    then 3
           else               4   -- not_found
         end as confidence_rank,
         coalesce(trim_scale(o.value_num)::text, o.value_text, o.condition::text) as value_key
    from observations o
),
-- Which state tier and, inside it, which extractor precedence wins for each item.
winning_tier as (
  select scope_key, attribute, state_rank, min(precedence) as precedence
    from ranked
   group by scope_key, attribute, state_rank
),
best_tier as (
  select distinct on (scope_key, attribute) scope_key, attribute, state_rank, precedence
    from winning_tier
   order by scope_key, attribute, state_rank
),
-- Every row sitting at the winning tier; these are compared for agreement.
winners as (
  select r.*
    from ranked r
    join best_tier b using (scope_key, attribute, state_rank, precedence)
),
merged as (
  select scope_key,
         attribute,
         min(scope_type)                                   as scope_type,
         min(kind)                                         as kind,
         min(extractor)                                    as extractor,   -- one extractor per tier
         state_rank,
         precedence,
         count(distinct value_key)                         as distinct_values,
         count(distinct source_id)                         as source_count,
         (array_agg(value_key   order by confidence_rank, extracted_at desc))[1] as value_key,
         (array_agg(value_text  order by confidence_rank, extracted_at desc))[1] as value_text,
         (array_agg(value_num   order by confidence_rank, extracted_at desc))[1] as value_num,
         (array_agg(unit        order by confidence_rank, extracted_at desc))[1] as unit,
         (array_agg(condition   order by confidence_rank, extracted_at desc))[1] as condition,
         (array_agg(category    order by confidence_rank, extracted_at desc))[1] as category,
         (array_agg(confidence  order by confidence_rank))[1]                     as confidence,
         jsonb_agg(jsonb_build_object(
             'source_id', source_id,
             'extractor', extractor,
             'locator',   locator,
             'page',      page,
             'quote',     evidence_quote,
             'value',     value_key
           ) order by confidence_rank, source_id)          as evidence
    from winners
   group by scope_key, attribute, state_rank, precedence
),
-- Lower-precedence KNOWN rows that disagree with the winning value (only meaningful when KNOWN).
lower_disagreement as (
  select m.scope_key, m.attribute,
         bool_or(r.value_key is distinct from m.value_key) as has_lower_precedence_disagreement
    from merged m
    join ranked r using (scope_key, attribute)
   where m.state_rank = 1
     and r.state = 'KNOWN'
     and r.precedence > m.precedence
   group by m.scope_key, m.attribute
)
select m.scope_type,
       m.scope_key,
       m.kind,
       m.attribute,
       m.extractor,
       case
         when m.state_rank = 1 and m.distinct_values > 1 then 'CONFLICTING'
         when m.state_rank = 1                           then 'KNOWN'
         when m.state_rank = 2                           then 'REFERRED_TO_DOCUMENTS'
         else                                                 'NOT_FOUND'
       end                                                                          as state,
       case when m.state_rank = 1 and m.distinct_values = 1 then m.value_text end  as value_text,
       case when m.state_rank = 1 and m.distinct_values = 1 then m.value_num  end  as value_num,
       case when m.state_rank = 1 and m.distinct_values = 1 then m.unit       end  as unit,
       case when m.state_rank = 1 and m.distinct_values = 1 then m.condition  end  as condition,
       m.category,
       m.confidence,
       m.evidence,
       m.source_count,
       coalesce(d.has_lower_precedence_disagreement, false)                        as has_lower_precedence_disagreement
  from merged m
  left join lower_disagreement d using (scope_key, attribute);

-- =============================================================================================
-- Grants. RLS is off (see header). service_role for server-side access; anon/authenticated
-- because the Next.js route handlers currently use the publishable key. Revisit before any
-- deployment beyond the demo.
-- =============================================================================================
grant usage on schema public to service_role, anon, authenticated;
grant all on all tables in schema public to service_role, anon, authenticated;
grant execute on all functions in schema public to service_role, anon, authenticated;
