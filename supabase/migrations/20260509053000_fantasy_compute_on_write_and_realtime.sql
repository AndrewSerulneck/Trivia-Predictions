create or replace function public.fantasy_points_multiplier()
returns integer
language plpgsql
stable
as $$
declare
  raw text;
  parsed integer;
begin
  raw := current_setting('app.settings.fantasy_points_multiplier', true);
  if raw is null or btrim(raw) = '' then
    return 1;
  end if;

  begin
    parsed := raw::integer;
  exception
    when others then
      return 1;
  end;

  return greatest(1, parsed);
end;
$$;

create or replace function public.fantasy_normalize_player_name(input text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(regexp_replace(lower(coalesce(input, '')), '[^a-z0-9\\s]+', ' ', 'g'), '\\s+', ' ', 'g'));
$$;

create or replace function public.recalculate_active_fantasy_entries_for_player(p_player_name text)
returns void
language plpgsql
as $$
declare
  normalized_player_name text;
begin
  normalized_player_name := public.fantasy_normalize_player_name(p_player_name);
  if normalized_player_name = '' then
    return;
  end if;

  with affected_entries as (
    select fe.id, fe.starts_at, fe.lineup
    from fantasy_entries fe
    where fe.status in ('pending', 'live')
      and fe.starts_at <= now() + interval '2 hours'
      and exists (
        select 1
        from jsonb_array_elements_text(fe.lineup) as lineup_player(player_name)
        where public.fantasy_normalize_player_name(lineup_player.player_name) = normalized_player_name
      )
  ),
  lineup_points as (
    select
      ae.id as entry_id,
      lp.player_name,
      coalesce(sum(lps.total_fantasy_points), 0)::numeric(10,2) as player_points,
      count(*) filter (
        where upper(trim(coalesce(lps.game_status, ''))) not in ('NS', 'POST', 'CANC', 'SUSP', 'AWD', 'ABD', 'NOT STARTED', 'SCHEDULED', 'PREGAME', 'PRE-GAME')
      ) as started_rows,
      count(*) filter (
        where upper(trim(coalesce(lps.game_status, ''))) in ('FT', 'AOT', 'FINAL', 'COMPLETED')
      ) as final_rows,
      max(lps.source_updated_at) as latest_source_updated_at
    from affected_entries ae
    cross join lateral (
      select value as player_name
      from jsonb_array_elements_text(ae.lineup)
    ) lp
    left join live_player_stats lps
      on lps.league_name = 'NBA'
      and public.fantasy_normalize_player_name(lps.player_name) = public.fantasy_normalize_player_name(lp.player_name)
      and lps.source_updated_at >= ae.starts_at
      and lps.source_updated_at <= now() + interval '2 hours'
    group by ae.id, lp.player_name
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
      and old.player_name is not distinct from new.player_name then
      return new;
    end if;
  end if;

  perform public.recalculate_active_fantasy_entries_for_player(new.player_name);
  return new;
end;
$$;

drop trigger if exists live_player_stats_recalculate_fantasy_entries on live_player_stats;
create trigger live_player_stats_recalculate_fantasy_entries
after insert or update of total_fantasy_points, game_status, source_updated_at, player_name
on live_player_stats
for each row
execute function public.handle_live_player_stats_fantasy_recalc();

do $$
begin
  begin
    alter publication supabase_realtime add table fantasy_entries;
  exception
    when duplicate_object then null;
  end;
end
$$;
