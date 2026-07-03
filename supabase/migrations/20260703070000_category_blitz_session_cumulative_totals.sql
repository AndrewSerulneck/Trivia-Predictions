-- Running per-user point totals for a Category Blitz session, updated once
-- per round as it's scored, so the leaderboard can be read directly instead
-- of re-summing every round's submissions on every poll.
alter table category_blitz_sessions
  add column if not exists cumulative_totals jsonb not null default '{}'::jsonb;
