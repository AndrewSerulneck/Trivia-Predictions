-- Squares + Brackets plan (docs/squares-and-brackets-plan.md) 10.7.1 (finding §25 F1): a rehearsal
-- remembers when each lock really passed. bracketRealLockMs (lib/bracketsStore.ts) used to compute
-- lock + the CURRENT clock_offset_seconds, and every forward set_clock shrinks the offset, so after a
-- walked replay the "real" lock landed weeks early: no prize paid and Results misdated the brackets.
--
-- Each column is written once, in REAL time (lib/bracketsStore.ts lockPassedPatch): by set_clock
-- (the call's time when its jump crosses the lock; lock + the old offset when the lock had already
-- passed), else by the sync run that first sees the lock passed (lock + that run's offset). Null =
-- not passed yet (or a row from before this migration: the old rule still applies).
-- Columns only, no new table/view/sequence: no grant needed (supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md).

alter table public.bracket_tournaments
  add column if not exists main_lock_passed_at timestamptz,
  add column if not exists second_lock_passed_at timestamptz;
