# Reward Minimum Players — Phase 2 Handoff (2026-10-17)

Plan: `docs/reward-minimum-players-plan.md`. Phase 2 = the "How many players must play?" wizard step.

## For Andrew (plain English)

**What changed.** The Create Reward screen now has its own question, **"How many players must play?"**, right
after the rules and before the prize. It appears for the three kinds of reward where players compete: Live Trivia
**Winner of the game**, Live Trivia **Top players this week (1st/2nd/3rd)**, and NFL Pick 'Em **Most picks right**.
Nothing is pre-selected: the partner must tap **No minimum** or **Set a minimum** (the box starts at 3, allowed
2–100) before the Next button turns on. A points target ("Earn 500 points", "Get 10 picks right") skips it, as you
decided. The old "Minimum players?" question at the bottom of the rules screen is gone. The Confirm screen now shows
a "Minimum players" line (At least N / None) for all three kinds.

**NFL:** the stop-gap from Phase 1 (always "at least 3") is removed. Whatever the partner chooses is what is stored;
"No minimum" means even one player can win.

**Is it live?** No. Nothing from Phases 1 or 2 is committed, pushed or deployed. The only live change is Phase 1's
database update (your one NFL reward = "at least 3"), which behaves the same as before.

**What's left.** Phase 3: you decide when to commit/push; then the release checks (below). Also your phone pass:
section **K** at the bottom of `docs/partner-dashboard-app-redesign-device-checklist.md`.

**Needs you:** commit/push timing; the phone pass. The working tree also holds unrelated tutorial-card changes
(not mine) — see below before committing.

---

## For the next agent (Phase 3)

### 1. Goal and scope
Read the plan §4 Phase 3 (Sonnet 5.5, medium): confirm the migration is applied and both phases are committed
(Andrew decides push/deploy), post-deploy read-only count, optional test rewards on `venue-hightop-test` (ASK
first — writes to production), watch the next NFL settlement logs, final handoff, mark the plan complete.
Out of scope: editing a live reward (A3), a player-facing counter (A5), any other wizard or server change.

### 2. Starting state
- Branch `main`, last commit `938c744443d65cf646be724c83bb5178ea61915e`. **Nothing from Phase 1 or 2 is committed,
  pushed or deployed.**
- Database: migration `20261017191219_nfl_reward_min_players_backfill.sql` applied 2026-10-17 (Phase 1). Check:
  `node --env-file=.env.local scripts/check-nfl-reward-min-players.cjs` → `NFL most-picks rewards: 1 | min_players null: 0`.
  Phase 2 touched no data and no migration.
