-- documents(lot_key, url) -> source_id is a single nullable column: one document link, one
-- Source. A fetched package unpacks into many files, each its own Source (content-addressed
-- by sha256), so `documents` alone cannot say which files came from which package fetch.
-- Without this, "was this package already retrieved for this lot" has no reliable answer:
-- guessing from `sources.url` breaks the moment two different packages share a file's sha256
-- (an update to `sources` never rewrites `url`, so the row keeps whichever package first wrote
-- it) and a LIKE pattern in a real portal URL (which routinely contains `_` and `%`) matches
-- more files than intended.
--
-- document_files is the missing many-to-many link, additive and tender-only.
create table if not exists document_files (
  lot_key   text not null,
  url       text not null,
  source_id text not null references sources (id),
  primary key (lot_key, url, source_id)
);
create index if not exists document_files_lot_url on document_files (lot_key, url);

-- Indexes for enrich's per-file idempotency check and the document-store lookup, both
-- previously unindexed sequential scans that grow with the table.
create index if not exists observations_source_extractor_prompt
  on observations (source_id, extractor, prompt_version);

grant select, insert, update, delete on document_files to service_role, anon, authenticated;
