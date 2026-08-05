# bingo-fullscreen-pwa Run Log

Shared memory between the independently-run phases in
docs/bingo-fullscreen-pwa-run-phases.sh. Each phase reads this file first; a note here
about an earlier phase supersedes anything that contradicts it in that later
phase's own doc.

## Phase 0

No deviation. Read-only, no headless run (§4). Budget:
`docs/bingo-fullscreen-pwa-phase0-findings.md`.

**Highest-yield finding: the app eats more of the landscape display than Safari does** —
75.2px of app chrome inside the shell vs ~40–56px of Safari toolbar on a 390px display. Layer
A is the cure, the PWA track is upside. **Reclaimable ~90px**: 49px header row+gap, 21px
bottom safe-area inset already hidden behind Safari's toolbar, ~17px board-internal chrome.
Squares go 39.8×44.3px → ~58×60px; square font 8px → ~11px.

**Phase 1 should start by deleting the landscape header row**, rehoming its controls into the
~240px of unused horizontal slack — the board is height-bound and width-rich.

Skip: `MobileBottomNav` is imported nowhere; `PageShell`'s header is already suppressed by
`playingHidesShellNav`; the fixed portal covers all other chrome. Only `MobileAdhesionAd`
(`z-[1600]` > shell's `z-[1300]`) can overlay the board, and `md:hidden` spares phones ≥768px
landscape — SE-class only.

**Tripwire:** global `ScrollRescueGuard` doesn't know about Bingo landscape and calls
`hardRecoverDocumentScroll()` on stalled drags; only `tp-bingo-landscape-active`'s
`!important` outranks it. Don't relax that without handling the guard.

**Phase 6 device checklist:** landscape `visualViewport.height` (the one number undecidable
here) and `env(safe-area-inset-*)`; `isFullscreenAvailable()` false on iPhone Safari, true on
iPad/Android; adhesion ad over the board on an SE-class phone.

## Phase 1

Followed Phase 0's order. **Reclaimed:** header row + its grid gap (~49px, deleted — eyebrow,
title, Active/Scored tabs, status pill and fullscreen button now live in a new
`.tp-bingo-landscape-headline` panel at the top of the aside, paid for out of the ~240px of
horizontal slack); bottom safe-area inset (~21px, now conditional — base is `0.35rem`, raised
to `env(safe-area-inset-bottom)` only under `(display-mode: standalone|fullscreen)` /
`:fullscreen`); board-internal chrome (~20px — BINGO letters 18px→13px, its margin and all
gutters 6px→3.2px, board padding 0.4→0.3rem). Static "Fullscreen unavailable" pill deleted;
only real post-attempt `fullscreenFeedback` renders now. Adhesion ad + AppShell `pb-24`
suppressed via `html.tp-bingo-landscape-active` CSS.

**New sizing:** all responsive blocks now only retune tokens
(`--bingo-landscape-{pad-*,arrow,col-gap,aside}`); the stage formula lives in one place —
`min(vh − padTop − padBottom, vw − padL − padR − 2·arrow − 3·gap − aside)`. **Do not restate
it in a media query.** Square ≈40×44 → ≈57px and font 8→11px are **computed predictions from
the Phase 0 budget, not measurements** — nothing here rendered on a real display (plan §4).
Also `line-clamp-3`→`4`, `shortenLabel` cap 16→32 (`LANDSCAPE_SQUARE_LABEL_MAX_LENGTH`;
portrait untouched).

**URL-bar collapse: attempted, rejected.** It requires dropping `overflow:hidden !important` /
`touch-action:none !important` from `tp-bingo-landscape-active` — Phase 0's tripwire, which
hands the lock to `ScrollRescueGuard`'s inline `hardRecoverDocumentScroll()`. And Phase 0 §4(b)
already established programmatic `scrollTo` doesn't collapse the bar on modern iOS without a
real gesture. Zero expected yield, concrete rubber-band regression. **Phase 2 owns this**: it
already needs a first-touch gesture handler, which is the only trigger that could work.

**Later phases can skip:** re-auditing app chrome (all bands are gone or conditional) and
`MobileBottomNav` (still imported nowhere).

