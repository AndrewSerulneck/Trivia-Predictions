create table if not exists live_player_stats (
  id uuid primary key default gen_random_uuid(),
  game_id text not null,
  player_id bigint not null,
  player_name text not null default '',
  team_id bigint,
  team_name text not null default '',
  league_id bigint,
  league_name text not null default '',
  game_status text not null default '',
  pts numeric(10,2) not null default 0,
  ast numeric(10,2) not null default 0,
  reb numeric(10,2) not null default 0,
  stl numeric(10,2) not null default 0,
  blk numeric(10,2) not null default 0,
  turnovers numeric(10,2) not null default 0,
  total_fantasy_points numeric(10,2) not null default 0,
  source_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_live_player_stats_game_player_unique
  on live_player_stats(game_id, player_id);

create index if not exists idx_live_player_stats_game_id
  on live_player_stats(game_id);

create index if not exists idx_live_player_stats_player_id
  on live_player_stats(player_id);

drop trigger if exists live_player_stats_set_updated_at on live_player_stats;
create trigger live_player_stats_set_updated_at
before update on live_player_stats
for each row execute function set_updated_at();

alter table live_player_stats enable row level security;

drop policy if exists "Public can read live player stats" on live_player_stats;
create policy "Public can read live player stats"
  on live_player_stats for select
  using (true);

do $$
begin
  begin
    alter publication supabase_realtime add table live_player_stats;
  exception
    when duplicate_object then null;
  end;
end
$$;

