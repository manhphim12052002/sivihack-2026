-- Persistence for the decision engine (apps/web/src/lib/match). The web already writes these
-- four tables from `assemble.ts`; until now no migration created them, so every write was a
-- silent no-op. One evaluation = one (tender lot, company, bid scope); its atomic checks are
-- match_results, grouped by matching_tasks; knowledge gaps are the HARD UNCERTAIN checks and
-- the tender facts that were absent.
create table if not exists match_evaluations (
  id             text primary key,
  tender_id      text not null,                    -- lots.lot_key ("tender" is the web's word)
  company_id     text not null references companies (id) on delete cascade,
  scope_type     text not null check (scope_type in ('WHOLE_TENDER', 'LOT')),
  scope_id       text,
  status         text not null check (status in ('VIABLE', 'REVIEW', 'BLOCKED')),
  hard_blockers  int not null default 0,
  hard_unknowns  int not null default 0,
  soft_concerns  int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists match_evaluations_lookup on match_evaluations (tender_id, company_id, scope_id, updated_at desc);

create table if not exists matching_tasks (
  id             text primary key,
  evaluation_id  text not null references match_evaluations (id) on delete cascade,
  requirement_id text not null,
  label          text not null,
  matcher_type   text not null,
  severity       text not null check (severity in ('HARD', 'SOFT')),
  created_at     timestamptz not null default now()
);

create table if not exists match_results (
  id               text primary key,
  evaluation_id    text not null references match_evaluations (id) on delete cascade,
  task_id          text not null,
  status           text not null check (status in ('PASS', 'FAIL', 'UNCERTAIN')),
  severity         text not null check (severity in ('HARD', 'SOFT')),
  method           text not null,
  reason           text not null,
  tender_evidence  jsonb,                          -- [{doc, page, quote_de}] or chunk ids
  company_evidence jsonb,                          -- company_* row ids
  aspect           text,
  override_status  text check (override_status in ('PASS', 'FAIL', 'UNCERTAIN')),
  override_reason  text,
  override_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists match_results_evaluation on match_results (evaluation_id);

create table if not exists match_knowledge_gaps (
  id            text primary key,
  evaluation_id text not null references match_evaluations (id) on delete cascade,
  task_id       text,
  concept       text not null,
  importance    text not null check (importance in ('HARD', 'SOFT')),
  triggered_by  text,
  created_at    timestamptz not null default now()
);

grant select, insert, update, delete on match_evaluations, matching_tasks, match_results, match_knowledge_gaps
  to service_role, anon, authenticated;
