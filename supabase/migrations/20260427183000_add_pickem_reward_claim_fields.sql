alter table if exists pickem_picks
  add column if not exists reward_points integer not null default 50;

alter table if exists pickem_picks
  add column if not exists reward_claimed_at timestamptz;

create index if not exists idx_pickem_picks_unclaimed_rewards
  on pickem_picks(user_id, status, reward_claimed_at)
  where status = 'won' and reward_claimed_at is null;
