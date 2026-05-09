create table if not exists challenge_campaign_redemptions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenge_campaigns(id) on delete cascade,
  winner_user_id uuid not null references users(id) on delete cascade,
  venue_id text not null,
  claimed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (challenge_id, winner_user_id)
);

create index if not exists idx_challenge_campaign_redemptions_winner_venue
  on challenge_campaign_redemptions(winner_user_id, venue_id, claimed_at desc);
