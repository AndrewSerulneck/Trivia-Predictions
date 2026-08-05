# Bingo Landscape Fullscreen + PWA Conversion — Master Plan

**Status:** planned 2026-08-04. Not started.
**Runner:** `docs/bingo-fullscreen-pwa-run-phases.sh` (unattended, caffeinated, resumable).
**Run log:** `docs/bingo-fullscreen-pwa-run-log.md` (cross-phase memory, written by the phases).

---

## 0. The problem

When a player rotates their phone to landscape during Prop Bet Bingo, the app swaps to an
enhanced landscape board view (`isLandscapeGameView` in
`components/bingo/SportsBingoHome.tsx`). That view does not fill the screen: the mobile
browser's address bar / tab chrome eats the top and bottom, and the board is sized to what
is left over. The consequence is that prop-bet text on each square is too small to read in
full, which is the whole point of the landscape view.

**Goal:** the enhanced landscape view should occupy the entire physical display, so a player
can read every prop bet on every square and follow the game at a glance.

## 1. What is and is not possible (settled — do not re-litigate)

Two hard browser constraints shape everything below:

1. **iPhone Safari has no `Element.requestFullscreen`.** The Fullscreen API on iOS is
   available for `<video>` only. This is why the *existing* fullscreen toggle at
   `SportsBingoHome.tsx` (`toggleLandscapeFullscreen`) renders the fallback label
   "Fullscreen unavailable in this browser." on iPhone. iPad and Android Chrome do have it.
2. **Where the API exists, it requires transient user activation.** `orientationchange` is
   not a user gesture. A literal zero-tap auto-fullscreen on rotation is forbidden by spec
   on every platform.

Therefore a true, chrome-free fullscreen on iPhone is reachable **only** through an
installed PWA (`display: "standalone"`). That is the single reason the PWA track exists in
this plan; it is not scope creep.

The strategy is consequently three-layered, in increasing order of user commitment:

| Layer | Mechanism | Works on | User cost |
|---|---|---|---|
| A. Squeeze | Reclaim every pixel the app itself is wasting; coax iOS Safari into collapsing its own URL bar | Everyone, today | Nothing |
| B. One-tap | Arm the existing Fullscreen API call on the first touch after rotating | Android, iPad, desktop | One tap |
| C. Installed | PWA manifest, standalone display | Everyone, incl. iPhone | One-time install |

Layer A is the highest-value work per unit of risk and must ship first — a meaningful share
of the lost space may be the app's own chrome (`MobileAdhesionAd`, `MobileBottomNav`,
`AppShell` padding), not Safari's.

## 2. Product decisions (settled — binding on all phases)

These were decided with Andrew on 2026-08-04. Phases must not revisit them.

- **The PWA is for PLAYERS ONLY.** Partners (`/owner/*`) and admins (`/admin`) stay an
  ordinary website. Their surfaces are better with an address bar, tabs, a real keyboard,
  multi-tab copy/paste, and external links. Installing them buys nothing and imports the
  Stripe modal-sheet friction described in §3 for free.
- **The PWA scope is the player origin.** Under the planned domain split that is
  `play.hightopchallenge.com` (see `docs/phase-6-domain-split-runbook.md`). A manifest's
  `start_url`/`scope` is per-origin and is **baked into every install at install time**. If
  players install from the apex today and `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED` flips later,
  every installed app navigates out of its own scope and the browser chrome returns — the
  exact bug this plan set out to fix, now permanently baked into users' home screens. This
  is the only irreversible decision in the plan.
- **Therefore: the manifest ships, but install promotion ships OFF.** Following the same
  reversible-flag convention as `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED` and
  `NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM`: `NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED`, off =
  today's behavior, fully inert. Nothing prompts any player to install until Andrew flips it
  deliberately, after the domain split.
- **NO SERVICE WORKER.** Not in any phase. Offline caching is where PWAs break Next.js apps
  — stale HTML, cached auth redirects, mismatched RSC payloads. iOS does not need one to
  install. If a later phase believes Android's `beforeinstallprompt` requires one, register a
  **trivial pass-through with no caching whatsoever** and record the decision in the run log.
  Do not add `next-pwa`, `workbox`, or any caching library.
- **Rollout is gradual by audience, not by page.** PWA-ness is per-scope, not per-route;
  there is no "convert Bingo first." Staging happens in *who gets prompted*: ship inert →
  Andrew installs manually and tests → one venue → broaden.

## 3. Standalone-mode risks specific to THIS codebase

Found by audit on 2026-08-04. Each is addressed by a named phase.

