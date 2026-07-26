-- Rewards: snapshot the reward's name/prize onto the coupon at award time.
--
-- Companion to 20260726120000_rewards_detachable_redemptions.sql, which lets a
-- redeemed coupon outlive a deleted reward (challenge_id becomes nullable with
-- `on delete set null`). A detached row is only useful if it still says WHAT was
-- won, so award_cycle_winner now fills the snapshot columns when it mints the
-- coupon.
--
-- The snapshot is read from challenge_campaigns inside the SAME transaction and
-- under the SAME advisory lock as the ledger + coupon insert, so it can never
-- disagree with the reward the player actually won. Reading it here rather than
-- accepting more parameters keeps the RPC's signature (and therefore every
-- caller in lib/challengeCampaigns.ts) unchanged — the arity is deliberately
-- identical to migration 20260720150000's, so PostgREST still has exactly one
-- overload and no `drop function` is needed.
--
-- Everything else is preserved byte-for-byte from 20260720150000: the
-- count-then-insert quota guarantee, the timezone-independent advisory-lock key
-- (20260720140000), and the "mint a coupon iff won AND p_prize_expires_at is
-- non-null" rule.

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
  --
  -- The reward's name/prize are snapshotted onto the row from challenge_campaigns
  -- so the coupon still reads correctly if the reward is later deleted. The
  -- passed-in p_prize_type / p_prize_gift_certificate_amount are preferred where
  -- present (they are what the caller judged this award against) and the campaign
  -- row fills the rest.
  if won and p_prize_expires_at is not null then
    insert into challenge_campaign_redemptions (
      challenge_id, winner_user_id, venue_id, cycle_start, prize_expires_at,
      reward_name, prize_type, prize_gift_certificate_amount,
      prize_kind, prize_menu_item, prize_menu_item_name,
      prize_discount_kind, prize_discount_value
    )
    select
      p_challenge_id, p_winner_user_id, p_venue_id, p_cycle_start, p_prize_expires_at,
      c.name,
      coalesce(p_prize_type, c.prize_type),
      coalesce(p_prize_gift_certificate_amount, c.prize_gift_certificate_amount),
      c.prize_kind, c.prize_menu_item, c.prize_menu_item_name,
      c.prize_discount_kind, c.prize_discount_value
    from challenge_campaigns c
    where c.id = p_challenge_id
    on conflict (challenge_id, winner_user_id, cycle_start) do nothing;
  end if;

  return next;
end;
$$;

revoke all on function public.award_cycle_winner(uuid, timestamptz, uuid, text, integer, integer, text, numeric, timestamptz) from public;
grant execute on function public.award_cycle_winner(uuid, timestamptz, uuid, text, integer, integer, text, numeric, timestamptz) to service_role;
