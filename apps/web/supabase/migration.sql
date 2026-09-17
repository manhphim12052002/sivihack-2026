-- SiviHack 2026 — Company Intelligence Pipeline
-- Run this entire file in the Supabase SQL editor (Database > SQL editor > New query)

-- ─── Shared infrastructure ───────────────────────────────────────────────────

create table if not exists sources (
  id          text primary key,
  entity_type text not null,          -- 'company' | 'tender'
  entity_id   text not null,
  type        text not null,          -- PDF | DOCX | XLSX | TXT | MANUAL
  filename    text,
  origin      text not null,          -- CUSTOMER_UPLOAD | MANUAL_INPUT
  sha256      text,
  storage_path text,                  -- path in Supabase Storage
  status      text not null default 'AVAILABLE',
  created_at  timestamptz not null default now()
);

create table if not exists chunks (
  id          text primary key,
  source_id   text not null references sources(id),
  page        integer,
  section     text,
  paragraph   integer,
  cell_range  text,                   -- XLSX range e.g. "A12:F20"
  text        text not null,
  created_at  timestamptz not null default now()
);

-- ─── Companies ───────────────────────────────────────────────────────────────

create table if not exists companies (
  id                     text primary key,
  name                   text not null,
  headquarters           text not null default '',
  employees              integer,
  revenue_eur            real,
  website                text,
  description            text,
  status                 text not null default 'ONBOARDING',
  -- typed screening fields (matches CompanyProfile in api.ts)
  home_base              text not null default '',
  regions                jsonb,
  radius_km              real,
  trades                 jsonb,
  cpv_prefixes           jsonb,
  contract_min_eur       real,
  contract_max_eur       real,
  partner_threshold_eur  real,
  references_held        jsonb,
  hard_exclusions        jsonb,
  guarantee_capacity_eur real,
  self_perform_share_pct real,
  earliest_start         text,
  capacity_per_week      integer not null default 3,
  raw_text               text not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table if not exists company_capabilities (
  id         text primary key,
  company_id text not null references companies(id) on delete cascade,
  type       text not null,           -- e.g. ROAD_CONSTRUCTION
  label      text not null,
  origin     text not null,           -- DOCUMENT_EXTRACTED | CUSTOMER_PROVIDED
  status     text not null default 'PENDING',  -- PENDING | CONFIRMED | REJECTED
  evidence   jsonb,                   -- chunk_id[]
  created_at timestamptz not null default now()
);

create table if not exists company_references (
  id                 text primary key,
  company_id         text not null references companies(id) on delete cascade,
  name               text not null,
  client             text,
  project_types      jsonb,
  location           text,
  contract_value_eur real,
  completed_at       text,
  capabilities       jsonb,
  origin             text not null,
  status             text not null default 'PENDING',
  evidence           jsonb,
  created_at         timestamptz not null default now()
);

create table if not exists company_qualifications (
  id          text primary key,
  company_id  text not null references companies(id) on delete cascade,
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
  company_id text not null references companies(id) on delete cascade,
  type       text not null,
  value      text,
  unit       text,
  origin     text not null default 'CUSTOMER_PROVIDED',
  created_at timestamptz not null default now()
);

create table if not exists company_constraints (
  id         text primary key,
  company_id text not null references companies(id) on delete cascade,
  type       text not null,
  value      text,
  unit       text,
  origin     text not null default 'CUSTOMER_PROVIDED',
  created_at timestamptz not null default now()
);

create table if not exists company_knowledge_gaps (
  id         text primary key,
  company_id text not null references companies(id) on delete cascade,
  type       text not null,
  state      text not null default 'UNKNOWN',  -- KNOWN_PRESENT | KNOWN_ABSENT | UNKNOWN | STALE
  reason     text,
  created_at timestamptz not null default now()
);

create table if not exists company_ingest_jobs (
  id         text primary key,
  company_id text not null references companies(id) on delete cascade,
  stage      text not null default 'queued',
  pct        integer not null default 0,
  message    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Matching Engine ─────────────────────────────────────────────────────────

create table if not exists match_evaluations (
  id            text primary key,
  tender_id     text not null,
  company_id    text not null references companies(id) on delete cascade,
  scope_type    text not null default 'WHOLE_TENDER',
  scope_id      text,
  status        text not null default 'VIABLE',  -- VIABLE | REVIEW | BLOCKED
  hard_blockers integer not null default 0,
  hard_unknowns integer not null default 0,
  soft_concerns integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists matching_tasks (
  id             text primary key,
  evaluation_id  text not null references match_evaluations(id) on delete cascade,
  requirement_id text not null,
  label          text not null,
  matcher_type   text not null,  -- RULE | ONTOLOGY | SEMANTIC | REFERENCE
  severity       text not null default 'HARD',
  tender_value   jsonb,
  company_value  jsonb,
  created_at     timestamptz not null default now()
);

create table if not exists match_results (
  id               text primary key,
  evaluation_id    text not null references match_evaluations(id) on delete cascade,
  task_id          text not null references matching_tasks(id) on delete cascade,
  status           text not null,   -- PASS | FAIL | UNCERTAIN
  severity         text not null,
  method           text not null,
  reason           text not null,
  tender_evidence  jsonb,
  company_evidence jsonb,
  aspect           text,
  override_status  text,
  override_reason  text,
  override_at      timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists match_knowledge_gaps (
  id            text primary key,
  evaluation_id text not null references match_evaluations(id) on delete cascade,
  task_id       text,
  concept       text not null,
  importance    text not null default 'HARD_REQUIREMENT',
  triggered_by  text,
  created_at    timestamptz not null default now()
);

-- ─── Storage bucket ──────────────────────────────────────────────────────────
-- Run separately in Storage > New bucket if it doesn't exist:
-- bucket name: company-documents, public: false
