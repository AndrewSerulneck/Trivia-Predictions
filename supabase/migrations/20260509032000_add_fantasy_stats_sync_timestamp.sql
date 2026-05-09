alter table if exists fantasy_entries
  add column if not exists stats_last_source_updated_at timestamptz null;

create index if not exists idx_fantasy_entries_stats_sync
  on fantasy_entries(status, starts_at, stats_last_source_updated_at);
