# Phase 5 handoff — tutorial code cleanup

## For Andrew (plain English)
**What changed:** behind-the-scenes tidy-up of the tutorial-card code. Nothing should look different. The waiting
game's sport is now stored with the scene data, inline styles became Tailwind classes, the Category Blitz art
lookup exists once, and unused scoring data for Bingo/Pick 'Em/Fantasy/Category Blitz was deleted.
**Live?** No — uncommitted, not pushed or deployed. No cost impact.
**Left:** Phase 6 (shared account drawer), Phase 7 (final check + commit).
**Needs you:** (1) yes/no on committing the uncommitted tutorial/menu work (still not committed). (2) The exported
`GameIdentityPanel` component has NO callers (only `GameOnboardingCard` etc. are imported elsewhere). I left it
and its `GameArtwork` fallback in place; say so if you want it deleted.

## For the next agent (Phase 6 — one shared player account drawer, finding 7)
You have none of my context. Read `docs/reward-minimum-players-plan.md` Phase 6. Plan names Sonnet 5.5, high effort.

1. **Scope:** Phase 6 only (new `components/navigation/AccountDrawer.tsx`; refactor `AccountMenu` + `VenueHubClient`).
   Out of scope: menu contents, `OwnerMenuDrawer`.
2. **Starting state:** branch `main`, last commit `dfb62f5`. Uncommitted: `CLAUDE.md`, `components/ui/AccountMenu.tsx`,
   `components/venue/GameIdentityPanel.tsx`, `components/venue/VenueHubClient.tsx`, `docs/reward-minimum-players-plan.md`,
   `lib/venueGameCards.ts`, `tests/lib.category-blitz-how-to-play.test.ts`, new `tests/tutorial-statement-layout-contract.test.ts`,
   plus Phase 4/5 handoffs. Never `git checkout -- <file>`/`git restore`. No data/migrations touched.
3. **Decisions:** keep `GameArtwork` (trivia → `TriviaArtwork`, else an empty placeholder) because `GameIdentityPanel`
   is exported; `GAME_SCORING` is `Record<TriviaGameKey, ScoringConfig>`; the `ladder` variant was deleted (unused);
   `isHookStep` is now `stepIndex === 0` (only reached in the non-statement branch).
4. **Files changed (Phase 5), all in `components/venue/GameIdentityPanel.tsx` unless noted:**
   - `PickEmScene.waiting` now has `sport` ("MLB" in `PICKEM_SCENE`, "NFL" in `NFL_PICKEM_SCENE`); `PickEmIllustration` reads it.
   - Every `fontFamily` inline style → `[font-family:var(--ht-font-display)]` or `font-mono`. The static ticket gradient
     (`PETicket`) → Tailwind `bg-[linear-gradient(...)]`. **Remaining `style={{` (2):** the floating "?" marks in the
     two background layers (~lines 95 and 177) — left/top/rotate/font-size are computed per index, so they are
     genuinely dynamic.
   - `categoryBlitzArtOf(stepIndex)` helper (defined just above `GameStepIllustration`) is used by both
     `TutorialStatementPanel` and `GameStepIllustration`.
   - New `TriviaGameKey` type and `isTriviaGameKey` guard; the non-statement branch renders `GameScoringArtwork` only for trivia keys.
   - `tests/lib.category-blitz-how-to-play.test.ts`: the duplicated statement-layout half removed; only the trivia step-label test remains.
5. **Traps:** line numbers in the plan have shifted; search by name. Don't touch `.next`. Andrew runs `next dev` on :3000 — never `pkill next-server`.
6. **Verified:** `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` = 402 files passed / 1 skipped, 4,792 tests
   passed / 13 skipped, 0 failed. **Not done:** browser spot-check (no visual change intended; `font-mono` is Tailwind's
   default mono stack, equivalent to the old `ui-monospace, monospace`), `npm run build`, `npm run test:pwa-contract`.
7. **Open questions:** commit the uncommitted work now? Delete unused `GameIdentityPanel` export?
8. **First steps for Phase 6:** `git status`; read Phase 6 in the plan; look at `AccountMenu.tsx` and `VenueHubClient.tsx`
   (~line 1570 menu back-handler, ~553 scroll lock, ~1643 markup); check `tests/native-back-review-fixes.test.ts`.
