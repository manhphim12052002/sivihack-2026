-- Additive Company Intelligence v2. Apply after migration.sql. Existing flat columns are retained as legacy input only.
alter table companies add column if not exists intelligence_version integer;
alter table companies add column if not exists revision integer not null default 0;
alter table companies add column if not exists geography jsonb;
alter table companies add column if not exists commercial_profile jsonb;
alter table companies add column if not exists field_evidence jsonb not null default '{}';
alter table companies alter column capacity_per_week drop default;
alter table companies alter column capacity_per_week drop not null;
alter table company_qualifications add column if not exists knowledge_state text check (knowledge_state in ('KNOWN_PRESENT','KNOWN_ABSENT'));
-- Legacy qualification rows need review; neither presence nor absence can be inferred safely.
alter table company_constraints add column if not exists operator text not null default 'EXCLUDE';
alter table company_constraints add column if not exists severity text not null default 'HARD';
alter table company_preferences add column if not exists operator text not null default 'PREFER';
alter table company_preferences add column if not exists severity text not null default 'SOFT';
alter table company_constraints add column if not exists status text not null default 'PENDING';
alter table company_constraints add column if not exists evidence jsonb not null default '[]';
alter table company_constraints add column if not exists state text not null default 'EXPLICIT';
alter table company_constraints add column if not exists raw_value text;
alter table company_preferences add column if not exists status text not null default 'PENDING';
alter table company_preferences add column if not exists evidence jsonb not null default '[]';
alter table company_preferences add column if not exists state text not null default 'EXPLICIT';
alter table company_preferences add column if not exists raw_value text;
create table if not exists company_resources (
 id text primary key, company_id text not null references companies(id) on delete cascade,
 type text not null, label text not null, value numeric, unit text,
 available_from date, valid_as_of date, raw_value text,
 state text not null check (state in ('EXPLICIT','NORMALIZED','AMBIGUOUS','UNKNOWN')),
 origin text not null, status text not null default 'PENDING', evidence jsonb not null default '[]',
 created_at timestamptz not null default now()
);
create table if not exists company_capacity (
 id text primary key, company_id text not null references companies(id) on delete cascade,
 type text not null, label text not null, value numeric, unit text,
 available_from date, valid_as_of date, raw_value text,
 state text not null check (state in ('EXPLICIT','NORMALIZED','AMBIGUOUS','UNKNOWN')),
 origin text not null, status text not null default 'PENDING', evidence jsonb not null default '[]',
 created_at timestamptz not null default now()
);
-- Exact money for new reference writes, leaving the original REAL column intact.
alter table company_references add column if not exists value_eur numeric;
update company_references set value_eur = contract_value_eur::numeric where value_eur is null;

