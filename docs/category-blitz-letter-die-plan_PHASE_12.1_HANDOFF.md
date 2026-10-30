# Category Blitz letter die — Phase 12.1 handoff (2026-10-30)

## For Andrew (plain English)

**What changed:** the game screen and the server now agree on when tonight's scheduled Category Blitz ends.

1. If a partner **extends** tonight's window mid-game, the letter die no longer tumbles over the final scores. The
   game still ends at the session's original end time, so the screen now uses whichever end comes first.
2. The overnight scheduler now uses the same "does another round fit?" rule and the same "which window is open?"
   lookup as the rest of the game. A test proves that for every real schedule this gives exactly the same answer as
   before, so real games behave the same. Only test-mode games (a developer switch) see a difference: the scheduler
   now knows their rounds are 30 seconds long.

**Is it live?** No. All the letter-die work (Phases 1–12.1) is still uncommitted on `after-app-review`. No database
change, no new requests, no cost change.

**What's left:** Phase 12.2 (phone clock set wrong; an old server reply bringing back an old end time), Phase 12.3
(fewer screen redraws as the categories slide in), then Phase 13 (one more review and your phone pass).

**Needs you (information only, not blocking):**
- When a partner extends tonight's window mid-game, the game still ends at the **old** time. This was already true
  before; 12.1 only stops the die from covering the final scores. Say so if you want extensions to take effect
  mid-game.
- In test mode, the overnight scheduler still waits the full-length break (3 minutes) between rounds rather than the
  test-mode 10 seconds. A code comment says this is deliberate. It only matters when nobody has the game open in test
  mode. Say so if you want it changed.

---

## For the next agent (Phase 12.2)

### 1. Next phase
Phase 12.2 in `docs/category-blitz-letter-die-plan.md` (§5, "Phase 12.2"): 12.2a (a phone clock more than 3 s ahead of
the server skips every landing; recommended fix: `serverNow` on the sessions response and a clock offset used **only**
by the die's lateness check), 12.2b (a slower, older `loadSession` response can restore an old `scheduleWindowEndAt`;
add a request sequence number). Opus 5.5, high. Then 12.3 (Sonnet 5.5, medium), then Phase 13.
**Out of scope:** changing when the engine closes a session, the cron's test-mode cadence (below), merging (`main` is
frozen until Apple approval), the venue TV, the "Next round in" copy on a final round (parked since Phase 7).

### 2. Starting state
- Branch `after-app-review`, last commit `c3ecdb8a`. All letter-die work (Phases 1–12.1) is **uncommitted**; nothing
  pushed or deployed. No data, migration or production access was used.

### 3. Decisions made in 12.1 (and why)
- **12.1a:** `anotherRoundFollows` judges the fit against `min(liveWindowEnd, session.scheduledEndAt)`. A null/missing
  live window is still `false` (the frozen end never stands in for it). A null or unparseable `scheduledEndAt` →
  live window alone. Engine behaviour unchanged (out of scope, per the plan).
- **12.1b:** proved that the cron's old `nextOccurrence + windowMinutes` equals
  `getCurrentOrNextScheduleWindow(...).windowEnd` for an open window **for every stored row**. Why: both use the same
  occurrence (`nextOccurrence` is `getCurrentOrNextScheduleWindow(...).windowStart`); the shared lookup's end is
  `windowStart + max(1, windowMinutes)` for recurring schedules and `endTime` for one-offs, and `toSchedule` derives
  `endTime = startTime + max(1, window_minutes)`. The column is `int not null check (window_minutes >= 1)` (migration
  `20260701041000_expand_category_blitz_window_minutes.sql`), so `max(1, …)` is a no-op. They could only differ for a
  hand-made object with `windowMinutes < 1` or an inconsistent `endTime`, which no DB row can produce. So the cron now
  uses the shared lookup too (12.1c). Test covers one-off, daily crossing local midnight (New York), weekly crossing
  midnight (Los Angeles) and a window across the 2026-11-01 clock change.
- **12.1b, deliberately NOT changed:** the cron's cadence check `nextRoundStartAtMs(latest, false)`
  (`lib/categoryBlitz.ts`, the step-3 loop) still ignores `testMode`. The plan only asked for the fit check, and
  `TEST_MODE_SECONDS`'s doc comment in `lib/categoryBlitzShared.ts` says test-mode timing is "never applied to the
  cron-driven engine". I briefly changed it and reverted it. Real sessions are unaffected either way. Recorded as an
  information item for Andrew above.
