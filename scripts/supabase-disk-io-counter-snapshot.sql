-- Low-impact counter snapshot for before/after intervals; no history scans.
begin read only;
set local statement_timeout = '10s';
-- The stats SRF can materialize thousands of rows even with showtext=false.
-- Bound this one diagnostic's memory; do not change the global setting.
set local work_mem = '16MB';
select jsonb_build_object(
  'captured_at', now(),
  'database', (select to_jsonb(d) from (
    select stats_reset, blks_read, blks_hit, temp_bytes, temp_files,
      tup_inserted, tup_updated, tup_deleted, xact_commit
    from pg_stat_database where datname=current_database()
  ) d),
  'latest_round_query', (select to_jsonb(q) from (
    select queryid::text, calls, total_exec_time, shared_blks_hit, shared_blks_read,
      temp_blks_read, temp_blks_written, wal_bytes
    from extensions.pg_stat_statements(false)
    where queryid=-6483483423078652727
      and userid=(select oid from pg_roles where rolname='service_role')
  ) q),
  'tables', (select jsonb_agg(to_jsonb(t)) from (
    select relname, n_tup_ins, n_tup_upd, n_tup_del
    from pg_stat_user_tables where schemaname='public'
      and relname in ('category_blitz_rounds','sports_bingo_cards','live_player_stats','fantasy_entries')
  ) t),
  'spill_by_role', (select jsonb_agg(to_jsonb(s)) from (
    select r.rolname, sum(temp_blks_read) as temp_blks_read,
      sum(temp_blks_written) as temp_blks_written
    from extensions.pg_stat_statements(false) s join pg_roles r on r.oid=s.userid
    group by r.rolname
  ) s)
) as snapshot;
commit;
