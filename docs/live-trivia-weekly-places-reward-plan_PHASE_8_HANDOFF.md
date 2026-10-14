# Live Trivia Weekly Places Reward — Phase 8 handoff (2026-10-14)

Plan: `docs/live-trivia-weekly-places-reward-plan.md`. Phase 8 = **Past Winners** on the Partner Dashboard (§5f).
This session also made "Top players this week" an option at every venue with a Live Trivia game, even a single
one-off game (decision D13), and fixed everything a code review of this work found. Next: **Phase 7**.

## For Andrew (plain English)

- **What changed:**
  - **Past Winners.** A new Partner Dashboard menu row, **Past Winners** (below Order Join Merch). It opens a sheet
    with two tabs. **Live Trivia games** lists each past game, newest first, with the number of players and who
    won. Tap one to see its final top 10. **Rewards** lists every reward that has paid out at that venue. Tap one to
    see each week's winners, by place, with the prize and whether the coupon was redeemed. A week nobody won says
    why (for example "Only 2 players — the minimum was 4"). Partners see usernames only, nothing else about players.
    It is read-only and loads only when a partner opens it.
  - **"Top players this week (1st, 2nd, 3rd)" now always shows** when creating a Live Trivia reward, including at a
    venue with just one non-repeating game (your request). Every game played that week counts. At a venue with no
    repeating game, the guest wording doesn't name a weekday ("…across all of the week's games… Winners are named
    after the week's last game").
- **Is it live?** **No.** It is committed on branch `live-trivia-ranked-places-phase8`, which sits **on top of the
  unpushed Phase 6 wizard**. Pushing it puts both live for every partner. It also needs one small database change
  (two read-only lookups and one index). Until that change is applied, the Past Winners screen says "not available
  yet" and nothing else is affected.
- **Needs you:** (1) say "push" to apply the database change and deploy Phases 6 + 8. (2) Phone checks: sections
  **C** and **D** of `docs/reward-descriptions-device-checklist.md`. Section D only looks at data, so it is safe to
  try at Garden State Bar.
- **Not checked:** a real browser or phone. Automated tests, the database test and a clean build all pass.

## For the next agent

### 1. Goal and scope

Phase 8 is **done in code, not deployed**. Next is **Phase 7** (plan §7): watch Garden State Bar's first live week.
It settles after **Fri 2026-10-16**'s game ends (≈ 2026-10-17T01:25Z) on the next `/api/cron/resolve-live-trivia-winners`
sweep. Then add the CLAUDE.md/AGENTS.md "Weekly places rewards" section (include Past Winners + D13), point
`docs/rewards-system-plan.md` at it, and compare usage with §6.
Out of scope: Category Blitz in Past Winners (D12); editing or re-awarding from Past Winners; CSV export; pinning a
ranked reward to chosen games in the wizard.

### 2. Starting state

- Worktree `/private/tmp/claude-501/-Users-andrewserulneck-Documents-Trivia-Predictions/5665aea4-2ec0-4b7b-8d29-53a745df21f9/scratchpad/ranked-p8`,
  branch `live-trivia-ranked-places-phase8`, based on Phase 6's commit `83943b7` (itself on `origin/main` `fdd62bc`).
  `node_modules` is a symlink to the main checkout's. One commit on top with all of Phase 8 + D13 + review fixes.
  **Not pushed.** Andrew's main checkout (`/Users/andrewserulneck/Documents/Trivia-Predictions`) is on
  `category-blitz-scoring-cadence` with a lot of unrelated uncommitted work: never commit there, never
  `git checkout --` there.
- **Migration `20261014213000_owner_past_winners_summaries.sql` is NOT applied.** Checked with
  `supabase migration list --linked` on 2026-10-14: production's newest is `20261014010000`. Speed Trivia's
  `20261014020000` (another branch, main checkout only) is also not applied yet. This file was renamed from
  `20261014013000` so it sorts after it (review finding: an earlier-dated file would make `supabase db push` refuse
  once `…020000` is applied).
