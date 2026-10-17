-- NFL "most picks right" rewards: keep the old 3-player rule on every existing reward.
--
-- docs/reward-minimum-players-plan.md, Phase 1 (decision A6). Until now the NFL sweep
-- (lib/nflPickEmWinnerRewards.ts) applied a fixed "3+ guests with picks" gate and ignored
-- challenge_campaigns.min_players. From Phase 1 on, each NFL game_winner reward carries its own
-- minimum and null means "no minimum". So, BEFORE that code ships, every existing NFL
-- game_winner reward (active or not) gets min_players = 3 written down, and its behaviour does
-- not change.
--
-- Data only: no table, view or sequence is created, so no grants are needed. The existing
-- check constraint (20261014010000) already allows 2-100 on win_condition 'game_winner'. The
-- terms_updated_at trigger (20261004170244) does not watch min_players, so no coupon's wording
-- is re-stamped. Safe to apply while today's code is live: that code ignores min_players for NFL.

update public.challenge_campaigns
set min_players = 3
where reward_definition_id = 'nfl_pickem_challenge'
  and win_condition = 'game_winner'
  and min_players is null;
