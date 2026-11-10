# Phase R8 handoff: a pick's line is set when it's made (2026-11-10)

## For Andrew (plain English)

- **What changed:** on a Pick 'Em spread game, switching your pick to the other team no longer changes the line the pick is
  graded by. Before this fix, a pick made before the bar turned on a pick window could quietly move from the regular line
  (say −6.5) to the bar's frozen line (say −3) the moment the player switched sides, and the number on screen jumped.
  Now a pick keeps the line it was made with. If a player clears the pick and picks again, that counts as a new pick and takes
  the bar's line, which is also what the screen shows them by then. This covers College Football and NFL Pick 'Em.
- **Also fixed (NFL):** if loading the bar's settings fails at the moment someone makes a new NFL pick, the pick still saves
  the bar's line when the bar already has one. Before, it saved no line, and the pick was graded by a different number from
  the one on screen.
- **Grading itself didn't change.** Only which line gets saved on the pick.
- **Live?** No. Like everything since A2, it's code and tests only: uncommitted, not deployed, no database change.
- **Needs you:** nothing. Next is R9 (opening a bar automatically waits for a real location; pick ahead snaps back to today on
  the server).

## For the next agent

### 1. Next phase: R9, and what is out of scope

R9 = "Auto-open waits for a real location; pick ahead snaps back on the server" (plan §7, Phase R9, third review findings 6
and 7). Read its spec in `docs/cancelled-prizes-pick-windows-away-mode-plan.md`, the "Standing rules" in
`docs/join-flow-location-error-plan.md` (finding 6) and standing rule B2 in this plan (finding 7) first.
Out of scope for R9: everything R8 touched (pick line columns, `resolvePickScoringMode`, `nflFrozenLineColumnsForPick`),
`settlePendingPickEmPicks`, `pay_pickem_points`, R7's prize/schedule code, and R10's "at the bar" rule. Q7 stays out of scope
for every R phase.

### 2. Starting state

- Branch `main`, last commit `40d47492`. **Nothing committed, pushed or deployed.** R8 sits inside the held A2–B4 + R1–R7
  change set (`git status --short` lists about 140 entries). Andrew's rule from 2026-11-09 still applies: don't commit or
  deploy before Phase R.
- No migration, env var, data change or production read in R8. The three unapplied migrations are unchanged:
  `20261109214742_push_game_reminder_optins.sql`, `20261109223743_pickem_pick_windows.sql`,
  `20261110014242_pickem_venue_frozen_lines.sql`. No bar has a pick window in production, so no pick row needs repair.
- `output/` and `assets/app-store/*-2026-11-09/` are untracked and unrelated. Don't commit them with this work.

### 3. Decisions already made (don't re-ask)

- **Andrew, 2026-11-10:** every §8 question takes its default (Q2 = 1 hour, Q4 = not now, Q5 = close the week early, Q6 = refuse
  the change if a payout can't be confirmed, Q7 = out of scope, Q8 = one "at the bar" rule with a 16-minute lease (R10), Q9 =
  keep listing "Your bars" when the location check fails (R9)).
