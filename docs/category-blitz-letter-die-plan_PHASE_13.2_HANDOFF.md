# Category Blitz letter die — Phase 13.2 handoff (2026-10-31)

## For Andrew (plain English)
**What changed:** the game no longer mixes up the order of the answers it gets back from the server.
- If a quick check fails while a slower one is still on its way, the slower good answer now still shows, and the
  "couldn't connect" message clears straight away. Before, the error could stay up for 15 seconds.
- When the game ends (or you stop or delete it), an answer that left the server just before can no longer put the
  finished game back on screen.
- If two round lookups come back in the wrong order, the newer round wins.

**Is it live?** No. Committed locally on `after-app-review` only. Not pushed; `main` stays frozen until Apple approves.
**Cost:** zero. No new requests, reads or writes.
**What's left:** 13.3, 13.4, 13.5, then Phase 14 (one more review, then your phone pass).
**Needs you:** nothing.

---

## For the next agent (Phase 13.3)

### 1. Next phase
Phase 13.3 in `docs/category-blitz-letter-die-plan.md`: (a) one schedules read per poll (`driveVenueCategoryBlitz`
returns the schedules / open window it read; the sessions route drops its own `listSchedules`; keep every existing
caller's return type working — check each caller), (b) `runCategoryBlitzEngine` passes `session.testMode` to
`nextRoundStartAtMs`, (c) reword the stale `compactChrome` comment in `CategoryBlitzGame.tsx`. Then 13.4, 13.5, each its
own sub-phase, handoff and local commit. **Out of scope:** pushing, merging to `main`, the round timer on the server
clock, option (b) for finding 1.

### 2. Starting state
- Branch `after-app-review`. The 13.2 commit sits on `e80f1520` (13.1), `7d96d774` (Phase 13 docs), `2899a9d6`
  (Phases 1–12.3). Nothing pushed or deployed. No database, Supabase, Vercel or production access used; no data changed.

### 3. Decisions made
- Andrew's earlier answers stand (finding 1 → (a) = Phase 13.4; finding 3 → fix now = Phase 13.5).
- 13.2a: a failed reply is dropped only if a newer reply has already been applied (`seq < appliedLoadSeqRef.current`);
  otherwise it shows its error and counts toward the error streak, but never moves the seq. Same rule in the `catch`.
- 13.2b: the three broadcasts (`session_ended`, `continuous_session_ended`, `session_abandoned`) call
  `supersedeInFlightLoads()` = `appliedLoadSeqRef.current = ++loadSeqRef.current`. `session_abandoned` does it BEFORE
  its own `loadSessionRef.current()` reload, which takes a newer number and so still applies.
- `loadCurrentRound(sessionId, { forceReveal?, loadSeq? })`: with `loadSeq`, it skips `applyRound` (and the follow-up
  `loadResults`) once a newer reply has been applied. The `round_started` broadcast still calls it without a seq
  (unsequenced, unchanged on purpose — a new round broadcast is fresh information).
- A pending visibility `forceReveal` is not cleared by a broadcast; the next applied good reply consumes it as before.

### 4. Files changed
- `lib/categoryBlitzRealtime.ts`: `supersedeInFlightLoads` (stable `useCallback`, added to the realtime effect's deps);
  `loadCurrentRound`'s `loadSeq` option + `superseded()` check; `loadSession` moves `appliedLoadSeqRef` only after the
  `ok` check and no longer in the `catch`; the three broadcast handlers call `supersedeInFlightLoads()`.
- `tests/lib.category-blitz-session-load-order.test.ts`: `@/lib/supabase` is now a fake realtime client (vi.hoisted)
  whose `.on("broadcast", { event }, cb)` handlers a test can fire; `current-round` fetches can be held (`roundHeld`).
  New tests: 13.2a ×2, 13.2b ended broadcasts ×2 (`it.each`), abandoned ×1, round fetch out of order ×1, round fetch
  in flight at session end ×1.

### 5. Facts and traps
- The existing contract test (`tests/category-blitz-letter-die-contract.test.ts`, "12.2") still greps for
  `if (seq < appliedLoadSeqRef.current) return;` — that line was kept.
- Testing the abandoned case: the stale poll must land BEFORE the reload, or it is dropped by the reload's own higher
  seq and the test can't see a missing supersede.
- `lib/categoryBlitz.ts` contains a non-text byte: use `grep -a` (relevant to 13.3/13.4).
- Don't run `tsc` and `npm run build` at the same time (`.next/types`).

### 6. Build / test (2026-10-31, sequential)
`npx tsc --noEmit` clean; `npx eslint` clean on both touched files; `npm run test` 5,726 pass / 13 skipped / 4 fail (only
the 4 known Bingo star-index freshness tripwires); `npm run build` succeeded. Mutation checks (each reverted after):
seq moved before the `ok` check → 13.2a fails; no supersede on the ended broadcasts → 3 tests fail; no supersede on
abandoned → abandoned test fails; `superseded()` always false → both round-fetch tests fail. `/verify`'s browser steps
were not run (they seed the shared production DB). Not verified: real device or browser.

### 7. Open questions
None.

### 8. First steps for Phase 13.3
1. Read plan §Phase 13.3. 2. `grep -an "driveVenueCategoryBlitz(" app lib tests` to list every caller before changing its
return. 3. Fix 13.3b (`session.testMode`) with a test-mode cron test. 4. Reword the comment. 5. Gates, mutation-check,
commit locally, write `…_PHASE_13.3_HANDOFF.md`, update the status line. Model: Sonnet 5.5, effort medium (plan table).
