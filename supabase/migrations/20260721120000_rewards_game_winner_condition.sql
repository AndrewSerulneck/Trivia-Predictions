-- Rewards system — game-winner win condition.
--
-- Until now every reward resolved the same way: accrue points until the player
-- crosses points_required_to_win. Some venues instead want to hand a prize to
-- whoever WINS the Live Trivia game, regardless of score. This migration adds
-- the discriminator for that second win condition.
--
--   win_condition — 'points_threshold' (today's behavior, the default) or
--                   'game_winner' (awarded to the top scorer(s) of a finished
--                   Live Trivia occurrence by the resolve-live-trivia-winners
--                   cron, not by the points-accrual path).
--
-- PURELY ADDITIVE and backward-compatible: every existing campaign defaults to
-- 'points_threshold', so behavior is unchanged until a reward is explicitly
-- created with 'game_winner'.
--
-- NOTE ON points_required_to_win: it is deliberately left NOT NULL / untouched.
-- Several readers (lib/challengeCampaigns.ts mapCampaignRow, the venue panel,
-- the admin section) assume a numeric value and clamp with Math.max(1, ...).
-- A 'game_winner' campaign writes the sentinel 1 there and must never be
-- evaluated against it — the win_condition column is the only authority.

alter table challenge_campaigns
  add column if not exists win_condition text not null default 'points_threshold'
    check (win_condition in ('points_threshold', 'game_winner'));

-- The resolver cron scans for active game_winner campaigns on every sweep.
create index if not exists idx_challenge_campaigns_win_condition
  on challenge_campaigns (win_condition)
  where win_condition = 'game_winner';
