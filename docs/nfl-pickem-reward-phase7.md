# Phase 7 — Week-winner resolver

Read `docs/nfl-pickem-reward-plan.md` and `docs/nfl-pickem-reward-phase1.md`
(the tiebreaker contract) first.

Awards the "most correct picks" reward. **Read `lib/liveTriviaWinnerRewards.ts`
end to end before writing anything** — it is the direct template, and its header
comment documents every trap this phase will otherwise re-discover (idempotency
via the winner ledger, ties, the tie cap, the "was the reward live when the
contest started" check, one-off spend tracking).

## `vercel.json` — PRE-AUTHORIZED for this phase only

`vercel.json` is normally a hard "do not touch without instruction" boundary in
`CLAUDE.md`. **The user has explicitly pre-authorized the one edit described
below.** Do not stop to ask; make it.

Append exactly one entry to the `crons` array, changing nothing else in the file:

```json
{
  "path": "/api/cron/resolve-nfl-pickem-winners",
  "schedule": "0 13 * * *"
}
```

Daily at 13:00 UTC (~8am ET). That catches every Monday-night finish the next
morning, and running daily means a missed or errored run self-heals within 24
hours — which the sweep's idempotency (below) makes safe. Do not use a
minute-level schedule; this contest resolves once a week, and the sweep reads
standings for every venue with an active reward.

This authorization covers **only** adding that entry. Any other `vercel.json`
change still requires asking.

## New module: `lib/nflPickEmWinnerRewards.ts`

`import "server-only"`. Export `resolveNFLPickEmWinnerRewards(nowMs?: number)`
returning a report shaped like `ResolveGameWinnerRewardsReport`.

### Trigger

A contest resolves when its window is **complete**:

- **weekly** scope → when every game in that NFL week is final (or the week's
  `status` is `complete` — check which `lib/nflPickEm.ts` actually maintains and
  use the reliable one; prefer "all games final" over a status column that may
  lag).
- **season** scope → when the season's final week is complete.

Sweep a lookback window wider than the cron interval so a missed run self-heals.
Idempotency makes this safe (below).

### Per contest, per venue

1. Find active campaigns with `winCondition === "game_winner"`,
   `rewardDefinitionId === "nfl_pickem_challenge"`, and a `nflWeekScope` covering
   this week/season. **Fetch campaigns per venue**, not via one unscoped
   `listChallengeCampaigns()` — that call caps at 200 rows globally and unrelated
   venues' campaigns can crowd out the one you need. `liveTriviaWinnerRewards.ts`
   has a comment explaining this exact bug; follow it.
2. Load standings via `getNFLPickEmLeaderboard({ venueId, mode, weekId | season, userId: undefined })`
   from `lib/nflPickEm.ts:1270`. It is already venue-scoped and rank-assigned. Do
   not re-query `pickem_picks`.
3. **Minimum participation gate — 3 distinct users with at least one pick.**
   Fewer than 3 → award nobody, and record it in the report as a distinct outcome
   (e.g. `skippedBelowMinimum`) rather than silently. This is a locked product
   decision and is stated to both partners and players; the report is how we prove
   it fired correctly. Define the constant as
   `export const NFL_WINNER_MIN_PARTICIPANTS = 3;` so it can be asserted in tests
   and referenced by the UI copy in Phase 8.
4. Top `correctPicks` wins. `totalPoints` is `correctPicks × 10` so either sorts
   identically — **use `correctPicks`**, it is the unit the reward is stated in.
   Award nobody if the top count is 0.
5. **Ties → the tiebreaker.** Collect everyone tied at the top count, then call
   `settleWeekTiebreaker(weekId)` followed by
   `rankByTiebreakerProximity(tiedUserIds, guesses, actualTotal)` from
   `lib/nflPickEmTiebreaker.ts`. **Take exactly the first result — 1 winner.**
   This differs deliberately from Live Trivia, which widens the quota to the tie
   count; here the whole point of the tiebreaker is to produce a single winner.
   - For a **season** scope, break ties on the **final week's** tiebreaker.
   - If `actualTotal` is null (tiebreaker game not final yet), **do not award** —
     return and let a later sweep resolve it. Do not fall back to an arbitrary
     winner.
   - If the tiebreaker still cannot separate them (nobody guessed, identical
     guesses), `rankByTiebreakerProximity` falls back to `userId` ascending, which
     is deterministic. Award that single user and flag it in the report
     (`tiebreakerUnresolved: true`) so it is visible rather than silent.
6. Award via `awardCycleWinner` from `lib/challengeCampaigns.ts` with
   `winnerQuota: 1`. **Never re-implement the quota check** — the
   `award_cycle_winner` RPC enforces it atomically.

### Idempotency

Key each award on the contest's own `cycleStart`:
- weekly → the NFL week's start instant (derive from `week_start_date`; use the
  same instant Phase 3's Thursday-anchored `computeCycleStart` would produce for
  that week, so the resolver and the engine agree on cycle identity).