**Phase 6 device checklist adds:** (a) confirm Safari's bottom toolbar really does cover the
home-indicator strip in landscape — if not, the dropped inset clips the board's bottom edge;
(b) the aside on a 390px-tall phone must fit headline + progress + legend without clipping the
"Collect N Points" button (won board — tightest case; mitigated by icon-only tabs, `size="sm"`
ring, and hiding the duplicate "N squares from bingo" line); (c) iPhone 16 Pro Max is 440px
tall in landscape, so the `max-height:430px` compaction block does **not** apply there — verify
the base-token path looks right.

## Phase 2

**Deviation:** phase doc's item 4 (hide the dead control on iPhone) was already done by Phase
1 — `hasCheckedFullscreenSupport` never existed and the static "unavailable" pill and its CSS
class are already gone; the button/hint slot is fully gated by `isFullscreenSupported`.
Confirmed only, no code change.

**Arm event:** one `pointerdown` listener on the landscape shell (`rootRef`) — covers
touch/pen/mouse, no `preventDefault`/`stopPropagation`, so a tap's own `onClick` still runs.
Effect deps tear it down once `isLandscapeFullscreen` flips true. The claim that this composes
safely with every underlying `onClick` was a **code trace, never run on a device — and it was
wrong**: it enumerated squares, arrows and tabs but not the fullscreen button itself, which
runs the same *toggle* on click and so entered-then-exited on its own first tap. Fixed in the
review pass below (enter-only handler + a `.tp-bingo-landscape-fullscreen` skip); the listener
also dropped `{ once: true }` there, so a rejected request no longer disarms the feature. Treat
the remaining composition claim as an untested prediction until §2 of the device checklist is
run.

**Deliberate-exit tracking:** ref `userExitedLandscapeFullscreenRef`, set in the existing
`fullscreenchange` listener when fullscreen ends while still in landscape (vs. our own
portrait-exit effect, which flips `isLandscapeGameView` false first). "Item 3 needed no change"
was likewise a **code trace, not a confirmation** — an untested prediction that the two exit
paths can't collide. Persists for the component's lifetime, not just one landscape stint, per
"remainder of the session" — flag for Phase 6 if that should instead reset per rotation.

**Skip:** re-checking the iPhone unavailable-label; it's gone.

**Phase 6 checklist:** (a) one tap after rotating enters fullscreen on Android/iPad, taps on
game elements still work; (b) exiting via button, then rotating out/in, does not re-arm; (c)
same for exiting via system gesture (swipe-up/back); (d) hint reads "Tap anywhere for full
screen," 7s dismiss, once-only; (e) iPhone shows nothing in the control slot.

## Phase 3

No deviation. `start_url: "/"`, `scope: "/"`, no `orientation` key — confirmed in the built
`/manifest.webmanifest` JSON. No service worker registered.

Icons: source `public/brand/htc-logo.png` (identical art to the "copy" file, cleaner filename),
flattened onto `#020617` via reproducible `scripts/generate-pwa-icons.cjs` (`npm run pwa:icons`).
Output: `icon-192.png`, `icon-512.png` (purpose any), `icon-512-maskable.png` (logo inset to 80%
canvas), `apple-touch-icon.png` (180×180), all under `public/icons/`.

Standalone-detection helper: `isRunningAsInstalledPwa` in `lib/pwa.ts` — Phases 4/5 must use it.
Found and removed a pre-existing duplicate, `isStandaloneDisplayMode` in
`lib/socialShare/deviceCapabilities.ts`; it now delegates to `lib/pwa.ts` (name/tests untouched).

**Discovery:** Next.js 16's `appleWebApp.capable` only emits the modern unprefixed
`mobile-web-app-capable` tag — WebKit only honors that name from iOS 17.4+. Added the legacy
`<meta name="apple-mobile-web-app-capable" content="yes">` by hand in `app/layout.tsx`'s `<head>`
so pre-17.4 iOS still gets the chromeless window.

**Phase 6 checklist adds:** confirm standalone launch is actually chromeless on the test device's
iOS version (unverifiable headlessly, per plan §4).

Later phases can skip: re-deriving standalone detection (use `lib/pwa.ts`); re-checking manifest
JSON shape (verified against build output above).

## Phase 4

**Back button:** `handleBack` short-circuits when `window.history.length <= 1`, pushing
`getInternalReferrerPath() || fallbackHref` at once instead of firing a no-op `history.back()`
and waiting out the existing 150ms timeout. Same target, real history untouched.

