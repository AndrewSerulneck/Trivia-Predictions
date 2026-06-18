-- Add cycle_start to challenge_campaign_progress so recurring challenges scope
-- progress per weekly/monthly occurrence rather than accumulating all-time.
-- Existing rows receive a sentinel epoch value and are treated as legacy data.

alter table challenge_campaign_progress
  add column if not exists cycle_start timestamptz not null default '1970-01-01T00:00:00Z';

-- Replace the flat unique constraint with one that includes cycle_start,
-- allowing one row per user per challenge per cycle occurrence.
alter table challenge_campaign_progress
  drop constraint if exists challenge_campaign_progress_unique;

alter table challenge_campaign_progress
  add constraint challenge_campaign_progress_unique
  unique (challenge_id, user_id, venue_id, cycle_start);

-- Replace leaderboard-ranking indexes to include cycle_start so the planner
-- can efficiently filter to a single cycle.
drop index if exists idx_challenge_campaign_progress_venue_rank_first_to_score;
drop index if exists idx_challenge_campaign_progress_venue_rank_latest_activity;
drop index if exists idx_challenge_campaign_progress_rank_first_to_score;
drop index if exists idx_challenge_campaign_progress_rank_latest_activity;

create index if not exists idx_challenge_campaign_progress_cycle_rank_fts
  on challenge_campaign_progress(challenge_id, venue_id, cycle_start, points_earned desc, updated_at asc, user_id asc);

create index if not exists idx_challenge_campaign_progress_cycle_rank_la
  on challenge_campaign_progress(challenge_id, venue_id, cycle_start, points_earned desc, updated_at desc, user_id asc);
