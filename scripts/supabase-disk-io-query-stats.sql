-- Read-only aggregate statement counters, ranked by disk-spilling work.
-- Normalized query text intentionally omitted; inspect a chosen query separately.
begin read only;
set local statement_timeout = '10s';
-- Diagnostic-only memory allowance, released at transaction end.
set local work_mem = '16MB';
select now() as captured_at, r.rolname, s.queryid, s.calls,
  round(s.total_exec_time::numeric, 2) as total_exec_ms,
  s.shared_blks_read, s.shared_blks_hit, s.temp_blks_read, s.temp_blks_written,
  s.wal_bytes
-- showtext=false avoids materializing all normalized query text. The view
-- defaults to true and can itself spill temporary files on small work_mem.
from extensions.pg_stat_statements(false) s
join pg_roles r on r.oid = s.userid
order by s.temp_blks_written desc, s.total_exec_time desc
limit 20;
commit;
