# nfl-pickem-reward Run Log

Shared memory between the independently-run phases in docs/run_phases.sh.
Each phase reads this file first; a note here about an earlier phase
supersedes anything that contradicts it in that later phase's own doc.

## Phase 2

Implemented as specced: `app/api/nfl-pickem/tiebreaker/route.ts` (GET/POST, thin
wrapper over `lib/nflPickEmTiebreaker.ts`), `NFLTiebreakerCard.tsx` (rendered
below the games list, above the leaderboard, in `NFLPickEmGameList`), and
leaderboard enrichment (`app/api/nfl-pickem/leaderboard/route.ts` merges in
`listTiebreakerGuesses`/`rankByTiebreakerProximity` only for `mode=week`;
`NFLPickEmLeaderboard.tsx` renders the per-entry line + a "Closest guess" badge
for whichever tied top-rank entry wins proximity).

Deviation: the "no active week-winner reward → still render the card" case
isn't specially branched — the card renders unconditionally whenever a
tiebreaker game exists for the selected week, which already satisfies it.

Discovery for later phases: `getWeekTiebreakerGame`/`listNFLPickEmGames` do
**not** enforce the "week hasn't started yet" gate — that check lives only in
`app/api/nfl-pickem/games/route.ts` (`isNFLWeekStarted`). The tiebreaker route
doesn't replicate it (out of this phase's scope; only affects future/unlisted
weeks, which aren't reachable through the normal UI anyway). Phase 7's resolver
doesn't need to worry about this since it only acts on already-final games.

