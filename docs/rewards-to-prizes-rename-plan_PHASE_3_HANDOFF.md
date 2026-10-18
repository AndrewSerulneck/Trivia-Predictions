# Rewards → Prizes rename — Phase 3 handoff (Partner Dashboard copy + `?sheet=prizes`)

Plan: `docs/rewards-to-prizes-rename-plan.md`. Phase 3 done 2026-10-18.

## Summary for Andrew (plain English)
- **What changed:** everything a *partner* reads on the Partner Dashboard now says "Prize": the dashboard card
  is **Offer Prizes**, the slide-up sheet is **Prizes** ("Your prizes", "Ended prizes", "End prize"), the
  create wizard ends with **Create Prize**, Results says "Prizes won at this game", Point of Sale says "Prizes at
  the register", and every rules sentence and error message in the create flow was reworded so it never says
  "prize" twice. The admin panel's Create wizard is the same component, so its wording moved too (only wording;
  checked).
- **The link:** the dashboard address is now `?sheet=prizes`. Old links that say `?sheet=rewards` (in sent emails
  and bookmarks) still open the same screen, forever; the address bar quietly switches to the new word.
- **Live?** No. One local commit, not pushed or deployed. Per plan, deploy only after Phase 5.
- **What's left:** Phase 4 (admin panel, partner emails, Partner Manual, marketing, legal), Phase 5 (lock the test,
  docs, phone checklist).
- **Needs you:** nothing now. On your phone pass, please read the "Remove this prize" screen (table below); it is
  the sentence most changed in meaning-preserving rewording.

### Every on-screen sentence changed
| Where | Before | After |
|---|---|---|
| Dashboard card | Offer Rewards · Offer a reward · Loading rewards | Offer Prizes · Offer a prize · Loading prizes |
| Dashboard empty state | Offer your guests a reward / Give a prize to top players, like a free appetizer for tonight's trivia winner. | Offer your guests a prize / Like a free appetizer for tonight's trivia winner. |
| Dashboard add row | + Offer another reward | + Offer another prize |
| Dashboard load error | Couldn't load your rewards. | Couldn't load your prizes. |
| Dashboard notice button | View Rewards | View Prizes |
| Toast after scheduling a game | Now offer a reward for it → | Now offer a prize for it → |
| Toast after creating | Live Trivia Challenge reward created / Reward created | Live Trivia Challenge prize created / Prize created |
| Menu → Results hint | Games, winners & rewards | Games, winners & prizes |
| Point of Sale sheet eyebrow | Rewards at the register | Prizes at the register |
| Results game screen | Rewards won at this game | Prizes won at this game |
| Row hint | Tap to see reward details | Tap to see prize details |
| Sheet title | Rewards / Offer a reward | Prizes / Offer a prize |
| Sheet list | Your rewards · No rewards running. · + Offer another reward · Ended rewards · No ended rewards yet. · Loading your rewards… | Your prizes · No prizes running. · + Offer another prize · Ended prizes · No ended prizes yet. · Loading your prizes… |
| Detail button | End reward | End prize |
| Remove screen | Checking prizes… | Checking who has won it… |
| | No prizes have been awarded from this reward yet, so nothing players hold is affected. | Nobody has won it yet, so no player loses anything. |
| | This reward has awarded **3** prizes, and **2** are still unredeemed in players' wallets. / …, all of which have already been redeemed. | It has been won **3** times, and **2** are still unredeemed in players' wallets. / …, and every one has already been redeemed. |
| | Archive — stop it, keep prizes / The reward stops running. Every prize already awarded still works. | Archive — stop it, winners keep theirs / The prize stops running. Every one already won still works. |
| | Removes the reward for good (and voids 2 unredeemed prizes). Prizes already redeemed stay in your records. | Removes the prize for good (and voids the 2 not yet redeemed). Ones already redeemed stay in your records. |
| After removing | Reward archived. Prizes already awarded still work. · Reward deleted. (3 already-redeemed prizes kept for your records.) | Prize archived. Ones already won still work. · Prize deleted. (The 3 already redeemed stay in your records.) |
| Discard guard / errors | Discard this reward? · Couldn't check this reward's prizes. · Couldn't remove/create that reward. | Discard this prize? · Couldn't check who has won this prize. · Couldn't remove/create that prize. |
| Wizard (owner + admin) | Which game should the reward be tied to? / Create Reward · How is this reward won? · Offer this reward to the winner of any Live Trivia game · …to pick games for this reward. · Confirm row "Reward" · button Create Reward | Which game is this prize for? / Create Prize · How is this prize won? · Offer this prize to the winner… · …to pick games for this prize. · Confirm row "Game" · button Create Prize |
| Terms sentence | I want to give out / make 3 of these rewards (available) every week. | …3 of these prizes (available) every week. |
| Terms errors | …offer a recurring reward. · …a fixed number of "winner of the game" rewards per week. · …at most 2 "winner of the game" rewards per week. · …so this reward gives out exactly 2 per week. · …a "winner of the game" reward for one game is worth exactly 1 prize. · Choose between 1 and N rewards. | …a recurring prize. · …"winner of the game" prizes per week. · …at most 2 "winner of the game" prizes per week. · …so this prize goes to exactly 2 winners per week. · …a "winner of the game" prize for one game goes to exactly 1 winner. · Choose between 1 and N prizes. |
| Game picker | …gets/get this reward — 3 per week. · Winner of your Friday Live Trivia game gets this reward. · Choose at least one Live Trivia game to offer this reward at. · A reward can cover your weekly games or a single one-off game, not both. Create a separate reward for the one-off game. · You can only offer this reward at one one-off game… | same sentences with "prize" |
| NFL wizard | Choose whether this reward runs… · …a "most correct picks" reward is worth exactly 1 prize. Use a picks target to hand out more. · …no weeks left to run this reward. · …wins/win this reward (all six scope sentences) | …this prize runs… · …a "most correct picks" prize has exactly 1 winner. Use a picks target to have more winners. · …run this prize. · …wins/win this prize. |
| Server refusals (`lib/rewards.ts`) | Unknown reward type. · Schedule Live Trivia to create a Live Trivia reward. · That competition cadence isn't available for this reward. · This reward can't be offered to the winner of the game / top players of the week. · Choose a valid prize for this reward. · A prize for each place is only for a top-players-this-week reward. · A minimum number of players is only for a reward where players compete for the top spot. | Unknown prize type. · …a Live Trivia prize. · …for this prize. · This prize can't be offered to… · Choose what the winner gets. · A prize for each place works only with Top players this week. · …works only for a prize where players compete for the top spot. |
| Schedule-change notice | 2 rewards pinned to this game were retired… · 1 reward now covers fewer games. | 2 prizes pinned… · 1 prize now covers fewer games. |
| Other | Weekly places reward. (terms lead, no places) · That reward wasn't found. · Failed to create reward. · Failed to resolve reward context. · Failed to load the reward's / venue's reward winners/weeks/coupons. | Weekly places prize. · That prize wasn't found. · Failed to create prize. · Failed to load this prize's options. · …the prize's / venue's prize winners/weeks/coupons. |

