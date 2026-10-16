# Partner Results page — Phase 2 handoff

Plan: `docs/partner-results-page-plan.md`. Phase 2 = registry, Live Trivia adapter, reward placement, timeline API
(server only).

## Summary for Andrew (plain English)

- **What changed:** the server can now build the new Results page as one timeline: each venue's games, newest first,
  with every reward placed where it belongs (on the game it was won at, on its day, or at the end of its week). It is
  a new address, `GET /api/owner/results`, that nothing on screen calls yet. The old Game Results sheet works exactly
  as before (its game list now runs through the new code underneath).
- **Checked on real data (read-only):** Garden State Bar's "Live Trivia Challenge" (top 3 each week, Wed/Thu/Fri)
  lands on the Friday of each week, including the three weeks nobody scored (shown with "Nobody scored this week.").
  August weeks that were paid on Oct 14 by the backfill stay in August. General Saloon's rewards appear even in
  stretches with no Live Trivia games.
- **Live?** No. Committed locally on `main`; not pushed or deployed. Nothing a partner sees has changed.
- **Left:** Phases 3–5 (full standings + player breakdown, the new screen, cleanup).
- **Needs you (not blocking):** one question, see "Open questions" below: General Saloon's **single-night weekly**
  rewards ("General Saloon - Saturday", "General Saloon - Sunday Challenge") show as a row at the end of their week, as
  the plan says. Would you rather they sit on that night's game card when there is one?

## For the next agent (Phase 3)

### 1. Goal and scope
Phase 3 (plan §7): **full standings** for Results, the opaque **`entry` tokens**, and the **breakdown route** (plan
§5d), plus the "rewards won at this game" list for the game route (plan §5e
`GET /api/owner/results/games/[competition]/[gameKey]`). Contract tests: no user id in any Results response, never
select `submitted_answer`, a token from venue/game A fails on B, breakdown total = standings total. Measure the
breakdown query on production with a read-only script; add the index migration only if needed and **ask Andrew before
`supabase db push`**. Plan names **Claude Opus 5.5, effort high**.
Out of scope: any UI (Phase 4), deleting old routes/components (Phase 5), other competitions.

### 2. Starting state
- Branch `main`. Phase 2 is one local commit on top of Phase 1 (`0a39fb9`); see `git log -2`. **Not pushed, not
  deployed.** No migrations, no data changes, no backups needed. All production reads were read-only.
- The working tree still holds **other people's uncommitted changes** (Category Blitz, schedule rows, `next-env.d.ts`,
  `tests/game-tutorial-once-a-day.test.ts`, …). Never stage them: `git add <your files>` only.

### 3. Decisions already made (don't re-ask)
- Andrew's R1–R4 (plan §2). Sheet id stays `history`.
- **Placement rules as built** (`lib/results/rewardPlacement.ts`, header table):
  - Live Trivia `game_winner`: the game whose `startsAt` equals the cycle start (exact instant); else the date's only
    Live Trivia game; else a day row. Dated in the pinned schedules' shared zone, else the venue's.
  - `points_threshold` daily: the day's game card when the day has exactly one game (any competition), else a day row.
  - `ranked_places` and any **weekly** cadence: a week row, dated on the cycle's **last game day** (last active day in
    the 7 days from the cycle start; a multi-day campaign spans first active day → `endDay`, and an `endDay` closing at
    or before 06:00 is the night before's tail). Wed/Thu/Fri → Friday; Sat 16:00 → Mon 02:00 → Sunday.
  - NFL Pick 'Em (`reward_definition_id = nfl_pickem_challenge`): a week row in the week it was **finalized**.
  - Monthly / yearly / one-off (epoch `cycle_start`): a day row on the day it was finalized.
  - **An item is never dated after it happened**: date = min(rule date, finalized/settled date).
  - **Paging contract** (`rewardSource.ts` relies on it): an item's date is within [cycle date − 1, cycle date + 7] or
    is its finalized/settled date. A new rule must keep that, or window reads miss rows.
