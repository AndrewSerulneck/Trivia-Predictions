-- Explicit API grants baseline (Phase 2 of docs/supabase-data-api-grants-plan.md).
--
-- GENERATED from production project pkmxupsayzshvpirkaav on 2026-09-23 (pg_class.relacl for
-- every table, view, materialized view and sequence in schema public; there were no
-- column-level grants). One grant per object/role pair, exactly as production had it.
--
-- Intended effect on production: NONE. Every grant below already exists there, and GRANT of a
-- privilege a role already holds is a no-op. It only writes the grants down.
--
-- Why it exists: until now every table relied on Supabase's automatic default grants, which
-- Supabase removes on 2026-10-30 (discussion #45329). Without this file, a fresh replay of
-- the migration history (new project, preview branch, staging, local `supabase db reset`)
-- would have no API access on any table, and lib/supabaseAdmin.ts (service_role) would get
-- `permission denied` everywhere.
--
-- GRANT only, never REVOKE. The broad anon/authenticated grants below are copied as-is
-- (all these tables have RLS enabled); narrowing them is a separate security review (Open
-- Question 2 in the plan), not this migration.
--
-- "all privileges" is used where the role held every privilege (PG17: select, insert, update,
-- delete, truncate, references, trigger, maintain on tables; select, update, usage on
-- sequences). Owner (postgres) entries are omitted; the owner holds them implicitly.

-- tables (126 grants)
grant all privileges on table public.accounts to service_role;
grant all privileges on table public.ad_events to anon;
grant all privileges on table public.ad_events to authenticated;
grant all privileges on table public.ad_events to service_role;
grant all privileges on table public.ad_interactions to service_role;
grant all privileges on table public.advertisements to anon;
grant all privileges on table public.advertisements to authenticated;
grant all privileges on table public.advertisements to service_role;
grant all privileges on table public.analytics_daily_geographic_rollups_history to service_role;
grant all privileges on table public.analytics_hourly_venue_game_rollups_history to service_role;
grant all privileges on table public.analytics_venue_user_daily_cohorts_history to service_role;
grant all privileges on table public.answer_variants to anon;
grant all privileges on table public.answer_variants to authenticated;
grant all privileges on table public.answer_variants to service_role;
grant all privileges on table public.billing_discount_grants to service_role;
grant all privileges on table public.billing_invoices to service_role;
grant all privileges on table public.billing_subscriptions to service_role;
grant select, insert, update, delete on table public.category_blitz_continuous_config to authenticated;
grant all privileges on table public.category_blitz_continuous_config to service_role;
grant select on table public.category_blitz_rounds to authenticated;
grant all privileges on table public.category_blitz_rounds to service_role;
grant select on table public.category_blitz_schedules to authenticated;
grant all privileges on table public.category_blitz_schedules to service_role;
grant select, insert on table public.category_blitz_session_participants to authenticated;
grant all privileges on table public.category_blitz_session_participants to service_role;
grant select on table public.category_blitz_sessions to authenticated;
grant all privileges on table public.category_blitz_sessions to service_role;
grant select, insert on table public.category_blitz_submissions to authenticated;
grant all privileges on table public.category_blitz_submissions to service_role;
grant all privileges on table public.challenge_campaign_progress to anon;
grant all privileges on table public.challenge_campaign_progress to authenticated;
grant all privileges on table public.challenge_campaign_progress to service_role;
grant all privileges on table public.challenge_campaign_redemptions to anon;
grant all privileges on table public.challenge_campaign_redemptions to authenticated;
grant all privileges on table public.challenge_campaign_redemptions to service_role;
grant all privileges on table public.challenge_campaigns to anon;
grant all privileges on table public.challenge_campaigns to authenticated;
grant all privileges on table public.challenge_campaigns to service_role;
grant all privileges on table public.challenge_cycle_winners to service_role;
grant all privileges on table public.challenge_invites to anon;
grant all privileges on table public.challenge_invites to authenticated;
grant all privileges on table public.challenge_invites to service_role;
grant select, insert, update on table public.fantasy_entries to authenticated;
grant all privileges on table public.fantasy_entries to service_role;
grant all privileges on table public.game_sessions to service_role;
grant select on table public.live_player_stats to anon;
grant select on table public.live_player_stats to authenticated;
grant all privileges on table public.live_player_stats to service_role;
grant all privileges on table public.live_showdown_answers to anon;
grant all privileges on table public.live_showdown_answers to authenticated;
grant all privileges on table public.live_showdown_answers to service_role;
grant all privileges on table public.llm_usage_logs to service_role;
grant all privileges on table public.nfl_pickem_game_lines to service_role;
grant all privileges on table public.nfl_pickem_tiebreakers to service_role;
grant all privileges on table public.nfl_pickem_user_weeks to service_role;
grant all privileges on table public.nfl_pickem_weeks to service_role;
grant all privileges on table public.notifications to anon;
grant all privileges on table public.notifications to authenticated;
grant all privileges on table public.notifications to service_role;
grant all privileges on table public.pickem_daily_snapshots to anon;
grant all privileges on table public.pickem_daily_snapshots to authenticated;
grant all privileges on table public.pickem_daily_snapshots to service_role;
grant all privileges on table public.pickem_picks to anon;
grant all privileges on table public.pickem_picks to authenticated;
grant all privileges on table public.pickem_picks to service_role;
grant select on table public.players to anon;
grant select on table public.players to authenticated;
grant all privileges on table public.players to service_role;
grant all privileges on table public.prize_wins to anon;
grant all privileges on table public.prize_wins to authenticated;
grant all privileges on table public.prize_wins to service_role;
grant all privileges on table public.signup_attempts to service_role;
grant all privileges on table public.sports_bingo_cards to anon;
grant all privileges on table public.sports_bingo_cards to authenticated;
grant all privileges on table public.sports_bingo_cards to service_role;
grant all privileges on table public.sports_bingo_squares to anon;
grant all privileges on table public.sports_bingo_squares to authenticated;
grant all privileges on table public.sports_bingo_squares to service_role;
grant all privileges on table public.story_share_events to service_role;
grant all privileges on table public.trivia_answers to anon;
grant all privileges on table public.trivia_answers to authenticated;
grant all privileges on table public.trivia_answers to service_role;
grant all privileges on table public.trivia_questions to anon;
grant all privileges on table public.trivia_questions to authenticated;
grant all privileges on table public.trivia_questions to service_role;
grant all privileges on table public.trivia_schedules to anon;
grant all privileges on table public.trivia_schedules to authenticated;
grant all privileges on table public.trivia_schedules to service_role;
grant all privileges on table public.trivia_session_questions to anon;
grant all privileges on table public.trivia_session_questions to authenticated;
grant all privileges on table public.trivia_session_questions to service_role;
grant all privileges on table public.tv_pairing_codes to service_role;
grant all privileges on table public.user_geographic_data to service_role;
grant all privileges on table public.user_passkeys to service_role;
grant all privileges on table public.user_predictions to anon;
grant all privileges on table public.user_predictions to authenticated;
grant all privileges on table public.user_predictions to service_role;
grant all privileges on table public.user_seen_questions to anon;
grant all privileges on table public.user_seen_questions to authenticated;
grant all privileges on table public.user_seen_questions to service_role;
grant all privileges on table public.user_sessions to service_role;
grant all privileges on table public.username_change_attempts to service_role;
grant all privileges on table public.username_change_audit to service_role;
grant all privileges on table public.users to anon;
grant all privileges on table public.users to authenticated;
grant all privileges on table public.users to service_role;
grant all privileges on table public.venue_category_resets to service_role;
grant all privileges on table public.venue_game_settings to service_role;
grant all privileges on table public.venue_live_trivia_inventory_summary to service_role;
grant all privileges on table public.venue_owner_venues to service_role;
grant all privileges on table public.venue_owners to service_role;
grant all privileges on table public.venue_presence_events to service_role;
grant all privileges on table public.venue_presence_sessions to service_role;
grant all privileges on table public.venue_question_warnings to service_role;
grant all privileges on table public.venue_screen_sponsors to service_role;
grant all privileges on table public.venue_seen_questions to service_role;
grant all privileges on table public.venues to anon;
grant all privileges on table public.venues to authenticated;
grant all privileges on table public.venues to service_role;
grant all privileges on table public.webauthn_challenges to service_role;
grant all privileges on table public.webhook_events_processed to anon;
grant all privileges on table public.webhook_events_processed to authenticated;
grant all privileges on table public.webhook_events_processed to service_role;
grant all privileges on table public.weekly_prizes to anon;
grant all privileges on table public.weekly_prizes to authenticated;
grant all privileges on table public.weekly_prizes to service_role;

-- views (6 grants)
grant select on table public.admin_analytics_daily_geographic_rollups to authenticated;
grant all privileges on table public.admin_analytics_daily_geographic_rollups to service_role;
grant select on table public.admin_analytics_hourly_venue_game_rollups to authenticated;
grant all privileges on table public.admin_analytics_hourly_venue_game_rollups to service_role;
grant select on table public.admin_analytics_venue_user_daily_cohorts to authenticated;
grant all privileges on table public.admin_analytics_venue_user_daily_cohorts to service_role;

-- materialized views (3 grants)
grant all privileges on table public.analytics_daily_geographic_rollups to service_role;
grant all privileges on table public.analytics_hourly_venue_game_rollups to service_role;
grant all privileges on table public.analytics_venue_user_daily_cohorts to service_role;

-- sequences (3 grants)
grant all privileges on sequence public.players_id_seq to anon;
grant all privileges on sequence public.players_id_seq to authenticated;
grant all privileges on sequence public.players_id_seq to service_role;

