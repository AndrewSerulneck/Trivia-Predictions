-- NFL Pick 'Em reward — challenge-campaign accrual marker.
--
-- NFL picks live in `pickem_picks` alongside daily Pick 'Em and are settled by
-- the shared settlePendingPickEmPicks sweep, which writes status/reward_points
-- and stops there. Phase 6 adds a separate NFL-only sweep
-- (lib/nflPickEmRewardAccrual.ts) that feeds each newly-settled WON pick into
-- applyChallengeCampaignPoints so a points-target NFL reward can actually be won.
--
-- applyChallengeCampaignPoints ACCUMULATES (nextProgress = existing + increment),
-- and the settle cron runs repeatedly over an overlapping window, so the sweep
-- needs a durable "already counted" marker or a guest would be inflated toward a
-- real prize on every run. This is that marker.
--
-- Deliberately NOT reusing reward_claimed_at: that is the player-facing claim
-- flow ("I collected my 10 points for this pick") and means something different.
-- A pick can be challenge-accrued without ever being claimed, and vice versa.
--
-- NULL means "not yet fed to the challenge engine". Daily Pick 'Em picks
-- (sport_slug <> 'nfl') are never touched by the NFL sweep and stay NULL forever;
-- their accrual continues to run inside claimPickEmDailyReward, unchanged.

alter table pickem_picks
  add column if not exists challenge_accrued_at timestamptz;

comment on column pickem_picks.challenge_accrued_at is
  'NFL Pick ''Em rewards: when this won pick was counted toward challenge_campaign_progress by the NFL accrual sweep (lib/nflPickEmRewardAccrual.ts). NULL = not yet counted. Idempotency marker only — distinct from reward_claimed_at, which is the player-facing points claim.';

-- The sweep's exact predicate. Partial so the index only carries the small
-- backlog of un-accrued won NFL picks rather than the whole picks table.
create index if not exists pickem_picks_nfl_challenge_accrual_idx
  on pickem_picks (starts_at)
  where sport_slug = 'nfl' and status = 'won' and challenge_accrued_at is null;
