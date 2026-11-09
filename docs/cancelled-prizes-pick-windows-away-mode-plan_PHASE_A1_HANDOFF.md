# Phase A1 handoff: players stop seeing retired prizes

Plan: `docs/cancelled-prizes-pick-windows-away-mode-plan.md`. Phase A1 done 2026-11-09 by Claude Opus 5.5 (high effort),
as the plan's table names.

## For Andrew (plain English)

- **What changed:** a prize that has been ended (archived, or its game cancelled) no longer shows on a bar's Venue Home
  Prizes panel. Pacific Street's $50 gift card will disappear from that screen. If a player won an ended prize this
  week, they still see "You Won" so they can claim it, and coupons already won stay in their wallet.
- **What didn't change:** prizes that ran out because people won them still show "Congrats to …". Pick 'Em Prizes behave
  exactly as before (they show "Ended" for a day, then go). Your partner list, the TV screen and Share to social were already
  right and weren't touched. No database change.
- **Is it live?** No. The code and tests are done on `main` but **not committed or deployed**. It goes out with the
  plan's Phase R release, or sooner if you ask.
- **Still waiting on you:** whether `VENUE_PRESENCE_ENFORCEMENT` is `true` or `false` in Production (needed by Phase C1).

## For the next agent (Phase A2)

