# Phase R2 handoff: the line on a player's pick is the line it's graded by (2026-11-09)

## For Andrew (plain English)

- **What changed:** a Pick 'Em spread pick made *before* a bar turned on its pick window used to show the bar's frozen line
  (say −3.5) while it was graded by the regular line locked at kickoff (say −6.5). Now the screen shows the line the pick is
  actually graded by. Players with no pick still see the bar's frozen line. A finished pick shows the line it was graded by.
  This covers College Football and NFL Pick 'Em.
- **Grading didn't change.** Only what the games list shows changed.
- **Live?** No. Like A2–B4 and R1, it's code and tests only: uncommitted and not deployed. It waits for Phase R's review and release.
- **Needs you:** nothing. Next is R3 (opening a bar while you're away keeps its screen and its once-a-minute limit).

## For the next agent

### 1. Next phase: R3, and what is out of scope

R3 = "Opening a bar away keeps its screen and its once-a-minute limit" (plan §7, Phase R3, review findings 3 and 4). Read its spec
in `docs/cancelled-prizes-pick-windows-away-mode-plan.md` and the "Standing rules" in `docs/join-flow-location-error-plan.md`
first. Out of scope for R3: anything in Pick 'Em (R1 and R2 are done), `clearClientState` exemptions (the spec forbids them),
and God Mode behaviour. Q7 remains out of scope for every R phase.

### 2. Starting state

- Branch `main`, last commit `40d47492` (not mine). **Nothing committed, pushed or deployed.** R2 sits inside the held A2–B4 + R1
  change set (Andrew, 2026-11-09: hold everything for Phase R).
- No migration, no env var, no data change, no script run against production. No production data was read or written.
- The three unapplied migrations from C3/B1/B3 (`20261109214742_push_game_reminder_optins.sql`,
  `20261109223743_pickem_pick_windows.sql`, `20261110014242_pickem_venue_frozen_lines.sql`) are unchanged and still unapplied.

### 3. Decisions already made (don't re-ask)

- R2 was built exactly as specced. One case the spec didn't name: a pick that is **not pending and has no line** on its row (e.g.
  canceled) shows the global line, never the frozen line. Only a pick that recorded the frozen line is promised it.
- `recordedPickLine` keeps its exact behaviour (pending only). Settlement still uses it. The new private `pickRowLine` reads the
  row's line whatever its status, and `recordedPickLine` is now `status === "pending" ? pickRowLine(row) : null`.
- NFL calls the helper twice: once while building each game (no pick attached yet: `pick: null`), and again in the pick loop for
  a game the player picked. I didn't move the picks read ahead of the game build, so the query order stays the same.

### 4. Files changed

- `lib/pickemFrozenLines.ts`: new exported `lineShownForGame({ pick, frozen, global })`, plus the private `pickRowLine` and the
  `PickLineRow` and `SpreadLine` types.
- `lib/pickem.ts`: `applyCollegeFootballLines` uses `lineShownForGame` (the doc comment is updated), and the import is added.
  `recordedPickLine` is still imported for settlement. `settlePendingPickEmPicks` is untouched.
- `lib/nflPickEm.ts`: `listNFLPickEmGames` uses `lineShownForGame` in the game map and in the pick loop. The `recordedPickLine`
  import was removed (now unused there).
- Tests:
  - `tests/pickem-frozen-lines-contract.test.ts`: new "the line a list shows (pure, away-mode plan R2)" block (3 cases), plus the
    contract "both games lists choose the line shown only through lineShownForGame (R2)". It checks that neither list has
    `recordedPickLine(` or a `frozen….get(…) ??` chain, and that NFL calls the helper exactly twice. The old assertion that NFL
    contains `recordedPickLine(pick)` was replaced.
  - `tests/lib.pickem-college-spreads.test.ts`: "the line shown is the line the pick is graded by (away-mode plan R2)" (3 cases):
    the finding's scenario, a side switch recording the frozen line, and a graded pick.
  - `tests/lib.nfl-pickem-game-fetch.test.ts`: the same-named block (2 cases). The Supabase mock gained `lt` and `then` (the
    week's picks read is awaited without `.single()` / `.returns()`).
- Docs: the plan's status line, the R2 "Built" note, the B3 standing rule's "Screens show, in order…" (marked as superseded),
  and a new R2 standing rule at the end of the plan.

### 5. Facts and traps

- **The 30 s Game Settings display cache** (`readVenueGameSettingsForDisplay` in `lib/pickem.ts`) is keyed per venue. A test
  that changes `store.pickWindows` after a list read at the same venue must advance the fake clock past 30 s, or the list
  keeps the old window. The pick path reads fresh (`readVenueGameSettingsForPick`), so it sees the change at once.
- A college spread pick needs the list to have loaded the global line first (`saturday("venue-1")` in the tests). Otherwise
  the pick refuses with "This game's line isn't out yet."
- `pickem_picks` is unique on `(user_id, game_id)`, so `listUserPicksByGameId` (no venue filter) returns at most one pick per game.
- The `.next/types/` Finder duplicates still make raw `npx tsc --noEmit` print TS2300/TS2717. Filter them:
  `npx tsc --noEmit 2>&1 | grep -v "routes.d 2.ts"`.

### 6. Build, run, test

- `npm run test`: **516 files passed, 1 skipped; 6,769 tests passed, 13 skipped** (R1 ended at 6,760: +9 from R2).
- `npm run test:pickem-frozen-lines-sql`: all checks passed (the SQL is unchanged; this was a regression run).
- `npx tsc --noEmit` (filtered) is clean. `npx eslint` on all six touched files is clean.
- Reasoned, not run against the old code: each new scenario test expects the global line where the old `??` chains returned the
  frozen one, so it would fail on the pre-R2 code.
- I didn't run `npm run build` (no route or config shape changed; Phase R builds) or a browser test (no UI component changed,
  only the numbers the API returns).

### 7. Open questions for Andrew

None.

### 8. Recommended first steps for R3

Use **Opus 5.5, high effort** (from the plan's table: join flow and session switching, an auth path).
1. Read the R3 spec and the `docs/join-flow-location-error-plan.md` "Standing rules".
2. Read `navigateToResolvedVenue` and `hardClearAuthAndCachePreserveVenue` / `clearClientState`, the `/?v=` redirects in
   `components/venue/VenueHubClient.tsx`, `app/page.tsx`, the `useEffect` around line 1712 of `components/join/JoinFlow.tsx`,
   `lib/pushLanding.ts` and `lib/venueAwayMode.ts`.
3. Build `signInListPath`, `awayAutoOpenAllowed` and `markAwayAutoOpen`, then add the tests, the contract line and run
   `npm run test:god-mode-join`.
4. Write `docs/cancelled-prizes-pick-windows-away-mode-plan_PHASE_R3_HANDOFF.md` and update the plan's status line.
