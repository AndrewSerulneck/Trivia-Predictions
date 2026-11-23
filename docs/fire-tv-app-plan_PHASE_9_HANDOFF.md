# Fire TV app — Phase 9 handoff (sports data, cost baseline, state engine)

Written 2026-11-22 by the agent that did Phase 9 (Claude Opus 5.5, high effort, as the plan names).

## For Andrew (plain English)

**What changed.** The TV's "brain" (the server code that decides what each venue's TV shows) is ready for the new
sports carousel. Nothing new appears on screen yet; Phases 10 and 11 draw the slides.

- **The hour before Live Trivia.** From 60 minutes before a game (was 15), the TV shows only the pre-game screen.
- **Launch content.** Category Blitz, Super Bowl Squares and March Madness no longer show on any TV, the Silk Display URL
  included. The code is kept, and one switch turns them back on (reserved phase R2).
- **Data for the new slides.** The data is built and tested, but **switched off** until Phase 11 shows it, so it costs
  nothing before then:
  - today's games, ranked for each bar
  - this bar's picks per game
  - today's Pick 'Em top 5
  - the All-Time top 10
  - the bar's prizes
- **The "Every Thursday · 8:00 PM" wording** for the Next Live Trivia slide is written and tested.

**Your decision (D27).** You chose "Refresh only while a TV is on". The TV keeps one shared copy of today's games for
every bar. It asks the sports feed only while some TV is showing the carousel: every 2 minutes while games are on, and
much less often otherwise. No TV on means no feed requests. BallDontLie is a flat subscription, so it costs $0 more.

**Cost today.** In the last 24 hours, production served about 15 TV state requests: one short session, probably the
Phase 6 emulator test. So almost no TV is left on today. After this ships, each idle TV request does 4 small database
reads. In return it skips the Category Blitz check and the Squares/Bracket checks. Each idle request gets about 5 KB
bigger. That is not a material change. A counter now logs real numbers, so Phase 15 can compare.

**Is it live?** No. It's on branch `feat/fire-tv-phase-9`, in a pull request. When it merges and deploys:
- The 60-minute pre-game and the Category Blitz/Squares/Bracket switch-off go live on every TV.
- The usage counter starts.

**What needs you:**
1. **Merge the PR** (or tell me to). It switches Category Blitz off on Silk TVs right away. You asked for that (D21,
   D26), but you may prefer to wait until the TV app launches.
2. **OK to apply the database change** (`supabase db push`): two small server-only tables for the shared games copy,
   and one index. Nothing uses them until Phase 11, so any time before Phase 11 works.
3. **A separate bug I found in Pick 'Em (not fixed; your call).** NHL games get the wrong start time: noon UTC, which is
   7 AM New York. The feed sends a date-only field first, and Pick 'Em reads it before the real start time. So NHL Pick
   'Em games probably show as locked from 7 AM, and the list shows the wrong time. Fixing it changes NHL game ids, which
   settlement depends on, so it needs its own small, careful fix. The TV avoids the problem by reading the real start
   time itself.

## For the next agent (Phase 10)

### 1. Next phase goal and scope

Phase 10 (Sonnet 5.5 / high): build the **Pick 'Em Live Board** and **All-Time Leaderboard** slides in
`components/venue-screen/`, per mockups v2 sections D and E (`docs/fire-tv-app-plan_PHASE_1_MOCKUPS.src.html`, functions
`pickBoard`, `tile`, `leaderboard`). See the plan's Phase 10 steps. **Out of scope:** the carousel rotation, ticker,
"Get the app" corner QR, pre-game "LIVE TRIVIA" title (all Phase 11); turning the data on (Phase 11 flips
`TV_CAROUSEL_DATA_ENABLED`); Bingo (R1); Category Blitz/Squares/Bracket (R2); college basketball (D19).

### 2. Starting state

