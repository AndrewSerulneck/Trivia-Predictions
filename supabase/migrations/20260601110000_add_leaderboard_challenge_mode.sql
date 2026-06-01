-- Add support for leaderboard-style challenge campaigns while keeping progress mode backward compatible.

alter table if exists challenge_campaigns
  add column if not exists challenge_mode text;

update challenge_campaigns
set challenge_mode = 'progress'
where challenge_mode is null;

alter table if exists challenge_campaigns
  alter column challenge_mode set default 'progress';

alter table if exists challenge_campaigns
  alter column challenge_mode set not null;

alter table if exists challenge_campaigns
  drop constraint if exists challenge_campaigns_mode_valid;

alter table if exists challenge_campaigns
  add constraint challenge_campaigns_mode_valid
  check (challenge_mode in ('progress', 'leaderboard'));

alter table if exists challenge_campaigns
  add column if not exists leaderboard_display_limit integer;

update challenge_campaigns
set leaderboard_display_limit = 10
where leaderboard_display_limit is null;

alter table if exists challenge_campaigns
  alter column leaderboard_display_limit set default 10;

alter table if exists challenge_campaigns
  alter column leaderboard_display_limit set not null;

alter table if exists challenge_campaigns
  drop constraint if exists challenge_campaigns_leaderboard_display_limit_valid;

alter table if exists challenge_campaigns
  add constraint challenge_campaigns_leaderboard_display_limit_valid
  check (leaderboard_display_limit >= 1 and leaderboard_display_limit <= 50);

alter table if exists challenge_campaigns
  add column if not exists leaderboard_tiebreaker text;

update challenge_campaigns
set leaderboard_tiebreaker = 'first_to_score'
where leaderboard_tiebreaker is null;

alter table if exists challenge_campaigns
  alter column leaderboard_tiebreaker set default 'first_to_score';

alter table if exists challenge_campaigns
  alter column leaderboard_tiebreaker set not null;

alter table if exists challenge_campaigns
  drop constraint if exists challenge_campaigns_leaderboard_tiebreaker_valid;

alter table if exists challenge_campaigns
  add constraint challenge_campaigns_leaderboard_tiebreaker_valid
  check (leaderboard_tiebreaker in ('first_to_score', 'latest_activity'));
