create table if not exists pickem_picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  venue_id text not null references venues(id) on delete restrict,
  sport_slug text not null,
  sport_key text not null,
  league text not null,
  game_id text not null,
  game_label text not null,
  home_team text not null,
  away_team text not null,
  starts_at timestamptz not null,
  selected_team text not null,
  selected_side text not null,
  status text not null default 'pending',
  home_score integer,
  away_score integer,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pickem_picks_sport_slug_valid check (sport_slug in ('nba', 'mlb', 'nhl', 'soccer', 'nfl')),
  constraint pickem_picks_selected_side_valid check (selected_side in ('home', 'away')),
  constraint pickem_picks_status_valid check (status in ('pending', 'won', 'lost', 'push', 'canceled'))
);

create unique index if not exists idx_pickem_picks_user_game_unique
  on pickem_picks(user_id, game_id);

create index if not exists idx_pickem_picks_status_starts_at
  on pickem_picks(status, starts_at);

create index if not exists idx_pickem_picks_user_status
  on pickem_picks(user_id, status);

create index if not exists idx_pickem_picks_sport_key_game_id
  on pickem_picks(sport_key, game_id);

create index if not exists idx_pickem_picks_venue_created
  on pickem_picks(venue_id, created_at desc);

drop trigger if exists pickem_picks_set_updated_at on pickem_picks;
create trigger pickem_picks_set_updated_at
before update on pickem_picks
for each row execute function set_updated_at();

alter table pickem_picks enable row level security;

drop policy if exists "Users can read own pickem picks" on pickem_picks;
create policy "Users can read own pickem picks"
  on pickem_picks for select
  using (user_id in (select id from users where auth_id = auth.uid()));

drop policy if exists "Users can insert own pickem picks" on pickem_picks;
create policy "Users can insert own pickem picks"
  on pickem_picks for insert
  with check (user_id in (select id from users where auth_id = auth.uid()));

drop policy if exists "Users can update own pickem picks" on pickem_picks;
create policy "Users can update own pickem picks"
  on pickem_picks for update
  using (user_id in (select id from users where auth_id = auth.uid()))
  with check (user_id in (select id from users where auth_id = auth.uid()));
