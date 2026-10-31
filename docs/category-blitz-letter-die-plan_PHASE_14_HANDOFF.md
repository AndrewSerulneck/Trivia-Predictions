# Category Blitz letter die — Phase 14 handoff (2026-10-31)

## For Andrew (plain English)
**What changed:** a fresh code review checked the last five fixes (13.1–13.5). It found 7 possible problems. After
checking each against the code: 3 are real, 1 is probably real, and 3 aren't worth fixing (reasons below). No code
changed in this phase, only the plan. Nothing touches the database or costs anything.

**The real problems, in plain terms:**
- At the very end of a game, the "round graded" message and the "game over" message can arrive a moment apart. If they
  cross, a phone can jump from Game Over back to the last round's grading for up to 15 s (14.1a). This is older than the
  letter die, but the 13.2 fix was meant to close this kind of thing and missed it.
- If you delete tonight's game mid-round, a slow reply can briefly bring the deleted game's round back (14.1b).
- A small bookkeeping slip when you come back to the app (14.1c). Players shouldn't see it today; fixing it keeps the
  code honest.
- Probably real: on a phone whose clock is off, a new clock reading can make the start-of-round reveal pop up again
  over a board you're already typing on, for a split second (14.2).

**Is it live?** No. Committed locally on `after-app-review` only; `main` stays frozen until Apple approves.
**What's left:** Phases 14.1 and 14.2 (fixes), then Phase 15 (one more review, then your phone pass; checklist in the
plan, Phase 15).

**Questions for you (nothing is blocked on them):**
1. **Extending tonight's game mid-game.** With your choice (a) from last time, an extended window still ends the game
   at the original time. What happens next: about 2 minutes after Game Over, the game opens a fresh lobby for the extra
   time, with scores starting from zero. That already happened before; it's just clearer now. If you'd rather an
   extension really extends the same game, that's option (b) (one extra database write per schedule edit). Reply "keep
   (a)" or "switch to (b)".
2. **Optional cost saving (older than the letter die):** while continuous mode is on by default, every game poll at a
   scheduled venue checks the continuous-mode setting twice — one database read more than it needs, about 4 extra reads
   a minute per open player screen. Want it trimmed (a small separate change)? Also still open from 13.3: the TV screen
   reads the schedule twice per poll.
3. Still open from 13.5: move the round's countdown and answer deadline onto the server clock too? Not planned.

---

## For the next agent (Phase 14.1)

### 1. Next phase
Plan §Phase 14.1 (`docs/category-blitz-letter-die-plan.md`): in `lib/categoryBlitzRealtime.ts`, (a) `loadResults` and
(b) the `round_started` broadcast's `loadCurrentRound` must not write state after a session end/abandon broadcast;
(c) a visibility resync's `forceReveal` must survive its round fetch being dropped as superseded. Then Phase 14.2 (the
reveal's verdict latched per round in `CategoryBlitzGame.tsx`). Out of scope: findings 4, 5, 7 (plan §Phase 14 says
why), pushing, `main`, the double continuous-config read, the TV schedules read, the round timer on the server clock.

### 2. Starting state
Branch `after-app-review`. Code under review ends at `081cb2e3` (13.5). This phase adds one docs-only commit (plan +
this handoff). Nothing pushed or deployed. No DB, Vercel or Supabase access used; no data changed.

### 3. Decisions
- Andrew, 2026-10-30: 13-review finding 1 → option (a) (built in 13.4); finding 3 → fix now (built in 13.5).
- Same rule as every review phase: no in-place patches; each confirmed finding is a sub-phase.
- Finding 4 (die latches an unknown offset of 0) not taken: needs a clock > 3 s off AND every reading since page load
  rejected; the result is the pre-12.2 behaviour; not latching would bring back 13.1a's mid-bounce vanish.
- Finding 7 (route + engine both resolve the continuous config) not taken as a fix; the cost note is Andrew's question 2.
- Finding 5 (extension → new lobby after Game Over) is Andrew's question 1; pre-existing, 13.4 doesn't cause it.

