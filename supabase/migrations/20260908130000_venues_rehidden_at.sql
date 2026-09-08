-- Venue visibility — `venues.rehidden_at`.
--
-- docs/self-serve-signup-review-fixes-plan.md §3 Phase 3, which absorbs Phase 0
-- of docs/lapsed-venue-rehide-plan.md.
--
-- This column is NOT bookkeeping. It is the only thing that distinguishes
--
--     "we hid this venue because their subscription lapsed"   (restorable)
--
-- from
--
--     "an admin hid this venue on purpose"                    (never restore)
--
-- Without it, the reconciler's restore half would fight an admin who
-- deliberately hid a venue whose billing happens to be live. `shouldRestoreVenue`
-- in lib/venueVisibility.ts requires it for exactly that reason: we only ever
-- restore what we hid.
--
-- Written by the Phase 9 re-hide job (gated on VENUE_REHIDE_ENABLED) and cleared
-- on restore. Nothing in Phase 3 writes it — Phase 3 ships only the
-- reveal-repair job, which never sets `hidden = true` and so never has cause to
-- stamp this. The column lands with the module rather than in a second migration
-- a month later.
--
-- ADD COLUMN IF NOT EXISTS on an existing table: no new RLS work
-- (supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md), no backfill, no default. NULL
-- on every existing row is the correct starting state — this feature has hidden
-- nothing yet, and the two hidden rows in production (both Category Blitz global
-- rooms) must stay unrestorable.

alter table public.venues
  add column if not exists rehidden_at timestamptz;

comment on column public.venues.rehidden_at is
  'Set when the lapsed-venue re-hide job hid this venue; cleared when it restores it. '
  'NULL means "not hidden by us" — an admin-hidden venue must never be auto-restored. '
  'Sole readers/writers: lib/venueVisibility.ts and lib/venueVisibilitySync.ts.';

-- Partial index: every reconciler read of this column is "the rows we hid",
-- which is a tiny slice of `venues` and will stay tiny.
create index if not exists venues_rehidden_at_idx
  on public.venues (rehidden_at)
  where rehidden_at is not null;
