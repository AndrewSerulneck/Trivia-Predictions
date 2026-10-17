# Phase 6 handoff — one shared player account drawer

## For Andrew (plain English)
**What changed:** the slide-out player menu (the "Menu" panel with Sign Out at the bottom) used to exist as two
hand-copied versions — one on the venue home screen, one inside games. It is now one shared component, so a fix
lands in both. Nothing should look or behave differently; I also deleted the unused `GameIdentityPanel` component
(your "yes") and committed the tutorial/menu work as its own commit (`274c26c`).
**Live?** No — committed locally on `main`, not pushed or deployed. No cost impact.
**Checked:** both menus in a real phone-size browser (375 px wide): open, scroll down to Sign Out, page behind is
locked, the dark area and the Close button both close it, and the Change Username pop-up still shows and takes typing.
**Not checked:** Android Back inside the real app (covered by an automated test only) — add to the phone pass.
**Left:** Phase 7 (final full check + `npm run build`, the phone checklist, wrap-up). **Needs you:** nothing blocking.

## For the next agent (Phase 7 — check and commit)
You have none of my context. Read `docs/reward-minimum-players-plan.md` Phase 7. Plan names Sonnet 5.5, medium effort.

1. **Scope:** Phase 7 only: full gate (`npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run test:pwa-contract`,
   THEN `npm run build` — never typecheck and build concurrently), add the phone pass to
   `docs/partner-dashboard-app-redesign-device-checklist.md` (or a new short player checklist), update the plan status
   line, write `…_PHASE_7_HANDOFF.md`. Out of scope: push/deploy (Andrew's call), menu contents.
2. **Starting state:** branch `main`. `274c26c` = tutorial cards + menu scroll fix + Phase 4/5 work + deletion of the
   unused `GameIdentityPanel` export/`GameArtwork`. Phase 6 is the commit after it (check `git log -3`). Nothing pushed.
   No data/migrations touched. Never `git checkout -- <file>`/`git restore`.
3. **Decisions:** Andrew said delete `GameIdentityPanel` (done) and "whatever you think is best" on committing (I
   committed). Scrim/Close in both menus now carry `tp-player-hit-target tp-player-pressable` (plan: decide once).
4. **Files:** NEW `components/navigation/AccountDrawer.tsx` (props `open`, `onClose`, `scrollLockId`, `children`; owns
   wrapper, scrim "Close navigation menu", `aside`, "Menu" header + Close, `setScrollLock(id, open, "modal")`,
   `useNativeBackHandler("overlay", open ? onClose : null)`; stays mounted when closed so it slides).
   `components/venue/VenueHubClient.tsx`: renders `<AccountDrawer scrollLockId="venue-hub-menu">` in place; its menu
   scroll-lock effect and menu Back handler were removed (the challenge-detail overlay handler and
   `useNativeBackHandler("exit", minimizeNativeApp)` stay). `components/ui/AccountMenu.tsx`: portal now holds a
   fragment `<AccountDrawer>…</AccountDrawer>` plus the username modal as a SIBLING (`fixed inset-0 z-[1300]`, was
   `absolute` inside the drawer wrapper); keeps its own username-modal Back handler (most recently opened wins).
   `tests/native-back-review-fixes.test.ts` OVERLAYS list now names `AccountDrawer.tsx` (the two old menu entries
   removed). NEW `tests/account-drawer.test.ts`. `CLAUDE.md` Navigation section has a bullet on the drawer.
   `navigation-controls-contract` needed no change (AccountDrawer doesn't render SignOutButton).
5. **Traps:** Andrew runs `next dev` on :3000 (shares the production DB) — never `pkill next-server`; I drove it with
   a FAKE user id (`00000000-0000-4000-8000-000000000001`, venue `venue-hightop-test`) so nothing was written. Playwright
   in `…/scratchpad/pw` (v1.60) wants browser build 1223, which isn't cached — pass `executablePath` to
   `~/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`.
   `*.test.ts` can't use JSX; `react/no-children-prop` needs a disable comment when passing `children` via createElement.
6. **Verified:** `npx tsc --noEmit` clean, `npm run lint` clean, `npm run test` 403 files / 4,797 passed / 13 skipped /
   0 failed, `npm run test:pwa-contract` 20/20; browser: hub `/venue/venue-hightop-test` and in-game `/bingo` menus at
   375×700 (scroll height 806/715 > 700, Sign Out reachable, scrim + Close close, scroll-lock attribute on only while
   open, username modal visible and typeable). **Not run:** `npm run build`, real-device Android Back.
7. **Open questions:** none blocking. Push/deploy is Andrew's.
8. **First steps:** `git status && git log -3`; run the gate in the order above; write the checklist section (each
   game's tutorial on an iPhone SE and a normal iPhone — nothing clipped, no "…" names; hub menu + in-game menu scroll to
   Sign Out; Android Back closes the menu first, then minimises on the hub); handoff; commit if Andrew agrees.
