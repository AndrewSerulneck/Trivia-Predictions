-- Rename Scategories -> Category Blitz (product rename).
-- Renames tables and indexes created by the four preceding scategories_*
-- migrations. Every statement is guarded so this migration is a safe no-op
-- wherever the category_blitz_* names are already in place, and a real
-- rename wherever the scategories_* names are still live (e.g. a fresh
-- `supabase db reset` replaying history from scratch).
--
-- Row-level security policies are untouched: Postgres binds policies to the
-- table by OID, so a table rename does not require recreating them.

alter table if exists public.scategories_sessions rename to category_blitz_sessions;
alter table if exists public.scategories_rounds rename to category_blitz_rounds;
alter table if exists public.scategories_submissions rename to category_blitz_submissions;
alter table if exists public.scategories_schedules rename to category_blitz_schedules;

alter index if exists uq_scategories_sessions_venue_active rename to uq_category_blitz_sessions_venue_active;

alter index if exists idx_scategories_rounds_session rename to idx_category_blitz_rounds_session;
alter index if exists idx_scategories_rounds_venue rename to idx_category_blitz_rounds_venue;

alter index if exists uq_scategories_submissions_player_category rename to uq_category_blitz_submissions_player_category;
alter index if exists idx_scategories_submissions_round rename to idx_category_blitz_submissions_round;
alter index if exists idx_scategories_submissions_venue rename to idx_category_blitz_submissions_venue;
alter index if exists idx_scategories_submissions_user rename to idx_category_blitz_submissions_user;

alter index if exists idx_scategories_schedules_venue rename to idx_category_blitz_schedules_venue;
alter index if exists idx_scategories_schedules_start_time rename to idx_category_blitz_schedules_start_time;

-- ALTER TRIGGER has no IF EXISTS clause, so guard it with a catalog check.
do $$
begin
  if exists (
    select 1 from pg_trigger
    where tgname = 'scategories_schedules_set_updated_at'
      and tgrelid = 'public.category_blitz_schedules'::regclass
  ) then
    alter trigger scategories_schedules_set_updated_at
      on public.category_blitz_schedules
      rename to category_blitz_schedules_set_updated_at;
  end if;
end $$;
