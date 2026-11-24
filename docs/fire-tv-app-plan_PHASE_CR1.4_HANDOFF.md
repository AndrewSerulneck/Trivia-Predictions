# Fire TV plan — Phase CR1.4 handoff (TV sports feed fixes: F15, F17, F18, F19, F20, F21, F22)

## For Andrew

The TV's sports screens now:
- treat a league with no games as "no games" instead of "no reply". Empty leagues are checked every 6 hours instead
  of every 30 minutes. That's about 1,200 fewer sports-data requests a day while any TV is on, still $0 on the flat
  plan. Only a real error triggers the 30-minute retry.
- never show a game at a made-up noon start (this mattered for tennis).
- label playoff hockey overtime correctly: "2OT", "3OT", and "SO" with no clock for a shootout. Pick 'Em shows the
  same labels.
- keep a final score up for one hour even if a database read fails (it could stay up to 8 hours before).
- work out "today" correctly in half-hour time zones (no effect on your venues, which are all on New York time).

Website only, so there's no app release. It goes live when the PR merges; the PR number and deploy check are recorded
below. Nothing needs you.

## For the next agent

### 1. Next phase and scope
Next in the phase table: **CR1.5** (TV Connect screen timing, Sonnet 5.5 / medium; `docs/fire-tv-app-plan.md`
"Phase CR1.5"), then CR1.6 (in `docs/bingo-pickem-reliability-plan.md`), CR2, CR3. CR1.7 waits for Amazon to approve
1.0.0. Out of scope for CR1.4, and not done: anything in CR1.5–CR1.7, and the MMA oddity in §5.

### 2. Starting state
- Branch `fix/tv-sports-feed-review` from `origin/main` `3a1bc61e` (PR #59 merge). One commit for code, tests and docs.
  The PR, CI and merge state are recorded in §6 once done.
- No migration, no data change, no env var, no `vercel.json` change. No backups needed.
- Other local branches are untouched (e.g. `fix/nfl-pickem-moved-game`, CR1.2.1, still unpushed).

### 3. Decisions (D38 in the plan)
- **F15: `ok` = every request answered, not "any".** The plan said `ok: anySucceeded`. With "any", one failed day (5xx)
  plus an empty other day reads as "no games": the refresh then deletes that league's live rows (the ghost delete
  runs for `ok` leagues) and waits 6 h. "Every" keeps the old rows and retries in 30 min. I checked the live feed on
  2026-11-24: all 24 request types (14 game paths × 3 days, tennis season and `is_live`, UFC events, 7 soccer teams
  lists) answered 200, so no league stays on the 30-minute retry.
- **F17: `extractTvStartIso` also reads `date` and `game_date`** (date-only strings are still skipped). Live check:
  NFL, college football, WNBA, MLB and every club soccer league give their kickoff **only** in `date` (a full ISO
  string). The plan's literal step ("skip rows where `tvStartsAt` is null") would have blanked them on the TV. NBA's
  `date` and NHL's `game_date` are date-only, so `datetime` / `start_time_utc` still win.
- **UFC rows now set `tvStartsAt`** from the event `date` (null only if that value is date-only). Before, UFC never set
  it and used the `startsAt` fallback, which the skip would have dropped.
- **F15 option taken:** a game counts as "later" (15-min pace) only within 18 h (`TV_SPORTS_LATER_HORIZON_MS`).
  A 6 h wait still reaches any game at least 12 h before it starts.
- **F19: documented, not flushed.** Vercel's docs say logs printed during shutdown (after SIGTERM) don't reach the
  dashboard, so a shutdown flush wouldn't work. Phase 15 step 1 now says to compare rates (requests ÷ minutes), not
  totals. The same note is in the header of `lib/venueScreenUsageCounter.ts`.
- **F22, plus a related gap:** the stored-finals read now covers every league being written, not only `ok` ones. A
  league with one failed request can still return games, and their finals used to get a fresh `final_seen_at`.

### 4. Files changed
- `lib/pickem.ts`
  - `extractTvStartIso`: adds `date`, `game_date` (TV-only; Pick 'Em's `extractEventStartIso` is untouched).
  - `formatHockeyPeriodLabel` (now exported): period ≥ 5 and not postseason → "SO" with no clock; postseason
    4 → "OT", n ≥ 5 → "{n−3}OT"; intermission keeps the name. **Shared with Pick 'Em `periodLabel` (intended, F18).**
  - `fetchTeamNameMapForSportKey(sportKey, failure?)` and `fetchBallDontLieEventsForSportKey(…, feedFailure?)`: a new
    optional flag, passed to `fetchBallDontLieList`'s existing `failure` param and set on rejected or thrown requests.
    Pick 'Em callers pass nothing, so their results are unchanged (Pick 'Em ids and starts are pinned by
    `tests/lib.pickem-nhl-start-time.test.ts`, which still passes).
  - `listPickEmTvFeedGames`: `ok: !feedFailure.failed`; `continue` when `event.tvStartsAt` is null.
