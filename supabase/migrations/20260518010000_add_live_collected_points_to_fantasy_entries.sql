-- Track how many platform points have already been awarded via on-demand
-- live "Collect Points" claims so the final settlement can compute the delta.
alter table fantasy_entries
  add column if not exists live_collected_points numeric not null default 0;

comment on column fantasy_entries.live_collected_points is
  'Running total of platform points already awarded via mid-game "Collect Points" button.
   Final settlement awards (reward_points - live_collected_points) so users are never double-paid.';