- **Separate storage jar.** iOS gives an installed web app its own cookie/localStorage jar.
  `tp_user_id` / `tp_venue_id` / `tp_sess` do not carry over from Safari, so every player
  logs in once inside the app. This is expected, not a bug — but it means `start_url` must be
  a route that survives `proxy.ts`'s cookie gate **with no cookies present**. That is `/`
  (the join flow), never a game route, or the app cold-launches into a redirect.
- **Passkeys survive.** They live in iCloud Keychain keyed to the RP ID, not the storage
  jar, so Face ID login works on first launch in the app. This materially softens the
  re-login. `WEBAUTHN_ALLOWED_ORIGINS` must include the `play.` origin — already tracked as
  the known domain-split gap.
- **Geolocation permission must be re-granted** in the app's jar. Geofencing is core to
  venue join (`lib/geolocation.ts`), so this is a first-launch prompt.
- **No browser back button and no pull-to-refresh.** `components/navigation/BackButton.tsx`
  calls `window.history.back()`, which is dead at the launch entry point where no history
  exists. And a wedged page has no reload escape hatch. Both need in-app answers.
- **Stripe Checkout is an out-of-scope navigation.** `app/owner/billing/page.tsx` and
  `app/owner/billing/setup/page.tsx` do `window.location.href = data.url` to
  `checkout.stripe.com`. In standalone this opens a modal browser sheet that may not share
  the app's cookie jar, so the return redirect can land logged-out and "Done" returns to a
  stale page. **Largely mitigated by the players-only decision** (partners never install),
  but a defensive `visibilitychange` refetch is cheap and correct regardless — billing state
  is webhook-driven, so the redirect was never the source of truth.
- **`target="_blank"` links punt to Safari** (ads, `/info`, admin). Correct behavior for
  ads; harmless for admin. No action.

## 4. Verification reality

**Headless browsers cannot verify any of this.** A headless browser has no browser chrome at
all — no address bar, no tab bar, no iOS status bar — so the exact condition under test does
not exist in the environment, and standalone PWA mode is simply unreachable outside a real
installed app on a real phone. A headless pass would report success on a bug that is still
there.

This repo has been burned by exactly this twice already: headless Chromium reproduced none of
the Category Blitz iOS keyboard tear (`docs/category-blitz-app-feel-plan.md`), and headless
WebKit flattened `preserve-3d` and falsely failed the 3D animations
(`docs/category-blitz-mode-flip-3d-plan.md`).

Consequently: automated phases verify **build, typecheck, lint, and unit tests** only. Every
visual and standalone-mode claim is deferred to a physical-device checklist produced by
Phase 6 and executed by Andrew. **No phase may claim a visual fix is "verified."**

## 5. Hard boundaries (inherited from CLAUDE.md, restated because phases run unattended)

- Never read, modify, or expose `.env.local`.
- **Do NOT add `middleware.ts`.** `proxy.ts` is the live edge gate; adding `middleware.ts` is
  a hard build error. Do not change `proxy.ts`'s default auth-gate behavior.
- Do not modify `lib/supabaseAdmin.ts` or `vercel.json`.
- Existing files in `supabase/migrations/` are read-only history. **This plan should need no
  migration at all** — if a phase thinks it does, stop and write it in the run log instead.
- No `any`. Strict TypeScript, explicit types from `@/types`.
- Absolute `@/` imports only, never relative `../`.
- Tailwind utilities only — no CSS modules, no inline `style={{}}` — **except** the existing
  documented exceptions. Note that `components/venue-screen/*` is the TV surface and is NOT
  part of this plan. The Bingo landscape shell legitimately uses CSS custom properties set
  from `visualViewport` measurements (`landscapeViewportStyle`); that established pattern
  may continue.
- Run `npm run test:god-mode-join` after touching anything in the join/auth/geofence path.
  Phase 4 touches cold-launch auth and MUST run it.

## 6. Phase index

| # | Doc | What | Model | Effort |
|---|---|---|---|---|
| 0 | `-phase0.md` | Measurement pass — where the pixels actually go. No product code. | opus | high |
| 1 | `-phase1.md` | Layer A: squeeze the landscape view. | opus | high |
| 2 | `-phase2.md` | Layer B: near-automatic one-tap fullscreen. | sonnet | high |
| 3 | `-phase3.md` | PWA shell — manifest, icons, iOS meta. Inert. | sonnet | high |
| 4 | `-phase4.md` | Standalone hardening — back, reload, cold-launch auth, safe areas, Stripe refetch. | opus | high |
| 5 | `-phase5.md` | Install prompt UX, flag-gated off. | sonnet | high |
| 6 | `-phase6.md` | Regression guards + the physical-device verification matrix. | opus | high |

Phases 0–2 are independent of the PWA decision and deliver value to every player
immediately. Phases 3–6 are the PWA track and ship inert.