-- Atomic replacement of the normalized aggregate, with optimistic concurrency.
-- Geography/commercial JSON contain company-level facts only; collections live exclusively in child tables.
create or replace function save_company_intelligence(payload jsonb, expected_revision integer)
returns integer language plpgsql security invoker set search_path = public as $$
declare cid text := payload->>'company_id'; current_revision integer; item jsonb;
begin
 select revision into current_revision from companies where id=cid for update;
 if not found then raise exception 'Company not found'; end if;
 if current_revision <> expected_revision then raise exception 'PROFILE_CONFLICT: Reload before saving'; end if;
 update companies set
 name=payload->'identity'->>'name', headquarters=coalesce(payload->'identity'->>'headquarters',''),
 employees=(payload->'identity'->>'employees')::integer,
 revenue_eur=(payload->'identity'->>'revenue_eur')::numeric,
 website=payload->'identity'->>'website', geography=payload->'geography',
 commercial_profile=payload->'commercial_profile', field_evidence=coalesce(payload->'field_evidence','{}'),
 cpv_prefixes=coalesce(payload->'cpv_prefixes','[]'),
 intelligence_version=2, revision=current_revision+1, updated_at=now()
 where id=cid;
 delete from company_capabilities where company_id=cid;
 for item in select * from jsonb_array_elements(coalesce(payload->'capabilities','[]')) loop
 insert into company_capabilities (company_id,id,type,label,origin,status,evidence) values (cid,item->>'id',item->>'type',item->>'label',item->>'origin',item->>'status',coalesce(item->'evidence', '[]'::jsonb));
 end loop;
 delete from company_references where company_id=cid;
 for item in select * from jsonb_array_elements(coalesce(payload->'references','[]')) loop
 insert into company_references (company_id,id,name,client,project_types,location,value_eur,completed_at,capabilities,origin,status,evidence) values (cid,item->>'id',item->>'name',item->>'client',coalesce(item->'project_types', '[]'::jsonb),item->>'location',(item->>'contract_value_eur')::numeric,item->>'completed_at',coalesce(item->'capabilities', '[]'::jsonb),item->>'origin',item->>'status',coalesce(item->'evidence', '[]'::jsonb));
 end loop;
 delete from company_qualifications where company_id=cid;
 for item in select * from jsonb_array_elements(coalesce(payload->'qualifications','[]')) loop
 insert into company_qualifications (company_id,id,type,label,knowledge_state,status,valid_from,valid_until,freshness,origin,evidence) values (cid,item->>'id',item->>'type',item->>'label',item->>'knowledge_state',item->>'status',item->>'valid_from',item->>'valid_until',item->>'freshness',item->>'origin',coalesce(item->'evidence', '[]'::jsonb));
 end loop;
 delete from company_resources where company_id=cid;
 for item in select * from jsonb_array_elements(coalesce(payload->'resources','[]')) loop
 insert into company_resources (company_id,id,type,label,value,unit,available_from,valid_as_of,raw_value,state,origin,status,evidence) values (cid,item->>'id',item->>'type',item->>'label',(item->>'value')::numeric,item->>'unit',(item->>'available_from')::date,(item->>'valid_as_of')::date,item->>'raw_value',item->>'state',item->>'origin',item->>'status',coalesce(item->'evidence', '[]'::jsonb));
 end loop;
 delete from company_capacity where company_id=cid;
 for item in select * from jsonb_array_elements(coalesce(payload->'capacity','[]')) loop
 insert into company_capacity (company_id,id,type,label,value,unit,available_from,valid_as_of,raw_value,state,origin,status,evidence) values (cid,item->>'id',item->>'type',item->>'label',(item->>'value')::numeric,item->>'unit',(item->>'available_from')::date,(item->>'valid_as_of')::date,item->>'raw_value',item->>'state',item->>'origin',item->>'status',coalesce(item->'evidence', '[]'::jsonb));
 end loop;
 delete from company_constraints where company_id=cid;
 for item in select * from jsonb_array_elements(coalesce(payload->'constraints','[]')) loop
 insert into company_constraints (company_id,id,type,operator,value,severity,origin,status,evidence,state,raw_value) values (cid,item->>'id',item->>'type',item->>'operator',item->>'value',item->>'severity',item->>'origin',item->>'status',coalesce(item->'evidence', '[]'::jsonb),item->>'state',item->>'raw_value');
 end loop;
 delete from company_preferences where company_id=cid;
 for item in select * from jsonb_array_elements(coalesce(payload->'preferences','[]')) loop
 insert into company_preferences (company_id,id,type,operator,value,severity,origin,status,evidence,state,raw_value) values (cid,item->>'id',item->>'type',item->>'operator',item->>'value',item->>'severity',item->>'origin',item->>'status',coalesce(item->'evidence', '[]'::jsonb),item->>'state',item->>'raw_value');
 end loop;
 delete from company_knowledge_gaps where company_id=cid;
 for item in select * from jsonb_array_elements(coalesce(payload->'knowledge_gaps','[]')) loop
 insert into company_knowledge_gaps (company_id,id,type,state,reason) values (cid,item->>'id',item->>'type',item->>'state',item->>'reason');
 end loop;
 return current_revision+1;
end; $$;
revoke all on function save_company_intelligence(jsonb, integer) from public;
grant execute on function save_company_intelligence(jsonb, integer) to service_role;
