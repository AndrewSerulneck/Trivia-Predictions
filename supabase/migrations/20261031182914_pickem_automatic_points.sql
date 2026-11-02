-- Pick 'Em Phase 1 (docs/pickem-college-football-and-prize-plan.md, decisions D2 + D10):
-- every correct pick pays a flat 10 venue points automatically, once, when it is graded.
-- No "Collect points" button, no 2x/3x bonus, NFL picks included.
--
-- pay_pickem_points pays every graded-correct pick that has not been paid yet
-- (status = 'won' and reward_claimed_at is null), stamps reward_claimed_at in the same
-- statement, and adds 10 per pick to users.points. The conditional stamp is the once-only
-- guarantee: a concurrent call either skips the row (skip locked) or re-checks
-- reward_claimed_at after the first commit and finds it set. Run by settlePendingPickEmPicks
-- (lib/pickemPoints.ts) after each grading pass.
--
-- Returns one row per pick it paid, so the caller can feed regular Pick 'Em picks to
-- points-target prizes. p_user_id null = every player (the cron); a value = one player
-- (the screen's own refresh).
create or replace function public.pay_pickem_points(
  p_user_id uuid default null,
  p_limit integer default 500
)
returns table (
  pick_id uuid,
  user_id uuid,
  venue_id text,
  sport_slug text,
  starts_at timestamptz,
  resolved_at timestamptz,
  points_awarded integer
)
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select p.id
    from pickem_picks p
    where p.status = 'won'
      and p.reward_claimed_at is null
      and (p_user_id is null or p.user_id = p_user_id)
    order by p.resolved_at nulls first, p.id
    limit least(greatest(coalesce(p_limit, 500), 1), 1000)
    for update skip locked
  ),
  paid as (
    update pickem_picks p
    set reward_claimed_at = now(),
        reward_points = 10
    from candidates c
    where p.id = c.id
      and p.status = 'won'
      and p.reward_claimed_at is null
    returning p.id, p.user_id, p.venue_id, p.sport_slug, p.starts_at, p.resolved_at
  ),
  credited as (
    update users u
    set points = coalesce(u.points, 0) + t.total
    from (
      select paid.user_id, (count(*) * 10)::integer as total
      from paid
      group by paid.user_id
    ) t
    where u.id = t.user_id
    returning u.id
  )
  select paid.id, paid.user_id, paid.venue_id, paid.sport_slug, paid.starts_at, paid.resolved_at, 10
  from paid;
$$;

-- The old backlog is cancelled, not paid (Andrew, 2026-10-31: "Just get rid of them. Most of them
-- are test points or test users."). Measured 2026-10-31: 48 graded-but-never-collected picks,
-- 480 points, 12 players, 5 venues, mostly 1-3 months old. Every won pick graded more than
-- 24 hours before this migration runs is marked handled with 0 points, so pay_pickem_points
-- never sees it and no player gets a burst of points for a game from months ago. reward_points = 0
-- keeps career stats honest (they sum reward_points of handled picks: these were never paid).
-- Picks graded in the last 24 hours (last night's games) are left for pay_pickem_points.
update public.pickem_picks
set reward_claimed_at = now(),
    reward_points = 0
where status = 'won'
  and reward_claimed_at is null
  and resolved_at is not null
  and resolved_at < now() - interval '24 hours';

revoke all on function public.pay_pickem_points(uuid, integer) from public, anon, authenticated;
grant execute on function public.pay_pickem_points(uuid, integer) to service_role;

-- The old Collect RPC stays installed (nothing calls it any more) but only the server may run it:
-- with anon/authenticated able to call it, anyone holding the public key could still apply the
-- retired 2x/3x bonus to a player's picks in the minute before automatic payment reaches them.
revoke execute on function public.claim_pickem_points(uuid, text, date, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_pickem_points(uuid, text, date, timestamptz, timestamptz)
  to service_role;
