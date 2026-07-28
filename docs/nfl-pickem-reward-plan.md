# NFL Pick 'Em Challenge Reward — Master Plan

A new Reward definition (`nfl_pickem_challenge`) that partners and admins create
through the existing Create Reward wizard, won either by hitting a **correct-picks
target** or by having the **most correct picks at the venue that week**.

## Product decisions (locked — do not re-litigate)

| Decision | Choice | Rationale |
| --- | --- | --- |
| Points-target unit | **Correct picks** ("Get 25 picks right") | NFL Pick 'Em has no bonus tiers — flat 10 pts/correct pick (`lib/nflPickEm.ts:170`), so picks and points are proportional. Picks is the readable unit and survives a future bonus system; the daily-Pick'Em 2×/3× multipliers are a different game. |
| Week scope | **Only two shapes: "Weekly" or "Season-long."** No arbitrary week ranges (no "Weeks 12-16"). | Weekly = the reward repeats every NFL week it's active, one contest + one winner per week. Season-long = a single contest for the reward's whole run, one winner decided at the end. A range would be a third, unrequested shape — explicitly rejected. |
| Accrual | Weekly → **resets each NFL week** (new cycle every week); season-long → **cumulative, one cycle** covering every week the reward is active (mid-season creation covers the **remainder** of the season only) | Falls out of the scope choice; no extra toggle, no per-reward week picker. |
| Week-winner quantity | **Locked to 1 per week** | One winner per venue per week, by definition. Enforced server-side, not just hidden in the wizard. |
| Points-target quantity | Partner picks N (existing `REWARD_QUANTITY_OPTIONS`) | Same as every other reward. |
| Ties on week-winner | **Tiebreaker question**: guess total points scored in the week's last game; closest wins | New feature — see Phases 1–2. Labeled as a tiebreaker in the UI so guests know what it's for. |
| Minimum participation | **3+ users with picks at that venue that week**, or no award | Stated prominently to both partners (wizard + confirm screen) and players (Pick 'Em page + Rewards panel). |
| Scoping | **Venue-scoped**, always | NFL games are national; standings never cross venues. Every query filters `venue_id`. |
| Prizes | **Identical to Live Trivia Challenge** | Reuses `normalizeRewardPrize` / the wizard's prize step unchanged. |

## Key findings from code review (verified — act on these)

1. **NFL Pick 'Em has no challenge-engine accrual today.** `applyChallengeCampaignPoints`
   is called from `lib/pickem.ts`, `trivia.ts`, `fantasy.ts`, `sportsBingo.ts`,
   `liveShowdown*.ts` — **never** from `lib/nflPickEm.ts`. NFL picks are settled by the
   *shared* `settlePendingPickEmPicks` (`lib/pickem.ts:2169`) which writes
   `status`/`reward_points` on `pickem_picks` and stops there. A points-target reward
   needs a brand-new accrual hook (Phase 6). This is the single largest hidden cost in
   this feature.
2. **`ChallengeGameType` has no `"nfl-pickem"`** (`types/index.ts:157`), and
   `VALID_GAME_TYPES` in `lib/challengeCampaigns.ts:268` carries a parallel runtime
   list. Both need the new member. **No migration is needed for this** —
   `supabase/migrations/20260715000200_add_nfl_pickem_game_types.sql` already permits
   `'nfl-pickem'` in the `challenge_campaigns_game_types_valid` check constraint. The
   gap is purely TypeScript-side.
3. **"Adding a reward = one registry entry" does not hold here.** `lib/rewards.ts`,
   `lib/rewardTerms.ts` and `lib/rewardGameSlots.ts` are hardcoded to Live Trivia venue
   schedules — `requiresScheduledGame: "live_trivia"`,
   `getVenueLiveTriviaSchedules`, and ~10 user-facing strings that literally say
   "Live Trivia". NFL gates on the **NFL season calendar** (`nfl_pickem_weeks`), not on
   a venue schedule, so the gating layer needs a second source (Phases 3–4).
4. **The week-winner resolver has a direct template**: `lib/liveTriviaWinnerRewards.ts`
   + `/api/cron/resolve-live-trivia-winners`. Reuse its shape — including the
   `award_cycle_winner` RPC for atomic quota enforcement. Do **not** re-implement the
   quota check in app code.
5. **The leaderboard already computes everything the resolver needs.**
   `getNFLPickEmLeaderboard({ mode: "week" })` (`lib/nflPickEm.ts:1270`) returns
   venue-scoped, rank-assigned entries with `correctPicks`. The resolver reads it rather
   than re-querying.
6. **Per-game kickoff locking already exists** (`submitNFLPickEmPick`), so the tiebreaker
   question can reuse the same lock discipline against the week's last game.
7. **`activeDays` does double duty and its ORDER matters.** `computeCycleStart`
   (`challengeCampaigns.ts:647`) anchors a weekly cycle on **`activeDays[0]`**, while
   `isCampaignEligibleAtTime:822` *blocks accrual entirely* on any weekday not in
   `activeDays`. NFL games settle Thu/Sun/Mon (plus occasional Fri/Sat), and an NFL week
   runs Thu→Wed. So a weekly NFL reward must be created with **all seven weekdays,
   `"thu"` first**: `["thu","fri","sat","sun","mon","tue","wed"]`. Do **not** reuse
   `weekdaysForSlots` / `REWARD_WEEKDAY_KEYS` ordering from `rewardGameSlots.ts` — those
   sort Sunday-first, which would anchor the cycle on Sunday and split every NFL week
   across two reward cycles.
8. **Season-long rewards need real date bounds.** With `recurringType: "none"` and no
   `startDate`, `computeCycleStart` returns the epoch sentinel and
   `getCampaignCloseTimestampMs` returns `null` — the reward would never close. Phase 4
   must set `startDate`/`endDate` from the covered weeks' `week_start_date` /
   `week_end_date`. `createChallengeCampaign` already accepts both.

## Phases

Each row has a corresponding instruction doc: `docs/nfl-pickem-reward-phase<N>.md`
(e.g. Phase 0 → `docs/nfl-pickem-reward-phase0.md`). Read this plan doc first for
global constraints, then the specific phase doc for that phase's detailed scope.
Can be run unattended via `bash docs/run_phases.sh` (configured for this plan) or
phase-by-phase in a chat session.

| Phase | Scope | Model / effort |
| --- | --- | --- |
| 0 | Foundations: `"nfl-pickem"` game type in `types/index.ts` + `VALID_GAME_TYPES`; new migration for `challenge_campaigns.nfl_week_scope` (jsonb, nullable) — the game-types constraint already allows it; extend `scripts/seed-nfl-pickem-test-data.cjs` with multi-user settled weeks so later phases are verifiable | sonnet / medium |
| 1 | Tiebreaker backend: `nfl_pickem_tiebreakers` table (migration), `lib/nflPickEmTiebreaker.ts` — resolve the week's last game, submit/lock a guess at that game's kickoff, settle the actual total from final score, `rankByTiebreakerProximity` | opus / high |
| 2 | Tiebreaker UI: prompt below the week's slate in `NFLPickEmGameList`, explicitly labeled "Tiebreaker — used if you tie for most correct picks this week"; locked/readback states; guesses shown on the leaderboard after that game kicks off | sonnet / high |
| 3 | `lib/nflPickEmRewardWeeks.ts` — client-safe week-scope model (mirrors `rewardGameSlots.ts`), restricted to exactly two shapes: `{kind:"weekly",season}` (cadence "weekly", new cycle every NFL week) or `{kind:"season",season,fromWeek}` (cadence "none", one cycle from `fromWeek` — the current/next week at creation time — through the season's last week). No arbitrary week-number list. Normalize/serialize/validate, cadence+quota derivation, readback copy. Registry entry in `rewardDefinitions.ts`. Parameterize the hardcoded "Live Trivia" strings in `rewardTerms.ts` off a game label | opus / high |
| 4 | Server creation path: `resolveRewardCreationContext` branches per definition — NFL returns `nflWeekOptions` from `nfl_pickem_weeks` (current + future only) instead of `gameSlots`; `createReward` derives cadence/quota/`activeDays` from the scope and **refuses quantity ≠ 1 for week-winner** | opus / high |
| 5 | Wizard UI in `CreateRewardWizard.tsx` (both `admin` and `owner` variants — do not fork): new definition tile, win-condition step, week-scope picker, locked quantity, and the 3-picker rule surfaced on the terms + confirm screens | sonnet / high |
| 6 | Points-target accrual: hook `applyChallengeCampaignPoints({ gameType: "nfl-pickem" })` into NFL pick settlement, idempotent per pick, scoped to the campaign's weeks. Requires touching the shared `settlePendingPickEmPicks` path without disturbing daily Pick 'Em | opus / high |
| 7 | Week-winner resolver: `lib/nflPickEmWinnerRewards.ts` + `/api/cron/resolve-nfl-pickem-winners`. Fires when a week's last game finals; per venue, enforces ≥3 pickers, ranks by `correctPicks` then tiebreaker proximity, awards via `award_cycle_winner`. Adds the **pre-authorized** `vercel.json` cron entry (`0 13 * * *`) | opus / high |
| 8 | Player-facing awareness: active-reward banner on `/nfl-pickem` with a live "N of 3 players needed this week" state, Rewards-panel entry, leaderboard winner marker | sonnet / high |
| 9 | Full review pass + real-browser verification via the `verify` skill (seed → create reward as partner → play as 3 users → settle → confirm coupon in `/redeem-prizes`) | opus / high |

Each phase ends with `npm run build` + `npm test` + `npx tsc --noEmit`.

## Global constraints (every phase)

- TypeScript strict, **no `any`** — `lib/nflPickEm.ts` already has `any` in
  `fetchNFLGamesFromBDL` / `syncNFLWeeks`; do not add more.
- Absolute `@/` imports. Tailwind classes only. Arrow functions for new components/utils.
- Do not modify `proxy.ts`, `lib/supabaseAdmin.ts`, or existing files in
  `supabase/migrations/`. New migration files are allowed. `vercel.json` is untouchable
  except for the one pre-authorized cron entry in Phase 7.
- Multi-winner quota stays atomic via `challenge_cycle_winners` + `award_cycle_winner`.
  Never enforce the quota in application code.
- Every leaderboard/standings query filters `venue_id`.

## Open risk

Phase 6 modifies the settlement path **shared** with daily Pick 'Em. The safest shape is
a separate NFL-only pass keyed on `sport_slug = 'nfl'` rather than an inline branch
inside `settlePendingPickEmPicks`; decide this at the top of Phase 6 and note the choice
in the phase doc. **Resolved:** option B — a separate sweep. Daily Pick 'Em's settlement
is byte-for-byte untouched.

---

# As-built (Phases 0–9, 2026-07-27)

## Module map — which file owns what

| Concern | Module |
| --- | --- |
| Week-scope model (client-safe): normalize/serialize, cadence+quota+`activeDays` derivation, readback copy, `NFL_REWARD_MIN_PICKERS` (=3), `NFL_REWARD_ACTIVE_DAYS` | `lib/nflPickEmRewardWeeks.ts` |
| Registry entry (`nfl_pickem_challenge`), per-definition threshold step, `describeRewardPrize` | `lib/rewardDefinitions.ts` |
| Server creation path: NFL branch in `resolveRewardCreationContext` (returns `nflSeason`, not `gameSlots`), scope→terms in `createReward` | `lib/rewards.ts` |
| Wizard UI, both `admin` and `owner` variants (not forked) | `components/rewards/CreateRewardWizard.tsx` |
| Tiebreaker: last-game resolution, kickoff lock, settle actual total, `rankByTiebreakerProximity` | `lib/nflPickEmTiebreaker.ts` + `app/api/nfl-pickem/tiebreaker/route.ts` + `components/nfl-pickem/NFLTiebreakerCard.tsx` |
| Points-target accrual (separate NFL-only sweep) | `lib/nflPickEmRewardAccrual.ts`, invoked from `/api/cron/pickem-settle` |
| Week/season-winner resolver | `lib/nflPickEmWinnerRewards.ts` + `/api/cron/resolve-nfl-pickem-winners` |
| Player-facing banner / leaderboard / rewards read | `components/nfl-pickem/NFLPickEmRewardBanner.tsx`, `NFLPickEmLeaderboard.tsx`, `app/api/nfl-pickem/rewards/route.ts`, `app/api/nfl-pickem/leaderboard/route.ts` |

Migrations: `20260727120000_rewards_nfl_week_scope.sql`,
`20260727120100_nfl_pickem_tiebreakers.sql`,
`20260727120200_nfl_pickem_challenge_accrual.sql`. **All three unapplied** as of this
writing — apply before the feature can run against a real database.

## Deviations from the phase docs (why the code differs from the plan above)

- **Threshold step is per-definition.** `REWARD_THRESHOLD_NOT_MULTIPLE_OF_TEN_MESSAGE` was
  **deleted**, not made definition-aware — a per-definition message can't be matched by
  string equality. `createReward` now throws `RewardTermsError(rewardThresholdStepMessage(definition))`
  and both routes map it to 400 by type. `isValidRewardThreshold(threshold, definition)`
  takes the definition.
- **Client-safe message placement.** `REWARD_NFL_SEASON_UNAVAILABLE_MESSAGE` and
  `NFL_WEEK_SCOPE_INVALID_MESSAGE` live in `lib/nflPickEmRewardWeeks.ts` (client-safe);
  `lib/rewards.ts` (`"server-only"`) re-exports the first. Same for `NFLRewardSeasonContext`.
- **Season number is `now.getFullYear()`**, matching `app/api/nfl-pickem/weeks/route.ts`.
  There is no canonical season resolver in the codebase; Jan/Feb resolves "wrong" but
  identically wrong across the whole feature, so a reward can never point at a different
  season than the game page.
- **Game picker is gated off for NFL** (`useGamePicker = !isNFLDefinition && …`) — otherwise
  an NFL game-winner reward would render the Live Trivia slot picker instead of the
  week-scope UI.
- **Accrual groups by (user, venue, `starts_at`)**, not (user, venue): one user's Thu/Sun/Mon
  wins can fall in different cycles, so a single `occurredAt` per user would be wrong.
  Idempotence is `pickem_picks.challenge_accrued_at` (+ partial index). Unusable rows
  (blank user/venue, unparseable `starts_at`) are stamped, not retried.
- **Retroactive-win guard** is an **opt-in** `requireCampaignCreatedBeforeOccurrence` param
  on `applyChallengeCampaignPoints` (+ `campaignExistedAt`); the bar is per-campaign
  `created_at`, so it cannot be a filter in the sweep. Default unchanged for all other callers.
- **Resolver entry point is venues, not campaigns** — distinct `pickem_picks.venue_id` in the
  contest window, then one venue-scoped campaign read each (campaigns hit a 200-row cap).
  Completeness = all games decided, where a scored-but-winnerless game counts 12h after
  kickoff (otherwise a tie game would never resolve). Sweeps current **and** previous season
  (weeks run into January). The "was this reward live?" bar is the decisive week's **first
  kickoff** for both scopes — a season reward's `startDate` predates its own `createdAt`, so
  a `createdAt` bar would skip every mid-season reward.
- **Banner renders inside `NFLPickEmGameList`** (after the header, before the Week Selector),
  not as a `page.tsx` sibling: `page.tsx` has no venue/week context and `NFLPickEmGameList`
  owns the screen shell.
- **Bugs found and fixed in shared code along the way:** `VenueChallengesPanel` /
  `ChallengeRedeemPanel` hardcoded "Awarded to the winner of the Live Trivia game" for **all**
  `game_winner` rewards (now generic); `inferChallengeGameType` substring-matched
  "pick"/"nfl" and mis-iconed NFL Pick 'Em (now keyed off `rewardDefinitionId` first, with
  `"nfl-pickem"` added to `ChallengeGameType`).
- **Tiebreaker gate:** `getWeekTiebreakerGame` / `listNFLPickEmGames` do **not** enforce the
  "week hasn't started" check — that lives only in `app/api/nfl-pickem/games/route.ts`
  (`isNFLWeekStarted`). Only affects future/unlisted weeks, which the normal UI can't reach.

## `vercel.json` — still open

The pre-authorized cron entry was **never added**: `.claude/settings.local.json` carries a
hard `deny` on `Edit(vercel.json)` / `Write(vercel.json)` that overrides the plan's
pre-authorization. Add this object to `crons` by hand — **without it the week-winner reward
never resolves in production**:

```json
{ "path": "/api/cron/resolve-nfl-pickem-winners", "schedule": "0 13 * * *" }
```

## Verification status

`npm run build`, `npx tsc --noEmit`, `npm run lint`, `npm test` (998 passed, 13 skipped) and
`npm run test:god-mode-join` (34 passed) all pass. Every locked product decision above was
re-verified against the code in Phase 9.

**Not yet done: the real-browser end-to-end pass.** No phase in this run could reach
`.env.local` or a Supabase service-role key, so the seeded path (seed →
create reward as partner and admin → play as 3 users → settle cron → resolver cron →
coupon in `/redeem-prizes` → re-run both crons) has never been executed. `docs/nfl-pickem-reward-phase9.md`
§3 is the script for it; `tests/api.nfl-pickem.test.ts` is `describe.skip`'d for the same
reason. Run it before trusting this feature in production.
