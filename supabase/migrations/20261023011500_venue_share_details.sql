-- What a venue's share pictures show (native-app plan Phase 9e, Andrew 2026-10-22: one choice
-- per venue). The partner picks any mix of the bar's name, address and Instagram handle; the
-- handle also goes in the share caption. Defaults = today's pictures unchanged (name + address
-- on, no handle stored).
--
-- Adds columns to an existing table only: no new table, view or sequence, so no new grant
-- (venues' table-level grants in 20260923130841_explicit_api_grants_baseline.sql cover new
-- columns). The browser reads these with the venue list it already loads (lib/venues.ts);
-- writes go only through the server (service_role).

alter table public.venues
  add column if not exists instagram_handle text null,
  add column if not exists share_show_name boolean not null default true,
  add column if not exists share_show_address boolean not null default true,
  add column if not exists share_show_instagram boolean not null default true;

-- Stored without the "@" (lib/venueShareDetails.ts parseInstagramHandle). Instagram's own rule:
-- letters, digits, "." and "_", at most 30 characters.
alter table public.venues
  drop constraint if exists venues_instagram_handle_format;

alter table public.venues
  add constraint venues_instagram_handle_format
  check (instagram_handle is null or instagram_handle ~ '^[A-Za-z0-9._]{1,30}$');
