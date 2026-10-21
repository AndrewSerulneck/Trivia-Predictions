# Squares plan — Phase 6.6.4 handoff

## For Andrew (plain English)
Two housekeeping fixes, no behaviour change, nothing deployed. A misplaced code comment was moved back to the
function it describes, and the admin panel's "blocked result" rule (a result whose points can never be paid) is now
written once instead of twice. Typecheck is clean and the 135 Squares tests pass. 6.6.1–6.6.4 are all done, so the
6.7 rehearsal is unblocked from the code side. Not committed yet (6.6.3's changes are also still uncommitted).

## For the next agent
1. **Next phase: 6.7 rehearsal** (Opus 5.5, high) — see plan §6.7. Pick a December 2026 game; out of scope: launch (6.9).
2. **State:** branch `main`, last commit `0517f18`. Uncommitted: 6.6.3 work (`lib/squaresSettlement.ts`, `squaresStore.ts`,
   `squaresPrizeAwards.ts`, tests) plus 6.6.4 and unrelated doc/design-system edits. No migrations, nothing deployed.
3. **Decisions:** none new.
4. **Files:** `lib/squaresAdmin.ts` — new `onlyBlockedResults` query helper used by `countBlockedResults` and the overview's
   blocked select. `lib/liveTriviaRankedRewards.ts` — doc block moved back above `rankedRewardConfigError`.
5. **Traps:** the helper is generically typed over `.not/.is` so it works on the Supabase builder; keep `unpaidOnly` in `countRows` separate.
6. **Verified:** `npx tsc --noEmit` clean; `npx vitest run tests/squares` 135/135. Full `npm run test`/lint/build not run.
7. **Open questions:** whether to commit 6.6.3 + 6.6.4 together.
8. **First steps:** run full `npm run test`, commit, then follow plan §6.7.
