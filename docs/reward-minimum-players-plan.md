# Reward Minimum Players — Plan

> **Status:** Phases 1–3 done 2026-10-17 (Phase 1 migration `20261017191219` applied to production; code committed
> locally, NOT pushed/deployed). Remaining, Andrew's call: push, phone pass (section K), post-deploy count and the
> next NFL Tuesday check. Latest handoff: `docs/reward-minimum-players-plan_PHASE_3_HANDOFF.md`.
> Each phase ends with `docs/reward-minimum-players-plan_PHASE_<N>_HANDOFF.md`; update this line to point at the latest.
> **Owner:** Andrew.

---

## 1. Summary for Andrew (plain English)

**What already works (live since 2026-10-14):** when a partner creates a Live Trivia **"Win the game"** or
**"Weekly 1st / 2nd / 3rd"** reward, the rules step asks **"Minimum players?"**. If fewer players take part
than the number they set, nobody wins that game (or week). Your $25 gift card example works today, as long as it
is set up as a "Win the game" reward. But the question sits at the bottom of a busy screen, and none of the 6 live
rewards uses it.

**What this plan changes:**
1. **NFL Pick 'Em "most picks right" rewards get the same choice.** Today NFL always requires 3 players making
   picks, and the partner can't change that. After this, the partner picks: **no minimum** (even 1 player can win)
   or **at least N players** (2–100).
2. **The question gets its own screen in the Create Reward wizard:** *"How many players must play?"*. It comes
   right after the rules and before the prize, so nobody skips past it. It only appears for rewards where players
   compete against each other (Win the game, Weekly 1st/2nd/3rd, NFL most picks).

**Not changing (your answers, 2026-10-17):** no minimum on "Earn X points" / "Get X picks right" rewards; no
editing the minimum on a reward that's already running (delete and re-create instead); no "2 of 3 players so far"
counter for players.

**Your one existing NFL reward keeps its 3-player rule.** Before the new code goes live, a small database update
writes "at least 3" onto every existing NFL most-picks reward, so nothing changes for it.

**Cost:** none. No new database reads, crons or API calls. The NFL sweep already loads each reward and the
leaderboard; checking a per-reward number instead of a fixed 3 is in-memory work.

---

## 2. Decisions

| # | Question | Decision |
|---|---|---|
| A1 | Points-target rewards ("Earn 500 points", "Get 10 picks right") | **No minimum** (Andrew, 2026-10-17: "Not applicable"). The server keeps refusing `minPlayers` on them (`REWARD_MIN_PLAYERS_UNSUPPORTED_MESSAGE`). |
| A2 | NFL "most picks right" | **The partner chooses.** "No minimum" is allowed: even 1 player can win (Andrew: "The partner can choose to allow 1 player to win the prize if they choose"). Otherwise 2–100, the same range as Live Trivia. This replaces the "locked product decision" of 3+ pickers in `docs/nfl-pickem-reward-plan.md`. |
| A3 | Edit the minimum on a live reward | **No.** Rewards stay create/delete only. |
| A4 | Where it is asked | **Its own wizard step**, `players`, between `terms` and `prize`. |
| A5 | Live "X of N players" counter for players | **No.** The fine-print sentence is enough. |
| A6 | Existing NFL rewards | **Backfill `min_players = 3`** on every NFL `game_winner` reward whose `min_players` is null, active or not. Their behaviour must not change. |

Planner's defaults (Andrew can override; otherwise build these):
- **D1. Nothing is pre-selected on the new step.** The partner must tap "No minimum" or "Set a minimum"; Next stays
  disabled until they do. Otherwise a pre-selected default makes the step easy to skip, which is the problem it
  exists to fix.
- **D2. The number box pre-fills with 3** for every reward type. The Live Trivia default is "4" today; 3 matches
  the old NFL rule and Andrew's example.
- **D3. Both wizard hosts get the step** (Partner Dashboard and admin Rewards). The wizard is one shared component
  and must not fork (CLAUDE.md, Rewards System).
- **D4. "Took part" stays as it is.** Live Trivia: answered at least one question in that game, or that week for
  weekly places. NFL: made at least one pick in the contest's span (the week, or the season for a season reward),
  i.e. one leaderboard entry, which is exactly what the sweep counts today.

---

## 3. What exists today (verified 2026-10-17)

