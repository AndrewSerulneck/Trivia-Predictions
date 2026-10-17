# Reward Minimum Players — Phase 1 Handoff (2026-10-17)

Plan: `docs/reward-minimum-players-plan.md`. Phase 1 = NFL per-reward minimum (server, data, wording).

## For Andrew (plain English)

**What changed.** NFL Pick 'Em "most picks right" rewards no longer share one fixed "3 players must make
picks" rule. Each reward now carries its own number: **no minimum** (even 1 player can win) or **at least N**
(2–100). The server, the weekly payout job, the partner's terms, the player fine print and the Pick 'Em
leaderboard note all read that number from the reward itself.

**Your existing NFL reward is unchanged.** Before any code, I applied a small database update (with your OK)
that wrote "at least 3" onto your one NFL most-picks reward (`ceceade0…`, weekly). Checked afterwards: it shows
`min=3`, and no NFL most-picks reward is missing a minimum.

**Is it live?** The database update **is** live. The code is **not**: it is uncommitted on your machine, not
pushed or deployed. Until it ships, the live site still uses the fixed 3, which matches what is stored, so
nothing differs in the meantime.

**What partners see for now.** The Create Reward screen does not yet let a partner choose the NFL minimum.
Until Phase 2 adds the "How many players must play?" screen, a new NFL most-picks reward is created with
"at least 3", the same rule the screen shows them.

**What's left.** Phase 2: the new wizard screen. Phase 3: release and checks.

**Needs you:** decide when to commit/push (see "Starting state" below — your working tree also holds someone
else's unrelated tutorial-card changes).

---

## For the next agent (Phase 2)

### 1. Goal and scope of Phase 2

Read the plan's §4 Phase 2 in full. In short: add a `players` step between `terms` and `prize` in
`components/rewards/CreateRewardWizard.tsx` ("How many players must play?", "No minimum" / "Set a minimum",
number box pre-filled with 3, nothing pre-selected, Next disabled until answered), offered for Live Trivia
win-the-game, weekly places AND NFL most picks; skipped for every points target. Insert `"players"` into
`REWARD_WIZARD_STEPS` + `guardRewardWizardStep` (`lib/rewardWizardSteps.ts`). **Delete the Phase 1 stop-gap**
(below). Out of scope: editing a live reward (A3), a player-facing counter (A5), any other server change.

### 2. Starting state

- Branch `main`, last commit `938c744443d65cf646be724c83bb5178ea61915e` (unchanged). **Nothing from Phase 1 is
  committed, pushed or deployed.**
- **The working tree also has someone else's uncommitted, unrelated work** (game tutorial cards, present before
  Phase 1 started): `components/ui/AccountMenu.tsx`, `components/venue/GameIdentityPanel.tsx`,
  `components/venue/VenueHubClient.tsx`, `lib/venueGameCards.ts`, `tests/lib.category-blitz-how-to-play.test.ts`,
  `tests/tutorial-statement-layout-contract.test.ts`, `next-env.d.ts`, and the "Game tutorial cards" section of
  `CLAUDE.md`. Don't revert or "clean up" those. If you commit, stage only the reward-minimum files listed in §4.
  Also untracked and part of this plan: `docs/reward-minimum-players-plan.md`.
- **Database:** migration `20261017191219_nfl_reward_min_players_backfill.sql` was **applied** to linked project
  `pkmxupsayzshvpirkaav` on 2026-10-17 with `supabase db push` (Andrew approved; dry run showed it was the only
  pending migration). Effect: 1 row (`ceceade0-d224-4b6d-8181-3f41b1b826f6`, weekly NFL most picks, active)
  went from `min_players` null to 3. No other rows matched. Undo, if ever needed (ask first):
  `update challenge_campaigns set min_players = null where id = 'ceceade0-d224-4b6d-8181-3f41b1b826f6';`. **But
  never undo it while Phase 1 code is live**, because null now means "no minimum".
- Verification after push: `node --env-file=.env.local scripts/check-nfl-reward-min-players.cjs` →
  `NFL most-picks rewards: 1 | min_players null: 0`.

### 3. Decisions already made (don't re-ask)

