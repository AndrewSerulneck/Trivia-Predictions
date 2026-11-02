-- Pick 'Em plan (docs/pickem-college-football-and-prize-plan.md) Phase 4b: paying the Pick 'Em Prize.
--
-- The award sweep is lib/pickemPrizeAwards.ts, run at the end of /api/cron/pickem-settle. "Most picks
-- right" and "Get N right" pay through the existing award_cycle_winner (they keep the campaign's own
-- prize). "X out of N" needs a tier-aware award, because each tier has its own prize and quantity and
-- a player wins only ONE tier per period (D4) — this file adds it.
--
-- Parts:
--   1. pickem_prize_settlements — one row per (prize, period) once its final pass ran (paid or not). The
--      sweep reads it first and never re-reads a settled period. Not challenge_cycle_settlements: that
--      table caps winner_count at 3 (places) and a "Get N right" period can pay up to 100.
--   2. pickem_prize_tiebreakers — a player's "total points in the last game" guess for one period of a
--      "most picks right" prize (D8). Written only by lib/pickemPrizeTiebreaker.ts, before that game
--      starts; read by the sweep when the leaders tie.
--   3. award_pickem_tier_prize(...) — the ONLY writer of "X out of N" wins. Under one advisory lock per
--      (prize, period), plus each tier's own award_cycle_winner key (ascending), it pays the HIGHEST tier
--      the player reached that still has a prize left, copying THAT tier's prize from pickem_tiers onto
--      the ledger row and the coupon (as award_ranked_cycle_places copies a place's). It refuses a
--      second prize for the same player in the same period at any tier (D4). The period start is the
--      tier-0 key (a whole minute); tier t's key is that + t seconds (pickemPrizeCycleStart).
--   4. An index on pickem_picks.resolved_at: the sweep asks "what was graded in the last few minutes?"
--      once per run, so it re-reads only the periods whose picks changed.
--
-- Grants: two new tables (service_role only, RLS on, no browser access) and one new function
-- (service_role only). Both tables reference users ON DELETE CASCADE (never SET NULL), so
-- delete_player_account needs no change: a deleted player's guesses go with them. challenge_cycle_winners
-- rows written here are blanked by delete_player_account exactly like every other win.
--
-- DEPLOY ORDER: after 20261031200417_pickem_prizes.sql (this function reads its pickem_tiers column),
-- and before the code that runs the sweep. Nothing writes any of this until a Pick 'Em Prize exists.

-- ── 1. Settlements ──────────────────────────────────────────────────────────────────────────

create table if not exists public.pickem_prize_settlements (
  challenge_id uuid not null references public.challenge_campaigns(id) on delete cascade,
  -- The period's tier-0 key: venue-local midnight of its first day (pickemPrizeCycleStart(period, 0)).
  period_start timestamptz not null,
  venue_id text not null references public.venues(id) on delete cascade,
  outcome text not null
    constraint pickem_prize_settlements_outcome_check check (outcome in ('awarded', 'no_winner', 'below_minimum')),
  -- Players with at least one pick in the prize's games in the period.
  participant_count integer not null
    constraint pickem_prize_settlements_participants_check check (participant_count >= 0),
  -- Every prize paid for the period, at any tier, including ones paid before the final pass.
  winner_count integer not null
    constraint pickem_prize_settlements_winners_check check (winner_count >= 0),
  settled_at timestamptz not null default now(),
  primary key (challenge_id, period_start),
  constraint pickem_prize_settlements_shape_check check ((outcome = 'awarded') = (winner_count > 0))
);

create index if not exists idx_pickem_prize_settlements_venue
  on public.pickem_prize_settlements (venue_id, settled_at desc);

alter table public.pickem_prize_settlements enable row level security;
alter table public.pickem_prize_settlements force row level security;
revoke all on table public.pickem_prize_settlements from anon, authenticated;
grant select, insert, update, delete on table public.pickem_prize_settlements to service_role;

-- ── 2. Tiebreaker guesses ───────────────────────────────────────────────────────────────────

create table if not exists public.pickem_prize_tiebreakers (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenge_campaigns(id) on delete cascade,
  -- The period's tier-0 key, as in pickem_prize_settlements.
  period_start timestamptz not null,
  user_id uuid not null references public.users(id) on delete cascade,
  venue_id text not null references public.venues(id) on delete cascade,
  -- The game the question was about when the guess was saved (the period's last game): its league
  -- (provider sport key), its Pick 'Em game id and its start. The sweep reads that game's final score.
  sport_key text not null,
  game_id text not null,
  game_starts_at timestamptz not null,
  predicted_total integer not null
    constraint pickem_prize_tiebreakers_total_check check (predicted_total between 0 and 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pickem_prize_tiebreakers_unique unique (challenge_id, period_start, user_id)
);

alter table public.pickem_prize_tiebreakers enable row level security;
alter table public.pickem_prize_tiebreakers force row level security;
revoke all on table public.pickem_prize_tiebreakers from anon, authenticated;
grant select, insert, update, delete on table public.pickem_prize_tiebreakers to service_role;

-- ── 3. award_pickem_tier_prize ──────────────────────────────────────────────────────────────
-- p_period_start: the tier-0 key (a whole minute). p_correct: the player's correct picks among their
-- first N in the period (the caller counts; the pick limit is the prize's, never this function's).
-- Returns status:
--   'awarded'     — a coupon was minted for `tier` (1–3);
--   'already_won' — the player already has a prize for this period (any tier); nothing written;
--   'not_reached' — p_correct is below the lowest tier; nothing written;
--   'exhausted'   — every tier the player reached is out of prizes; nothing written.
-- Bad input RAISES (nothing is written).
create or replace function public.award_pickem_tier_prize(
  p_challenge_id uuid,
  p_period_start timestamptz,
  p_winner_user_id uuid,
  p_venue_id text,
  p_correct integer,
  p_prize_expires_at timestamptz
)
returns table (
  status text,
  tier integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign challenge_campaigns%rowtype;
  v_tier record;
  v_key timestamptz;
  v_count integer;
  v_reached boolean := false;
  i integer;
begin
  if p_challenge_id is null or p_period_start is null or p_winner_user_id is null or p_venue_id is null
     or p_correct is null or p_prize_expires_at is null then
    raise exception 'award_pickem_tier_prize: every argument is required';
  end if;
  if p_period_start <> date_trunc('minute', p_period_start) then
    raise exception 'award_pickem_tier_prize: the period start must be a whole minute (the tier-0 key)';
  end if;
  if p_correct < 0 then
    raise exception 'award_pickem_tier_prize: correct picks cannot be negative';
  end if;

  -- Every tier award for this (prize, period) queues on one lock, so D4 and the per-tier quotas are
  -- judged on settled rows. Then each tier's own award_cycle_winner key, always in ascending order, so
  -- no other writer can touch a tier cycle while this runs (and no two callers can deadlock).
  perform pg_advisory_xact_lock(
    hashtextextended(p_challenge_id::text || ':pickem-period:' || extract(epoch from p_period_start)::text, 0)
  );
  for i in 1..3 loop
    perform pg_advisory_xact_lock(
      hashtextextended(
        p_challenge_id::text || ':' || extract(epoch from (p_period_start + make_interval(secs => i)))::text,
        0
      )
    );
  end loop;

  select * into v_campaign from challenge_campaigns where id = p_challenge_id;
  if not found then
    raise exception 'award_pickem_tier_prize: prize % not found', p_challenge_id;
  end if;
  if v_campaign.reward_definition_id is distinct from 'pickem_challenge'
     or v_campaign.pickem_tiers is null
     or jsonb_typeof(v_campaign.pickem_tiers) <> 'array' then
    raise exception 'award_pickem_tier_prize: prize % is not an "X out of N" Pick ''Em Prize', p_challenge_id;
  end if;
  if not (p_venue_id = any(coalesce(v_campaign.venue_ids, '{}'::text[]))) then
    raise exception 'award_pickem_tier_prize: prize % does not run at venue %', p_challenge_id, p_venue_id;
  end if;

  -- D4: one prize per player per period, whichever tier it was.
  if exists (
    select 1 from challenge_cycle_winners
    where challenge_id = p_challenge_id
      and winner_user_id = p_winner_user_id
      and cycle_start >= p_period_start
      and cycle_start <= p_period_start + interval '3 seconds'
  ) then
    status := 'already_won';
    tier := null;
    return next;
    return;
  end if;

  -- The highest tier reached that still has a prize left.
  for v_tier in
    select (e->>'place')::int as tier_no, (e->>'quantity')::int as quantity, e as prize
    from jsonb_array_elements(v_campaign.pickem_tiers) e
    where jsonb_typeof(e) = 'object'
      and coalesce(e->>'place', '') ~ '^[1-3]$'
      and coalesce(e->>'correct', '') ~ '^[0-9]+$'
      and coalesce(e->>'quantity', '') ~ '^[0-9]+$'
      and (e->>'prize_kind') in ('menu_item', 'gift_card')
      and (e->>'correct')::int <= p_correct
    order by (e->>'correct')::int desc
  loop
    v_reached := true;
    v_key := p_period_start + make_interval(secs => v_tier.tier_no);
    select count(*) into v_count
    from challenge_cycle_winners
    where challenge_id = p_challenge_id and cycle_start = v_key;

    if v_count < greatest(v_tier.quantity, 1) then
      -- Plain inserts (no ON CONFLICT): the D4 check above ran under the lock, so a conflict is a real
      -- anomaly and must roll the whole award back.
      insert into challenge_cycle_winners (
        challenge_id, cycle_start, winner_user_id, venue_id, points_earned,
        prize_type, prize_gift_certificate_amount
      ) values (
        p_challenge_id, v_key, p_winner_user_id, p_venue_id, p_correct,
        null, nullif(v_tier.prize->>'prize_gift_certificate_amount', '')::numeric(10,2)
      );

      insert into challenge_campaign_redemptions (
        challenge_id, winner_user_id, venue_id, cycle_start, prize_expires_at,
        reward_name, prize_type, prize_gift_certificate_amount,
        prize_kind, prize_menu_item, prize_menu_item_name,
        prize_discount_kind, prize_discount_value, prize_pos_value_cents, prize_pos_delivery
      ) values (
        p_challenge_id, p_winner_user_id, p_venue_id, v_key, p_prize_expires_at,
        v_campaign.name, null,
        nullif(v_tier.prize->>'prize_gift_certificate_amount', '')::numeric(10,2),
        v_tier.prize->>'prize_kind', v_tier.prize->>'prize_menu_item', v_tier.prize->>'prize_menu_item_name',
        v_tier.prize->>'prize_discount_kind', nullif(v_tier.prize->>'prize_discount_value', '')::numeric(10,2),
        nullif(v_tier.prize->>'prize_pos_value_cents', '')::integer, v_tier.prize->>'prize_pos_delivery'
      );

      status := 'awarded';
      tier := v_tier.tier_no;
      return next;
      return;
    end if;
  end loop;

  status := case when v_reached then 'exhausted' else 'not_reached' end;
  tier := null;
  return next;
end;
$$;

revoke all on function public.award_pickem_tier_prize(uuid, timestamptz, uuid, text, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.award_pickem_tier_prize(uuid, timestamptz, uuid, text, integer, timestamptz) to service_role;

-- ── 4. "What was graded in the last few minutes?" ───────────────────────────────────────────

create index if not exists idx_pickem_picks_resolved_at
  on public.pickem_picks (resolved_at)
  where resolved_at is not null;