**Reload hatch:** `components/ui/StandalonePwaRuntime.tsx`, mounted in `app/layout.tsx` beside
the other headless sentinels. Standalone-only pull-to-refresh: ≥110px pull from `scrollY === 0`,
"Release to reload" pill, nothing at rest. Listeners all passive and it bails on locked surfaces
(`tp-bingo-landscape-active`, computed `overflow-y:hidden`, active scroll locks) so it never
fights `ScrollRescueGuard`.

**Cold-launch trace** (code trace; no server run, per plan §4): `/` is `isPublicPath` → no
redirect; `proxy.ts` untouched. **Deviation:** an empty jar makes `shouldShowJoinWelcome()` true,
so it lands on the **welcome carousel**, then `auth-method-selection` — not straight there. Zero
geolocation, no gated-route flash. **`test:god-mode-join` passed, 34/34** (ran its exact
`vitest run` list; the npm wrapper wanted an approval). Build/tsc/lint/1343 tests green.

**Later phases:** `lib/pwa.ts` now exports `useIsRunningAsInstalledPwa()` — use it; bare
`setState` in an effect fails lint. `<html class="tp-standalone">` is set by the runtime, and
Phase 1's `(display-mode: standalone)` bingo rule gained an `html.tp-standalone` twin (iOS only
reports that query on recent versions). Safe-area padding is `.tp-app-shell-safe-area`, top inset
`:not(:has(.tp-page-header))` — PageShell's fixed header already pays it.

