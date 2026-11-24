# Phase CR1.2.1 handoff (short)

**For Andrew:** On the dedicated NFL Pick 'Em screen, a pick now stays on its game if the feed moves the kickoff, and picking again changes that one pick instead of adding a second. Not pushed or deployed yet; it ships in one PR with CR2.3, CR3 and CR3.1 from `fix/cr2-connect-privacy`.

**What changed**
- `lib/nflPickEm.ts`: new `providerIdOfNFLPickEmGameId`. `listNFLPickEmGames` finds a pick by exact id, else by provider id (canceled picks never stand in). `submitNFLPickEmPick`, when the exact id finds nothing, reads the user's NFL picks within ±21 days of the game and switches the non-canceled pick with the same provider id. Another venue's pick → "You already made a pick for this game." The lock uses the later of the stored and current start. The side-switch `update` still carries no line columns.
- `tests/lib.nfl-pickem-moved-game.test.ts` (new, 5 tests; 3 fail without the fix).

**Verified:** `npm run test` (611 files pass), eslint on touched files, `npx tsc --noEmit`, `tests/pickem-frozen-lines-contract.test.ts`. No live data check.

**State:** approved by Andrew 2026-11-25; cherry-picked onto `fix/cr2-connect-privacy` (not pushed; original local branch `fix/nfl-pickem-moved-game` can be deleted). No migration, env or cost change (one extra bounded read per new NFL pick).

**Next:** push `fix/cr2-connect-privacy` as one PR, CI, merge, deploy. CR1.6 is already done; CR1.7 waits for Amazon.
