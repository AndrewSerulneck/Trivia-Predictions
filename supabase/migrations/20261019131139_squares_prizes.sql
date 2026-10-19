-- Squares + Brackets plan (docs/squares-and-brackets-plan.md) Phase 4: Super Bowl Squares Prizes.
--
-- A partner offers a Prize for any of the four scoring moments (q1, half, q3, final). Each chosen
-- moment pays ONE coupon at that venue — to whoever holds the venue's winning square — through the
-- existing award_cycle_winner RPC (lib/squaresPrizeAwards.ts). Nothing here changes how a prize is
-- awarded or redeemed.
--
-- Parts:
--   1. challenge_campaigns_game_types_valid accepts 'squares' (a Squares prize's game_types is
--      ['squares']). Rebuilt with every value the last version (20260715000200) allowed.
--   2. challenge_campaigns.squares_moments: which moments a Squares prize pays, in game order.
--      NULL = not a Squares prize (purely additive; every existing row stays NULL). Deliberately NOT
--      in lib/challengeCampaigns.ts's CAMPAIGN_SELECT_COLUMNS: only Squares code reads it, so a
--      deploy that runs ahead of this migration leaves every other prize untouched.
--   3. squares_results.prize_checked_at: set once a winning result has been checked against the
--      venue's Squares prizes (awarded or not), so the every-minute settlement reads only new
--      results. Plus the partial index that read uses.
--   4. A voided grade's coupons are taken back if unused (Andrew, 2026-10-19):
--      squares_results.prize_withdrawn_at + squares_withdraw_prize_coupons(). An admin void + re-grade
--      pays the corrected winner under a NEW cycle key (grade_no is part of it), and this withdraws
--      the old winner's coupon unless it was already redeemed (a redeemed one is spent and kept).
--
-- No new table, view or sequence, so no grants. No users FK, so delete_player_account is unchanged.
-- DEPLOY ORDER: apply this BEFORE turning NEXT_PUBLIC_SQUARES_ENABLED on (the flag is what offers a
-- Squares prize at all).

-- ── 1. 'squares' is a campaign game type ───────────────────────────────────────────────────

alter table public.challenge_campaigns
  drop constraint if exists challenge_campaigns_game_types_valid;

alter table public.challenge_campaigns
  add constraint challenge_campaigns_game_types_valid
  check (
    array_length(game_types, 1) is null
    or game_types <@ array[
      'pickem', 'fantasy', 'trivia', 'bingo', 'speed-trivia', 'live-trivia', 'nfl-pickem', 'squares'
    ]::text[]
  );

-- ── 2. Which moments a Squares prize pays ──────────────────────────────────────────────────

alter table public.challenge_campaigns
  add column if not exists squares_moments text[];

-- 1–4 known moments, none twice. A function because a check constraint can't hold a subquery
-- (same pattern as squares_is_digit_permutation, 20261019051458).
create or replace function public.squares_moments_valid(p text[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select p is not null
    and cardinality(p) between 1 and 4
    and p <@ array['q1', 'half', 'q3', 'final']::text[]
    and cardinality(p) = (select count(distinct m) from unnest(p) as m);
$$;

grant execute on function public.squares_moments_valid(text[]) to service_role;

alter table public.challenge_campaigns
  drop constraint if exists challenge_campaigns_squares_moments_valid;

alter table public.challenge_campaigns
  add constraint challenge_campaigns_squares_moments_valid
  check (squares_moments is null or public.squares_moments_valid(squares_moments));

comment on column public.challenge_campaigns.squares_moments is
  'Super Bowl Squares prizes: the scoring moments (q1, half, q3, final) that each pay one coupon at the venue. NULL = not a Squares prize. Read only by lib/squaresPrizeAwards.ts and the description reads (never CAMPAIGN_SELECT_COLUMNS).';

-- ── 3. Which winning results have been checked for prizes ──────────────────────────────────

alter table public.squares_results
  add column if not exists prize_checked_at timestamptz;

-- The settlement's "winning results not yet checked for a prize" read.
create index if not exists squares_results_prize_unchecked_idx
  on public.squares_results (event_id)
  where user_id is not null and voided_at is null and prize_checked_at is null;

-- ── 4. Taking back a voided grade's unused coupons ─────────────────────────────────────────

alter table public.squares_results
  add column if not exists prize_withdrawn_at timestamptz;

-- The settlement's "voided results whose prizes were checked but not yet taken back" read.
create index if not exists squares_results_prize_withdraw_idx
  on public.squares_results (event_id)
  where user_id is not null and voided_at is not null and prize_checked_at is not null and prize_withdrawn_at is null;

-- Withdraw every UNREDEEMED Super Bowl Squares coupon this player won at this venue for one prize
-- cycle (lib/squaresPrizes.ts squaresPrizeCycleStart: one moment of one grade), and its ledger row.
-- A redeemed coupon is spent and stays, ledger row and all. Safe to repeat (a second call finds
-- nothing). Takes each Squares prize's award_cycle_winner lock for the cycle first, so it never
-- interleaves with an award of the same cycle; a guest redeeming at the same instant is serialised
-- by the row itself (redeem_challenge_prize's conditional update vs this conditional delete: exactly
-- one wins). Only campaigns with reward_definition_id = 'squares_challenge' are ever touched.
-- Returns how many coupons were withdrawn and how many (redeemed) were kept.
create or replace function public.squares_withdraw_prize_coupons(
  p_venue_id text,
  p_cycle_start timestamptz,
  p_user_id uuid
)
returns table (
  withdrawn_count integer,
  kept_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_withdrawn uuid[];
begin
  if p_venue_id is null or p_cycle_start is null or p_user_id is null then
    raise exception 'squares_withdraw_prize_coupons: venue, cycle and user are required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(c.id::text || ':' || extract(epoch from p_cycle_start)::text, 0))
  from (
    select id from challenge_campaigns
    where reward_definition_id = 'squares_challenge' and p_venue_id = any(venue_ids)
    order by id
  ) c;

  with gone as (
    delete from challenge_campaign_redemptions r
    using challenge_campaigns c
    where c.id = r.challenge_id
      and c.reward_definition_id = 'squares_challenge'
      and r.venue_id = p_venue_id
      and r.cycle_start = p_cycle_start
      and r.winner_user_id = p_user_id
      and r.prize_redeemed_at is null
    returning r.challenge_id
  )
  select coalesce(array_agg(gone.challenge_id), '{}'::uuid[]) into v_withdrawn from gone;

  delete from challenge_cycle_winners w
  where w.challenge_id = any(v_withdrawn)
    and w.venue_id = p_venue_id
    and w.cycle_start = p_cycle_start
    and w.winner_user_id = p_user_id;

  withdrawn_count := cardinality(v_withdrawn);
  select count(*)::integer into kept_count
  from challenge_campaign_redemptions r
  join challenge_campaigns c on c.id = r.challenge_id
  where c.reward_definition_id = 'squares_challenge'
    and r.venue_id = p_venue_id
    and r.cycle_start = p_cycle_start
    and r.winner_user_id = p_user_id;
  return next;
end;
$$;

revoke all on function public.squares_withdraw_prize_coupons(text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.squares_withdraw_prize_coupons(text, timestamptz, uuid) to service_role;

