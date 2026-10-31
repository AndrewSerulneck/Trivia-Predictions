# Category Blitz letter die — Phase 14.1a handoff (2026-10-31)

## For Andrew (plain English)
**What changed:** after the last round, Game Over now stays up. Before, if the "round graded" and "game over" messages
crossed, a phone could jump from Game Over back to that round's grading for up to 15 seconds. That can no longer happen,
whether the grading came from the realtime message, a poll, or the phone's own "score this round" request.

**Is it live?** No. Committed locally on `after-app-review`; `main` stays frozen until Apple approves.
**Cost:** zero (no new requests; late replies are just ignored).
**What's left:** only your phone pass (plan Phase 15). The other review items (14.1b, 14.1c, 14.2) stay skipped, as you
decided.
**Needs you:** nothing.

---

## For the next agent

### 1. Scope
This was the only item Andrew asked for out of Phase 14's findings (14-review finding 1 = plan §14.1a). 14.1b
(`round_started`'s fetch after an abandon), 14.1c (`forceReveal` lost on a dropped fetch) and 14.2 (reveal verdict latch)
are skipped by Andrew, 2026-10-31 — don't build them unless he asks. Next: Andrew's phone pass (plan Phase 15).

### 2. Starting state
Branch `after-app-review`, on top of `af21b2e7` (docs: the skip). Not pushed or deployed. No DB, Vercel or Supabase access.

### 3. Decisions
- Andrew, 2026-10-31: skip 14.1–14.2, then "just fix" the Game Over flip-back (14.1a only).
- The guard is a separate counter, not `appliedLoadSeqRef`: that one moves on every applied poll and would drop a good
  `round_scored` result whenever a poll landed mid-fetch (pinned by a test).
- This tab's own POST /score is guarded too (both its success and its failure branch, which would otherwise set
  `scoring`): it is the same race when a poll's drive scores and ends the session first.

### 4. Files changed
- `lib/categoryBlitzRealtime.ts`: new `sessionEndEpochRef` (next to `appliedLoadSeqRef`), incremented only in
  `supersedeInFlightLoads` (called by `session_ended`, `continuous_session_ended`, `session_abandoned`). `loadResults` and
  `triggerScoringRef.current` capture it before their fetch and skip every state write if it changed.
- `tests/lib.category-blitz-session-load-order.test.ts`: a `resultsHeld` queue for `/results` and `/score`; four 14.1a
  tests (round_scored fetch → session_ended → Game Over stays; the poll's results fetch for a completed round, same; an
  ordinary poll mid-fetch still lets the result through (`reveal`); this tab's own score POST → session_ended → Game Over
  stays). The fake realtime handlers now accept a message argument.

### 5. Facts and traps
- Why it happens: `driveVenueCategoryBlitzWithSchedules` (`lib/categoryBlitz.ts`) can score the last round
  (`round_scored`) and end the session (`session_ended`) in one request, a few hundred ms apart.
- `npx tsc --noEmit` reports `Duplicate identifier` errors only in `.next/types/* 2.ts` — iCloud duplicate copies of
  generated, git-ignored files. Not project code; every real file typechecks. Deleting those ` 2` files clears it.

### 6. Verified
`npx tsc --noEmit` clean apart from the iCloud duplicates above; eslint clean on both files; `npm run test`: 5,748 pass /
13 skipped / 4 fail (the 4 known Bingo star-index freshness tripwires only); `npm run build` exit 0. Mutation checks
(reverted): no epoch bump → the 3 Game Over tests fail; epoch moved on every applied poll → the ordinary-poll test fails.
No browser/device check — that is the phone pass.

### 7. Open questions for Andrew
From Phase 14 (none blocking): extension behaviour (keep (a) / switch to (b)); the double continuous-config read; the TV
double schedules read; the round timer on the server clock.

### 8. Next steps
Andrew's phone pass (plan Phase 15 checklist), then merge `after-app-review` to `main` only after Apple approval.
