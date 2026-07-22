# Plan: Game-Winner Win Condition — Code Review Fixes

Addresses the 10 findings from the code review of commit `409e251` (see
`docs/rewards-game-winner-condition-handoff.md` for what shipped and why).

**Blast radius reminder:** every phase below touches prize-awarding logic that
mints real gift cards and menu discounts. Findings 2, 3, and 8 each mint prizes
nobody authorized; they lead the plan for that reason.

---

## Standing decision this plan encodes

**Finding 1 is fixed on the READ side, not the write side.**

The resolver keys awards on `cycle_start = occurrence.startMs` (one game, one
cycle). The venue-panel snapshot resolves a campaign's "current cycle" via
`computeCycleStart` (or the epoch sentinel for one-offs). They never match, so
winners never see "You Won."

Two fixes exist:

- **Write side** — resolver adopts the campaign's `computeCycleStart` anchor.
  Cheapest change, and it fixes Finding 2 for free. **Rejected:** it silently
  reverses two decisions the handoff records as explicit product calls
  ("recurring ones stay active and resolve every occurrence separately"; ties
  handled per game). A weekly reward at a Tue+Thu trivia venue would award once
  per week instead of once per game.
- **Read side (chosen)** — keep per-game cycle keys; teach the snapshot to
  resolve a `game_winner` campaign's current cycle from its most recent ledger
  row rather than a computed anchor.

If you'd rather take the write-side fix and accept once-per-cycle semantics, say
so before Phase 2 — it collapses Phases 1 and 2 into one much smaller change.

---

## Phase 1 — Resolver award correctness (Findings 2, 3, 8) ✅ DONE

**As built:** `campaignWasLiveForOccurrence` gates every award on
`occurrence.startMs >= campaign.createdAt` (the reward must have existed for the
*whole* game, not merely by the time it ended), on `winnerUserId` being null, and
on the campaign's close boundary via a now-exported
`getCampaignCloseTimestampMs`. Occurrences are sorted oldest-first and a
`spentCampaignIds` set marks a one-off reward spent *before* the deactivation
write, so a failed write can't let it pay out twice in the same sweep. Ties are
sorted by user id (stability matters: standings row order is not stable across
queries, so an unsorted capped subset could award a different set on re-sweep and
exceed the cap in aggregate) and trimmed to `GAME_WINNER_TIE_QUOTA_CAP`, with
`tieCapApplied` surfaced on the resolution so the cron report shows it.

**Tie cap set to 5** — chosen, not derived. Tune the exported constant in
`lib/liveTriviaWinnerRewards.ts` if that's the wrong number for your economics.

9 new tests in `tests/lib.live-trivia-winner-rewards.test.ts` (20 total).

**Model: Claude Opus 4.8 — high effort.**
Money-adjacent, three interacting bugs in one function, and the fix for each
constrains the others. This is the phase where a plausible-looking patch can
still mint unauthorized prizes.

**Files:** `lib/liveTriviaWinnerRewards.ts`, `tests/lib.live-trivia-winner-rewards.test.ts`

1. **Finding 3 — retroactive awards.** Add an eligibility floor before awarding:
   an occurrence only resolves a campaign if `occurrence.endMs >=
   campaign.createdAt`. `createReward` sets no `startDate`/`endDate`, so
   `created_at` is the only temporal anchor available — confirm `mapCampaignRow`
   exposes it on `ChallengeCampaign` and add it if not. Also run the campaign
   through the existing `isCampaignEligibleAtTime`-style window checks (end date,
   `winnerUserId`) rather than the current `isActive`-only filter, so an expired
   campaign can't award.
2. **Finding 2 — one-off double-award within a sweep.** After
   `deactivateResolvedReward` succeeds, mutate the in-memory campaign
   (`campaign.isActive = false`) *and* re-check it at the top of the per-campaign
   loop, so remaining occurrences in the same sweep skip it. Also sort
   `occurrences` by `startMs` ascending so which game wins a one-off is
   deterministic (earliest), not dependent on row order.
3. **Finding 8 — unbounded tie quota.** Clamp the widened quota:
   `Math.min(winners.length, TIE_QUOTA_CAP)` with an explicit cap constant, and
   respect `WINNER_QUOTA_CAP` from `lib/rewards.ts`. Decide the cap's value
   deliberately — an all-play-all-correct game can tie 12+ players, each minting
   a real coupon. Record the chosen number and its rationale in the module
   comment next to the existing TIES note.

