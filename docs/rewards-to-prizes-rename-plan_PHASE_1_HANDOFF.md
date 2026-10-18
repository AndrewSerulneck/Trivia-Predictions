# Rewards → Prizes rename — Phase 1 handoff (inventory + tripwire)

Plan: `docs/rewards-to-prizes-rename-plan.md`. Phase 1 done 2026-10-18.

## Summary for Andrew (plain English)
- **What changed:** nothing a player or partner can see. I added an automatic test that finds every place the
  word "Reward(s)" appears in on-screen text (229 spots in 68 files) and lists each one with the phase that will
  reword it, or "keep" (code names, server logs, the verb "rewards quick thinking", Toast's own button).
- **Live?** No. Nothing is pushed or deployed. Local commit only.
- **What it guards:** a *new* on-screen "Reward" now fails `npm run test`, so the old word can't creep back in
  while the rename is under way.
- **Pictures:** the 8 `public/info/*.png` screenshots and the design-system screenshots show no "Reward" text, so
  nothing needs re-capturing. One thing outside the code: `public/brand/Hightop Challenge - Advertiser Media Kit
  (Standalone) (4).html` says "Built-In Rewards Loop" and "Rewards loop". It is a standalone sales file, not linked
  from the app. Your call whether to change it (Phase 4 can do it).
- **Needs you:** nothing for Phase 2.

## For the next agent (Phase 2: player-facing copy, Opus 5.5, medium)

1. **Goal/scope:** reword the player-facing entries tagged `phase: 2` in `tests/prizes-wording-contract.test.ts`
   (42 entries), per plan §4 Phase 2. Out of scope: Partner Dashboard, admin, emails, manual, marketing, legal
   (Phases 3–4); code identifiers, routes, DB.
2. **Starting state:** branch `main`, based on `6d314a0`; Phase 1 is one local commit on top. Not pushed, not
   deployed. No data touched. `docs/rewards-to-prizes-rename-plan.md` is committed with this phase.
3. **Decisions already made:** all in plan §2 (reword each sentence, never find-and-replace; player panel
   "Prizes", menu keeps "Redeem Prizes"; point-claim wording becomes about points/wins). Andrew answered Q1: no
   store listings, merch, decks or posts say "Rewards". Q2: do NOT rename code later. Don't re-ask.
4. **Files created:**
   - `tests/helpers/rewardWordingScan.ts`: TypeScript-compiler scan of string/template literals and JSX text in
     `app/`, `components/`, `lib/` (+ `llms.txt` lines). Case-insensitive `\brewards?\b`. Identifiers, imports and
     comments never match. Whitespace is squashed.
   - `tests/prizes-wording-contract.test.ts`: the `ALLOWED` list (`{file, text, phase|"keep", reason?}`). Four tests:
     no new hit; no stale entry (an entry matching nothing FAILS, so delete entries as you reword them); every
     `keep` has a reason; scanner self-test.
5. **Traps:**
   - Entries match by exact file + exact squashed literal text. Rewording a sentence changes its text, so delete
     its entry in the same change (the stale-entry test tells you).
   - Several literals are NOT copy but ids (`"rewards"` sheet id, step `"reward"`, DOM ids, API paths, JSON keys).
     Those tagged `phase: 3` (sheet/step ids, `?sheet=rewards` → `prizes` with a permanent alias) wait for Phase 3.
   - Entries `lib/prizeCardFace.ts` `REWARD` label → `PRIZE` (type `PrizeCardLabel` too) is Phase 2. Run
     `npm run prize-card:render`; never overwrite `public/brand/email/*`.
   - `lib/challengeCampaigns.ts` has two hits: "Failed to load rewards." is phase 2, the ranked-place one phase 3.
   - Tests asserting changed copy (text match against allow-list entries; approximate): Phase 2:
     `components.prize-wallet-card`, `components.venue-challenges-panel-ranked`, `lib.nfl-pickem-reward-accrual`,
     `lib.nfl-pickem-winner-rewards`, `lib.ranked-places-reward-create`, plus
     `components.venue-hub-shared-reward-helpers`. Phase 3 (many): `components.create-reward-wizard` (+ its
     snapshot `tests/__snapshots__/components.create-reward-wizard.test.ts.snap`, shared with admin),
     `components.owner-rewards-flow`, `lib.reward-terms`, `lib.reward-game-slots`, `lib.reward-slot-cascade`,
     `lib.owner-reward-flow`, `lib.owner-sheet-params`, `lib.use-owner-sheet`, `owner-dashboard-contract`,
     `owner-menu-contract`, `components.owner-results-sheet`, `lib.results-display`, `lib.results-timeline`,
     `lib.nfl-pickem-reward-weeks`, `lib.live-trivia-ranked-rewards`, `app.owner-dashboard-*`, and more (rerun
     `grep -rl` on the new wording). Phase 4: `components.partner-manual-prizes`, `info-partner-login-contract`.
   - Design-system files with "reward" (living docs, Phase 5/4): `project/README.md:279` ("GIFT CARD"/"REWARD"
     label, follows the card change), `ui_kits/web/components.jsx:462`, `ui_kits/web/index.html:97`,
     `preview/component-hamburger-drawer.html:131`. These mirror `AccountMenuList` / `venueGameCards` copy, so keep
     them in step with Phase 2's wording.
   - The scan covers only `app/ components/ lib/ llms.txt`. Not covered: `scripts/*.cjs` (dev tools),
     `public/brand/…Media Kit….html`, `native/`. None found with player copy besides the Media Kit.
6. **Build/test:** `npx tsc --noEmit`, `npm run lint`, `npm run test` (Vitest), plus `npm run test:god-mode-join`
   for the Phase 2 JoinFlow edit. Phase 1 results: tsc clean, eslint clean on the new files, full Vitest
   404 files passed / 1 skipped, 4,801 tests passed / 13 skipped / 0 failed. `npm run lint` over the whole repo and
   `npm run build` were not run (test-only change).
7. **Open questions for Andrew:** only the Media Kit HTML (above), not blocking.
8. **First steps:** read plan §2 and the `phase: 2` entries (`grep '"phase":2' tests/prizes-wording-contract.test.ts`);
   reword file by file, delete each entry, update pinned tests, run the gates, check tutorial cards at 350 px and
   289 px, commit locally, write the Phase 2 handoff. Do not push or deploy until Phase 5.
