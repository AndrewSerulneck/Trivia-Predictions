# Squares + Brackets plan — 10.5.4 handoff (2026-10-21)

Plan: `docs/squares-and-brackets-plan.md` (§4 10.5.4, finding §22 R8).

## For Andrew (plain English)
- **What changed:** if the bracket screen saves a draft and the server says "no" for good (picks locked, not open,
  invalid picks), a second save waiting behind it no longer sends the same draft again. Fewer wasted requests, and the
  message isn't shown twice. A dropped connection still retries as before.
- **Live?** Built and tested, **not committed or deployed**. No database change. Brackets are still off.
- **Also:** migration `20261021134157` (10.5.2) is now applied by you via `supabase db push`.
- **Left:** all of 10.5.x is done. Next is the 10.6 replay rehearsal (needs this deployed first).

## For the next agent
1. **Goal:** 10.6 replay rehearsal (Opus 5.5 · high), plan §4 10.6. Out of scope: 6.5/6.6 Squares work, launch (10.8).
2. **State:** branch `main`, last commit `caf9dcd` (10.5.3). Uncommitted and mine: `components/bracket/BracketEditor.tsx`,
   `tests/bracket-screen.test.ts`, the plan status line, this file. Not mine (leave out of commits): `CLAUDE.md` POS hunk,
   `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`, deleted
   `design-system/project/public/info/*.png`, untracked `New Folder With Items/`, `tests/fixtures/squares/nfl-live-capture-1392308.json`.
   All bracket migrations through `20261021134157` are applied.
3. **Decision:** only a *waiter* (a caller that waited on an in-flight send) skips a re-send of a refused version; a fresh
   caller with the same unchanged version still sends. A new pick moves the version, so it sends again.
4. **Change:** `persist()` in `components/bracket/BracketEditor.tsx` — `refusedVersionRef` set on any non-network failure
   (cleared on a network failure), checked after the wait loop. Tests added in `tests/bracket-screen.test.ts`
   (new `entryNetworkFails` option on `installFetch`): refused + waiter → 1 request; network failure + waiter → 2.
5. **Traps:** don't run `tsc` and `build` together; never `git checkout -- file`.
6. **Verified:** `npx vitest run tests/bracket` 159/159; `tsc --noEmit` and eslint clean. Full `npm run test` not run.
7. **Open:** commit/push/deploy of 10.5.4 (Andrew's call).
8. **First steps:** run `npm run test`, commit only the bracket files, deploy, then start 10.6 per plan.