### 4. Files (what the fixes touch)
- `lib/categoryBlitzRealtime.ts`: `supersedeInFlightLoads` (~570, bumps `loadSeqRef` and sets `appliedLoadSeqRef`),
  `loadCurrentRound` (~576, `superseded()` on `loadSeq`), `loadSession` (~622; clears `forceRevealPendingRef` at ~673
  on apply), `loadResults` (~748, no guard; calls `settlePhase(roundId, "results")`), `settlePhase` (~423) →
  `enterResultsOrReveal` (~397, sets `reveal`/`results`, no phase guard), broadcast handlers (~945–1000: `round_started`
  calls `loadCurrentRound(sessionIdRef.current)` without `loadSeq`; `round_scored` calls `loadResultsRef.current`;
  `session_ended` / `continuous_session_ended` / `session_abandoned` call `supersedeInFlightLoads()`).
- `components/category-blitz/CategoryBlitzGame.tsx`: `revealElapsedMs` / `showReveal` (~2468–2478), elapsed-time
  fallback effect (~2490–2511, calls `markRevealDone` but NOT `setFinishedRevealRoundId`), die flight sets
  `finishedRevealRoundId` (~2585), watchdog with `serverClockOffsetRef` (~2600–2630), `modeFlipCue` (~2637).
- Tests to extend: `tests/lib.category-blitz-session-load-order.test.ts` (14.1),
  `tests/components.category-blitz-letter-die-wiring.test.ts` and `tests/category-blitz-letter-die-contract.test.ts`
  (14.2; the contract pins `serverClockOffsetMs` named exactly 7 times in the game).

### 5. Facts and traps
- Why 14.1a is realistic: `driveVenueCategoryBlitzWithSchedules` (`lib/categoryBlitz.ts`) scores an expired round
  (`scoreExpiredRoundForVenue` → `round_scored` broadcast) and, in the same request, ends the session when no round fits
  (`endSession` → `session_ended`). The two broadcasts land a few hundred ms apart; `loadResults`' fetch spans that.
- Don't guard `loadResults` with `appliedLoadSeqRef`: it moves on every applied poll and would drop legitimate
  `round_scored` results. Use a counter that only `supersedeInFlightLoads` moves (the plan's suggestion), or argue a
  better one in the 14.1 handoff.
- Don't make `settlePhase`/`enterResultsOrReveal` refuse to leave `complete` without checking every path: a recently
  completed session and a new session's lobby both pass through `loadSession`.
- 14.1c is masked today by the game's elapsed-time fallback (marks the reveal done once the round is > 3 s old). A test
  for it must drive the hook directly (as the load-order tests do), not the game.
- From 13.5: `stallDieFrames()` is restored at the end of each wiring test, not in `afterEach`; a failing assertion
  before the restore leaks into later tests — read the first failure only. Framer animations never complete under fake
  timers; don't wait for `RoundStartReveal`'s `onDone`.
- `lib/categoryBlitz.ts` has non-UTF-8 bytes (use `grep -a`). Don't run `tsc` and `npm run build` at once.
- The `/code-review` skill ran as a forked review of `2899a9d6..HEAD`; its raw output is summarised in plan §Phase 14.

### 6. Build / test / verified
Commands: `npx tsc --noEmit`; `npx eslint <files>`; `npm run test` (expect only the 4 known Bingo star-index freshness
failures); `npm run build` (not concurrently with tsc). This phase changed docs only, so no gates were re-run; the code
state is exactly 13.5's (verified in the 13.5 handoff: tsc clean, tests 5,743 pass minus the 4 known, build ok). Each
finding was checked by reading the cited code paths, not by running a reproduction.

### 7. Open questions for Andrew
Extension behaviour (keep (a) / switch to (b)); the optional double continuous-config read trim; the TV double schedules
read (from 13.3); the round timer on the server clock (from 13.5). None blocks 14.1 or 14.2.

### 8. First steps for Phase 14.1
Read plan §Phase 14.1 and the hook's broadcast handlers and `loadResults`; write the failing tests first (the
`round_scored` → `session_ended` race is the important one); add the epoch counter; fix `forceReveal`; run the gates;
mutation-check; commit on `after-app-review`; write `…_PHASE_14.1_HANDOFF.md`; update the status line. Opus 5.5, high.
