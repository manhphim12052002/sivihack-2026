-- lots_current: lots_latest minus notices superseded by a corrigendum published under a NEW notice id.
--
-- Two amendment styles appear in the feed (measured on the 14-day batch, 430 amended lot rows):
--   * eforms-sdk-0.1 (national) reuses the notice id and bumps the version ('2' -> '3');
--     lots_latest already keeps the newest version per notice id.
--   * eforms-de-2.1 (EU threshold) publishes the corrigendum as a fresh notice id and points back with
--     BT-758, stored as lots.changed_notice_id = '<predecessor notice id>-<predecessor version>'.
--     lots_latest cannot collapse those, so a screening list built on it would show both the original
--     and its correction. This view hides the predecessor when its successor is in the table.
-- Additive: lots_latest is unchanged and still the right view for "every version I know about".
create or replace view lots_current as
  select l.*
    from lots_latest l
   where not exists (
     select 1
       from lots c
      where c.notice_id <> l.notice_id
        and c.changed_notice_id in (l.notice_id, l.notice_id || '-' || l.notice_version)
   );

grant select on lots_current to service_role, anon, authenticated;
