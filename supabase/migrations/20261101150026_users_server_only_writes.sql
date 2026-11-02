-- Pick 'Em Phase 7.1b (docs/pickem-college-football-and-prize-plan.md §9 finding F1, §8 Q4 —
-- Andrew, 2026-11-01: "Yes"): players can no longer write public.users through the public API.
--
-- Before this file, anon/authenticated held ALL privileges on the table
-- (20260923130841_explicit_api_grants_baseline.sql) and two RLS policies from
-- 20260214153000_initial_schema.sql ("Users can create own profiles", "Users can update own
-- profiles") let a signed-in player insert a profile and change their own row — including
-- users.points — with the public key every phone already has. Every player holds an
-- authenticated Supabase session in the browser (signInAnonymously). Older than the Pick 'Em
-- plan and wider than Pick 'Em: points feed every game's leaderboard and every points-target
-- prize.
--
-- Nothing in the app needs these writes: profiles are created and changed only by the server as
-- service_role (lib/supabaseAdmin.ts, e.g. app/api/join/profile/route.ts), and every points
-- credit is a service_role-only RPC. The browser client (lib/supabase.ts) reads only venues and
-- live_player_stats. tests/player-table-write-lockdown-contract.test.ts keeps it that way.
--
-- What stays: SELECT and the policy "Users can read own profiles". service_role is untouched.
-- Triggers on users (username normalisation, the auth display-name sync) and FK actions from
-- other tables run regardless of these grants. TRUNCATE, REFERENCES and TRIGGER go too
-- (TRUNCATE is not subject to RLS).
--
-- A separate file from 7.1 (pickem_picks) so either can be applied or reverted alone.
-- Independent of the code deploy. Applying it to production is Andrew's call. Proof:
-- npm run test:player-write-lockdown-sql.

revoke insert, update, delete, truncate, references, trigger
  on table public.users
  from anon, authenticated;

drop policy if exists "Users can create own profiles" on public.users;
drop policy if exists "Users can update own profiles" on public.users;
