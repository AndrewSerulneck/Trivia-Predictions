# Live Trivia Weekly Places Reward — Phase 2 handoff (2026-10-14)

Plan: `docs/live-trivia-weekly-places-reward-plan.md`. This note is for whoever does **Phase 3**.

## For Andrew (plain English)

- **What changed:** the "robot" that pays weekly 1st / 2nd / 3rd place prizes now exists. Every 5 minutes, the
  same job that already pays "win the game" rewards checks whether a week's last Live Trivia game has ended. If
  it has, it adds up everyone's points for the week and pays the top places, exactly once. Weeks nobody won are
  recorded too, so they're never re-checked.
- **Your "minimum players" choice now works for "win the game" rewards too:** if a reward says "at least N
  players", a game with fewer players pays nobody. Nobody can set a minimum yet. That comes with Phase 3 / Phase 6.
- **Is it live?** Yes: pushed to `main`, which deploys it. **It pays nobody yet**, because no weekly-places reward
  exists. Garden State Bar's reward is created in Phase 5.
- **Checked against real data (read-only, nothing written):** for Garden State Bar it picks the same winners as
  the plan's table: Aug 5 week Snooker 410 / Kuch 140 / fast76 50, Oct 7 week murph 90 / kellygurl 10, and
  nobody for the Sep 30 week. This week (Oct 14) isn't counted yet, because Friday's game hasn't happened.
- **Can scores change after a game? No.** I checked this, because a late change would mean waiting before
  paying. Nothing changes a score after a game ends, so winners are paid on the first check after Friday's game.
- **What's left:** Phases 3–8. Phase 3 (creating the reward on the server, plus its wording) is next and needs
  nothing from you.
- **Needs you later (unchanged):** the backfill dry-run approval (Phase 5). Phase 8's deploy approval. Whether
  to start the backfill later than Aug 5 (default Aug 5). Whether Category Blitz belongs in Past Winners
  (default no).

## For the next agent (Phase 3)

### 1. Goal and scope

Phase 3 = plan §5d **server half** + the Phase 3 section of §7:
- `RewardDefinition.supportsRankedPlaces` (true only for `live_trivia_challenge`) + description templates
  (`rankedPlacesWeekly`, `wonRankedPlace`, fine print "Ties go to whoever reached their score first.") in
  `lib/rewardDefinitions.ts` / `lib/rewardDescription.ts`.
- `createReward` (`lib/rewards.ts`) accepts `winCondition: "ranked_places"` + `placePrizes` (1–3, each through
  the existing prize validator) + optional `minPlayers` (2–100; also for `game_winner`; refused for points
  targets and NFL). Exactly one venue. Weekly Live Trivia only (refuse with clear copy otherwise). Cadence
  forced to `weekly`, `winnerQuota` = place count, campaign-level prize columns null, `place_prizes` via
  `serializePlacePrizes`.
- Admin + owner API routes (`app/api/admin/route.ts`, `app/api/owner/rewards/route.ts`) accept and return
  `placePrizes` / `minPlayers`.
- Make sure the venue panel does **not** mis-render a ranked reward before Phase 4 (hide it on the player panel or
  show description text only). Pick one and pin it with a test.
- Notification copy for a place win (today `awardRankedCyclePlaces` sends the generic "You won a prize in …").

**Out of scope:** the wizard UI (Phase 6), Rewards card standings and wallet "1st place" (Phase 4), creating any
reward for a real venue, the backfill (Phase 5), Past Winners (Phase 8). Don't change the resolver unless a
Phase 3 decision forces it.

### 2. Starting state

- Phase 2 code commit: `f5398cc` "feat(rewards): weekly ranked-places resolver + game-winner minimum players
  (Phase 2)", on top of `4614a0f` (Phase 1 handoff). A follow-up commit adds this note. Both are pushed to
  `origin/main` from branch `live-trivia-ranked-places-phase2` (worktree
  `/private/tmp/claude-501/-Users-andrewserulneck-Documents-Trivia-Predictions/b1b94891-fa54-4921-ae44-1d3291c69836/scratchpad/ranked-p2`).
  Push + deploy was pre-approved by Andrew (D11, Phases 1–4). Production deploy
  `hightop-challenge-4k56s6fcr-andrewserulnecks-projects.vercel.app` reached **Ready** on 2026-10-14 (created
  17:56 EDT). Its first cron runs, at 18:00 and 18:05 EDT, logged no errors and returned no 5xx
  (`vercel logs --since 15m --environment production --query resolve-live-trivia-winners [--status-code 5xx]`).
  This docs-only follow-up commit triggers one more deploy, which is harmless.
