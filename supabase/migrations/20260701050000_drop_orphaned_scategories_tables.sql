-- Drop orphaned scategories_* tables left behind by the Category Blitz rename.
-- The rename was originally done via parallel `create table if not exists`
-- under the new names (see 20260628170000) rather than a true rename, so the
-- old scategories_* tables were never actually renamed away — they just sat
-- unused alongside the live category_blitz_* ones. Confirmed empty except for
-- one already-completed test session with no bearing on live data.
--
-- IF EXISTS guards keep this a safe no-op on any environment where the
-- 20260628170000 rename migration already renamed these tables away (nothing
-- left to drop).

drop table if exists public.scategories_submissions;
drop table if exists public.scategories_rounds;
drop table if exists public.scategories_sessions;
drop table if exists public.scategories_schedules;
