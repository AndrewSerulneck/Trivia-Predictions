# Category Blitz letter die — Phase 11.1 handoff (2026-10-30)

## For Andrew (plain English)

**What changed:** the die's clock now agrees with the real round's clock in three places.

1. **A late letter never holds the board.** If the round's letter reaches a phone more than 3 seconds after the round
   started (a slow connection), the die steps aside at once and the categories show. Before, a die that had already
   started tumbling still did its full landing, which cost another ~2 seconds on top of the delay.
2. **The die follows tonight's real schedule.** If you (or a partner) shorten or close tonight's Category Blitz window
   in the middle of a game, the die now knows the game is ending and won't tumble over the final standings. Before,
   it used the end time saved when the game started.
3. **The die asks "does another round follow?" the same way the game engine does,** allowing for the few seconds a
   round really takes to start. Right at the end of a window, the die may skip its 5-second tumble for a round that
   does follow — that round still gets its die, it just lands without the lead-in, so no answering time is lost.

**Is it live?** No. Uncommitted on the `after-app-review` branch, like Phases 2–10. Nothing deployed, no database
change, no new cost (the window end comes from schedules the server already reads).

**What's left:** Phases 11.2 (die under the header bar), 11.3 (die component fixes), 11.4 (hidden rows can't be
tapped), then Phase 12 (review + your phone pass).

**Needs you:** nothing for this phase.

---

## For the next agent (Phase 11.2)

### 1. Next phase: goal and scope
Phase 11.2 — "The die lives under the header, not over it" (re-review findings 5, 6). Full spec in
`docs/category-blitz-letter-die-plan.md` §5 "Phase 11.2". Model: Opus 5.5, high. Out of scope: a die over the header,
anything in 11.3/11.4, the engine, the venue TV.

### 2. Starting state
- Branch `after-app-review`; last commit `c3ecdb8a` (Add the live Google Play listing URL). All letter-die work
  (Phases 1–11.1) is **uncommitted** in the working tree (see `git status`); nothing pushed or deployed. `main` is frozen
  during App Store review — never push `main`, deploy, or change Production env for this work.
- No data touched. No migration. No scripts run against production.

### 3. Decisions made in 11.1 (don't re-ask)
- **11.1a:** the cutoff is one rule in `dieStage`'s letter-arrived branch, tumble or not:
  `letterArrivedAtMs − roundStartedAtMs > DIE_MID_ROUND_CUTOFF_MS` → `done`. Exactly 3000 ms still lands (`>`, like the
  old rule). The old clause (`tumbleStartedAtMs === null && nowMs − roundStartedAtMs > …`) is deleted; no test needed
  a case only it handled. The one test it did affect, "a roll that tumbled is not cut off by round age", asserted the
  exact bug (letter 3.6 s late after a tumble → landing) and was replaced by the 11.1a tests.
