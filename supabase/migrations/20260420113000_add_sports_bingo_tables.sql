create table if not exists sports_bingo_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  venue_id text not null references venues(id) on delete restrict,
  sport_key text not null default 'basketball_nba',
  game_id text not null,
  game_label text not null,
  home_team text not null,
  away_team text not null,
  starts_at timestamptz not null,
  status text not null default 'active',
  board_probability numeric(5,4) not null default 0,
  reward_points integer not null default 40,
  near_win_notified_at timestamptz,
  won_notified_at timestamptz,
  won_line jsonb,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_bingo_cards_status_valid check (status in ('active', 'won', 'lost', 'canceled')),
  constraint sports_bingo_cards_reward_non_negative check (reward_points >= 0)
);

create table if not exists sports_bingo_squares (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references sports_bingo_cards(id) on delete cascade,
  square_index integer not null,
  label text not null,
  resolver jsonb not null default '{}'::jsonb,
  probability numeric(5,4) not null default 0,
  is_free boolean not null default false,
  status text not null default 'pending',
  replaced_by_square_id uuid references sports_bingo_squares(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint sports_bingo_squares_index_range check (square_index between 0 and 24),
  constraint sports_bingo_squares_status_valid check (status in ('pending', 'hit', 'miss', 'void', 'replaced')),
  constraint sports_bingo_squares_card_square_unique unique (card_id, square_index)
);

create index if not exists idx_sports_bingo_cards_user on sports_bingo_cards(user_id);
create index if not exists idx_sports_bingo_cards_status on sports_bingo_cards(status);
create index if not exists idx_sports_bingo_cards_game on sports_bingo_cards(game_id);
create index if not exists idx_sports_bingo_cards_starts_at on sports_bingo_cards(starts_at);
create index if not exists idx_sports_bingo_squares_card on sports_bingo_squares(card_id);
create index if not exists idx_sports_bingo_squares_status on sports_bingo_squares(status);

create unique index if not exists idx_sports_bingo_active_user_game
  on sports_bingo_cards(user_id, game_id)
  where status = 'active';

drop trigger if exists sports_bingo_cards_set_updated_at on sports_bingo_cards;
create trigger sports_bingo_cards_set_updated_at
before update on sports_bingo_cards
for each row execute function set_updated_at();

alter table sports_bingo_cards enable row level security;
alter table sports_bingo_squares enable row level security;

drop policy if exists "Users can read own sports bingo cards" on sports_bingo_cards;
create policy "Users can read own sports bingo cards"
  on sports_bingo_cards for select
  using (user_id in (select id from users where auth_id = auth.uid()));

drop policy if exists "Users can insert own sports bingo cards" on sports_bingo_cards;
create policy "Users can insert own sports bingo cards"
  on sports_bingo_cards for insert
  with check (user_id in (select id from users where auth_id = auth.uid()));

drop policy if exists "Users can update own sports bingo cards" on sports_bingo_cards;
create policy "Users can update own sports bingo cards"
  on sports_bingo_cards for update
  using (user_id in (select id from users where auth_id = auth.uid()))
  with check (user_id in (select id from users where auth_id = auth.uid()));

drop policy if exists "Users can read own sports bingo squares" on sports_bingo_squares;
create policy "Users can read own sports bingo squares"
  on sports_bingo_squares for select
  using (
    card_id in (
      select id from sports_bingo_cards
      where user_id in (select id from users where auth_id = auth.uid())
    )
  );

drop policy if exists "Users can insert own sports bingo squares" on sports_bingo_squares;
create policy "Users can insert own sports bingo squares"
  on sports_bingo_squares for insert
  with check (
    card_id in (
      select id from sports_bingo_cards
      where user_id in (select id from users where auth_id = auth.uid())
    )
  );

drop policy if exists "Users can update own sports bingo squares" on sports_bingo_squares;
create policy "Users can update own sports bingo squares"
  on sports_bingo_squares for update
  using (
    card_id in (
      select id from sports_bingo_cards
      where user_id in (select id from users where auth_id = auth.uid())
    )
  )
  with check (
    card_id in (
      select id from sports_bingo_cards
      where user_id in (select id from users where auth_id = auth.uid())
    )
  );
