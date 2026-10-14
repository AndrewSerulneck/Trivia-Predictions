# Live Trivia Weekly Places Reward — Phase 5 handoff (2026-10-14, DONE — backfill applied)

Plan: `docs/live-trivia-weekly-places-reward-plan.md`. Phase 5 is **half done**: it stopped on purpose at the
approval gate (plan D11). This note is for whoever finishes Phase 5 (apply + verify + winners list) and then
starts Phase 6.

## For Andrew (plain English)

- **Garden State Bar's weekly reward is live.** Created 2026-10-14 at 7:01 PM ET, under their partner account
  (your choice), named "Live Trivia Challenge" (your choice): every week, 1st $30, 2nd $20, 3rd $10 gift card,
  no minimum. Players at the bar already see it on their Rewards card. It covers **this week** (Oct 14–16): the
  system pays this week's top 3 automatically right after Friday's game ends.
- **Past weeks are NOT paid yet.** The backfill script is built and a dry run (no writes) gives exactly the
  plan's table: **13 coupons, $320**. The plan used to say "11 coupons" — that was a counting slip; its own table
  (7 × $30 + 5 × $20 + 1 × $10) is 13 coupons and $320. Nothing differs from what you already approved in
  dollars.
- **Needs you:** say "apply the backfill" (or tell me what to change). Coupons expire 30 days after they're
  issued. Each winner also gets an in-app notification.
- **Winners list for Garden State Bar** (what staff will be asked to honor once applied):

  | Week of | 1st ($30) | 2nd ($20) | 3rd ($10) |
  |---|---|---|---|
  | Aug 5 | Snooker (410 pts) | Kuch (140) | fast76 (50) |
  | Aug 12 | jparadise (50) | — | — |
  | Aug 19 | Sweetgurly35 (210) | Owen McSullivan (30) | — |
  | Aug 26 | shrimpsalaad (110) | — | — |
  | Sep 9 | lego05 (240) | Abby72 (180) | — |
  | Sep 16 | shrimpsalaad (80) | ana (40) | — |
  | Oct 7 | murph (90) | kellygurl (10) | — |

  Sep 2, Sep 23 and Sep 30: nobody played. shrimpsalaad wins twice ($60). This week (Oct 14) is decided Friday.
- **Not pushed.** The new script and its tests are committed on a branch only. They don't need to be deployed to
  run (the backfill runs from this computer). Pushing to `main` would deploy one small refactor of the weekly
  payout code (same behavior, tests unchanged) — your call; it wasn't part of the "Phases 1–4" approval.
- **Phone check:** now that a real reward exists, section **B** of `docs/reward-descriptions-device-checklist.md`
  can be done at Garden State Bar.

## For the next agent

### 1. Goal and scope

Finish Phase 5 (plan §7 Phase 5, steps 3–6): **only after Andrew explicitly approves the dry run below**, apply
the backfill, verify it, hand Andrew the winners list. Then Phase 6 (wizard).
**Out of scope here:** wizard (Phase 6), Past Winners (Phase 8), CLAUDE.md/AGENTS.md sections (Phase 7). Don't
create another reward. Don't rename the reward (Andrew chose the default name).

### 2. Starting state

