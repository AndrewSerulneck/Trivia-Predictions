# Reward Minimum Players — Plan

> **Status:** Phases 1–3 done 2026-10-17 (Phase 1 migration `20261017191219` applied to production; code committed
> locally, NOT pushed/deployed). Remaining, Andrew's call: push, phone pass (section K), post-deploy count and the
> next NFL Tuesday check. Latest handoff: `docs/reward-minimum-players-plan_PHASE_3_HANDOFF.md`.
> **Phases 4–7 (added 2026-10-17):** fixes for the 10 `/code-review` findings on the uncommitted
> game-tutorial-card + player-menu work. They don't touch rewards; they live here at Andrew's request.
> **Phases 4–7 done 2026-10-17 (4–5 `274c26c`; 6 `bbf3c0a`; 7 = final gate + checklist section L).** Latest handoff:
> `docs/reward-minimum-players-plan_PHASE_7_HANDOFF.md`.
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

### Phases 4–7 — Code-review fixes: game tutorial cards and the player menu (added 2026-10-17)

**Summary for Andrew:** a code review of the new tutorial cards (Bingo, Pick 'Em, NFL Pick 'Em and Fantasy now
use the Category Blitz layout) and the player menu scroll fix found 10 issues. None affects rewards or money.
The ones players would see: on a small phone (iPhone SE) the top of some tutorial pictures is cut off, and team
and player names are cut short ("Bu…", "T. Haliburt…"). The rest is tidy-up so the next change doesn't break
something: dead leftover data, rule breaks the project's own checks should catch, and the player menu existing
as two hand-copied versions. **Cost:** none (layout and code only; no reads, crons or API calls).

**Starting state (for every phase below):** the tutorial-card work is **uncommitted on `main`**, on top of
`dfb62f5`: `CLAUDE.md`, `components/ui/AccountMenu.tsx`, `components/venue/GameIdentityPanel.tsx`,
`components/venue/VenueHubClient.tsx`, `lib/venueGameCards.ts`, `tests/lib.category-blitz-how-to-play.test.ts`,
new `tests/tutorial-statement-layout-contract.test.ts`. **Never `git checkout -- <file>` / `git restore` to undo
an edit here** — it wipes all of that uncommitted work. Ask Andrew whether to commit it first (recommended, as its
own commit) before Phase 4 starts, so each phase's diff stays readable.

**Rules that apply (CLAUDE.md "Game tutorial cards" + "Code Style"):** text wins, art shrinks — never a label under
14 px inside tutorial art and never text pushed off the card; check every change at a **350 px and a 289 px card**;
Tailwind only, no inline `style={{}}`; fonts via `[font-family:var(--ht-font-display)]` / `font-mono`, never a
literal family name. Tailwind is **3.4.17 with no container-queries plugin**: the art box is already
`[container-type:size]`, so use `cqw`/`cqh` units or arbitrary variants like `[@container(max-height:11rem)]:hidden`.

#### Phase 4 — Tutorial art fits on small cards (findings 1, 2, 3, 5)

**Model / effort:** Sonnet 5.5, **high** (visual; must be checked in a browser at two widths).

