begin;

alter table live_player_stats
  add column if not exists sport_key text not null default 'basketball_nba',
  add column if not exists stat_type text not null default 'fantasy_points_total',
  add column if not exists value numeric(10,2) not null default 0;

create index if not exists idx_live_player_stats_sport_key
  on live_player_stats(sport_key);

create index if not exists idx_live_player_stats_sport_status_updated
  on live_player_stats(sport_key, game_status, source_updated_at desc);

update live_player_stats
set
  sport_key = case
    when coalesce(sport_key, '') <> '' then sport_key
    when lower(coalesce(league_name, '')) like '%nfl%' then 'americanfootball_nfl'
    else 'basketball_nba'
  end,
  stat_type = coalesce(nullif(stat_type, ''), 'fantasy_points_total'),
  value = case
    when value is not null then value
    else coalesce(total_fantasy_points, 0)
  end;

create or replace function public.recalculate_active_fantasy_entries_for_player_id(p_player_id bigint)
returns void
language plpgsql
as $$
begin
  if p_player_id is null or p_player_id <= 0 then
    return;
  end if;

  with affected_entries as (
    select fe.id, fe.starts_at, fe.lineup, fe.sport_key
    from fantasy_entries fe
    where fe.status in ('pending', 'live')
      and fe.starts_at <= now() + interval '2 hours'
      and exists (
        select 1
        from jsonb_array_elements(fe.lineup) as lineup_player(value)
        where case
          when coalesce(lineup_player.value->>'player_id', '') ~ '^[0-9]+$' then (lineup_player.value->>'player_id')::bigint
          else 0
        end = p_player_id
      )
  ),
  lineup_players as (
    select
      ae.id as entry_id,
      ae.sport_key,
      case
        when coalesce(lp.value->>'player_id', '') ~ '^[0-9]+$' then (lp.value->>'player_id')::bigint
        else 0
      end as player_id,
      coalesce(lp.value->>'player_name', lp.value->>'playerName', '') as player_name
    from affected_entries ae
    cross join lateral jsonb_array_elements(ae.lineup) as lp(value)
    where case
      when coalesce(lp.value->>'player_id', '') ~ '^[0-9]+$' then (lp.value->>'player_id')::bigint
      else 0
    end > 0
  ),
  lineup_points as (
    select
      lp.entry_id,
      lp.player_id,
      lp.player_name,
      coalesce(sum(
        case
          when coalesce(lps.stat_type, '') = 'fantasy_points_total'
            then coalesce(lps.value, lps.total_fantasy_points, 0)
          else 0
        end
      ), 0)::numeric(10,2) as player_points,
      count(*) filter (
        where upper(trim(coalesce(lps.game_status, ''))) not in ('NS', 'POST', 'CANC', 'SUSP', 'AWD', 'ABD', 'NOT STARTED', 'SCHEDULED', 'PREGAME', 'PRE-GAME')
      ) as started_rows,
      count(*) filter (
        where upper(trim(coalesce(lps.game_status, ''))) in ('FT', 'AOT', 'FINAL', 'COMPLETED')
      ) as final_rows,
      max(lps.source_updated_at) as latest_source_updated_at
    from lineup_players lp
    join affected_entries ae on ae.id = lp.entry_id
    left join live_player_stats lps
      on lps.player_id = lp.player_id
      and coalesce(lps.sport_key, 'basketball_nba') = coalesce(ae.sport_key, 'basketball_nba')
      and coalesce(lps.stat_type, 'fantasy_points_total') = 'fantasy_points_total'
      and lps.source_updated_at >= ae.starts_at
      and lps.source_updated_at <= now() + interval '2 hours'
    group by lp.entry_id, lp.player_id, lp.player_name
  ),
  rollup as (
    select
      entry_id,
      coalesce(jsonb_object_agg(player_name, round(player_points::numeric, 2)), '{}'::jsonb) as score_breakdown,
      round(coalesce(sum(player_points), 0)::numeric, 2) as total_points,
      max(latest_source_updated_at) as latest_source_updated_at,
      count(*) as lineup_count,
      count(*) filter (where started_rows > 0) as started_player_count,
      count(*) filter (where started_rows > 0 and started_rows = final_rows) as final_player_count
    from lineup_points
    group by entry_id
  ),
  updates as (
    select
      ae.id as entry_id,
      case
        when now() < ae.starts_at then 'pending'
        when coalesce(r.started_player_count, 0) = 0 then 'live'
        when coalesce(r.lineup_count, 0) > 0 and coalesce(r.final_player_count, 0) = coalesce(r.lineup_count, 0) then 'final'
        else 'live'
      end as next_status,
      case
        when now() < ae.starts_at then 0::numeric(10,2)
        else coalesce(r.total_points, 0)::numeric(10,2)
      end as next_points,
      case
        when now() < ae.starts_at then '{}'::jsonb
        else coalesce(r.score_breakdown, '{}'::jsonb)
      end as next_breakdown,
      case
        when now() < ae.starts_at then null::timestamptz
        else r.latest_source_updated_at
      end as next_source_updated_at,
      case
        when now() < ae.starts_at then null::timestamptz
        when coalesce(r.lineup_count, 0) > 0 and coalesce(r.final_player_count, 0) = coalesce(r.lineup_count, 0) then now()
        else null::timestamptz
      end as next_settled_at
    from affected_entries ae
    left join rollup r on r.entry_id = ae.id
  )
  update fantasy_entries fe
  set
    status = updates.next_status,
    points = updates.next_points,
    score_breakdown = updates.next_breakdown,
    stats_last_source_updated_at = updates.next_source_updated_at,
    reward_points = case
      when updates.next_status = 'final'
        then greatest(fe.reward_points, round(updates.next_points * public.fantasy_points_multiplier()))
      else 0
    end,
    settled_at = updates.next_settled_at
  from updates
  where fe.id = updates.entry_id
    and (
      fe.status is distinct from updates.next_status
      or fe.points is distinct from updates.next_points
      or fe.score_breakdown is distinct from updates.next_breakdown
      or fe.stats_last_source_updated_at is distinct from updates.next_source_updated_at
      or fe.reward_points is distinct from case
        when updates.next_status = 'final'
          then greatest(fe.reward_points, round(updates.next_points * public.fantasy_points_multiplier()))
        else 0
      end
      or fe.settled_at is distinct from updates.next_settled_at
    );
end;
$$;

create or replace function public.handle_live_player_stats_fantasy_recalc()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if old.total_fantasy_points is not distinct from new.total_fantasy_points
      and old.game_status is not distinct from new.game_status
      and old.source_updated_at is not distinct from new.source_updated_at
      and old.player_id is not distinct from new.player_id
      and old.sport_key is not distinct from new.sport_key
      and old.stat_type is not distinct from new.stat_type
      and old.value is not distinct from new.value then
      return new;
    end if;
  end if;

  perform public.recalculate_active_fantasy_entries_for_player_id(new.player_id);
  return new;
end;
$$;

drop trigger if exists live_player_stats_recalculate_fantasy_entries on live_player_stats;
create trigger live_player_stats_recalculate_fantasy_entries
after insert or update of total_fantasy_points, game_status, source_updated_at, player_id, sport_key, stat_type, value
on live_player_stats
for each row
execute function public.handle_live_player_stats_fantasy_recalc();

do $$
begin
  begin
    alter publication supabase_realtime add table sports_bingo_cards;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table sports_bingo_squares;
  exception
    when duplicate_object then null;
  end;
end
$$;

commit;
