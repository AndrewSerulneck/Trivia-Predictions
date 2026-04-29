create table if not exists fantasy_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  venue_id text not null references venues(id) on delete restrict,
  sport_key text not null default 'basketball_nba',
  game_id text not null,
  game_label text not null,
  home_team text not null,
  away_team text not null,
  starts_at timestamptz not null,
  lineup jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  points numeric(10,2) not null default 0,
  score_breakdown jsonb not null default '{}'::jsonb,
  reward_points integer not null default 0,
  reward_claimed_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fantasy_entries_status_valid check (status in ('pending', 'live', 'final', 'canceled')),
  constraint fantasy_entries_reward_non_negative check (reward_points >= 0),
  constraint fantasy_entries_points_non_negative check (points >= 0)
);

create unique index if not exists idx_fantasy_entries_user_game_unique
  on fantasy_entries(user_id, game_id);

create index if not exists idx_fantasy_entries_status_starts_at
  on fantasy_entries(status, starts_at);

create index if not exists idx_fantasy_entries_game_status
  on fantasy_entries(game_id, status);

create index if not exists idx_fantasy_entries_venue_game
  on fantasy_entries(venue_id, game_id, points desc);

drop trigger if exists fantasy_entries_set_updated_at on fantasy_entries;
create trigger fantasy_entries_set_updated_at
before update on fantasy_entries
for each row execute function set_updated_at();

alter table fantasy_entries enable row level security;

drop policy if exists "Users can read own fantasy entries" on fantasy_entries;
create policy "Users can read own fantasy entries"
  on fantasy_entries for select
  using (user_id in (select id from users where auth_id = auth.uid()));

drop policy if exists "Users can insert own fantasy entries" on fantasy_entries;
create policy "Users can insert own fantasy entries"
  on fantasy_entries for insert
  with check (user_id in (select id from users where auth_id = auth.uid()));

drop policy if exists "Users can update own fantasy entries" on fantasy_entries;
create policy "Users can update own fantasy entries"
  on fantasy_entries for update
  using (user_id in (select id from users where auth_id = auth.uid()))
  with check (user_id in (select id from users where auth_id = auth.uid()));
