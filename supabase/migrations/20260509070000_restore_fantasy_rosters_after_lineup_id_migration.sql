-- Recovery migration for fantasy roster lineups that may have been emptied during lineup JSON reshaping.
-- Strategy:
-- 1) Rebuild empty lineups from score_breakdown keys (preserves visible roster names).
-- 2) Attach player_id when a recent live_player_stats name match exists.

with latest_player_ids as (
  select distinct on (public.fantasy_normalize_player_name(player_name))
    public.fantasy_normalize_player_name(player_name) as player_name_key,
    player_id
  from live_player_stats
  where coalesce(league_name, '') = 'NBA'
    and player_id is not null
  order by public.fantasy_normalize_player_name(player_name), source_updated_at desc
),
rebuildable as (
  select
    fe.id,
    jsonb_agg(
      jsonb_build_object(
        'player_id', lpi.player_id,
        'player_name', keys.player_name
      )
      order by keys.player_name
    ) as rebuilt_lineup
  from fantasy_entries fe
  cross join lateral (
    select jsonb_object_keys(fe.score_breakdown) as player_name
  ) keys
  left join latest_player_ids lpi
    on lpi.player_name_key = public.fantasy_normalize_player_name(keys.player_name)
  where jsonb_typeof(fe.score_breakdown) = 'object'
    and (
      select count(*)
      from jsonb_object_keys(fe.score_breakdown)
    ) > 0
    and (
      fe.lineup is null
      or jsonb_typeof(fe.lineup) <> 'array'
      or jsonb_array_length(fe.lineup) = 0
    )
  group by fe.id
),
fixed as (
  update fantasy_entries fe
  set lineup = rebuildable.rebuilt_lineup
  from rebuildable
  where fe.id = rebuildable.id
  returning fe.id
)
select count(*) as restored_roster_count from fixed;
