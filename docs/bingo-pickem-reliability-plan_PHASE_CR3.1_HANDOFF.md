# Pick 'Em CR3.1 handoff (F67)

**For Andrew:** Fixed: on the Pick 'Em list, a slow reply for a sport or day you'd already left can no longer replace
the games you're looking at. Display only; no picks, points or data touched. Not live yet: committed locally on
`fix/cr2-connect-privacy` with CR2.3 and the CR3 docs, waiting for the batch push. Needs you: OK to push that branch as one PR.

**Changed:**
- `components/pickem/PickEmGameList.tsx` `loadGames`: `currentKeyRef` (sport:day on screen) and `normalLoadSeqRef`
  (newest player-asked load). A reply or error is dropped if its sport:day no longer matches, or a newer asked load
  replaced it; only the newest asked load clears the spinner. A background poll for the same sport/day is kept. The
  5 s recheck timer skips its reload if the sport/day changed (instead of a separate clear: a clear on date change
  would also kill the recheck after the server serves another day, R9).
- `tests/components.pickem-fresh-recheck.test.ts`: new F67 race test; fails without the fix, passes with it.

**Verified:** `npm run test` (618 files pass), `npm run lint`, `npx tsc --noEmit` all clean. No browser test.
**Branch:** deviated from the plan's `fix/pickem-stale-reply`: stayed on `fix/cr2-connect-privacy` so the batch is one
PR (with CR2.3, CR3 docs and `2fc94b8e`, which Andrew OK'd). **Next:** push, one PR, `gh pr checks <n> --watch`, merge.
