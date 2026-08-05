# Phase 6 — Regression guards + physical-device verification matrix

**Model:** opus / high.

Two deliverables: automated guards that a machine *can* honestly check, and a device
checklist for the things only a human with a real phone can.

## The premise — do not work around it

**Headless browsers cannot verify this feature.** A headless browser has no browser chrome —
no address bar, no tab bar, no iOS status bar — so the condition under test does not exist in
the environment, and standalone PWA mode is unreachable outside a real installed app on a
real phone. A headless pass would report success on a bug that is still present.

This repo has been burned by exactly this twice: headless Chromium reproduced none of the
Category Blitz iOS keyboard tear (`docs/category-blitz-app-feel-plan.md`), and headless WebKit
flattened `preserve-3d` and falsely failed the 3D animations
(`docs/category-blitz-mode-flip-3d-plan.md`).

So: **do not write a Playwright test that asserts the landscape view is full screen, and do
not report any visual or standalone claim as verified.** Guards may only assert things that
are true in a chrome-less environment.

## Do

1. **Add static/unit regression guards** — only for invariants that survive headlessly.
   Follow the existing named-tripwire convention (`npm run test:god-mode-join`,
   `test:venue-screen-overflow`, `category-blitz:verify-mobile-shell`) and add an npm script
   in the same style. Candidates, in priority order:
   - **`start_url` must be `/`.** Assert against the built/emitted manifest. A future edit
     pointing `start_url` at a game route silently breaks every cold launch through
     `proxy.ts`'s cookie gate. This is the single highest-value guard in the plan.
   - **No service worker.** Assert nothing registers one and that `next-pwa`/`workbox` are
     absent from `package.json`. Master plan §2 forbids it; make that mechanical.
   - **Install prompt inertness.** Assert that with `NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED`
     unset, no install UI renders and no `beforeinstallprompt` listener is registered.
   - **Manifest omits `orientation`.** Locking orientation would break the entire feature.
   - **Portrait Bingo untouched.** A guard that Phase 1's landscape CSS is scoped to the
     landscape media query and does not leak into portrait. Note the precedent: commit 35115fc
     leaked a `100svh` clamp from Category Blitz onto five game routes
     (`docs/mobile-game-screen-blackout-plan.md` / memory). This exact class of leak has
     happened here before.

2. **Write `docs/bingo-fullscreen-pwa-device-checklist.md`** — the human verification matrix,
   as concrete pass/fail steps Andrew can run in a bar with a phone. Read the run log first
   and fold in every "Phase 6 must check this" note the earlier phases left. Cover at least:

   **Browser, iPhone Safari** — rotate into Bingo landscape; is the board bigger than before;
   is full prop-bet text readable; did the URL bar collapse (or was that sub-task abandoned in
   Phase 1 — check the run log); any rubber-banding; rotate back to portrait cleanly.

   **Browser, Android Chrome** — same, plus: does one tap after rotating enter true fullscreen;
   does that tap still perform its underlying action (square/nav/tab); after manually exiting
   fullscreen, does it stay exited and not re-prompt.

   **Installed, iPhone** — install via Share → Add to Home Screen; cold launch lands on the
   join flow with no redirect loop; log in (note passkey/Face ID should work immediately since
   passkeys live in iCloud Keychain, while username/PIN requires one re-entry); grant location
   and join a venue; Bingo landscape is genuinely edge-to-edge; nothing hidden under the notch
   or home indicator; back button works at the launch entry point; the reload hatch works;
   background the app mid-round and return.

   **Installed, Android** — install via the Chrome prompt; same launch/auth/landscape checks.

   **Regression sweep** — the other four game routes that commit 35115fc broke, plus portrait
   Bingo, on at least one real device.

   For each row: exact steps, expected result, and a blank pass/fail. Flag which rows are
   **blocking** for a rollout versus nice-to-have.

3. **Update `CLAUDE.md`** with a short PWA section stating the settled invariants: players
   only; no service worker; `start_url` must be `/`; install promotion is gated by
   `NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED` and must not be enabled before the domain split;
   headless browsers cannot verify this surface. Match the file's existing terse bullet
   style — a few bullets, not an essay.

## Do not

- Do not write headless tests asserting visual fullscreen, chrome height, or standalone mode.
- Do not mark any device-checklist row as passed. Andrew runs it.
- Do not enable any flag.

## Verify

`npm run build`, `npx tsc --noEmit`, `npm run lint`, `npm test`, plus the new guard script,
plus `npm run test:god-mode-join`.

## Run-log entry must include

The new guard script name, and an explicit list of what remains **unverified pending physical
devices** — this is the handoff to Andrew and it must be honest and complete.
