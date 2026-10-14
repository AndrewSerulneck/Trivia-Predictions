# Live Trivia Weekly Places Reward — Phase 3 handoff (2026-10-14)

Plan: `docs/live-trivia-weekly-places-reward-plan.md`. This note is for whoever does **Phase 4**.

## For Andrew (plain English)

- **What changed:** the server can now *create* a "1st / 2nd / 3rd place over the week" reward, with its own
  prize per place and an optional "only pay out if at least N players took part". Nobody can do it from a
  screen yet: the Create Reward button comes in Phase 6. **No reward was created.**
- **The wording guests will see** is written. Garden State Bar's will read: *"Finish top 3 in Live Trivia
  across Wednesday, Thursday and Friday nights each week. 1st wins a $30 gift card, 2nd a $20 gift card and
  3rd a $10 gift card."* The fine print says *"Ties go to whoever reached their score first."* A winner's
  coupon says *"You finished 1st in Live Trivia the week of Oct 7"*. Their phone notification says *"You
  finished 1st in "Live Trivia Challenge" and won a $30 gift card!"*.
- **The minimum-players choice also works for "win the game" rewards.** The fine print then says how many
  players are needed.
- **A fix you'd have hit in Phase 5:** the Redeem Prizes page took a coupon's prize from the reward, and a
  weekly-places reward has a different prize per place. Those coupons would have shown no prize. Each one
  now shows its own place's prize.
- **Until Phase 4**, a weekly-places reward shows up on the player Rewards card as text only. It has no
  points bar, because there's no points target.
- **Is it live?** Yes. It's pushed to `main`, which deploys it (you pre-approved this for Phases 1–4). Players
  and partners see no difference, because no reward of this kind exists.
- **Next:** Phase 4 (what players, partners and admins see). It needs nothing from you until its phone check.
- **Still open for you:** whether the backfill should start later than Aug 5 (default: Aug 5). Whether
  Category Blitz belongs in Past Winners (default: no). Approval to deploy Phase 8.

## For the next agent (Phase 4)

### 1. Goal and scope

Phase 4 = plan §5e. This covers the venue Rewards card with the prize ladder, nights and the viewer's live
standing ("You're 2nd with 140 pts…"), cached per §6. It also covers settled states (won / not won / below
minimum), the wallet "1st place" label and the partner/admin lists (`lib/ownerRewardDisplay.ts`,
`components/admin/sections/ChallengesSection.tsx` cycle winners). Add the minimum-players line to the card
("Needs at least 4 players this week — 3 so far"), plus device-checklist lines for Andrew.

**Out of scope:** the Create Reward wizard (Phase 6), the backfill and creating Garden State Bar's reward
(Phase 5), and Past Winners (Phase 8). Don't change the resolver or `createReward` unless a Phase 4 decision
forces it.

### 2. Starting state

- Branch `live-trivia-ranked-places-phase3`, worktree
  `/private/tmp/claude-501/-Users-andrewserulneck-Documents-Trivia-Predictions/b196d6e7-27a4-4ee8-8bb1-56eda89b0214/scratchpad/ranked-p3`.
  The code commit `0e8d2ca` "feat(rewards): create weekly places rewards + their copy (Phase 3)" sits on top of
  `43ceb8e` (Phase 2 deploy note). A follow-up docs commit adds this note and the plan's status line. Both
  are pushed to `origin/main`, which deploys them to production. The deploy status after the push is in §6.
- **No migration. No data written.** Production still has **0** `ranked_places` rewards (checked read-only on
  2026-10-14). A read-only check also confirmed that the wallet's new column list (incl.
  `challenge_campaign_redemptions.place`) reads fine in production.
- Andrew's main checkout (`/Users/andrewserulneck/Documents/Trivia-Predictions`) is on
  `category-blitz-scoring-cadence` with lots of unrelated uncommitted work. Never commit from there, and
  never `git checkout --` there. Use a fresh worktree of `origin/main` with `node_modules` symlinked:
  `git worktree add -b <branch> <path> origin/main && ln -s /Users/andrewserulneck/Documents/Trivia-Predictions/node_modules <path>/node_modules`.
  Leave the other worktrees alone (Phase 1, Phase 2, `/private/tmp/speed-trivia-approval-release-2026-10-14`).

