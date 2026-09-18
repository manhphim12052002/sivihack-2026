-- cpv_descriptions: CPV (Common Procurement Vocabulary) code -> description, English and German.
--
-- The eForms SDK codelist (apps/pipeline/src/tender_extract/cpv.py) is an OASIS Genericode file
-- with one label column per language; a notice's BT-262/BT-263 fields carry only the bare code
-- (e.g. "45311200"), never the label. This table is the resolved, queryable mirror of that
-- codelist, seeded and refreshed by `python -m tender_extract.cpv --load-db` (see that module).
-- It is reference data (the EU's own public vocabulary), not tender-specific, so it carries no
-- foreign keys to lots -- lots.cpv_main / lots.cpv_additional join to it by code.
create table if not exists cpv_descriptions (
  code            text primary key,       -- 8-digit CPV code, e.g. '45311200'
  description_en  text,                   -- label-eng from the codelist; null if that column is absent
  description_de  text,                   -- label-deu from the codelist; null if that column is absent
  updated_at      timestamptz not null default now()
);

grant select, insert, update, delete on cpv_descriptions to service_role, anon, authenticated;