- **11.1b:** `scheduleWindowEndAt` is returned by `GET /api/category-blitz/sessions` (non-peek) only for an **auto**
  scheduled session in an open window; **null for a manual session** (the engine never advances manual sessions, so
  "a round follows" is unknowable — this keeps Phase 7.2's manual rule), null with no open window, null for continuous.
  The `peek=1` branch does not return the field (no die there). Not stored anywhere.
- **11.1c:** `ROUND_START_DRIVE_SLACK_MS = 15_000` in `lib/categoryBlitzShared.ts`. Source (in its comment): kick
  jitter ≤ 3 s + retry ladder 1.2 + 3 + 6 s ≈ 13 s worst case, then the 15 s fallback poll.
- Only the `driveVenueCategoryBlitz` `canFitAnother` uses `roundFitsWindow`. The **second** `canFitAnother` in
  `lib/categoryBlitz.ts` (~line 2012, the cron-path engine, `ROUND_DURATION_SECONDS` with no test mode) was left
  untouched per the plan ("the only engine edit"). It is the same arithmetic; converting it later is behaviour-neutral.

### 4. Files changed in 11.1
- `lib/categoryBlitzLetterDie.ts` — `dieStage` late-letter rule; `DIE_MID_ROUND_CUTOFF_MS` doc comment.
- `lib/categoryBlitzShared.ts` — new `roundFitsWindow(startAtMs, windowEndMs, testMode)`, new
  `ROUND_START_DRIVE_SLACK_MS`; `anotherRoundFollows(session, latestRound, scheduleWindowEndAt)` (no longer reads
  `session.scheduledEndAt`; null/undefined/unparseable → false for scheduled).
- `lib/categoryBlitz.ts` — import `roundFitsWindow`; `canFitAnother` in `driveVenueCategoryBlitz` calls it (old "keep
  in step" comment removed).
- `lib/categoryBlitzSchedules.ts` — new `openScheduleWindowEnd(schedules, now)`: first schedule with `isWindowOpen`,
  then `getCurrentOrNextScheduleWindow(...).windowEnd` — the engine's exact read.
- `app/api/category-blitz/sessions/route.ts` — computes `scheduleWindowEndAt` from the `listSchedules` result it
  already had; returned beside `nextWindowAt`.
- `lib/categoryBlitzRealtime.ts` — `scheduleWindowEndAt` state, set on every ok sessions response
  (`json.scheduleWindowEndAt ?? null`), exposed on `CategoryBlitzSessionState`.
- `components/category-blitz/CategoryBlitzGame.tsx` — `dieCountdown` passes `scheduleWindowEndAt`.
- Tests: `tests/lib.category-blitz-letter-die.test.ts`, `tests/lib.category-blitz-shared.test.ts`,
  `tests/api.category-blitz-sessions.test.ts`, `tests/components.category-blitz-letter-die-wiring.test.ts` (mock gains
  `scheduleWindowEndAt`; 7.2 tests now drive the live window; new 11.1a/b/c cases).

### 5. Facts and traps
- **`grep` without `-a` silently finds nothing in `lib/categoryBlitz.ts`** — the file contains a non-text byte, so grep
  treats it as binary. Use `grep -a`. Edit it with an encoding-tolerant tool (python with `errors='surrogateescape'`
  worked).
- The plan's 11.1a unit example ("letter at +0.2 s, now at +2.9 s → holding") doesn't hold: a letter at +0.2 s after a
  long tumble is already `done` by +2.45 s. The test uses arrival +1.0 s instead (lands +1240, holds to +3040, flies to
  +3490), which proves the same point: at +2.9 s it's `holding`, at +3.1 s `flying`, never cut by `nowMs`.
- `isWindowOpen` ignores `isActive` (`listSchedules` filters inactive rows in the query), so a route test that sets
  `isActive: false` still sees an open window. Tests close a window by moving/deleting the schedule instead.
- The engine has its own private `nextRoundStartAtMs` in `lib/categoryBlitz.ts` (~line 695), separate from the shared
  one; 11.1 did not touch it.

### 6. Build / test / verification
- Gates run 2026-10-30: `npx tsc --noEmit` clean; `npx eslint` on all touched files clean; `npm run test` 5,672 pass /
  13 skipped / 5 fail — the 4 known Bingo star-index freshness tripwires plus
  `tests/lib.sportsBingo.mlb-star-tilt.test.ts` "stops tilting when the tier boosts are turned off", which passes
  alone (15/15) and is load-sensitive, unrelated to Category Blitz. `npm run build` exit 0 (run after, not alongside,
  typecheck).
- Mutation checks (each fix reverted temporarily, files restored from a scratchpad copy and `cmp`-verified):
  11.1a revert → 2 tests fail; 11.1b route revert → 2 route tests fail; 11.1c slack removed → 6 tests fail.
- Not verified: real devices; a real partner schedule edit mid-game (Phase 12 phone pass item).

### 7. Open questions for Andrew
None new. Still parked from Phase 7: the intermission's "Next round in" copy on a final round (could reuse
`anotherRoundFollows`; ask Andrew first).

### 8. Recommended first steps for 11.2
1. Read plan §5 Phase 11.2 and `…_PHASE_9_HANDOFF.md` (where `Header raised` and the z-1110 controls came from).
2. Take the "before" Playwright screenshots first (scratchpad clone, mocked routes, never `pkill next-server`; Andrew's
   `next dev` holds `.next/dev/lock`), then add the `data-category-blitz-stage` wrapper.
3. Opus 5.5, high effort.
