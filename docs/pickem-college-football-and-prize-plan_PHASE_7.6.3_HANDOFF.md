# Pick 'Em plan — Phase 7.6.3 handoff (2026-11-01)

## For Andrew (plain English)
- **What changed:** when two settlement runs (the cron, a score webhook, or a player's open Pick 'Em screen) grade the same
  game at the same moment, only the run that really graded a pick now counts the win and queues its "X won. +10 pts."
  notification. Before, both could — a rare duplicate notification (and phone push). Nobody was ever paid twice (the payment
  step already paid once); measured duplicates in production: 0 of the last 24.
- **Live?** No. Uncommitted, unpushed, undeployed (main frozen during App Store review; work is on `after-app-review`). No database change.
- **What's left in this plan:** no more code phases. Remaining: your phone pass
  (`docs/pickem-college-football-and-prize-device-checklist.md`), the decision to deploy Phases 1–7.6.3 once App Store review
  allows, and open question Q7 (plan §8: hide archived prizes of every other kind from the venue panel too? default no).

## For the next agent
1. **Goal/scope:** none required — the plan's code is complete. Out of scope: Q7, F7 (TBA kickoffs), Squares/Bracket PATCH guard.
2. **State:** branch `after-app-review`, last commit `407e4da2`; everything from Pick 'Em Phases 1–7.6.3 is uncommitted. No data touched, no migration; all nine migrations in this plan are already applied to production.
3. **Decision:** the rule is the one 7.5.1 uses in `settleAdminPickEmGame`: a conditional update that changes no row counts nothing.
4. **Files:** `lib/pickem.ts` — `recordSettlement` inside `settlePendingPickEmPicks`: the `.eq("status","pending")` update now ends with `.select("id")` and returns early on an error OR an empty result. Test: `tests/lib.pickem-stale-pending.test.ts` (new `updateMatchesNothing` mock switch; describe "a win is counted only by the run that graded it (F23)").
5. **Traps:** the older settlement test mocks (`lib.pickem-nfl-scoring-mode`, `lib.pickem-college-spreads` etc.) still pass unchanged because their update mocks return rows. A new mock must return the updated rows from an update or `won` stays 0.
6. **Verify:** `npx vitest run tests/lib.pickem-stale-pending.test.ts` (20 pass) and the 10 Pick 'Em settlement test files (128 pass); `npx tsc --noEmit` clean. Full `npm run test` not re-run this phase (7.6.2 had 4 unrelated date-based Bingo star-index failures).
7. **Open for Andrew:** phone pass; Q7; when to commit/deploy.
8. **First steps:** if asked to ship, commit to `after-app-review` only; follow the deploy notes in plan §11 ("7.6.1 should land before the first Pick 'Em Prize is created"). Never push `main` or `db push` until Andrew confirms App Store approval.