- season → the campaign's `startDate` instant.

`challenge_cycle_winners` is unique on `(challenge_id, cycle_start, winner_user_id)`,
so a re-sweep awards nobody twice. Verify your `cycleStart` derivation actually
matches `computeCycleStart` for a weekly campaign — if it doesn't, re-sweeps will
mint duplicate prizes under a second cycle key. **Write a test for this
specifically.**

### "Was the reward live for this contest?"

Port `campaignWasLiveForOccurrence`'s logic: require
`campaign.createdAt <= contest start`, respect `getCampaignCloseTimestampMs`, and
skip campaigns with `winnerUserId` already set. A partner creating a reward on
Sunday night must not win it for the week that is about to end.

### One-off spend

A `season`-scope reward is non-recurring: once awarded, deactivate it
(`deactivateResolvedReward`'s equivalent) and track it in an in-sweep
`spentCampaignIds` set so two contests in the same sweep can't both claim it. A
`weekly` reward stays active and resolves every week.

### Error isolation

One bad week or campaign must never abort the sweep — collect into
`report.errors` and continue, exactly as the Live Trivia resolver does.

## Cron route

`app/api/cron/resolve-nfl-pickem-winners/route.ts`, modeled on
`app/api/cron/resolve-live-trivia-winners/route.ts` (`isCronAuthorized`, POST with
a GET alias, JSON report out).

Then add the pre-authorized `vercel.json` entry given at the top of this doc.

## Tests

New `tests/lib.nfl-pickem-winner-rewards.test.ts`:

- Clear winner (Phase 0 seed week 997) → that user is awarded, quota 1.
- Exact tie (seed week 998) → the tiebreaker decides, and the winner is the
  closest guess.
- Tie where `actualTotal` is null → **nobody awarded**, and a later sweep with it
  settled does award.
- Fewer than 3 pickers (seed week 996) → nobody awarded, reported as skipped.
- Zero correct picks → nobody awarded.
- Re-running the sweep awards nobody a second time.
- The resolver's `cycleStart` for a weekly campaign equals `computeCycleStart`'s
  for the same campaign and week.
- A campaign created after the week started is skipped.
- Venue scoping: venue A's standings never award venue B's campaign.
- A `season` reward deactivates after awarding; a `weekly` one does not.

## Constraints

- No `any`. Absolute `@/` imports. `import "server-only"`.
- No new migration should be needed. Do not touch `proxy.ts`,
  `lib/supabaseAdmin.ts`, or existing migrations.
- `vercel.json`: the single cron entry above and nothing else.

## Acceptance

- `npm run build` and `npm test` pass.
- Hitting the new cron route against the Phase 0 seed awards exactly one winner
  for week 997, one tiebreak-decided winner for 998, and none for 996.
- `vercel.json` contains the new cron entry and is otherwise byte-identical
  (`git diff vercel.json` shows only the added object).
