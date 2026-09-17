-- Smoke test for the resolution view, the job queue and observation immutability.
-- Run against a local stack after `supabase db reset`:
--   psql "postgresql://postgres:postgres@127.0.0.1:55322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/resolution_smoke.sql
-- Everything runs inside one transaction that is rolled back, so the database is left unchanged.

\set ON_ERROR_STOP on
begin;

-- Sources: one Notice version and two documents.
insert into source (id, kind, url, status, platform) values
  ('notice:SMOKE-1:01', 'notice',   'https://example.test/notice/SMOKE-1', 'available', 'oeffentlichevergabe.de'),
  ('doc:aaa',           'document', 'https://example.test/docs/Bedingungen.pdf', 'available', 'example.test'),
  ('doc:bbb',           'document', 'https://example.test/docs/Vertrag.pdf',     'available', 'example.test');

-- One Lot.
insert into lot (source, notice_id, notice_version, lot_id, title, cpv_main, published)
values ('oeffentlichevergabe', 'SMOKE-1', '01', 'LOT-0001', 'Smoke lot', '45000000', now());

-- Case A: xpath says 5, llm_doc says 10, llm_notice says 5. Winner is xpath (5); the disagreeing
-- document reading must be flagged, not hidden.
insert into observation (scope_type, scope_key, kind, attribute, extractor, source_id,
                         value_num, unit, state, evidence_quote, locator, page, confidence) values
  ('LOT', 'oeffentlichevergabe|SMOKE-1|01|LOT-0001', 'requirement', 'performance_guarantee', 'xpath',
   'notice:SMOKE-1:01', 5,  'pct', 'KNOWN', 'Vertragserfüllungsbürgschaft 5 %', 'xpath:BT-75', null, 'high'),
  ('LOT', 'oeffentlichevergabe|SMOKE-1|01|LOT-0001', 'requirement', 'performance_guarantee', 'llm_doc',
   'doc:aaa', 10, 'pct', 'KNOWN', 'Sicherheit für die Vertragserfüllung: 10 v. H.', 'Bedingungen.pdf#p.2', 2, 'medium'),
  ('LOT', 'oeffentlichevergabe|SMOKE-1|01|LOT-0001', 'requirement', 'performance_guarantee', 'llm_notice',
   'notice:SMOKE-1:01', 5, 'pct', 'KNOWN', 'Bürgschaft in Höhe von 5 %', 'BT-750', null, 'low');

-- Case B: two documents at the same precedence disagree -> CONFLICTING, no value.
insert into observation (scope_type, scope_key, kind, attribute, extractor, source_id,
                         value_num, unit, state, evidence_quote, locator, page, confidence) values
  ('LOT', 'oeffentlichevergabe|SMOKE-1|01|LOT-0001', 'requirement', 'penalty_clause', 'llm_doc',
   'doc:aaa', 0.2, 'pct_per_day', 'KNOWN', 'Vertragsstrafe 0,2 % je Werktag', 'Bedingungen.pdf#p.4', 4, 'medium'),
  ('LOT', 'oeffentlichevergabe|SMOKE-1|01|LOT-0001', 'requirement', 'penalty_clause', 'llm_doc',
   'doc:bbb', 0.5, 'pct_per_day', 'KNOWN', 'Vertragsstrafe 0,5 % je Werktag', 'Vertrag.pdf#p.7', 7, 'medium');

-- Case C: two documents at the same precedence agree -> one KNOWN value, evidence from both.
insert into observation (scope_type, scope_key, kind, attribute, extractor, source_id,
                         value_num, unit, state, evidence_quote, locator, page, confidence) values
  ('LOT', 'oeffentlichevergabe|SMOKE-1|01|LOT-0001', 'requirement', 'self_performance_minimum', 'llm_doc',
   'doc:aaa', 30, 'pct', 'KNOWN', 'mindestens 30 % der Leistung im eigenen Betrieb', 'Bedingungen.pdf#p.3', 3, 'medium'),
  ('LOT', 'oeffentlichevergabe|SMOKE-1|01|LOT-0001', 'requirement', 'self_performance_minimum', 'llm_doc',
   'doc:bbb', 30.0, 'pct', 'KNOWN', 'Eigenleistungsanteil 30 %', 'Vertrag.pdf#p.2', 2, 'medium');

-- Case D: nothing KNOWN; the notice defers to the documents and the notice text says nothing.
-- REFERRED_TO_DOCUMENTS beats NOT_FOUND.
insert into observation (scope_type, scope_key, kind, attribute, extractor, source_id,
                         state, evidence_quote, locator, confidence) values
  ('PROCEDURE', 'oeffentlichevergabe|SMOKE-1', 'requirement', 'comparable_references', 'llm_notice',
   'notice:SMOKE-1:01', 'NOT_FOUND', null, 'BT-750', 'not_found'),
  ('PROCEDURE', 'oeffentlichevergabe|SMOKE-1', 'requirement', 'comparable_references', 'rule',
   'notice:SMOKE-1:01', 'REFERRED_TO_DOCUMENTS', 'siehe Vergabeunterlagen', 'BT-750', 'medium');