- **12.1c:** new `openScheduleWindow(schedules, now) → { schedule, occurrence } | null`. It computes each schedule's
  occurrence once (no `isWindowOpen` + second `getCurrentOrNextScheduleWindow` call) and returns the first open one, the
  same as the old `schedules.find(isWindowOpen)`. `driveVenueCategoryBlitz`'s redundant second "is it really open"
  guard on the create path was removed (the helper guarantees it; its log line is merged into the "no open schedule
  window" one).

### 4. Files changed in 12.1
- `lib/categoryBlitzShared.ts` — `anotherRoundFollows`: session param now requires `scheduledEndAt: string | null`;
  min() of live and frozen ends; doc comment rewritten (it used to say `scheduledEndAt` is never read).
  `roundFitsWindow`'s doc names both engines as callers.
- `lib/categoryBlitzSchedules.ts` — new `openScheduleWindow`; `openScheduleWindowEnd` (used by
  `app/api/category-blitz/sessions/route.ts`, unchanged) is now a one-line wrapper. Imports the
  `CategoryBlitzWindowOccurrence` type.
- `lib/categoryBlitz.ts` — `driveVenueCategoryBlitz` and `runCategoryBlitzEngine` both use `openScheduleWindow`; the
  cron's fit check is `roundFitsWindow(now, windowEnd, session.testMode)`. Removed now-unused imports
  (`getCurrentOrNextScheduleWindow`, `ROUND_DURATION_SECONDS`, `isWindowOpen`, `nextOccurrence`).
- `components/category-blitz/CategoryBlitzGame.tsx` — comment only (the `dieCountdown` block cites 12.1a). The call
  site already passed the full `session`, so no code change.
- Tests: `tests/lib.category-blitz-shared.test.ts` (fixtures gain `scheduledEndAt: null`; four 12.1a cases),
  `tests/components.category-blitz-letter-die-wiring.test.ts` (the finding's scenario: window extended, frozen end
  before the next round's end → no die), `tests/lib.category-blitz-schedule-time.test.ts` (`openScheduleWindow`
  equality proof over 4 schedules × 4 probe times, null cases, first-open-wins),
  `tests/lib.category-blitz-engine.test.ts` (rounds mock now answers `getLatestRound` and counts reads; two 12.1b cron
  cases two minutes before the window end: test-mode passes the fit check, real mode doesn't).

### 5. Facts and traps
- `lib/categoryBlitz.ts` contains a non-text byte: `grep` needs `-a`, and Python edits must read/write **bytes** (a
  latin-1 round trip breaks matching on `—`).
- Test fixtures for one-off schedules (`recurringType: "none"`) must keep `endTime` = `startTime + windowMinutes`: the
  occurrence's end comes from `endTime`, not `windowMinutes`. `makeSchedule`'s default `endTime` in
  `tests/lib.category-blitz-schedule-time.test.ts` is 07:20Z, so overriding only `startTime` makes a closed window.
- Mutation check: the `now < occurrence.windowEnd` half of `openScheduleWindow`'s open test is an equivalent mutant
  (`getCurrentOrNextScheduleWindow` never returns an occurrence whose end has passed). The `windowStart <= now` half is
  the load-bearing one and is caught.

### 6. Build / test (all run 2026-10-30, sequentially)
- `npx tsc --noEmit` clean. `npx eslint` on the 8 touched files clean.
- `npm run test`: 5,695 pass / 13 skipped / 4 fail — only the 4 known Bingo star-index freshness tripwires
  (`tests/lib.sportsBingo.{mlb,nfl}-star-index{,-freshness}.test.ts`).
- `npm run build` exit 0.
- Mutation checks (each restored from a scratchpad copy, verified with `cmp`): 12.1a min() removed → 2 tests fail
  (unit + wiring); cron fit with `false` → the test-mode cron test fails; `openScheduleWindow` iterating reversed →
  first-open-wins fails; start guard dropped → 2 tests fail.
- Not verified: anything on a device or against real schedules (no production access used). Phase 13's phone pass
  covers "partner extends tonight's window mid-game".

### 7. Open questions for Andrew
- (Information only) Extending tonight's window mid-game still ends the game at the old time. Keep?
- (Information only) Cron test-mode cadence (above). Keep?
- (Carried over, optional) May the letter-die work be committed on `after-app-review` (local only) so Phase 13 reviews
  an exact diff?

### 8. First steps for Phase 12.2
1. Read the plan's Phase 11.1a and 12.2 sections and `docs/category-blitz-letter-die-plan_PHASE_11.1_HANDOFF.md`.
2. 12.2b first (smaller): add a per-call sequence ref in `loadSession` (`lib/categoryBlitzRealtime.ts`, the
   `scheduleWindowEndAt` write); decide whether `setSession` gets the same guard and record it.
3. 12.2a: choose between `serverNow` + offset (recommended) and the capped latched-tumble exemption; record why. The
   sessions route's `now` is already in scope next to `scheduleWindowEndAt`.
4. Gates, mutation checks, then `…_PHASE_12.2_HANDOFF.md` and the status line.
