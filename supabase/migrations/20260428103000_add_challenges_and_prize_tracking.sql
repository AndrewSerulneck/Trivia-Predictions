create table if not exists challenge_invites (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null references venues(id) on delete restrict,
  game_type text not null,
  sender_user_id uuid not null references users(id) on delete cascade,
  receiver_user_id uuid not null references users(id) on delete cascade,
  challenge_title text not null default 'Head-to-Head Challenge',
  challenge_details text,
  status text not null default 'pending',
  week_start date not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint challenge_invites_game_type_valid check (game_type in ('pickem', 'fantasy', 'trivia', 'bingo')),
  constraint challenge_invites_status_valid check (status in ('pending', 'accepted', 'declined', 'canceled', 'expired', 'completed')),
  constraint challenge_invites_sender_receiver_distinct check (sender_user_id <> receiver_user_id)
);

create index if not exists idx_challenge_invites_receiver_status_created
  on challenge_invites(receiver_user_id, status, created_at desc);

create index if not exists idx_challenge_invites_sender_status_created
  on challenge_invites(sender_user_id, status, created_at desc);

create index if not exists idx_challenge_invites_venue_week
  on challenge_invites(venue_id, week_start, created_at desc);

create unique index if not exists idx_challenge_invites_unique_pending_pair
  on challenge_invites(sender_user_id, receiver_user_id, game_type)
  where status = 'pending';

alter table challenge_invites enable row level security;

drop policy if exists "Users can read own challenges" on challenge_invites;
create policy "Users can read own challenges"
  on challenge_invites for select
  using (
    sender_user_id in (select id from users where auth_id = auth.uid())
    or receiver_user_id in (select id from users where auth_id = auth.uid())
  );

drop policy if exists "Users can create own challenges" on challenge_invites;
create policy "Users can create own challenges"
  on challenge_invites for insert
  with check (sender_user_id in (select id from users where auth_id = auth.uid()));

drop policy if exists "Users can update own challenges" on challenge_invites;
create policy "Users can update own challenges"
  on challenge_invites for update
  using (
    sender_user_id in (select id from users where auth_id = auth.uid())
    or receiver_user_id in (select id from users where auth_id = auth.uid())
  )
  with check (
    sender_user_id in (select id from users where auth_id = auth.uid())
    or receiver_user_id in (select id from users where auth_id = auth.uid())
  );

create table if not exists weekly_prizes (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null references venues(id) on delete cascade,
  week_start date not null,
  prize_title text not null,
  prize_description text,
  reward_points integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_prizes_reward_points_non_negative check (reward_points >= 0),
  constraint weekly_prizes_unique_venue_week unique (venue_id, week_start)
);

drop trigger if exists weekly_prizes_set_updated_at on weekly_prizes;
create trigger weekly_prizes_set_updated_at
before update on weekly_prizes
for each row execute function set_updated_at();

create index if not exists idx_weekly_prizes_venue_week
  on weekly_prizes(venue_id, week_start desc);

alter table weekly_prizes enable row level security;

drop policy if exists "Public can read weekly prizes" on weekly_prizes;
create policy "Public can read weekly prizes"
  on weekly_prizes for select
  using (active = true);

drop policy if exists "Admins can manage weekly prizes" on weekly_prizes;
create policy "Admins can manage weekly prizes"
  on weekly_prizes for all
  using (exists (select 1 from users where auth_id = auth.uid() and is_admin = true))
  with check (exists (select 1 from users where auth_id = auth.uid() and is_admin = true));

create table if not exists prize_wins (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null references venues(id) on delete restrict,
  user_id uuid not null references users(id) on delete cascade,
  week_start date not null,
  prize_title text not null,
  prize_description text,
  reward_points integer not null default 0,
  status text not null default 'awarded',
  awarded_at timestamptz not null default now(),
  claimed_at timestamptz,
  constraint prize_wins_status_valid check (status in ('awarded', 'claimed')),
  constraint prize_wins_reward_points_non_negative check (reward_points >= 0)
);

create index if not exists idx_prize_wins_user_status_awarded
  on prize_wins(user_id, status, awarded_at desc);

create index if not exists idx_prize_wins_venue_week
  on prize_wins(venue_id, week_start, awarded_at desc);

alter table prize_wins enable row level security;

drop policy if exists "Users can read own prize wins" on prize_wins;
create policy "Users can read own prize wins"
  on prize_wins for select
  using (user_id in (select id from users where auth_id = auth.uid()));

drop policy if exists "Users can claim own prize wins" on prize_wins;
create policy "Users can claim own prize wins"
  on prize_wins for update
  using (user_id in (select id from users where auth_id = auth.uid()))
  with check (user_id in (select id from users where auth_id = auth.uid()));

drop policy if exists "Admins can manage prize wins" on prize_wins;
create policy "Admins can manage prize wins"
  on prize_wins for all
  using (exists (select 1 from users where auth_id = auth.uid() and is_admin = true))
  with check (exists (select 1 from users where auth_id = auth.uid() and is_admin = true));
