-- Align this existing project with Supabase's upcoming explicit-GRANT posture.
-- Existing tables keep working because we grant only what the app needs.
-- New tables in public will not be API-accessible unless explicitly granted.

-- 1) Secure defaults for FUTURE tables created by postgres in public schema.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

-- 2) Explicit grants for CURRENT fantasy-related API tables.

-- players: read-only public catalog
revoke all on table public.players from anon, authenticated;
grant select on table public.players to anon, authenticated;

-- live_player_stats: read-only for client fantasy score displays
revoke all on table public.live_player_stats from anon, authenticated;
grant select on table public.live_player_stats to anon, authenticated;

-- fantasy_entries: authenticated users can read/create/update their own rows (RLS-enforced)
revoke all on table public.fantasy_entries from anon, authenticated;
grant select, insert, update on table public.fantasy_entries to authenticated;