### 3. Decisions already made (don't re-ask)

Plan §2 D1–D11, plus Phases 1–2 (handoffs 1 and 2). Phase 3 added:
- **Player panel = text only, not hidden.** The Rewards card (`VenueChallengesPanel`), the Details popup
  (`VenueHubClient`: no gauge, and no "N of 3 rewards left" quota line) and Redeem Prizes' "Active Rewards"
  (`ChallengeRedeemPanel`) show the composed description and no gauge. These are pinned in
  `tests/lib.ranked-places-reward-create.test.ts` ("player panels…"). Phase 4 replaces those branches with the
  real card; update that test when it does. The card headline falls back to the reward name ("Live Trivia
  Challenge") because `rewardHeadline` needs a single prize. Phase 4 should give it a ladder headline.
- **Week anchor:** `activeDays` for a ranked reward = `rankedWeekNights(nights)` (`lib/rankedPlaceRewards.ts`).
  The week starts on the night after the longest gap between nights, so Wed/Thu/Fri → Wed first,
  Fri/Sat/Sun → Fri first, and Tue+Sat → **Sat** first (Tue→Sat is 4 days, Sat→Tue is 3). Equal gaps (every
  day) → Sunday. The input order doesn't matter. The nights are the **recurring** game slots (the pinned
  ones if pinned, else all of `context.gameSlots` with `recurring`), never one-off games, so a one-off special
  night can't move the anchor.
- **Pinning is allowed** on a ranked reward (`gameWinnerSlots`, same validator as game-winner). Pinned slots
  must be recurring; a one-off pin is refused with the weekly-only message. The slots are stored in the order
  they were sent, the same as game-winner; `activeDays` carries the week order.
- **What createReward ignores for a ranked reward:** the client's `cadence`, `winnerQuota`, `threshold` and the
  single `prize`. They are forced to weekly, place count, sentinel 1 and null campaign prize columns.
- **Refuse, never drop:** a non-empty `placePrizes` on any other win condition → refused. `minPlayers` on a
  points target or any NFL reward → refused. Out of range (not an integer 2–100) → refused. All new
  refusals are `RewardTermsError`, so both routes return 400 by type, with no route mapping change.
- **"Exactly one venue"** is structural: `createReward` takes one `venueId` and always writes
  `venueIds: [venueId]` (asserted in the test). There is no multi-venue input to refuse.
- **Notification copy carries no date**, because the Phase 5 backfill pays past weeks through the same
  `awardRankedCyclePlaces` and "this week" would be wrong there.
- **`terms_updated_at` trigger unchanged.** `describeRewardWin` for a ranked coupon reads only the coupon's
  own `place` + `cycle_start` and the reward's definition id / win condition, never `place_prizes` or
  `min_players`.
- **Wallet:** a coupon whose live reward is `ranked_places` takes its prize from the coupon's own snapshot
  columns (`listChallengeCampaignWinsForUser`, `rankedCoupon`). `place` was added to
  `WALLET_REDEMPTION_COLUMNS` with no fallback, because the column has been in production since Phase 1.

### 4. Files changed (commit `0e8d2ca`)

- `lib/rankedPlaceRewards.ts`: `REWARD_MIN_PLAYERS_MIN/MAX` (2/100), `placeOrdinal`, `rankedWeekNights`,
  `describePlacePrizeLadder` ("1st wins a $30 gift card, 2nd a $20 gift card and 3rd a $10 gift card." / one
  place: "The winner gets …"), `rankedPlaceWinMessage`. It now imports `lib/rewardDefinitions` +
  `lib/rewardGameSlots` (both client-safe).
