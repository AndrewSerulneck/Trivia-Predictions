-- Partner business type (docs/partner-business-type-plan.md, Phase 1).
--
-- "What kind of business are you?" is asked once at sign-up and stored on the
-- PARTNER (venue_owners), not the venue: a trivia DJ is a kind of customer whose
-- venues are bars. Nothing reads it for behaviour yet; it lets us price, report
-- or market by type later.
--
-- text + CHECK, not a Postgres enum: adding a value later is a one-line
-- constraint swap. The five values are spelled in app code ONLY in
-- lib/partnerBusinessType.ts (tests/partner-business-type-contract.test.ts pins
-- that this list matches it).
--
-- NULL means UNKNOWN, never Bar/Restaurant. After the backfill below it can only
-- appear on a pending signup posted by a wizard tab that predates the business
-- step (deploy skew), or by a path that does not ask yet (legacy /owner/register,
-- admin Activate-a-Venue until Phase 3).
--
-- No new table, view, sequence or function, so no grants are needed
-- (supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md).

alter table public.venue_owners
  add column if not exists business_type text null;

alter table public.venue_owners
  drop constraint if exists venue_owners_business_type_check;

alter table public.venue_owners
  add constraint venue_owners_business_type_check
  check (
    business_type is null
    or business_type in ('bar_restaurant', 'trivia_dj', 'hotel', 'movie_theater', 'other')
  );

comment on column public.venue_owners.business_type is
  'Partner business type chosen at sign-up: bar_restaurant | trivia_dj | hotel | movie_theater | other. NULL = unknown. App list: lib/partnerBusinessType.ts.';

-- Backfill (Andrew, 2026-11-12): every partner that exists today is a bar, or a
-- restaurant with a bar (Carrabba's). Undo log of the rows this changes:
-- docs/partner-business-type-plan_PHASE_1_BACKFILL_LOG_2026-11-12.json.
-- Undo: update public.venue_owners set business_type = null where id in (<that list>);
-- or drop the column entirely (nothing reads it in Phase 1).
update public.venue_owners
  set business_type = 'bar_restaurant'
  where business_type is null;
