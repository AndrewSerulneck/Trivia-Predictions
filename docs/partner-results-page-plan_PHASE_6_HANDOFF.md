# Partner Results plan — Phase 6 handoff (tutorial cards review fixes)

**Date:** 2026-10-16 · **Plan:** `docs/partner-results-page-plan.md` §7 "Review fixes", Phase 6

## For Andrew (plain English)

- **What changed:** the "tutorial cards once a day" work now behaves the way you described.
  - The 24 hours start when a player **finishes** the cards (taps Play, or Join for Category Blitz) — your Q1 answer.
    Backing out of the cards doesn't count, so they'll see them again next time.
  - Skipping the cards now follows the same rules as the Play button: if Play is locked, the cards show (with the
    locked button); for Bingo, a link to a specific card still opens that card, and the phone's Back button no
    longer bounces the player forward into Bingo again. The Play button now keeps card links too (it used to drop them).
  - Pick 'Em and NFL Pick 'Em no longer show an empty box for a moment on first load. A player who's about to skip
    the cards never sees them flash.
  - Old leftover "seen" entries on players' phones (the per-venue ones) are cleaned up automatically.
- **Is it live?** No. Nothing is committed, pushed or deployed. The original "once a day" work and these fixes are
  all still uncommitted on `main`, together with the Phase 7 files (schedule rows).
- **Needs you:**
  1. Say how to commit: the plan suggests one commit per piece of work — "tutorial cards once a day" (original change
     + these Phase 6 fixes together) and later "schedule rows" (with Phase 7). I didn't commit anything.
  2. The phone check: `docs/game-tutorial-cards-device-checklist.md` (7 short steps).
- **What's left:** Phase 7 (schedule rows; put the Live Games "+ Schedule another game" row back — your Q2 answer).
- **Cost:** none. Everything is in the phone's browser storage — no requests, no database rows.

## For the next agent (Phase 7)

### 1. Goal and scope
Phase 7 in `docs/partner-results-page-plan.md` (F4, F5, F9). **Q2 is answered: (a) put the Live Games
"+ Schedule another game" row back** so Live Games and Rewards match. Do F4/F5 first, then F9 (restore the row in
`components/owner/dashboard/LiveGamesSection.tsx` — see `git diff` on that file for the exact two removed lines; keep
`SectionAddRow`; update `docs/partner-dashboard-app-redesign-plan.md` and add a dated note to
`docs/partner-dashboard-app-redesign-plan_PHASE_3_HANDOFF.md` marking `GAME_PILL_STYLES` superseded). Out of scope:
anything in Results code, the tutorial cards (done here), pushing/deploying.

### 2. Starting state
- Branch `main`, last commit `57d150e` (Results Phase 5). Nothing from Phases 6–7 is committed.
- Uncommitted, tutorial-cards piece (original change + Phase 6): `lib/gameOnboarding.ts`,
  `components/venue/GameLandingExperience.tsx`, `components/venue/VenueHubClient.tsx`,
  `components/category-blitz/CategoryBlitzPlayShell.tsx`, `components/category-blitz/CategoryBlitzGame.tsx`,
  `tests/game-tutorial-once-a-day.test.ts` (new), `tests/components.game-landing-tutorial.test.ts` (new),
  `tests/category-blitz-mobile-shell-contract.test.ts`, `docs/game-tutorial-cards-device-checklist.md` (new),
  this handoff, and the plan doc.
