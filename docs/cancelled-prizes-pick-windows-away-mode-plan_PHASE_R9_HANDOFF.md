# Phase R9 handoff: auto-open waits for a real location; pick ahead snaps back on the server (2026-11-10)

## For Andrew (plain English)

- **What changed:**
  1. Tapping a push for a bar you're standing in no longer opens it "view-only" by itself when the phone's location check
     fails or times out. Before, the failed check left the list empty, so the app thought you were away. Now it opens a bar
     by itself only after a real location check says you're out of range. If you tap Retry and it then succeeds, it still
     opens. "Your bars" stays listed after a failed check so you can still open one yourself.
  2. Pick 'Em: a link to a future day for a sport with no pick window now goes straight to today. The server decides, so the
     app makes one request instead of two (it used to ask for the future day, then today). Switching sports no longer leaves
     the next-day arrow on, and a brief settings failure during a background refresh no longer bounces you to today.
- **Live?** No. Code and tests only: uncommitted, not deployed, no database change. Held for Phase R like the rest.
- **Cost:** no new requests or provider calls; the deep-link case makes one fewer provider call.
- **Needs you:** nothing. Next is R10 (one "at the bar" rule, 16-minute lease).

## For the next agent

### 1. Next phase: R10, and what is out of scope
R10 = "One 'at the bar' rule for Category Blitz and every write" (plan §7, Phase R10, finding 8; Q8 default: one rule, lease
becomes 16 minutes). Read its spec and `lib/venuePresence.ts` (`isVenuePresenceLive`, ~716). Out of scope: everything R9 touched
(`awayAutoOpenTarget`, `clampToPickAhead`, `PickEmGameList` day logic), R8's pick-line code, Q7. After R10, Phase R resumes
(review, Andrew's go-ahead for `supabase db push`, commit, deploy, CLAUDE.md / SYSTEM_CONTEXT.md updates).

### 2. Starting state
Branch `main`, last commit `40d47492`. Nothing committed, pushed or deployed; ~145 changed entries from A2–R9 (don't commit
before Phase R, per Andrew 2026-11-09). No migration, env, or data change in R9. Unapplied migrations unchanged:
`20261109214742_push_game_reminder_optins.sql`, `20261109223743_pickem_pick_windows.sql`, `20261110014242_pickem_venue_frozen_lines.sql`.

### 3. Decisions already made
Andrew 2026-11-10: every §8 question takes its default (Q9 = keep listing "Your bars" on a failed check, built here; Q8 = R10).

### 4. Files changed
- `lib/venueAwayMode.ts`: new `awayAutoOpenTarget({ venueParam, awayVenues, listBuilt })` (null unless X is an away bar and the list is built).
- `components/join/JoinFlow.tsx`: the `/?v=X` effect (search `awayAutoOpenTarget`) passes
  `listBuilt: venueListState.builtForGeneration === venueListState.generation`; `autoOpenedAwayVenueRef` is set only after a target exists.
- `lib/pickem.ts`: `listPickEmGames` gains `clampToPickAhead?`; when set (non-NFL) and the asked day is after today, it calls the
  new `pickAheadReach` and serves today if the reach doesn't cover it. `applyPickWindowToGames` now uses `pickAheadReach` (same
  30 s display cache, same `pickAheadHorizonMs`).
- `app/api/pickem/games/route.ts`: passes `clampToPickAhead: true` (the only caller; `submitPickEmPick`'s `skipLines` call never does).
- `components/pickem/PickEmGameList.tsx`: `loadGames` follows `payload.date` (normal load sets `selectedDate`, `servedDayKeyRef`
  makes the effect skip that one reload; a background reply for another day returns before any state change); the sport button
  clears `pickAheadThrough` and moves a future day to today.
- Tests: new `tests/lib.venue-away-auto-open-target.test.ts` (4), new `tests/components.pickem-pick-ahead.test.ts` (3), new
  describe "pick ahead is decided before the provider call (R9)" in `tests/lib.pickem-college-spreads.test.ts` (5),
  `tests/away-mode-contract.test.ts` (R9 assertions added to the R3 test).
- Docs: plan status line, R9 "Built" note, standing rules B2 (extended) and a new R9 rule.

### 5. Facts and traps
- macOS `sed -i` needs `-i ''`; use Edit or python for file edits.
- God Mode commits a venue list too, so `listBuilt` is true and its behaviour is unchanged.
- The component test for the deep link relies on the effect skip (`servedDayKeyRef`); if the effect deps change, re-run it.
- Raw `npx tsc --noEmit` prints `.next/types/` "routes.d 2.ts" duplicates; filter with `grep -v "routes.d 2.ts"`.
- Lint only changed files (`tmp/group-games-phase-4/` is ignored by git but not by eslint).

### 6. Build, run, test
- `npm run test`: 519 files passed, 1 skipped; 6,837 tests passed, 13 skipped (the flaky Bingo star test passed this run).
- `npm run test:god-mode-join`: 59 passed. `npx tsc --noEmit` (filtered): clean. `npx eslint` on all changed files: clean.
- Not run: `npm run build`, a browser test (Phase R builds and smoke-tests). **Unverified:** a real signed-in `/?v=X` push with
  location denied, and a real future-day deep link against the dev server.

### 7. Open questions for Andrew
None.

### 8. Recommended first steps for R10
Model: Opus 5.5, medium effort (plan table: small diff, but the presence boundary every write route depends on). Read the R10 spec and Q8, then
`lib/venuePresence.ts`, its tests, and standing rules for presence in the plan.