- Branch `live-trivia-ranked-places-phase5`, worktree
  `/private/tmp/claude-501/-Users-andrewserulneck-Documents-Trivia-Predictions/6fdcaf10-86db-416b-83de-aec41dd5ca9c/scratchpad/ranked-p5`
  (node_modules symlinked to the main checkout's), based on `origin/main` `7131f00`. One local commit
  "feat(rewards): backfill script for weekly places rewards (Phase 5)" with the code, tests, plan update and this
  note. **Not pushed** (pushing deploys; Phase 5 push was not pre-approved — ask Andrew).
- **Production data written (the only write this phase):** one `challenge_campaigns` row,
  **`677a214c-b859-4c17-8e4d-9889574516e1`**, via `createReward` (`lib/rewards.ts`) from a one-off scratch
  script run with `node --env-file=<main checkout>/.env.local --conditions react-server --import tsx`. Params:
  `venueId venue-garden-state-bar`, `definitionId live_trivia_challenge`, `winCondition ranked_places`,
  `placePrizes` gift cards 30/20/10, `minPlayers null`, `createdByOwnerId 8acc4938-c808-4a32-a14a-298b8e7a7f17`
  (Garden State Bar's only owner). Stored: `created_at 2026-10-14T23:01:06.69565Z`, weekly, `activeDays
  [wed,thu,fri]`, `winnerQuota 3`, `gameWinnerSlots null`, rules = "Finish top 3 in Live Trivia across Wednesday,
  Thursday and Friday each week. 1st wins a $30 gift card, 2nd a $20 gift card and 3rd a $10 gift card."
  Undo, if ever needed: delete that row (cascades its settlements); there are no coupons yet.
- **Nothing else written.** 0 settlements, 0 ranked coupons. `GET https://play.hightopchallenge.com/api/challenge-campaigns?venueId=venue-garden-state-bar`
  returns the reward with `rankedPlaces.phase "live"`, `weekStart 2026-10-14T04:00:00.000Z`, 2 participants so far.
- **The Oct 14 week belongs to the resolver** (D8: the reward existed before Wednesday's game ended). Its
  last game (Fri Oct 16, 3:00 PM ET start, 14 rounds × 27.5 min) ends **2026-10-17T01:25Z**; the next
  `/api/cron/resolve-live-trivia-winners` sweep pays it. The backfill will never include that week
  (`planBackfillRankedWeeks` excludes any week whose last game ended after `created_at`). That first live
  settlement is Phase 7's to watch.

### 3. Decisions already made (don't re-ask)

Plan §2 D1–D12 still hold. New today (Andrew, 2026-10-14):
- Reward created **as Garden State Bar's partner account** (`created_by_owner_id` = their owner), so it appears on
  their Partner Dashboard and they can archive/delete it. (The dashboard lists only rewards with the partner's
  owner id — `listOwnerCompetitions` in `lib/ownerCompetitions.ts`; an admin-created reward would be invisible to them.)
- Name stays **"Live Trivia Challenge"** (the definition default), not "Weekly Trivia Champions".
- Coupon count is **13** (the plan's "11" was a slip; plan corrected). Expiry 30 days from issue (D3). No minimum (D2).

### 4. Files created or changed

- `lib/liveTriviaRankedRewards.ts`:
  - `collectGamesByWeekKey` now takes `probesMs` (instants to enumerate around) instead of `nowMs`; the resolver
    and the card pass `probesAround(nowMs)` = now, −7d, −14d (identical behavior; the existing 21 tests pass
    unchanged).
  - **New `planBackfillRankedWeeks({campaign, venueId, schedules, timezone, nowMs, fromDate})`** → weeks the
    backfill owns, oldest first: first game on/after `fromDate`, last game ended before `nowMs` AND before the
    reward's `created_at` (exactly the weeks `planDueRankedWeeks` never settles). Keys stepped with
    `computeCycleStart(key + 7.5 days)` (DST-safe); one probe per week at key + 3 days. Throws on a malformed
    `fromDate`, unreadable `created_at` or unanchorable week.
- **New `lib/rankedRewardBackfill.ts`** (server-only):
  - `planRankedRewardBackfill({campaignId, fromDate, nowMs?})` — read-only. Loads the reward through
    `listActiveRankedPlaceCampaigns` (must be active + unresolved), `rankedRewardConfigError`, schedules + tz,
    `planBackfillRankedWeeks`, one settlements read (settled weeks marked `alreadySettled`, scores not read),
    `loadLiveTriviaWeekTotals` + `rankWeekPlaces` per unsettled week, usernames from `users`. Returns weeks,
    `couponCount`, `giftCardDollars`.
  - `applyRankedRewardBackfill({plan, expectCoupons, expiryDays = 30, nowMs?})` — **refuses before any write
    unless `expectCoupons === plan.couponCount`**; then `awardRankedCyclePlaces` per unsettled week (oldest first,
    `prizeExpiresAt = now + expiryDays`). No-scorer weeks are settled too (`no_scorers`), so the resolver and the
    Phase 8 history see them as done. Stops at the first error; a re-run skips settled weeks.
- **New `scripts/backfill-ranked-reward.cjs`** — thin CLI; `npm run rewards:backfill-ranked -- --campaign <id>
  --from YYYY-MM-DD [--expiry-days 30] [--apply --expect-coupons <n>]`. `--apply` without `--expect-coupons` is
  refused.
- `package.json`: `rewards:backfill-ranked` script.
- Tests: `tests/lib.live-trivia-ranked-rewards.test.ts` +7 (`planBackfillRankedWeeks`: Aug 5 → Oct 7 keys,
  never overlaps the resolver, owns a creation week created after its last game, unfinished week skipped,
  `--from` semantics, DST, refusals); new `tests/lib.ranked-reward-backfill.test.ts` (9: plan ranking/usernames/
  totals, read-only, refusals, settled weeks not re-read, expect-count guard, 30-day expiry, empty weeks settled,
  re-run no-op, custom expiry).
- Docs: plan status line + coupon count + step 1 as-built; this note.

### 5. Facts and traps

- **Run from the worktree, env from the main checkout:** `npm run rewards:backfill-ranked` uses
  `--env-file=.env.local`, which doesn't exist in the worktree. Use the long form from inside the worktree:
  `node --env-file=/Users/andrewserulneck/Documents/Trivia-Predictions/.env.local --conditions react-server --import tsx scripts/backfill-ranked-reward.cjs …`
  (the `@/` aliases need the worktree's tsconfig, so cwd must be the worktree). Never read/print `.env.local`.
- Schedule `78a0e374-f3f1-4605-af35-89deb8040660`: `start_time 2026-08-05T19:00Z` = **3:00 PM ET** (not 7 PM as
  older notes say), 14 rounds → each game ends 6 h 25 min later (~9:25 PM ET). Answers run 4 PM–9:15 PM ET.
- Cross-check done: all 10 past (schedule, occurrence_date) pairs with answers (Aug 5/6/7/14/19/21/28, Sep 11/17,
  Oct 9) fall inside the planned weeks; Oct 14 is the resolver's. No `tiebreakUnresolved`.
- The dry run reads live scores; if anyone's answers changed (they don't after a game, Phase 2 §5) or a player
  deleted their account, the count changes and `--expect-coupons 13` will refuse. Re-run dry, explain, re-ask.
- A deleted player's coupon disappears (account deletion), so a later count can be lower — expected, not a bug.
- Dev shares the production DB. Don't create test rewards for real venues.

### 6. Build / run / test

- `npx tsc --noEmit` clean · `npm run lint` clean (usual Babel note on `lib/sportsBingo.ts`) · `npx vitest run`:
  **379 files passed, 1 skipped; 4,460 tests passed, 13 env-gated skips**. `npm run build` not run (no app/UI
  change; the only runtime change is the `probesMs` refactor, covered by the unchanged resolver/card tests).
- **The dry run (2026-10-14 ~23:05Z) output:** 10 weeks owned (Aug 5 … Oct 7); awarded weeks as in Andrew's
  table above; Sep 2 / Sep 23 / Sep 30 `no_scorers`; "Coupons to issue: 13 · gift cards total $320".
- **To finish after Andrew approves:**
  1. Dry run again (same command without `--apply`) and confirm it still says 13 / $320.
  2. `… scripts/backfill-ranked-reward.cjs --campaign 677a214c-b859-4c17-8e4d-9889574516e1 --from 2026-08-05 --expiry-days 30 --apply --expect-coupons 13`
     → expect 7 `awarded` + 3 `no_scorers`.
  3. Verify read-only (service-role supabase-js): 13 `challenge_campaign_redemptions` for the reward, `place` set
     (7×1, 5×2, 1×3), `prize_gift_certificate_amount` 30/20/10, `prize_expires_at` ≈ apply time + 30 days; 13
     `challenge_cycle_winners` rows with `place`; 10 `challenge_cycle_settlements` rows (7 awarded, 3 no_scorers);
     13 notifications ("You finished 1st in \"Live Trivia Challenge\" and won a $30 gift card!…").
  4. Re-run the apply command with `--expect-coupons 0` → every week `skipped_settled` (no-op).
  5. Give Andrew the winners list (table above) for Garden State Bar.
- Unverified: a real apply (nothing applied yet); the Oct 16 live settlement (Phase 7).

### 7. Open questions for Andrew

1. **Approve the backfill** (13 coupons, $320, 30-day expiry)? — blocking.
2. Push this branch to `main` (deploys a behavior-identical refactor + the script)? Not required for the backfill.

### 8. Recommended next steps

**Model: Claude Opus 5.5 · Effort: high** for the apply (real money). On Andrew's "yes": steps 1–5 of §6, then
update this note (or write a short addendum) and the plan status line to "Phase 5 done". Then Phase 6 (Claude
Sonnet 5.5, high) from a fresh worktree of `origin/main` (merge/push this branch first if Andrew approved it).

---

## Addendum — backfill applied (2026-10-14 ~19:09 ET, Andrew approved)

- Dry run re-checked (13 coupons / $320), then applied with `--expect-coupons 13 --expiry-days 30`. Result: 7 weeks
  `awarded`, 3 `no_scorers` (Sep 2, 23, 30). Verified read-only: 13 `challenge_campaign_redemptions` (places 1×7 at $30,
  2×5 at $20, 3×1 at $10), all expiring 2026-11-13T23:09Z; 13 `challenge_cycle_winners`; 10 `challenge_cycle_settlements`;
  13 notifications. Re-run with `--expect-coupons 0` → all `skipped_settled`.
- **Wording changed (Andrew):** the ladder now reads "1st place wins a $30 gift card, 2nd place wins a $20 gift card and
  3rd place wins a $10 gift card." (`describePlacePrizeLadder` in `lib/rankedPlaceRewards.ts`; tests + device checklist
  updated). The reward row's stored `rules` text was updated to match (one `UPDATE` on `677a214c…`).
  The Rewards card text is computed live from the code, so it changes when this is deployed.
- Still open: the Oct 14 week is settled by the resolver after Friday's game ends (Phase 7 watches it).