- **Timeline paging** (`lib/results/timeline.ts`): cursor = a venue-local date; a page = [lo, before), never splits a
  date; game sources bound lo at their oldest returned date unless exhausted; rewards are read for the page range only
  and the range is at most `REWARD_WINDOW_DAYS` = 56; an empty range jumps to the newest older game/reward (up to
  `MAX_EMPTY_JUMPS` = 6, then an empty page with a cursor). Consequence: a venue whose games all fit one page still pages
  by 56-day windows (Garden State Bar: 5 games on page 1, 6 on page 2).
- Old Game Results routes stay live and unchanged in behaviour until Phase 5.

### 4. Files created / changed
New (`lib/results/`):
- `competitions.ts` — the registry (`RESULTS_COMPETITIONS`, `ResultsCompetitionId`, `isResultsCompetitionId`,
  `getResultsCompetition`). Pure. Live Trivia has `hasBreakdown: true` already (Phase 3 must implement it).
- `types.ts` — wire shapes + `ResultsAdapter`. Additions vs plan §5a: `ResultsGameRow.startsAt` (ISO, for matching
  game-winner rewards); `ResultsRewardItem` also carries `howWon`, `cycleStart`, `cycleLabel`, `date`, `note`; the game
  attach is `{ kind: "game", competitionId, gameKey }`; `listGames` takes `withFirstGameDate` and may return
  `firstGameDate`; `getStandings` takes an optional `limit` (old route = 10, Results = none).
- `errors.ts` — `ResultsNotFoundError` (404) / `ResultsUnavailableError` (503). `lib/ownerHistory.ts` re-exports them as
  `OwnerHistoryNotFoundError` / `OwnerHistoryUnavailableError` (same classes).
- `playerNames.ts` — `loadUsernames` (moved from `lib/ownerHistory.ts`).
- `adapters/liveTrivia.ts` — `liveTriviaResultsAdapter` (`listGames`, `getStandings`), `liveTriviaGameKey`,
  `parseLiveTriviaGameKey` (`"<scheduleId>:<YYYY-MM-DD>"`), `LIVE_TRIVIA_COMPETITION_ID`. `startsAt` is computed by
  probing `enumerateScheduleOccurrences` at noon UTC of the date (null if the schedule no longer runs that date).
- `adapters/index.ts` — `RESULTS_ADAPTERS: Record<ResultsCompetitionId, ResultsAdapter>`, `getResultsAdapter`,
  `listResultsAdapters`.
- `rewardPlacement.ts` — pure `placeRewards`, plus `addDays`, `mondayOf`, `weeklyCycleLastDay`.
- `rewardSource.ts` — `createVenueRewardSource({ venueId, timeZone, currentYear })` → `{ read, boundBefore }`.
- `timeline.ts` — pure `mergeGamePages`, `buildResultsTimelinePage`, constants, `ResultsGameSource`/`ResultsRewardSource`.
- `ownerResults.ts` — `getResultsTimelinePage({ venueId, before, nowMs })` wires the real sources.

Route: `app/api/owner/results/route.ts` (`withOwnerVenue`, `no-store`).
Changed: `lib/ownerHistory.ts` (game functions are now wrappers over the adapter; reward functions untouched),
`lib/ownerHistoryRoute.ts` (checks the `lib/results/errors` classes), `tests/api.owner.history.test.ts` (its mock now
returns the real error classes), `package.json` (two scripts, below).
Tests: `tests/lib.results-reward-placement.test.ts` (every §5b row, DST weeks, late-night games, pinned zones),
`tests/lib.results-timeline.test.ts` (merge rules + whole-walk invariants: everything shown once, newest first, no
split date; mutation-checked), `tests/results-registry-contract.test.ts` (registry ↔ adapters, "Test Cup" fixture,
no competition id in the generic core or `components/owner/results/`), `tests/lib.results-sources.test.ts`,
`tests/api.owner.results.test.ts`.
Scripts (read-only): `npm run results:check-timeline -- <venueId> …` (prints every page as the route builds it) and
`npm run results:inspect-rewards` (raw ledger/settlements/campaigns).

