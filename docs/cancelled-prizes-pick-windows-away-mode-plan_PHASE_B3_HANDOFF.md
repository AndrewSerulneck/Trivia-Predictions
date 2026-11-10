# Phase B3 handoff: Frozen spread lines per bar

Plan: `docs/cancelled-prizes-pick-windows-away-mode-plan.md`. Claude Opus 5.5 did Phase B3 on 2026-11-09 at high effort, as the
plan's table names.

## For Andrew (plain English)

- **What changed:** at a bar that sets a pick window and plays against the spread, each game's line now **freezes for that bar** the
  first time a player sees it while picks are open. Everyone at that bar then sees the same number all week, and every pick is
  graded against the number the player saw, even if the sportsbooks move the line later. This covers College Football and NFL Pick 'Em.
- **Your open question Q1** ("when does a line freeze?") was answered with the recommended default, **"the first time it's shown"**,
  per your instruction to take all defaults.
- **Nothing changes for any bar yet.** No bar has a pick window (the screen to set one is Phase B4). Bars without a window keep
  today's rule exactly: the line locks at kickoff.
- **Cost:** negligible. Only bars with a window and spreads do any extra work: one small database read per games-list view and
  one small write per game the first time it freezes (about 1,200 tiny rows a week at 20 such bars). No new provider calls, no cron.
- **Is it live?** No. It's held for Phase R with A2–B2. Nothing was committed, deployed or applied. Phase R must apply a third
  migration (`20261110014242_pickem_venue_frozen_lines.sql`) with your go-ahead, **before** deploying.
- **Checked:** all 513 test files pass, the new database proof passes, typecheck and lint are clean. One read-only production
  check (below). Not checked in a browser.

## For the next agent

### 1. Next phase goal and scope
- **B4 (Game Settings UI)**, per the plan §7: per sport "Picks: Always open / Set days" in owner + admin Game Settings, against the
  existing save API (`pickWindows`, B1). "Saved." on success; one Partner Manual entry; one line (no block) in the Pick 'Em Prize
  wizard when a prize's days fall outside the sport's window. Then the browser check listed in the B2 handoff §6, which now also
  covers B3 (see §6 below).
- Out of scope: commit/deploy and `supabase db push` (Phase R).

### 2. Starting state
- Branch `main`; `origin/main` = `f14c2449` (A1, deployed). Nothing new is committed, pushed or deployed.
- **Andrew, 2026-11-09: A2, A3 and C1 are held for Phase R**; C2, C3, B1, B2 and B3 are treated the same way.
- Earlier uncommitted work: `…_PHASE_B2_HANDOFF.md` §2 and the handoffs it lists.
- **Uncommitted, B3:**
  - new: `supabase/migrations/20261110014242_pickem_venue_frozen_lines.sql`, `lib/pickemFrozenLines.ts`,
    `scripts/test-pickem-frozen-lines-sql.cjs`, `tests/pickem-frozen-lines-contract.test.ts` (7 tests), this handoff
  - modified: `lib/pickem.ts` (college list display, `resolvePickScoringMode`, `submitPickEmPick`, settlement), `lib/nflPickEm.ts`
    (`listNFLPickEmGames` `pickWindow` param + freeze + recorded-line display, `submitNFLPickEmPick`, new `nflFrozenLineColumnsForPick`,
    `nflLineVendor`, `toFreezableNFLLine`), `app/api/nfl-pickem/games/route.ts` (reads the time zone before listing, passes `pickWindow`),
    `package.json` (`test:pickem-frozen-lines-sql`)
  - tests modified: `tests/lib.pickem-college-spreads.test.ts` (+8; mock RPC `freeze_pickem_venue_lines`, `store.freezeFails`),
    `tests/lib.nfl-pickem-game-fetch.test.ts` (+2; mock `gte`/`lte` and the freeze RPC, `db.freezeCalls`),
    `tests/lib.pickem-nfl-scoring-mode.test.ts` (+3)
  - docs: plan status line, §6 B3 row, "Built (B3)" note, Q1 struck, B3 standing rule; one cross-reference bullet in
    `docs/pickem-college-football-and-prize-plan.md` standing rules.
- **Data:** no writes. One read-only production count on 2026-11-09 (service role, `node --env-file=.env.local`): pending picks
  with `home_spread` set = **0**, pending picks = 0, settled picks with a spread = 18. That's what makes reusing those columns safe.
- **Phase R must `supabase db push` three migrations with Andrew's go-ahead, before the deploy:** `20261109214742` (C3),
  `20261109223743` (B1), `20261110014242` (B3).