do $$
declare r observation_resolved%rowtype;
begin
  -- Case A
  select * into strict r from observation_resolved
   where scope_key = 'oeffentlichevergabe|SMOKE-1|01|LOT-0001' and attribute = 'performance_guarantee';
  assert r.state = 'KNOWN',                          'A: state ' || r.state;
  assert r.extractor = 'xpath',                      'A: extractor ' || r.extractor;
  assert r.value_num = 5,                            'A: value ' || coalesce(r.value_num::text, 'null');
  assert r.confidence = 'high',                      'A: confidence ' || r.confidence;
  assert r.source_count = 1,                         'A: source_count ' || r.source_count;
  assert jsonb_array_length(r.evidence) = 1,         'A: evidence ' || r.evidence::text;
  assert r.has_lower_precedence_disagreement = true, 'A: lower-precedence disagreement not flagged';
  raise notice 'A ok: xpath wins with %, lower-precedence disagreement flagged', r.value_num;

  -- Case B
  select * into strict r from observation_resolved
   where scope_key = 'oeffentlichevergabe|SMOKE-1|01|LOT-0001' and attribute = 'penalty_clause';
  assert r.state = 'CONFLICTING',                    'B: state ' || r.state;
  assert r.value_num is null and r.value_text is null and r.condition is null, 'B: value must be null';
  assert r.source_count = 2,                         'B: source_count ' || r.source_count;
  assert jsonb_array_length(r.evidence) = 2,         'B: evidence ' || r.evidence::text;
  assert r.has_lower_precedence_disagreement = false,'B: no lower tier exists';
  raise notice 'B ok: CONFLICTING with % evidence rows', jsonb_array_length(r.evidence);

  -- Case C
  select * into strict r from observation_resolved
   where scope_key = 'oeffentlichevergabe|SMOKE-1|01|LOT-0001' and attribute = 'self_performance_minimum';
  assert r.state = 'KNOWN',                          'C: state ' || r.state;
  assert r.value_num = 30,                           'C: value ' || coalesce(r.value_num::text, 'null');
  assert r.source_count = 2,                         'C: source_count ' || r.source_count;
  assert jsonb_array_length(r.evidence) = 2,         'C: evidence ' || r.evidence::text;
  raise notice 'C ok: agreeing documents merged, % sources', r.source_count;

  -- Case D
  select * into strict r from observation_resolved
   where scope_key = 'oeffentlichevergabe|SMOKE-1' and attribute = 'comparable_references';
  assert r.state = 'REFERRED_TO_DOCUMENTS',          'D: state ' || r.state;
  assert r.extractor = 'rule',                       'D: extractor ' || r.extractor;
  assert r.value_num is null and r.value_text is null, 'D: value must be null';
  assert r.evidence->0->>'quote' = 'siehe Vergabeunterlagen', 'D: evidence ' || r.evidence::text;
  raise notice 'D ok: REFERRED_TO_DOCUMENTS beats NOT_FOUND';

  -- lot_latest picks the newest version
  insert into lot (source, notice_id, notice_version, lot_id, title)
  values ('oeffentlichevergabe', 'SMOKE-1', '02', 'LOT-0001', 'Smoke lot, corrected');
  assert (select count(*) from lot_latest where notice_id = 'SMOKE-1') = 1, 'lot_latest: one row per lot';
  assert (select notice_version from lot_latest where notice_id = 'SMOKE-1') = '02', 'lot_latest: newest version';
  assert (select procedure_key from lot_latest where notice_id = 'SMOKE-1') = 'oeffentlichevergabe|SMOKE-1', 'lot_latest: procedure_key';
  raise notice 'lot_latest ok';
end
$$;

-- Job queue: one queued job, claimed once, second claim returns null.
insert into ingest_job (id, payload) values ('job-smoke-1', '{"url": "https://example.test/notice/SMOKE-1"}');
do $$
declare j ingest_job;
begin
  j := claim_ingest_job();
  assert j.id = 'job-smoke-1',        'claim 1: got ' || coalesce(j.id, 'null');
  assert j.stage = 'downloading',     'claim 1: stage ' || j.stage;
  j := claim_ingest_job();
  assert j is null,                   'claim 2: expected null, got ' || coalesce(j.id, 'null');
  raise notice 'claim_ingest_job ok: first claim %, second claim null', 'job-smoke-1';
end
$$;

-- Immutability: UPDATE and DELETE on observation must raise.
do $$
begin
  begin
    update observation set value_num = 99 where attribute = 'performance_guarantee';
    raise exception 'observation UPDATE was not rejected';
  exception when others then
    if sqlerrm not like 'observation rows are immutable%' then raise; end if;
    raise notice 'immutability ok (update): %', sqlerrm;
  end;
  begin
    delete from observation where attribute = 'performance_guarantee';
    raise exception 'observation DELETE was not rejected';
  exception when others then
    if sqlerrm not like 'observation rows are immutable%' then raise; end if;
    raise notice 'immutability ok (delete): %', sqlerrm;
  end;
end
$$;

select scope_key, attribute, extractor, state, value_num, confidence, source_count,
       has_lower_precedence_disagreement
  from observation_resolved
 order by scope_key, attribute;

rollback;