- **No migration in Phase 2.** Nothing applied to production. No data written. Production still has **0 ranked
  rewards** and **0 rows** in `challenge_cycle_settlements`, so the new sweep returns `campaignsExamined: 0`
  on every run.
- **Andrew's main checkout** (`/Users/andrewserulneck/Documents/Trivia-Predictions`) is on branch
  `category-blitz-scoring-cadence` with lots of unrelated uncommitted work, including stale uncommitted copies
  of Phase 1 files. Don't commit from there. Don't `git checkout --` anything there (that destroys uncommitted
  work). Work from a fresh worktree of `origin/main`: `git worktree add -b <branch> <path> origin/main`, then
  `ln -s /Users/andrewserulneck/Documents/Trivia-Predictions/node_modules <path>/node_modules`.
- Other worktrees exist (`…/a2d675d1…/scratchpad/ranked-wt` = Phase 1, `/private/tmp/speed-trivia-approval-release-2026-10-14`
  = someone else's). Leave them alone.

### 3. Decisions already made (don't re-ask)

All of plan §2, D1–D11. Highlights for Phase 3: D7 minimum = 2–100 on `ranked_places` and `game_winner` only.
D8 = a reward is live for the week it's created in, if created before that week's last game ended. D10 = weekly
only, 1–3 places, no feature flag. Phase 1's §5a decisions stand (the settlements table, `award_cycle_winner`
refuses ranked rewards, and the `terms_updated_at` trigger is not extended).

