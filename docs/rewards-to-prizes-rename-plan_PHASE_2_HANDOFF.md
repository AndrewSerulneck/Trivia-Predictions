# Rewards → Prizes rename — Phase 2 handoff (player-facing copy)

Plan: `docs/rewards-to-prizes-rename-plan.md`. Phase 2 done 2026-10-18.

## Summary for Andrew (plain English)
- **What changed:** every place a *player* read "Reward" now says "Prize" (or, for Bingo / Pick 'Em / Fantasy
  point claims, talks about points and wins). The venue-home tab and panel are **Prizes**, the gift card's small
  label says **PRIZE** instead of REWARD, the FAQ, NFL Pick 'Em banner and leaderboard, Redeem Prizes page and
  error messages are reworded.
- **Live?** No. One local commit, not pushed or deployed. Per plan, deploy only after Phase 5.
- **What's left:** Phase 3 (Partner Dashboard + `?sheet=prizes` link), Phase 4 (admin, emails, Partner Manual,
  marketing, legal), Phase 5 (lock the test, docs, phone checklist).
- **Needs you:** nothing now. On your phone pass (Phase 5 checklist) please glance at the sentences listed below.

### Every on-screen sentence changed
| Where | Before | After |
|---|---|---|
| Venue home tab (`VenueHubHeaderBar`) | Rewards | Prizes |
| Venue home panel heading | Rewards / Active · 3 Rewards | Prizes / Active · 3 Prizes |
| Venue home empty state | No active rewards for this venue yet. | No prizes at this venue yet. |
| Venue home won card | Prize won! Tap to Claim Reward. | Prize won! Tap to claim it. |
| Multi-winner line | 2 of 3 rewards left | 2 of 3 prizes left |
| Close button (screen reader) | Close reward details | Close prize details |
| Menu → Redeem Prizes hint | See earned rewards and prize redemptions. | See the prizes you have won and redeem them. |
| Redeem Prizes empty list | No prizes yet. Win a Reward here and it will show up in this list. | No prizes yet. Win one here and it will show up in this list. |
| Gift card label / fallback title | REWARD / "Reward" | PRIZE / "Prize" |
| `ChallengeRedeemPanel` | Active Rewards · Claim your reward wins. Each prize can only be redeemed once. · No redeemable reward wins found for this venue. | Active Prizes · Claim the prizes you have won. Each one can be redeemed only once. · No prizes to redeem at this venue. |
| NFL banner | … · Details in Rewards | … · Details in Prizes |
| NFL leaderboard | Won this week's reward(: X) · No reward this week — fewer than N players… | Won this week's prize(: X) · No prize this week — fewer than N players… |
| Weekly champion default text | …to claim this week's venue champion reward. / …to earn this venue's reward. | …to win this week's venue champion prize. / …to win this venue's prize. |
| FAQ | What are Rewards…? · Rewards are goals set by your venue… you win the prize tied to that reward… · …its own Rewards… the 'Rewards' panel… | What are Prizes…? · Prizes are offered by your venue. Each one has a goal, like '…' Reach the goal and you win it — a discounted menu item or a gift card. · …its own. … the 'Prizes' panel… |
| Bingo/Pick 'Em collect (Activity) | Claimed 2 Bingo rewards for +100 points. · No Bingo rewards were claimed… · Failed to claim Bingo reward. (same for Pick 'Em) · Pick 'Em rewards were already claimed. | Collected 2 Bingo wins for +100 points. · No Bingo points were collected… · Couldn't collect your Bingo points. · Those Pick 'Em points were already collected. |
| Bingo notification / error | …Bingo Board won! Claim your reward. · This Bingo reward was already claimed or is not eligible yet. | …Bingo Board won! Collect your points. · These Bingo points were already collected or are not ready yet. |
| Fantasy errors | Fantasy rewards can only be claimed after the game is final. · This entry does not have a reward to claim. · Failed to claim fantasy reward. | Fantasy points can be collected only after the game is final. · This entry has no points to collect. · Couldn't collect your fantasy points. |
| Bingo rules list | -Click "Collect Points" to claim your reward | -Click "Collect Points" to add them to your score |
| NFL tutorial card | …check the rewards tab to see if your venue offers a prize for NFL Pick 'Em! | …check the Prizes tab to see if your venue offers one for NFL Pick 'Em! |
| API errors | Failed to load NFL Pick 'Em rewards · Failed to load rewards. | …prizes · Failed to load prizes. |

## For the next agent (Phase 3: Partner Dashboard copy + `?sheet=prizes`, Opus 5.5, high)

