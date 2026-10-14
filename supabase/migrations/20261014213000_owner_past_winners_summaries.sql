-- Past Winners on the Partner Dashboard (docs/live-trivia-weekly-places-reward-plan.md §5f, Phase 8).
--
-- Two READ-ONLY functions, service_role only, plus one index. Nothing here writes data, and no
-- table, view or sequence is created (so no new table grants are needed).
--
--   1. live_trivia_occurrence_summaries(p_schedule_ids, p_before, p_limit) — one page of a venue's
--      past Live Trivia games, newest first: per (schedule, occurrence_date) that has answers, the
--      player count (everyone who answered, scored or not), the top score and who reached it (ties
--      all listed). Paged on the date: p_before = only games strictly before that date. A page never
--      splits one date (every game on the page's oldest date is included), so it can hold a few more
--      than p_limit rows when several schedules played that date.
--
--      Cost: the dates are found by an index walk — one `max(occurrence_date)` probe per game on
--      idx_lsa_occurrence (schedule_id, occurrence_date), at most p_limit per schedule — and only the
--      picked games' answers are aggregated. So one page reads ~20 games' answers, however long the
--      venue's history is.
--
--   2. challenge_reward_history_summaries(p_venue_id, p_before_at, p_before_id, p_limit) — one page of
--      the rewards that have ever paid (or settled a week with nobody) AT THIS VENUE, most recent
--      activity first: per reward, its latest cycle (by cycle_start), when anything last happened (a
--      winner finalized or a week settled), how many cycles it has had here, and that latest cycle's
--      winners (user_id, place, points; place-ordered). The rewards are found from this venue's own
--      ledger (challenge_cycle_winners.venue_id) and settlements (challenge_cycle_settlements.venue_id),
--      never from a capped list of campaigns, so an old reward never drops out. Keyset paged on
--      (last_activity_at, challenge_id) desc; returns up to p_limit + 1 rows so the caller can tell
--      whether another page exists. Every win goes through award_cycle_winner /
--      award_ranked_cycle_places, so the ledger is complete.
--
--      Cost: one index range scan of the venue's ledger rows (new idx_challenge_cycle_winners_venue)
--      and settlements (idx_challenge_cycle_settlements_venue, Phase 1), grouped in memory. A venue's
--      ledger is small (one row per winner); only on demand.
--
-- Both are security definer with search_path pinned, execute for service_role only. The caller
-- (lib/ownerHistory.ts) maps user ids to usernames and never sends an id to the browser.
--
-- Deploy order: migration FIRST. Until then the Past Winners routes return a "not available yet"
-- 503 ([OwnerHistory] rpc-missing) and nothing else is affected.

-- ── 1. live_trivia_occurrence_summaries ─────────────────────────────────────────────────
create or replace function public.live_trivia_occurrence_summaries(
  p_schedule_ids uuid[],
  p_before date,
  p_limit integer
)
returns table (
  schedule_id uuid,
  occurrence_date date,
  player_count integer,
  top_points bigint,
  top_user_ids uuid[]
)
language sql
stable
security definer
set search_path = public
as $$
  with recursive
  page_size as (
    select greatest(1, least(coalesce(p_limit, 20), 100)) as n
  ),
  walk(schedule_id, occurrence_date, step) as (
    select s.id,
           (select max(a.occurrence_date)
              from live_showdown_answers a
             where a.schedule_id = s.id
               and (p_before is null or a.occurrence_date < p_before)),
           1
      from (select distinct unnest(p_schedule_ids) as id) s
    union all
    select w.schedule_id,
           (select max(a.occurrence_date)
              from live_showdown_answers a
             where a.schedule_id = w.schedule_id
               and a.occurrence_date < w.occurrence_date),
           w.step + 1
      from walk w
     where w.occurrence_date is not null
       and w.step < (select n from page_size)
  ),
  games as (
    select w.schedule_id, w.occurrence_date
      from walk w
     where w.occurrence_date is not null
  ),
  cutoff as (
    select g.occurrence_date
      from games g
     order by g.occurrence_date desc
    offset (select n from page_size) - 1
     limit 1
  ),
  picked as (
    select g.schedule_id, g.occurrence_date
      from games g
     where g.occurrence_date >= coalesce((select c.occurrence_date from cutoff c), '-infinity'::date)
  ),
  totals as (
    select a.schedule_id, a.occurrence_date, a.user_id, sum(a.points_awarded)::bigint as total
      from picked p
      join live_showdown_answers a
        on a.schedule_id = p.schedule_id
       and a.occurrence_date = p.occurrence_date
     group by a.schedule_id, a.occurrence_date, a.user_id
  ),
  scored as (
    select t.schedule_id, t.occurrence_date, t.user_id, t.total,
           max(t.total) over (partition by t.schedule_id, t.occurrence_date) as best
      from totals t
  )
  select s.schedule_id,
         s.occurrence_date,
         count(*)::integer as player_count,
         max(s.best) as top_points,
         coalesce(
           array_agg(s.user_id order by s.user_id) filter (where s.total = s.best and s.best > 0),
           '{}'::uuid[]
         ) as top_user_ids
    from scored s
   group by s.schedule_id, s.occurrence_date
   order by s.occurrence_date desc, s.schedule_id desc;
$$;

revoke all on function public.live_trivia_occurrence_summaries(uuid[], date, integer) from public, anon, authenticated;
grant execute on function public.live_trivia_occurrence_summaries(uuid[], date, integer) to service_role;

-- ── 2. challenge_reward_history_summaries ───────────────────────────────────────────────
create index if not exists idx_challenge_cycle_winners_venue
  on public.challenge_cycle_winners (venue_id, challenge_id, cycle_start desc);

create or replace function public.challenge_reward_history_summaries(
  p_venue_id text,
  p_before_at timestamptz,
  p_before_id uuid,
  p_limit integer
)
returns table (
  challenge_id uuid,
  last_cycle_start timestamptz,
  last_activity_at timestamptz,
  cycle_count integer,
  last_winners jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with
  page_size as (
    select greatest(1, least(coalesce(p_limit, 20), 100)) as n
  ),
  cycles as (
    select w.challenge_id, w.cycle_start, coalesce(max(w.finalized_at), w.cycle_start) as happened_at
      from challenge_cycle_winners w
     where w.venue_id = p_venue_id
     group by w.challenge_id, w.cycle_start
    union all
    select s.challenge_id, s.cycle_start, s.settled_at
      from challenge_cycle_settlements s
     where s.venue_id = p_venue_id
  ),
  per_cycle as (
    select c.challenge_id, c.cycle_start, max(c.happened_at) as happened_at
      from cycles c
     group by c.challenge_id, c.cycle_start
  ),
  counts as (
    select p.challenge_id,
           max(p.cycle_start) as last_cycle_start,
           max(p.happened_at) as last_activity_at,
           count(*)::integer as cycle_count
      from per_cycle p
     group by p.challenge_id
  ),
  page as (
    select c.*
      from counts c
     where p_before_at is null
        or (c.last_activity_at, c.challenge_id) < (p_before_at, p_before_id)
     order by c.last_activity_at desc, c.challenge_id desc
     limit (select n from page_size) + 1
  )
  select pg.challenge_id,
         pg.last_cycle_start,
         pg.last_activity_at,
         pg.cycle_count,
         coalesce(
           (select jsonb_agg(
                     jsonb_build_object('user_id', w.winner_user_id, 'place', w.place, 'points', w.points_earned)
                     order by w.place nulls last, w.points_earned desc, w.finalized_at, w.winner_user_id nulls last, w.id)
              from challenge_cycle_winners w
             where w.challenge_id = pg.challenge_id
               and w.cycle_start = pg.last_cycle_start
               and w.venue_id = p_venue_id),
           '[]'::jsonb
         ) as last_winners
    from page pg
   order by pg.last_activity_at desc, pg.challenge_id desc;
$$;

revoke all on function public.challenge_reward_history_summaries(text, timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.challenge_reward_history_summaries(text, timestamptz, uuid, integer) to service_role;