- `lib/tvSportsSnapshot.ts`: `TV_SPORTS_LATER_HORIZON_MS` (18 h) in `nextTvSportsRefreshMs`; the final-seen read uses
  the sport keys of the games being written; on a read error it logs `[tv-sports] final-seen-read-failed` and leaves
  `final_seen_at` out of every upserted row. PostgREST only updates the columns it is given, so stored values stay. A
  newly final game then gets its `final_seen_at` on the next refresh.
- `lib/venueScreenCarousel.ts`: `localDayBounds` (now exported) steps in 15-minute increments.
- `app/api/venue-screen/state/route.ts`: `bytes: Buffer.byteLength(body)`.
- `lib/venueScreenUsageCounter.ts`: comment only (the F19 limit).
- Tests: `tests/lib.tvSportsFeed.test.ts` (new, 10 tests: the real `lib/balldontlie.ts` against a stubbed `fetch`);
  `tests/lib.tvSportsSnapshot.test.ts` (+3: 18 h horizon, F22 read error, read covers a failed league);
  `tests/lib.venueScreenCarousel.test.ts` (+1: Kolkata, Kathmandu, St John's, New York, DST fall-back);
  `tests/lib.pickem-nhl-start-time.test.ts`: the one intended change, "SO 0:00" → "SO", plus a "2OT 6:07" case.
- Docs: `docs/fire-tv-app-plan.md` (status line now also records CR1.3; phase row; F15–F22 marked done; D38; cost
  table; Phase 15 step 1; CR1.4 "Done" note).

### 5. Facts and traps
- **BallDontLie start fields by league (live, 2026-11-24):** NFL, NCAAF, WNBA, MLB, MLS, EPL, La Liga, Serie A,
  Ligue 1, Bundesliga, UCL → `date` (full ISO only). NBA → `datetime` + date-only `date`. NHL → `start_time_utc` +
  date-only `game_date`. World Cup → `datetime`. ATP / WTA → `scheduled_time` (the tournament's `start_date` is
  date-only). UFC events → `date` (full ISO), plus `main_card_start_time` / `prelims_start_time` when known.
- **NHL:** `postseason` is a boolean on every row. A regular-season shootout arrives as period 5 with
  `time_remaining: "00:00"`; playoff period 5 carries a real clock.
- **World Cup** ignores `dates[]` (each day returns 100 rows of the whole tournament, so it's paged and truncated).
  Harmless, because rows are filtered by start time. It's an extra ~6 requests per round, unchanged by this phase.
- **Not fixed (out of scope):** UFC's TV start is the event's earliest card time (e.g. early prelims). Older 2026
  events have `date` at `T04:00:00Z` (local midnight). With no feed state, the TV shows every fight of a card as
  "live" from that time. Worth a finding in CR2 if it matters.
- **Residual F15 risk (accepted when Andrew approved F15):** a BallDontLie glitch that answers 200 with an empty list
  during live games now reads as "no games". That league's rows are deleted (when another league has games) and it
  waits 6 h. Before, it kept its rows and retried in 30 min.
- **Tooling:** BallDontLie checks ran as `node --env-file=.env.local <script>` (values never printed). To run the real
  TV feed live, put a throwaway `tests/tmp-*.test.ts` that mocks only `server-only` and `@/lib/supabaseAdmin`, run
  `node --env-file=.env.local node_modules/.bin/vitest run <file>`, then delete it.

### 6. Build, test, verification
- `npm run test`: 612 files pass (1 skipped, as on `main`). `npx tsc --noEmit` clean. eslint clean on every changed file.
- The new tests fail on the old code (checked by stashing `lib/` and `app/`): 12 fail, including F15 empty → ok, F17
  tennis / NFL-date / NBA-no-time, F18 labels, F20 bytes, the 18 h horizon and both F22 tests. The UFC test passes on
  both versions on purpose: it guards that the skip doesn't drop UFC.
- **Live feed, old vs new code, same minute (2026-11-24 ~22:55 UTC):** the same game counts in every league (NFL 1,
  NCAAF 2, NBA 12, NHL 15, MLS 1, UCL 18, the rest 0). The only difference is `ok`: WNBA, MLB, EPL, La Liga, Serie A,
  Ligue 1, Bundesliga and UFC went from "no reply" to ok.
- **Production before the deploy (select only):** `tv_sports_refresh` due times were last written 2026-11-23 ~22:29
  UTC. No TV had polled the carousel for ~24 h, so actual usage today is zero. MLB, WNBA, UFC, Ligue 1 and Bundesliga
  were on the 30-minute no-reply interval, which confirms F15.
- **Cost:** with a TV on all day and 2026-11-24's mix, 8 empty leagues × 27 requests a round × 48 rounds ≈ 1,300 a
  day before, versus × 4 rounds ≈ 110 after. On top of that, a league whose only games are more than 18 h out saves
  up to ~90 rounds a day. BallDontLie is a flat plan ($0). Vercel function time and Supabase writes per refresh drop
  in proportion. No new cron, poll or paid call.
- **PR / CI / deploy check:** see §9.

### 7. Open questions
None.

### 8. Recommended first steps for CR1.5
Read "Phase CR1.5" in `docs/fire-tv-app-plan.md` and findings F7–F11 and F35. Branch `fix/tv-connect-timing` from
`origin/main`. Use Sonnet 5.5 / medium as the table names.

### 9. PR and deploy
(Filled in after the merge.)
