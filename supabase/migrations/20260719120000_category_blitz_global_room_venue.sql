-- Phase 0 of the Category Blitz global-room plan (docs/category-blitz-global-room-plan.md).
-- Adds a `hidden` flag to venues (never shown in any venue picker/list) and
-- seeds one hidden venue row to act as the pooled "global room" when
-- NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM is enabled. Coordinates/radius are
-- placeholders only — the hidden flag, not geofence math, is what keeps this
-- venue out of every join/venue-list flow.
--
-- The row id is deliberately opaque (`hc-cbz-live`, not "global-room"): under
-- pooling this id is the only thing that can surface client-side, as the
-- realtime channel name. Keeping it non-descriptive means an inspecting user
-- can't infer that every venue shares one room (requirement: never reveal the
-- shared room on the frontend). The human-readable name column stays internal —
-- it is never sent to a player client.

alter table venues add column if not exists hidden boolean not null default false;

insert into venues (id, name, latitude, longitude, radius, hidden)
values (
  'hc-cbz-live',
  'Category Blitz Global Room (internal)',
  0,
  0,
  0,
  true
)
on conflict (id) do nothing;

-- Seed a continuous-mode config for the room so it runs an endless loop on its
-- own, independent of the NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT rollout
-- flag. 180s play / 180s gap matches the current global cadence.
insert into category_blitz_continuous_config (
  venue_id, is_active, round_duration_seconds, intermission_seconds, mode_selection
)
values ('hc-cbz-live', true, 180, 180, 'random')
on conflict (venue_id) do nothing;
