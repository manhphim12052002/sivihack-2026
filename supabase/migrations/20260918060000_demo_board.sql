-- Demo board relations: company_profiles and demo_lots.
--
-- The triage UI (/api/companies, /api/tenders, /api/screen) screens a flat company profile
-- against a flat lot fact sheet -- the CompanyProfile / TenderDetail shapes in
-- apps/web/src/lib/api-types.d.ts. That is a different shape from the canonical company
-- aggregate (companies + company_* child tables) and from the pipeline's lots/observations,
-- so it gets its own two relations instead of being derived on every read.
--
-- Both are seeded from apps/web/src/assets/{companies,lots}.json on first read (see
-- apps/web/src/lib/assets.ts); the columns below mirror those fixtures field for field.
-- List-valued fields stay jsonb so a row round-trips to the API model unchanged.

create table if not exists company_profiles (
  id                     text primary key,
  name                   text not null,
  home_base              text not null default '',
  home_base_geo          jsonb,                    -- GeoPoint, null when the city is unknown
  regions                jsonb not null default '[]',
  radius_km              numeric,
  trades                 jsonb not null default '[]',
  cpv_prefixes           jsonb not null default '[]',
  contract_min_eur       numeric,
  contract_max_eur       numeric,
  partner_threshold_eur  numeric,
  guarantee_capacity_eur numeric,
  self_perform_share_pct numeric,
  earliest_start         text,                     -- ISO date or a free-text window ("March")
  capacity_per_week      numeric,
  references_held        jsonb not null default '[]',
  hard_exclusions        jsonb not null default '[]',
  raw_text               text not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table if not exists demo_lots (
  id                  text primary key,            -- lot id as shown in the UI, e.g. 'lot-hh-schule'
  title               text,
  buyer_name          text,
  place_city          text,
  place_nuts          text,
  cpv_main            text,
  estimated_value_eur numeric,
  submission_deadline text,
  published           text,
  notice_url          text,
  lot_count           integer not null default 1,
  docs_retrieved      boolean not null default false,
  source              text not null default 'oeffentlichevergabe.de',
  description         text,
  lots                jsonb,                       -- Lot[]: sibling lots of the same procedure
  notice              jsonb,
  documents           jsonb,                       -- TenderDocument[]
  fact_sheet          jsonb,                       -- TenderFactSheet: the 15 screened fields
  created_at          timestamptz not null default now()
);

grant select, insert, update, delete on company_profiles to service_role, anon, authenticated;
grant select, insert, update, delete on demo_lots to service_role, anon, authenticated;