- Column `challenge_campaigns.min_players smallint`, migration `20261014010000_live_trivia_ranked_places.sql`. The
  check constraint `challenge_campaigns_min_players_check` allows null, or 2–100 when `win_condition in
  ('game_winner','ranked_places')`. **NFL most-picks rewards are `win_condition = 'game_winner'`**
  (`reward_definition_id = 'nfl_pickem_challenge'`), so **no schema change is needed** for NFL.
- Read: `CAMPAIGN_SELECT_COLUMNS` + `normalizeMinPlayers` in `lib/challengeCampaigns.ts` (`ChallengeCampaign.minPlayers`,
  `types/index.ts:348`). Write: `createChallengeCampaign` (`lib/challengeCampaigns.ts:~1587`).
- Server validation: `normalizeMinPlayersInput` in `lib/rewards.ts:1068`. **It refuses any value on an NFL reward**
  and on `points_threshold`. Range constants: `REWARD_MIN_PLAYERS_MIN/MAX` (`lib/rankedPlaceRewards.ts:29`).
- Enforcement:
  - Live Trivia game winner: `lib/liveTriviaWinnerRewards.ts:277` (per campaign, `[GameWinnerReward] below-minimum`).
  - Weekly places: `lib/rankedPlaceRewards.ts:122` + `award_ranked_cycle_places` RPC (records `below_minimum`).
  - NFL: **one fixed gate per venue, not per reward.** `lib/nflPickEmWinnerRewards.ts:620`:
    `entries.length < NFL_WINNER_MIN_PARTICIPANTS` → skip every campaign at the venue
    (`report.skippedBelowMinimum`). `NFL_WINNER_MIN_PARTICIPANTS = NFL_REWARD_MIN_PICKERS = 3`
    (`lib/nflPickEmRewardWeeks.ts:50`).
- Wizard: `components/rewards/CreateRewardWizard.tsx`. State `minPlayersOn`/`minPlayersText` (~line 380),
  `offersMinPlayers = !isNFLDefinition && (isRanked || isGameWinner)` (~line 718), the UI block at the bottom of the
  Terms step (~lines 1413–1453), the Confirm row (~line 1709), the NFL "At least 3 guests must make picks" copy on
  Terms (~line 1215) and Confirm (~line 1751). Parser: `parseMinPlayersInput` (`lib/rewardPrizeDraft.ts:113`).
- Steps: `REWARD_WIZARD_STEPS = ["venue","definition","terms","prize","confirm"]` + `guardRewardWizardStep`
  (`lib/rewardWizardSteps.ts`). The Partner Dashboard mirrors the step into `?step=` (`lib/ownerRewardFlow.ts`,
  `lib/useOwnerSheet.ts`). Tests: `tests/lib.owner-reward-flow.test.ts`, `tests/components.create-reward-wizard.test.ts`.
