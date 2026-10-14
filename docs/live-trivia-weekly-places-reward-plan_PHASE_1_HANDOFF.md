# Live Trivia Weekly Places Reward — Phase 1 handoff (2026-10-14)

Plan: `docs/live-trivia-weekly-places-reward-plan.md`. This note is for whoever does **Phase 2**.

## For Andrew (plain English)

- **What changed:** the database can now hold a "1st / 2nd / 3rd place over the week" reward, with a
  different prize for each place and an optional "only pay out if at least N players took part". It also has
  one safe, all-or-nothing way to pay a week's winners, which can never pay the same week twice. Nothing
  *uses* any of this yet, so players and partners see no difference.
- **Is it live?** Yes. The database change was applied to production on 2026-10-14 (you approved it), and
  the code was pushed to `main` (commit `d924149`), which deploys it.
- **Your two new requests are in the plan:** partners choose a minimum number of players (D7), and a new
  **Past Winners** screen on the Partner Dashboard (D9, new Phase 8). A reward created mid-week now starts
  that same week (D8).
- **Check done against real data:** Garden State Bar's first week (Aug 5) re-ranks exactly as the plan's table
  says: Snooker 410, Kuch 140, fast76 50.
- **What's left:** Phases 2–8. Phase 2 (the weekly payout robot) is next and needs nothing from you.
- **Needs you later:** the backfill dry-run approval (Phase 5); Phase 8's deploy approval; whether to start
  the backfill later than Aug 5 (no answer yet, so Aug 5); whether Category Blitz belongs in Past Winners.

## For the next agent (Phase 2)

### 1. Goal and scope

Phase 2 = the weekly resolver inside the existing cron, per plan §5c and the Phase 2 section:
`lib/liveTriviaRankedRewards.ts` + wiring in `app/api/cron/resolve-live-trivia-winners/route.ts` (after
`resolveGameWinnerRewards`, each in its own try/catch; **no `vercel.json` change**), plus the game-winner
minimum-player check in `lib/liveTriviaWinnerRewards.ts` (D7), plus the post-game regrade question (§5c).

**Out of scope:** any UI, `createReward`/routes (Phase 3), creating any reward for a real venue, Garden State
Bar data, the backfill (Phase 5), Past Winners (Phase 8).

### 2. Starting state

- `main` = `d924149` "feat(rewards): ranked-places data model, atomic award RPC and ranking rules (Phase 1)"
  on top of `fbdcc3f`, plus a follow-up commit that adds this handoff and the plan status line. Pushed to
  `origin/main`. The Vercel production deploy of `d924149`
  (`hightop-challenge-8uv46rqt2-andrewserulnecks-projects.vercel.app`) reached **Ready** on 2026-10-14. The
  docs-only follow-up commit triggers one more (harmless) deploy.
- **Migration `20261014010000_live_trivia_ranked_places.sql` is APPLIED to production**
  (`pkmxupsayzshvpirkaav`) — do not re-apply, edit or delete it. Verified afterwards through PostgREST with the
  service role: new columns readable, `challenge_cycle_settlements` exists (0 rows), both RPCs callable,
  `award_ranked_cycle_places` refuses an unknown reward. **0 ranked rewards exist.** No data was written.
- **The timestamp `20261014010000` was chosen by hand on purpose**, earlier than the still-unapplied
  `20261014020000_speed_trivia_variety_review.sql` (someone else's work, untracked in Andrew's main checkout).
  That keeps the Speed Trivia migration pushable later without `--include-all`.
- **How it was pushed without the Speed Trivia migration:** from a clean worktree of `origin/main` with only
  Phase 1's files, using `supabase --workdir <worktree> db push` run **from the main checkout** (the CLI reads
  `SUPABASE_ACCESS_TOKEN` from the main checkout's `.env.local`; from inside the worktree it fails with
  `LegacyPlatformAuthRequiredError`). Dry run first showed exactly one migration.
