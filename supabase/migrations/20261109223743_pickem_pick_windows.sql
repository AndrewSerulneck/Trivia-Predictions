-- Pick 'Em pick windows (docs/cancelled-prizes-pick-windows-away-mode-plan.md Phase B1, D2).
--
-- venue_game_settings.pickem_pick_windows: per sport, when the bar's players may make Pick 'Em picks,
-- e.g. {"ncaaf": {"open_day": "mon", "open_time": "00:00", "close_day": "wed", "close_time": "23:59"}}.
-- Keys are Pick 'Em sport slugs (lib/pickemSports.ts; "nfl" = NFL Pick 'Em); days are sun..sat, times
-- "HH:MM" 24-hour in the venue's time zone. A sport not listed is always open (today's behaviour), so
-- the default '{}' changes nothing. Shape rules live in lib/pickemPickWindow.ts, which also drops a
-- malformed entry on read (= always open); the check here only keeps the value an object.
--
-- A column, not a table, so the one settings read that picks already make carries the windows.
-- Grants: venue_game_settings is service_role-only (20260923130841 baseline) and a new column
-- inherits that; the browser never reads it.

alter table public.venue_game_settings
  add column if not exists pickem_pick_windows jsonb not null default '{}'::jsonb;

alter table public.venue_game_settings
  drop constraint if exists venue_game_settings_pickem_pick_windows_object;

alter table public.venue_game_settings
  add constraint venue_game_settings_pickem_pick_windows_object
  check (jsonb_typeof(pickem_pick_windows) = 'object');