- `lib/rewardDefinitions.ts`: `RewardDefinition.supportsRankedPlaces` + `rankedPlacesRequirement` (Live
  Trivia true / "Finish at the top of Live Trivia this week"; NFL false / null). The venue-schedule template
  set gains `rankedPlacesWeekly` ("Finish {top} in Live Trivia {across} each week. {ladder}") and
  `wonRankedPlace` ("You finished {place} in Live Trivia {when}"). `renderRewardRequirement` handles
  `ranked_places`.
- `lib/rewardDescription.ts`: `RewardDescriptionInput` takes `placePrizes` / `minPlayers`; `RewardWinFacts.place`.
  `describeRankedPlacesReward` builds the summary, the when line ("…Your points from every game that week add
  up. Winners are named after Friday's game.") and the fine print ("Ties go to whoever reached their score
  first. One place per player each week." + minimum). Game-winner fine print appends "At least N players need
  to play for a winner to be named." when set. `describeRewardWin` ranked branch → null without a place or date.
- `lib/rewards.ts`: `createReward` ranked branch + `minPlayers`. New exported messages:
  `REWARD_RANKED_PLACES_UNSUPPORTED_MESSAGE`, `…_WEEKLY_ONLY_MESSAGE`, `…_LADDER_MESSAGE`,
  `REWARD_PLACE_PRIZES_NOT_RANKED_MESSAGE`, `REWARD_MIN_PLAYERS_RANGE_MESSAGE`,
  `REWARD_MIN_PLAYERS_UNSUPPORTED_MESSAGE` (all thrown as `RewardTermsError`). Helpers
  `normalizePlacePrizeInputs`, `normalizeMinPlayersInput`. `attachRewardWinDescriptions` passes `win.place`.
- `lib/challengeCampaigns.ts`: `createChallengeCampaign` takes `placePrizes` / `minPlayers` and writes
  `place_prizes` (via `serializePlacePrizes`) / `min_players` **only when set**. `awardRankedCyclePlaces` takes
  an optional `campaign.placePrizes` (the resolver already passes the full campaign) and sends the place
  notification. `notifyPrizeWinBestEffort` has an optional `message`. The wallet changes are in §3.
- `app/api/owner/rewards/route.ts`, `app/api/admin/route.ts` (`resource: "rewards"`): forward
  `placePrizes` (array or null) and `minPlayers`. The response's reward carries `placePrizes` / `minPlayers`
  (mapped by `mapCampaignRow`).
- `components/venue/venueHubShared.tsx` (`ChallengeCampaignCard.winCondition` adds `"ranked_places"`),
  `VenueChallengesPanel.tsx`, `VenueHubClient.tsx`, `components/challenges/ChallengeRedeemPanel.tsx`: the
  text-only branches.
- Tests: `tests/lib.ranked-places-reward-copy.test.ts` (18: sentences, minimum lines, win line, night order,
  ordinals, notification, requirement). `tests/lib.ranked-places-reward-create.test.ts` (6: insert columns,
  notification via the award call, panel pins). `tests/api.owner.rewards-ranked-places.test.ts` (3: route
  forwarding + 400). `tests/lib.rewards-definitions.test.ts` (+13: create/refuse incl. ladder, prize validator,
  weekly-only, pinned, NFL, ladder on another reward, minPlayers range/points/NFL).
  `tests/lib.rewards-cycle-snapshot.test.ts` (+2: wallet ranked snapshot + place). The registry test in
  `tests/lib.reward-description.test.ts` now accepts `{ladder}` as the prize placeholder.

### 5. Facts and traps

- **The partner/admin lists still treat a ranked reward as a points target** (`lib/ownerRewardDisplay.ts`,
  `lib/rewardTerms.ts` sentence helpers, `ChallengesSection` cycle winners). That's harmless while 0 exist.
  Phase 4 must fix these **before Phase 5 creates Garden State Bar's reward**.
- `quotaRemaining` for a ranked reward = places minus ledger rows this cycle. A week with fewer scorers than
  places stays below "all claimed". The card should read settlements (`listChallengeCycleSettlements`), not
  the quota, to know a week is done.
- `describeReward` already swaps the when line for "Next contest starts …" when `quotaRemaining === 0` on a
  recurring reward. For a fully settled ranked week that reads correctly.
- Description nights come from the venue's **recurring** slots in the schedule facts (or pins, or
  `activeDays` when the schedule is unreadable). The resolver counts **every** game at the venue, including
  one-offs, so a one-off special night counts toward the week's points without being named in the sentence.
  That's acceptable, but don't "fix" it by naming one-offs as weekly nights.
