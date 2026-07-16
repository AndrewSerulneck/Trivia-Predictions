-- Category Blitz: continuous mode is now the universal default
-- (see docs/CATEGORY_BLITZ_CONTINUOUS_DEFAULT_PLAN.md, Phase 5).
--
-- Every venue runs an endless randomized continuous loop, driven by
-- driveContinuousCategoryBlitz / runContinuousCategoryBlitzEngine. The legacy
-- scheduled engine (category_blitz_schedules -> start/end time windows) is
-- retired. Its runtime guard is the NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT
-- flag + standDownScheduledIfContinuous (Phase 4); this migration is the data
-- belt-and-suspenders: deactivating the schedule rows removes them from both
-- listSchedules and listAllActiveSchedules (each filters is_active = true), so
-- no scheduled Category Blitz session can be opened even with the flag off.
--
-- Rows are DEACTIVATED, not deleted, so they remain as historical reference and
-- the change is reversible (set is_active = true to restore a schedule).
update public.category_blitz_schedules
set is_active = false,
    updated_at = now()
where is_active = true;