- Branch `feat/fire-tv-phase-9`, from `origin/main` at `8e50214e` (PR #38 merge). One commit for this phase (`25ab0f62`); PR #39 opened
  against `main` (see the PR link in the chat / `gh pr list`). **Not merged, not deployed** at the time of writing.
  Branch Phase 10 from `main` after this PR merges.
- **Left uncommitted on purpose** (not Phase 9 work, left in the working tree untouched):
  - `.claude/settings.json`: Andrew's `Bash(gh pr merge *)` permission.
  - `app/api/admin/route.ts` + `components/admin/sections/VenuesSection.tsx`: an Admin → Venues "display codes" column
    from another session.
  - Dozens of iCloud `"* 2.*"` duplicate files. Never commit them.
- **Migration `supabase/migrations/20261122174439_tv_sports_snapshot.sql` is NOT applied** to production
  (`pkmxupsayzshvpirkaav`). Andrew must OK `supabase db push`. Nothing reads the tables while `TV_CAROUSEL_DATA_ENABLED`
  is false, so this is not urgent, but **it must be applied before Phase 11 turns the data on.**
- No production data was written. Read-only checks only (`npm run tv:sports-inventory` and the live feed checks below).

### 3. Decisions already made (don't re-ask)

- **D27 (Andrew, 2026-11-22):** "Refresh only while a TV is on" (recorded in the plan's Decisions table; D8 is marked
  relaxed). Rejected: "no new feed calls" (the board would be empty most days: 38 picks in 30 days) and a cron.
- **Data off until Phase 11** (`TV_CAROUSEL_DATA_ENABLED = false` in `lib/venueScreenCarousel.ts`). This is the
  agent's cost choice: no reads or feed calls before a TV can show them. Phase 11 sets it to `true` after the
  migration is applied.
- **Ticker games are not a separate payload field.** The ticker is `tvTickerGames(pickEm.games, boardOnScreen)`
  (`lib/tvSportsRelevance.ts`): the top 12, skipping the board's 4 while slide 2 shows (D15).
- **Pick 'Em top 5 = today's record at this venue** (wins, then fewest losses; pushes and pending don't count). This
  matches the mockup's "9–3". Null when nobody has a settled pick today.
- **Prizes slide:** at most 3 prizes. Prizes for Squares/Bracket are hidden while those games are off (D21).
  `pointsRequired` is only for points-target prizes. There is **no end-date or progress-bar data**. The mockup's
  progress bar is per player, so it doesn't fit a TV. Phase 11 decides whether to drop the bar or ask Andrew.
- **Status rules:** live > starts within 2 h > final within the last hour > later today. A "live" game more than 8 h
  old is stale and dropped. When the feed gives a state (`status_state` / NHL `game_state`), it beats the clock.
- **Big-game boost:** only BallDontLie's `postseason` boolean (+3). There is no national-primetime field, so that
  boost was dropped, not faked.
- **League weights** follow the plan's D18 starting values, in `TV_LEAGUE_WEIGHTS`. The weight is judged at the
  game's local start time (not "now"), so 1 PM Sunday NFL games lead from the morning on.

### 4. Files created or changed

| File | What |
|---|---|
| `lib/tvSportsRelevance.ts` (new, pure) | Ranking: `rankTvSportsGames`, `classifyTvGame`, `leagueWeightAt`, `TV_LEAGUE_WEIGHTS`, `tvTickerGames`, `rankTvPickEmLeaders`, `localPartsOf`. Types `TvPickEmGame`, `TvSportsGameInput`. Constants `TV_PICKEM_BOARD_SIZE` 4, `TV_TICKER_MAX_GAMES` 12, `TV_SPORTS_MAX_GAMES` 16. **The only home of game ranking.** |
| `lib/tvSportsSnapshot.ts` (new, server-only) | Shared games copy: `readTvSportsGames`, `refreshTvSportsIfDue`, `scheduleTvSportsRefresh` (`after()`; one claim check per instance per 30 s), `nextTvSportsRefreshMs` (cadence), `TV_SPORT_KEYS`. |
| `lib/venueScreenCarousel.ts` (new, server-only) | `getVenueScreenCarousel(venueId, nowMs)`: 4 parallel bounded reads, then ranks, then schedules a refresh. `TV_CAROUSEL_DATA_ENABLED` switch. `summarizeVenuePicks`, `tvPrizeHeadline`. |
| `lib/venueScreenCarouselShared.ts` (new, pure) | Types `VenueScreenCarouselData`, `TvAllTimeEntry`, `TvPrize`; `EMPTY_CAROUSEL`; `debugCarousel("sunday" \| "weeknight" \| "empty", nowMs)` fixtures. **Client components import types from here or `tvSportsRelevance`.** |
| `lib/venueScreenUsageCounter.ts` (new) | `[tv-state]` summary log line per instance per 10 min (baseline). |
| `lib/venueScreen.ts` | Idle payload now `{ nextLiveTrivia, sponsorSlots, pickEm, allTimeLeaderboard, prizes }`. New precedence (below). D21 switch skips the Category Blitz peek/drive and the Squares/Bracket reads. Carousel read only when the screen would be idle. `selectVenueScreenState` takes `reservedGamesEnabled?` (tests). |
| `lib/venueScreenTiming.ts` | `LIVE_TRIVIA_PREGAME_LEAD_MS` 60 min; new `LIVE_TRIVIA_PREGAME_PRIORITY_MS` 15 min; `VENUE_SCREEN_RESERVED_GAMES_ENABLED = false` (the D21 switch, re-exported by `venueScreen.ts`); debug modes `pregame-hour`, `carousel`, `carousel-weeknight`, `carousel-empty`. |
| `lib/venueScreenDebug.ts` | Fixtures for the new modes. The plain `idle` fixture's next game moved from +45 min to +26 h (outside the new hour). |
| `lib/venueScreenIdleLine.ts` | New `formatNextLiveTriviaWhen` (D12 line + `showCountdown`) and `formatNextLiveTriviaShort` (ticker segment). Old `formatNextLiveTriviaLine` kept until Phase 11 moves its callers. |
| `lib/pickem.ts` | New exports `listPickEmTvFeedGames`, `pickEmFeedGameKey`, type `PickEmTvFeedGame`. The normalizer adds optional `homeAbbr/awayAbbr/isPostseason/tvStartsAt/tvFeedState/tvPeriodLabel`. **Pick 'Em's own fields and game ids are unchanged.** |
| `lib/tvAppDemo.ts` | Idle demo state spreads `EMPTY_CAROUSEL` (Phase 11 adds slides to the demo). |
| `app/api/venue-screen/state/route.ts` | Serializes once and feeds the counter (not for debug modes). Headers unchanged. |
| `supabase/migrations/20261122174439_tv_sports_snapshot.sql` | `tv_sports_games`, `tv_sports_refresh` (RLS forced, service_role only), function `claim_tv_sports_refresh(text[], int)` (execute: service_role only), index `pickem_picks (venue_id, starts_at)`. |
| `scripts/tv-sports-inventory.cjs` + `npm run tv:sports-inventory` | Read-only production sizing (picks, venues, zones, users with points, active prizes). |
| Tests | New: `tests/lib.tvSportsRelevance.test.ts`, `tests/lib.tvSportsSnapshot.test.ts`, `tests/lib.venueScreenCarousel.test.ts`, `tests/lib.nextLiveTriviaWhen.test.ts`. Updated: `tests/lib.venueScreen-pregame.test.ts` (60 min, D14, D21), `tests/bracket-tv.test.ts`, `tests/squares-tv.test.ts`, `tests/lib.venue-screen.test.ts` (run with `reservedGamesEnabled: true`, plus "off at launch" checks), two idle fixtures. |
| Docs | `docs/fire-tv-app-plan.md` (status, D27, D8 note, cost row); `docs/live-trivia-pregame-and-display-cleanup-plan.md` (D1 and Standing rules: 60 min, new precedence). |

**Precedence now** (only in `selectVenueScreenState`): Live Trivia > pre-game's last 15 min > Category Blitz (in play)
> pre-game 60→15 min > Squares > Bracket > idle. With the reserved games off (today) this is Live Trivia > pre-game hour
> idle.

**Idle payload for Phase 10/11** (`state.idle`, mode `idle`):
- `pickEm: { games: TvPickEmGame[] (ranked, ≤ 16; board = first 4), leaders: TvPickEmLeader[] | null } | null`
- `allTimeLeaderboard: { rank, username, points }[] | null` (null → skip slide 3)
- `prizes: { id, prize, name, pointsRequired }[] | null` (empty or null → skip slide 4)
- `nextLiveTrivia: { startsAt, title, firstRoundCategory, recurringDays }`; pass it to `formatNextLiveTriviaWhen` on the
  client, after hydration.
- A `TvPickEmGame` has `status`, `homeScore`/`awayScore` (null = unknown, show "–"), `periodLabel`, `picks` (null =
  unknown), `homePickPct` (null without picks), `homeAbbr`/`awayAbbr` (may be null: fall back to the team name).

### 5. Facts and traps

- **NFL Pick 'Em and other Pick 'Em game ids differ.** NFL is `id__start__AWAY__HOME`; the others are
  `id__start__home__away` (normalized). Both start with the provider id, so the TV joins picks to games on
  `pickEmFeedGameKey(sportKey, gameId)` = `<feed path>#<provider id>`. Pick sport keys can be short (`nfl`, `nba`);
  these map to the same feed path as the long keys.
- **NHL start-time bug in Pick 'Em (pre-existing, not fixed):** `extractEventStartIso` in `lib/pickem.ts` checks
  `game_date` (date-only, normalized to 12:00Z) before `start_time_utc`. NHL games show and lock at 7 AM ET, and
  `formatPeriodLabel` labels NHL periods "Inn. 1". The TV path uses `tvStartsAt`, `tvFeedState` and `tvPeriodLabel`
  instead ("P1 9:16"). Fixing Pick 'Em changes NHL game ids, so it needs its own careful plan.
- **NBA sends 0–0 scores before tip-off.** The ranking nulls scores for any game not yet started, so 0–0 never shows as
  a score early.
- **Vercel project id:** the live project is `prj_yjIvzEUquV1gPWBsgOIluVp8v1ci` (team `team_uGVCpxcJGBQ1VdCDO0lSMRZf`).
  The id in the memory note `reference_vercel_observability_plus_missing` (`prj_OpAN…`) returns no logs.
- **Logs:** Pro keeps runtime logs 1 day. MCP `get_runtime_logs` `group_by` counts only lines that log something. The
  state route logged nothing before this phase, hence the `[tv-state]` counter. `vercel logs --json -q "venue-screen/state"`
  showed only about 15 requests in 24 h. That CLI returned at most ~50 rows and failed with `--until`, so don't trust
  it for counts.
- **Live feed checks:** the feed was checked live once, read-only, through temporary vitest files (since deleted):
  `node --env-file=.env.local node_modules/.bin/vitest run tests/<tmp>.test.ts` with `vi.mock("server-only")`.
  `tsx --conditions=react-server` does **not** work (CJS require ignores the condition).
- **The scratch clone `rsync --exclude native`** also excluded `components/native`; re-copy it, or use
  `--exclude /native`.
- **Dev-only hydration warning (pre-existing):** `TvIdleAttract`'s 900 ms burn-in drift `transform` differs between
  server and client HTML. Not from this phase; Phase 11 replaces that screen and can fix it.
- Display copy must say "Prize", never "Reward" (`tests/prizes-wording-contract.test.ts`).
- `after()` from `next/server` throws outside a request; `scheduleTvSportsRefresh` catches that and runs in the
  background (scripts, tests).

### 6. Build, run, test; what was verified

- `npx tsc --noEmit -p .`: clean (ignoring `" 2"` duplicates).
- `npm run test`: 603 files passed, 1 skipped; 7,865 tests passed.
- `npx eslint` on every changed lib/test file: clean.
- **Live read-only feed check** (Sun 2026-11-22, ~12:40 PM ET):
  - NFL: 11 games, abbreviations present, `postseason:false`.
  - NBA: 7 games, scheduled.
  - NHL: CAR@NYR live "P1 9:16" at its real 17:30Z start.
- **Read-only carousel run against production** (switch flipped on for that run only, then back to `false`;
  confirmed by grep):
  - 373 ms, 5,049 bytes; 16 ranked games (NFL 1 PM kickoffs first, then the live NHL game).
  - All-Time top 10 read fine.
  - 0 prizes at that venue, which is correct: all 7 active campaigns are scoped to other venues.
- **Browser check** (scratch clone, no `.env.local`, stubbed state, `next dev --webpack -p 3123`, headless Chromium
  1920×1080):
  - `?mode=pregame-hour` renders "STARTS IN 59:27".
  - `carousel`, `carousel-empty` and `idle` render today's Get the app screen.
  - State API returns 8/7/0 games for `carousel`/`carousel-weeknight`/`carousel-empty`.
  - Only console errors: the pre-existing hydration warning above.
- **Not verified:**
  - the refresh against the real tables (migration not applied); the claim SQL was not run on Postgres
  - the 3–7 day baseline (it starts at deploy)
  - MMA and tennis TV feeds live
  - real TVs

### 7. Open questions for Andrew

1. Merge now, which switches Category Blitz/Squares/Bracket off on Silk TVs immediately? Or wait for the TV app launch?
2. OK to `supabase db push` the Phase 9 migration (needed before Phase 11)?
3. Fix the NHL Pick 'Em start-time bug as its own small plan?
4. Prizes slide: drop the mockup's progress bar (per player, so it doesn't fit a TV)? Phase 11 can ask.

### 8. Recommended first steps for Phase 10 (Sonnet 5.5 / high)

1. Read this note and the plan's Phase 10 section. Branch from `main` after this PR merges.
2. Build the slide components against `?mode=carousel` and `?mode=carousel-weeknight`. Fixtures come from
   `debugCarousel` (times relative to now, so live, soon and final always read right).
3. Import types only from `lib/tvSportsRelevance.ts` and `lib/venueScreenCarouselShared.ts` (both pure). Never from
   `lib/venueScreenCarousel.ts` (server-only).
4. Browser-test from a scratch clone with the stubbed `getVenueScreenState`, as in §6.
5. Leave `TV_CAROUSEL_DATA_ENABLED` alone (Phase 11). Tell Andrew if the migration still isn't applied by then.
6. **Baseline:**
   - Read `[tv-state]` lines once a day for 3–7 days after deploy with MCP `get_runtime_logs`:
     `projectId prj_yjIvzEUquV1gPWBsgOIluVp8v1ci`, `query "[tv-state]"`, `since "23h"`.
   - Sum `requests`, and note `avgMs`/`avgBytes`.
   - Then read `[provider-calls]` once Phase 11 is on.
