-- init.sql's "RLS off" note is stale: companies/sources/chunks and every company_* table
-- already have RLS enabled on the hosted project (created by hand pre-init.sql, before that
-- comment was written) — just with no policy, which silently blocks the anon key the web app
-- actually uses (apps/web/src/lib/supabase.ts). Match the RLS-on posture here, but with a
-- policy so the app keeps working; the missing policies on the older tables are a separate,
-- pre-existing gap, not addressed by this migration.
grant truncate, references, trigger on document_files to service_role, anon, authenticated;
alter table document_files enable row level security;
create policy document_files_app_access on document_files
  for all
  to anon, authenticated
  using (true)
  with check (true);
