-- Rewards system — Phase 4 code-review fix: atomic redemption coupon mint.
--
-- Finding #2: awardCycleWinner() (lib/challengeCampaigns.ts) minted the
-- challenge_campaign_redemptions coupon row in a SEPARATE supabase call AFTER the
-- award_cycle_winner RPC had already committed the winner ledger row. A crash or
-- transient failure in the window between the two writes left a ledgered winner
-- with NO coupon and no automatic recovery path — a real prize silently lost. See
-- docs/rewards-code-review-fixes-plan.md finding #2.
--
-- Fix: fold the redemption-row insert INTO award_cycle_winner, so the coupon is
-- written in the SAME transaction (and under the SAME advisory lock) as the ledger
-- row. Either both commit or neither does. Only the win NOTIFICATION stays in the
-- app layer — it is an external side effect that can't join the DB transaction and
-- is now best-effort (the durable coupon, not the notification, is the source of
-- truth for /redeem-prizes).
--
-- Signature change: one new trailing param `p_prize_expires_at timestamptz`. The
-- caller passes the computed expiry ONLY for a prize-bearing reward (NULL
-- otherwise); the RPC mints a redemption row iff the user just won AND
-- p_prize_expires_at is non-null. This keeps the RPC agnostic to the prize model
-- (legacy prize_type, or the new prize_kind menu_item/gift_card) — the caller
-- signals "this reward has a prize" purely by passing a non-null expiry. Because
-- the arity changes, the prior 8-arg version is dropped first so PostgREST has a
-- single unambiguous overload.
--
-- Additive/backward-compatible: the count-then-insert quota guarantee and the
-- timezone-independent advisory-lock key (migration 20260720140000) are preserved
-- byte-for-byte; only the redemption insert is added. With NULL p_prize_expires_at
-- (non-prize reward) the behavior is identical to before, minus the app-side write.

drop function if exists public.award_cycle_winner(uuid, timestamptz, uuid, text, integer, integer, text, numeric);

create or replace function public.award_cycle_winner(
  p_challenge_id uuid,
  p_cycle_start timestamptz,
  p_winner_user_id uuid,
  p_venue_id text,
  p_points_earned integer,
  p_winner_quota integer,
  p_prize_type text default null,
  p_prize_gift_certificate_amount numeric default null,
  p_prize_expires_at timestamptz default null
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
  -- session TimeZone — see migration 20260720140000.
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

  -- Atomic coupon mint: only on a FRESH win for a prize-bearing reward (signalled
  -- by a non-null expiry). Same transaction + advisory lock as the ledger insert,
  -- so the coupon can never be orphaned from its winner row. The on-conflict makes
  -- a re-crossing race a harmless no-op, mirroring the ledger's own idempotency.
  if won and p_prize_expires_at is not null then
    insert into challenge_campaign_redemptions (
      challenge_id, winner_user_id, venue_id, cycle_start, prize_expires_at
    )
    values (
      p_challenge_id, p_winner_user_id, p_venue_id, p_cycle_start, p_prize_expires_at
    )
    on conflict (challenge_id, winner_user_id, cycle_start) do nothing;
  end if;

  return next;
end;
$$;

revoke all on function public.award_cycle_winner(uuid, timestamptz, uuid, text, integer, integer, text, numeric, timestamptz) from public;
grant execute on function public.award_cycle_winner(uuid, timestamptz, uuid, text, integer, integer, text, numeric, timestamptz) to service_role;
