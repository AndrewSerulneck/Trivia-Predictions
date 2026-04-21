-- Support manual claim flow for Bingo rewards.
alter table if exists sports_bingo_cards
  add column if not exists reward_claimed_at timestamptz;

-- Historical won cards were auto-awarded before claim flow existed.
-- Mark them claimed to avoid duplicate payouts.
update sports_bingo_cards
set reward_claimed_at = coalesce(reward_claimed_at, now())
where status = 'won';

create index if not exists idx_sports_bingo_cards_claimable
  on sports_bingo_cards(user_id, status, reward_claimed_at);
