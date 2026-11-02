-- Pick 'Em Phase 7.1c (docs/pickem-college-football-and-prize-plan.md §9 finding F11):
-- signed-in players can no longer call the server-only SECURITY DEFINER functions below
-- through the public API (/rest/v1/rpc/...).
--
-- A SECURITY DEFINER function runs as its owner, so table revokes and RLS (7.1 / 7.1b) do not
-- limit it; only EXECUTE does. Supabase's default privileges grant EXECUTE on every new public
-- function to anon, authenticated and service_role explicitly, so `revoke ... from public` alone
-- never closed these. 20260602140000 then revoked four of them from anon only, and the rest were
-- never revoked from anyone. Every player holds an authenticated session (signInAnonymously), so:
--   - settle_prediction_market (both overloads): settle any Predictions market with any answer and
--     credit users.points. Money.
--   - get_challenge_leaderboard_snapshot (both overloads): every player id, username and points for
--     any prize at any venue. Player ids never leave the server anywhere else.
--   - prune_user_analytics_raw_events, refresh_user_analytics_rollups and the four
--     refresh_live_trivia_inventory_summary* functions: delete analytics rows / force full
--     recomputes on demand (cost).
--
-- Found by re-scanning every SECURITY DEFINER function in supabase/migrations/ on 2026-11-01.
-- Deliberately left alone: trigger functions (cannot be called through the API) and the three
-- RLS helpers current_admin_venue_ids / is_current_user_for_analytics /
-- is_current_admin_for_analytics_venue (policies run them as the querying role, so authenticated
-- must keep EXECUTE; they only answer about the caller). Every other one already revokes.
--
-- Callers, all as service_role through lib/supabaseAdmin.ts: settle_prediction_market
-- (lib/admin.ts), get_challenge_leaderboard_snapshot (lib/challengeCampaigns.ts). The rest have no
-- caller in the app; the inventory refreshes run from their trigger functions as the owner, which
-- this does not touch. service_role is granted explicitly so nothing relies on PUBLIC.
--
-- Independent of the code deploy (the browser calls no RPC). Applying it is Andrew's call.
-- Proof: npm run test:security-definer-sql. Tripwire: tests/security-definer-execute-contract.test.ts.

revoke all on function public.settle_prediction_market(text, text, boolean) from public, anon, authenticated;
grant execute on function public.settle_prediction_market(text, text, boolean) to service_role;

revoke all on function public.settle_prediction_market(text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.settle_prediction_market(text, text, boolean, text) to service_role;

revoke all on function public.get_challenge_leaderboard_snapshot(uuid, text, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.get_challenge_leaderboard_snapshot(uuid, text, uuid, integer, text) to service_role;

revoke all on function public.get_challenge_leaderboard_snapshot(uuid, text, uuid, integer, text, timestamptz) from public, anon, authenticated;
grant execute on function public.get_challenge_leaderboard_snapshot(uuid, text, uuid, integer, text, timestamptz) to service_role;

revoke all on function public.prune_user_analytics_raw_events(interval) from public, anon, authenticated;
grant execute on function public.prune_user_analytics_raw_events(interval) to service_role;

revoke all on function public.refresh_user_analytics_rollups() from public, anon, authenticated;
grant execute on function public.refresh_user_analytics_rollups() to service_role;

revoke all on function public.refresh_live_trivia_inventory_summary_for_venue_category(text, text) from public, anon, authenticated;
grant execute on function public.refresh_live_trivia_inventory_summary_for_venue_category(text, text) to service_role;

revoke all on function public.refresh_live_trivia_inventory_summary_for_category(text) from public, anon, authenticated;
grant execute on function public.refresh_live_trivia_inventory_summary_for_category(text) to service_role;

revoke all on function public.refresh_live_trivia_inventory_summary_for_venue(text) from public, anon, authenticated;
grant execute on function public.refresh_live_trivia_inventory_summary_for_venue(text) to service_role;

revoke all on function public.refresh_live_trivia_inventory_summary() from public, anon, authenticated;
grant execute on function public.refresh_live_trivia_inventory_summary() to service_role;