**Skip:** geolocation needs no cached-permission audit; every path prompts fresh and denial hits
the existing retry cards. Only `LocationReEnableSteps` changed ("tap the lock icon in your
address bar" is a dead end with no address bar → device-Settings steps in standalone).

**Phase 6 checklist:** (a) cold launch shows welcome → auth-method-selection, no flash; (b)
pull-to-reload fires only deliberately, never in Bingo landscape / Category Blitz / a modal; (c)
status-bar + home-indicator clearance on `/`, `/redeem-prizes`, `/activity`, no double gap; (d)
Stripe return refetch is partner-only — exercise it in a plain tab.

## Phase 5

No deviation. Flag `NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED`, resolver `isInstallPromptEnabled()`
in `lib/pwa.ts` — single indirection point, only import site is `SportsBingoHome.tsx`. Also added
to `lib/pwa.ts`: `isIOSSafari()` (UA-excludes CriOS/FxiOS/EdgiOS/OPiOS/in-app webviews — other iOS
browsers can't install) and `usePwaInstallPrompt()` (Android `beforeinstallprompt`/`appinstalled`,
no-ops entirely when the flag is off or already standalone).

Both UI pieces live in the exact slot Phase 2 left empty (`isFullscreenSupported ? … : null` in
the landscape headline): iOS Safari gets a dismissible coach card ("Add to Home Screen for full
screen", `INSTALL_COACH_CARD_STORAGE_KEY`, same seen-once pattern as `FULLSCREEN_HINT_STORAGE_KEY`);
Android gets a compact "Install" button that only renders once `canInstallOnDevice` is true. No
global banner, nothing on `/owner/*` or `/admin` — the whole feature is local to this one player
component.

**Inertness proof:** grepped the repo — `NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED` is read in exactly
one place (`lib/pwa.ts`), unset everywhere (only documented, `=false`, in `.env.example`; `.env.local`
untouched). With it unset, `usePwaInstallPrompt`'s effect returns before adding any listener, and
the coach-card effect's guard forces `showInstallCoachCard` false — both branches collapse to the
prior `null`. Build/tsc/lint/1343 tests green.

Runbook: `docs/pwa-install-rollout-runbook.md` — states the domain-split-first hard dependency, the
`WEBAUTHN_ALLOWED_ORIGINS` gap, and that reversal stops new installs only, not existing ones.

**Phase 6 checklist adds:** (a) Android Chrome — one tap "Install" actually installs, button
disappears after; (b) iPhone Safari — coach card copy/Share icon match reality, dismiss persists
across reloads; (c) confirm `isIOSSafari()` correctly excludes Chrome/Firefox-on-iOS on a real device.

## Phase 6

No deviation. Guard: **`npm run test:pwa-contract`** → `tests/pwa-contract.test.ts`, 20 assertions
covering all five candidates. Checklist: `docs/bingo-fullscreen-pwa-device-checklist.md` (6
sections, 62 rows, blocking vs nice-to-have, per-row "if this fails, fix here"). CLAUDE.md gained
a PWA section.

**Discovery:** the portrait-leak guard can't be a substring check — Phase 1's CSS is class-scoped,
not media-query-scoped. It parses `globals.css` into brace-matched rule blocks and asserts every
selector touching `tp-bingo-landscape`/`--bingo-landscape` is shell-scoped, and every enclosing
media query names `orientation: landscape` or `display-mode:`. Reusable for the next CSS-leak
guard. Mutation-tested the four highest-value guards (bad `start_url`, added `orientation`,
dropped `orientation: landscape`, `, main` on a landscape selector) — each failed, then reverted.
Install-inertness is functional (11 env values) plus structural; vitest's env is `node`. Manifest
guard also reads `.next/…/manifest.webmanifest.body` when a build exists.

**Unverified pending physical devices: the entire visual surface.** Every Layer A gain is a
computed prediction; Phase 1's dropped bottom inset rests on an unverified assumption that
Safari's toolbar covers the home-indicator strip (§1.5 — if wrong, the board clips); one-tap
fullscreen and its exit latch (§2.2–2.8); chromeless launch on pre-17.4 iOS (§3.1); the whole
installed path — cold launch, passkey vs PIN, location re-grant, edge-to-edge board, safe areas,
back button, reload hatch (§3–4); flag-on install prompt (§5); the five-game regression sweep
(§6, static half only).

**Open decision (§2.8):** the exit latch persists for the component's lifetime, so fullscreen
doesn't re-arm after rotating out and back. One-line change if Andrew wants per-rotation.

Green: build, tsc, lint, 1363 tests, guard 20/20, `test:god-mode-join` 34/34.

## Review fixes

Applied against the working diff after a strict code review, most severe first. No settled
decision from the plan was revisited: no `middleware.ts`, no service worker, `start_url`/
`scope` still `/`, no `orientation`, and the manifest still ships (plan §2) rather than being
put behind the install flag.

**Changed:**

1. **One-tap fullscreen self-cancelled on the fullscreen button** (`SportsBingoHome.tsx`).
   The arm listener fired `toggleLandscapeFullscreen` on `pointerdown`; the button's own
   `onClick` then toggled straight back out, and the resulting `fullscreenchange` latched
   `userExitedLandscapeFullscreenRef`, killing tap-to-fullscreen for the component's lifetime
   — on the likeliest first tap. Split out an **enter-only** `enterLandscapeFullscreen`
   (guarded by a new `fullscreenRequestInFlightRef`), which the arm listener now calls, and
   the listener also skips any pointerdown inside `.tp-bingo-landscape-fullscreen`.
2. **Adhesion ad billed impressions for a banner nobody could see** (`MobileAdhesionAd.tsx`).
   The CSS suppression hid it, but `AdBanner` still mounted and POSTed `/api/ads/impression`,
   and it held the ad-tier lock. It now unmounts: a `useSyncExternalStore` +
   `MutationObserver` read of `html.tp-bingo-landscape-active` feeds the render guard and the
   priority effect. CSS kept as the paint-level guarantee. `tests/pwa-contract.test.ts`'s
   "no Bingo-specific clamp in shared shell" guard was tightened rather than loosened — it now
   allows exactly one read-only classList check and still forbids any landscape sizing token.
3. **Runbook overclaimed inertness** (`docs/pwa-install-rollout-runbook.md`, CLAUDE.md). The
   manifest and the `apple-mobile-web-app-capable` meta ship unflagged, so self-directed Add
   to Home Screen works today and reversal does not stop it. §0 and §4 now say so explicitly,
   the flag is described as gating *promotion, not installability*, and CLAUDE.md gained the
   matching bullet. **Documented, not gated** — plan §2 settles that the manifest ships.
4. **`lib/pwa.ts` exports hooks with no client directive** and is now reachable from the
   previously React-free `lib/socialShare/*` chain. Added `"use client"`. Kept the file
   whole rather than splitting the pure predicates out, so `isInstallPromptEnabled()` stays
   the single documented resolver in `lib/pwa.ts` — everything in the file is browser-only
   anyway.
5. **A rejected first fullscreen request disarmed the feature** — the arm listener was
   `{ once: true }` and the catch changed nothing in the effect deps. Dropped `once`; the
   effect still tears the listener down the moment fullscreen actually takes.
6. **Billing reconcile listeners** (`app/owner/billing/page.tsx`, `.../setup/page.tsx`).
   Dropped `focus` (duplicate of `visibilitychange`), and `pageshow` is now filtered on
   `event.persisted` so it no longer double-fires on ordinary load. On the setup page
   `setPaying(false)` moved to the bfcache-restore path only — clearing it on a bare
   visibility gain could re-enable the button mid-redirect and open a second Checkout session.
7. **Pull-to-reload could destroy in-progress state** (`StandalonePwaRuntime.tsx`). Added two
   vetoes: it bails when an `input`/`textarea`/`select`/contenteditable has focus, and past
   110px the pull must now be **held `PULL_HOLD_MS` (350ms)** before it promotes to "ready"
   (timer-armed, since `touchmove` stops firing on a still finger). A fast flick can no longer
   reach reload.
8. **Run-log honesty.** Phase 1's square/font numbers are now labelled computed predictions,
   and Phase 2's "still fire their own `onClick`" / "confirmed no conflict" are now labelled
   code traces — with the note that exactly that reasoning missed fix 1. Device checklist
   gained §2.4a/§2.4b/§2.4c (fullscreen-button first tap, the latch, retry after a rejected
   request) and §3.13a/§3.13b/§3.13c (flick, focused field, game pages still reloadable).
9. **`sharp` was an undeclared dependency** of `scripts/generate-pwa-icons.cjs`. Added to
   `devDependencies`. `npm install` is not runnable in this session, so `package-lock.json`
   was hand-synced with the one line the sync check needs (root `packages[""]
   .devDependencies`); the next real `npm install` will normalize the `optional`/`devOptional`
   flag on the existing `node_modules/sharp` entry. **Worth re-running `npm install` locally
   to confirm the lock settles cleanly.**
10. **Icon compression** — the script now passes `compressionLevel: 9`, `effort: 10`,
    `palette: true`, `quality: 90`, including on the final `toFile` re-encode (which would
    otherwise silently discard the options). **The PNGs in `public/icons/` are still the old
    uncompressed ones** (313KB / 231KB / 58KB / 52KB): running the generator requires an
    approval this session did not have. **Run `npm run pwa:icons` and commit the smaller
    files.**
11. **Aside token mixed measurement systems** (`app/globals.css`). `clamp(12rem, 24vw, 17rem)`
    → `clamp(12rem, calc(var(--bingo-landscape-vw, 100vw) * 0.24), 17rem)`, so it is taken off
    the same visualViewport width the rest of the board-stage formula uses. The responsive
    overrides at `13rem`/`10.5rem`/`9rem` are fixed lengths and were already consistent.
12. **`next-env.d.ts`** reverted — the `.next/dev/types` → `.next/types` flip is a `next build`
    side effect, not part of this work. (It re-flips on every build; reverted again after the
    verification build below.)

**Deliberately not done:**

- **Gating the manifest / apple meta behind a flag (finding 3's first option).** Plan §2 is
  explicit that the manifest ships and only *promotion* is flagged, and finding 3 itself
  offers the documentation fix as the alternative. Took that.
- **Blanket-disabling pull-to-reload wherever `[data-venue-game-surface]` is mounted (part of
  finding 7).** That attribute is on `GameLandingExperience`, i.e. every game *landing* page,
  not just live gameplay — it would remove the only reload escape hatch in standalone from the
  routes most likely to wedge. Active gameplay that actually needs protecting (Bingo landscape,
  Category Blitz) is already covered by `isSurfaceLocked()`, and the hold + focus vetoes close
  the accidental-trigger path the finding was really about.

**Still open, unchanged:** the exit-latch lifetime (§2.8) remains Andrew's call, and every
visual/standalone claim in this log is still unverified pending the device checklist.

Green after the fixes: `npx tsc --noEmit`, `npm run lint`, `npm run build`, 1363 tests passing
(13 skipped), `test:pwa-contract` 20/20.