All of plan §2 (A1–A6, D1–D4) stands. Phase 1-specific choices:
- **Skip reporting:** `NFLPickEmWinnerSkip` gained `minPlayers`. When rewards at one venue/contest miss
  different minimums, the report has **one entry per distinct minimum** (smallest first), each with its
  `campaignIds`. Rewards that meet theirs still pay in the same pass.
- **Leaderboard note** (`rewardMinPlayers` from `GET /api/nfl-pickem/rewards`): the **smallest** minimum among the
  week's active NFL most-picks rewards; **null** when there are none or any has no minimum (then no note). Pure
  helper `nflNoWinnerHeadcount` so it's unit-tested. No new database read.
- **Server error copy** `REWARD_MIN_PLAYERS_UNSUPPORTED_MESSAGE` was reworded to "A minimum number of players
  is only for a reward where players compete for the top spot." (the old text named only Live Trivia).
- **Owner terms** (`rewardTermsText`) say "make picks" instead of "play" for NFL, picked via the registry
  (`description.calendar === "nfl_season"`), not a hard-coded definition id.
- `NFL_REWARD_MIN_PICKERS` and `NFL_WINNER_MIN_PARTICIPANTS` are **deleted**; the wizard pre-fill is the new
  `REWARD_MIN_PLAYERS_DEFAULT = 3` in `lib/rankedPlaceRewards.ts` (next to MIN/MAX).

### 4. Files changed (Phase 1 only)

- `supabase/migrations/20261017191219_nfl_reward_min_players_backfill.sql` — the data-only backfill.
- `lib/rewards.ts` — `normalizeMinPlayersInput(raw, winCondition)` (~line 1072): no NFL refusal; still refuses on
  any `points_threshold`; same 2–100 range. `createReward` already forwarded `minPlayers` to
  `createChallengeCampaign` on the single shared path (NFL included). Verified, no change needed there.
- `lib/nflPickEmWinnerRewards.ts` — header comment rewritten; `splitByMinimum` (~327) and
  `nflNoWinnerHeadcount` (~350) exported; the sweep (~653) splits `eligible` into `met`/`unmet` per reward,
  reports unmet, awards met; `continue` only when nothing is met.
- `lib/nflPickEmRewardWeeks.ts` — `NFLWeekScopeDescription.minPlayers?`; `describeNFLWeekScope` adds the
  "fewer than N" sentence only when a minimum ≥ 2 is given.
- `lib/rewardDescription.ts` — `nflMinPickersLine(input)` replaces the constant; omitted when no minimum.
- `lib/ownerRewardDisplay.ts` — NFL verb "make picks".
- `lib/rankedPlaceRewards.ts` — `REWARD_MIN_PLAYERS_DEFAULT = 3`.
- `components/rewards/CreateRewardWizard.tsx` — **Phase 1 stop-gap** at ~726–728:
  `nflStopGapMinPlayers` (3 for NFL most picks) and `sentMinPlayers = offersMinPlayers ? minPlayers :
  nflStopGapMinPlayers`. `sentMinPlayers` feeds the guest preview (~793), the submit body (~884), the NFL Terms
  notice (~1219), the Confirm terms sentence (~1750) and the Confirm NFL notice (~1759). `offersMinPlayers` (~719)
  still excludes NFL, so the existing "Minimum players?" control (~1421, bottom of Terms) stays Live Trivia only.
  `minPlayersText` still defaults to "4" (~381); Phase 2 changes it to `String(REWARD_MIN_PLAYERS_DEFAULT)` (D2).
- `app/api/nfl-pickem/rewards/route.ts` — adds `rewardMinPlayers` to the response.
- `components/nfl-pickem/NFLPickEmLeaderboard.tsx` — note compares against `rewardMinPlayers`; hidden when null.
- `scripts/check-nfl-reward-min-players.cjs` — new, read-only check (above).
- `scripts/seed-nfl-pickem-test-data.cjs` — comment only.
- `CLAUDE.md` (NFL bullet in Rewards System) and `docs/nfl-pickem-reward-plan.md` (dated amendment on the
  "Minimum participation" locked decision).