- **Andrew's main checkout** (`/Users/andrewserulneck/Documents/Trivia-Predictions`) is on branch
  `category-blitz-scoring-cadence` with lots of unrelated uncommitted work. It also still holds Phase 1's files
  as uncommitted copies (identical to what's on `main`). Don't commit from there; don't `git checkout --`
  anything there (see memory note: that destroys uncommitted work). Work from a fresh worktree of `origin/main`
  as Phase 1 did, or ask Andrew.

### 3. Decisions already made (don't re-ask)

All of plan §2: D1–D6 (original) and, from Andrew on 2026-10-14, D7–D11:
- **D7 minimum players:** partner's choice per reward, 2–100, on `ranked_places` and `game_winner` only (not
  points targets, not NFL). "Took part" = answered ≥ 1 question in the week (ranked) / game (game winner),
  scored or not. Below the minimum → nobody wins, recorded.
- **D8 mid-week start:** a reward is live for the week it's created in, if created before that week's last
  game ended; otherwise from the next week.
- **D9 Past Winners** screen = Phase 8. **D10** defaults confirmed (weekly only, 1–3 places, live standing on the
  card, no feature flag). **D11** approvals: DB change (done), push + deploy of Phases 1–4, backfill dry run
  approved by Andrew before issuing, Garden State Bar honors ~$320 + up to $60.

Phase 1 design decisions (recorded in plan §5a):
- Added **`challenge_cycle_settlements`** (not in the original plan) so weeks nobody won are marked settled —
  otherwise the resolver would re-read scores every 5 minutes for empty weeks. The resolver must read this
  table first ("settlements first"), not `challenge_cycle_winners`.
- `award_cycle_winner` now **refuses** ranked rewards (`won=false, exhausted=true`).
- `terms_updated_at` trigger deliberately **not** extended to `place_prizes`/`min_players` (reason in Phase 3
  section of the plan).

### 4. Files (all on `main`)

- `supabase/migrations/20261014010000_live_trivia_ranked_places.sql` — see plan §5a for every object.
  - `award_ranked_cycle_places(p_challenge_id, p_cycle_start, p_venue_id, p_winners jsonb, p_participant_count,
    p_prize_expires_at)` → `(status, winners_awarded)`; statuses `awarded | no_scorers | below_minimum |
    already_resolved`; raises (full rollback) on bad input.
  - `live_trivia_week_totals(p_schedule_ids uuid[], p_dates date[])` — arrays are **paired by index**.
- `lib/rankedPlaceRewards.ts` (pure, client-safe): `rankWeekPlaces({ totals, placeCount, minPlayers })`,
  `orderWeekStandings`, `normalizePlacePrizes` / `serializePlacePrizes` (snake_case jsonb ↔ `RewardPlacePrize`),
  `rankedPlacesRpcPayload`, `MAX_RANKED_PLACES = 3`, types `WeekPlayerTotal`, `RankedPlace`, `RankedWeekResult`.
- `lib/liveTriviaWeekTotals.ts` (server-only): `loadLiveTriviaWeekTotals(games: {scheduleId, occurrenceDate}[])`
  — dedupes, skips malformed dates, one RPC call, throws on error (`[RankedReward] week-totals-rpc-missing`).
- `lib/challengeCampaigns.ts`:
  - `awardRankedCyclePlaces({ campaign, venueId, cycleStart, places, participantCount, now, prizeExpiresAt? })`
    → `{ status, winnersAwarded }`. Default expiry 7 days (`PRIZE_EXPIRY_MS`); backfill passes 30 days.
    Throws on any RPC error (`[RankedReward] rpc-missing` when the function is missing). Sends the existing
    generic win notification per winner after commit, best-effort (Phase 3 owns nicer copy).
  - `normalizeWinCondition` now returns `"ranked_places"` (before, any unknown value became
    `"points_threshold"` — that would have made every guest a winner via accrual).
  - `place_prizes, min_players` added to `CAMPAIGN_SELECT_COLUMNS`; mapped to `placePrizes` / `minPlayers`.
  - Points accrual: `resolvedByCron = campaign.winCondition !== "points_threshold"`.
- `types/index.ts`: `ChallengeWinCondition` gains `"ranked_places"`; new `RewardPlacePrize`;
  `ChallengeCampaign.placePrizes?`, `.minPlayers?`; `ChallengeCampaignWin.place?` (not yet read by the wallet).
- Tests: `tests/lib.ranked-place-rewards.test.ts` (18 cases), `scripts/test-ranked-places-sql.cjs`
  (`npm run test:ranked-places-sql`).

### 5. Facts and traps