- No production data was read or written for Phase 8 (only the read-only migration list).

### 3. Decisions already made (don't re-ask)

- D9 (Past Winners), D12 (no Category Blitz), D11 (Phase 8 deploy approved — but see §7: it ships with the
  unpushed Phase 6, and `supabase db push` always asks first).
- **D13 (Andrew, 2026-10-14): "Top players this week" is always an option** once the venue has a Live Trivia game,
  even a single one-off. One rule, `rankedNightsForVenue` (`lib/rankedPlaceRewards.ts`): repeating nights, else
  the one-off games' nights, else the schedules' weekdays. It decides only where the week starts. Every game in the
  week counts (the resolver groups by cycle key). **Pinned** games must still repeat weekly
  (`REWARD_RANKED_PLACES_WEEKLY_ONLY_MESSAGE`). No game night at all → `REWARD_RANKED_PLACES_NO_GAMES_MESSAGE`.
- Consequence: the admin wizard "terms" snapshot changed (one line: the third chip now shows, because its fixture
  venue has `scheduleDays: ["fri"]`). Prize/confirm/definition snapshots are unchanged. Updated deliberately.
- Past Winners shows a reward if it **paid or settled a week at this venue**, found from the venue's own ledger,
  not from the reward's current `venue_ids`. A reward that later dropped the venue still shows its history there.
  Its detail opens if the reward is offered here (or everywhere) OR has rows here; otherwise 404.
- A deleted player's coupon is gone, so their "redeemed" status is `null` (unknown) and the sheet shows nothing,
  never "Not redeemed yet".

### 4. Files created or changed

- Migration `supabase/migrations/20261014213000_owner_past_winners_summaries.sql`:
  `live_trivia_occurrence_summaries(uuid[], date, integer)` (games list; index walk on `idx_lsa_occurrence`, never
  splits a date across pages) and `challenge_reward_history_summaries(text, timestamptz, uuid, integer)` (rewards
  list, keyset on `(last_activity_at, challenge_id) desc`, returns `p_limit + 1` rows) + index
  `idx_challenge_cycle_winners_venue (venue_id, challenge_id, cycle_start desc)`. Both `security definer`,
  service_role only. No table/view/sequence created, so no grants contract needed.
- `lib/ownerHistory.ts` (server-only): `listOwnerGameHistory`, `getOwnerGameDetail`, `listOwnerRewardHistory`,
  `getOwnerRewardDetail`, errors `OwnerHistoryUnavailableError` (→ 503) / `OwnerHistoryNotFoundError` (→ 404).
