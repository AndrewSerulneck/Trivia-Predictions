-- Add timezone column to venues so challenge eligibility checks can use
-- local wall-clock time instead of UTC for day-of-week and time-window comparisons.
alter table venues
  add column if not exists timezone text not null default 'America/New_York';
