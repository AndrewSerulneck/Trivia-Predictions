# Live Trivia Weekly Places Reward — Phase 4 handoff (2026-10-14)

Plan: `docs/live-trivia-weekly-places-reward-plan.md`. This note is for whoever does **Phase 5**.

## For Andrew (plain English)

- **What changed:** players, partners and admins can now *see* a weekly 1st / 2nd / 3rd reward.
  - **Players** get a Rewards card that shows the prize ladder, their own standing this week ("You're 2nd with
    140 pts this week. Friday's game decides it."), how many players have played if you set a minimum
    ("Needs at least 4 players this week — 3 so far."), and, once the week is settled, the winners ("This week's
    winners: 1st Snooker, 2nd Kuch…"), or "Not enough players this week…" / "Nobody scored this week…".
    A winner's card says "You finished 1st. Your prize is in Redeem Prizes."
  - **The prize wallet** says the place on the coupon ("1st place: …").
  - **Partners and admins** see the ladder under the reward's name. Admin **History** lists each week by place
    with prize and redeemed, and says why a week had no winner.
- **A bug fixed on the way:** a player with two coupons from the same reward (for example two weeks' wins) would
  have had them collide on the Redeem Prizes page. That would have hit several Garden State Bar backfill winners.
- **Is it live?** It is pushed to `main`, which deploys it (you approved Phases 1–4). **Nobody can see any
  difference yet**: no weekly reward exists, so nothing in the app changes until Phase 5 creates Garden State
  Bar's.
- **What's left:** Phase 5 (create the Garden State Bar reward and pay past weeks from Aug 5), Phase 6 (the Create
  Reward wizard), Phase 8 (Past Winners), Phase 7 (watch the first live week).
- **Your answers today are recorded:** backfill starts **Aug 5**; **Category Blitz is not** in Past Winners;
  Phase 8 **may be deployed**.
- **Needs you:** (1) the phone check — new section **B** in `docs/reward-descriptions-device-checklist.md`; you
  can only do it once Phase 5 has created a reward. (2) Phase 5 will show you a dry-run table before any coupon is
  issued; you approve it.
- **Not checked:** I did not run a browser or phone pass (the only way to see a weekly card would have been to
  write a reward into the shared production database, which the plan forbids). The card's wording and layout are
  covered by component tests; how it *looks* on a phone is yours to check.

## For the next agent (Phase 5)

### 1. Goal and scope

Phase 5 = plan §7 "Phase 5: Garden State Bar: create the reward and pay past weeks". **Model Claude Opus 5.5,
effort high** (real money). Steps: create the reward for `venue-garden-state-bar` via `createReward`; write
`scripts/backfill-ranked-reward.cjs --campaign <id> --from 2026-08-05 --expiry-days 30 [--apply]` (dry run by
default, `npm run` entry) using `planDueRankedWeeks`-style week keys, `loadLiveTriviaWeekTotals`,
`rankWeekPlaces` and `awardRankedCyclePlaces` with a 30-day `prizeExpiresAt`; show Andrew the dry-run table and
**apply only after he approves**; verify; hand Andrew a winners list.
**Out of scope:** the wizard (Phase 6), Past Winners (Phase 8), CLAUDE.md/AGENTS.md sections (Phase 7).
Phase 4 is done: **don't redo the card, wallet or list work.**

### 2. Starting state

- Branch `live-trivia-ranked-places-phase4`, worktree
  `/private/tmp/claude-501/-Users-andrewserulneck-Documents-Trivia-Predictions/77811c92-78f7-4f62-8c94-8179bd86a700/scratchpad/ranked-p4`
  (node_modules symlinked to the main checkout's). Based on `origin/main` `49e5537` (Phase 3 handoff). The code
  commit is "feat(rewards): Rewards card standings, wallet place and partner/admin lists (Phase 4)"; a docs commit
  adds this note and the plan update. Both pushed to `origin/main` (approved, D11); the deploy state is in §6.
- **No migration. No data written.** Production still has **0** `ranked_places` rewards, 0 settlements, 0 ledger
  rows with a place (re-checked read-only 2026-10-14 after the code was written; the new `place` / settlement
  selects work).
- Andrew's main checkout (`/Users/andrewserulneck/Documents/Trivia-Predictions`) is on
  `category-blitz-scoring-cadence` with lots of unrelated uncommitted work. Never commit from there, never
  `git checkout --` there. **Its copy of `docs/live-trivia-weekly-places-reward-plan.md` is stale** (it says
  "Phase 1 done"); the truth is on `origin/main`. Make a fresh worktree:
  `git worktree add -b <branch> <path> origin/main && ln -s /Users/andrewserulneck/Documents/Trivia-Predictions/node_modules <path>/node_modules`.
  Leave the other worktrees alone (Phases 1–3 and `/private/tmp/speed-trivia-approval-release-2026-10-14`).

### 3. Decisions already made (don't re-ask)

Plan §2 D1–D12. New today (Andrew, 2026-10-14): **D6 confirmed** (backfill from 2026-08-05), **D12** Category Blitz
not in Past Winners, Phase 8 deploy approved. Phase 4 decisions:
- **Player card shows the viewer's own standing only**, never other players' ranks or scores (no live
  leaderboard on the card). Winners (by username) appear only once the week is settled.
- **The card covers the CURRENT cycle only** (the week containing "now", keyed by `computeCycleStart`). At the
  week boundary (Wed 00:00 venue time for Garden State Bar) last week's result disappears from the card; the
  winner's coupon and notification live on in Redeem Prizes. Not building a "last week" section unless asked.
- **A ranked card is never "All Claimed"** and stays tappable for the rules: a ranked week can settle with fewer
  winners than places, so the quota is meaningless for it. State comes from `rankedPlaces` (settlements), not
  `quotaRemaining`.
- **Cache:** one "board" per reward per server instance, 60 s while live, 10 min once settled, never longer than
  the week (`7d − 2h` after the week start). Concurrent requests share one build; a failed build is never cached.
- **A failure never breaks the Rewards route:** the card then shows the reward's description alone (the old
  text-only branch), logged `[RankedCard] state-failed`.
- **Terms line:** a ranked reward's partner/admin "terms" is its ladder (+ minimum), not "make N rewards
  available". A game-winner reward's terms also print its minimum.
- Redeem Prizes' "Active Rewards" list and the reward Details popup stay text-only (the card is the one place for
  standings).

### 4. Files created or changed

New:
- `lib/rankedPlaceCard.ts` (pure, client-safe): `RankedPlaceCardState` (phase `live | settled | not_live |
  no_games`; viewer rank/points; winners by username; **no player ids**) and `composeRankedCard(state)` →
  `{ status, lines[] }` (all card copy lives here).
- `lib/rankedPlaceCardData.ts` (server-only): `attachRankedPlaceCards(campaigns, venueId, viewerUserId, nowMs?)`,
  `rankedCardStateFromBoard`, `clearRankedPlaceBoardCache` (test hook), `LIVE_BOARD_TTL_MS`,
  `SETTLED_BOARD_TTL_MS`. Builds a board with: `loadLiveTriviaSchedulesForVenues` + `getVenueTimezone` →
  `planCurrentRankedWeek` → (if the reward counts the week) `listChallengeCycleSettlements` → settled: winners via
  `listRankedCycleWinners`; live: `loadLiveTriviaWeekTotals` (started games only) → `orderWeekStandings`.
- `lib/rankedWeekHistory.ts` (pure): `buildRankedWeekHistory({winners, settlements, placePrizes})` → rows newest
  first (winners by place with prize + redeemed; `note` explains a no-winner week). **Phase 8 reuses it.**
- Tests: `tests/lib.ranked-place-card.test.ts` (13), `tests/lib.ranked-place-card-data.test.ts` (20),
  `tests/lib.ranked-place-display.test.ts` (6), `tests/components.venue-challenges-panel-ranked.test.ts` (9),
  `tests/components.prize-wallet-ranked-place.test.ts` (3), `tests/api.challenge-campaigns-ranked-card.test.ts` (3).

Changed:
- `lib/liveTriviaRankedRewards.ts`: refactor only. The game-collection loop moved into `collectGamesByWeekKey`
  and the D8 / end-date test into `rewardCountsWeek`; `planDueRankedWeeks` calls both (the 21 existing tests pass
  unchanged). New exports `planCurrentRankedWeek` / `CurrentRankedWeek` and `isWeekSettled`.
- `lib/challengeCampaigns.ts`: `listChallengeCycleWinners` now selects/returns `place`; new
  `listRankedCycleWinners({challengeId, cycleStart, toleranceMs})` (usernames, 1st first; `challenge_cycle_winners.place`
  is written only by the ranked RPC).
- `app/api/challenge-campaigns/route.ts`: both branches call `attachRankedPlaceCards` after
  `attachRewardDescriptions` (viewer branch passes the verified user id; public branch passes `null`).
- `app/api/admin/route.ts`: `resource=challenge-cycle-winners` also returns `settlements`.
- `components/venue/venueHubShared.tsx`: card type gains `placePrizes`, `minPlayers`, `rankedPlaces`;
  `rewardHeadline` gives a ladder headline ("Weekly prizes for the top 3", or the prize itself for one place).
- `components/venue/VenueChallengesPanel.tsx`: `isRanked`, `isExhausted = !isRanked && …`, chips (You Won / Week
  Complete / Upcoming / In Progress), and the standing lines.
- `components/prizes/PrizeWalletPanel.tsx`: `wonForLine` falls back to "1st place: {reward}"; list key =
  `redemptionId ?? challengeId ?? detached…`.
- `lib/rankedPlaceRewards.ts`: `describeRankedTerms`. `lib/ownerRewardDisplay.ts`: `rewardTermsText` ranked branch +
  minimum clause. `components/admin/sections/ChallengesSection.tsx`: badge, ladder, `RankedWeeksTable`, settlements
  fetch, edit-form note.
- Docs: `docs/reward-descriptions-device-checklist.md` §B (Andrew's phone check), the plan, this note.
- `tests/lib.ranked-places-reward-create.test.ts`: the old "text only until Phase 4" pins now pin the Phase 4
  behavior (standing from `rankedPlaces`, text fallback, no `isExhausted` for ranked).

### 5. Facts and traps

- **Cycle key = `computeCycleStart(campaign, instant, venueTz)`** and nothing else, for the backfill too. A
  settlement/ledger row from PostgREST reads like `2026-10-07T04:00:00+00:00`: compare with `Date.parse`.
- **`planDueRankedWeeks` only looks 2 weeks back** and only weeks the reward existed for (D8). The backfill needs
  weeks back to Aug 5, so it must NOT call `planDueRankedWeeks` as is. Options: build the week keys yourself with
  `computeCycleStart` from `--from` forward and reuse `collectGamesByWeekKey` (currently not exported — export it, or
  make a thin exported wrapper that takes the keys; the function enumerates occurrences by probing now, −7d, −14d, so
  for old weeks you must pass `nowMs` near each week, not today). Or enumerate with `enumerateScheduleOccurrences`
  using `nowMs` stepped weekly. Verify every week against the plan's §4 table before showing Andrew.
- **Per-week "created before the last game ended" (D8) does not apply to backfilled past weeks** — the reward is
  created now. The backfill pays weeks the resolver won't. The resolver owns the week the reward is created in
  (and anything after).
- `awardRankedCyclePlaces` already defaults to a 7-day expiry; pass `prizeExpiresAt` = now + 30 days (D3). It
  sends the place notification per winner (copy has no date, on purpose, because of backfill).
- The RPC is the only writer and refuses an already-settled key (`already_resolved`), so a re-run is a no-op.
  Still, dry run first and compare to §4 (11 coupons, $320, plus the Oct 14 week only if its Friday game has ended
  and the resolver hasn't settled it).
- Garden State Bar: venue `venue-garden-state-bar`, tz `America/New_York`, schedule
  `78a0e374-f3f1-4605-af35-89deb8040660`, `recurring_days [wed, thu, fri]`, 7:00 PM. Reward must be created for
  exactly one venue, weekly, ladder 1=$30, 2=$20, 3=$10 gift cards, no minimum (D2). `createReward` sets
  `activeDays` Wed-first via `rankedWeekNights`.
- **Dev shares the production DB.** Creating the Garden State Bar reward is a real production write: do it only
  as Phase 5's explicit step. Never smoke-test on a real venue; the hidden `venue-hightop-test` is the test venue.
- Deleted-account winners: the coupon is deleted and the ledger's `winner_user_id` blanked (Phase 1);
  `listRankedCycleWinners` returns `username: null` and the card says "Champion".
- The Rewards route is polled every 30 s per player; keep anything new behind the board cache.
- Don't run `tsc` and `build` at the same time (`.next/types`).

### 6. Build / run / test (all from the worktree)

- `npx tsc --noEmit` clean · `npm run lint` clean (only the usual Babel note on `lib/sportsBingo.ts`) ·
  `npx vitest run`: **378 files passed, 1 skipped; 4,444 tests passed, 13 env-gated skips** · `npm run build`
  succeeded (run alone, after tsc).
- Focused: `npx vitest run tests/lib.ranked-place-card.test.ts tests/lib.ranked-place-card-data.test.ts tests/lib.ranked-place-display.test.ts tests/components.venue-challenges-panel-ranked.test.ts tests/components.prize-wallet-ranked-place.test.ts tests/api.challenge-campaigns-ranked-card.test.ts tests/lib.live-trivia-ranked-rewards.test.ts`.
- Read-only production check (not committed): service-role `supabase-js` via
  `node --env-file=/Users/andrewserulneck/Documents/Trivia-Predictions/.env.local <file>` run from inside the
  worktree. Result: the new `place` / settlements reads work, 0 ranked rewards.
- **Not run:** `/verify` browser pass and any phone check (needs a ranked reward in the shared database).
  **Unverified:** the card's real-device look; real two-instance cache behavior (each instance has its own cache,
  so two instances can disagree for up to 60 s, by design); a live settlement end to end (first one is Phase 5/7).
- **Cost (plan §6), as built:** a venue with no weekly reward adds **zero** queries to the Rewards poll. With one:
  per server instance, at most 3 small reads (schedules, settlements, one aggregate RPC returning ≤ players rows)
  per 60 s while anyone has the panel open, 3 per 10 min once settled, 0 for players' own ranks. One reward at
  Garden State Bar ≈ ≤ 4,300 reads/day only if the panel were open nonstop on one instance; realistically a few
  hundred. At 100 weekly rewards the ceiling is the same per reward. Phase 7 compares real usage with this.

### 7. Open questions for Andrew

None blocking. Waiting on him: the Phase 5 dry-run approval and the §B phone check.

### 8. Recommended first steps for Phase 5

1. Read the plan (§2, §4, Phase 5), handoffs 1–4, and `lib/liveTriviaRankedRewards.ts`. New worktree of `origin/main`.
2. Write the backfill script first and run it **dry** against a hypothetical in-memory reward (`createdAt` before
   Aug 5) to reproduce §4's table with no writes. Add tests for week-key construction (Aug 5 week key
   `2026-08-05T04:00:00.000Z`) and idempotency.
3. Show Andrew the table; get approval; create the reward through `createReward` (admin route or a one-off
   script), then `--apply`; verify coupons (`place` set, expiry ≈ +30 days, notifications), a re-run is a no-op;
   produce the winners list for Garden State Bar. If Friday Oct 16's game hasn't ended, the resolver settles that
   week itself.
4. Write `…_PHASE_5_HANDOFF.md`; update the plan's status line.