- R8 was built as specified. Choices within the spec:
  1. **Optional item 3 was not done** (reuse the list's global line instead of `getNFLPickEmGameLine`). `NFLPickEmGame` has no
     `sourceVendor`, which the freeze needs. Also, `submitNFLPickEmPick` calls the list without `pickWindow`, and a game's
     `homeSpread` there can be the player's own pick's line. Doing it properly means a new field on a shared type. That is
     more than "a small change", so it stays one extra indexed read per new windowed NFL pick.
  2. College with a failed settings read: a **side switch** still works (the stamp comes from the existing pick), writes no
     line and freezes nothing. A **new** college pick with no settings is still refused (unchanged).
  3. NFL with a failed settings read now does one extra indexed read (the stored frozen line) for **every** new NFL pick,
     including bars with no window or in winner mode, because the read can't tell which kind of bar it is. That costs only
     when the settings read has already failed. If this lookup also fails, the pick is refused, as the spec says.

### 4. Files changed

- `lib/pickem.ts`:
  - In `resolvePickScoringMode`, the frozen-line step now starts with
    `if (params.existing || !params.settings?.pickWindows?.[params.game.sportSlug]) return { scoringMode: mode, frozenLine: null };`.
    The "line must exist" check before it still runs for both a new pick and a side switch.
  - In `submitPickEmPick`, the side-switch `.update({...})` no longer spreads `...lineColumns`; a comment replaces it. The insert
    still spreads it. Comments and the doc comment are updated.
- `lib/nflPickEm.ts`:
  - In `submitNFLPickEmPick`, the `nflFrozenLineColumnsForPick` call moved from before the existing-pick read to just before the
    insert, so a switch makes no freeze RPC. The update no longer spreads `...lineColumns`.
  - `nflFrozenLineColumnsForPick`: the guard is now
    `if (params.settings && (params.settings.nflPickEmScoringMode !== "spread" || !params.settings.pickWindows?.nfl)) return {};`.
    The global line is read only when there are settings
    (`params.settings ? await getNFLPickEmGameLine(params.game.id) : null`). With no settings, `frozenLineForPick` gets
    `globalLine: null`, which is a read-only `readVenueFrozenLines`. A failure throws `PICKEM_FROZEN_LINE_FAILED_MESSAGE`.
    The doc comment explains the three outcomes.
- `lib/pickemFrozenLines.ts`: **unchanged**.
- Tests:
  - `tests/lib.pickem-college-spreads.test.ts`, R2 block: the old "switching sides inside the window records the frozen line"
    test is replaced by three R8 tests. They cover a switch with no line (no columns written, no freeze, the list still shows
    −9), clear and re-pick (frozen −5.5), and a switch with the settings read down. The B3 "a pick records the bar's frozen
    line" test now also asserts that a switch makes no freeze RPC.
  - `tests/lib.nfl-pickem-game-fetch.test.ts`:
    - The Supabase mock gains `insert`, `delete`, and `db.failReads` (which fails `.returns()` reads of named tables).
    - `@/lib/pickemPickWindowGate` is partly mocked: `readVenueGameSettingsForPick` → `db.readSettings`, default `null`.
    - The new block "submitNFLPickEmPick: a pick's line is set when it's made (away-mode plan R8)" has 6 tests: finding 1,
      a recorded line kept, a new pick plus clear and re-pick, and the three finding-3 cases (stored line, no line, failed lookup).
  - `tests/pickem-frozen-lines-contract.test.ts`:
    - The two "saves the line on insert and update" contracts are rewritten as "only the insert saves the line (R8)". Each now
      expects exactly one `...lineColumns,`, after `.insert(`. The NFL one also expects the helper call after `.update(` and
      the settings-null guard.
    - New: "no pick update writes line columns: a pick's line is set when it is made (R8)". It slices each submit's
      `.update(` up to `.eq("id", existing.id)` and bans `lineColumns`, `home_spread`, `away_spread` and `frozenLinePickColumns`.
- Docs (`docs/cancelled-prizes-pick-windows-away-mode-plan.md`): the status line, an R8 "Built" note, standing rule B3 ("insert
  only", plus the NFL settings-null rule) and standing rule R2 (a new R8 sentence).

### 5. Facts and traps

- **Settlement wasn't touched.** `settlePendingPickEmPicks` still grades a pending spread pick by `recordedPickLine(row)` first,
  then the kickoff-locked global line. R8 only changes which picks have a recorded line. Settlement still overwrites the line
  columns with the line it used when it grades; that write is in settlement, not in a pick update, so the contract doesn't cover it.
- A pick's row can carry a line from only two places: the insert in a pick path (B3/R8) or grading. `lineShownForGame` (R2)
  relies on this.
- The NFL fetch test's mock builder takes a snapshot of the rows when `from()` is called, and `eq` filters that snapshot. A test
  that seeds `db.tables.pickem_picks` must do it before the call it affects. The mock's `delete` removes the filtered rows
  when the chain is awaited.
- An omitted insert column is `undefined` in the mocks, not `null`. Assert with `row.home_spread ?? null` → `toBeNull()`.
- `tests/lib.sportsBingo.nfl-star-tilt.test.ts` ("puts stars on boards materially more often than chance") is statistical and
  flaky. It failed once in the full run and passed 3 out of 3 times when run alone. R8 doesn't touch it.
- Raw `npx tsc --noEmit` still prints TS2300/TS2717 errors from `.next/types/` Finder duplicates. Filter them with
  `grep -v "routes.d 2.ts"`.
- `npm run lint` still reports errors from the git-ignored `tmp/group-games-phase-4/`. Lint only the changed files.

### 6. Build, run, test

- `npm run test`: 518 files (516 passed, 1 skipped, 1 failed). The failure is the flaky Bingo test above. Tests: 6,824 passed,
  1 failed (the same test), 13 skipped. R7 ended at 6,816 passed; R8 adds 9 net tests.
- `npx vitest run tests/lib.pickem-college-spreads.test.ts tests/lib.nfl-pickem-game-fetch.test.ts tests/pickem-frozen-lines-contract.test.ts`:
  54 + 42 + 12 passed.
- `npx tsc --noEmit 2>&1 | grep -v "routes.d 2.ts"`: clean.
- `npx eslint lib/pickem.ts lib/nflPickEm.ts tests/lib.pickem-college-spreads.test.ts tests/lib.nfl-pickem-game-fetch.test.ts tests/pickem-frozen-lines-contract.test.ts`: clean.
- `npm run test:pickem-frozen-lines-sql` and `npm run test:pickem-lines-sql`: all checks passed. The SQL is unchanged; this was a
  regression run.
- Not run: `npm run build` (no route or config shape changed, Andrew's dev server shares `.next`, and Phase R builds) and a
  browser test (no UI changed).
- Reasoned, not run against the old code: each new switch test expects no line columns where the old code wrote the frozen
  line, and each NFL settings-null test expects a lookup the old code never made. Every one of them would fail before R8.
- **Unverified:** a real pick against the database with the B3 migration applied. Phase R applies the migrations; a
  smoke test after that is worth doing: make a pick at a windowed spread bar, switch sides, and check that `home_spread` is
  unchanged.

### 7. Open questions for Andrew

None.

### 8. Recommended first steps for R9

Model: **Sonnet 5.5, medium effort** (plan table: two local, fully specified fixes, pinned by tests; no auth or points change).
1. Read the R9 spec, `docs/join-flow-location-error-plan.md` "Standing rules", and standing rules B2, C1 and R3 in this plan.
2. Finding 6: in `components/join/JoinFlow.tsx`, find the `/?v=X` auto-open effect (search `autoOpenedAwayVenueRef`, around
   line 1728) and `decideScannedVenue` (its `builtForGeneration === generation` test). Add the pure
   `awayAutoOpenTarget({ venueParam, awayVenues, listBuilt })` to `lib/venueAwayMode.ts`, and set the ref only when the helper
   returns a bar. Run `npm run test:god-mode-join`.
3. Finding 7: split `pickAheadReach(...)` out of `applyPickWindowToGames` in `lib/pickem.ts`, keeping the 30 s display cache and
   `pickAheadHorizonMs`. Add `clampToPickAhead` for `/api/pickem/games` only; never for the `skipLines` call from
   `submitPickEmPick`. Then make `components/pickem/PickEmGameList.tsx` follow `payload.date`, ignore a background reply for
   another day, and clear `pickAheadThrough` on a sport switch.
4. Add the spec's tests, then update standing rule B2, the plan's status line, and write
   `docs/cancelled-prizes-pick-windows-away-mode-plan_PHASE_R9_HANDOFF.md`.
