-- One-time validation for NBA provider cutover
-- Run in Supabase SQL editor or psql against remote DB.

-- 1) Recent live stat rows should now use canonical nba key
select
  sport_key,
  count(*) as rows,
  min(source_updated_at) as oldest,
  max(source_updated_at) as newest
from live_player_stats
where source_updated_at >= now() - interval '30 minutes'
group by sport_key
order by rows desc;

-- 2) Ensure normalized name bridge is populated
select
  count(*) filter (where coalesce(normalized_player_name, '') = '') as missing_normalized_name,
  count(*) as total_rows
from live_player_stats
where source_updated_at >= now() - interval '30 minutes';

-- 3) Verify fantasy entries are receiving fresh source sync timestamps
select
  status,
  count(*) as entries,
  max(stats_last_source_updated_at) as latest_stats_sync
from fantasy_entries
where starts_at >= now() - interval '24 hours'
group by status
order by status;

-- 4) Publication membership for realtime broadcast tables
select pubname, schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('fantasy_entries', 'sports_bingo_cards', 'sports_bingo_squares', 'live_player_stats')
order by tablename;

-- 5) Fast recency check of latest NBA rows
select
  game_id,
  player_id,
  player_name,
  sport_key,
  game_status,
  total_fantasy_points,
  source_updated_at
from live_player_stats
where public.canonical_sport_key(sport_key) = 'nba'
order by source_updated_at desc
limit 25;
