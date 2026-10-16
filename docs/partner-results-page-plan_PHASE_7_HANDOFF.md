# Partner Results plan — Phase 7 handoff (schedule rows + "add another" row)

**Date:** 2026-10-16 · **Plan:** `docs/partner-results-page-plan.md` §7, Phase 7 (review findings F4, F5, F9). This is the last phase of the plan.

## For Andrew (plain English)
- **What changed:** a schedule row hides the game name whenever the title already contains it ("Friday Live Trivia",
  "LIVE TRIVIA"), but "Live Triviathon" still shows it. The Live Games card has its "+ Schedule another game" row back,
  matching Rewards. The two older dashboard docs now say the pills are gone.
- **Live?** Committed and pushed to `main` together with the Results work and the tutorial-cards work (see below);
  Vercel deploys from `main`. Deployment status was not checked by me.
- **Left:** your phone passes (`docs/game-tutorial-cards-device-checklist.md`, section J of
  `docs/partner-dashboard-app-redesign-device-checklist.md`), then the Results usage comparison (plan §6).
- **Cost:** none (pure display code).

## For the next agent
1. **Scope:** plan complete. Nothing is queued. Out of scope: anything new in Results, tutorial cards, schedule UI.
2. **Starting state:** branch `main`. Three commits made this session: tutorial cards (Phase 6 + original), schedule rows
   (Phase 7), pushed with the five earlier unpushed Results commits (`0a39fb9`..`57d150e`). No data, migrations or env touched.
3. **Decisions:** Q1 (clock starts when cards are finished) and Q2 (put the Live Games row back) — both Andrew's.
4. **Files:** `lib/ownerScheduleDisplay.ts` (`scheduleRowDetail(schedule, window)` — window is required, no default;
   private `titleNamesGame` = case-insensitive whole-word match using Unicode letter/digit lookarounds),
   `components/owner/schedule/ScheduleGameRow.tsx` (passes its one `displayWindow`), `components/owner/dashboard/LiveGamesSection.tsx`
   (`SectionAddRow` restored), `tests/lib.owner-schedule-display.test.ts`, docs notes in the two redesign docs.
5. **Traps:** `GAME_PILL_STYLES` is gone (superseded, noted in the Phase 3 handoff). Don't run `tsc` during `build`.
6. **Verified 2026-10-16:** `tsc` clean, eslint clean on touched files, `npm run test` 401 files / 4,770 pass / 13 skipped / 0 fail,
   `npm run build` OK. Not verified: real phones.
7. **Open questions:** none.
8. **First steps:** check the Vercel deploy is green, then hand Andrew the device checklists.