### 1. Next phase goal and scope
Phase A2: cancelling Live Trivia retires the prizes that relied on it — see the plan's "Phase A2" section, **as amended by
Phase 0's P1 and P2** (`docs/cancelled-prizes-pick-windows-away-mode-plan_PHASE_0_HANDOFF.md` §5):
- Only prizes whose game types are Live Trivia **only** (`game_types = ["live-trivia"]` or a `live_trivia_challenge`
  definition). Multi-game legacy leaderboards (Riverside's three) must never be retired by a Live Trivia cancel (P1).
- Unpinned `ranked_places` / `game_winner` with null slots: retire when the venue has **no** Live Trivia game left
  (recurring, or a one-off in the future), not "none on its `active_days`" (P2). For a points-target Live Trivia prize,
  confirm how `active_days` gates points before choosing the rule.
- Retire = `is_active = false`, never delete. `describeCascadeReport` names it in one short sentence.
- **Data:** Phase 0 found **no** orphaned Live Trivia prizes in production, so no clean-up script is needed unless a
  re-check finds one (retire nothing without Andrew's go-ahead).
- Out of scope: the pre-cancel warning (A3), anything in C/B phases.

### 2. Starting state
- Branch `main`, last commit `4b4bbcdd` (unchanged since Phase 0). **Nothing from A1 is committed** (Andrew didn't ask for
  a commit). A1's changes in the tree:
  - new `lib/prizeCardEndState.ts`, new `tests/retired-prize-card-contract.test.ts`
  - modified `lib/challengeCampaigns.ts`, `app/api/challenge-campaigns/route.ts`, `components/venue/venueHubShared.tsx`
    (doc comment only), `components/venue/VenueChallengesPanel.tsx` (comment only), `tests/lib.rewards-cycle-snapshot.test.ts`
  - this plan doc (status line + Standing rules) and this handoff (both untracked, like the plan and Phase 0's handoff).
- Not mine, leave alone: `assets/app-store/google-play-screenshots-2026-11-09/`, `assets/app-store/venue-home-screenshots-2026-11-09/`,
  `output/`.
- No data changed, no migration, no env var, nothing deployed. No backup or undo log needed.

### 3. Decisions already made
- Plan §2 D1–D5 and §4 defaults; Phase 0's P1–P4. Nothing new asked of Andrew in A1.
- A1 rule (now a Standing rule in the plan): **retired** = `!isActive && !winnerUserId` → card leaves the panel unless the
  viewer won it in the **current cycle** (their own ledger row in `challenge_cycle_winners`, P3), in which case it stays with
  `prizeEnded: true` (the panel shows "You Won", since won beats ended). **Won out** (`winnerUserId` set) is untouched.
  A Pick 'Em Prize's own `pickemPrizeSnapshotState` result is passed in and wins (its 24 h "Ended" grace is unchanged).
- The public listing (no signed viewer: `GET /api/challenge-campaigns` without a valid session) applies the same rule with
  `viewerWon: false`, so every retired card drops there, Pick 'Em ended ones included (they had no "Ended" state on that
  path before and read as "In Progress").
- A recurring prize the viewer won in an **earlier** cycle and then archived drops (F1 caveat c); the coupon stays in the wallet.

### 4. Files and how they fit
- `lib/prizeCardEndState.ts` (pure, client-safe leaf): `isRetiredPrize(campaign)`, `prizeCardEndState({ campaign, viewerWon, pickemPrize? })`
  → `{ prizeEnded, dropCard }`.
- `lib/challengeCampaigns.ts` `getChallengeCampaignSnapshotForUser` (~l.3339): the old `.filter(!pickemState.dropCard).map(…)`
  became one `flatMap` that computes `viewerWin` first, then `prizeCardEndState(...)`, returning `[]` when `dropCard`.
  `prizeEnded` on the card now comes from `endState`, not only Pick 'Em.
- `app/api/challenge-campaigns/route.ts`, public branch: filters `listChallengeCampaigns` output with
  `prizeCardEndState({ campaign, viewerWon: false }).dropCard` before attaching leaderboards/descriptions.
- `components/venue/VenueChallengesPanel.tsx` / `countActivePrizeCards` (`venueHubShared.tsx`): no logic change needed.
  A retired-but-won card has `prizeEnded` + `viewerWon`, so it shows "You Won" and counts as active.
- For A2 you'll work in `lib/rewardGameSlotCascade.ts` (`applyScheduleChangeToGameWinnerRewards`, retire writes ~l.229/l.246,
  `describeCascadeReport`), called from `lib/liveShowdownAdmin.ts`; the report shows in `components/owner/schedule/ScheduleGameFlow.tsx`
  (`rewardNotice`). `rankedNightsForVenue` is in `lib/rankedPlaceRewards.ts` (~l.287).

### 5. Facts and traps
- `npx tsc --noEmit` prints errors from `.next/types/routes.d 2.ts` (and `app 2`, `package 2.json`, `validator 2.ts`): macOS
  Finder-style duplicates inside `.next/types`, not source. Filter with `grep -v "^\.next/"`; source is clean. I didn't delete
  them (generated output; harmless to remove, but Andrew's dev server owns `.next`).
- Retired campaigns still ride the snapshot's existing reads (the batched ledger read, plus one small read per
  `game_winner` campaign, retired ones included) because "viewer won this cycle" needs them. That is today's cost, not new.
  A later saving: skip the per-campaign `game_winner` read for retired one-offs. Not done; noted only.
- Production (Phase 0 count): 6 rows are inactive + winner null; those cards now drop for anyone who didn't win them this cycle.
- `tests/api.challenge-campaigns-ranked-card.test.ts` mocks `@/lib/challengeCampaigns` but not `lib/prizeCardEndState.ts`, which is
  why the helper lives in its own leaf (the route's real rule runs under those mocks).

### 6. Build / run / test
- `npx vitest run tests/retired-prize-card-contract.test.ts tests/lib.rewards-cycle-snapshot.test.ts` (A1's tests: 9 + 8 new cases).
- Full: `npm run test` → 494 files passed, 1 skipped (6518 tests passed, 13 skipped) on 2026-11-09.
- `npx tsc --noEmit`: clean outside `.next/` (see §5). `npx eslint` on the changed files: clean.
- Not run: `npm run build` (not needed for a filter change; Phase R runs it). **Not browser-tested**: the panel's rendering is
  unchanged and the filtering is server-side, covered by the snapshot tests against a fake Supabase.

### 7. Open questions for Andrew
- `VENUE_PRESENCE_ENFORCEMENT` value in Production (blocks C1 design, not A2).
- Plan Q1–Q4 still open (only Q1 blocks anything: B3).
- Whether to commit/deploy A1 on its own now (it fixes what players see today) or wait for Phase R.

### 8. Recommended first steps for Phase A2 (Opus 5.5, high effort)
1. Read `docs/rewards-system-plan.md` Standing rules and the plan's §5 facts + Phase 0 P1/P2.
2. Read `lib/rewardGameSlotCascade.ts` end to end and its tests (`grep -rl rewardGameSlotCascade tests`), then
   `lib/liveShowdownAdmin.ts`'s delete/edit/transfer call sites.
3. Check how a points-target Live Trivia prize's `active_days` gates accrual before writing the rule (P2).
4. Add the fourth rule with one schedule read per cascade, extend `describeCascadeReport`, and write the plan's listed tests.
