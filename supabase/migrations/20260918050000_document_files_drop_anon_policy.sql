-- Revert the anon/authenticated policy added in 20260918020000: document_files is pipeline-only
-- (apps/web never queries it — grep confirms), and apps/web's own anon-key usage elsewhere was
-- itself the bug (see 20260918050000's sibling change to apps/web/src/lib/supabase.ts, which
-- switches the web app to the service_role key). RLS stays enabled with no policy, same as the
-- other tables the pipeline touches via its postgres connection.
drop policy if exists document_files_app_access on document_files;