## For the next agent (Phase 4: admin, emails, Partner Manual, marketing & legal — Sonnet 5.5, medium)

1. **Goal/scope:** plan §4 Phase 4 — every `phase: 4` entry in `tests/prizes-wording-contract.test.ts`
   (`grep -c '"phase":4' tests/prizes-wording-contract.test.ts` → 49 entries today), plus the pictures flagged in the
   Phase 1 handoff. **`/rules` is the official contest rules page: list every changed sentence in your handoff for
   Andrew to read.** Out of scope: code identifiers, API routes/JSON keys (`resource=rewards`, `/api/owner/rewards`),
   DB, dated plan/handoff docs, Phase 5's lock + glossary.
2. **Starting state:** branch `main`. Commits: `d3130a6` (Phase 1), `4847675` (Phase 2), then the Phase 3 commit
   "feat(wording): Partner Dashboard Rewards → Prizes + ?sheet=prizes (Phase 3)". Nothing pushed or deployed. No
   data touched, no migrations.
3. **Decisions (stay consistent):** plan §2 (Andrew, 2026-10-18), not to be re-asked. Phase 3 choices:
   - The offer is a **Prize**; what a winner holds is described as "won" / "one" / "it", never a second "prize"
     (e.g. "Prize archived. Ones already won still work.", "Choose what the winner gets.").
   - Wizard confirm row label is **"Game"** (value = definition name, e.g. "Live Trivia Challenge"); the row under it
     stays **"Prize"** (what the winner gets).
   - Partner Manual must match the dashboard words: card **Offer Prizes**, button **Create Prize**, sheet **Prizes**.
     `tests/owner-dashboard-contract.test.ts:157` still pins `"Tap Offer Rewards on your dashboard"` in
     `lib/partnerManual.ts` — change both together in Phase 4.
   - Admin `ChallengesSection.tsx` hosts the same `CreateRewardWizard`, so its wizard wording already changed; only its
     own section strings ("New Reward", "Reward created.", "Back to reward list", "Edit Reward", "Rewards" tab etc.) are
     Phase 4.