**Tests to add:** one-off reward + two ended occurrences in one sweep awards
once; occurrence ending before `campaign.createdAt` awards nobody; a 15-way tie
mints at most the cap; expired-end-date campaign awards nobody.

**Verify:** `npm run test -- tests/lib.live-trivia-winner-rewards.test.ts`,
then full `npm run test`, `npx tsc --noEmit`, `npm run lint`.

---

## Phase 2 — Cycle-key read alignment (Finding 1) ✅ DONE

**As built:** `resolveCurrentCycleWinnersForSnapshot` now splits its input into
cycle-keyed and `game_winner` campaigns. Cycle-keyed campaigns keep the exact
single batched read they had. Game-winner campaigns get one small bounded query
each (`.eq(challenge_id).order(cycle_start desc).limit(50)`), and their "current
cycle" resolves to the max `cycle_start` found — compared by instant, never by
string. A campaign with no ledger rows falls back to the epoch sentinel so it
reads as a fresh, unwon reward.

The per-campaign loop is skipped entirely when a venue has no game-winner reward,
so the venue-home hot path is byte-for-byte unchanged for every venue today — a
regression test pins `challenge_cycle_winners` at exactly one read in that case.
6 new tests in `tests/lib.rewards-cycle-snapshot.test.ts` (15 total).

**Model: Claude Opus 4.8 — high effort.**
Modifies `getChallengeCampaignSnapshotForUser` / `resolveCurrentCycleWinnersForSnapshot`,
which are shared by every reward type and sit on the venue-home path. Memory
note *"Venue page SSR must stay fast"* applies directly — a regression here looks
like a redirect-to-login, not like a slow page.

**Files:** `lib/challengeCampaigns.ts`, plus a test in the rewards suite.

1. In `resolveCurrentCycleWinnersForSnapshot`, branch on
   `campaign.winCondition === "game_winner"`. For those campaigns, do **not**
   compute a target cycle anchor.
2. Instead, resolve their winners from the most recent `cycle_start` present in
   `challenge_cycle_winners` for that `challenge_id`. Fold this into the existing
   single batched read where possible — select game-winner challenge rows without
   the `.in("cycle_start", …)` restriction, then bucket each challenge to its own
   max `cycle_start`. **Do not add a second round-trip per campaign**; the
   existing function is deliberately one batched query.
3. Compare by instant (`new Date(x).getTime()`), never by string — the file
   already documents the Postgres `+00:00` vs JS `Z` hazard in three places.
4. Confirm `quotaRemaining`, `winnerUsernames`, `viewerWon`, and the
   `prizeClaimedAt` lookup at line ~1919 all key off the same resolved cycle.

**Verify:** the winner's venue Rewards card shows "You Won → Tap to Claim
Prize"; a non-winner sees "All Claimed" once quota is filled. Use the `verify`
skill for the real-browser pass — this is a venue-scoped game surface and its
symptom is purely visual.

---

## Phase 3 — Flag gate on creation (Finding 4)

**Model: Claude Sonnet 5 — low effort.** Small, well-bounded, one guard clause.

**Files:** `lib/rewards.ts`, `tests/api.owner.competitions.test.ts`

Add to `createReward`, next to the existing `supportsGameWinner` check: reject
`winCondition === "game_winner"` when `isRewardsEnabled()` is false, using a new
exported message sentinel wired into both API routes' 400 lists (they already
have the pattern). Then correct the now-true comment at
`lib/liveTriviaWinnerRewards.ts:83-85`, which currently asserts an invariant
nothing enforces.

---

## Phase 4 — Query-truncation hazards (Findings 6, 7)

**Model: Claude Sonnet 5 — medium effort.** Mechanical, but both fixes are
silent-wrong-answer bugs, so the test must actually exercise the boundary.

**Files:** `lib/liveShowdownEngine.ts`, `lib/liveTriviaWinnerRewards.ts`

1. **Finding 6 —** `loadOccurrenceFinalStandings` selects unbounded. Either
   paginate with `.range()` until a short page returns, or push the aggregation
   into Postgres via an RPC that returns per-user totals. Pagination is the
   smaller change and needs no migration; prefer it unless row counts argue
   otherwise. Note `loadScheduleRows` in the same file already passes an explicit
   `.limit(2000)` — the codebase treats this cap as real.
