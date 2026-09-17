-- Tender screening: initial schema.
--
-- Vocabulary follows CONTEXT.md. A Procedure has notice versions and Lots; a Source is a Notice
-- version or a fetched document; a Chunk is one page of a Source's text; an Observation is one
-- reading of one Fact or Requirement from one Source by one extractor; the Resolved value is what
-- the read-time view `observation_resolved` selects.
--
-- Row-level security is deliberately NOT enabled. This is a demo: the pipeline and the API talk
-- to Postgres server-side (DATABASE_URL / service-role key); no browser client holds a key. The
-- anon and authenticated roles get no grants. Turning RLS on later is an additive migration.
--
-- Migrations are additive. Never edit this file after it has been applied; add a new one.

-- ---------------------------------------------------------------------------------------------
-- lot: one row per Lot per Notice version. Column set mirrors the SQLite store it replaces.
-- ---------------------------------------------------------------------------------------------
create table lot (
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
create index lot_published on lot (published);
create index lot_cpv_main  on lot (cpv_main);

-- ---------------------------------------------------------------------------------------------
-- source: everything text was read from. A Notice version and a fetched document are both Sources,
-- so observation.source_id is never null.
-- ---------------------------------------------------------------------------------------------
create table source (
  id             text primary key,                  -- 'notice:<notice_id>:<version>' or 'doc:<sha256>'
  kind           text not null check (kind in ('notice', 'document')),
  url            text,
  name           text,                              -- file name as linked
  sha256         text,                              -- content hash; the dedup key for documents
  pages          int,
  bytes          bigint,
  status         text not null check (status in ('available', 'gated', 'unreachable', 'scanned', 'skipped')),
  platform       text,                              -- e-procurement host, named even when gated
  fetched_at     timestamptz,
  rejected_items int not null default 0             -- model items dropped by the quote-substring check
);

-- ---------------------------------------------------------------------------------------------
-- document: which Lot linked which document URL, with the fetch outcome. Several lots can link the
-- same file; the content lives once in source (by sha256).
-- ---------------------------------------------------------------------------------------------
create table document (
  lot_key    text not null,
  url        text not null,
  source_id  text references source (id),           -- null until the file was fetched and hashed
  status     text not null check (status in ('retrieved', 'gated', 'unreachable', 'scanned', 'skipped')),
  platform   text,
  fetched_at timestamptz,
  primary key (lot_key, url)
);
create index document_lot_key on document (lot_key);

-- ---------------------------------------------------------------------------------------------
-- chunk: one page of a Source's extracted text, so every evidence quote is checkable offline.
-- ---------------------------------------------------------------------------------------------
create table chunk (
  source_id text not null references source (id),
  page      int  not null,
  text      text not null,
  primary key (source_id, page)
);

-- ---------------------------------------------------------------------------------------------
-- observation: one reading of one Fact or Requirement from one Source by one extractor.
-- Rows are immutable (ADR 0001): re-running an extractor inserts new rows (or hits the primary key
-- and does nothing); nothing ever updates or deletes a row. Resolution happens in the view below.
-- ---------------------------------------------------------------------------------------------
create table observation (
  scope_type     text not null check (scope_type in ('PROCEDURE', 'LOT')),
  scope_key      text not null,                     -- lot.procedure_key or lot.lot_key
  kind           text not null check (kind in ('fact', 'requirement', 'unmatched')),
  attribute      text not null,                     -- fact-sheet field, Requirement kind, or unmatched category
  extractor      text not null check (extractor in ('xpath', 'rule', 'llm_doc', 'llm_notice')),
  source_id      text not null references source (id),
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
create index observation_scope_key on observation (scope_key);
comment on table observation is
  'Immutable (ADR 0001). One row per (scope, attribute, extractor, source); insert only, never update or delete. Reset the table with TRUNCATE.';

create function observation_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'observation rows are immutable (ADR 0001): % on % rejected; insert a new row instead',
    tg_op, tg_table_name;
end
$$;

create trigger observation_immutable
  before update or delete on observation
  for each row execute function observation_immutable();

-- ---------------------------------------------------------------------------------------------
-- company: typed Company constraints plus the preserved prose they were normalised from.
-- ---------------------------------------------------------------------------------------------
create table company (
  id                     text primary key,
  name                   text not null,
  home_base              text,
  home_base_geo          jsonb,                     -- {lat, lon} of home_base
  regions                jsonb,                     -- array of NUTS codes / Bundesland names
  radius_km              numeric,
  trades                 jsonb,                     -- array of trade names
  cpv_prefixes           jsonb,                     -- array of CPV prefixes the company bids on
  contract_min_eur       numeric,
  contract_max_eur       numeric,
  partner_threshold_eur  numeric,                   -- above this, only as part of a consortium
  references_held        jsonb,                     -- array of reference projects
  hard_exclusions        jsonb,                     -- array of things the company will not bid on
  guarantee_capacity_eur numeric,
  self_perform_share_pct numeric,
  earliest_start         date,
  capacity_per_week      int not null default 3,
  raw_text               text not null default '',
  updated_at             timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- verdict: cached output of the pure screen() function, one row per (Lot, Company, criterion).
-- Recomputed when any Observation or the Company profile is newer than computed_at.
-- ---------------------------------------------------------------------------------------------
create table verdict (
  lot_key          text not null,
  company_id       text not null references company (id),
  criterion        text not null,
  status           text not null check (status in ('Blocker', 'Risk', 'OK', 'Unknown')),
  kind             text not null check (kind in ('numeric', 'semantic')),
  reason_en        text not null,                   -- filled template; carries the untranslated quote
  company_fact     text,
  observation_refs jsonb,                           -- array of observation primary keys behind the reason
  computed_at      timestamptz not null,
  primary key (lot_key, company_id, criterion)
);

-- ---------------------------------------------------------------------------------------------
-- sync_state: the poll watermark and other single-value pipeline state.
-- ---------------------------------------------------------------------------------------------
create table sync_state (
  key   text primary key,
  value text not null
);

-- ---------------------------------------------------------------------------------------------
-- ingest_job: the job queue. The table is the contract; API writes rows, a worker claims them.
-- ---------------------------------------------------------------------------------------------
create table ingest_job (
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
create index ingest_job_stage_created on ingest_job (stage, created_at);

-- Claim the oldest queued job for this worker. SKIP LOCKED lets several workers (API background
-- task, CLI, a second process) drain the same table without handing one job to two of them.
-- Returns NULL when nothing is queued.
create function claim_ingest_job() returns ingest_job
language sql as $$
  update ingest_job
     set stage = 'downloading', updated_at = now()
   where id = (
     select id from ingest_job
      where stage = 'queued'
      order by created_at
      limit 1
      for update skip locked
   )
  returning *;
$$;

-- ---------------------------------------------------------------------------------------------
-- lot_latest: one row per Lot at its newest Notice version.
-- Assumption: notice_version strings compare correctly by (length, text). The publisher
-- zero-pads ('01', '02'), which sorts lexically; the length key keeps a bare '10' after '9' if a
-- feed ever sends unpadded integers.
-- ---------------------------------------------------------------------------------------------
create view lot_latest as
  select distinct on (source, notice_id, lot_id) *
    from lot
   order by source, notice_id, lot_id, length(notice_version) desc, notice_version desc;

-- ---------------------------------------------------------------------------------------------
-- observation_resolved: the Resolved value per (scope_key, attribute), per ADR 0001.
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
-- typed condition JSON. Procedure-scoped rows are not inherited here; the API joins them by
-- lot.procedure_key.
-- ---------------------------------------------------------------------------------------------
create view observation_resolved as
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
    from observation o
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

-- ---------------------------------------------------------------------------------------------
-- Grants. Only the service role (server-side) may reach these through the Data API; anon and
-- authenticated get nothing. The pipeline itself connects as postgres via DATABASE_URL.
-- ---------------------------------------------------------------------------------------------
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