- Wording that hard-codes 3 for NFL:
  - `nflRewardTermsSentence`-style partner copy in `lib/nflPickEmRewardWeeks.ts:521/524/526`
  - `NFL_MIN_PICKERS_LINE` in `lib/rewardDescription.ts:537` (player fine print)
  - `components/nfl-pickem/NFLPickEmLeaderboard.tsx:315/362` ("No reward this week — fewer than 3 players made
    picks"), fed by `GET /api/nfl-pickem/rewards` (`participantCount`, `hasActiveGameWinnerReward`)
  - Partner/admin list terms: `lib/ownerRewardDisplay.ts:~67` (already reads `competition.minPlayers`; check the NFL branch)
- Production, 2026-10-17: 6 active rewards (1 Live Trivia game winner, 1 Live Trivia weekly places, 1 NFL most picks,
  3 legacy points). **None has `min_players` set.**
- The `terms_updated_at` trigger does **not** stamp on `min_players` (weekly-places plan, Phase 1), so the backfill
  won't change any coupon's wording.

---

## 4. Phases

### Phase 1 — NFL per-reward minimum (server, data, wording)

**Model / effort:** Opus 5.5, **high** (it changes who gets paid real prizes).

**Goal:** an NFL most-picks reward carries its own minimum (null = none), and every reader honours it. The wizard
UI is untouched except for wording (Phase 2 adds the control). Phase 1 must be safe to deploy on its own.

1. **Backfill migration first.** Create it with `supabase migration new nfl_reward_min_players_backfill`:
   `update public.challenge_campaigns set min_players = 3 where reward_definition_id = 'nfl_pickem_challenge' and
   win_condition = 'game_winner' and min_players is null;`. Data only, so no grants are needed. Ask Andrew, then
   `supabase db push`. Verify with a read-only query that the count of NFL `game_winner` rows with null
   `min_players` is 0. **Apply it before this phase's code is pushed.** The code running today ignores
   `min_players` for NFL, so applying early changes nothing, and the new code then finds 3 already stored.
2. **`lib/rewards.ts` `normalizeMinPlayersInput`:** accept a value on an NFL reward when `winCondition ===
   "game_winner"`. Keep refusing it on any `points_threshold` (Live Trivia or NFL). Same 2–100 range and messages.
   Pass it through `createReward` for the NFL path. Check that the NFL expansion branch actually forwards `minPlayers`
   to `createChallengeCampaign`, because it is a separate code path from Live Trivia.
3. **`lib/nflPickEmWinnerRewards.ts`:** replace the venue-wide gate with a per-campaign filter. Load the standings
   once per venue/contest as today, then split `campaigns` into those whose `minPlayers` is met
   (`minPlayers === null || entries.length >= minPlayers`) and those that aren't. Report the unmet ones in
   `skippedBelowMinimum` with `participants` and the campaign's own minimum (add `minPlayers` to
   `NFLPickEmWinnerSkip`), and award the rest. If **no** campaign remains, `continue` exactly as today. Delete
   `NFL_WINNER_MIN_PARTICIPANTS`. Rewrite the "MINIMUM PARTICIPATION is a locked product decision" header comment
   to cite this plan (A2). With a minimum of null and one picker who got ≥1 pick right, that picker wins. The
   tiebreaker logic is unchanged.
4. **`NFL_REWARD_MIN_PICKERS`:** stop using it as a rule. Keep it only as the wizard's pre-fill if that's useful
   (D2 uses 3 for every type, so the cleaner move is to delete it and add a single `REWARD_MIN_PLAYERS_DEFAULT = 3`
   beside `REWARD_MIN_PLAYERS_MIN/MAX`). Fix every importer.
5. **Wording follows the reward:**
   - `lib/nflPickEmRewardWeeks.ts` partner terms sentences take the minimum: no sentence when it's null,
     otherwise "…fewer than N players…".
   - `lib/rewardDescription.ts`: `NFL_MIN_PICKERS_LINE` becomes a function of `minPlayersOf(input)`, and is omitted
     when null.
   - `lib/ownerRewardDisplay.ts`: confirm the NFL terms text prints the stored minimum.
   - Wizard NFL copy (~lines 1215, 1751): replace the hard-coded "At least 3 guests" with the chosen minimum.
     Until Phase 2 adds the control, NFL rewards are created with **no minimum**, so for the short window between
     Phase 1 and Phase 2 make the wizard send `minPlayers: 3` for NFL most-picks. That way a reward created in
     between still matches what the partner was shown. Phase 2 removes this.
6. **Leaderboard note:** `GET /api/nfl-pickem/rewards` adds `rewardMinPlayers: number | null`. That is the smallest
   minimum among the venue's active NFL `game_winner` rewards covering that week, or null if any of them has none
   (then a no-winner week isn't explained by headcount). It comes from the campaigns the route already loads, so it
   costs no new read. `NFLPickEmLeaderboard` compares against it and shows "fewer than N players"; if it's null,
   no note.
7. **Tests:** update `tests/*nfl*winner*` cases that relied on the fixed 3 (give their campaigns `minPlayers: 3`)
   and add cases for: null minimum + 1 picker wins; two rewards at one venue with different minimums (one pays, one
   is skipped and reported); a minimum on an NFL picks-target reward is refused; a minimum on an NFL most-picks
   reward is accepted and stored; description/terms omit the line when null and say N when set. Run
   `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` (never typecheck concurrently with build).
8. **Post-deploy check** (if Andrew pushes in this phase): re-run the read-only count from step 1. A reward created
   in the gap between the migration and the deploy would show up here. Fix any with a one-row update after asking.
9. Update CLAUDE.md's NFL bullet ("needs **3+ pickers** at the venue or nobody wins" → the partner's minimum,
   backfilled to 3 for rewards created before 2026-10-17) and add a dated note to `docs/nfl-pickem-reward-plan.md`.