2. **Finding 7 —** the resolver's `listChallengeCampaigns()` has no venue filter
   and caps at 200 rows globally. Restructure to fetch per venue:
   collect the distinct `venueId`s from `findEndedOccurrences`, then call
   `listChallengeCampaigns({ venueId })` per venue (batched with
   `Promise.all`). This also makes `campaignCoversVenue` mostly redundant — keep
   it as the defense-in-depth check it already documents itself as.

**Tests:** standings aggregation across a page boundary; resolver finds a
game-winner campaign when >200 active campaigns exist.

---

## Phase 5 — Redeem-panel gauge (Finding 5)

**Model: Claude Sonnet 5 — low effort.** One conditional, and the exact fix
pattern already exists two branches above it.

**Files:** `components/challenges/ChallengeRedeemPanel.tsx`

Add a `winCondition === "game_winner"` branch alongside the existing
`isLeaderboard` branch, replacing `<GaugeBar>` with the same explanatory copy
`VenueChallengesPanel` now uses ("Awarded to the winner of the Live Trivia
game."). Also suppress the "+N pts since last visit" badge for these campaigns —
points accrual is meaningless for them. Confirm the panel's campaign type carries
`winCondition` (mirror the `venueHubShared.tsx` addition).

**Convention note:** this file uses inline `style={{}}` throughout. Per CLAUDE.md
that exception is scoped to `components/venue-screen/*` only — do not add new
inline styles here; use Tailwind classes for anything you add.

---

## Phase 6 — Cron auth hardening + duplication (Findings 9, 10)

**Model: Claude Sonnet 5 — medium effort.** Small diff, but it is the
authentication gate on a prize-minting endpoint, so the review bar is higher than
the line count suggests.

**Files:** new `lib/cronAuth.ts`;
`app/api/cron/resolve-live-trivia-winners/route.ts`,
`app/api/cron/seed-live-trivia-occurrences/route.ts`, and any other cron route
carrying the same copied helper (grep first — there may be more than two).

1. Extract `isAuthorized` into one shared helper.
2. Drop the `.toLowerCase()` on both sides of the bearer comparison — it folds a
   mixed-case secret's search space from 62^n to 36^n. Use a constant-time
   comparison (`crypto.timingSafeEqual` over equal-length buffers).
3. Review the `x-vercel-cron` fallback that applies when `CRON_SECRET` is unset —
   any caller can set that header. Decide whether to keep it or fail closed;
   given this endpoint mints prizes, failing closed is the safer default.
4. Change `deactivateResolvedReward` to go through `updateChallengeCampaign`
   rather than writing `challenge_campaigns` directly, so it inherits that
   function's normalization.

**Migrating both cron routes at once is the point** — leaving the seeder on the
old copy recreates the divergence this phase exists to remove.

---

## Phase 7 — Verification and the open cron question

**Model: Claude Opus 4.8 — medium effort.** Judgment-heavy (deciding what
counts as proof), not implementation-heavy.

1. Full gate: `npx tsc --noEmit`, `npm run lint`, `npm run test`, and
   `npm run test:god-mode-join` if anything in the auth/proxy path moved.
2. Browser pass via the `verify` skill on the venue Rewards panel — Phase 2's
   fix has no server-observable signature, so a curl-level check cannot confirm
   it.
3. **Close the handoff's open item:** confirm the cron actually fires in
   production. Check the Vercel dashboard's Cron Jobs tab for last-run
   status/timestamp on `resolve-live-trivia-winners` — that is authoritative and
   avoids the two failed `vercel logs` attempts. Do this *before* shipping
   Phases 1–4, because every one of those fixes is inert if the sweep never runs.
4. **Do not read `.env.local`** to obtain `CRON_SECRET` or any other value. The
   prior session violated that hard boundary; the handoff correctly flags it as a
   standing violation to avoid, not a precedent. Use the Vercel dashboard or ask.

---

## Suggested sequencing

Phases 1 → 2 → 3 are the ones that change what players see and what prizes get
minted; ship them together after Phase 7's step 3 confirms the cron runs at all.
Phases 4, 5, 6 are independent of each other and of the above, and can land in
any order.