1. **Art box clips its top (finding 1, `GameIdentityPanel.tsx` ~line 862, `TutorialStatementPanel`).** The
   non-Category-Blitz art box is `flex … items-center justify-center … overflow-hidden`, so taller art overflows
   both ends and its top disappears. Keep `items-center justify-center` and add `[align-items:safe_center]
   [justify-content:safe_center]` after them (an older browser that doesn't know `safe` drops only the arbitrary
   declaration and keeps today's centring). Then make tall art degrade instead of clipping, per "show fewer rows":
   - Pick 'Em / NFL step 3 (`PickEmIllustration`, `stepIndex >= 2`): hide `PEPipBar` when the box is short
     (`[@container(max-height:…)]:hidden` on its wrapper; pick the threshold by measuring at 289 px).
   - Pick 'Em step 2: hide the second (waiting) ticket when the box can't hold two.
   - Fantasy steps 1 and 3 (`FantasyIllustration`): show one row instead of two when short.
   - Bingo already scales with `cqh`; leave it.
2. **Pick 'Em team names truncate (finding 2, `PETeamCol` ~line 413).** Check + name + score on one row in a
   half-width column leaves ~40 px for the name at 289 px. Put the score on its own line under the name (or the
   check above the name), so the name gets the column's full width. The name must not truncate for "Dolphins",
   "Packers" or "Bucks" at 289 px. Keep 16 px text.
3. **Fantasy player names truncate (finding 3, `FanPlayerRow` ~line 590).** Name + "Live" badge + score on one
   row leaves ~103 px. Move the "Live" badge onto the position line (`PG · ● Live`) so the top line is name +
   score only. "T. Haliburton" must fit unclipped at 289 px.
4. **13 px check mark (finding 5, `PETeamCol` ~line 421).** Raise to `text-[14px]` (and the circle to fit, e.g.
   `h-6 w-6`). Grep the file for any other `text-[1[0-3]px]` and fix it the same way.
5. **Tripwire:** extend `tests/tutorial-statement-layout-contract.test.ts` with a static check that
   `GameIdentityPanel.tsx` contains no `text-[Npx]` with N < 14 (read the file as text, like the other contract
   tests). The truncation fixes can't be unit-tested; verify them in a browser.
6. **Verify:** browser-check every statement-layout game's cards (Bingo, Pick 'Em, NFL Pick 'Em, Fantasy, and
   Category Blitz for regressions) at 350 px and 289 px card width. Andrew runs `next dev` on :3000 — **don't kill
   it** (`pkill next-server` is banned); use a scratchpad clone or a second port, and screenshot each step. Run
   `npx tsc --noEmit`, `npm run lint`, `npm run test`.

**Out of scope:** copy changes in `lib/venueGameCards.ts`; the trivia games' older layout.

#### Phase 5 — Tutorial code cleanup (findings 4, 6, 8, 9, 10)

**Model / effort:** Sonnet 5.5, **medium.** No visible change intended.

1. **Waiting-game sport (finding 4, `PickEmIllustration` ~line 561).** Add `sport` to `PickEmScene.waiting`
   (`"MLB"` in `PICKEM_SCENE`, `"NFL"` in `NFL_PICKEM_SCENE`), use `scene.waiting.sport`, delete the
   `scene.sport === "NFL" ? … : "MLB"` line and its comment.
2. **Inline styles (finding 6).** In this file, replace every `style={{ fontFamily: "ui-monospace, monospace" }}`
   with `font-mono` (lines ~435, ~510, ~602) and every `style={{ fontFamily: "var(--ht-font-display)" }}` with
   `[font-family:var(--ht-font-display)]` (lines ~114, ~248, ~268, ~343, ~783, ~798, ~818, ~891). Leave the
   remaining `style={{` blocks at ~95, ~177, ~467 only if they carry genuinely dynamic values; if static, convert
   them too. Note in the handoff which ones remain and why.
3. **One Category Blitz art lookup (finding 8).** Add one helper, e.g.
   `const categoryBlitzArtOf = (stepIndex: number) => CATEGORY_BLITZ_TUTORIAL_CARDS[stepIndex]?.art ?? "intro"`;
   compute `art` once in `TutorialStatementPanel`, derive `isIntro` from it and pass it to `GameStepIllustration`
   (or have both call the helper). No second copy of the `?? "intro"` fallback.
4. **Dead scoring data (finding 9).** `GameScoringArtwork` and `GameArtwork` are only reached for `speed-trivia`
   and `live_trivia` now. Narrow `GAME_SCORING` to `Record<"speed-trivia" | "live_trivia", ScoringConfig>` and
   delete the five other entries (the Bingo one says 50 points; the cards say 100). If the `ladder` variant is then
   unused, delete it and its branch. Drop the redundant `&& !statementLayout` from `isHookStep`. **Check first:**
   `GameIdentityPanel` (the exported component, which renders `GameArtwork` for any key) — find its callers
   (`grep -rn "GameIdentityPanel" app components`); if nothing renders it, say so in the handoff and ask Andrew
   before deleting it; if something does with a non-trivia key, keep `GameArtwork`'s fallback.
