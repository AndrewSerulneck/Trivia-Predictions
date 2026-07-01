-- Rename Scategories -> Category Blitz (product rename).
-- Renames tables, indexes, and the updated_at trigger created by the four
-- preceding scategories_* migrations to their category_blitz_* names.
--
-- Every rename is guarded on BOTH ends: only proceed if the old-named
-- object still exists AND the new-named object does not already exist.
-- (On this environment the new names were already created directly rather
-- than via a true rename, so old orphaned scategories_* objects may still
-- be present alongside the live category_blitz_* ones — a naive
-- "ALTER ... IF EXISTS ... RENAME" would collide with the existing target
-- and fail. This migration is a safe no-op wherever category_blitz_* names
-- are already the live objects, and a real rename on a fresh
-- `supabase db reset` replaying history from scratch.)
--
-- Row-level security policies are untouched: Postgres binds policies to the
-- table by OID, so a table rename does not require recreating them.

do $$
begin
  if to_regclass('public.scategories_sessions') is not null
     and to_regclass('public.category_blitz_sessions') is null then
    alter table public.scategories_sessions rename to category_blitz_sessions;
  end if;
end $$;

do $$
begin
  if to_regclass('public.scategories_rounds') is not null
     and to_regclass('public.category_blitz_rounds') is null then
    alter table public.scategories_rounds rename to category_blitz_rounds;
  end if;
end $$;

do $$
begin
  if to_regclass('public.scategories_submissions') is not null
     and to_regclass('public.category_blitz_submissions') is null then
    alter table public.scategories_submissions rename to category_blitz_submissions;
  end if;
end $$;

do $$
begin
  if to_regclass('public.scategories_schedules') is not null
     and to_regclass('public.category_blitz_schedules') is null then
    alter table public.scategories_schedules rename to category_blitz_schedules;
  end if;
end $$;

do $$
begin
  if to_regclass('public.uq_scategories_sessions_venue_active') is not null
     and to_regclass('public.uq_category_blitz_sessions_venue_active') is null then
    alter index public.uq_scategories_sessions_venue_active rename to uq_category_blitz_sessions_venue_active;
  end if;
end $$;

do $$
begin
  if to_regclass('public.idx_scategories_rounds_session') is not null
     and to_regclass('public.idx_category_blitz_rounds_session') is null then
    alter index public.idx_scategories_rounds_session rename to idx_category_blitz_rounds_session;
  end if;
end $$;

do $$
begin
  if to_regclass('public.idx_scategories_rounds_venue') is not null
     and to_regclass('public.idx_category_blitz_rounds_venue') is null then
    alter index public.idx_scategories_rounds_venue rename to idx_category_blitz_rounds_venue;
  end if;
end $$;

do $$
begin
  if to_regclass('public.uq_scategories_submissions_player_category') is not null
     and to_regclass('public.uq_category_blitz_submissions_player_category') is null then
    alter index public.uq_scategories_submissions_player_category rename to uq_category_blitz_submissions_player_category;
  end if;
end $$;

do $$
begin
  if to_regclass('public.idx_scategories_submissions_round') is not null
     and to_regclass('public.idx_category_blitz_submissions_round') is null then
    alter index public.idx_scategories_submissions_round rename to idx_category_blitz_submissions_round;
  end if;
end $$;

do $$
begin
  if to_regclass('public.idx_scategories_submissions_venue') is not null
     and to_regclass('public.idx_category_blitz_submissions_venue') is null then
    alter index public.idx_scategories_submissions_venue rename to idx_category_blitz_submissions_venue;
  end if;
end $$;

do $$
begin
  if to_regclass('public.idx_scategories_submissions_user') is not null
     and to_regclass('public.idx_category_blitz_submissions_user') is null then
    alter index public.idx_scategories_submissions_user rename to idx_category_blitz_submissions_user;
  end if;
end $$;

do $$
begin
  if to_regclass('public.idx_scategories_schedules_venue') is not null
     and to_regclass('public.idx_category_blitz_schedules_venue') is null then
    alter index public.idx_scategories_schedules_venue rename to idx_category_blitz_schedules_venue;
  end if;
end $$;

do $$
begin
  if to_regclass('public.idx_scategories_schedules_start_time') is not null
     and to_regclass('public.idx_category_blitz_schedules_start_time') is null then
    alter index public.idx_scategories_schedules_start_time rename to idx_category_blitz_schedules_start_time;
  end if;
end $$;

-- ALTER TRIGGER has no IF EXISTS clause, so guard it with catalog checks
-- on both the old trigger name and the target name.
do $$
begin
  if exists (
    select 1 from pg_trigger
    where tgname = 'scategories_schedules_set_updated_at'
      and tgrelid = 'public.category_blitz_schedules'::regclass
  ) and not exists (
    select 1 from pg_trigger
    where tgname = 'category_blitz_schedules_set_updated_at'
      and tgrelid = 'public.category_blitz_schedules'::regclass
  ) then
    alter trigger scategories_schedules_set_updated_at
      on public.category_blitz_schedules
      rename to category_blitz_schedules_set_updated_at;
  end if;
end $$;
