-- Remove "Link a TV" (docs/live-trivia-pregame-and-display-cleanup-plan.md, Phase 5 step 3, decision D4).
-- Partners now set up a display only by its Display URL (hightopchallenge.com/tv/<display_code>).
-- Applied after the code that stopped using this table was deployed (PR #17, 2026-11-14), so no live
-- deployment queries it. The one row it ever held (2026-10-12, never claimed) is saved in
-- docs/live-trivia-pregame-and-display-cleanup-plan_PHASE_5_DROP_LOG_2026-11-14.json.
-- Dropping the table also drops its index, constraints, RLS settings and grants.

drop table if exists public.tv_pairing_codes;
