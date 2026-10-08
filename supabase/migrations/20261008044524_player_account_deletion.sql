-- Native app store plan (docs/native-app-store-plan.md) Phase 1b: a player can delete their own
-- account. Apple 5.1.1(v) and Google Play both require in-app deletion.
--
-- Andrew's decisions (2026-10-08):
--   * REMOVE, don't anonymise: scores, picks, cards, answers and submissions are deleted, so
--     venue leaderboards shift. Nothing is renamed to "Deleted player".
--   * Winner rows KEEP THE SLOT, LOSE THE NAME: challenge_cycle_winners rows stay (winner blanked).
--     Deleting them would free a quota slot that award_cycle_winner counts, and every reward
--     sweep treats "no winner row for this cycle" as "unresolved" — so the next-best player would
--     be handed a second real prize the venue never planned for.
--   * The Square gift-card ledger (pos_reward_applications) is KEPT, unlinked. It already is:
--     its redemption_id is ON DELETE SET NULL, and it holds no name or username.
--
-- Three parts:
--   1. challenge_cycle_winners.winner_user_id becomes nullable, FK ON DELETE SET NULL.
--   2. challenge_campaigns.winner_user_id loses its FK. It is a "this reward is resolved" marker
--      (see lib/challengeCampaigns.ts and lib/liveTriviaWinnerRewards.ts), and its old
--      ON DELETE SET NULL silently re-opened a resolved leaderboard reward when its winner's
--      users row went away (isLeaderboardCampaignClosed would re-finalize it for someone else).
--      Without the FK the opaque id stays as the marker; the users row it pointed at is gone, so
--      it identifies no one. Readers already treat a missing username as null.
--   3. public.delete_player_account(p_user_id) — one all-or-nothing function. Service role only;
--      the route binds p_user_id to the signed tp_sess session first (resolveRequestUserId).
--
-- The auth.users row is NOT deleted here. The function returns the caller's auth ids that are now
-- unreferenced; the route deletes those through supabaseAdmin.auth.admin.deleteUser after
-- re-checking them with authUserIsUnreferenced (lib/signupSweep.ts) and confirming they carry no
-- email — the repo's one sanctioned way to delete an auth user, and the CLAUDE.md "auth.users is
-- SHARED WITH PLAYERS" rule. A failure there leaves an emailless, unreferenced auth row holding
-- no personal data (production already has ~765 of those from anonymous visits).
--
-- Not touched: analytics_venue_user_daily_cohorts is a materialized view. Its rows for the player
-- keep an opaque user id with daily counts until the next refresh_user_analytics_rollups(); the
-- users row behind the id is gone. Refreshing it here would take an exclusive lock and recompute
-- the whole view on every deletion. Aggregate rollups (hourly/geographic) hold no user ids.

-- ── 1. Winner ledger: keep the slot, blank the winner ───────────────────────────────────────
-- NULLs are distinct under unique(challenge_id, cycle_start, winner_user_id), so several blanked
-- winners in one cycle coexist, and award_cycle_winner's count(*) still counts them.

alter table public.challenge_cycle_winners alter column winner_user_id drop not null;

do $$
declare
  v_con text;
begin
  for v_con in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.challenge_cycle_winners'::regclass
      and c.contype = 'f'
      and a.attname = 'winner_user_id'
  loop
    execute format('alter table public.challenge_cycle_winners drop constraint %I', v_con);
  end loop;
end;
$$;

alter table public.challenge_cycle_winners
  add constraint challenge_cycle_winners_winner_user_id_fkey
  foreign key (winner_user_id) references public.users(id) on delete set null;

-- ── 2. Campaign "resolved" marker: drop the FK ──────────────────────────────────────────────

do $$
declare
  v_con text;
begin
  for v_con in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.challenge_campaigns'::regclass
      and c.contype = 'f'
      and a.attname = 'winner_user_id'
  loop
    execute format('alter table public.challenge_campaigns drop constraint %I', v_con);
  end loop;
end;
$$;

-- ── 3. delete_player_account ────────────────────────────────────────────────────────────────
-- Scope: the session's users row, plus — when it belongs to an account — the account and every
-- other venue profile (users row) on that account. A legacy profile with no account is deleted
-- alone.
--
-- outcome:
--   'deleted'   — everything below ran; nothing was left half-done.
--   'not_found' — no users row with that id (already deleted, or never existed). Nothing changed.
-- Any error raises and rolls the whole call back: a partial failure deletes nothing.
--
-- Every FK into users/accounts is ON DELETE CASCADE or SET NULL (verified 2026-10-08 against the
-- migrations and the live schema). The SET NULL consumers are deleted EXPLICITLY below, because
-- the decision is "remove", and a SET NULL would leave the player's rows behind with the id
-- cleared. The CASCADE consumers go with the users/accounts rows.

create or replace function public.delete_player_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_user_ids uuid[];
  v_auth_ids uuid[];
  v_usernames text[];
  v_winner_rows integer := 0;
  v_users_deleted integer := 0;
  v_account_deleted boolean := false;
  v_unreferenced_auth_ids uuid[] := '{}';
  v_auth uuid;