### 3. Decisions made (don't re-ask)
- **Q1 = "first shown"** (Andrew: take all defaults). A line freezes for a bar the first time a games list shows the game while
  that game's window instance is OPEN (`pickWindowStatusForGame`) and before kickoff. A game whose window hasn't opened shows the
  moving global line (it can't be picked yet) and freezes when it opens. A late line freezes when first shown.
- **The pick records the line on itself, in the existing `pickem_picks.home_spread` / `away_spread`.** Until B3 only grading wrote
  them (on the pending → graded update), so on a pending pick they now mean "the frozen line this pick is graded by". No
  `pickem_picks` migration, no change to `PICKEM_PICK_SELECT`. Grading overwrites them with the line used, as before.
- **Grading goes by the pick, not the bar.** I first built "settlement looks up the bar's frozen row", then rejected it: if a partner
  turns the window off mid-week, new picks (shown the global line) would be graded by an old frozen number. With the line on the
  pick, a pick made without a window has no recorded line and gets the kickoff lock, exactly as today.
- **The pick path guarantees the record.** `submitPickEmPick` (college, spread-stamped, bar has an `ncaaf` window) and
  `submitNFLPickEmPick` (bar's NFL mode `spread` and an `nfl` window) call `frozenLineForPick`, which freezes from the saved global
  line if the list didn't (the RPC returns the EARLIER row if one exists), then save it on insert AND side switch. A failed freeze
  refuses the pick: "We couldn't load this game's line. Please try again." (`PICKEM_FROZEN_LINE_FAILED_MESSAGE`). An NFL game with no
  line at all is still pickable with no record (today's NFL behaviour; graded/voided by the kickoff path). A college spread pick still
  needs a line ("Line coming soon").
- **An existing pick at a no-longer-windowed bar keeps its recorded line** (the code never clears it).
- **NFL mode stays "venue's mode at settlement"** (unchanged). A recorded line is used only when that mode is `spread`; at a venue now on
  pick-the-winner it is graded straight up and the columns are nulled by the standard grade (test pins this).
- **Display order:** the player's own pending pick's recorded line → the bar's frozen line → the global line. A list freeze/read
  failure keeps the global lines on screen and sets `collegeScoring.linesUnavailable` / NFL `spreadLinesUnavailable`.
- **Table writes only through the RPC:** the migration revokes ALL from public/anon/authenticated/**service_role** (a Supabase default
  privilege may grant service_role everything) and grants service_role SELECT only; the RPC is SECURITY DEFINER, executable only by
  service_role; a BEFORE UPDATE trigger refuses any change; `on delete cascade` from `venues`.
- The NFL route now reads the (cached) venue time zone **before** listing when the venue has an NFL window (it used to read it after);
  same one read.

### 4. Files and how they fit
- `lib/pickemFrozenLines.ts` (server-only, the one home): `linesToFreeze` (pure rule), `readVenueFrozenLines` (one indexed range
  read; a missing table reads as none), `freezeVenueLines` (the RPC), `applyVenueFrozenLines` (list: read, freeze the new ones, return
  the map), `frozenLineForPick` (pick: freeze-or-read one), `frozenLinePickColumns`, `recordedPickLine` (pure: pending + both spreads),
  `PICKEM_FROZEN_LINE_FAILED_MESSAGE`, `isFrozenLinesTableMissing`.
- `lib/pickem.ts`: `applyCollegeFootballLines` now reads `readVenueGameSettingsForDisplay` itself (the removed
  `resolveCollegeScoringModeForDisplay` was its only caller) and applies frozen lines when the bar has an `ncaaf` window;
  `resolvePickScoringMode` returns `{ scoringMode, frozenLine }`; `submitPickEmPick` spreads `lineColumns`; settlement computes
  `recordedLine` per row, grades college spread picks by it before the lock gate, uses it before `getLockedNFLLine` for NFL, and leaves
  recorded-line picks out of `lock_pickem_game_lines`.
- `lib/nflPickEm.ts`: `listNFLPickEmGames({ pickWindow })` freezes/shows frozen lines only when `scoringMode === "spread"`, a venue,
  a window, and the global refresh didn't fail; the pick-attach loop shows a pending pick's recorded line.
- Migration + `scripts/test-pickem-frozen-lines-sql.cjs` (PGlite, Supabase default privileges mirrored).

### 5. Facts and traps
- `game_id` for both sports is `providerId__kickoff__away__home`; the frozen table keys on (venue_id, sport_key, game_id).
- The college test DB mock inserts only the columns given, so an unset column is `undefined`, not `null` (assert with `?? null`).
- `tests/lib.pickem-college-spreads.test.ts` "one vendor rule" fails if `lib/nflPickEm.ts` contains the literal `"fanduel"` — even in
  a comment.
- `tests/api.pickem-pick-window-gate.test.ts` slices `submitNFLPickEmPick` up to `\nasync function findNFLWeekContaining`; the new
  helper sits between them (harmless, it has no `.update(`).
- The NFL fetch test mock has no `lt`/`then`, so `listNFLPickEmGames` with a `userId` can't run there; the recorded-line display on
  NFL is pinned by the contract test instead.
- zsh here has no `timeout`; a bare `cat > file` with no heredoc waits on stdin forever (I hung a command that way).

### 6. Build / run / test
- `npx vitest run tests/pickem-frozen-lines-contract.test.ts tests/lib.pickem-college-spreads.test.ts tests/lib.nfl-pickem-game-fetch.test.ts tests/lib.pickem-nfl-scoring-mode.test.ts`
- `npm run test:pickem-frozen-lines-sql` (8 checks), `npm run test:pickem-lines-sql`, `npm run test:security-definer-sql`: all pass.
- Full `npm run test`: 513 files passed, 1 skipped; 6,719 tests passed, 13 skipped. `npx tsc --noEmit` clean. eslint clean on every B3 file.
- **Not verified:** no browser check, and the migration has not run on real Postgres/Supabase (only PGlite). In B4/R's browser check,
  also confirm at a windowed spread bar: the line on a team button doesn't change after the global line moves, and a pick saves.

### 7. Open questions for Andrew
- None new. Phase R needs his go-ahead for the three migrations.

### 8. Recommended first steps for the next phase
- **B4 (Opus 5.5, medium effort, per the plan's table):** read the B1, B2 and B3 standing rules in the plan, then
  `readGameSettingsChanges` / `updateVenueGameSettings` (`lib/venueGameSettings.ts`) and the owner + admin Game Settings screens. Build
  the form against the existing save API, then do the browser check (B2 handoff §6 plus §6 above).