1. **Goal/scope:** plan §4 Phase 3: every `phase: 3` entry in `tests/prizes-wording-contract.test.ts`
   (`grep '"phase":3' tests/prizes-wording-contract.test.ts`), plus the sheet id `rewards` → `prizes` and Results
   step `reward` → `prize`, with the old values accepted forever as aliases. Out of scope: admin, emails, Partner
   Manual, marketing, legal (Phase 4); code identifiers, API routes, DB.
2. **Starting state:** branch `main`. Commits: `d3130a6` (Phase 1), then the Phase 2 commit
   "feat(wording): player-facing Rewards → Prizes (Phase 2)" on top. Nothing pushed or deployed. No data touched.
3. **Decisions:** plan §2 (Andrew, 2026-10-18), not to be re-asked. Phase 2 choices worth staying consistent with:
   - Player tab/panel = **Prizes**; menu keeps **Redeem Prizes**.
   - Point claims talk about **points / wins / collect**, never "prize" (a prize is a venue-offered item).
   - "prize prize" avoided with "one"/"it" ("Win one here", "offers one for NFL Pick 'Em").
   - `PrizeCardLabel` type is now `"GIFT CARD" | "PRIZE"`; aria label for the fallback headline "Prize" is just
     "Prize" (no "Prize prize"), see `ariaLabelOf` in `lib/prizeCardFace.ts`.
4. **Files changed (copy only, no logic):** `app/api/nfl-pickem/rewards/route.ts`, `app/faqs/page.tsx`,
   `components/activity/ActiveGamesPanel.tsx`, `components/challenges/ChallengeRedeemPanel.tsx`,
   `components/join/JoinFlow.tsx`, `components/navigation/AccountMenuList.tsx`,
   `components/nfl-pickem/NFLPickEmLeaderboard.tsx`, `components/nfl-pickem/NFLPickEmRewardBanner.tsx`,
   `components/prizes/PrizeWalletPanel.tsx`, `components/prizes/SquareGiftCardPanel.tsx` (comment),
   `components/venue/{VenueChallengesPanel,VenueHubClient,VenueHubHeaderBar,venueHubShared}.tsx`,
   `lib/{challengeCampaigns,competition,fantasy,prizeCardFace,sportsBingo,venueGameCards}.ts`; design-system mirrors
   (`project/README.md` label, `ui_kits/web/components.jsx`, `ui_kits/web/index.html`,
   `preview/component-hamburger-drawer.html`). Tests updated: `components.prize-card`, `components.prize-wallet-card`,
   `components.square-gift-card-ui`, `components.venue-challenges-panel-ranked`,
   `components.venue-hub-shared-reward-helpers`, `lib.prize-card-face`, `lib.ranked-places-reward-create` (title),
   and all 42 `phase: 2` entries removed from `tests/prizes-wording-contract.test.ts`.
5. **Traps:**
   - `lib/rewardDescription.ts` and `lib/rewardDefinitions.ts` guest templates had no scanner hits; nothing to do there.
   - `lib/challengeCampaigns.ts` "Failed to load ranked-place rewards." is still `phase: 3`.
   - The scanner matches the exact squashed literal; reword → delete the entry in the same change (the stale-entry
     test fails otherwise). Template literals split into head/middle/tail pieces, so an entry like `"Reward"` can be
     the middle of a template.
   - `npm run prize-card:render` without `--out` writes `tmp/`; never use `--email` (would overwrite
     `public/brand/email/*`). Phase 2 rendered to the scratchpad only.
6. **Verified (2026-10-18):** `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` 404 files passed /
   1 skipped, 4,801 tests passed / 13 skipped / 0 failed; `npm run test:god-mode-join` 6 files / 59 tests passed;
   prize-card specimen rendered and looked at (PRIZE label fits every state). **Not verified:** the tutorial cards at
   350 px / 289 px on a device (the Bingo rules bullet grew ~5 characters; the NFL step body got shorter), and
   `npm run build` (not run, copy-only change). Both go on the Phase 5 phone checklist.
7. **Open questions for Andrew:** none new (Media Kit HTML from Phase 1 still his call, Phase 4).
8. **First steps for Phase 3:** read plan §2 and §4 Phase 3; start with `lib/ownerSheetParams.ts` (sheet id alias +
   tests: old `?sheet=rewards&step=detail` opens the same screen, phone Back still steps/closes via
   `lib/useOwnerSheet.ts`), then the wizard sentences in `lib/rewardTerms.ts` / `lib/rewardGameSlots.ts` (shared
   with admin: the `components.create-reward-wizard` snapshot will change — confirm only wording moved). Grep
   `lib/email/` for `sheet=rewards`. Gates: tsc, lint, `npm run test` (incl. `owner-menu-contract`,
   `owner-dashboard-contract`, `results-registry-contract`). Commit locally; do not push or deploy.
