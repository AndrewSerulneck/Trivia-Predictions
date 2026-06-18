-- Per-cycle winner tracking for recurring leaderboard challenges.
-- Allows a recurring challenge to declare a winner each week without
-- terminating the campaign permanently.

create table if not exists challenge_cycle_winners (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenge_campaigns(id) on delete cascade,
  cycle_start timestamptz not null,
  winner_user_id uuid not null references users(id) on delete cascade,
  venue_id text not null references venues(id) on delete cascade,
  points_earned integer not null default 0,
  finalized_at timestamptz not null default now(),
  prize_type text,
  prize_gift_certificate_amount numeric(10,2),
  unique (challenge_id, cycle_start)
);

create index if not exists idx_challenge_cycle_winners_challenge
  on challenge_cycle_winners(challenge_id, cycle_start desc);

create index if not exists idx_challenge_cycle_winners_user
  on challenge_cycle_winners(winner_user_id, finalized_at desc);

-- Add cycle_start to challenge_campaign_redemptions so each cycle's prize
-- is a distinct record. Existing rows get the sentinel epoch value so the
-- unique constraint remains valid.
alter table challenge_campaign_redemptions
  add column if not exists cycle_start timestamptz not null default '1970-01-01T00:00:00Z';

-- Re-key the uniqueness constraint to include cycle_start.
alter table challenge_campaign_redemptions
  drop constraint if exists challenge_campaign_redemptions_challenge_id_winner_user_id_key;

alter table challenge_campaign_redemptions
  add constraint challenge_campaign_redemptions_unique_cycle
  unique (challenge_id, winner_user_id, cycle_start);

-- Index for the redeem-panel lookup (user's prizes at a venue).
create index if not exists idx_challenge_campaign_redemptions_user_venue_cycle
  on challenge_campaign_redemptions(winner_user_id, venue_id, cycle_start desc);
