create table if not exists players (
  id bigserial primary key,
  external_id text,
  player_name text not null,
  league text not null,
  headshot_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint players_external_id_league_unique unique (external_id, league)
);

create index if not exists idx_players_league_name on players(league, player_name);
create index if not exists idx_players_headshot_null on players(league) where headshot_url is null or btrim(headshot_url) = '';

alter table players
  add column if not exists headshot_url text;

-- Keep updated_at fresh for future sync jobs.
drop trigger if exists players_set_updated_at on players;
create trigger players_set_updated_at
before update on players
for each row execute function set_updated_at();
