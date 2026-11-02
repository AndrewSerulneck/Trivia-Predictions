# Pick 'Em plan: Phase 2 handoff (College Football, pick the winner) + backlog change

Plan: `docs/pickem-college-football-and-prize-plan.md`. Phase 2 built 2026-10-31.

## For Andrew (plain English)

**What changed**
- **Old uncollected points are no longer paid (your call: "Just get rid of them").** When the database
  change goes in, every correct pick that was graded more than 24 hours earlier and never collected
  (the 48 picks / 480 points measured today, mostly test players) is marked as handled with 0 points.
  Nobody gets a surprise score jump from games months ago. Wins from the last 24 hours (last night's
  games) are still paid, so a real player who won last night isn't shorted.
- **College Football is in Pick 'Em.** A 🏈 button joins the sport row. It lists FBS games (any game
  with at least one FBS team, so Alabama vs an FCS school is in; FCS-only games are hidden). Last
  Saturday that was 44 of 97 games. Live games show "Q3 · 8:12", "Halftime" or "OT".
- A college pick is graded only when the provider says the game is over **and** both scores are in.
  A game with no final 48 hours after kickoff (postponed, data gap) cancels the pick: no points either way.
- **NFL signpost:** under the sport row, one grey line: "Looking for the NFL? NFL Pick 'Em is its own
  game. Open NFL Pick 'Em" (the last part is a link to NFL Pick 'Em).

**Is it live?** No. Nothing committed, pushed or deployed; neither migration applied (`main` is frozen for App Store review).

**What needs you, after App Store approval:**
1. Apply both migrations (`supabase db push`) **before or together with** the deploy:
   `20261031182914_pickem_automatic_points.sql` (Phase 1 + the backlog cancel) and
   `20261031185853_add_ncaaf_to_pickem_sport_slug_constraint.sql`. Without the second one, the College
   Football button shows games but every pick fails with an error.
2. Phone check on a Saturday: open Pick 'Em → 🏈, make a pick, and tap the NFL line (it should open NFL Pick 'Em).

## For the next agent (Phase 3: College Football spreads + Game Settings)

### 1. Goal and scope
Plan §7 "Phase 3": `venue_game_settings.cfb_pickem_scoring_mode` (default `spread`), `pickem_picks.scoring_mode`
stamping for college, a new `pickem_game_lines` table (with the `service_role` grant), line fetch from
`/ncaaf/v1/odds?season&week` before kickoff only, settlement locks but never fetches/creates, "Line coming soon",
the 48-hour no-line cancel, line on team buttons, and the Game Settings choice (owner page + admin + both routes).
**Out of scope:** any Prize work (Phases 4–6), spreads for other sports.

