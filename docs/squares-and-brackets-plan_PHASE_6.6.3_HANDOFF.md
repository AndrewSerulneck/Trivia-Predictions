# Squares + Brackets plan — Phase 6.6.3 handoff (settlement keeps paying; rehearsal points only at hidden venues)

Date: 2026-10-21. Plan: `docs/squares-and-brackets-plan.md` (§4 "6.6.3", findings §29 S5 + S6).

## For Andrew (plain English)

- **What changed:** (1) After a Squares game's 3-hour watch ends, the minute-by-minute job used to stop checking
  whether anything was still owed, so a failed points/prize payment was never retried. It now checks once an hour
  (three small reads, normally empty). (2) A rehearsal now pays venue points only at hidden venues, the same rule
  Prizes already had. A rehearsal win at a venue that has become visible is held back with a note in the admin panel.
- **Is it live?** No. Local change only, not committed, pushed or deployed. Squares is off everywhere. No database change.
- **Cost:** about 72 extra small reads a day while a finished game is still the current event (until Feb 15), zero
  in season for the venue check.
- **What's left:** 6.6.4 (tidy-ups), then 6.5 part 2 (Thursday Oct 22 recording) and the 6.7 rehearsal.
- **Needs you:** nothing. 6.6.2 was committed as `0517f18`.

## For the next agent

1. **Next:** 6.6.4 (Sonnet 5.5 · low; plan §4 "6.6.4", §29 S8/S9): move a misplaced doc block in
   `lib/liveTriviaRankedRewards.ts`; one "blocked result" filter helper in `lib/squaresAdmin.ts`. No behaviour change.
   Out of scope: flags, deploys, migrations, 6.7, brackets.
2. **Starting state:** branch `main`, last commit `0517f18` (6.6.2). 6.6.3 is UNCOMMITTED: `lib/squaresSettlement.ts`,
   `lib/squaresStore.ts`, `lib/squaresPrizeAwards.ts`, `tests/squares-settlement.test.ts`, `docs/squares-and-brackets-plan.md`,
   this file. Unrelated uncommitted work is NOT ours (POS hunk in `CLAUDE.md`, `docs/pos-rewards-integration-plan.md`,
   `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`, deleted `design-system/project/public/info/*.png`,
   untracked `design-system/project/public/info/New Folder With Items/`) — stage only Squares files. The 6.5 recorder
   (PID 10302 per the 6.6.2 handoff) may still be running; don't kill it. No data changes.
3. **Decisions:** applied as the plan designed. Small calls made here: a venue missing from the venues read counts as
   not hidden (blocked, fail closed); a failed venues read pays nothing that run (error `unpaid venues read: …`); the
   `[Squares] no-final-deadline` warning now sits inside the idle minute-0 branch (unchanged timing).
4. **Files:**
   - `lib/squaresStore.ts` — new `readHiddenVenueIds(venueIds)` → `StoreResult<Set<string>>`, chunked by `chunkIds`.
   - `lib/squaresPrizeAwards.ts` — uses it (was an inline loop); the three "retried next run" comments + COST note fixed.
   - `lib/squaresSettlement.ts` — `tick`: when idle, at `getUTCMinutes() === 0` runs `settleSquaresWinners` then returns
     the idle `skipped` reason (no feed request). `payUnpaidSquaresResults(event: {id, purpose}, report)` (was an id):
     for `rehearsal` the select embeds `board:squares_boards!inner(venue_id)`, reads venues once, and routes visible-venue
     rows through the existing block path with `SQUARES_REHEARSAL_VISIBLE_VENUE_NOTE`. Callers: `settleSquaresWinners`
     only (admin calls `settleSquaresWinners`).
   - `tests/squares-settlement.test.ts` — idle tests moved to minute 7 (06:07 / 12:07) since minute 0 now settles; new:
     hourly retry (minute 7 reads only the event; 07:00 pays, no feed request, no venues read), rehearsal visible vs
     hidden, venue missing from the read, Super Bowl reads no venues.
5. **Traps:** the test fake ignores `select()` arguments, so embedded `board` must be seeded on the row; `io.selects`
   records reads by table. Any test tick at minute 0 after the watch now settles — pick a non-zero minute for idle checks.
6. **Verified:** `npx vitest run tests/squares-settlement.test.ts` 24/24; all Squares/prize-sweep/postgrest tests 232/232;
   full `npm run test` 5,244 pass / 13 skip / 0 fail; `npx tsc --noEmit` clean; eslint clean on the four files.
   Not checked: the new tests failing against the old code (by reading: the old idle return made no settle reads).
7. **Open questions:** none.
8. **First steps:** commit 6.6.3 (Squares files only), then read plan 6.6.4 and do it; update the plan + write the
   6.6.4 handoff.
