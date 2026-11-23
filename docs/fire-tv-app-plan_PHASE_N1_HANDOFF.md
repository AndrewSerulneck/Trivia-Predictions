# Fire TV app plan — Phase N1 handoff (NHL Pick 'Em start time: investigate and decide)

**Date:** 2026-11-23 · **Agent:** Claude Code, Opus 5.5 / high (as the plan names) · **Read-only phase:** no code
changed, nothing written to production, nothing deployed.

## Summary for Andrew

- **What I found.** The bug is real and worse than the plan thought. NHL Pick 'Em treats every game as starting at
  7 AM New York, so every NHL game locks at 7 AM. Then, 4 hours later (11 AM New York), the grader sees the feed's
  pre-game score of 0–0 and would grade every NHL pick as a tie ("push") before the puck drops.
- **Has it hurt anyone?** No. Production has **no NHL picks at all**, ever (137 Pick 'Em picks in total, none NHL).
  Most likely because by the time anyone opens NHL Pick 'Em, every game already shows as locked.
- **Only NHL is affected.** I pulled a real day of data from every league Pick 'Em uses. All the others send a real
  start time first.
- **The fix I chose (N2 builds it):** read the real start time first, in every league. Because no NHL pick exists,
  nothing needs moving or remapping: no migration, no data change. N2 also adds one safety rule: a game the feed
  still calls "scheduled" is never graded. And NHL games in progress will show "P2 9:22" instead of "Inn. 2".
- **Needs you?** No. N2 can start straight away. You can overrule the choice (see "Decision" below), but you don't
  need to answer anything.

---

## For the next agent (Phase N2)

### 1. Goal and scope

**N2 goal:** NHL Pick 'Em shows and locks at the real puck-drop, grades only after the game, and labels hockey
periods. Website only; no store release (CLAUDE.md: website changes need none).

**In scope:** `lib/pickem.ts` (start-time choice, NHL period label, the "scheduled" grading guard), tests, PR,
merge, deploy check.

**Out of scope (do not do in N2):**
- The TV path (`tvStartsAt`, `tvFeedState`, `tvPeriodLabel`, `lib/tvSportsSnapshot.ts`, `lib/tvSportsRelevance.ts`).
  It already works; leave its fields and behaviour alone (you may update the `tvStartsAt` comment, which describes the
  bug).
- Any migration or data change. None is needed (§3). If the pre-deploy check in §8 step 6 finds NHL picks, stop and
  read §3's fallback.
- The wider "grade from scores 4 h after start" rule for live games in other leagues (§5, item 6). It's a separate
  follow-up for Andrew to schedule.
- MMA's "whole card locks at the first fight" behaviour (§5, item 5). That's by design, not this bug.

### 2. Starting state

- Branch `main`, last commit `2e81f9a7` ("Merge pull request #47 …"). Working tree was clean before N1.
- N1 changed only docs: this file (new) and `docs/fire-tv-app-plan.md` (status line, N1 row, D33, N2/N3 step text).
  **Not committed** at the time of writing; check `git status` and commit them on your N2 branch (or ask Andrew) if
  they're still uncommitted.
- Production: untouched. No backups needed, no undo log, no scripts run that write anything.

### 3. Decision (D33 in the plan) and why

**Chosen fix: "prefer a real timestamp" in every league (not the planner's "keep the id").**

`extractEventStartIso` (`lib/pickem.ts` ~line 557) should take the first candidate that is a **full timestamp**,
and only if none exists fall back to the first **date-only** value (normalised to 12:00Z as today). Keep the
candidate order otherwise exactly as it is.

Effects:
- NHL: `startsAt` becomes `start_time_utc` (real puck-drop). Its `game_id` changes from
  `<id>__<game_date>T12:00:00.000Z__<home>__<away>` to `<id>__<start_time_utc>__<home>__<away>`.
- Every other league: **no change** to `startsAt` or `game_id`. Each already has a full timestamp ahead of any
  date-only field (table in §5). NBA keeps `datetime` (it's earlier in the list than `date`); a TBD NBA game with no
  `datetime` still falls back to `date` at noon, exactly as today.

Why not the planner's "keep the id, fix the time" (build NHL's id from the noon value, use the real time elsewhere):
- Its only purpose was to avoid stranding existing NHL picks. **There are none** (§4), and no NHL rows in any table
  keyed on a Pick 'Em `game_id`.
- It would leave a permanent NHL-only quirk (an id holding a fake noon time beside a real `startsAt`) that a future
  agent will trip on. The chosen fix keeps one rule for all leagues and protects any future league whose feed puts a
  date-only field first.

**Fallback (only if §8 step 6 finds pending NHL picks with a `T12:00:00.000Z` id):** either wait for those games to
finish and settle before deploying (simplest, normal case), or switch to the planner's keep-the-id variant. No remap
migration is warranted for a handful of rows; ask Andrew if it's more than that.

**Extra rule N2 adds (part of D33):** in `settlePendingPickEmPicks`, never grade a pick from scores when the score
row's `status_state` is `"scheduled"` (a game that hasn't started can't be over). Today the rule
`canFinalizeFromScores = homeScore !== null && awayScore !== null && isStale` (4 h after `starts_at`) grades a
not-yet-started NHL game as 0–0 → push, because the NHL feed sends `home_score: 0, away_score: 0` before the game.
With the start-time fix NHL no longer reaches that rule early, but the guard costs nothing and stops any league
from doing the same. It only makes grading stricter (waits), and the 8-day stale cancel still cleans up. It must
not touch the College Football gates (`collegeFootballGradeGate` already handles that league).

**NHL period label:** reuse the TV's hockey helper. Rename `formatTvHockeyLabel` → `formatHockeyPeriodLabel` (one
helper, two callers) and, in `fetchBallDontLieEventsForSportKey`, set `periodLabel` from it for the NHL path
(`provider.path.startsWith("/nhl/")`, the same test `tvPeriodLabel` already uses). Leave `tvPeriodLabel` as it is
(the TV reads `tvPeriodLabel ?? periodLabel`, so its output doesn't change). The list shows `periodLabel` only while
a game is live (`getGameStatusLabel`, `components/pickem/PickEmGameList.tsx:185`), so a final game's "P3 0:00"
never shows.

### 4. Evidence

**Feed (read-only BallDontLie calls, 2026-11-23; ~25 calls on the flat subscription).** Script:
`/private/tmp/claude-501/-Users-andrewserulneck-Documents-Trivia-Predictions/f718585b-15c2-4d83-82b4-56f4bc4b526b/scratchpad/n1/feed.mjs`
(scratch; may be gone — it just prints start/score/status fields of `GET <path>?per_page=100&dates[]=<day>` per
league; run with `node --env-file=.env.local <script> <YYYY-MM-DD> [NHL,NBA,…]`).

NHL rows (real, `/nhl/v1/games`):
```
2026-11-22 id=3328423 EDM@STL {"game_date":"2026-11-22","start_time_utc":"2026-11-23T00:00:00.000Z","home_score":5,"away_score":4,"game_state":"OFF","status_state":"final","period":5,"time_remaining":"00:00","in_intermission":false}
2026-11-23 id=3328426 CBJ@NJD {"game_date":"2026-11-23","start_time_utc":"2026-11-24T00:00:00.000Z","home_score":0,"away_score":0,"game_state":"FUT","status_state":"scheduled","time_remaining":"00:00"}
2026-11-23 id=3328431 ANA@SEA {"game_date":"2026-11-23","start_time_utc":"2026-11-24T02:40:00.000Z","home_score":0,"away_score":0,"game_state":"FUT","status_state":"scheduled","time_remaining":"00:00"}
```
NHL rows have no `scheduled_time`, `starts_at`, `datetime` or `date`, so today's candidate order reaches
`game_date` (date-only → 12:00Z) before `start_time_utc`. Scheduled rows carry 0–0 scores (not null).

**Production (read-only, `node --env-file=.env.local`, service role, 2026-11-23 ~21:35Z):**
| Check | Result |
|---|---|
| NHL picks (`sport_slug = nhl` or `sport_key` in `icehockey_nhl`, `nhl`), any status, all time | **0** |
| …open (pending) / created in the last 30 days | 0 / 0 |
| All `pickem_picks` rows | 137; **none** with `starts_at` at exactly 12:00:00Z in any sport |
| `pickem_prize_tiebreakers` NHL rows | 0 |
| `pickem_venue_frozen_lines` NHL rows | 0 |
| `pickem_game_lines` NHL rows | 0 |

So no current pick shows the lock problem, and no player data depends on the NHL id format.

### 5. Facts and traps

1. **Start fields by league** (one real day each; MLB/WNBA from July 2026, UCL from 2026-11-04 because they're off
   season or midweek). "Picked today" = what `extractEventStartIso` uses now.

   | League (path) | Start fields in the row | Picked today | OK? |
   |---|---|---|---|
   | NBA `/nba/v1/games` | `date` "2026-11-22" (date-only), `datetime` full | `datetime` (earlier in list) | Yes |
   | WNBA `/wnba/v1/games` | `date` full ISO | `date` | Yes |
   | MLB `/mlb/v1/games` | `date` full ISO | `date` | Yes |
   | **NHL** `/nhl/v1/games` | `game_date` date-only, `start_time_utc` full | **`game_date` → 12:00Z** | **No** |
   | NFL `/nfl/v1/games` | `date` full ISO | `date` | Yes |
   | College Football `/ncaaf/v1/games` | `date` full ISO | `date` | Yes |
   | MMA `/mma/v1/fights` (own branch, ~line 1019) | `event.date` full ISO = card's first bell; also `event.main_card_start_time` etc. | `event.date` | Yes (by design: the whole card locks at its first fight) |
   | ATP / WTA `/atp|wta/v1/matches` | `scheduled_time` full; `tournament.start_date` date-only (fallback only) | `scheduled_time` | Yes |
   | MLS, EPL, La Liga, Serie A, Ligue 1, Bundesliga, UCL | `date` full ISO | `date` | Yes |
   | FIFA World Cup `/fifa/worldcup/v1/matches` | `datetime` full | `datetime` | Yes |

2. **Every place a Pick 'Em `game_id` is stored or matched** (grep of `game_id`/`gameId` in `lib/`, `app/api/`,
   `components/`, `supabase/migrations/`):

   | Where | Keyed how | NHL rows today | If the NHL id changes |
   |---|---|---|---|
   | `pickem_picks.game_id`, unique `(user_id, game_id)` (`20260427113000_add_pickem_tables.sql`) | exact id | 0 | An old-format pick wouldn't show as picked in the list (`listUserPicksByGameId` → `picksByGameId.get(event.id)`; the `providerEventId` fallback there never matches a full stored id), and the player could pick again (the unique index allows a new id). Settlement still finds the game: exact id → provider id → team names. |
   | `submitPickEmPick` existing-pick lookup | exact `game_id` | — | Same as above. Note: a side switch is locked by the **stored** `existing.starts_at`, not the game's. |
   | `pickem_venue_frozen_lines`, `pickem_game_lines` (`lib/pickemFrozenLines.ts`, `lib/pickemGameLines.ts`) | `(sport_key, game_id)` | 0 | None: only `isSpreadLineSportKey` sports use them, which is College Football alone (`ODDS_PATH_BY_SPORT_KEY`). |
   | `pickem_prize_tiebreakers.game_id` + `game_starts_at` (`lib/pickemPrizeTiebreaker.ts`) | exact id, then provider id, searched ±12 h around `game_starts_at` | 0 | None now. (Trap if rows ever existed: a stored noon start can be >12 h from a West-Coast puck-drop, so `pickemPrizeGameTotal` would never find it.) |
   | `lastPickEmPrizeGame` (tiebreaker game = latest start) | `startsAt` | — | Becomes correct: today NHL's fake noon makes an NHL game lose "latest start" to evening NBA games. |
   | `nfl_pickem_game_lines`, `nfl_pickem_tiebreakers` (`lib/nflPickEm.ts`, `lib/nflPickEmTiebreaker.ts`) | NFL ids | n/a | NFL only; unaffected. |
   | TV: `tv_sports_games` + `pickEmFeedGameKey` (`lib/venueScreenCarousel.ts:177`) | feed path + **provider id** only | — | None. |
   | `lib/admin.ts` ~3149 (admin settle) | groups picks by stored `game_id` | 0 | None. |
   | `push_game_reminder_optins` | **Live Trivia** `(user_id, schedule_id, occurrence_date)` | n/a | Not a Pick 'Em table; the plan listed it by mistake. |
   | `app/api/webhooks/balldontlie` `game_id` | Bingo player stats | n/a | Not Pick 'Em. |

3. **The 0–0 push trap** (why the guard matters): `settlePendingPickEmPicks` reads pending picks with
   `starts_at <= now`; `isStale = now - starts_at >= 4 h`; `canFinalizeFromScores = scores non-null && isStale`;
   `resolveStandardPickEmSettlement` turns 0–0 into `"push"`. NHL scheduled rows have 0–0. With the noon start every
   NHL pick would be pushed at 16:00Z. The score row already carries `status_state` (`BallDontLieScoreEvent`, built in
   `fetchScoresForSportKey` ~line 1395), so the guard needs no new fetch.
4. **Day filtering stays right after the fix.** The list keeps a game when `toLocalDateKey(startsAt, tz)` equals the
   venue's local day. A 7 PM ET game (00:00Z next day) still lands on the right local day; the feed is queried by
   `dates[]` for each UTC day the local day spans, and BallDontLie filters NHL by `game_date`, so late games are fetched.
   `submitPickEmPick`'s "today only" check uses the same local-day key.
5. **Win notifications group by `row.starts_at.slice(0, 10)` (UTC date)** in `settlePendingPickEmPicks`. After the
   fix an evening NHL win groups under the next UTC date, exactly like NBA/NFL evening games today. Pre-existing; not
   N2's job.
6. **Follow-up for Andrew, not N2:** the same 4-hour rule can grade a game that is still **live** (e.g. MLB extra
   innings or a rain delay past 4 h) from its in-progress score in any league except College Football. Guarding on
   `status_state === "in_progress"` too is riskier (a feed stuck "in progress" would hold picks until the 8-day
   cancel), so it needs its own look. Mention it in N2's handoff as an open item.
7. **Test harness pattern:** `tests/lib.pickem-college-football.test.ts` and `tests/lib.pickem-stale-pending.test.ts`
   mock `@/lib/balldontlie` (`fetchBallDontLieList`), `@/lib/supabaseAdmin`, `@/lib/venueGameSettings`,
   `@/lib/challengeCampaigns` and `server-only`, then call `listPickEmGames` / `settlePendingPickEmPicks`. Reuse it.
8. `.env.local` is append-only; the read-only scripts above used `node --env-file=.env.local` and never print values.

### 6. How to build, run, test

- `npm run test` (Vitest), `npm run lint`, `npx tsc --noEmit` (not at the same time as `npm run build`).
- Never use Andrew's dev server on :3000 for writes; dev and production share one database.
- N1 verified only by reading code, live feed rows and production counts. **Nothing about the fix is verified yet.**

### 7. Open questions for Andrew

None blocking. Andrew may overrule D33 (e.g. prefer the planner's keep-the-id variant); N2 should start unless he
has.

### 8. N2's exact steps (Opus 5.5 / high, per the plan)

1. `git switch main && git pull --ff-only`, then `git switch -c fix/nhl-pickem-start-time`.
2. **Tests first** (new file, e.g. `tests/lib.pickem-nhl-start-time.test.ts`, using §5 item 7's mocks and the NHL
   rows in §4):
   - An NHL row with `game_date` + `start_time_utc` gives `startsAt = start_time_utc` and
     `game_id = "<id>__<start_time_utc ISO>__<home>__<away>"`.
   - One real-shaped sample row per other league (fields in §5 item 1; NBA with both `date` and `datetime`, and an
     NBA row with `datetime: null` → noon) gives the **same** `startsAt` and `game_id` as before the change. Write
     these expectations as literal strings so the test fails if any league's id ever moves.
   - Pick open/locked: with fake timers, a pick on an NHL game at 16:00Z for a 00:00Z start is accepted
     (`isLocked` false); at/after 00:00Z it's locked.
   - Settlement: a pending NHL pick past 4 h of its `starts_at` whose score row is `status_state: "scheduled"`, 0–0,
     stays pending; the same pick with `status_state: "final"` and a real score grades won/lost. Existing
     College Football and stale-pending tests still pass unchanged.
   - Period label: a live NHL row (`period: 2, time_remaining: "09:22"`) → `periodLabel` "P2 9:22"; intermission →
     "Int 2"; period 4 → "OT"; never "Inn.".
3. Change `extractEventStartIso` (two passes: full timestamps first, then date-only), add the `"scheduled"` guard to
   `canFinalizeFromScores` (non-college picks only), and wire `formatHockeyPeriodLabel` into NHL `periodLabel`.
   Update the `tvStartsAt` type comment (it describes the old bug).
4. Standing rules: points move only via `pay_pickem_points` (don't touch payout); never re-grade won/lost picks (the
   guard only skips pending ones); "missing data is unknown, never zero".
5. `npm run test`, `npm run lint`, `npx tsc --noEmit`; PR (website only, no store release); merge when CI is green.
6. **Right before merge/deploy, re-run the production check** (read-only):
   `pickem_picks` where `sport_key in ('icehockey_nhl','nhl')` and `status = 'pending'`. Expected 0. If any exist
   with a `T12:00:00.000Z` id, follow §3's fallback.
7. After deploy, open NHL Pick 'Em on production on a game day: times should match the real puck-drops and games
   should be pickable after 7 AM New York. Record in `docs/fire-tv-app-plan_PHASE_N2_HANDOFF.md`, update the plan's
   status line and N2 row; N3 does the full game-day check.