begin
  if p_user_id is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select u.account_id into v_account_id
  from users u
  where u.id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if v_account_id is not null then
    perform 1 from accounts a where a.id = v_account_id for update;
  end if;

  -- Lock every profile in scope so a concurrent join/score write can't slip a row in.
  select coalesce(array_agg(u.id order by u.id), '{}')
  into v_user_ids
  from (
    select u.id from users u
    where u.id = p_user_id
       or (v_account_id is not null and u.account_id = v_account_id)
    for update
  ) u;

  select coalesce(array_agg(distinct x.auth_id), '{}')
  into v_auth_ids
  from (
    select u.auth_id from users u where u.id = any (v_user_ids)
    union
    select a.auth_id from accounts a where a.id = v_account_id
  ) x
  where x.auth_id is not null;

  -- Every username this player has held, for the moderation cost log below.
  select coalesce(array_agg(distinct lower(left(n.name, 50))), '{}')
  into v_usernames
  from (
    select u.username as name from users u where u.id = any (v_user_ids)
    union select a.username from accounts a where a.id = v_account_id
    union select h.old_username from username_change_audit h where h.user_id = any (v_user_ids)
    union select h.new_username from username_change_audit h where h.user_id = any (v_user_ids)
  ) n
  where n.name is not null and n.name <> '';

  -- Winner rows: keep the slot, blank the winner (Andrew, 2026-10-08).
  update challenge_cycle_winners
  set winner_user_id = null
  where winner_user_id = any (v_user_ids);
  get diagnostics v_winner_rows = row_count;

  -- SET NULL consumers: remove outright.
  delete from ad_interactions where user_id = any (v_user_ids);
  -- A story share is recorded with user_id null when the venue check failed, but it can still
  -- carry the player's site or game session id.
  delete from story_share_events
  where user_id = any (v_user_ids)
     or user_session_id in (select s.session_id from user_sessions s where s.user_id = any (v_user_ids))
     or game_session_id in (select g.session_id from game_sessions g where g.user_id = any (v_user_ids));
  delete from venue_presence_events where user_id = any (v_user_ids);
  -- Passkeys and WebAuthn challenges: user_id is SET NULL since 20260625210000 (account_id
  -- cascades). A legacy profile with no account would otherwise leave its passkey behind.
  delete from user_passkeys
  where user_id = any (v_user_ids)
     or (v_account_id is not null and account_id = v_account_id);
  delete from webauthn_challenges
  where user_id = any (v_user_ids)
     or (v_account_id is not null and account_id = v_account_id);
  delete from username_change_attempts
  where user_id = any (v_user_ids)
     or requester_auth_id = any (v_auth_ids);

  -- Category Blitz session scoreboards are a jsonb map keyed by user id.
  update category_blitz_sessions
  set cumulative_totals = cumulative_totals - (v_user_ids::text[])
  where cumulative_totals ?| (v_user_ids::text[]);

  -- Username-moderation cost log (lib/llmCostTracker.ts) stores the username it checked.
  if array_length(v_usernames, 1) is not null then
    delete from llm_usage_logs
    where feature = 'username_moderation'
      and lower(left(metadata ->> 'username', 50)) = any (v_usernames);
  end if;

  -- The profiles. CASCADE takes scores, picks, cards, answers, submissions, sessions,
  -- notifications, coupons (challenge_campaign_redemptions), progress, presence sessions and
  -- geographic rows with them.
  delete from users where id = any (v_user_ids);
  get diagnostics v_users_deleted = row_count;

  if v_account_id is not null then
    delete from accounts where id = v_account_id;
    v_account_deleted := found;
  end if;

  -- Which of the player's auth ids nothing references any more. The route deletes only these,
  -- after re-checking. The seven consumers are pinned by tests/lib.auth-users-fk-guard.test.ts.
  foreach v_auth in array v_auth_ids loop
    if not exists (select 1 from accounts where auth_id = v_auth)
       and not exists (select 1 from users where auth_id = v_auth)
       and not exists (select 1 from venue_owners where auth_id = v_auth)
       and not exists (select 1 from username_change_attempts where requester_auth_id = v_auth)
       and not exists (select 1 from username_change_audit where changed_by_auth_id = v_auth)
       and not exists (select 1 from category_blitz_submissions where auth_id = v_auth)
       and not exists (select 1 from category_blitz_session_participants where auth_id = v_auth)
    then
      v_unreferenced_auth_ids := v_unreferenced_auth_ids || v_auth;
    end if;
  end loop;

  return jsonb_build_object(
    'outcome', 'deleted',
    'users_deleted', v_users_deleted,
    'account_deleted', v_account_deleted,
    'winner_rows_blanked', v_winner_rows,
    'unreferenced_auth_ids', to_jsonb(v_unreferenced_auth_ids)
  );
end;
$$;

-- Server only. A player never calls this directly: POST /api/account/delete binds the player to
-- their signed session first (resolveRequestUserId, lib/serverSession.ts).
revoke all on function public.delete_player_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_player_account(uuid) to service_role;