**Out of scope:** any wizard step or layout change; Live Trivia behaviour; points targets.

### Phase 2 — The "How many players must play?" wizard step

**Model / effort:** Sonnet 5.5, **high** (a 1,800-line shared component, URL-mirrored steps, admin snapshots).

1. `lib/rewardWizardSteps.ts`: insert `"players"` between `"terms"` and `"prize"`. `guardRewardWizardStep` also
   needs to know whether the reward offers a minimum: `players` requested for a reward that doesn't offer it
   (points target) → `prize`; `players` without definition/context → `definition` (same as the others). Pass the
   new flag through `have`. Update `tests/lib.owner-reward-flow.test.ts`.
2. `CreateRewardWizard.tsx`:
   - `offersMinPlayers = isRanked || isGameWinner` (NFL most-picks included now; NFL is `isGameWinner`). Check
     whether NFL "most picks" sets `isGameWinner` in this file. If it uses a different flag, use that.
   - Move the "Minimum players?" block off the Terms step onto a new `players` step. Heading: "How many players
     must play?"; buttons "No minimum" / "Set a minimum"; the number box pre-filled with 3 (D2). One line of help
     copy per type (keep today's two Live Trivia sentences; NFL: "Name a winner only if at least this many players
     make picks that week." For a season reward, say "that season").
   - **D1:** `minPlayersOn` becomes `boolean | null` starting `null`; Next is disabled until it's set and the number
     is valid. Going Back to Terms and forward again keeps the answer.
   - Terms' Next goes to `players` when `offersMinPlayers`, otherwise to `prize`; Prize's Back mirrors that.
     `WizardFooter` only (navigation tripwire). On `?step=` hosts, use the existing step-change helpers. Never
     `router.push`.
   - Remove the Phase 1 stop-gap (`minPlayers: 3` forced for NFL); the step's answer is now sent.
   - Confirm: keep the "Minimum players" row (it already prints "At least N" / "None") and show it for NFL too;
     tapping it (if Confirm rows are tappable today) goes to `players`.
   - `DiscardGuard`: an answered `players` step counts as entered answers, the same as the others.
3. Tests: `tests/components.create-reward-wizard.test.ts` (step order for each reward type; Next disabled until a
   choice; NFL sends the chosen value or null; points target skips the step; `?step=players` on a points target
   lands on Prize). Update the admin snapshots on purpose and say so in the handoff. Run the full gate list from
   Phase 1 plus `npm run test` (navigation contract).
4. Add a short section to `docs/partner-dashboard-app-redesign-device-checklist.md` for Andrew's phone pass: create
   one of each reward type on a 350 px and a 289 px screen; phone Back from Prize returns to the players step.

**Out of scope:** editing a live reward (A3), a player-facing counter (A5), any server change beyond removing the
stop-gap.

### Phase 3 — Release and check

**Model / effort:** Sonnet 5.5, **medium.**

1. Confirm the Phase 1 migration is applied (read-only count = 0) and both phases are committed. Andrew decides on
   push/deploy.
2. After deploy: run the read-only count again; create a test reward of each type on the hidden test venue
   `venue-hightop-test` from the live site and delete it afterwards (ask first, since it writes to production); check
   that `[NFLPickEmWinner]` sweep logs on the next NFL settlement show per-reward skips correctly.
3. After the next NFL week settles (Tuesday): confirm the existing NFL reward still behaved as 3+ (it has
   `min_players = 3` stored).
4. Write the final handoff and mark the plan complete.

---

## 5. Risks

- **Paying a reward that should have been skipped:** if the code ships before the backfill, the existing NFL reward
  would pay out with fewer than 3 pickers. Prevented by applying the migration first (Phase 1 step 1) and the
  post-deploy count.
- **Two NFL rewards at one venue:** today they share one gate. After Phase 1 each has its own, so a venue can see
  one pay and one not in the same week. That is intended, and the cron report lists the skipped one.
- **Admin wizard snapshots change** in Phase 2. That's expected (D3), not a regression.

## 6. Open questions for Andrew

None blocking. Override D1–D4 (§2) if you disagree; otherwise they get built as written.
