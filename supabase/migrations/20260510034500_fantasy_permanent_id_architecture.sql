begin;

-- 1) Normalize lineup JSON into object rows with mandatory player fields where resolvable.
-- We avoid destructive updates by only replacing rows where every lineup slot can be represented.
with latest_player_ids as (
  select distinct on (public.fantasy_normalize_player_name(player_name))
    public.fantasy_normalize_player_name(player_name) as player_name_key,
    player_id
  from live_player_stats
  where coalesce(league_name, '') = 'NBA'
    and player_id is not null
  order by public.fantasy_normalize_player_name(player_name), source_updated_at desc
),
expanded as (
  select
    fe.id,
    elem.ordinality,
    case
      when jsonb_typeof(elem.value) = 'object' then
        jsonb_build_object(
          'player_id',
            coalesce(
              case when coalesce(elem.value->>'player_id', '') ~ '^[0-9]+$' then (elem.value->>'player_id')::bigint else null end,
              case when coalesce(elem.value->>'playerId', '') ~ '^[0-9]+$' then (elem.value->>'playerId')::bigint else null end,
              lpi.player_id
            ),
          'player_name',
            coalesce(nullif(elem.value->>'player_name', ''), nullif(elem.value->>'playerName', ''), 'Unknown Player')
        )
      when jsonb_typeof(elem.value) = 'string' then
        jsonb_build_object(
          'player_id', lpi.player_id,
          'player_name', trim(both '"' from elem.value::text)
        )
      else null
    end as mapped,
    case
      when jsonb_typeof(elem.value) = 'object' then
        coalesce(
          case when coalesce(elem.value->>'player_id', '') ~ '^[0-9]+$' then (elem.value->>'player_id')::bigint else null end,
          case when coalesce(elem.value->>'playerId', '') ~ '^[0-9]+$' then (elem.value->>'playerId')::bigint else null end,
          lpi.player_id
        )
      when jsonb_typeof(elem.value) = 'string' then lpi.player_id
      else null
    end as resolved_player_id
  from fantasy_entries fe
  cross join lateral jsonb_array_elements(fe.lineup) with ordinality as elem(value, ordinality)
  left join latest_player_ids lpi
    on lpi.player_name_key = public.fantasy_normalize_player_name(
      case
        when jsonb_typeof(elem.value) = 'object' then coalesce(elem.value->>'player_name', elem.value->>'playerName', '')
        when jsonb_typeof(elem.value) = 'string' then trim(both '"' from elem.value::text)
        else ''
      end
    )
),
rebuilt as (
  select
    id,
    coalesce(jsonb_agg(mapped order by ordinality) filter (where mapped is not null), '[]'::jsonb) as next_lineup,
    count(*) filter (where mapped is not null) as mapped_count,
    count(*) as original_count,
    count(*) filter (where resolved_player_id is null) as unresolved_count
  from expanded
  group by id
)
update fantasy_entries fe
set lineup = rebuilt.next_lineup
from rebuilt
where fe.id = rebuilt.id
  and rebuilt.original_count > 0
  and rebuilt.mapped_count = rebuilt.original_count
  and rebuilt.unresolved_count = 0;

-- Optional guardrail: enforce object lineup shape for future writes.
alter table fantasy_entries
  drop constraint if exists fantasy_entries_lineup_player_id_required;

create or replace function public.fantasy_lineup_has_required_player_ids(p_lineup jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  item jsonb;
  player_id_text text;
  player_name text;
begin
  if p_lineup is null or jsonb_typeof(p_lineup) <> 'array' then
    return false;
  end if;

  for item in
    select value
    from jsonb_array_elements(p_lineup) as e(value)
  loop
    if jsonb_typeof(item) <> 'object' then
      return false;
    end if;

    player_name := coalesce(item->>'player_name', '');
    player_id_text := coalesce(item->>'player_id', '');

    if player_name = '' then
      return false;
    end if;

    if player_id_text !~ '^[0-9]+$' then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

alter table fantasy_entries
  add constraint fantasy_entries_lineup_player_id_required
  check (public.fantasy_lineup_has_required_player_ids(lineup)) not valid;

-- Validate now; if bad legacy rows remain, this will fail and rollback transaction (safe).
alter table fantasy_entries validate constraint fantasy_entries_lineup_player_id_required;

-- 2) Strict ID-only recalc path (remove fuzzy name fallback).
create or replace function public.recalculate_active_fantasy_entries_for_player_id(p_player_id bigint)
returns void
language plpgsql
as $$
begin
  if p_player_id is null or p_player_id <= 0 then
    return;
  end if;

  with affected_entries as (
    select fe.id, fe.starts_at, fe.lineup
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
      coalesce(sum(lps.total_fantasy_points), 0)::numeric(10,2) as player_points,
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
      on lps.league_name = 'NBA'
      and lps.player_id = lp.player_id
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
      and old.player_id is not distinct from new.player_id then
      return new;
    end if;
  end if;

  perform public.recalculate_active_fantasy_entries_for_player_id(new.player_id);
  return new;
end;
$$;

drop trigger if exists live_player_stats_recalculate_fantasy_entries on live_player_stats;
create trigger live_player_stats_recalculate_fantasy_entries
after insert or update of total_fantasy_points, game_status, source_updated_at, player_id
on live_player_stats
for each row
execute function public.handle_live_player_stats_fantasy_recalc();

-- Remove temporary bridge function.
drop function if exists public.recalculate_active_fantasy_entries_for_player_bridge(bigint, text);

commit;