- **Unrelated uncommitted work in the tree (not part of this plan; don't revert):** `components/ui/AccountMenu.tsx`,
  `components/venue/GameIdentityPanel.tsx`, `components/venue/VenueHubClient.tsx`, `lib/venueGameCards.ts`,
  `tests/lib.category-blitz-how-to-play.test.ts`, `tests/tutorial-statement-layout-contract.test.ts`, and the "Game
  tutorial cards" section of `CLAUDE.md`. `CLAUDE.md` mixes both: stage it with `git add -p` or leave it out.
- **This plan's files** (stage these): Phase 1 list in `…_PHASE_1_HANDOFF.md` §4, plus Phase 2: `lib/rewardWizardSteps.ts`,
  `components/rewards/CreateRewardWizard.tsx`, `tests/lib.owner-reward-flow.test.ts`,
  `tests/components.create-reward-wizard.test.ts`, `docs/partner-dashboard-app-redesign-device-checklist.md` (section K),
  `docs/reward-minimum-players-plan.md` (status line), this note, and a bullet in `CLAUDE.md` (Rewards System, "One
  shared wizard").

### 3. Decisions made (don't re-ask)
Plan §2 (A1–A6, D1–D4) stands. Phase 2 specifics:
- Terms' Next button reads **"Next: Minimum Players"** when the reward offers a minimum, else "Next: Offer a Prize"; the
  Players step's Next reads "Next: Offer a Prize", and its Back is labelled with the definition name (like Terms).
- The Players step always shows its heading (like Prize), not only in sheet mode.
- The two NFL "At least N guests must make picks…" notices (Terms and Confirm) were **deleted**, not reworded: the
  Players step carries the help sentence, and Confirm has the "Minimum players" row plus the terms sentence
  (`describeNFLWeekScope` already adds "fewer than N" when a minimum is set).
- Confirm's "Minimum players" row is not tappable (no Confirm rows are).
- NFL help copy: "Name a winner only if at least this many players make picks that week|season. With no minimum,
  even one player can win." (`single_week` scope reads "week".)

### 4. Files changed (Phase 2)
- `lib/rewardWizardSteps.ts` — `REWARD_WIZARD_STEPS` now `venue, definition, terms, players, prize, confirm`.
  `guardRewardWizardStep(requested, { definition, context, offersMinimum })`: terms/players/prize/confirm without
  definition+context → `definition`; `players` with `offersMinimum: false` → `prize`. Every other caller derives from the
  const (`lib/ownerRewardFlow.ts` `OWNER_WIZARD_STEPS` filters only `venue`), so the dashboard's `?step=players`
  works with no change there. `RewardsFlow.tsx`'s `DiscardGuard` (`dirty: … step !== "definition"`) already counts it.
- `components/rewards/CreateRewardWizard.tsx`:
  - `offersMinPlayers = winCondition === "game_winner" || winCondition === "ranked_places"`, now defined **above** the
    step guard (needed there), covers NFL most picks (it sets `game_winner`). `isRanked`/`isGameWinner` come later.
  - `minPlayersOn: boolean | null` (null = unanswered), `minPlayersText` starts `String(REWARD_MIN_PLAYERS_DEFAULT)`.
  - `sentMinPlayers = offersMinPlayers ? minPlayers : null` (stop-gap deleted); `minPlayersAnswered` gates Next.
  - `handleSubmit` refuses an unanswered question ("Say how many players must play.") as a backstop.
  - New `players` step block between `terms` and `prize`; Terms' `nextDisabled` no longer looks at the minimum; Prize's
    Back goes to `players` when offered; Confirm row moved out of the ranked-only branch.
- Tests: `tests/lib.owner-reward-flow.test.ts` (guard cases, step order); `tests/components.create-reward-wizard.test.ts`
  (helpers `leaveTerms(minimum)` / `walkToConfirm(minimum)` answer the step, default "No minimum"; new cases: order +
  nothing pre-selected + Next held, pre-fill 3, range errors, back keeps answer, Winner of the game, points target skips
  and sends none, NFL sends 6 / sends none, NFL season wording, controlled `?step=players` → `prize` for a points target).
- `docs/partner-dashboard-app-redesign-device-checklist.md` — new section K.

### 5. Facts and traps
- **Admin snapshots did NOT change** (the plan expected they might): the snapshots walk a points target, which has no
  Players step and whose Terms screen is unchanged. A contest reward is covered by the new explicit tests instead.
- The old tests' `getByText("Minimum players?")` no longer exists anywhere; the step has no such label.
- `tsc` iCloud duplicates: filter with `grep -v "^.next/types/.* 2.ts"`. A tuple error on `onSubmit.mock.calls[0][0]`
  needs the `(…calls[0] as unknown[])[0]` cast.
- Changing the win condition after answering keeps the answer in state but sends it only if the new condition offers a
  minimum (a points target sends none — tested).
- Rewards created in the window between Phase 1's migration and a deploy of this code still come from the OLD wizard
  (never sends a minimum for NFL, old server refused one), so they'd show `min_players` null — see Phase 1 handoff §7.

### 6. Build / test / verification
Run sequentially: `npx tsc --noEmit` (clean apart from iCloud files), `npm run lint` (clean), `npm run test`
(402 files passed, 1 skipped; 4,791 tests passed, 13 env-gated skips — includes navigation, owner-menu and text-size
contracts), `npm run build` (passes; not run at the same time as tsc). **Not verified:** no browser or phone pass (the
step is covered by jsdom tests only); the `?step=` back-gesture behaviour on a real phone is Andrew's section K.

### 7. Open questions for Andrew
None blocking. Commit/push timing; the phone pass (section K).

### 8. Recommended first steps for Phase 3 (Sonnet 5.5, medium)
1. `git status`; confirm what Andrew has already committed. Run `node --env-file=.env.local scripts/check-nfl-reward-min-players.cjs`.
2. Run the gates once more on whatever is being pushed.
3. After Andrew deploys: re-run the count; ask before creating any test reward on `venue-hightop-test`.
4. After the next NFL Tuesday settlement: confirm the existing reward (`ceceade0-d224-4b6d-8181-3f41b1b826f6`, min 3)
   behaved as 3+. Then write the final handoff and mark the plan complete.