Phase 2 decisions:
- **No grace window before settling** (the plan's regrade question). Evidence: answers are graded on submit
  (`lib/liveShowdownSubmission.ts`, insert at 0, then update to the awarded points in the same request).
  Closest-guess points are written by `settleClosestGuessQuestion` (`lib/liveShowdownEngine.ts`), which only
  `getLiveShowdownState` calls, and only while a game is **active** (`now < endMs`). The last question's settle
  happens during the final mid-game break, which is inside the window. Post-game writers are deletes only:
  admin reset/delete of a schedule's answers (`lib/liveShowdownAdmin.ts` ~675 and ~924) and player account
  deletion. **If anyone adds a post-game regrade, add a grace window to `planDueRankedWeeks` first.**
- **Which games count:** every Live Trivia game at the reward's venue (all schedules), narrowed by
  `game_winner_slots` when pinned (null = every game, the same rule as the game-winner sweep). The resolver does
  **not** filter by `activeDays`. Only `activeDays[0]` matters, and only as the week anchor.
- **Lookback = 2 weeks** (`RANKED_WEEK_LOOKBACK_CYCLES`), the current cycle and the previous one.
- **Settled-week match tolerance ±12h** (`SETTLED_WEEK_MATCH_TOLERANCE_MS`). `getVenueTimezone` silently returns
  `America/New_York` on a read error. That would shift the key by the venue's offset, and an exact-match check
  alone would then pay a second set of prizes. Weeks are 7 days apart, so 12h can't confuse two real weeks.
- **Game-winner minimum:** a game below the minimum awards nobody, and a **one-off** reward is NOT spent, so the
  next game can still resolve it (the same as a game where nobody scored). The `[GameWinnerReward] below-minimum`
  log line is written only on sweeps within 10 minutes of the game ending (`BELOW_MINIMUM_LOG_WINDOW_MS`), so the
  6h lookback doesn't log it ~72 times. The report entry (`belowMinimum`) appears on every sweep.
- **Cron response shape:** the game-winner report stays at the top level (unchanged), and the weekly report is
  under `rankedPlaces`. Either sweep throwing → `ok: false`, status 500, and the other sweep still runs.

### 4. Files (all on `main`)

- **`lib/liveTriviaRankedRewards.ts`** (new, server-only):
  - `resolveRankedPlaceRewards(nowMs)` → `ResolveRankedPlaceRewardsReport` `{ campaignsExamined, weeksDue,
    weeksAlreadySettled, weeksSettled, noScorers, belowMinimum, tiebreakUnresolved, alreadyResolved,
    settlements[], errors[] }`. Flow: `listActiveRankedPlaceCampaigns` → `rankedRewardConfigError` filter →
    ONE `loadLiveTriviaSchedulesForVenues` → per reward `getVenueTimezone` + `planDueRankedWeeks` → ONE
    `listChallengeCycleSettlements` for all due weeks (fails closed: a read error stops the sweep) → per
    unsettled week `loadLiveTriviaWeekTotals` → `rankWeekPlaces` → `awardRankedCyclePlaces`. Per-reward and
    per-week try/catch. Logs: `[RankedReward] sweep-error`, `week-settled`, `tiebreak-unresolved`.
  - `planDueRankedWeeks({ campaign, venueId, schedules, timezone, nowMs })` (pure, exported for tests and
    reusable by the Phase 5 backfill): it groups games by `computeCycleStart(campaign, gameStart, tz)` and
    probes `enumerateScheduleOccurrences` at now, now−7d and now−14d. A week is due when `now ≥` the end of
    its last game, the reward was `createdAt <` that end (D8), and the end date isn't past. It throws when
    `computeCycleStart` returns the epoch sentinel (no valid `activeDays[0]`).
  - `rankedRewardConfigError(campaign)`: not exactly one venue / not `recurringType: "weekly"` / no
    `placePrizes` → message. Phase 3's `createReward` must refuse all three up front.
- **`lib/challengeCampaigns.ts`:** new `listActiveRankedPlaceCampaigns()` (direct filtered query:
  `win_condition='ranked_places'`, active, `winner_user_id is null`, not through `listChallengeCampaigns`) and
  `listChallengeCycleSettlements({ challengeIds, cycleStartFrom })` → `ChallengeCycleSettlementRecord[]` (Phase 4/8
  can reuse it for history).
- **`lib/liveShowdownEngine.ts`:** `loadScheduleRows` now takes `string | string[]` (a blank string still means
  "all venues"; an empty array means none). New export `loadLiveTriviaSchedulesForVenues(venueIds)`.
- **`lib/liveTriviaWinnerRewards.ts`:** D7 minimum (`campaign.minPlayers` vs. `standings.length`, which
  includes 0-point players). New `belowMinimum` array on `ResolveGameWinnerRewardsReport`,
  `GameWinnerBelowMinimum` type, `BELOW_MINIMUM_LOG_WINDOW_MS`.
- **`app/api/cron/resolve-live-trivia-winners/route.ts`:** runs both sweeps on one `Date.now()`, game winners
  first. **No `vercel.json` change** (still `*/5 * * * *`).
- Tests: `tests/lib.live-trivia-ranked-rewards.test.ts` (21 cases: due only after the last game, cycle key =
  `computeCycleStart`, 2-week lookback, D8 both ways, unreadable `created_at`, pinned slots, multi-schedule +
  other venue, DST end Nov 1, config errors, idempotent re-sweep, below-minimum / no-scorer weeks recorded once
  and never re-read, ±12h tolerance, settlements-read failure → no award, one failing reward doesn't stop others,
  RPC `already_resolved`, tiebreak flag), `tests/api.cron.resolve-live-trivia-winners.test.ts` (4: auth, order +
  shape, each sweep survives the other throwing), `tests/lib.live-trivia-winner-rewards.test.ts` (+4 minimum
  cases).

### 5. Facts and traps

- **The week anchor is `activeDays[0]`, and Phase 3 sets it.** `computeCycleStart` anchors a weekly cycle on
  `campaign.activeDays[0]` at `startTime` (null → 00:00 venue time). For Garden State Bar (Wed/Thu/Fri), Phase 3
  must store `activeDays` with **`"wed"` first**. For a week that wraps (for example Fri/Sat/Sun), the first
  night is Fri, and a Sun-first ordering would split one week's games across two cycles. Check what order
  `deriveRewardTerms` (`lib/rewardTerms.ts:401`) / `scheduleRunWeekdays` (`lib/rewardGameSlots.ts`) produce
  before relying on them, and pin it with a test (NFL had the same trap: its `activeDays` must be `"thu"` first).
- `computeCycleEnd` for a weekly reward returns the end of the daily time window, **not** the end of the week.
  Don't use it for week boundaries. The resolver doesn't need a week end: it groups games by key.
- Settlement `cycle_start` comes back from PostgREST as e.g. `2026-10-07T04:00:00+00:00`. Compare with
  `Date.parse`, never as strings.
- `enumerateScheduleOccurrences` only lists −7…+14 days around its probe. That's why there are three probes.
  If you widen the lookback past 2 cycles, add probes.
- `rankedRewardConfigError` errors repeat every 5 minutes (one `console.error` per run per broken reward) until the
  reward is fixed. That's intended visibility. `createReward` should make it impossible.
- Production read-only check (2026-10-14, nothing written): with a hypothetical in-memory reward
  (`createdAt` 2026-08-01, Wed/Thu/Fri), `planDueRankedWeeks` + `loadLiveTriviaWeekTotals` + `rankWeekPlaces`
  gave: week `2026-08-05T04:00Z` → 4 participants, Snooker 410 / Kuch 140 / fast76 50; `2026-09-30T04:00Z` → 0
  participants, no_scorers; `2026-10-07T04:00Z` → 2 participants, murph 90 / kellygurl 10. At 21:54Z on
  Oct 14 (before Wednesday's game) only the Oct 7 week was due. GSB schedule id
  `78a0e374-f3f1-4605-af35-89deb8040660`.
- **Never call the cron route from a dev server to "test" it.** Dev shares the production DB, and the route also
  runs the real game-winner sweep, which mints real coupons. Exercise the code through the unit tests, or with a
  read-only script that never calls `awardRankedCyclePlaces` / `awardCycleWinner`.
- Phase 1 traps still apply (handoff 1 §5): `normalizeWinCondition`, places code that still treats "not
  game_winner" as a points target (`lib/rewardTerms.ts`, `lib/rewardDescription.ts`, `lib/ownerRewardDisplay.ts`,
  `lib/rewards.ts` createReward forcing `points_threshold`, venue panel components), and one venue per ranked reward.

### 6. Build / run / test

From the worktree (node_modules symlinked):
- `npx tsc --noEmit`: clean. `npm run lint`: exit 0 (only the usual Babel "deoptimised" note on
  `lib/sportsBingo.ts`). `npx vitest run`: **369 files passed, 1 skipped; 4,348 tests passed, 13 env-gated
  skips**. `npm run build`: succeeded. (Typecheck and build were run one after the other, not at the same time.)
- Focused: `npx vitest run tests/lib.live-trivia-ranked-rewards.test.ts tests/api.cron.resolve-live-trivia-winners.test.ts tests/lib.live-trivia-winner-rewards.test.ts`.
- Read-only production script pattern (not committed): a `.ts` file importing the server modules, run with
  `node --env-file=/Users/andrewserulneck/Documents/Trivia-Predictions/.env.local --conditions react-server --import tsx <file>`
  from the worktree.
- `/verify` browser skill: not applicable (no page or UI changed). The read-only production check above stands in
  for it.
- **Unverified:** a real end-to-end settlement in production (impossible until a ranked reward exists — the first
  real one is Phase 5 / Phase 7's first live week). Real concurrency between two overlapping sweeps (relies on the
  RPC's advisory lock + ledger check from Phase 1).

### 7. Open questions for Andrew

Unchanged from Phase 1: (1) backfill start later than Aug 5? (default Aug 5); (2) Category Blitz in Past Winners?
(default no); (3) Phase 8 deploy approval. Nothing new from Phase 2.

### 8. Recommended first steps for Phase 3

**Model: Claude Opus 5.5 · Effort: medium** (per plan).
1. Read the plan (§2, §5d, Phase 3), the Phase 1 handoff §4–5 and this note. Create a fresh worktree of `origin/main`.
2. Read `createReward` in `lib/rewards.ts` (~line 1000–1240: `deriveRewardTerms` call, the `points_threshold`
   forcing, the weekly-with-empty-activeDays guard), `lib/rewardDefinitions.ts`, `lib/rewardDescription.ts`,
   and the existing prize validator. Find the `activeDays` ordering first (trap above).
3. Add validation that mirrors `rankedRewardConfigError` (one venue, weekly, valid ladder) and the D7 range, then
   persistence through `createChallengeCampaign` (check that it writes `place_prizes` / `min_players`; Phase 1
   added them only to the SELECT list and the row mapper).
4. Decide hide-vs-text for the player panel, pin it with a test, and write the place-win notification copy.
5. Tests per the plan's Phase 3 list. Push + deploy is pre-approved (D11). Write `…_PHASE_3_HANDOFF.md` and update
   the plan's status line.
