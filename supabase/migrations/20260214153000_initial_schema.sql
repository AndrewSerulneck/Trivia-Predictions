-- Initial schema for Hightop Challenge
-- Phase 2 baseline: venue-locked users + trivia/prediction tables + ads

create extension if not exists pgcrypto;

create table if not exists venues (
  id text primary key,
  name text not null,
  latitude decimal(10, 8) not null,
  longitude decimal(11, 8) not null,
  radius integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid references auth.users(id) on delete set null,
  username text not null,
  venue_id text not null references venues(id) on delete restrict,
  points integer not null default 0,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_username_format check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  constraint users_points_non_negative check (points >= 0),
  constraint users_unique_username_per_venue unique (username, venue_id),
  constraint users_unique_auth_profile_per_venue unique (auth_id, venue_id)
);

create table if not exists trivia_questions (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  options jsonb not null,
  correct_answer integer not null,
  category text,
  difficulty text,
  created_at timestamptz not null default now()
);

create table if not exists trivia_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  question_id uuid not null references trivia_questions(id) on delete cascade,
  answer integer not null,
  is_correct boolean not null,
  time_elapsed integer not null,
  answered_at timestamptz not null default now()
);

create table if not exists user_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  prediction_id text not null,
  outcome_id text not null,
  outcome_title text not null,
  points integer not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint user_predictions_status_valid check (status in ('pending', 'won', 'lost', 'push', 'canceled'))
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  message text not null,
  type text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists advertisements (
  id uuid primary key default gen_random_uuid(),
  slot text not null,
  venue_id text references venues(id) on delete set null,
  advertiser_name text not null,
  image_url text not null,
  click_url text not null,
  alt_text text not null,
  width integer not null,
  height integer not null,
  active boolean not null default true,
  start_date timestamptz not null,
  end_date timestamptz,
  impressions integer not null default 0,
  clicks integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ads_slot_valid check (slot in ('header', 'inline-content', 'sidebar', 'mid-content', 'leaderboard-sidebar', 'footer'))
);

create index if not exists idx_users_auth_venue on users(auth_id, venue_id);
create index if not exists idx_users_venue on users(venue_id);
create index if not exists idx_trivia_answers_user on trivia_answers(user_id);
create index if not exists idx_predictions_user on user_predictions(user_id);
create index if not exists idx_notifications_user on notifications(user_id);
create index if not exists idx_ads_slot on advertisements(slot);
create index if not exists idx_ads_venue on advertisements(venue_id);
create index if not exists idx_ads_active_window on advertisements(active, start_date, end_date);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on users;
create trigger users_set_updated_at
before update on users
for each row execute function set_updated_at();

drop trigger if exists ads_set_updated_at on advertisements;
create trigger ads_set_updated_at
before update on advertisements
for each row execute function set_updated_at();

alter table venues enable row level security;
alter table users enable row level security;
alter table trivia_questions enable row level security;
alter table trivia_answers enable row level security;
alter table user_predictions enable row level security;
alter table notifications enable row level security;
alter table advertisements enable row level security;

-- Public read for venues and trivia questions.
drop policy if exists "Public can view venues" on venues;
create policy "Public can view venues"
  on venues for select
  using (true);

drop policy if exists "Public can view trivia questions" on trivia_questions;
create policy "Public can view trivia questions"
  on trivia_questions for select
  using (true);

-- Users table scoped to authenticated user's auth_id.
drop policy if exists "Users can read own profiles" on users;
create policy "Users can read own profiles"
  on users for select
  using (auth_id = auth.uid());

drop policy if exists "Users can create own profiles" on users;
create policy "Users can create own profiles"
  on users for insert
  with check (auth_id = auth.uid());

drop policy if exists "Users can update own profiles" on users;
create policy "Users can update own profiles"
  on users for update
  using (auth_id = auth.uid())
  with check (auth_id = auth.uid());

-- User-owned gameplay data.
drop policy if exists "Users can read own trivia answers" on trivia_answers;
create policy "Users can read own trivia answers"
  on trivia_answers for select
  using (user_id in (select id from users where auth_id = auth.uid()));

drop policy if exists "Users can insert own trivia answers" on trivia_answers;
create policy "Users can insert own trivia answers"
  on trivia_answers for insert
  with check (user_id in (select id from users where auth_id = auth.uid()));

drop policy if exists "Users can read own predictions" on user_predictions;
create policy "Users can read own predictions"
  on user_predictions for select
  using (user_id in (select id from users where auth_id = auth.uid()));

drop policy if exists "Users can insert own predictions" on user_predictions;
create policy "Users can insert own predictions"
  on user_predictions for insert
  with check (user_id in (select id from users where auth_id = auth.uid()));

drop policy if exists "Users can read own notifications" on notifications;
create policy "Users can read own notifications"
  on notifications for select
  using (user_id in (select id from users where auth_id = auth.uid()));

drop policy if exists "Users can update own notifications" on notifications;
create policy "Users can update own notifications"
  on notifications for update
  using (user_id in (select id from users where auth_id = auth.uid()))
  with check (user_id in (select id from users where auth_id = auth.uid()));

-- Advertising policies.
drop policy if exists "Public can view active advertisements" on advertisements;
create policy "Public can view active advertisements"
  on advertisements for select
  using (
    active = true
    and start_date <= now()
    and (end_date is null or end_date >= now())
  );

drop policy if exists "Admins can manage advertisements" on advertisements;
create policy "Admins can manage advertisements"
  on advertisements for all
  using (exists (select 1 from users where auth_id = auth.uid() and is_admin = true))
  with check (exists (select 1 from users where auth_id = auth.uid() and is_admin = true));
