-- Rewards: let a partner really delete a reward that has already paid out,
-- WITHOUT destroying the record of prizes players already redeemed.
--
-- Today challenge_campaign_redemptions.challenge_id is `not null references
-- challenge_campaigns(id) on delete cascade`
-- (20260509024500_add_challenge_campaign_redemptions.sql). That cascade is why
-- deleteChallengeCampaign refuses to delete a campaign with any redemption
-- history: a real DELETE would silently void coupons, including ones sitting
-- unredeemed in a player's wallet.
--
-- The product decision (docs/rewards-slot-picker-review-fixes-plan.md Phase 5)
-- is that deleting is the partner's call, made with the consequence spelled out:
--   * UNREDEEMED coupons are voided along with the reward — that is the point.
--   * ALREADY-REDEEMED coupons survive as history, detached from the reward.
--
-- To let a redeemed row outlive its campaign, challenge_id becomes nullable with
-- `on delete set null`, and the row carries a SNAPSHOT of the reward's name and
-- prize so a detached coupon still reads correctly in the wallet
-- (listChallengeCampaignWinsForUser previously fell back to the literal string
-- "Challenge" with no prize once the campaign was gone).
--
-- challenge_cycle_winners is deliberately NOT made detachable: it is the atomic
-- multi-winner quota ledger (award_cycle_winner), which is meaningless without
-- the campaign it guards. Its existing `on delete cascade` is correct — the
-- coupon history is the record being preserved here, not the quota bookkeeping.

-- 1. Detach-on-delete instead of cascade-on-delete.
alter table challenge_campaign_redemptions
  alter column challenge_id drop not null;

-- Drop the existing FK by LOOKUP, not by assumed name. The original was created
-- inline in a `create table`, so Postgres auto-named it — and if that name were
-- anything other than the guess below, a `drop constraint if exists` would
-- silently no-op and leave the ON DELETE CASCADE in place, which is precisely the
-- behavior this migration exists to remove. Iterating the catalog makes the
-- outcome independent of naming.
do $$
declare
  v_constraint text;
begin
  for v_constraint in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'challenge_campaign_redemptions'
      and con.contype = 'f'
      and con.conkey = array[
        (select attnum from pg_attribute
          where attrelid = rel.oid and attname = 'challenge_id')
      ]::smallint[]
  loop
    execute format(
      'alter table public.challenge_campaign_redemptions drop constraint %I',
      v_constraint
    );
  end loop;
end $$;

alter table challenge_campaign_redemptions
  add constraint challenge_campaign_redemptions_challenge_id_fkey
    foreign key (challenge_id) references challenge_campaigns(id) on delete set null;

-- 2. Snapshot columns, so a detached row is still a meaningful record of what
--    was won. Written at award time (see lib/challengeCampaigns.ts and the
--    award_cycle_winner RPC) rather than reconstructed at delete time.
--
--    Deliberately NO check constraints mirroring challenge_campaigns' prize_kind /
--    prize_menu_item / prize_discount_kind enums: this is a historical record, and
--    a coupon awarded under today's vocabulary must remain storable and readable
--    if that vocabulary later changes. The reader (resolveRewardPrize) already
--    normalizes unknown values to null.
alter table challenge_campaign_redemptions
  add column if not exists reward_name text,
  add column if not exists prize_type text,
  add column if not exists prize_gift_certificate_amount numeric(10,2),
  add column if not exists prize_kind text,
  add column if not exists prize_menu_item text,
  add column if not exists prize_menu_item_name text,
  add column if not exists prize_discount_kind text,
  add column if not exists prize_discount_value numeric(10,2);

-- 3. Backfill existing rows from their campaign. Only fills blanks, so re-running
--    is safe and never overwrites a snapshot already taken at award time.
update challenge_campaign_redemptions r
set
  reward_name = coalesce(r.reward_name, c.name),
  prize_type = coalesce(r.prize_type, c.prize_type),
  prize_gift_certificate_amount =
    coalesce(r.prize_gift_certificate_amount, c.prize_gift_certificate_amount),
  prize_kind = coalesce(r.prize_kind, c.prize_kind),
  prize_menu_item = coalesce(r.prize_menu_item, c.prize_menu_item),
  prize_menu_item_name = coalesce(r.prize_menu_item_name, c.prize_menu_item_name),
  prize_discount_kind = coalesce(r.prize_discount_kind, c.prize_discount_kind),
  prize_discount_value = coalesce(r.prize_discount_value, c.prize_discount_value)
from challenge_campaigns c
where r.challenge_id = c.id
  and r.reward_name is null;

-- NOTE on the unique constraint: challenge_campaign_redemptions_unique_cycle
-- (challenge_id, winner_user_id, cycle_start) from
-- 20260617000003_challenge_cycle_winners.sql is intentionally left alone.
-- Postgres treats NULLs as distinct in a unique constraint, so detached rows
-- (challenge_id = null) never collide with each other — which is exactly the
-- behavior wanted for history that no longer belongs to any reward.