4. **Files changed:**
   - URL: `lib/ownerSheetParams.ts` — sheet id `rewards` → `prizes` in `OWNER_SHEET_IDS`; `SHEET_ID_ALIASES =
     { rewards: "prizes" }` read in `parseSheetParam` (via `Object.hasOwn`, so `__proto__`/`constructor` never match).
     Because `useOwnerSheet` and `normalizeLandedSheet` both go through `parseSheetParam`, an old bookmark opens the
     sheet and the landed entry is rewritten to `?sheet=prizes` (never written back). Call sites:
     `app/owner/dashboard/page.tsx` (`openSheet("prizes", …)`), `components/owner/rewards/RewardsFlow.tsx`,
     `app/owner/competitions/page.tsx` (redirect → `?sheet=prizes`).
   - Results step: `components/owner/results/ResultsSheet.tsx` — screen `reward` → `prize`; `screenOfStep()` reads
     `reward` as `prize`. (The step needs in-memory selection, so a reloaded old URL still corrects to the list.)
   - Copy: `app/api/owner/rewards/{route,context/route}.ts`, `components/owner/dashboard/{RewardsSection,DashboardNotice,
     DashboardToast}.tsx`, `components/owner/menu/ownerMenuItems.ts`, `components/owner/pos/PosConnectionsSheet.tsx`,
     `components/owner/results/GameStandingsScreen.tsx`, `components/owner/rewards/{RewardRow,RewardStepScreens,
     RewardsFlow}.tsx`, `components/rewards/CreateRewardWizard.tsx`, `lib/{nflPickEmRewardWeeks,ownerHistory,
     ownerRewardFlow,ownerRewardRequests,rankedPlaceRewards,rewardGameSlotCascade,rewardGameSlots,rewardTerms,rewards}.ts`,
     `lib/results/rewardSource.ts`.
   - Tests: new alias tests in `tests/lib.owner-sheet-params.test.ts` (old id read forever; inherited keys refused; an
     old `?sheet=rewards&step=detail` bookmark lands on `?sheet=prizes&step=detail`, phone Back steps, Close pops; a
     reload mid-flow on an old entry), `tests/lib.use-owner-sheet.test.ts` (hook reports `prizes` and rewrites the URL),
     `tests/components.owner-results-sheet.test.ts` (old `reward` step). Copy pins updated in 13 more test files and
     the admin wizard snapshot (`tests/__snapshots__/components.create-reward-wizard.test.ts.snap`; diffed token by
     token: only the 7 wording changes moved, no markup/class change).
   - Allowlist: 94 `phase: 3` entries deleted; 14 re-tagged `keep` with a reason: sweep/cron/backfill-only errors in
     `lib/liveTriviaRankedRewards.ts` (6), `lib/liveTriviaWinnerRewards.ts`, `lib/nflPickEmWinnerRewards.ts`,
     `lib/rankedRewardBackfill.ts`, `lib/rewardGameSlotCascade.ts` ("Failed to update reward."),
     `lib/challengeCampaigns.ts` ("Failed to load ranked-place rewards.") — all go to cron reports/logs, same rule
     Phase 1 applied to their siblings; plus code tags `app/owner/dashboard/page.tsx` `list: "rewards"`,
     `lib/results/resultsDisplay.ts` `kind: "reward"`, and the Results alias literal `"reward"` in `ResultsSheet.tsx`.
     `grep -c '"phase":3' tests/prizes-wording-contract.test.ts` → 0.
5. **Traps:**
   - The scanner sees literals only; a literal reworded must have its allowlist entry deleted in the same change
     (the stale-entry test fails otherwise). Template literals are split into head/middle/tail pieces.
   - `lib/email/` has no `sheet=rewards` link (grepped 2026-10-18); emails link to `/owner/dashboard` or not at all.
   - `npm run email:preview` writes preview HTML; never `npm run prize-card:render -- --email` (overwrites
     `public/brand/email/*`, which are cached for a year).
6. **Verified (2026-10-18):** `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` 404 files passed /
   1 skipped, **4,807 passed** / 13 skipped / 0 failed (Phase 2: 4,801; +6 new alias tests). `owner-menu-contract`,
   `owner-dashboard-contract`, `results-registry-contract` pass. **Not verified:** `npm run build` (copy + a pure
   URL-parse change; Phase 5 runs it), a real browser/phone pass of the dashboard and wizard (Phase 5 checklist: add
   "old `?sheet=rewards` bookmark" and the Remove screen). `/verify` was not run: it covers venue game pages only.
7. **Open questions for Andrew:** none new (Media Kit HTML from Phase 1 still his call, Phase 4).
8. **First steps for Phase 4:** `grep '"phase":4' tests/prizes-wording-contract.test.ts`; start with
   `lib/partnerManual.ts` + `tests/owner-dashboard-contract.test.ts:157` together, then `lib/email/partnerEmailCopy.ts`
   (`npm run email:preview` and look), admin `ChallengesSection.tsx` / `adminSectionMeta.ts`, `app/info/page.tsx`
   (keep the verb uses), `llms.txt`, then legal (`/rules`, `/terms`, `/privacy`, `/support`, `/delete-account`,
   `DeleteAccountPanel.tsx`). Gates: tsc, lint, `npm run test`. Commit locally; do not push or deploy.