### 2. Starting state
- Branch `after-app-review`, last commit `407e4da2` (unrelated). **Phases 1 and 2 are uncommitted** in the
  working tree (Andrew hasn't asked for a commit). Nothing pushed or deployed.
- Migrations NOT applied: `20261031182914` (edited in Phase 2, still never applied anywhere, so editing it was
  safe) and the new `20261031185853`. Never `supabase db push` / push `main` / change Production env until Andrew
  confirms App Store approval.
- No production data changed. Production access this phase: read-only BallDontLie calls to capture fixtures.

### 3. Decisions already made (don't re-ask)
- **D12 (2026-10-31):** the old backlog is cancelled, not paid (replaces D11's payout). Implemented as a one-time
  `update` at the end of the Phase 1 migration: `status = 'won' and reward_claimed_at is null and resolved_at <
  now() - 24 h` → `reward_claimed_at = now(), reward_points = 0`. Chosen without asking: the 24 h grace (so last
  night's real wins are paid), and `reward_points = 0` (career stats sum `reward_points` of handled picks, and
  these were never paid; side effect: an old NFL week leaderboard for those test users shows 10 fewer points per
  forfeited pick — accepted, they were never paid).
- FBS = at least one FBS team (plan §4). The signpost is a direct link (not "find it in the games menu"): shorter, and
  `/nfl-pickem` is a player screen allowed in the app.
- Chosen without asking: college picks never use the 4 h "stale → grade from scores" shortcut (games run long; a
  not-started game reports 0–0); a 48 h no-final cancel instead. Phase 3's spread path should keep this gate.

### 4. Files created or changed
- **`lib/pickemCollegeFootball.ts`** (new leaf, no imports): `COLLEGE_FOOTBALL_SPORT_KEY`
  (`americanfootball_ncaaf`), `FBS_CONFERENCE_IDS` (1–11), `isFbsCollegeFootballGame(record)`,
  `formatCollegeFootballPeriodLabel(record)`, `collegeFootballGradeGate(...)` → `grade|wait|cancel`,
  `COLLEGE_FOOTBALL_NO_FINAL_CANCEL_MS` (48 h), `NFL_PICKEM_SIGNPOST` (copy + href).
- **`lib/pickem.ts`**: `PickEmSportSlug` gains `ncaaf`; `BDL_PATH_BY_SPORT_KEY` entry → `/ncaaf/v1/games`, league
  "College Football"; `PICKEM_SPORTS` entry (slug `ncaaf`, "College Football", "FBS", before NFL);
  `fetchBallDontLieEventsForSportKey` drops non-FBS games and uses the college period label;
  `settlePendingPickEmPicks` applies `collegeFootballGradeGate` to `sport_key = americanfootball_ncaaf` rows
  (`wait` → skip, `cancel` → `canceled`, `grade` → the existing outright path). The provider's shape
  (`home_team`/`visitor_team`, `home_score`/`away_score`, `status` "pre"/"in"/"post") already fit the generic
  normaliser; nothing else changed.
- **`components/pickem/PickEmGameList.tsx`**: `ncaaf` in its slug union and `SPORT_ICONS` (🏈); the signpost line
  under the sport row (today view only, `data-testid="pickem-nfl-signpost"`). The sport row is a 7-column grid and
  there are now exactly 7 regular sports: an 8th needs a layout change.
- `components/pickem/PickEmSportSelect.tsx`: icon only (this component is **unused**: nothing imports it; the real
  sport chooser is the icon row inside `PickEmGameList`).
- **`supabase/migrations/20261031182914_pickem_automatic_points.sql`**: backlog cancel added (above); header comment updated.
- **`supabase/migrations/20261031185853_add_ncaaf_to_pickem_sport_slug_constraint.sql`** (new): CHECK now includes `ncaaf`.
- `scripts/test-pickem-points-sql.cjs`: proves the backlog cancel (old win → 0 points + stamped, last-hour win paid,
  loss and already-collected untouched).
- Tests: **`tests/lib.pickem-college-football.test.ts`** (13: conference ids vs provider names, FBS filter 44/97,
  labels, grade gate, sport list, games list from the fixture incl. the Friday-night game landing on Friday, grading
  win/loss, 5 h in-progress stays pending, 48 h cancel, signpost). Fixtures in `tests/fixtures/pickem-ncaaf/`:
  `conferences.json`, `games-2026-10-24.json` (all 97 games, minified), `games-2026-10-31-sample.json` (6 games:
  pre, halftime, OT, Q4, post, FCS-only).
- `CLAUDE.md` Pick 'Em section and the plan's status line + D12.

### 5. Facts and traps
- Provider `/ncaaf/v1/games?dates[]=` returns ~97–98 D1 games per Saturday, ~45 FBS; `per_page=100` with 2 pages
  covers it. `dates[]=2026-10-24` includes a 02:30Z game (Friday night Eastern): the local-day filter handles it.
- Not-started games report `home_score: 0, away_score: 0` (not null). Live: `status "in"`, `status_state
  "in_progress"`, `period` 1–4 (5+ = OT), `time` "12:28"; halftime = period 2, "0:00". Final: `status "post"`.
- The generic `formatPeriodLabel` would have shown "Inn. 4" for football (MLB fallback): that's why college has its own.
- Settlement's score fetch for a sport is 15 day-queries (±7 days) per run while any pick of that sport is pending:
  for college that's ≈15 provider calls/minute on Saturdays, same shape as every other sport. Games list = 2 calls per view.
- `npm run pickem:unpaid-report` (Phase 1, read-only) still counts every unpaid win; after the migration it should
  report only wins from the last 24 h before it ran.
- No browser pass was run (the DB is shared with production and the constraint migration isn't applied).

### 6. Build / test / verification
- `npx tsc --noEmit` clean; `npx eslint` on changed files clean; `npm run build` passes; `npm run test:pickem-points-sql` passes.
- `npm run test`: 5,787 pass / 13 skipped / 4 fail: the same four date-based Prop Bingo star-index snapshot
  tripwires as in Phase 1 (`tests/lib.sportsBingo.{nfl,mlb}-star-index*.test.ts`), untouched by this work.
  `npm run test:bingo-nfl`: 292/294 (the same two).
- Unverified: the screen on a phone/browser; real grading against a live Saturday (fixture-based only).

### 7. Open questions for Andrew
None blocking Phase 3.

### 8. Recommended first steps for Phase 3 (Opus 5.5 · high)
1. Read plan §5 (NFL spread lesson) and `docs/nfl-pickem-spread-line-settlement-locking-fix-plan.md`; reuse the NFL
   vendor rule. Capture `/ncaaf/v1/odds?season=2026&week=9` into `tests/fixtures/pickem-ncaaf/` (key via
   `node --env-file=.env.local`, never print it).
2. Keep `collegeFootballGradeGate` in front of spread grading too, and add the 48 h no-line cancel next to it.
3. The new table needs `service_role` grants in the same migration (`supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`).
