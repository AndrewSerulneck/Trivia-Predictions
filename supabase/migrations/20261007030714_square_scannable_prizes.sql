-- Square scannable dollar-off prizes, Phase S1 (docs/square-scannable-prizes-plan.md).
--
-- A dollar-off menu-item prize ("$5 off Appetizer") can now be delivered at a Square
-- register in one of two ways, chosen by the partner per prize:
--   'discount'  — staff apply the ready-made "Hightop prize: …" Square discount (today's
--                 behaviour; lib/pos/squareDiscounts.ts).
--   'gift_card' — the coupon becomes a real Square gift card for the dollar amount, which
--                 staff scan or type as payment (lib/pos/squareGiftCards.ts, Phase S2).
--
-- It adds:
--   1. prize_pos_delivery on challenge_campaigns AND the coupon snapshot
--      (challenge_campaign_redemptions). NULL = 'discount', so every existing reward and
--      coupon keeps today's behaviour. The app writes the column only when it is
--      'gift_card'.
--   2. On challenge_campaigns only, a coherence check: 'gift_card' is allowed only on a
--      dollar-off menu-item prize. The coupon table gets the value check alone — it is a
--      historical record (see 20260726120000_rewards_detachable_redemptions.sql), and the
--      Phase S2 reader re-checks the prize shape anyway.
--   3. award_cycle_winner re-created to snapshot c.prize_pos_delivery onto the coupon.
--      Identical to 20261004192844_pos_foundation.sql otherwise: same arity, so no drop and
--      still exactly one PostgREST overload; quota guarantee and advisory-lock key unchanged.
--
-- The only other coupon writers are the leaderboard finalizers in lib/challengeCampaigns.ts
-- (redemptionPrizeSnapshot) and scripts/recompute-challenge-cycles.cjs. Neither copies the
-- column, on purpose: leaderboard rewards can no longer be created (every registry
-- definition is challengeMode "progress"), and the reward wizard — the only way to set
-- 'gift_card' — goes through createReward, whose coupons are minted here. Their coupons
-- stay NULL = discount, i.e. exactly today's behaviour.
--
-- No new table, view or sequence, so no new grants. The function keeps its revoke/grant.
--
-- Deploy order: safe either way. Migration first (the plan's order) changes nothing a user
-- can see: no app code writes 'gift_card' until the wizard offers it (Phase S3). Code
-- first: the app writes the column only when 'gift_card' is chosen, keeps it out of
-- CAMPAIGN_SELECT_COLUMNS, and the wallet read retries without it on "column missing".

-- ── 1 + 2. The column ───────────────────────────────────────────────────────────────────

alter table public.challenge_campaigns
  add column if not exists prize_pos_delivery text
    constraint challenge_campaigns_prize_pos_delivery_check
    check (prize_pos_delivery is null or prize_pos_delivery in ('discount', 'gift_card'));

alter table public.challenge_campaigns
  drop constraint if exists challenge_campaigns_prize_pos_delivery_shape_check;
alter table public.challenge_campaigns
  add constraint challenge_campaigns_prize_pos_delivery_shape_check
    check (
      prize_pos_delivery is distinct from 'gift_card'
      -- "is not distinct from", not "=": a NULL prize_kind (a legacy prize_type-only reward)
      -- must FAIL the check, and a check that evaluates to NULL passes.
      or (prize_kind is not distinct from 'menu_item' and prize_discount_kind is not distinct from 'dollar')
    );

alter table public.challenge_campaign_redemptions
  add column if not exists prize_pos_delivery text
    constraint challenge_campaign_redemptions_prize_pos_delivery_check
    check (prize_pos_delivery is null or prize_pos_delivery in ('discount', 'gift_card'));

-- ── 3. award_cycle_winner: snapshot the delivery onto the coupon ─────────────────────────

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

  if won and p_prize_expires_at is not null then
    insert into challenge_campaign_redemptions (
      challenge_id, winner_user_id, venue_id, cycle_start, prize_expires_at,
      reward_name, prize_type, prize_gift_certificate_amount,
      prize_kind, prize_menu_item, prize_menu_item_name,
      prize_discount_kind, prize_discount_value, prize_pos_value_cents, prize_pos_delivery
    )
    select
      p_challenge_id, p_winner_user_id, p_venue_id, p_cycle_start, p_prize_expires_at,
      c.name,
      coalesce(p_prize_type, c.prize_type),
      coalesce(p_prize_gift_certificate_amount, c.prize_gift_certificate_amount),
      c.prize_kind, c.prize_menu_item, c.prize_menu_item_name,
      c.prize_discount_kind, c.prize_discount_value, c.prize_pos_value_cents, c.prize_pos_delivery
    from challenge_campaigns c
    where c.id = p_challenge_id
    on conflict (challenge_id, winner_user_id, cycle_start) do nothing;
  end if;

  return next;
end;
$$;

revoke all on function public.award_cycle_winner(uuid, timestamptz, uuid, text, integer, integer, text, numeric, timestamptz) from public, anon, authenticated;
grant execute on function public.award_cycle_winner(uuid, timestamptz, uuid, text, integer, integer, text, numeric, timestamptz) to service_role;