- **Cycle key:** the resolver must pass `cycleStart = computeCycleStart(campaign, <instant in week>, venueTz)`
  (`lib/challengeCampaigns.ts`). A ranked reward is recurring weekly, so `resolveCurrentCycleWinnersForSnapshot`
  already treats it as cycle-keyed — a home-made key would mint a second set of prizes and the panel would
  show no winners.
- **Places other code still treats as "not game_winner = points target"**: `lib/rewardTerms.ts`,
  `lib/rewardDescription.ts`, `lib/ownerRewardDisplay.ts`, `lib/rewards.ts` (createReward forces
  `points_threshold` for anything not `game_winner` — so a ranked reward can't be created yet, which is
  correct until Phase 3), venue panel components. Harmless today (0 ranked rewards). Phase 3/4 fix them.
- `live_trivia_week_totals` returns 0-point participants (reached_at null). `rankWeekPlaces` counts them for
  the minimum and excludes them from places. Don't add a `having sum > 0` (the original plan's idea).
- `p_winners` must be places 1..k with no gaps and points > 0; `rankWeekPlaces` always produces that. Never
  build the payload by hand.
- `challenge_cycle_settlements` PK is `(challenge_id, cycle_start)` — one venue per reward. Phase 3 must refuse
  a ranked reward with more than one venue.
- `occurrence_date` is venue-local already; never convert it (see `weekdayForOccurrenceDate`).
- Dev shares the production DB. Never create a ranked reward for a real venue from a dev server; use the
  hidden `venue-hightop-test` for any smoke test.
- PGlite is a single connection: the SQL test proves the two RPCs use the identical lock expression and
  refuse each other's weeks, not a real race.
- Vercel CLI 59.11.7 is outdated (works). Supabase CLI 2.116.0 (works).

### 6. Build / run / test

From a worktree of `origin/main` with `node_modules` symlinked to the main checkout's:
- `npx tsc --noEmit` — clean. `npm run lint` — exit 0. `npx vitest run` — 367 files passed, 1 skipped
  (4,319 tests passed, 13 env-gated skips). `npm run build` — succeeded.
- `npm run test:ranked-places-sql` — passed. Also re-ran `scripts/test-player-account-deletion.cjs`
  (with `PLAYER_DELETE_PGLITE_MODULE=@electric-sql/pglite`), `scripts/test-square-scannable-prizes.cjs`,
  `scripts/test-campaign-terms-stamp.cjs` — all passed.
- Production read-only verification script (not committed): service-role `supabase-js` via
  `node --env-file=.env.local` from the main checkout.
- Not run: `/verify` browser pass (no UI changed).
- Unverified: real concurrency between `award_cycle_winner` and `award_ranked_cycle_places` on Postgres
  (relies on the shared advisory lock — same mechanism as today's multi-winner quota).

### 7. Open questions for Andrew

1. Start the backfill later than Aug 5? (default Aug 5)
2. Category Blitz in Past Winners? (default no)
3. Phase 8 deploy approval.

### 8. Recommended first steps for Phase 2

**Model: Claude Opus 5.5 · Effort: high.**
1. Read the plan (§2, §5c, Phase 2) and this note. Create a worktree of `origin/main`.
2. Read `lib/liveTriviaWinnerRewards.ts` (`findEndedOccurrences`, `enumerateScheduleOccurrences`,
   `occurrenceMatchesSlots`, `campaignWasLiveForOccurrence`) and `computeCycleStart`/`computeCycleEnd`.
3. Answer the regrade question first: grep for writers of `live_showdown_answers.points_awarded` after a game
   ends (manual review / regrade / `app/api/admin/trivia/*`). If any exist, add a grace window and record it.
4. Build `resolveRankedPlaceRewards(now)`: load active ranked rewards directly (partial index exists) → due
   weeks (last pinned game ended, lookback 2 cycles, D8 creation rule) → one `challenge_cycle_settlements` read
   for all due keys → for each unsettled week `loadLiveTriviaWeekTotals` → `rankWeekPlaces` →
   `awardRankedCyclePlaces`. Report `weeksSettled / noScorers / belowMinimum / tiebreakUnresolved / errors`.
5. Add the D7 minimum check to the game-winner sweep. Tests per the plan's Phase 2 list. Push + deploy is
   pre-approved (D11); write `…_PHASE_2_HANDOFF.md` and update the plan's status line.
