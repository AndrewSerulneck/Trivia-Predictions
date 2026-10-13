# Single-week NFL reward — Phase 3 handoff (guest and partner wording)

Written 2026-10-12. Plan: `docs/nfl-pickem-single-week-reward-plan.md`. Previous: `…_PHASE_2_HANDOFF.md`.

## For Andrew (plain English)

The wording for "Single week" rewards is done. Guests will read "Get the most NFL picks right in Week 9
and win a $100 gift card" (or "Get 10 NFL picks right in Week 9…"), with matching "when" and fine-print
lines, a "Week 9 has ended." line once the week is over, and "You got the most NFL picks right in Week 9"
on the won coupon. The Partner Manual now mentions that NFL rewards can run for one week you choose.

Partners still can't create one: the button arrives in Phase 4. **Nothing is committed, pushed or
deployed** (Phases 1–3 are all uncommitted). Typecheck, lint and all 4,156 tests pass. Nothing needs you yet.

## For the next agent (Phase 4 — Create Reward wizard UI; plan says Sonnet 5.5, medium effort)

1. **Goal/scope:** plan §4 Phase 4 only (`components/rewards/CreateRewardWizard.tsx`: third card, week
   list, `nflScope` memo, terms preview, winners line, D3 threshold disabling, 12px floor, admin
   snapshot updates, scratchpad-clone visual check). Out of scope: Phase 5 review/release, week ranges.
2. **Starting state:** branch `main`, last commit `44fbc62`. Phases 1–3 uncommitted, mixed with unrelated
   work (listed in the Phase 2 handoff §2 — don't revert or bundle it). Migration `20261012200725` is
   applied to production. No data written.
3. **Decisions:** D1–D5 in plan §2. Phase 3: wording uses the plain week number ("Week 9"); the guest
   "ended" state compares today (Eastern) with the campaign `endDate` and only applies with a valid
   `YYYY-MM-DD` endDate.
4. **Files changed (Phase 3):**
   - `lib/rewardDefinitions.ts` — templates `mostPicksSingleWeek`, `picksTargetSingleWeek` (type + copy),
     `{week}` documented.
   - `lib/rewardDescription.ts` `describeNFLReward` — single-week summary/when/fineprint, "Week N has
     ended." state (after the off-season check, before "Starts …"); `describeRewardWin` explicit
     single-week branch ("in Week N").
   - `lib/partnerManual.ts` — one sentence in the rewards section.
   - Tests: `tests/lib.reward-description.test.ts` (4 new), `tests/lib.rewards-definitions.test.ts` (1 new).
   - `describeNFLWeekScope` (Phase 1) already had correct single-week sentences; reviewed, unchanged.
5. **Facts/traps:** no partner/admin reward-list label names the scope (grep of `Whole season` finds only the
   wizard card at `CreateRewardWizard.tsx:971`). Don't run Prettier on `lib/rewardDescription.ts` — it
   reformats ~250 lines. `{week}` for a postseason week would read "Week 19"; no postseason rows are synced
   yet (consider the selectable week's `label` in Phase 4 if they appear).
6. **Verified:** `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` 345 files / 4,156 passed,
   13 skipped, 0 failed. Not run: `npm run build`, any browser check.
7. **Open questions for Andrew:** the three pre-existing issues in Phase 2 handoff §7 remain for Phase 5.
8. **First steps:** read plan §4 Phase 4, then the wizard around lines 432–460 (`nflScope` memo), 948–990
   (scope cards), 1436 (confirm readback); the context's `selectableWeeks` already arrives from the server.