- Uncommitted, schedule-rows piece (Phase 7's input, untouched by me): `lib/ownerScheduleDisplay.ts`,
  `components/owner/schedule/ScheduleGameRow.tsx`, `components/owner/dashboard/LiveGamesSection.tsx`,
  `tests/lib.owner-schedule-display.test.ts`, `tests/components.owner-schedule-flow.test.ts`.
- No data touched, no migrations, no env vars.
- **Never `git checkout`/`restore` these files** — it wipes the uncommitted original work (it happened once).
  Andrew hasn't yet said how to commit; ask before committing (plan §7 "Review fixes" preamble).

### 3. Decisions made
- Q1 (Andrew, 2026-10-16): the clock starts when the player **finishes** the cards. Recorded only by Play
  (`enterGame("tap")` in `GameLandingExperience`) and Join (`joinCategoryBlitzFromOnboarding` in `VenueHubClient`).
- Q2 (Andrew, 2026-10-16): put the Live Games add row back.
- A skip never records a showing (plan F1/F3).
- The `tp_onboarding_*` sweep runs inside `markTutorialSeen` (at most once a day per game).

### 4. What I built (Phase 6)
- `lib/gameOnboarding.ts` — all `const` arrows (F6). Exports `TUTORIAL_REPEAT_AFTER_MS`, `TUTORIAL_SKIP_ATTRIBUTE`
  (`"data-tutorial-skip"`), `tutorialSeenStorageKey`, `markTutorialSeen` (also deletes every `tp_onboarding_*` key,
  F7), `hasSeenTutorialRecently`, and `tutorialSkipScript(gameKey)` — the inline pre-paint script, built from the same
  key builder and constant (F2).
- `components/venue/GameLandingExperience.tsx`:
  - `enterGame(source: "tap" | "skip")` (F1): `playDisabled` → nothing; tap → `markTutorialSeen`; `playHref` →
    `router.replace` (skip) / `router.push` (tap) of `withCurrentQuery(playHref)` (appends `window.location.search`
    unless the href already has a `?`); otherwise skip = straight to playing, tap = the 300 ms exit animation.
    `handlePlayClick` is just `enterGame("tap")`.
  - First paint (F2): `isClientMount` = `useSyncExternalStore(noop, () => true, () => false)` — false on the server and
    while hydrating, true for a client-side mount (venue home → game). On a client-side mount the skip is decided in
    the first render (`skipOnMount`), so no cards flash. On the server render the cards are rendered again for
    `autoResume={false}` hosts (`isResumeCheckPending` starts `!initialPlaying && (autoResume || skip-to-playHref)`),
    and their wrapper carries `<script>` (only while `!isClientMount`, so React never creates a script on the client),
    `suppressHydrationWarning`, a ref and `data-[tutorial-skip]:invisible`. The mount effect then decides: skip →
    `enterGame("skip")`; otherwise it removes the attribute (so cards that stay, e.g. Play locked, become visible) and
    runs the resume check as before. `autoResume` hosts keep "Restoring your active game..." while pending.
  - The `isShowingTutorial` effect is gone (F3).
- `components/venue/VenueHubClient.tsx` — the early `markTutorialSeen("category-blitz")` in `goTo` is gone; Join records it (F3).
- Tests: `tests/game-tutorial-once-a-day.test.ts` (wording; legacy-key sweep; script ↔ `hasSeenTutorialRecently`
  parity across 7 cases; script swallows storage errors; F8 tripwire walking `app/` + `components/` with an allowlist
  of exactly the two hosts; Join-only check for venue home). `tests/components.game-landing-tutorial.test.ts` (9
  cases: server HTML has the cards + script; client-mount skip without recording; `playDisabled` shows locked cards;
  skip with `playHref` replaces with the query; Play with `playHref` pushes with the query and records; Back on card 1
  records nothing; Play records exactly once; hydration skip; hydration with Play locked removes the hide).

### 5. Facts and traps
- `/bingo` (playHref `/bingo/home`, `autoResume` default true) server-renders "Restoring your active game..." not the
  cards, so the pre-paint script only matters for `/pickem` and `/nfl-pickem` today; it's written generally.
- `TriviaAppFrame` passes `initialPlaying` with `playDisabled`, so the mount effect returns early there.
- The mount effect's deps now include `playDisabled`/`enterGame`; a flip of `playDisabled` while the cards are open
  re-runs it (harmless: re-check, possibly enter the game if recently finished).
- No CSP exists today (`next.config.ts`, `proxy.ts`). If one is added, the inline script needs a nonce/hash.
- The test files are `.test.ts`, so they use `createElement`, not JSX.
- Don't run `npx tsc --noEmit` at the same time as `npm run build` (`.next/types`).

### 6. Build / test / verified
All run 2026-10-16 after the changes: `npx tsc --noEmit` clean; eslint clean on the touched files;
`npm run test` 401 files / 4,766 pass / 13 skipped / 0 fail; `npm run test:pwa-contract` 20/20; `npm run build`
exit 0, and the built CSS contains `[data-tutorial-skip]{visibility:hidden}`. No React warnings in the component tests.
**Unverified:** real phones (`docs/game-tutorial-cards-device-checklist.md`, Andrew only); a real browser pass —
headless jsdom covers the logic, not the paint timing.

### 7. Open questions for Andrew
- How to commit (one commit per piece of work, as the plan suggests?). Nothing is committed.

### 8. Recommended first steps (Phase 7 — Claude Sonnet 5.5, effort medium)
1. `git status` / `git diff` the five schedule-rows files. Don't touch the tutorial-cards files.
2. F4 (`scheduleRowDetail` whole-word, case-insensitive title check + tests incl. "Live Triviathon"), F5 (pass the
   row's window in), then F9 with Q2 = (a).
3. `npm run test`, lint, typecheck, build. Write `docs/partner-results-page-plan_PHASE_7_HANDOFF.md` and update the plan's status line.
