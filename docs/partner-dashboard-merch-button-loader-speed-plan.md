# Partner Dashboard — Merch Button, Logo Loader & Faster First Load — Plan

**Status: COMPLETE.** Phases 1–7 all done 2026-10-01, **all uncommitted on `main`** (last commit
`e900ce7`; nothing pushed, nothing deployed) — final handoff:
`docs/partner-dashboard-merch-button-loader-speed-plan_PHASE_7_HANDOFF.md`. Phase 7 re-measured
everything, ran `/code-review` across Phases 1–6 (five findings; four fixed, the fifth is Andrew's
call — see below), and cleared the whole `CLAUDE.md` / `SYSTEM_CONTEXT.md` docs debt.
**End-to-end, on a simulated new phone (Slow 4G + 4× CPU, median of 5):** Partner Dashboard
**2,056 → 352 KB** (−83%), **32 → 25 requests**, load **10,414 → 2,106 ms** (−80%), games list
**10,438 → ~2,970 ms**, owner API calls on first paint **3 → 1**. Partner sign-in
**3,714 → 458 KB** (−88%), load **18,545 → 2,318 ms**, LCP **1,660 → 1,316 ms**. Player join
screen (measured for the first time in Phase 7, closing Phase 2's gap): **509 KB, LCP 1,312 ms,
zero requests for either 1.7 MB PNG**. Gates: 3,025 tests pass across four consecutive runs, clean
typecheck/lint, 180-page build. **Did not improve:** the ~2.1 s pre-request head is still there —
it is JavaScript download + hydration, and its two biggest contributors were out of scope in every
phase. **Open for Andrew:** device-checklist sections **H** and **I** of
`docs/partner-dashboard-app-redesign-device-checklist.md` plus **M** of
`docs/join-merch-store-device-checklist.md`; whether the 512 px sign-in logo looks soft at 320 px on
a 3× phone (review finding 4 — deliberately not changed, ~100 KB to fix, Phase 7 handoff §7.3);
whether to commit/push/deploy; and two measured-but-unauthorised follow-ups — the 186 KB Supabase
chunk on `/owner/*` (`AuthSessionProvider`, Phase 6 handoff §6.3) and the server-rendered dashboard
shell. Andrew answered Q1–Q3 on 2026-10-01 (see §6 — they changed Phases 3 and 4).
**Handoffs:** each phase ends with `docs/partner-dashboard-merch-button-loader-speed-plan_PHASE_<N>_HANDOFF.md`
(global rule in `~/.claude/CLAUDE.md`). Update this status line to point at the latest handoff.

---

## 1. Summary (plain English, for Andrew)

You asked for three things. Here is what each one means and how it gets done.

1. **An "Order Join Merch" button, top right of the Partner Dashboard**, with a shopping-bag icon.
   Tapping it opens the Join Merch store, the same store the menu row opens. The menu row stays. The
   small bouncing logo that sits there today is removed from the dashboard header.
2. **A logo loading animation.** The Hightop logo pops in the way it does now, then hops, spins in
   the air, lands with a little squash, and repeats. This is what partners see while a Partner
   Dashboard screen is loading, in place of grey placeholder boxes and the orange basketball.
3. **A faster first load on a new phone.** I found four concrete causes (section 2). The biggest is
   simple: a new phone downloads **3.4 MB of logo image** to show a logo that is 36 pixels wide. The
   same 1.7 MB picture is saved under two different file names, and both get downloaded. On a typical
   phone connection that is roughly 2–3 seconds by itself. Shrinking it to a few kilobytes also makes
   *every* page in the app faster for players, because the root layout tells every page to fetch it.

None of this raises hosting cost. Phases 2 and 5 should lower it (less data sent, fewer server calls).

**What I need from you:** the three questions in section 6. Each has a default, so work can start
before you answer.

---

## 2. What makes the first load slow (findings, 2026-10-01)

Measured against production (`https://hightopchallenge.com`) and the local build from 2026-10-01 11:23.

| # | Cause | Evidence | Fix phase |
|---|---|---|---|
| F1 | **Oversized logo, downloaded twice.** `public/brand/htc-logo.png` and `public/brand/HTC_Logo_Final_Transparent copy.png` are byte-identical 1,694,390-byte, 1254×1254 PNGs. The root layout preloads the first at `fetchPriority="high"` on **every page** (`app/layout.tsx:97`); the dashboard header's `ExplodingLogo` (`components/ui/ExplodingLogo.tsx`) loads the second with `decoding="sync"` at 36 px. Different URLs = two cache entries = 3.4 MB. | `curl` of both URLs: 200, 1,694,390 B each, ~0.9 s each on a fast wired link | 2 |
| F2 | **Static images are not cached.** `/brand/*` is served `cache-control: public, max-age=0, must-revalidate`, so every visit re-checks every image with the server. | `curl -I` | 2 |
| F3 | **Fonts load through a three-step chain.** `app/globals.css:1` `@import`s Google Fonts (Bree Serif + Nunito ×5 weights). The phone must load our CSS → then `fonts.googleapis.com` CSS → then font files from `fonts.gstatic.com`: two extra servers to connect to, one after another, before text settles. | `grep @import app/globals.css` | 6 |
| F4 | **The dashboard asks for its data in two rounds.** `app/owner/dashboard/page.tsx` is fully client-rendered: HTML → JavaScript → `GET /api/owner/venues` → *then* `GET /api/owner/schedule` + `GET /api/owner/competitions` in parallel. Each of the three calls re-runs `requireOwnerAuth` (2 database queries) before its own query: 9 queries and up to 3 separate cold server starts on a first visit. | code read | 5 |
| F5 | **Partners download player-only code.** The root layout mounts `AuthSessionProvider` (Supabase browser client, the largest chunk at ~186 KB raw), `AnimationOverlay`, `PopupAds`, `MobileAdhesionAd`, `AnalyticsRuntime` and `GlobalTransitionOverlay` on every route. No `/owner/*` file uses the player auth context. The dashboard route totals ~742 KB raw JavaScript across 23 chunks. | `.next/server/app/owner/dashboard/page_client-reference-manifest.js` | 6 |

Not causes, checked: the HTML document itself is small (`/owner/login` 28.6 KB). `PopupAds` and
`MobileAdhesionAd` do not resolve an ad page key for `/owner/*`, so no ad requests fire there — but
their code still ships (F5).

Cold server starts after idle time are real but not fixed by a "keep warm" cron: that is a recurring
cost for a rare event. Phase 5 cuts the number of cold-startable calls from 3 to 1 instead.

---

## 3. Decisions already made (so later phases do not re-ask)

- The menu row **Order Join Merch** stays exactly where it is (`components/owner/menu/ownerMenuItems.ts`,
  order pinned by `tests/owner-menu-contract.test.ts`). The header button is an *additional* way in.
- The header logo is removed **from the Partner Dashboard header only** (`OwnerAppBar` trailing slot).
  `ExplodingLogo` stays for the player sign-in (`components/join/JoinFlow.tsx`), `/tv` and others.
- The loader is built with CSS keyframes in `tailwind.config.ts` (like the existing `logo-burst`),
  **not** framer-motion, so it costs no extra JavaScript and can show before the page's code runs.
- The loader honours "Reduce Motion": no hop or spin, just the logo with a soft fade pulse.
- The original 1.7 MB PNGs stay in `public/brand/` (outside links or emails may point at them). We only
  stop *referencing* them from pages.
- No service worker, no new caching library (standing PWA rule in `CLAUDE.md`).
- `/info` remains the home page rule; nothing here changes navigation targets.

---

## 4. Phases

### Phase 1 — "Order Join Merch" header button

**Model: Sonnet 5.5 · Effort: medium.** Small, well-bounded UI change in one component, but it uses
the URL-sheet history driver and must not regress the menu contract tests.

**Goal.** Replace the trailing `ExplodingLogo` in `components/owner/OwnerAppBar.tsx` (the `leading ?
spacer : logo` block near "Trailing slot") with a button: `ShoppingBag` icon (lucide, already used by
the menu row) + the text **Order Join Merch**.

- Shown only where the logo was: the dashboard (no `leading` prop). Sub-pages keep the empty 40 px
  spacer so their titles stay centred.
- Tap → `openDashboardSheet("store")` directly (the helper already in the file; it calls
  `pushSheet(window.history, window.location, "store")`). No drawer to wait for, so no
  `pendingSheet` dance. **Never `router.push` a sheet URL** (CLAUDE.md).
- While the store sheet is open the button shows `aria-expanded`/`aria-haspopup="dialog"`, and focus
  returns to it when the sheet closes (check how `OwnerSheet`'s `returnFocusRef` is supplied for
  the store; add a ref path if needed rather than a second focus system).
- Styling: a compact pill that reads as a primary action on the dark bar — cyan family to match the
  menu button (`bg-ht-cyan-300 text-slate-950`), `min-h-10`, `rounded-full`, `px-3`, text
  `text-xs font-black`. Tailwind only, no `!` utilities.
- Space: the centre venue name/switcher already truncates (`min-w-0 flex-1`). Verify at 320, 375
  and 430 px wide that the label never wraps and the venue name keeps at least ~8 characters.
  Narrow-screen rule is open question Q3 (default below).
- Remove the now-unused `ExplodingLogo` import from `OwnerAppBar.tsx`.

**Tests.** Extend `tests/owner-menu-contract.test.ts`: the app bar renders the header store button
only when `leading` is absent; it calls `openDashboardSheet("store")`/`pushSheet`, never
`router.push`; `OwnerAppBar.tsx` no longer imports `ExplodingLogo`; the menu row order is unchanged.
Run `npm run test`, `npx tsc --noEmit`, `npm run lint`, then `npm run build` (not concurrently with
tsc). Add two lines to `docs/join-merch-store-device-checklist.md` (header button opens the store;
phone Back closes it).

### Phase 2 — Measure a baseline, then shrink and cache the logo

**Model: Sonnet 5.5 · Effort: medium.** Mechanical asset work across several files, plus a careful
measurement. Touches the player sign-in, so the join-flow tripwire applies.

1. **Baseline first** (global cost rule). With a cold cache and Chrome's "Slow 4G" + 4× CPU throttle
   (Playwright or Lighthouse), record for `/owner/login` and `/owner/dashboard` (signed in — see
   "Manual Testing & Auth Storage" in `CLAUDE.md` for the owner cookie): total bytes, request count,
   LCP, and time until the games list is visible. Also record p50/p95 durations of the three
   dashboard API routes from Vercel observability for the last 7 days. Write the numbers into the
   handoff; Phase 7 compares against them.
2. **Optimized logo files.** Add a script `scripts/optimize-brand-logo.cjs` (pattern:
   `npm run store:images`, which already produces `public/store/web/*.webp`) that writes from the
   1254 px source: `public/brand/web/htc-logo-96.webp`, `-192.webp`, `-512.webp` (and PNG fallbacks
   only if a target surface needs them). Expect each in the 3–40 KB range; record actual sizes.
   Commit the outputs and an `npm run brand:images` script.
3. **Point every reference at the right size:** `app/layout.tsx` preload (use the 192 px file, or drop
   the global preload and preload only on the pages that show the logo above the fold — pick the one
   that does not regress the player join screen's LCP, measured), `components/ui/ExplodingLogo.tsx`
   (choose by `width` prop; `decoding="async"`), `components/ui/HightopLogo.tsx`,
   `components/join/JoinFlow.tsx`, `app/tv/page.tsx`, `app/info/layout.tsx`,
   `app/coming-soon/page.tsx`, `components/ui/GlobalTransitionOverlay.tsx`. Find them with
   `grep -rn "htc-logo.png\|HTC_Logo_Final" app components lib`. `lib/venueScreenDebug.ts` is a
   debug reference — leave it unless trivial.
4. **Long cache for the new files.** In `next.config.ts` `headers()`, add
   `Cache-Control: public, max-age=31536000, immutable` for `/brand/web/:path*` only. Because those
   files are immutable, any future logo change must ship under a **new file name** (write that rule
   into the script's header comment). Do not touch `vercel.json`.

**Cost.** Lowers Vercel bandwidth: about 3.4 MB → under 0.1 MB per new visitor on any page that
shows the logo (players included), and repeat visits stop re-validating those images.

**Tests.** `npm run test`, `npm run test:god-mode-join` (JoinFlow touched), `npm run test:pwa-contract`
only if the manifest/icons are touched (they should not be), typecheck, lint, build. Visually check
the logo is crisp on a 3× phone screen at each spot changed.

### Phase 3 — The logo loader (pop → hop → spin → land)

**Model: Opus 5.5 · Effort: high.** The look *is* the deliverable; motion timing needs judgment.

Build `components/ui/HightopLoader.tsx` (arrow component, Tailwind only) using the Phase 2 192 px WebP.

- **Sequence:** once — the existing pop (`logo-burst`: scale 0.02 → 1.1 → 1, 1.1 s, overshoot curve;
  reuse it). Then loop (~1.1–1.3 s per cycle): crouch (squash, scaleY ~0.9) → hop up ~35–45 % of its
  size while spinning one full turn (default: flat spin like a wheel, see Q2) → land with a short
  squash and settle. A soft ellipse shadow underneath shrinks and fades as the logo rises (same idea
  as `BouncingBallLoader`'s shadow).
- **Implementation:** new keyframes `logo-hop` in `tailwind.config.ts` next to `logo-burst`, animating
  only `transform` and `opacity` (smooth on phones). Chain pop → loop with a phase state the way
  `ExplodingLogo` does (`onAnimationEnd`), or with `animation-delay` — no JS timers per frame.
  Inline `style` is not allowed outside `components/venue-screen/*`; pass size through a fixed
  `size: "sm" | "md" | "lg"` prop mapped to Tailwind classes.
- **Reduce Motion:** `motion-reduce:` variants — no hop/spin; a 1.6 s opacity pulse.
- **Accessibility:** `role="status"`, visually hidden "Loading…" label (overridable `label` prop).
- **Show delay:** a `delayMs` prop (default 200 ms) so very fast loads never flash the loader; once
  shown, let the pop finish (~0.5 s minimum) so it never blinks on and off.
- **Review with Andrew before Phase 4:** record a short screen capture (Playwright video at 375×812,
  normal and Reduce Motion) and save it under `docs/assets/` (or describe exactly how to view it on
  the dev server). Do not wire it into pages until Andrew approves the motion.

**Tests.** A unit test for the delay/minimum-duration logic (Vitest, fake timers); a static test that
the component uses no framer-motion import and no inline `style`. Typecheck, lint, build.

### Phase 4 — Show the loader between Partner Dashboard screens

**Model: Opus 5.5 · Effort: high.** Touches every `/owner/*` page's loading path and the dashboard's
first render; easy to introduce a flash, a double loader or a stuck one.

Scope: signed-in dark `/owner/*` screens (dashboard, Venue Display, Billing, Game Settings, Account,
Schedule/Competitions sub-pages). **Q1 answered "everywhere": player screens also lose the
basketball** — see §6 and the Phase 1 handoff for the extended scope.

1. **Route transitions:** add `app/owner/loading.tsx` rendering `HightopLoader` centred on the dark
   canvas, below where the app bar sits. Today navigation into an owner route falls back to the root
   `app/loading.tsx` (the orange basketball), which is wrong for partners.
2. **Page first-load states:** replace each page's full-page "loading" placeholder with the loader:
   `app/owner/dashboard/page.tsx` (the two `SectionSkeleton`s while venues load),
   `app/owner/display/page.tsx`, `app/owner/billing/page.tsx`, `app/owner/billing/setup/page.tsx`,
   `app/owner/account/page.tsx`, `app/owner/game-settings/page.tsx` (find with
   `grep -rln "SectionSkeleton\|Loading" app/owner`).
3. **Dashboard: one loader, not loader-then-skeletons.** Keep the loader up until venues **and** both
   lists have answered (success or error), then reveal the page in one step. Keep
   `SectionSkeleton` only for in-place refreshes (Retry), and keep today's "rows stay until the
   refetch arrives" behaviour after a save — no loader for those.
4. **Login → dashboard:** on the owner sign-in success (`app/owner/login/page.tsx:45`,
   `router.push("/owner/dashboard")`), show the loader immediately so the tap feels answered.
5. **Do not** put the loader inside sheets (Schedule, Rewards, Store, Partner Manual) — they open
   instantly — and do not use it for the Stripe hand-off (Stripe's own page takes over).
6. Check `GlobalTransitionOverlay` (`tp:global-transition-show` events) is never triggered on
   `/owner/*`, so two overlays can't stack.

**Tests.** New `tests/owner-loader-contract.test.ts`: `app/owner/loading.tsx` exists and renders
`HightopLoader`; no `/owner/*` page renders `BouncingBallLoader`; the dashboard's initial state
renders the loader. Run `npm run test` (navigation + owner contracts), typecheck, lint, build. Add
loader checks to `docs/partner-dashboard-app-redesign-device-checklist.md` (cold open, menu → Billing
→ Back, slow connection, Reduce Motion).

### Phase 5 — Dashboard data in one round trip

**Model: Opus 5.5 · Effort: high.** New authenticated endpoint; venue-ownership checks must be exact.

- Add `GET /api/owner/dashboard` (optional `?venueId=`): one `requireOwnerAuth`, then the venue list
  (same query and `display_name ?? name` mapping as `app/api/owner/venues/route.ts`), then — for the
  requested venue if the caller owns it (`ownsVenue`), else the first venue — the schedules
  (`listOwnerSchedules(venueId)`, as in `app/api/owner/schedule/route.ts`) and competitions (same
  lister `app/api/owner/competitions/route.ts` uses) in parallel with `Promise.all`. Extract the
  competitions query into a shared `lib/` function rather than copying it. Each list carries its own
  `ok`/`error` so one failure still shows the other section (today's per-section error behaviour).
- Same 401 contract as the other owner routes (`no_session` / `no_venue` codes from
  `lib/ownerAuthCodes.ts`, consumed by `ownerAuthRecoveryPath`).
- Dashboard first load uses only this endpoint. Venue switch, Retry and post-save refetch keep using
  the existing per-list endpoints (unchanged, still used by sheets).
- Start the request as early as possible: kick it off in the page component's first effect, not
  after a separate venues round trip.
- **Optional, measure first:** if Phase 7's numbers still show a slow first paint, consider server-
  rendering the dashboard shell with this data (read the owner session server-side). That is a larger
  refactor of a `"use client"` page and is **not** part of this phase.

**Cost.** 3 function invocations and ~9 database queries per dashboard open → 1 invocation and ~5
queries. Lower, not higher.

**Tests.** Route tests in the style of the existing `tests/api.*` files: unauthenticated → 401 with
the right code; a venue the caller does not own is never returned (falls back to their first
venue); one list failing returns the other; empty-venue account. Contract: the dashboard's first
load calls `/api/owner/dashboard` and not the three separate routes. Full gates.

### Phase 6 — Fonts and player-only code off the partner pages

**Model: Opus 5.5 · Effort: high.** Both changes touch the root layout, which every player and
partner page uses. Visual regressions are the main risk.

1. **Self-host fonts with `next/font/google`** (Bree Serif; Nunito 400/600/700/800/900) in
   `app/layout.tsx`, exposed as CSS variables, and remove the `@import` from `app/globals.css:1`.
   Keep the `font-family` names that existing classes use (e.g.
   `[font-family:'Bree_Serif','Nunito',serif]` in `BouncingBallLoader`) working — map them through
   the variables or update the references; grep for `Bree` and `Nunito` across `app/`,
   `components/`, `tailwind.config.ts` and `lib/themeTokens.ts`. Removes two third-party
   connections from every first load, app-wide.
2. **Keep player-only runtime off `/owner/*` (and `/admin`).** Move `AnimationOverlay`,
   `GlobalTransitionOverlay`, `PopupAds`, `MobileAdhesionAd` and `AnalyticsRuntime` behind a client
   `PlayerRuntime` wrapper that loads them with `next/dynamic` only when the path is not an owner or
   admin path, so their code is never downloaded there. `AuthSessionProvider` wraps all children —
   only change it if a measured bundle check shows a clean way to skip the Supabase client on
   `/owner/*`; otherwise record it as a follow-up. Do **not** restructure the app into route groups
   in this phase.
3. Measure the dashboard's JavaScript before and after (the manifest method in section 2, F5) and
   record it.

**Tests.** Full gates, plus `npm run test:pwa-contract`, `npm run test:god-mode-join`, and a quick
visual pass of the player join flow, a venue home and one game for font changes. Ads must still
render on the player routes that show them today (check `PopupAds`/`MobileAdhesionAd` page keys).

### Phase 7 — Re-measure, review, device pass, docs

**Model: Opus 5.5 · Effort: medium.**

- Repeat Phase 2's exact measurement and put before/after numbers side by side in the handoff
  (bytes, requests, LCP, time to games list, API p50/p95, Vercel bandwidth trend). Report anything
  that did not improve.
- Run `/code-review` on the full change set and fix confirmed findings.
- Update `CLAUDE.md` (Partner Dashboard bullets: header store button, `HightopLoader` as the
  partner loading screen, `/api/owner/dashboard`, `/brand/web/` immutable-name rule) and
  `SYSTEM_CONTEXT.md`.
- Hand Andrew the device checklist items from Phases 1 and 4. Push/deploy is Andrew's call.

**As built (2026-10-01).** Done; full record in
`docs/partner-dashboard-merch-button-loader-speed-plan_PHASE_7_HANDOFF.md`. All four measurements
reproduced Phase 6 to the millisecond on a fresh build, and the player join screen was measured for
the first time (closing Phase 2 §6's gap). `/code-review` at effort `high` returned five findings:
**fixed** — the one-round-trip seed was never consumed, so a venue switch away and back re-adopted
a session-start payload and suppressed both refetches (regression test P5); the sign-in success path
left `submitting` set forever, stranding a partner behind the loader if `router.push` never landed
(12 s watchdog + 4 new tests); an intermittent F4 failure in
`tests/app.owner-dashboard-merch.test.ts` caused by `DashboardBody` mounting after the test's
`go()` and normalising the sheet depth (made deterministic, then four clean full-suite runs); and a
factually wrong `PlayerRuntime` comment claiming all five runtimes SSR to `null`. **Not fixed, by
design** — the 512 px logo rendered at 320 CSS px is soft at DPR 3; that is Andrew's standing open
question from Phase 2 and costs ~100 KB to resolve, so it was left to him. API p50/p95 (needs the
paid Observability Plus add-on, 402) and the Vercel bandwidth trend (needs a deploy) remain
unobtainable, as in Phase 2.

---

## 5. Order and dependencies

Phase 1 is independent and can ship alone. Phase 3 needs Phase 2's small logo file. Phase 4 needs
Phase 3 approved. Phase 5 is independent of 3–4 (can run in parallel with them). Phase 6 is
independent but best after Phase 2 so measurements separate cleanly. Phase 7 last.

Expected impact on a new phone, largest first: Phase 2 (~3.3 MB less to download), Phase 5 (one
round trip and one cold start instead of two rounds and three), Phase 6 (two fewer third-party
connections; less JavaScript). Phases 3–4 make the wait look intentional; they don't shorten it.

---

## 6. Questions for Andrew — ANSWERED 2026-10-01

- **Q1. Where does the logo loader appear?** **Answer: everywhere. Get rid of the basketball.**
  The loader replaces `BouncingBallLoader` on player screens too (root `app/loading.tsx` via
  `RouteLoadingScreen`, `app/nfl-pickem/loading.tsx`, `GlobalTransitionOverlay`, and ~41 in-page
  uses across ~18 files at Phase 1 time). This widens Phase 4 — see the Phase 1 handoff for the
  suggested split (4a partner, 4b player).
- **Q2. Which spin?** **Answer: make it spin, and in different directions if possible — spin,
  stop, then spin the other way. A fun / cool / interesting entrance is welcome too.** Phase 3
  designs a loop that alternates direction (e.g. hop + clockwise turn → land/pause → hop +
  counter-clockwise turn → land), and may replace the plain pop with a livelier entrance.
  Reduce Motion still gets the soft fade only.
- **Q3. Very narrow phones.** **Answer: below 360 px the button reads "Store"** (bag icon +
  "Store"), not "Merch". Built in Phase 1.