- `rankedWeekNights` is the only home of the anchor rule. If the wizard (Phase 6) previews `activeDays`, it
  must call it, never sort Sunday-first (`weekdaysForSlots` sorts Sunday-first and is wrong for Fri/Sat/Sun).
- Dev shares the production DB. Never create a ranked reward for a real venue from a dev server. A smoke test
  goes on the hidden `venue-hightop-test` only, with Andrew's OK, or not at all.

### 6. Build / run / test

From the worktree:
- `npx tsc --noEmit`: clean. `npm run lint`: exit 0 (only the usual Babel note on `lib/sportsBingo.ts`).
- `npx vitest run`: **372 files passed, 1 skipped. 4,390 tests passed, 13 env-gated skips.**
- `npm run build`: succeeded (run after the typecheck, not at the same time).
- Focused: `npx vitest run tests/lib.ranked-places-reward-copy.test.ts tests/lib.ranked-places-reward-create.test.ts tests/api.owner.rewards-ranked-places.test.ts tests/lib.rewards-definitions.test.ts tests/lib.rewards-cycle-snapshot.test.ts tests/lib.reward-description.test.ts`.
- Read-only production check (not committed): a `.mjs` using `@supabase/supabase-js` with the service role.
  It must run **from inside the worktree** (module resolution) with
  `node --env-file=/Users/andrewserulneck/Documents/Trivia-Predictions/.env.local <file>`. Result: the wallet
  column list reads OK, and 0 ranked rewards exist.
- **`/verify` browser pass: not run.** The UI change only alters branches for a `ranked_places` reward, and
  none exists. Showing one would mean writing a reward into the shared production database. The branches
  are pinned by the contract tests above. Phase 4 should do the real browser/device pass once the card exists.
- Deploy: pushed to `origin/main`. The Vercel deploy state after the push is recorded in the docs commit
  message, if checked.

### 7. Open questions for Andrew

Unchanged: (1) backfill start later than Aug 5? (default Aug 5); (2) Category Blitz in Past Winners? (default
no); (3) Phase 8 deploy approval. Nothing new from Phase 3.

### 8. Recommended first steps for Phase 4

**Model: Claude Sonnet 5.5 · Effort: high** (per plan).
1. Read the plan §5e and §6 (cost: one cached aggregate per panel load), handoffs 1–3, and this note. Create a
   fresh worktree of `origin/main`.
2. Fix the partner/admin lists first (`lib/ownerRewardDisplay.ts`, `ChallengesSection`): they're the Phase 5
   blocker.
3. Build the card's data on the server: for each `ranked_places` reward on the panel, compute the current week's
   games the same way `planDueRankedWeeks` does (reuse it or its helpers, don't re-derive the cycle key).
   Then call `loadLiveTriviaWeekTotals` → `orderWeekStandings` for the viewer's rank, with
   `listChallengeCycleSettlements` for settled weeks. Cache it.
4. Replace the three text-only branches and update the pins in `tests/lib.ranked-places-reward-create.test.ts`.
   Give `rewardHeadline` a ladder headline. Show "1st place" in `PrizeWalletPanel` from `win.place`.
5. Text-size floor (12px; `text-caption`/`text-footnote` inside games), no inline styles outside the TV
   surface, and add any new popup to `tests/native-back-review-fixes.test.ts`. Write `…_PHASE_4_HANDOFF.md`
   and update the plan's status line. Push + deploy is pre-approved (D11).
