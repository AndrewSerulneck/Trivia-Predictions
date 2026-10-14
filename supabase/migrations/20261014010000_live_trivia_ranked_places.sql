-- Live Trivia weekly places reward, Phase 1 (docs/live-trivia-weekly-places-reward-plan.md §5a).
--
-- A new way to win a reward: add up each player's Live Trivia points over a week and give
-- 1st / 2nd / 3rd place each their OWN prize. Settled once per week, all or nothing.
--
-- It adds:
--   1. challenge_campaigns.win_condition gains 'ranked_places'.
--   2. challenge_campaigns.place_prizes jsonb — one prize per place, set if and only if the
--      reward is 'ranked_places' (1 to 3 places). Element shape is validated in TypeScript
--      (normalizePlacePrizes, lib/rankedPlaceRewards.ts); the RPC below re-checks each place it
--      pays exists.
--   3. challenge_campaigns.min_players smallint — the partner's optional "only pay out if at
--      least N players took part" (Andrew, 2026-10-14). NULL = no minimum (D2). Allowed only
--      on competitive rewards ('game_winner', 'ranked_places'); a points target is a personal
--      goal, so a minimum means nothing there.
--   4. place smallint on challenge_cycle_winners and challenge_campaign_redemptions
--      (NULL on every existing row; 1-3 for a ranked win).
--   5. challenge_cycle_settlements — one row per settled (reward, week), INCLUDING weeks
--      nobody won (no scorers, or below the partner's minimum). It is the "this week is done"
--      marker: the resolver reads it first and never re-reads scores for a settled week, and
--      the Partner Dashboard's past-winners history reads it to say why a week paid nothing.
--   6. award_ranked_cycle_places(...) — the ONLY writer of ranked wins. Under the SAME advisory
--      lock key as award_cycle_winner it settles one week atomically: settlement row + one
--      ledger row and one coupon per place, each coupon snapshotting THAT place's prize.
--   7. live_trivia_week_totals(...) — one indexed aggregate: per player, total points over the
--      given (schedule, occurrence_date) games and when they reached that total.
--   8. award_cycle_winner re-created with one added guard: it refuses a 'ranked_places' reward
--      (won = false, exhausted = true), so no path can pay places one at a time or pay a ranked
--      reward through the points-target accrual. Same arity, same lock key, otherwise identical
--      to 20261007030714_square_scannable_prizes.sql.
--   9. A partial index for the resolver's "active ranked rewards" scan.
--
-- Grants: one new table (service_role only, RLS on, no browser access) and two new functions
-- (service_role only). award_cycle_winner keeps its revoke/grant.
--
-- No new FK to users or auth.users: settlements carry no user id. delete_player_account
-- (20261008044524) blanks challenge_cycle_winners.winner_user_id and deletes the player's
-- coupons; the new `place` columns ride along with no change needed there.
--
-- Deploy order: migration FIRST. Until app code creates a ranked reward nothing reads or writes
-- any of this; existing rewards keep win_condition 'points_threshold'/'game_winner', NULL
-- place_prizes, NULL min_players, NULL place.

-- ── 1. win_condition allows 'ranked_places' ─────────────────────────────────────────────
-- The original check was declared inline (20260721120000), so Postgres named it. Drop every
-- single-column check on win_condition by catalog lookup rather than by a guessed name — a
-- wrong guess would silently no-op and the add below would leave the old check in force.
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
      and rel.relname = 'challenge_campaigns'
      and con.contype = 'c'
      and con.conkey = array[
        (select attnum from pg_attribute where attrelid = rel.oid and attname = 'win_condition')
      ]::smallint[]
  loop
    execute format('alter table public.challenge_campaigns drop constraint %I', v_constraint);
  end loop;
end $$;

alter table public.challenge_campaigns
  add constraint challenge_campaigns_win_condition_check
    check (win_condition in ('points_threshold', 'game_winner', 'ranked_places'));

-- ── 2. place_prizes ─────────────────────────────────────────────────────────────────────
alter table public.challenge_campaigns
  add column if not exists place_prizes jsonb;

alter table public.challenge_campaigns
  drop constraint if exists challenge_campaigns_place_prizes_check;
-- CASE, not AND: Postgres does not promise left-to-right evaluation, and
-- jsonb_array_length raises on a non-array.
alter table public.challenge_campaigns
  add constraint challenge_campaigns_place_prizes_check
    check (
      case
        when place_prizes is null then win_condition <> 'ranked_places'
        when jsonb_typeof(place_prizes) <> 'array' then false
        else win_condition = 'ranked_places' and jsonb_array_length(place_prizes) between 1 and 3
      end
    );

-- ── 3. min_players ──────────────────────────────────────────────────────────────────────
alter table public.challenge_campaigns
  add column if not exists min_players smallint;

alter table public.challenge_campaigns
  drop constraint if exists challenge_campaigns_min_players_check;
alter table public.challenge_campaigns
  add constraint challenge_campaigns_min_players_check
    check (
      min_players is null
      or (min_players between 2 and 100 and win_condition in ('game_winner', 'ranked_places'))
    );

-- ── 4. place on the ledger and the coupon ───────────────────────────────────────────────
alter table public.challenge_cycle_winners
  add column if not exists place smallint
    constraint challenge_cycle_winners_place_check check (place is null or place between 1 and 3);

alter table public.challenge_campaign_redemptions
  add column if not exists place smallint
    constraint challenge_campaign_redemptions_place_check check (place is null or place between 1 and 3);

-- ── 5. Settlements ──────────────────────────────────────────────────────────────────────
create table if not exists public.challenge_cycle_settlements (
  challenge_id uuid not null references public.challenge_campaigns(id) on delete cascade,
  cycle_start timestamptz not null,
  venue_id text not null references public.venues(id) on delete cascade,
  outcome text not null
    constraint challenge_cycle_settlements_outcome_check
    check (outcome in ('awarded', 'no_scorers', 'below_minimum')),
  -- Players who answered at least one question in the week (scored or not).
  participant_count integer not null
    constraint challenge_cycle_settlements_participant_count_check check (participant_count >= 0),
  winner_count smallint not null
    constraint challenge_cycle_settlements_winner_count_check check (winner_count between 0 and 3),
  -- The partner's minimum at settlement time (NULL = none), kept so history can explain itself
  -- even after the reward is edited.
  min_players smallint,
  settled_at timestamptz not null default now(),
  primary key (challenge_id, cycle_start),
  constraint challenge_cycle_settlements_outcome_shape_check check (
    (outcome = 'awarded') = (winner_count > 0)
  )
);

-- Partner history lists a venue's settled weeks newest-first.
create index if not exists idx_challenge_cycle_settlements_venue
  on public.challenge_cycle_settlements (venue_id, settled_at desc);

alter table public.challenge_cycle_settlements enable row level security;
alter table public.challenge_cycle_settlements force row level security;
revoke all on table public.challenge_cycle_settlements from anon, authenticated;
grant select, insert, update, delete on table public.challenge_cycle_settlements to service_role;

-- ── 6. award_ranked_cycle_places ────────────────────────────────────────────────────────
-- p_winners: [{"user_id": uuid, "place": 1..3, "points": int > 0}], places contiguous from 1.
-- Empty array = nobody won; the outcome is then 'below_minimum' when the reward has a minimum
-- the week did not reach, else 'no_scorers'.
-- Returns status 'awarded' | 'no_scorers' | 'below_minimum' | 'already_resolved' and how many
-- coupons this call minted. Bad input RAISES (the whole call rolls back, nothing is written).
create or replace function public.award_ranked_cycle_places(
  p_challenge_id uuid,
  p_cycle_start timestamptz,
  p_venue_id text,
  p_winners jsonb,
  p_participant_count integer,
  p_prize_expires_at timestamptz
)
returns table (
  status text,
  winners_awarded integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign challenge_campaigns%rowtype;
  v_place_count integer;
  v_winner_count integer;
  v_distinct_places integer;
  v_distinct_users integer;
  v_max_place integer;
  v_outcome text;
begin
  -- The SAME key as award_cycle_winner: the two can never interleave for one (reward, week).
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_challenge_id::text || ':' || extract(epoch from p_cycle_start)::text,
      0
    )
  );

  select * into v_campaign from challenge_campaigns where id = p_challenge_id;
  if not found then
    raise exception 'award_ranked_cycle_places: reward % not found', p_challenge_id;
  end if;
  if v_campaign.win_condition is distinct from 'ranked_places' or v_campaign.place_prizes is null then
    raise exception 'award_ranked_cycle_places: reward % is not a ranked-places reward', p_challenge_id;
  end if;

  if exists (
    select 1 from challenge_cycle_settlements
    where challenge_id = p_challenge_id and cycle_start = p_cycle_start
  ) or exists (
    select 1 from challenge_cycle_winners
    where challenge_id = p_challenge_id and cycle_start = p_cycle_start
  ) then
    status := 'already_resolved';
    winners_awarded := 0;
    return next;
    return;
  end if;

  if p_venue_id is null or p_cycle_start is null then
    raise exception 'award_ranked_cycle_places: venue and week are required';
  end if;
  if p_winners is null or jsonb_typeof(p_winners) <> 'array' then
    raise exception 'award_ranked_cycle_places: winners must be a JSON array';
  end if;
  if p_participant_count is null or p_participant_count < 0 then
    raise exception 'award_ranked_cycle_places: participant count is required';
  end if;

  v_place_count := jsonb_array_length(v_campaign.place_prizes);
  v_winner_count := jsonb_array_length(p_winners);

  if v_winner_count > 0 then
    if exists (
      select 1 from jsonb_array_elements(p_winners) w
      where jsonb_typeof(w) <> 'object'
         or (w->>'user_id') is null
         or (w->>'place') is null
         or (w->>'points') is null
         or (w->>'place') !~ '^[0-9]+$'
         or (w->>'points') !~ '^[0-9]+$'
         or (w->>'user_id') !~ '^[0-9a-fA-F-]{36}$'
    ) then
      raise exception 'award_ranked_cycle_places: each winner needs user_id, place and points';
    end if;

    select count(distinct (w->>'place')::int), count(distinct (w->>'user_id')::uuid), max((w->>'place')::int)
      into v_distinct_places, v_distinct_users, v_max_place
      from jsonb_array_elements(p_winners) w;

    if v_distinct_places <> v_winner_count or v_distinct_users <> v_winner_count then
      raise exception 'award_ranked_cycle_places: duplicate place or player';
    end if;
    -- Places are 1..k with no gaps (k <= the reward's place count).
    if v_max_place <> v_winner_count or v_winner_count > v_place_count
       or exists (select 1 from jsonb_array_elements(p_winners) w where (w->>'place')::int < 1) then
      raise exception 'award_ranked_cycle_places: places must run 1..% with no gaps', least(v_winner_count, v_place_count);
    end if;
    -- D2: only a player with more than 0 points can place.
    if exists (select 1 from jsonb_array_elements(p_winners) w where (w->>'points')::bigint < 1) then
      raise exception 'award_ranked_cycle_places: a placed player must have more than 0 points';
    end if;
    if p_participant_count < v_winner_count then
      raise exception 'award_ranked_cycle_places: fewer participants than winners';
    end if;
    if v_campaign.min_players is not null and p_participant_count < v_campaign.min_players then
      raise exception 'award_ranked_cycle_places: % players is below this reward''s minimum of %',
        p_participant_count, v_campaign.min_players;
    end if;
    if p_prize_expires_at is null then
      raise exception 'award_ranked_cycle_places: a coupon expiry is required';
    end if;
    -- Every place being paid must have a prize on the reward.
    if exists (
      select 1 from jsonb_array_elements(p_winners) w
      where not exists (
        select 1 from jsonb_array_elements(v_campaign.place_prizes) pp
        where jsonb_typeof(pp) = 'object' and (pp->>'place') = (w->>'place')
          and (pp->>'prize_kind') in ('menu_item', 'gift_card')
      )
    ) then
      raise exception 'award_ranked_cycle_places: reward % has no prize for a place being paid', p_challenge_id;
    end if;
    v_outcome := 'awarded';
  elsif v_campaign.min_players is not null and p_participant_count < v_campaign.min_players then
    v_outcome := 'below_minimum';
  else
    v_outcome := 'no_scorers';
  end if;

  insert into challenge_cycle_settlements (
    challenge_id, cycle_start, venue_id, outcome, participant_count, winner_count, min_players
  ) values (
    p_challenge_id, p_cycle_start, p_venue_id, v_outcome, p_participant_count, v_winner_count,
    v_campaign.min_players
  );

  if v_winner_count > 0 then
    -- Plain inserts (no ON CONFLICT): the existence check above ran under the lock, so any
    -- conflict is a real anomaly and must roll the whole week back.
    insert into challenge_cycle_winners (
      challenge_id, cycle_start, winner_user_id, venue_id, points_earned,
      prize_type, prize_gift_certificate_amount, place
    )
    select
      p_challenge_id, p_cycle_start, (w->>'user_id')::uuid, p_venue_id,
      least((w->>'points')::bigint, 2147483647)::integer,
      null, nullif(pp->>'prize_gift_certificate_amount', '')::numeric(10,2),
      (w->>'place')::smallint
    from jsonb_array_elements(p_winners) w
    join lateral (
      select e as pp from jsonb_array_elements(v_campaign.place_prizes) e
      where (e->>'place') = (w->>'place')
      limit 1
    ) prize on true;

    insert into challenge_campaign_redemptions (
      challenge_id, winner_user_id, venue_id, cycle_start, prize_expires_at,
      reward_name, prize_type, prize_gift_certificate_amount,
      prize_kind, prize_menu_item, prize_menu_item_name,
      prize_discount_kind, prize_discount_value, prize_pos_value_cents, prize_pos_delivery,
      place
    )
    select
      p_challenge_id, (w->>'user_id')::uuid, p_venue_id, p_cycle_start, p_prize_expires_at,
      v_campaign.name, null,
      nullif(pp->>'prize_gift_certificate_amount', '')::numeric(10,2),
      pp->>'prize_kind', pp->>'prize_menu_item', pp->>'prize_menu_item_name',
      pp->>'prize_discount_kind', nullif(pp->>'prize_discount_value', '')::numeric(10,2),
      nullif(pp->>'prize_pos_value_cents', '')::integer, pp->>'prize_pos_delivery',
      (w->>'place')::smallint
    from jsonb_array_elements(p_winners) w
    join lateral (
      select e as pp from jsonb_array_elements(v_campaign.place_prizes) e
      where (e->>'place') = (w->>'place')
      limit 1
    ) prize on true;
  end if;

  status := v_outcome;
  winners_awarded := v_winner_count;
  return next;
end;
$$;

revoke all on function public.award_ranked_cycle_places(uuid, timestamptz, text, jsonb, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.award_ranked_cycle_places(uuid, timestamptz, text, jsonb, integer, timestamptz) to service_role;

-- ── 7. live_trivia_week_totals ──────────────────────────────────────────────────────────
-- p_schedule_ids[i] pairs with p_dates[i]: exactly the games that make up the week (a pinned
-- reward passes only its pinned games). One row per player who answered at least once:
--   total_points — sum of points_awarded (0 for a player who answered but never scored)
--   reached_at   — answered_at of their last point-scoring answer (NULL when total is 0), i.e.
--                  the moment they reached their final total; the D1 tiebreak.
-- occurrence_date is already the venue-local date — never convert it.
create or replace function public.live_trivia_week_totals(
  p_schedule_ids uuid[],
  p_dates date[]
)
returns table (
  user_id uuid,
  total_points bigint,
  reached_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select a.user_id,
         sum(a.points_awarded)::bigint as total_points,
         max(a.answered_at) filter (where a.points_awarded > 0) as reached_at
  from unnest(p_schedule_ids, p_dates) as g(schedule_id, occurrence_date)
  join live_showdown_answers a
    on a.schedule_id = g.schedule_id
   and a.occurrence_date = g.occurrence_date
  group by a.user_id;
$$;

revoke all on function public.live_trivia_week_totals(uuid[], date[]) from public, anon, authenticated;
grant execute on function public.live_trivia_week_totals(uuid[], date[]) to service_role;

-- ── 8. award_cycle_winner refuses ranked rewards ────────────────────────────────────────
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

  -- A ranked-places reward is paid only by award_ranked_cycle_places, all places at once.
  if exists (
    select 1 from challenge_campaigns
    where id = p_challenge_id and win_condition = 'ranked_places'
  ) then
    won := false;
    exhausted := true;
    return next;
    return;
  end if;

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

-- ── 9. Resolver scan index ──────────────────────────────────────────────────────────────
create index if not exists idx_challenge_campaigns_ranked_places
  on public.challenge_campaigns (win_condition)
  where win_condition = 'ranked_places';