Could not execute the new `tests/api.nfl-pickem.test.ts` cases in this
sandbox — that whole file is `describe.skip`'d here (no `SUPABASE_SERVICE_ROLE_KEY`
in env), same as its pre-existing tests. `npm run build`, `npx tsc --noEmit`,
`npm run lint`, and `npm test` (944 passed, 11 skipped) all pass. The privacy
test asserts the GET response *shape* only (`{ok, game, guess}`, no field
capable of carrying another user's guess) rather than a full round-trip,
since inserting real opposing-user rows needs FK-valid `users`/`venues` rows
this file's existing convention doesn't create. Phase 9's real-browser/seeded
verification should confirm the round-trip against the seed script's sim users.

## Phase 3

Deviations: (1) `NFLRewardWeekScope` is a type alias of the canonical
`NFLWeekScope` Phase 0 already added to `types/index.ts` — one shape, matching
the column's check constraint. (2) `describeNFLWeekScope(scope, winCondition,
{quantity, threshold})` takes an object 3rd arg; the points-target copy needs
both numbers. (3) `REWARD_THRESHOLD_NOT_MULTIPLE_OF_TEN_MESSAGE` is **deleted**,
not made definition-aware: a per-definition message can't be matched by string
equality, so `createReward` now throws `RewardTermsError`
(`rewardThresholdStepMessage(definition)` in `rewardDefinitions.ts`) and both
routes map it to 400 by type.

For later phases: `isValidRewardThreshold(threshold, definition)` now takes the
definition. `NFL_REWARD_ACTIVE_DAYS` and `NFL_REWARD_MIN_PICKERS` (=3) are
exported — reuse, don't re-derive. `rewardTerms.ts` copy takes a trailing
`gameLabel` (default "Live Trivia"). The definition is visible in the wizard but
selecting it hits the "not scheduled" block until Phase 4 branches
`resolveRewardCreationContext`. tsc/lint/build/`npm test` (957 passed) all pass;
no existing reward test needed edits.

## Phase 4

Implemented as specced. Deviations: (1) `NFLRewardSeasonContext` (the `nflSeason`
shape) is declared in `lib/nflPickEmRewardWeeks.ts`, not `lib/rewards.ts`, so the
wizard's client-side DTO can import it without touching a `server-only` module.
(2) `RewardCreationContext.nflSeason` is required-but-nullable (`| null`), not
optional — every return path sets it explicitly. (3) The season number is
`now.getFullYear()`, matching `app/api/nfl-pickem/weeks/route.ts`; there is no
canonical season resolver in the codebase, and diverging here would let a reward
point at a different season than the game page. Jan/Feb would resolve wrong, but
identically wrong across the whole feature.

For later phases: `RewardCreationContextDTO` and `CreateRewardSubmission` in
`CreateRewardWizard.tsx` already carry `nflSeason` / `nflWeekScope`, and both
hosts spread the submission into their POST body — **Phase 5 only needs UI**, no
route or type plumbing. Both routes map `REWARD_NFL_SEASON_UNAVAILABLE_MESSAGE`
to 409. `resolveNFLSeasonContext` calls `listNFLWeeks(season, true)` — tests must
mock `@/lib/nflPickEm`. tsc/lint/build/`npm test` (968 passed) all pass.

## Phase 5

Implemented as specced. Deviation: `REWARD_NFL_SEASON_UNAVAILABLE_MESSAGE` lived
only in `"server-only"` `lib/rewards.ts`, so the client wizard couldn't import it.
Moved it to `lib/nflPickEmRewardWeeks.ts` (client-safe), `lib/rewards.ts` now
re-exports it — mirrors how `NFL_WEEK_SCOPE_INVALID_MESSAGE` already lives there.

Bug caught mid-phase: `useGamePicker` would have been `true` for an NFL
game-winner reward when the game-picker flag is on, rendering the Live Trivia
slot picker instead of the week-scope UI. Gated it `!isNFLDefinition`.

Discovery: `RewardDefinition.accent` is unused everywhere, including Live
Trivia's — the doc's "verify the tile's accent mapping" has nothing to verify;
left unwired rather than adding an asymmetric one-off treatment.

No component-test harness exists in this repo — skipped per the doc's own
fallback clause; verified via tsc/lint/build/`npm test` (968 passed) and defer
to Phase 9's browser pass.

## Phase 6

Chose **option B** (separate sweep, `accrueNFLPickEmChallengePoints` in
`lib/nflPickEmRewardAccrual.ts`, called after `settlePendingPickEmPicks` in
`/api/cron/pickem-settle`) — daily Pick 'Em's settlement is byte-for-byte
untouched. Migration `20260727120200` adds `pickem_picks.challenge_accrued_at`
+ a partial index (**unapplied**).

Deviations: (1) Grouped by **(user, venue, `starts_at`)**, not (user, venue) —
one user's Thu/Sun/Mon wins can fall in different cycles, so a single
`occurredAt` per user would be wrong. (2) The retroactive-win guard is inside
`applyChallengeCampaignPoints` via a new **opt-in** param
`requireCampaignCreatedBeforeOccurrence` (+ `campaignExistedAt` helper);
filtering in the sweep can't work because the bar is per-campaign `created_at`.
Default is unchanged for all other callers.

For later phases: `NFL_PICKEM_SPORT_SLUG` and `PICKEM_REWARD_POINTS` are now
exported from `lib/nflPickEm.ts`. Unusable rows (blank user/venue, unparseable
`starts_at`) are stamped, not retried. Cron response gained
`nflRewardAccrual`/`nflRewardAccrualError`; accrual failure never fails
settlement. tsc/lint/build/`npm test` (980 passed) pass; the seeded-DB half of
Acceptance can't run here (no service-role key) — Phase 9 must confirm progress
counts are ×1 not ×10 and that a re-run doesn't move them.

## Phase 7

`lib/nflPickEmWinnerRewards.ts` + `/api/cron/resolve-nfl-pickem-winners` as
specced. **`vercel.json` was NOT edited** — `.claude/settings.local.json` has a
hard `deny` on `Edit(vercel.json)`/`Write(vercel.json)` that overrides the doc's
pre-authorization. The entry (`/api/cron/resolve-nfl-pickem-winners`,
`0 13 * * *`) still needs adding by hand; everything else is done.

Deviations: (1) venues come from distinct `pickem_picks.venue_id` in the contest
window (campaigns can't be the entry point — 200-row cap), then one venue-scoped
campaign read each; (2) completeness = all games decided, where a
scored-but-winnerless game counts 12h after kickoff (tie games would never
resolve); (3) sweeps current AND previous season (season weeks run into
January); (4) the "was it live" bar is the decisive week's FIRST KICKOFF for
both scopes — a season reward's `startDate` predates its own `createdAt`, so the
doc's bar would skip every mid-season reward.

For later phases: `NFL_WINNER_MIN_PARTICIPANTS` aliases `NFL_REWARD_MIN_PICKERS`;
exported `nflWinnerCycleStart` provably equals `computeCycleStart`; the report
carries `skippedBelowMinimum`/`pendingTiebreaker` for Phase 8 copy. Lookback is
35 days, reaching seed weeks 996/997 — but **Phase 9 must backdate the
campaign's `created_at`** before a past week will award. tsc/lint/build/`npm
test` (998) pass.

## Phase 8

Added `app/api/nfl-pickem/rewards/route.ts` (wrapper: campaigns via
`getChallengeCampaignSnapshotForUser`, participant count via
`getNFLPickEmLeaderboard`, winners via `listChallengeCycleWinners` matched on
`nflWinnerCycleStart` by parsed instant, not string equality). Used by both
`NFLPickEmRewardBanner.tsx` and the leaderboard's winner marker.

Deviation: banner renders inside `NFLPickEmGameList` (after the header, before
Week Selector), not as a `page.tsx` sibling — `page.tsx` has no venue/week
context and `NFLPickEmGameList` owns the actual screen shell (app bar +
background); a sibling would render outside it.

Bugs found+fixed per item 2: `VenueChallengesPanel`/`ChallengeRedeemPanel` had
"Awarded to the winner of the Live Trivia game" hardcoded for ALL
`winCondition: "game_winner"` rewards (now generic — the real game is already
named in `campaign.rules`). `inferChallengeGameType` substring-matched
"pick"/"nfl", silently classifying NFL Pick 'Em as a plain Pick'Em icon; now
keyed off `rewardDefinitionId` first, added `"nfl-pickem"` to
`ChallengeGameType` + `ChallengeCampaignCard`.

Discovery: no client-safe prize-copy renderer existed anywhere (only
`PrizeWalletPanel`'s private, post-win helpers) — added `describeRewardPrize`
to `lib/rewardDefinitions.ts`. `NFL_WINNER_MIN_PARTICIPANTS` is server-only;
imported its source `NFL_REWARD_MIN_PICKERS` from `lib/nflPickEmRewardWeeks.ts`
instead (Phase 5 precedent). Leaderboard's "no reward" note requires knowing
`currentWeekId` (new state in `NFLPickEmGameList`) so it never fires on the
still-live week.

Could not run the dev server/Playwright in this sandbox (network commands
needed approval not available here) — real-browser verification is Phase 9's
job per the master plan; added 2 cases to `tests/api.nfl-pickem.test.ts`
(skipped like the rest of that file). `npm run build`, `npx tsc --noEmit`,
`npm run lint`, `npm test` (998 passed, 13 skipped) all pass.

## Phase 9

Section 1 verified against the code, all seven boxes pass (no week-range shape
exists anywhere; quota 1 refused not clamped; seven activeDays thu-first; season
scope carries both dates; accrual is `pickIds.length` over `status = "won"`;
3-picker rule in resolver + wizard + banner + leaderboard; prizes go through the
one shared `normalizeRewardPrize`). Section 5 found one real violation — three
new relative imports in `NFLPickEmGameList.tsx`; converted that whole import
block to `@/`. No `any`, quota only via `award_cycle_winner`, every query
venue-scoped, all award ordering deterministic (`localeCompare` tiebreaks).

Blocked, deviating from the doc: **`vercel.json` still lacks the cron entry**
(hard `deny` in `.claude/settings.local.json` beats the doc's pre-authorization)
and **the browser pass never ran** — `node --env-file=.env.local` needs an
approval unavailable here. So per §6 the phase docs and this log are NOT deleted.
As-built notes, deviations, the `vercel.json` gap and the unapplied migrations
are folded into `docs/nfl-pickem-reward-plan.md`; CLAUDE.md gained the Rewards
bullet. build/tsc/lint/`npm test` (998)/`test:god-mode-join` (34) all pass.
