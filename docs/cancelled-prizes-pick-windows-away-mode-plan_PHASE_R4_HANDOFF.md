# Phase R4 handoff: three small fixes (2026-11-09)

## For Andrew (plain English)

- **What changed:**
  1. "Remind me" now works on a busy night. Before, more than 200 games in the hour meant no reminder went out at all; now they go out in batches of 200.
  2. A pick window like "Mon 12 PM → Mon 8 AM" (open nearly all week) is now counted as open every day, so the Pick 'Em Prize wizard no longer wrongly warns "Mon only".
  3. When a partner edits a Live Trivia game, **Save changes** now waits until the prize warning ("Also ends: …") has loaded, so a fast tap can't skip it. If the check fails, Save comes back.
- **Live?** No. Code and tests only, uncommitted, not deployed; waits for Phase R. No migration.
- **Needs you:** nothing. Next is R5 (one look-only payload for Category Blitz).

## For the next agent

**Small phase, short note.** Files changed: `lib/push/gameReminders.ts` (`OPT_IN_CLAIM_MAX_GAMES`, chunked claim loop in `sendOptInReminderPushes`), `lib/pickemPickWindow.ts` (new exported `pickWindowOpenWeekdays`), `lib/pickemPrizeWizard.ts` (local copy deleted, imports it), `components/owner/schedule/ScheduleGameFlow.tsx` (`editChecking`, `nextDisabled`, early return in `save`). Tests added: `tests/lib.push.test.ts` (450 games → calls of 200/200/50, middle chunk fails, others still send, one push per phone per game), `tests/lib.pickem-pick-window.test.ts` (5 weekday cases from the spec), `tests/lib.pickem-pick-window-form.test.ts` (wrapping window → no notice), `tests/components.owner-schedule-flow.test.ts` (Save held then enabled; fail-open).

Verified: `npm run test` 517 files passed, 1 skipped; 6,787 tests passed, 13 skipped (R3 ended at 6,778). `npx tsc --noEmit` (filtered for `routes.d 2.ts` Finder duplicates) clean; eslint clean on touched files; `npm run test:push-sql` (PGlite, isolated) run. Not run: `npm run build`, a 350 px browser check of Review (no new copy was added).

State: branch `main`, last commit `40d47492`; nothing committed, pushed or deployed. Migrations `20261109214742`, `20261109223743`, `20261110014242` still unapplied.

Trap: `report.optIn.error` keeps the last failed chunk's message when several fail. Next phase R5 (plan §7): read `docs/CATEGORY_BLITZ_CONTINUOUS_DEFAULT_PLAN.md` "Standing rules" first; Sonnet 5.5, medium effort per the plan's table.