5. **Duplicate test (finding 10, `tests/lib.category-blitz-how-to-play.test.ts:45`).** Keep only the "trivia games
   keep their step labels" half there; the statement-layout half is owned by
   `tests/tutorial-statement-layout-contract.test.ts` (driven by `usesStatementTutorialLayout`, not a literal list).
6. Run `npx tsc --noEmit`, `npm run lint`, `npm run test` (includes `tests/text-size-floor-contract.test.ts` and
   `tests/fonts-contract.test.ts`). A quick visual spot-check of one card per game confirms nothing moved.

**Out of scope:** the trivia games' tutorial layout; any new art.

#### Phase 6 — One shared player account drawer (finding 7)

**Model / effort:** Sonnet 5.5, **high** (navigation; the venue hub is the native app's root screen).

**Goal:** the drawer shell exists once, so a fix lands in both menus. The two menus' **contents differ** and stay
different: `AccountMenu` (`components/ui/AccountMenu.tsx`) has Profile + Change Username + a username modal; the
venue hub (`components/venue/VenueHubClient.tsx` ~line 1643) has the username/venue/points card + Passkey setup.

1. New `components/navigation/AccountDrawer.tsx`: props `open`, `onClose`, `scrollLockId`, `children`. It owns the
   `fixed inset-0 z-[1200]` wrapper with `data-tp-scroll-lock`, the scrim button ("Close navigation menu"), the
   `aside` (current classes incl. `overflow-y-auto overscroll-contain … pb-[max(1.25rem,env(safe-area-inset-bottom))]`),
   the "Menu" header + Close button, the `setScrollLock(id, open, "modal")` effect, and
   `useNativeBackHandler("overlay", open ? onClose : null)`. Keep the hub's `tp-player-hit-target
   tp-player-pressable` classes on the scrim and Close (decide once for both; they are harmless in `AccountMenu`).
2. `AccountMenu` renders it inside its existing portal; the username modal stays in `AccountMenu` with its own
   native Back handler. The hub renders it in place (no portal today — keep that unless there's a reason).
3. Remove from the hub: its scroll-lock effect (~line 553), its menu `useNativeBackHandler` (~line 1570; **keep**
   the challenge-detail overlay handler and `useNativeBackHandler("exit", minimizeNativeApp)` — the hub is the
   native root and Back minimises), and the inline drawer markup.
4. **Native Back order matters:** the drawer's overlay handler must still beat the hub's `exit` handler. Check
   `tests/native-back-review-fixes.test.ts`, which pins every closable player popup by file — update its list to
   name `AccountDrawer.tsx` instead of the two old sites, deliberately.
5. Add `AccountDrawer.tsx` to the navigation tripwire's host allowlists only if `tests/navigation-controls-contract.test.ts`
   requires it (it must not render `SignOutButton` itself; `AccountMenuList` stays the child that does).
6. Run `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run test:pwa-contract`. Browser-check both menus
   at phone width: open, scroll to Sign Out, page behind doesn't scroll, scrim and Close both close it.

**Out of scope:** changing what either menu contains; the owner `OwnerMenuDrawer`.

#### Phase 7 — Check and commit

**Model / effort:** Sonnet 5.5, **medium.**

1. Run the full gate once more: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run test:pwa-contract`,
   then `npm run build` (never typecheck and build at the same time).
2. Commit (only with Andrew's go-ahead), one commit per phase if not already done. Push/deploy is Andrew's call.
3. Add to `docs/partner-dashboard-app-redesign-device-checklist.md` — or a new short player checklist if Andrew
   prefers — a phone pass: each game's tutorial on an iPhone SE and a normal iPhone (nothing clipped, no "…"
   names), and the venue-hub menu plus an in-game menu scrolling to Sign Out, including Android Back in the app.
4. Update this plan's status line and write `docs/reward-minimum-players-plan_PHASE_7_HANDOFF.md`.

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