- `lib/ownerHistoryDisplay.ts` (pure, client-safe): wire types, `OWNER_HISTORY_PAGE_SIZE` 20, standings limit 10,
  detail cycle limit 52, cursors (`parseGamesCursor`, `rewardsCursor`/`parseRewardsCursor` — the rewards cursor
  carries the DB's own timestamp text so microseconds survive), `formatCycleLabel`, `rewardHowWonLabel`,
  `rankGameStandings`, `winnersLabel`, `rewardWinnerLabel`.
- `lib/ownerHistoryRoute.ts`: `withOwnerVenue` — `requireOwnerAuth`, then `venueId ∈ auth.venueIds` (403) BEFORE
  any read; maps errors; `Cache-Control: no-store`.
- Routes: `app/api/owner/history/route.ts`, `app/api/owner/history/games/[scheduleId]/route.ts`,
  `app/api/owner/history/rewards/[rewardId]/route.ts`.
- UI: `components/owner/history/PastWinnersSheet.tsx`; `HistorySheetHost` in `app/owner/dashboard/page.tsx`;
  menu row in `components/owner/menu/ownerMenuItems.ts`; `"history"` in `OWNER_SHEET_IDS` (`lib/ownerSheetParams.ts`).
- `lib/challengeCampaigns.ts`: `listChallengeCampaignsByIds(ids)` (bounded, drops non-uuid ids).
- `lib/liveTriviaWeekTotals.ts`: `LiveTriviaWeekTotalsMissingError` (thrown only for a missing function; the
  resolver still treats it as any Error).
- D13: `rankedNightsForVenue` (`lib/rankedPlaceRewards.ts`), used by `createReward` (`lib/rewards.ts`) and the
  wizard (`components/rewards/CreateRewardWizard.tsx`, help text via `rankedHasRepeatingGame`);
  `describeRankedPlacesReward` in `lib/rewardDescription.ts` gets `scheduleKnown`.
- Tests: `tests/api.owner.history.test.ts` (401/400/403/404/503/500), `tests/lib.owner-history.test.ts`
  (venue scoping, no ids leaked, in-progress games, partial ledger cycle, deleted player, cursor round trip),
  `tests/lib.owner-history-display.test.ts`, `tests/components.owner-past-winners-sheet.test.ts` (no fetch while
  closed, tabs, detail, Show-more race), `scripts/test-owner-history-sql.cjs` (`npm run test:owner-history-sql`),
  plus updates to `tests/owner-menu-contract.test.ts`, `tests/components.create-reward-wizard.test.ts` (+ snapshot),
  `tests/lib.rewards-definitions.test.ts`, `tests/lib.ranked-places-reward-copy.test.ts`.
- Docs: plan status/D13/§5f/Phase 8, checklist §C row + new §D, this note.

### 5. Facts and traps

- **Code review (2026-10-14) found 10 issues; all fixed:** guest wording named a weekday for one-off-only rewards;
  a partly read ledger cycle was shown as complete; a late "Show more" could wipe the fresh first page (now a
  generation ref); the migration sorted before `20261014020000`; a 200-campaign cap dropped old rewards and paging
  re-read everything (now SQL keyset from the venue's ledger + reads only the page's rewards by id); game detail
  gave 500 instead of 503 when its RPC was missing; a deleted player's prize read "Not redeemed yet"; wizard help
  text could disagree with the nights; missing handoff (this file).
- `occurrence_date` is venue-local: never convert it (`formatOccurrenceDate` builds the label from the string).
- Detail of a game still being played shows no standings and the list names no winner ("Playing now").
- The dashboard page must not name `/api/owner/venues` (first-load tripwire). The history routes are separate.
- Dev shares the production DB. Past Winners only reads, but never test reward creation at a real venue.

### 6. Build / run / test

- From the worktree: `npx tsc --noEmit` clean · `npm run lint` clean · `npx vitest run`: **384 files passed,
  1 skipped; 4,520 tests passed, 13 env-gated skips** · `npm run test:owner-history-sql` passes ·
  `npm run test:ranked-places-sql` passes · `npm run build` succeeded (the three `/api/owner/history*` routes are
  listed as dynamic). Don't run typecheck and build at the same time.
- **Not verified:** real browser/phone rendering, and the RPCs against production data (they aren't applied yet).
  After applying, a quick check: open Past Winners at Garden State Bar. Expect the Oct 9 game (murph 90) and
  "Weekly Trivia Champions" with 10 settled weeks.

### 7. Open questions for Andrew

1. **Apply the migration and push Phases 6 + 8?** D11 approved deploying Phase 8, but (a) the branch includes the
   still-unpushed Phase 6 wizard, and (b) `supabase db push` always asks first. Order: `supabase db push` (applies
   only `20261014213000` unless the Speed Trivia `…020000` file is present in the pushing checkout. Push from this
   worktree, which doesn't have it), then `git push origin HEAD:main` from the worktree, then watch the Vercel
   deploy reach Ready.
2. Phone checks: checklist §C (wizard incl. the single-game case) and §D (Past Winners).

### 8. Recommended next steps

1. On Andrew's go-ahead, run §7.1 in that order, then open Past Winners at Garden State Bar to confirm.
2. Phase 7 (Claude Sonnet 5.5, medium) after Friday 2026-10-16's game. Read the plan + Phase 5, 6 and 8 handoffs first.
