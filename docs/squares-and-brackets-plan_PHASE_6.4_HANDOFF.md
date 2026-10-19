# Squares + Brackets — Phase 6.4 handoff (player screen keeps up with a void)

**Date:** 2026-10-19. **Plan:** `docs/squares-and-brackets-plan.md` (§4 Phase 6, sub-phase 6.4; finding F6 in §13).
**Next:** 6.5, Opus 5.5 · medium.

## For Andrew (plain English)
- **What changed:** after the Super Bowl ends, a player's open Squares screen used to stop checking for news. If you
  later voided and re-graded a quarter in the admin panel, anyone who still had the screen open kept seeing the old
  winner until they reloaded. Now an open screen checks the shared score every 5 minutes (and once when the player
  comes back to the tab) and refreshes the winners if something changed. A re-grade that lands on the same square is
  also noticed now.
- **Live?** No. Committed on this computer only; no database change. Squares is still flagged off.
- **Needs you:** push `main` and deploy (6.1–6.4 ride together; 6.1 is wanted before Fri Oct 23).
- **Cost:** the shared score is cached for 15 s at the CDN, so it is at most one database read per 15 s nationwide, and
  no per-player server work. A phone left open on the finished game makes 12 cheap requests an hour, only while visible.

## For the next agent

### 1. Next phase
**6.5 (plan §4 Phase 6):** check the quarter rule against live captures (pollers for WSH @ SF `1392308` Oct 19 8:15 PM
ET and NE @ CHI `1392309` Oct 22 write `tests/fixtures/squares/nfl-live-capture-<id>.json`; Mac must stay awake). Run
`npx vitest run tests/squares-engine.test.ts`, adjust `quartersFinishedFromStatus` in `lib/squares.ts` if needed, record
real status strings in plan §8. Out of scope: 6.6–6.9.

### 2. Starting state
Branch `main`; 6.4 is one commit `feat(squares): plan 6.4 — …` (`git log -1 --grep "plan 6.4"`). Local `main` is 9 commits
ahead of `origin/main`; nothing pushed/deployed. No migration, no production data read or written. Uncommitted and NOT
ours (left alone): `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`,
and the POS hunk of `CLAUDE.md`.

### 3. Decisions
- 5-minute cadence (`SQUARES_COMPLETE_POLL_MS`) as the plan said; score only, board re-read only on revision mismatch.
- `gradeNo` lives inside each moment's `result` (not top level) in both payloads; required number (0 if a record is
  somehow missing, which cannot happen when `result` is non-null).

### 4. Files
- `lib/squaresView.ts`: `SQUARES_COMPLETE_POLL_MS`; `SquaresScoreMoment.result.gradeNo`; `squaresRevision` takes/prints `winningCell#gradeNo`.
- `lib/squaresBoard.ts`, `lib/squaresScore.ts`: emit `gradeNo`.
- `components/squares/useSquaresData.ts`: the `complete` branch of `tick` (catch-up, else score fetch when forced or 5 min old); header comment.
- Tests: `tests/squares-screen.test.ts` (replaced "stops reading once complete" with cadence + re-grade tests), `tests/squares-view.test.ts` (revision test; fixtures), `tests/squares-tv.test.ts` (fixture).
- Docs: plan status line + 6.4 "Built"; this file.

### 5. Facts and traps
- The `complete` branch's existing catch-up re-reads the board every 5 s tick while the held score and board disagree;
  that is fine in production (one read fixes it) but in tests the fake board must be updated to match, or it loops.
- Other readers of the score/board `moments[].result` (TV, admin) ignore the new field; the TV payload was not changed.
- The CDN-cached score route is unchanged apart from the extra field; it still carries no player or venue.

### 6. Build / test (run 2026-10-19)
`npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` 5,045 pass / 13 skipped / 0 fail; `npm run build` succeeds.
`/verify` not run (Squares is flagged off). Unverified on a real device: 6.7's rehearsal should include a void with a screen left open.

### 7. Open questions
Push + deploy (6.1–6.4). Squares prize setup before Jan 25 (unchanged: recommend leave it).

### 8. First steps for 6.5
Read plan §4 "6.5" and §8; check the poller PIDs/fixtures exist (`ls tests/fixtures/squares/`); run the engine test; Opus 5.5, medium.
