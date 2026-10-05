-- Live Coupon plan (docs/reward-live-redemption-plan.md) Phase 1: a prize coupon can be
-- redeemed ONCE.
--
-- Before this, redeemChallengePrize() (lib/challengeCampaigns.ts) read the oldest unredeemed
-- row and then ran an UPDATE with no `prize_redeemed_at is null` guard, so two simultaneous
-- "Confirm Redemption" taps (two tabs, two phones signed in as the same guest, a scripted
-- replay) could both report success. It also refused every coupon whose reward uses the new
-- prize model (prize_kind set, prize_type null) — i.e. every partner-created reward — because
-- it gated on the legacy prize_type column.
--
-- Fix: one service-role-only function that redeems with a single conditional UPDATE. Under
-- READ COMMITTED a second, concurrent UPDATE of the same row waits for the first to commit,
-- re-checks `prize_redeemed_at is null` against the committed row, matches nothing, and
-- reports 'already_redeemed'. Exactly one caller ever sees 'redeemed'.
--
-- Additive only: a new nullable column, a new function. No existing row is changed.
-- POS plan (docs/pos-rewards-integration-plan.md) Phases 2–3 call the same function with
-- p_method 'pos_square' / 'pos_clover' and p_redemption_id set.

-- ── 1. How a coupon was redeemed ────────────────────────────────────────────────────────
-- NULL on every row redeemed before this migration (and on unredeemed rows). The allowlist
-- names the POS methods the POS plan already reserves; a new method needs a new migration
-- (and the same list in the function below).

alter table public.challenge_campaign_redemptions
  add column if not exists redeemed_method text
    check (
      redeemed_method is null
      or redeemed_method in ('guest_confirm', 'pos_square', 'pos_clover', 'pos_toast')
    );

-- ── 2. redeem_challenge_prize ───────────────────────────────────────────────────────────
-- Which coupon:
--   * p_redemption_id set   → exactly that row (still required to belong to this
--                              challenge + user, and venue when given).
--   * p_redemption_id null  → the OLDEST still-eligible row for the challenge + user (+ venue).
--     An expired older coupon never blocks a newer valid one.
-- Eligible = not redeemed AND (no expiry OR expiry in the future).
--
-- outcome:
--   'redeemed'         — this call redeemed it; redeemed_at is now().
--   'already_redeemed' — nothing eligible, and a matching coupon was redeemed earlier (or a
--                        concurrent call won the race); redeemed_at is that earlier time.
--   'expired'          — nothing eligible, and the oldest unredeemed matching coupon expired.
--   'not_found'        — no matching coupon at all (wrong user / challenge / venue / id).
-- A detached coupon (challenge_id null — its reward was deleted) never matches.

create or replace function public.redeem_challenge_prize(
  p_challenge_id uuid,
  p_user_id uuid,
  p_venue_id text default null,
  p_method text default 'guest_confirm',
  p_redemption_id uuid default null
)
returns table (
  outcome text,
  redemption_id uuid,
  redeemed_at timestamptz,
  cycle_start timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid;
  v_row record;
begin
  if p_method is null
     or p_method not in ('guest_confirm', 'pos_square', 'pos_clover', 'pos_toast') then
    raise exception 'redeem_challenge_prize: unknown method %', p_method
      using errcode = '22023';
  end if;

  select r.id into v_target
  from challenge_campaign_redemptions r
  where r.challenge_id = p_challenge_id
    and r.winner_user_id = p_user_id
    and (p_venue_id is null or r.venue_id = p_venue_id)
    and (p_redemption_id is null or r.id = p_redemption_id)
    and r.prize_redeemed_at is null
    and (r.prize_expires_at is null or r.prize_expires_at > now())
  order by r.cycle_start asc
  limit 1;

  if v_target is not null then
    -- The guard is repeated here on purpose: it is what makes this once-only when two
    -- calls picked the same v_target above.
    update challenge_campaign_redemptions r
       set prize_redeemed_at = now(),
           redeemed_method = p_method
     where r.id = v_target
       and r.prize_redeemed_at is null
       and (r.prize_expires_at is null or r.prize_expires_at > now())
    returning r.id, r.prize_redeemed_at, r.cycle_start into v_row;

    if found then
      outcome := 'redeemed';
      redemption_id := v_row.id;
      redeemed_at := v_row.prize_redeemed_at;
      cycle_start := v_row.cycle_start;
      return next;
      return;
    end if;

    -- Lost the race to a concurrent call (or the coupon expired in between).
    select r.id, r.prize_redeemed_at, r.cycle_start into v_row
    from challenge_campaign_redemptions r
    where r.id = v_target;

    outcome := case when v_row.prize_redeemed_at is not null then 'already_redeemed' else 'expired' end;
    redemption_id := v_row.id;
    redeemed_at := v_row.prize_redeemed_at;
    cycle_start := v_row.cycle_start;
    return next;
    return;
  end if;

  -- Nothing eligible: say why. The oldest unredeemed coupon being expired wins over
  -- "already redeemed", matching the pre-RPC behaviour's message order.
  select r.id, r.prize_redeemed_at, r.cycle_start into v_row
  from challenge_campaign_redemptions r
  where r.challenge_id = p_challenge_id
    and r.winner_user_id = p_user_id
    and (p_venue_id is null or r.venue_id = p_venue_id)
    and (p_redemption_id is null or r.id = p_redemption_id)
    and r.prize_redeemed_at is null
  order by r.cycle_start asc
  limit 1;

  if found then
    outcome := 'expired';
    redemption_id := v_row.id;
    redeemed_at := null;
    cycle_start := v_row.cycle_start;
    return next;
    return;
  end if;

  select r.id, r.prize_redeemed_at, r.cycle_start into v_row
  from challenge_campaign_redemptions r
  where r.challenge_id = p_challenge_id
    and r.winner_user_id = p_user_id
    and (p_venue_id is null or r.venue_id = p_venue_id)
    and (p_redemption_id is null or r.id = p_redemption_id)
    and r.prize_redeemed_at is not null
  order by r.prize_redeemed_at desc
  limit 1;

  if found then
    outcome := 'already_redeemed';
    redemption_id := v_row.id;
    redeemed_at := v_row.prize_redeemed_at;
    cycle_start := v_row.cycle_start;
    return next;
    return;
  end if;

  outcome := 'not_found';
  redemption_id := null;
  redeemed_at := null;
  cycle_start := null;
  return next;
end;
$$;

-- Server only. A guest never calls this directly: the API route binds the guest to their
-- signed session first (resolveRequestUserId, lib/serverSession.ts).
revoke all on function public.redeem_challenge_prize(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.redeem_challenge_prize(uuid, uuid, text, text, uuid) to service_role;
