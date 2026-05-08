create table if not exists challenge_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  image_url text,
  rules text not null default '',
  venue_ids text[] not null default '{}',
  active_days text[] not null default '{}',
  start_time time,
  end_time time,
  end_date date,
  game_types text[] not null default '{pickem,fantasy,trivia,bingo}',
  point_multiplier numeric(8,3) not null default 1.0,
  points_required_to_win integer not null default 100,
  recurring_type text not null default 'none',
  winner_user_id uuid references users(id) on delete set null,
  is_active boolean not null default true,
  constraint challenge_campaigns_game_types_valid check (
    array_length(game_types, 1) is null
    or game_types <@ array['pickem','fantasy','trivia','bingo']::text[]
  ),
  constraint challenge_campaigns_active_days_valid check (
    array_length(active_days, 1) is null
    or active_days <@ array['sun','mon','tue','wed','thu','fri','sat']::text[]
  ),
  constraint challenge_campaigns_recurring_valid check (recurring_type in ('none', 'daily', 'weekly', 'monthly', 'yearly')),
  constraint challenge_campaigns_point_multiplier_positive check (point_multiplier > 0),
  constraint challenge_campaigns_points_required_positive check (points_required_to_win > 0)
);

create index if not exists idx_challenge_campaigns_active on challenge_campaigns(is_active, created_at desc);
create index if not exists idx_challenge_campaigns_winner on challenge_campaigns(winner_user_id);

create table if not exists challenge_campaign_progress (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  challenge_id uuid not null references challenge_campaigns(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  venue_id text not null references venues(id) on delete cascade,
  points_earned integer not null default 0,
  constraint challenge_campaign_progress_points_non_negative check (points_earned >= 0),
  constraint challenge_campaign_progress_unique unique (challenge_id, user_id, venue_id)
);

create index if not exists idx_challenge_campaign_progress_challenge on challenge_campaign_progress(challenge_id, points_earned desc);
create index if not exists idx_challenge_campaign_progress_user on challenge_campaign_progress(user_id, updated_at desc);

drop trigger if exists challenge_campaign_progress_set_updated_at on challenge_campaign_progress;
create trigger challenge_campaign_progress_set_updated_at
before update on challenge_campaign_progress
for each row execute function set_updated_at();
