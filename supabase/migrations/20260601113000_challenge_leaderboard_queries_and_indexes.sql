-- Leaderboard query helper + indexes for challenge leaderboard reads.

create or replace function public.get_challenge_leaderboard_snapshot(
  p_challenge_id uuid,
  p_venue_id text,
  p_viewer_user_id uuid default null,
  p_limit integer default 10,
  p_tiebreaker text default 'first_to_score'
)
returns table (
  rank_position integer,
  user_id uuid,
  username text,
  points_earned integer,
  updated_at timestamptz,
  is_viewer boolean,
  in_top boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with normalized as (
    select
      greatest(1, least(coalesce(p_limit, 10), 50))::integer as display_limit,
      case
        when lower(coalesce(p_tiebreaker, '')) = 'latest_activity' then 'latest_activity'
        else 'first_to_score'
      end as tiebreaker
  ),
  ranked as (
    select
      p.user_id,
      u.username,
      p.points_earned,
      p.updated_at,
      row_number() over (
        order by
          p.points_earned desc,
          case
            when (select tiebreaker from normalized) = 'latest_activity'
              then extract(epoch from p.updated_at)
          end desc nulls last,
          case
            when (select tiebreaker from normalized) = 'first_to_score'
              then extract(epoch from p.updated_at)
          end asc nulls last,
          p.user_id asc
      )::integer as rank_position
    from challenge_campaign_progress p
    join users u on u.id = p.user_id
    where p.challenge_id = p_challenge_id
      and (p_venue_id is null or p.venue_id = p_venue_id)
      and p.points_earned > 0
  )
  select
    r.rank_position,
    r.user_id,
    r.username,
    r.points_earned,
    r.updated_at,
    (p_viewer_user_id is not null and r.user_id = p_viewer_user_id) as is_viewer,
    (r.rank_position <= (select display_limit from normalized)) as in_top
  from ranked r
  where r.rank_position <= (select display_limit from normalized)
     or (p_viewer_user_id is not null and r.user_id = p_viewer_user_id)
  order by r.rank_position asc;
$$;

create index if not exists idx_challenge_campaign_progress_venue_rank_first_to_score
  on challenge_campaign_progress(challenge_id, venue_id, points_earned desc, updated_at asc, user_id asc);

create index if not exists idx_challenge_campaign_progress_venue_rank_latest_activity
  on challenge_campaign_progress(challenge_id, venue_id, points_earned desc, updated_at desc, user_id asc);

create index if not exists idx_challenge_campaign_progress_rank_first_to_score
  on challenge_campaign_progress(challenge_id, points_earned desc, updated_at asc, user_id asc);

create index if not exists idx_challenge_campaign_progress_rank_latest_activity
  on challenge_campaign_progress(challenge_id, points_earned desc, updated_at desc, user_id asc);