- Tests: `tests/lib.nfl-pickem-winner-rewards.test.ts` (fixture default `minPlayers: 3`; new: exact-minimum pays,
  null + lone picker wins, null + 0 right wins nothing, four rewards at one venue with none/2/5/10 → two pay, two
  reported; `splitByMinimum`; `nflNoWinnerHeadcount`), `tests/lib.rewards-definitions.test.ts` (NFL accepts and
  stores a minimum, stores null when absent, range-checks, refuses on NFL picks target),
  `tests/lib.nfl-pickem-reward-weeks.test.ts`, `tests/lib.reward-description.test.ts` (fixture `minPlayers: 3`;
  null → no line; 6 → "At least 6"), `tests/lib.owner-reward-display.test.ts`,
  `tests/components.create-reward-wizard.test.ts` (NFL most picks submits `minPlayers: 3`; season picks target
  sends no `minPlayers`), `tests/api.nfl-pickem.test.ts` (env-gated; comment + `rewardMinPlayers` null).

### 5. Facts and traps

- `ChallengeCampaign.minPlayers` is **optional** (`types/index.ts:348`): treat `undefined` like null.
- Venue discovery in the sweep only finds venues with ≥1 pick, and a contest with `topCorrectPicks <= 0` still
  awards nobody. So "no minimum" never pays a venue with zero pickers or zero right answers.
- A one-off (single week/season) reward that misses its minimum is **not** spent (stays active), as before.
- `tsc --noEmit` shows errors in `.next/types/routes.d 2.ts` / `validator 2.ts`: those are iCloud duplicate files,
  not code errors. Filter them out: `npx tsc --noEmit 2>&1 | grep -v "^.next/types/.* 2.ts"`.
- A scratch script outside the repo can't resolve `@supabase/supabase-js`. Put it under `scripts/` or set
  `NODE_PATH=$PWD/node_modules`.
- The `terms_updated_at` trigger (`20261004170244`) doesn't watch `min_players`, so the backfill re-stamped no coupon.
- The wizard's `offersMinPlayers` comment and the NFL notices are the only places Phase 2 must rework; the server
  and every reader already handle any NFL minimum including null.

### 6. Build / test / verification

Run sequentially (never typecheck while building):
`npx tsc --noEmit` (clean apart from the iCloud files), `npm run lint` (clean), `npm run test` (402 files passed,
1 skipped; 4,784 tests passed, 13 environment-gated skips), `npm run build` (passes).
Verified against production: the read-only check before (1 row, null) and after the push (1 row, 3).
**Unverified:** no browser or device pass (Phase 1 changed no layout; the wizard copy is unchanged for NFL since it
still says 3). The live sweep hasn't run on the new code because it isn't deployed.

### 7. Open questions for Andrew

None blocking. Commit/push timing is his call. **If Phase 1 is pushed before Phase 2**, run
`node --env-file=.env.local scripts/check-nfl-reward-min-players.cjs` after the deploy (plan step 8). Any NFL
most-picks reward created between 2026-10-17 19:12 UTC (migration) and the deploy with `min=none` needs a
one-row fix to 3, after asking Andrew. In practice the old wizard never sends `minPlayers` for NFL, and the old
server refused it, so such a row would show `none`.

### 8. Recommended first steps for Phase 2 (Sonnet 5.5, high)

1. Read the plan §4 Phase 2 and this note's §4 wizard bullet.
2. `lib/rewardWizardSteps.ts`: add `"players"`; extend `guardRewardWizardStep`'s `have` with an "offers a minimum"
   flag; update `tests/lib.owner-reward-flow.test.ts`.
3. In the wizard: set `offersMinPlayers = isRanked || isGameWinner` (NFL most picks is `isGameWinner`, since the
   "Most picks right" tile sets `winCondition = "game_winner"`). Delete `nflStopGapMinPlayers` and make
   `sentMinPlayers` just `offersMinPlayers ? minPlayers : null`. Keep `sentMinPlayers` in the NFL notices, or
   fold the NFL notices into the new step's copy. Move the "Minimum players?" block to the new step. Make
   `minPlayersOn` `boolean | null` (D1).
4. Update the wizard test that now expects `minPlayers: 3` for NFL most picks: it should expect the partner's choice.
