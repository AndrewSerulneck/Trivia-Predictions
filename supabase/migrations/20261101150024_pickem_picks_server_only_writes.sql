-- Pick 'Em Phase 7.1 (docs/pickem-college-football-and-prize-plan.md §9 finding F1):
-- players can no longer write public.pickem_picks through the public API.
--
-- Before this file, anon/authenticated held ALL privileges on the table
-- (20260923130841_explicit_api_grants_baseline.sql) and two RLS policies from
-- 20260427113000_add_pickem_tables.sql let a signed-in player INSERT and UPDATE their own rows.
-- Every player holds an authenticated Supabase session in the browser (signInAnonymously), so a
-- player could insert a status = 'won' row, or set reward_claimed_at back to null on a paid one:
-- pay_pickem_points pays 10 venue points per such row and the Pick 'Em Prize sweep counts it
-- toward real prizes.
--
-- Nothing in the app needs these writes: every pick is written by the server as service_role
-- (lib/supabaseAdmin.ts), and the browser client (lib/supabase.ts) reads only venues and
-- live_player_stats. tests/player-table-write-lockdown-contract.test.ts keeps it that way.
--
-- What stays: SELECT and the policy "Users can read own pickem picks". service_role is
-- untouched (it bypasses RLS and keeps its grant). TRUNCATE, REFERENCES and TRIGGER go too:
-- TRUNCATE is not subject to RLS, and none of the three is used by anyone but the server.
--
-- Independent of the code deploy (the live code never writes this table from a browser), so it
-- can be applied first. Applying it to production is Andrew's call. Proof:
-- npm run test:player-write-lockdown-sql.

revoke insert, update, delete, truncate, references, trigger
  on table public.pickem_picks
  from anon, authenticated;

drop policy if exists "Users can insert own pickem picks" on public.pickem_picks;
drop policy if exists "Users can update own pickem picks" on public.pickem_picks;
