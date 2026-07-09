-- Pins test_mode durably to the session at creation time instead of trusting
-- whichever request happens to be driving startRound/driveVenueCategoryBlitz
-- next, which could disagree with what the UI's toggle currently shows (see
-- docs/category-blitz-no-grading-analysis.md Root Cause 2).
alter table category_blitz_sessions
  add column if not exists test_mode boolean not null default false;
