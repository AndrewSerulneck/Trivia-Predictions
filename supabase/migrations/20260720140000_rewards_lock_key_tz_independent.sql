-- Rewards system — Phase 3 code-review fix: timezone-independent advisory lock.
--
-- The award_cycle_winner() quota guard serializes concurrent threshold crossings
-- for the same (challenge, cycle) with a transaction-scoped advisory lock. The
-- original migration (20260720130000_rewards_multi_winner.sql) derived that lock
-- key from `p_cycle_start::text`, whose rendering depends on the session's
-- `TimeZone` GUC: the SAME instant renders as e.g. "2026-07-20 00:00:00+00" on a
-- UTC connection but "2026-07-19 20:00:00-04" on an America/New_York connection.
-- Two connections with different session timezones would therefore hash to
-- DIFFERENT lock keys for the SAME cycle, take DIFFERENT locks, and both pass the
-- count check concurrently — over-awarding past winner_quota. See
-- docs/rewards-code-review-fixes-plan.md finding #3.
--
-- Fix: key the lock on `extract(epoch from p_cycle_start)` — the absolute instant
-- in seconds since the Unix epoch (UTC). Its numeric rendering is identical on
-- every connection regardless of session TimeZone, so the same cycle always maps
-- to the same lock. This is additive/backward-compatible: the function body is
-- otherwise unchanged, the signature is identical, and the count-then-insert quota
-- guarantee is preserved exactly. (The unique(challenge_id, cycle_start,
-- winner_user_id) constraint is likewise instant-based and already tz-safe, since
-- timestamptz equality compares instants, not rendered text.)

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
  -- at transaction end (each RPC call is its own implicit transaction). The key
  -- uses extract(epoch ...) so it is identical on every connection regardless of
  -- session TimeZone — see this migration's header.
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_challenge_id::text || ':' || extract(epoch from p_cycle_start)::text,
      0
    )
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
