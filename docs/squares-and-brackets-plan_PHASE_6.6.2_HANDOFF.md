# Squares + Brackets plan — Phase 6.6.2 handoff (finished-game screen: no board re-read loop)

Date: 2026-10-21. Plan: `docs/squares-and-brackets-plan.md` (§4 "6.6.2", finding §29 S4).

## For Andrew (plain English)

- **What changed:** after a Squares game ends, an open page used to keep re-loading the board every 5 seconds in one
  rare case (an admin void + re-grade, while the shared score copy was still old). It now checks the shared score
  once every 5 minutes and re-loads the board at most once per check.
- **Is it live?** No. Local change only; not committed by this phase, not pushed or deployed. Squares is off everywhere.
  No database change.
- **What's left:** 6.6.3, 6.6.4 (before the 6.7 rehearsal), and 6.5 part 2 (Thursday Oct 22 recording; keep the Mac awake).
- **Needs you:** nothing.

## For the next agent

1. **Next:** 6.6.3 (Opus 5.5 · medium; edits `lib/squaresSettlement.ts` `tick`; read plan §30 first), then 6.6.4
   (Sonnet 5.5 · low). Out of scope: flags, deploys, 6.7, brackets.
2. **Starting state:** branch `main`, last commit `510226a`. 6.6.2 is UNCOMMITTED (3 files below + plan edits). Unrelated
   uncommitted work (POS hunk in `CLAUDE.md`, POS docs, `lib/pos/providers.ts`, deleted `design-system/project/public/info/*.png`,
   untracked `New Folder With Items/`) is not ours: stage only our files. Recorder PID 10302 still running; don't kill it.
   No data or migration changes.
3. **Decisions:** applied as designed; none new.
4. **Files:** `components/squares/useSquaresData.ts` (the `complete` branch of `tick` now only calls `fetchScore` on
   `force` or `SQUARES_COMPLETE_POLL_MS`; `fetchScore` already re-reads the board once when revisions differ);
   `tests/squares-screen.test.ts` (new case "a board newer than the cached score does not loop (plan 6.6.2)");
   plan status/table/6.6.2 "Built" line.
5. **Traps:** the held board in the hook is a parsed copy, so a test must make the SERVER's board newer before mount
   (mutating the fixture after mount does not change what the hook holds).
6. **Verified:** `npx vitest run tests/squares-screen.test.ts` 18/18; `npx tsc --noEmit` clean; eslint clean on the two
   code files. Full `npm run test` not re-run. Not checked: the new test failing against the old code.
7. **Open questions:** none.
8. **First steps:** read plan 6.6.3 and §30, then the current `tick`; update plan + write the 6.6.3 handoff.