### 5. Facts and traps
- **Production data (2026-10-16):** 24 ledger rows, 10 settlements, 4 campaigns, 2 venues. Garden State Bar
  (`venue-garden-state-bar`, America/New_York): `ranked_places` weekly, `active_days` wed/thu/fri, `start_time` null →
  cycles start Wed 00:00; all 10 weeks were settled by the backfill on 2026-10-14 (finalized_at ≠ week). Schedule
  "Weekday Trivia" Wed/Thu/Fri 3 PM ET, 14 rounds. General Saloon (`venue-riverside`): three `points_threshold`
  weekly rewards — Saturday (sat 16:00–02:00), Sunday Challenge (sun 16:00–02:00), 3-Day (multi_day sat → mon 02:00);
  most of their wins came from games other than Live Trivia (no Live Trivia game those days). No `game_winner`,
  daily, monthly, NFL or one-off rows exist in production yet: those rules are covered by unit tests only.
- The ranked week key is **not Monday**: `computeCycleStart` anchors on `activeDays[0]`. Never assume a cycle = a
  Results week.
- `challenge_cycle_winners.finalized_at` is NOT NULL; `winner_user_id` can be null (deleted player).
- PostgREST `or()` filters use date-only values (`cycle_start.gte.2026-09-23`), so nothing needs escaping.
- **Cost as measured:** a first page reads ~11–13 small queries (schedules, RPC, first-date probe per schedule, winners'
  names, venue tz (cached), ledger, settlements, campaigns, winners' names, and 4 `limit 1` probes when the games are
  exhausted). Plan §6 estimated 6–7; the extra are the bounded probes. Each empty-range jump adds 2 reads + 4 probes.
  All on demand only.
- **Phase 3 trap:** `loadUsernames` does one `in()` over all ids. Full standings can have hundreds of scorers; a
  UUID list that long can exceed PostgREST's URL limit (~8 KB ≈ 200 ids). Chunk it (e.g. 100 per read) before
  dropping the limit in the Results game route.
- **Phase 3:** `tests/results-registry-contract.test.ts` only checks "no breakdown flag → no getBreakdown". Once Live
  Trivia's `getBreakdown` exists, tighten it to `Boolean(adapter.getBreakdown) === competition.hasBreakdown`.
- Run TS scripts that import `@/lib/...` with `node --env-file=.env.local --conditions react-server --import tsx`
  (`react-server` makes `server-only` a no-op). Never print env values.
- macOS `sed -i ''`; a failed `&&` chain stops silently.

### 6. Build / test
`npx tsc --noEmit` clean, `npm run lint` clean, `npm run test` **4,731 passed, 13 skipped, 0 failed**,
`npm run test:owner-history-sql` passed, `npm run build` succeeded (route `/api/owner/results` listed). Typecheck and
build were run one after the other, never together. Production run of `results:check-timeline` for both venues
(output summarised in §5). **Not verified:** the route through a real partner session (no UI calls it yet; the gate is
the same `withOwnerVenue` the old routes use, covered by `tests/api.owner.results.test.ts`).

### 7. Open questions for Andrew
1. Single-night weekly rewards (General Saloon "Saturday" / "Sunday Challenge"): keep them as a row at the end of the
   week (current, per plan), or put them on that night's game card when the night has exactly one game? It is a
   one-rule change in `placeCycle` (treat a weekly cycle with one game day like a daily one).

### 8. Recommended first steps for Phase 3
Read plan §5d/§5e and this note; read `lib/results/adapters/liveTrivia.ts` (`getStandings`) and
`lib/liveTriviaWeekTotals.ts`. Chunk `loadUsernames`. Write the token helper (HMAC-SHA256 of
`venueId|competitionId|gameKey|userId` with `SESSION_SECRET`, base64url, 22 chars; no secret → `entry: null` and the
breakdown route 503). Add `getBreakdown` to the Live Trivia adapter (select `is_correct, points_awarded, round_number,
question_index, question_id` only), the game and breakdown routes under `app/api/owner/results/games/…`, and a
read-only EXPLAIN script for the per-user answers read. Opus 5.5, effort high.
