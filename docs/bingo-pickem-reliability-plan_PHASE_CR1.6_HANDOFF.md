# Bingo / Pick 'Em plan — Phase CR1.6 handoff (BallDontLie season probe, F38)

**For Andrew:** the check "does this league have games coming up?" now works when there are two or more games. Before,
it always counted as failed and re-asked the provider every 5 minutes instead of every 6 hours, and the league picker
fell back to the calendar. Website only: no store release, no migration, no env var. Live when the PR merges. Nothing needs you.

**What changed**
- `lib/ballDontLieClient.ts`: `fetchBallDontLieList` takes `firstPageOnly`; it returns page 1's rows and stops, with no
  `page_limit` failure. A failed page 1 still fails. Other callers are unchanged.
- `lib/sportsBingo.ts` `hasUpcomingGamesInWindow`: uses `firstPageOnly: true` instead of `maxPages: 1`.
- New `tests/lib.sportsBingo-season-probe.test.ts`: `next_cursor` present → true, second call served from cache (one fetch,
  no warning); HTTP 500 → false. The first test fails on the old code.

**Verified:** full `npm run test` (one unrelated flaky failure on the first run, green on rerun), `npx tsc --noEmit`, `npm run lint`.
Cost: fewer provider calls (up to ~12× fewer per league when in season).

**Branch:** `fix/bdl-season-probe` from `origin/main`. **Next:** CR1.2.1 (F44, awaiting Andrew's OK), CR1.7 (after Amazon approves 1.0.0), CR2, CR3.
