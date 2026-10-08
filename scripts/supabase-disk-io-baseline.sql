-- Read-only aggregate diagnostics; no player records, secrets, or query text.
-- Run twice without resetting statistics and compare counters over the interval.
begin read only;
set local statement_timeout = '10s';
select jsonb_build_object(
  'captured_at', now(),
  'database', (select to_jsonb(d) from (
    select stats_reset, numbackends, xact_commit, xact_rollback,
      blks_read, blks_hit, tup_inserted, tup_updated, tup_deleted,
      temp_files, temp_bytes, deadlocks, pg_database_size(datname) as size_bytes
    from pg_stat_database where datname = current_database()
  ) d),
  'tables', (select jsonb_agg(to_jsonb(t) order by t.relname) from (
    select relname, n_live_tup, n_dead_tup, n_tup_ins, n_tup_upd, n_tup_del,
      n_tup_hot_upd, seq_scan, seq_tup_read, idx_scan, last_autovacuum,
      last_autoanalyze, pg_total_relation_size(relid) as total_bytes
    from pg_stat_user_tables where schemaname = 'public'
  ) t),
  'bingo_status', (select jsonb_agg(to_jsonb(s)) from (
    select status, count(*) as cards from public.sports_bingo_cards group by status
  ) s),
  'blitz_status', (select jsonb_agg(to_jsonb(s)) from (
    select session_type, status, count(*) as sessions
    from public.category_blitz_sessions group by session_type, status
  ) s),
  'blitz_round_status', (select jsonb_agg(to_jsonb(s)) from (
    select status, count(*) as rounds from public.category_blitz_rounds group by status
  ) s),
  'pending_predictions', (select count(*) from public.user_predictions where status = 'pending'),
  'fantasy_status', (select jsonb_agg(to_jsonb(s)) from (
    select sport_key, status, count(*) as entries
    from public.fantasy_entries group by sport_key, status
  ) s),
  'stats_last_observed_at', (select max(source_updated_at) from public.live_player_stats)
) as baseline;
commit;
