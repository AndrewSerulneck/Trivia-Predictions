# Phase 5 — Install prompt UX (flag-gated OFF)

**Model:** sonnet / high.

Build the "Add to Home Screen" path, and ship it **off**. This is the phase most likely to be
built correctly and released at the wrong moment, so read the gate section first.

## The gate — read before writing code

A manifest's `scope` is **baked into every install at install time**. The player origin is
becoming `play.hightopchallenge.com` under `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED` (see
`docs/phase-6-domain-split-runbook.md`). If players install from the apex now and that flag
flips later, every installed app navigates out of its own scope and the browser chrome comes
back — permanently, on users' home screens, unfixable without asking them all to reinstall.

Therefore:

- Everything in this phase is gated behind **`NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED`**.
- **Off = today's behavior, fully inert.** No prompt, no banner, no copy, no listener. Follow
  the exact reversible convention already used by `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED` and
  `NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM`: a single typed resolver, one indirection point,
  and an inert default.
- Add the resolver to `lib/pwa.ts` (created in Phase 3) as e.g. `isInstallPromptEnabled()`.
  Do not scatter `process.env.NEXT_PUBLIC_...` reads across components.
- Do **not** set the variable anywhere. Do not touch `.env.local` — reading or modifying it
  is a hard boundary.

## Do

1. **Android / Chromium path.** Listen for `beforeinstallprompt`, `preventDefault()` it,
   stash the event, and surface your own trigger that calls `prompt()` on it. Handle
   `appinstalled` to dismiss the UI. Never call `prompt()` without a user gesture.

2. **iOS path — hand-written, because there is no event.** iOS Safari has no
   `beforeinstallprompt`; the player must use Share → Add to Home Screen manually. So this
   needs an actual coach card with the concrete steps and the Share glyph. Requirements:
   - Show only on iOS **Safari** (other iOS browsers cannot install), only when **not already
     standalone** (use the Phase 3 helper), and only when the flag is on.
   - Dismissible, and the dismissal is remembered in localStorage — same one-time pattern as
     the existing `FULLSCREEN_HINT_STORAGE_KEY` coach mark in `SportsBingoHome.tsx`. Reuse
     that pattern rather than inventing a second one.
   - Never show it to an already-installed player.

3. **Place it where the motivation is.** The most persuasive moment is a player in Bingo
   landscape on an iPhone who cannot get full screen — that is the slot Phase 2 deliberately
   left empty when the flag is off. Wire the copy in there ("Add to Home Screen for full
   screen"), still gated. Do not put a nagging global banner on every page.

4. **Write the rollout runbook** as `docs/pwa-install-rollout-runbook.md`, mirroring the
   structure of `docs/phase-6-domain-split-runbook.md`. It must state, in order: that the
   domain split must be live **first**; that `WEBAUTHN_ALLOWED_ORIGINS` must include the
   `play.` origin before any player installs (the known cutover gap); the env var to set and
   where; the one-venue pilot step; what to watch (re-login friction, location re-prompt); and
   that reversal is one flag — noting honestly that flipping the flag off stops *new*
   installs but does not uninstall existing ones.

## Do not

- Do not enable the flag.
- Do not set env vars, and never read or write `.env.local`.
- Do not prompt on `/owner/*` or `/admin` — players only.
- Do not add a service worker if Phase 3 concluded none was needed.

## Verify

`npm run build`, `npx tsc --noEmit`, `npm run lint`, `npm test`. Then confirm inertness
explicitly: with the flag unset, grep/trace that no listener is registered and no install UI
can render. State this in the run log.

## Run-log entry must include

The flag name and resolver location, proof of inertness with the flag unset, and the runbook
path.
