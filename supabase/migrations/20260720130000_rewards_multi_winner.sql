-- Rewards system — Phase 3: multi-winner engine.
--
-- challenge_cycle_winners becomes the canonical winners ledger for BOTH cadences
-- (recurring uses the real cycle_start; one-time uses the epoch sentinel
-- 1970-01-01). Winner recording moves from "first only" to count-based against
-- challenge_campaigns.winner_quota (added in Phase 2). See
-- docs/rewards-system-plan.md §3b.
--
-- This migration is additive/backward-compatible:
--   * The old unique(challenge_id, cycle_start) — which capped a cycle at ONE
--     winner — is replaced with unique(challenge_id, cycle_start, winner_user_id),
--     which still prevents a user from double-winning a cycle but permits up to
--     winner_quota distinct winners. Existing single-winner rows satisfy the new
--     key unchanged.
--   * award_cycle_winner() performs the count-and-insert as a single atomic,
--     serialized statement so concurrent threshold crossings can never
--     over-award beyond winner_quota. With winner_quota = 1 (the default on every
--     legacy row) it degrades to exactly today's single-winner behavior.

-- ── 1. Re-key the winners ledger for multi-winner ────────────────────────────
alter table challenge_cycle_winners
  drop constraint if exists challenge_cycle_winners_challenge_id_cycle_start_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'challenge_cycle_winners_challenge_cycle_user_key'
  ) then
    alter table challenge_cycle_winners
      add constraint challenge_cycle_winners_challenge_cycle_user_key
      unique (challenge_id, cycle_start, winner_user_id);
  end if;
end $$;

-- ── 2. Atomic, count-guarded winner insert ───────────────────────────────────
-- Returns whether THIS user just won (won) and whether the cycle is now full
-- (exhausted). A transaction-scoped advisory lock keyed on (challenge, cycle)
-- serializes concurrent crossings for the same cycle so the count-then-insert is
-- effectively atomic; the unique constraint above independently guarantees a
-- re-crossing by an existing winner is a no-op (won = false).
create or replace function public.award_cycle_winner(
  p_challenge_id uuid,
  p_cycle_start timestamptz,
  p_winner_user_id uuid,
  p_venue_id text,
  p_points_earned integer,
  p_winner_quota integer,
  p_prize_type text default null,
  p_prize_gift_certificate_amount numeric default null
)
returns table (
  won boolean,
  exhausted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quota integer := greatest(1, coalesce(p_winner_quota, 1));
  v_count integer;
  v_inserted integer;
begin
  -- Serialize all concurrent crossings for this (challenge, cycle). Auto-released
  -- at transaction end (each RPC call is its own implicit transaction).
  perform pg_advisory_xact_lock(
    hashtextextended(p_challenge_id::text || ':' || p_cycle_start::text, 0)
  );

  select count(*) into v_count
  from challenge_cycle_winners
  where challenge_id = p_challenge_id
    and cycle_start = p_cycle_start;

  if v_count >= v_quota then
    won := false;
    exhausted := true;
    return next;
    return;
  end if;

  insert into challenge_cycle_winners (
    challenge_id, cycle_start, winner_user_id, venue_id, points_earned,
    prize_type, prize_gift_certificate_amount
  )
  values (
    p_challenge_id, p_cycle_start, p_winner_user_id, p_venue_id,
    coalesce(p_points_earned, 0), p_prize_type, p_prize_gift_certificate_amount
  )
  on conflict (challenge_id, cycle_start, winner_user_id) do nothing;

  get diagnostics v_inserted = row_count;

  won := v_inserted > 0;
  exhausted := (v_count + v_inserted) >= v_quota;
  return next;
end;
$$;

revoke all on function public.award_cycle_winner(uuid, timestamptz, uuid, text, integer, integer, text, numeric) from public;
grant execute on function public.award_cycle_winner(uuid, timestamptz, uuid, text, integer, integer, text, numeric) to service_role;
