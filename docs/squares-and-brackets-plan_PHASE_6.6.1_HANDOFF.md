# Squares + Brackets plan — Phase 6.6.1 handoff (a leftover event never blocks the season)

Date: 2026-10-21. Plan: `docs/squares-and-brackets-plan.md` (§4 "6.6.1", as built §30, findings §29 S1/S2).

## For Andrew (plain English)

- **What changed:** if the December test game is still sitting there when the Super Bowl window opens on Feb 1, the
  system now clears it away by itself and sets up the real Super Bowl board within about 15 minutes. The same goes
  for last year's Super Bowl next season. An admin can also archive an old season's Super Bowl at any time now, and
  can't accidentally start a new test game during the Super Bowl window.
- **Is it live?** No. Committed on this Mac only; not pushed or deployed. Squares is still switched off everywhere.
  No database change.
- **What's left:** 6.6.2, 6.6.3, 6.6.4 (all before the December rehearsal, 6.7), and 6.5 part 2 (Thursday's recording).
- **Needs you:** nothing for 6.6.1. Keep the Mac awake Thursday evening (Oct 22) for the 6.5 part 2 recording.

## For the next agent

### 1. Next phase
6.6.2 (Sonnet 5.5 · low, `components/squares/useSquaresData.ts`), 6.6.3 (Opus 5.5 · medium, edits `tick` again —
read §30 first), 6.6.4 (Sonnet 5.5 · low). Designs are in the plan under each heading. Out of scope: flags, deploys,
the 6.7 rehearsal, brackets.

### 2. Starting state
- Branch `main`. 6.6.1 is one local commit on top of `3d88939` (it also carries the 6.6 review docs, which were
  uncommitted). Not pushed: `origin/main` = `4facaac`.
- Uncommitted work that is NOT ours (never commit it with Squares work): the POS hunk in `CLAUDE.md`,
  `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`, the deleted
  `design-system/project/public/info/*.png`, the untracked `design-system/project/public/info/New Folder With Items/`.
  Stage `CLAUDE.md` hunk by hunk.
- Data: untouched, no migration. No Squares events in production. `NEXT_PUBLIC_SQUARES_ENABLED` /
  `SQUARES_REHEARSAL_ENABLED` unset in every Vercel environment.
- Recorder PID 10302 (capture `1392309`, kickoff 2026-10-23T00:15Z) is still running. Don't kill it.

### 3. Decisions
- Applied as designed in the plan; no new questions for Andrew.
- The stale archive also runs on an admin "Run now" when the mode is `season` (the plan said "season mode only"; a
  forced run in season mode is still season mode). A forced run with no mode (rehearsal switch off, outside the
  window) never archives.
- The admin-log action is `archive` (same as a manual archive, so the panel reads it the same way), actor `auto`.
- Discovery after the archive keeps its 15-minute throttle, so the Super Bowl event may appear up to 14 minutes after
  the archive. Not worth a special case.

### 4. Files changed
- `lib/squares.ts`: `isStaleSquaresEvent(event, season)`.
- `lib/squaresSettlement.ts`: `tick` (stale check right after `getCurrentSquaresEvent`), new `archiveStaleEvent`.
- `lib/squaresAdmin.ts`: `squaresArchiveRefusal` takes `season`; `create_from_game` refuses a rehearsal in season mode.
- Tests: `tests/squares-settlement.test.ts` (new describe "a leftover event (plan 6.6.1)", imports
  `runSquaresAdminAction`), `tests/squares-engine.test.ts` (archive-refusal objects gain `season`; two new cases).
- Docs: plan status line, Phase 6 table row, 6.6.1 "Built", 6.9 wording, new §30; `CLAUDE.md` Squares 6.2 bullet.

### 5. Facts and traps
- `squaresSeason()` lives in `lib/squaresSettlement.ts`, not `lib/squares.ts`; the predicate takes the season as an
  argument to stay pure.
- The settlement test mock's `update().eq().is().select()` returns the matched rows, which `archiveStaleEvent` uses
  to log only once. The mock does not model the `squares_events_one_current` unique index.
- The admin test fakes only `Date` (`vi.useFakeTimers({ toFake: ["Date"] })`), because `runSquaresAdminAction` reads
  `new Date()` for the mode.
- 6.6.3 will add an hourly idle settle in `tick` after `idleReason`; the stale check sits earlier and does not interact.

### 6. Build / test
`npx tsc --noEmit` clean; `npx eslint` on the five changed files clean; `npm run test` 5,239 passed / 13 skipped
(428 files). No SQL touched, so `npm run test:squares-sql` was not run. Not verified: a real season-mode run against
the database (none possible before Feb 1 without the flag; the 6.7 rehearsal runs in rehearsal mode, which never
archives).

### 7. Open questions for Andrew
None.

### 8. Recommended first steps
1. 6.6.2 is independent: read the plan's 6.6.2 section and `useSquaresData.ts` ~line 152.
2. For 6.6.3, read §30 and the current `tick`, then follow the plan's 6.6.3 design.
3. After each sub-phase update its plan section, the status line and table row, and write its handoff.
