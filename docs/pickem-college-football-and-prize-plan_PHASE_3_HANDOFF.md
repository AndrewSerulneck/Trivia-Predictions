# Pick 'Em plan: Phase 3 handoff (College Football spreads + Game Settings)

Plan: `docs/pickem-college-football-and-prize-plan.md`. Phase 3 built 2026-10-31.

## For Andrew (plain English)

**What changed**
- **College Football picks use the spread by default.** Each team button shows its line (e.g. "−5.5" under
  East Carolina, "+5.5" under Temple). One grey line at the top of the college list explains it: "Picks use the
  spread: your team must win by more than its line, or lose by less. Lines lock at kickoff."
- **No line yet = can't pick.** A game the sportsbooks haven't posted a line for shows "Line coming soon" and
  can't be picked until one appears. (On Oct 31, 40 of 43 FBS games had a line.)
- **Game Settings has a new "College Football Pick 'Em" card**, under the NFL one, on the partner page and in
  admin: **Spread** (default) or **Pick the winner**. Each card saves on its own.
- **A pick keeps the rule it was made under.** If a bar switches rules mid-day, picks already made are graded
  the old way; only new picks use the new rule. (NFL is unchanged: it still uses the bar's rule at grading time.)
- **The line used for grading is the one locked at kickoff.** Lines can move before kickoff; the screen always
  shows the current one. A tie with the line (e.g. a 3-point line, game won by exactly 3) is a push: no points.
- **If a game ends with no line on record** (shouldn't happen, since you can't pick without one), the pick is
  cancelled 48 hours after kickoff instead of sitting there forever.
- **NFL Pick 'Em is unchanged.** Its "which sportsbook's line" rule now lives in one shared file used by both games,
  with the same order (FanDuel, then DraftKings, BetMGM, …).

**Is it live?** No. Nothing committed, pushed or deployed; no migration applied (`main` is frozen for App Store review).

**Cost:** about one small database read each time someone opens the college list. The odds provider is asked at
most once every 10 minutes per server (≈3 pages for a full Saturday), and not at all when every game still to
start already has a line saved in the last 10 minutes. Grading adds one database call per minute while college
spread picks are waiting. No new scheduled job.

**What needs you, after App Store approval:**
1. Apply all three migrations (`supabase db push`) **before or with** the deploy, in order:
   `20261031182914_pickem_automatic_points.sql`, `20261031185853_add_ncaaf_to_pickem_sport_slug_constraint.sql`,
   `20261031191250_pickem_college_football_spreads.sql`. Without the third, college games show "Line coming soon"
   everywhere (spread venues can't pick college) and the College Football card in Game Settings can't save; NFL
   settings keep working either way.
2. Phone check on a Saturday: open Pick 'Em → 🏈, see lines on the buttons, make a pick; then in Game Settings switch
   College Football to "Pick the winner" and check the lines disappear for games you haven't picked.

## For the next agent (Phase 4a: Pick 'Em Prize, data + rules, server only)

### 1. Goal and scope
Plan §7 "Phase 4a". Out of scope for 4a: awards/tiebreaker (4b), wizard (5), player screens (6). Spreads for other
sports stay out (plan §3).

### 2. Starting state
- Branch `after-app-review`, last commit `407e4da2` (unrelated). **Phases 1, 2 and 3 are all uncommitted** in the
  working tree (Andrew hasn't asked for a commit). Nothing pushed or deployed.
- Migrations NOT applied anywhere: `20261031182914`, `20261031185853`, `20261031191250` (new this phase). Never
  `supabase db push` / push `main` / change Production env until Andrew confirms App Store approval.
- No production data changed. Production access this phase: read-only BallDontLie calls to capture the odds fixture.
- Unrelated: `supabase/migrations/Warnings` is a stray 62 KB file committed in `ef5d1c0e` (not a migration; leave it).

### 3. Decisions already made (don't re-ask)
- D3/D9 as built: college spread is the default (also for a venue with no settings row); no line → "Line coming soon".
- Chosen without asking (all documented in code):
  - **Stamp at pick time, keep on side switch.** `pickem_picks.scoring_mode` (column already existed from the NFL
    migration `20260802120000`, written there at settlement) is set for college on insert; changing sides keeps the
    existing stamp; clearing and re-picking takes the venue's current rule. The games list shows a game by the
    player's own pick's stamp once picked, else the venue's rule.
  - **A failed read of the venue's rule refuses the pick** ("We couldn't load this bar's Pick 'Em rules…"), never
    guesses. The games list, by contrast, shows the default (spread) on a failed read.
  - **Lines by `game_ids[]`**, not `season+week`: the list already has the day's provider ids; one call covers all of
    them (URL ≈ 1 KB for 43 games). Plan §5 mentioned season+week; both work.
  - **48 h no-line cancel** reuses `COLLEGE_FOOTBALL_NO_FINAL_CANCEL_MS`. A failed `lock_pickem_game_lines` call puts
    every college spread pick in "wait" for that run, so an outage can never run down the 48 h clock into cancels.
  - **`locked_at` = the game's `starts_at`** (as NFL does).
  - Line display uses a real minus sign ("−5.5"); "PK" for 0.
  - Spread push wording: "Push (landed on the line)".

### 4. Files created or changed
- **`supabase/migrations/20261031191250_pickem_college_football_spreads.sql`** (new): `venue_game_settings.cfb_pickem_scoring_mode`
  (default `spread`, CHECK standard/spread); table `pickem_game_lines` (PK `sport_key, game_id`; `provider_game_id`,
  `starts_at`, teams, `home_spread`/`away_spread`, `source_vendor`, `fetched_at`, `locked_at`, timestamps; index
  `sport_key, starts_at`; RLS forced; `service_role` grant; anon/authenticated revoked); RPC
  **`upsert_pickem_game_lines(jsonb)`** (insert only if `starts_at > now()`; update only if the stored row is unlocked
  AND not started — on the DB clock, so a slow request can't move a line after kickoff); RPC
  **`lock_pickem_game_lines(text, text[])`** (sets `locked_at = starts_at` on started, unlocked rows; returns every
  listed row; never inserts). Both execute-granted to `service_role` only.
- **`lib/spreadLines.ts`** (new leaf, no imports): `SPREAD_VENDOR_PRIORITY`, `normalizeBDLSpreadRow`,
  `pickBetterSpreadLine`, `bestSpreadLinesByGame`, `formatSpreadLine`. **The one sportsbook rule** for NFL and college.
- **`lib/nflPickEm.ts`**: its private vendor list/normaliser removed; `fetchNFLSpreadLinesFromBDL` now returns
  `bestSpreadLinesByGame(...)`, provider string still `balldontlie:<vendor>`. Behaviour identical (NFL tests pass).
- **`lib/pickemGameLines.ts`** (new, server-only): `PICKEM_LINE_REFRESH_MS` (10 min), `readPickEmGameLines` (one
  range read by `sport_key` + `starts_at`, avoiding long-id `in()` URLs), `readPickEmGameLine` (the pick check),
  `loadPickEmGameLines` (read → refresh if stale → `upsert_pickem_game_lines`; reports `refreshFailed`),
  `lockPickEmGameLinesForSettlement`, `isSpreadLineSportKey`, helpers `gamesNeedingLineRefresh` / `linesAreFresh`,
  test hook `resetPickEmLineFetchMemo`. Throttle = DB freshness (every not-started game has a row updated < 10 min
  ago, shared by all instances) + a per-instance memo keyed by the day's provider ids (covers games with no line).
- **`lib/pickemCollegeFootball.ts`**: + `COLLEGE_FOOTBALL_SPREAD_COPY` (explainer, "Line coming soon", no-line error,
  push label) and `collegeFootballSpreadLineGate` → `grade|wait|cancel`.
- **`lib/venueGameSettings.ts`**: `cfbPickEmScoringMode` on `VenueGameSettings`, `DEFAULT_CFB_PICKEM_SCORING_MODE`,
  `getVenueCollegeFootballPickEmScoringMode`, `isPickEmScoringMode`, `readGameSettingsChanges` (route body parser),
  `updateVenueGameSettings(venueId, { nfl?, cfb? })` (writes only what's sent). `setVenueNFLPickEmScoringMode` is now a
  wrapper. Before the migration, reads fall back to the old columns (42703/PGRST204 naming the column) so NFL keeps
  working; a college save then fails with "College Football settings are not available yet."
- **`lib/pickem.ts`**:
  - `PICKEM_PICK_SELECT` + `scoring_mode, home_spread, away_spread`; `PickEmPick.scoringMode?`; `PickEmGame` +
    `scoringMode?`, `homeSpread?`, `awaySpread?`, `lineComingSoon?`.
  - `listPickEmGames`: new `skipLines` param; for `ncaaf` calls `applyCollegeFootballLines` and returns
    `collegeScoring: { mode, linesUnavailable }`. Lines are loaded only if some game is played on the spread.
  - `submitPickEmPick`: lists with `skipLines: true`, then `resolvePickScoringMode` (stamp, rule read, saved-line check).
  - `settlePendingPickEmPicks`: one `lockPickEmGameLinesForSettlement` call per run for pending college spread picks;
    after `collegeFootballGradeGate` says grade, `collegeFootballSpreadLineGate` decides; grading reuses
    `resolveSpreadPickEmSettlement` (its `line` param narrowed to `{homeSpread, awaySpread}`). College rows keep their
    stamp on every terminal write. NFL branch untouched.
- `app/api/pickem/picks/route.ts`: "check back soon" → 400.
- `app/api/{owner,admin}/game-settings/route.ts`: POST accepts `nflPickEmScoringMode` and/or `cfbPickEmScoringMode`
  via `readGameSettingsChanges`; owner route still does `requireOwnerAuth` + venue check before reading settings.
- `app/owner/game-settings/page.tsx`, `components/admin/sections/GameSettingsSection.tsx`: a `SCORING_MODE_GAMES`
  list renders one card per game, each with its own draft and Save. NFL wording/badges unchanged.
- `components/pickem/PickEmGameList.tsx`: line under each team name (`text-footnote`, `text-ht-pickem-accent` token),
  explainer at the top of the college list, "Line coming soon" strip, tap on such a game shows the no-line message,
  spread push label.
- Tests: **`tests/lib.pickem-college-spreads.test.ts`** (23: vendor rule on the real fixture, formatting, NFL uses the
  shared rule, line gate, list lines + "coming soon", 10-min throttle per instance and across instances, nothing
  written after kickoff, standard mode never fetches, provider failure, pick stamping/refusals/side switch, settlement
  cover/lose/underdog/push/standard/no-line wait+cancel/lock failure). Updated: `tests/lib.venue-game-settings.test.ts`,
  `tests/api.{owner,admin}.game-settings.test.ts` (real parser via `vi.importActual`), `tests/lib.pickem-college-football.test.ts`
  (mock additions only). **`scripts/test-pickem-lines-sql.cjs`** → `npm run test:pickem-lines-sql` (PGlite proof of
  the migration). Fixture **`tests/fixtures/pickem-ncaaf/odds-2026-10-31.json`** (221 real odds rows + the 43 games).

### 5. Facts and traps
- **The provider keeps updating odds after kickoff** (live lines): game 457403 kicked off 19:00Z and its rows say
  `updated_at` 19:10Z. That's why writing is refused after kickoff in SQL, not just in TypeScript.
- `/ncaaf/v1/odds` vendors seen 2026-10-31: draftkings, fanduel, betmgm, caesars, fanatics, betrivers (no bet365);
  4 of 221 rows had no spread; 37 rows had integer lines (pushes are possible).
- Spread math (unchanged from NFL): only the home side is adjusted, `home + homeSpread` vs `away`.
- The regular games route runs `settlePendingPickEmPicks({ userId })` on every view, so a player with pending college
  spread picks causes one extra lock RPC per view. Cheap; noted for cost reviews.
- `listUserPicksByGameId` filters by user + sport, not venue (pre-existing); the display stamp comes from that pick.
- `npm run lint` reports 309 errors, all inside the git-ignored `tmp/group-games-phase-4/release/` folder (pre-existing
  build artifacts); zero outside it. Use `npx eslint <files>` for changed files.
- Typecheck and build must not run at the same time (`.next/types`).

### 6. Build / test / verification
- `npx tsc --noEmit` clean; `npx eslint` on every changed file clean; `npm run build` passes.
- `npm run test`: 5,817 pass / 13 skipped / 4 fail — the same four date-based Prop Bingo star-index tripwires as
  Phases 1–2 (`tests/lib.sportsBingo.{nfl,mlb}-star-index*.test.ts`), untouched. `npm run test:bingo-nfl`: 292/294 (the
  same two). `npm run test:pickem-lines-sql` and `npm run test:pickem-points-sql` pass.
- **Unverified:** the screens in a browser/phone (shared production DB, migrations not applied), and grading against a
  live Saturday (fixture-based only). The partner/admin cards were checked by typecheck/tests only.

### 7. Open questions for Andrew
None blocking 4a.

### 8. Recommended first steps for Phase 4a (Opus 5.5 · high)
1. Read plan §2 (D4–D8), §4, §7 Phase 4a, and the Squares/Brackets pattern for per-definition `challenge_campaigns`
   columns kept out of `CAMPAIGN_SELECT_COLUMNS` (`lib/squaresPrizes.ts`, `lib/bracketPrizes.ts`).
2. The pick limit (D5) hooks into `submitPickEmPick` next to `resolvePickScoringMode`; changing sides on an existing
   pick must never count against the limit (the `existing` row is already loaded there).
3. College leagues: the Prize scope's league for college is `"College Football"` (`BDL_PATH_BY_SPORT_KEY` league label).
