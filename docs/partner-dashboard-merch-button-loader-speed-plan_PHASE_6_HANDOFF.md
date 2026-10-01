# Phase 6 Handoff — fonts self-hosted, player-only code off the partner pages

Plan: `docs/partner-dashboard-merch-button-loader-speed-plan.md` · Phase 6 finished 2026-10-01.
Previous: `…_PHASE_5_HANDOFF.md` (dashboard in one round trip), `…_PHASE_4_HANDOFF.md` (the loader on
every screen), `…_PHASE_3_HANDOFF.md` (the loader itself), `…_PHASE_2_HANDOFF.md` (baseline numbers +
logo files), `…_PHASE_1_HANDOFF.md` (header store button, your Q1–Q3 answers).

## For Andrew (plain English)

- **What changed — two things, both invisible on screen.**
  1. **The app no longer borrows its lettering from Google.** Our two typefaces (Bree Serif for
     headings, Nunito for everything else) used to be fetched from Google's servers every time
     someone opened the app. The phone had to load our stylesheet, *then* ask Google for a second
     stylesheet, *then* ask a third Google server for the actual letter shapes — three steps in a
     row, on two companies' servers, before any text could settle. Both typefaces now ship from our
     own server, downloaded alongside everything else instead of after it.
  2. **Partners stopped downloading the players' game code.** Every page in the app — including the
     Partner Dashboard — was downloading the gameplay animations (all 18 of them), the two
     advertising surfaces, the venue-entry transition screen and the player analytics. A partner
     never runs any of it. Those five now load only on player screens.
- **How much faster, measured.** On a simulated new phone (Slow 4G, 4× slower processor), Partner
  Dashboard, median of 5 cold loads:

  | | before (Phase 5) | after | change |
  |---|---|---|---|
  | Things the phone downloads | 31 requests | **25** | −6 |
  | Bytes downloaded | 421 KB | **352 KB** | **−69 KB (−16%)** |
  | Page load | 2,468 ms | **2,103 ms** | **−365 ms (−15%)** |

  And the number Phase 5 flagged as *the* remaining problem — how long before the dashboard can even
  ask the server for your games — went from **+2,493 ms to +2,136 ms (−360 ms, −14%)**.
- **The partner sign-in page gained the most from the font change**, because that page is mostly
  text: the moment its main text appears went from **1,664 ms to 1,300 ms (−22%)**.
- **The honest caveat, again.** This helped, but it did not dissolve the 2.1-second head. The
  dashboard still waits on ~680 KB of JavaScript, and the two biggest pieces are shared libraries
  (a 186 KB sign-in library and a 127 KB animation library) that Phase 6 was not allowed to touch —
  see "what I did NOT do" below. Phase 7 re-measures everything and decides what, if anything, is
  worth doing next.
- **Nothing on screen changed.** I checked the player sign-in, a venue home, Prop Bingo, Speed
  Trivia and the Partner Dashboard in a real browser: every heading still renders in Bree Serif,
  every body text in Nunito, and no page threw an error. Ads still fire on player screens and still
  do not on partner screens.
- **Cost:** lower, on every page in the app for players and partners alike — fewer bytes, and two
  fewer third-party companies' servers to connect to. No new server work, no database change, no
  cron, no env var, no `vercel.json` change.
- **Is it live?** **No.** Phases 1–6 are all saved on this computer only — not committed, not
  pushed, not deployed. Still your call.
- **What I need from you:** nothing new. The two open items are unchanged from Phases 4 and 5:
  section **H** of `docs/partner-dashboard-app-redesign-device-checklist.md` (ten phone checks only
  you can do), and whether to commit / push / deploy.

---

## For the next agent (Phase 7 — re-measure, code review, docs, device pass; Opus 5.5, medium)

### 1. Goal and scope

Plan §4 **Phase 7** exactly as written:

- Repeat Phase 2's measurement and put before/after side by side (bytes, requests, LCP, time to
  games list, API p50/p95, Vercel bandwidth trend). **Report anything that did not improve** —
  §5.1 below names one metric that is noise, not a win, and §5.2 names one that genuinely did not
  move.
- Run `/code-review` on the full Phases 1–6 change set and fix confirmed findings.
- Update `CLAUDE.md` and `SYSTEM_CONTEXT.md`. The **accumulated, still-unwritten** list is in §7.
- Hand Andrew the device-checklist items from Phases 1 and 4.

**Out of scope:** any new optimization. In particular **do not** start the server-rendered dashboard
shell or the `AuthSessionProvider` split without asking Andrew first (§6.3, §6.4).

### 2. Starting state

- Branch `main`, last commit **`e900ce7`**. **Phases 1–6 are ALL uncommitted**; nothing pushed,
  nothing deployed. No database, Supabase, env var, cron or `vercel.json` change in any of the six
  phases. **No migration** anywhere in this plan, so the Supabase grants checklist and
  `tests/supabase-migration-grants-contract.test.ts` do not apply.
- Commit trailer if Andrew asks for a commit:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Phase 6's own files** are exactly these 21:
  - **New (4):** `components/ui/PlayerRuntime.tsx`, `lib/playerRuntimePaths.ts`,
    `tests/fonts-contract.test.ts` (7 tests), `tests/player-runtime-contract.test.ts` (12 tests)
  - **Changed, both halves:** `app/layout.tsx` (fonts *and* the `PlayerRuntime` mount)
  - **Changed, fonts only (2):** `app/globals.css`, `components/ui/HightopLoader.tsx` (line 100 —
    note this file is still *untracked*, it was created in Phase 3)
  - **Changed, font call sites only (13):** `components/animations/BingoWinAnimation.tsx`,
    `components/animations/CategoryBlitzModeFlipTakeover.tsx`, `components/bingo/BingoBoardCard.tsx`,
    `components/bingo/SportsBingoHome.tsx`, `components/bingo/SportsBingoSelectBoard.tsx`,
    `components/category-blitz/CategoryBlitzGame.tsx`, `components/category-blitz/RoundStartReveal.tsx`,
    `components/nfl-pickem/NFLPickEmGameList.tsx`, `components/pickem/PickEmGameList.tsx`,
    `components/venue/GameChrome.tsx`, `components/venue/GameIdentityPanel.tsx`,
    `components/venue/VenueGamesPanel.tsx`, `components/venue/VenueHubHeaderBar.tsx`
  - Everything else in `git status` belongs to Phases 1–5 (see their handoffs). To re-derive this
    list: `for f in $(git status --porcelain | awk '{print $2}'); do git diff -- "$f" | grep -q "ht-font-display" && echo "$f"; done`

### 3. Decisions made in Phase 6 (do not re-ask, do not quietly undo)

1. **Every call site goes through `--ht-font-display` / `--ht-font-body`, not a literal family
   name — and the reason is NOT the one the plan assumed.** The plan (and my first draft of the
   code comments) said `next/font` generates a hashed family name, so literals would break.
   **That is wrong for Next 16**: it emits the real names, `"Bree Serif"` and `"Nunito"`, so
   `font-family: "Bree Serif"` would still have resolved. I verified this in the built CSS.
   The rewrite is still right, for a different and real reason: `next/font` *also* generates a
   **metric-matched fallback face** (`"Bree Serif Fallback"` / `"Nunito Fallback"`) whose
   ascent/descent/width are adjusted to the real font so text does not jump when the webfont swaps
   in — and **only the `.variable` value carries that fallback**. A hand-written literal silently
   gives up the layout-shift protection. The comments in `app/layout.tsx` and `app/globals.css` now
   state this correctly; `tests/fonts-contract.test.ts` enforces it.
2. **39 call sites were rewritten mechanically, 1:1**, across 13 components. Three of them used the
   ambiguous Tailwind shorthand `font-['Bree_Serif',…]`; all are now the unambiguous arbitrary
   property `[font-family:var(--ht-font-display)]`, because `font-[var(--x)]` cannot be resolved by
   Tailwind as family-vs-weight. Do not reintroduce the shorthand.
3. **All 39 mapped to `--ht-font-display`,** including the handful that read
   `'Bree Serif', serif` with no Nunito in the chain. The only difference is which font shows during
   the brief load window, and consistency is worth more than preserving two near-identical chains.
4. **Nunito is declared with no `weight`,** because it is a variable font: one file covers the
   400/600/700/800/900 the old `@import` listed separately. Bree Serif is not variable and is pinned
   to `weight: "400"`. Both use `display: "swap"`.
5. **The font variables are applied to `<html>`, not `<body>`,** so the `:root` rule in globals.css
   that reads them resolves on the same element.
6. **`PlayerRuntime` gates on one shared predicate, `isPlayerRuntimePath` in
   `lib/playerRuntimePaths.ts`** — never a hand-rolled `startsWith("/owner")` at the call site
   (the contract test fails the build on that string in the component).
7. **The predicate FAILS OPEN to the player.** An unknown path (`null`/`undefined`/`""`) counts as a
   player path. The asymmetry is deliberate: a player silently losing ads, gameplay animations or
   the venue-entry transition is a real regression, while a partner briefly mounting five components
   that already no-op on `/owner/*` costs only the bytes this change saves. **Do not invert this.**
8. **It matches on a path SEGMENT**, so `/ownership` and `/administrator` stay player paths. Pinned
   by a test.
9. **All five use `ssr: false`.** Every one of them renders `null` on the server today (they are
   effect-driven and read `window` / `localStorage` / `matchMedia`), so nothing leaves the markup.
10. **`PlayerRuntime` stays inside `AnimationTriggerProvider`** — `AnimationOverlay` reads it via
    `useAnimationOverlayState()`. Pinned by an ordering test.
11. **`AuthSessionProvider` was deliberately NOT deferred** — see the measurement in §6.3. The plan
    allowed deferring it only if a measured check showed a clean way; it does not.
12. **`AnimationTriggerProvider` was not touched either.** It is not on the plan's list, and the
    plan forbids restructuring into route groups in this phase.

### 4. Files created / changed

**4.1 — `lib/playerRuntimePaths.ts` (new)**
`NON_PLAYER_PATH_PREFIXES = ["/owner", "/admin"]` and
`isPlayerRuntimePath(pathname: string | null | undefined): boolean`. Pure, no `server-only`, no
React — so it unit-tests directly and the prefix list has one home. Segment-matching and fail-open
are both documented in the file.

**4.2 — `components/ui/PlayerRuntime.tsx` (new, `"use client"`)**
Five `next/dynamic` declarations (`AnimationOverlay`, `GlobalTransitionOverlay`, `AnalyticsRuntime`,
`PopupAds`, `MobileAdhesionAd`), all `{ ssr: false }`, then
`if (!isPlayerRuntimePath(usePathname())) return null;`. The file's header comment explains why
`next/dynamic` rather than a plain conditional (a static import lands in the layout's own chunk,
which every route downloads regardless of what the component then renders).

**4.3 — `app/layout.tsx`** (both halves)
- Added `import { Bree_Serif, Nunito } from "next/font/google"` and the two font declarations with
  `variable: "--font-bree-serif"` / `"--font-nunito"`.
- `<html>` className became `` {`m-0 p-0 ${breeSerif.variable} ${nunito.variable}`} ``.
- Removed the five static imports; added `PlayerRuntime` and replaced the five JSX mounts with
  `<PlayerRuntime />` plus a comment pointing at `lib/playerRuntimePaths.ts` and finding F5.

**4.4 — `app/globals.css`**
- Deleted line 1, the `@import url("https://fonts.googleapis.com/css2?…")`.
- `--ht-font-display: var(--font-bree-serif), Georgia, serif;` and
  `--ht-font-body: var(--font-nunito), "Segoe UI", "Helvetica Neue", Arial, sans-serif;`
- The `h1,h2,h3,h4` rule now reads `font-family: var(--ht-font-display);`.

**4.5 — tests**
- **`tests/fonts-contract.test.ts`** (7). No Google Fonts reference in `globals.css` or any source
  file; the layout declares both families through `next/font/google` with both variables and
  `display: "swap"`; both variables are applied to `<html>`; the tokens point at them; and **no
  source file names either family literally**.
- **`tests/player-runtime-contract.test.ts`** (12). `isPlayerRuntimePath` across player paths,
  owner/admin paths, the `/ownership` segment case, the fail-open case and the pinned prefix list;
  the layout imports none of the five statically and mounts `PlayerRuntime` inside
  `AnimationTriggerProvider` while keeping `AuthSessionProvider`; and the component loads all five
  through `next/dynamic` with `ssr: false` and gates on the shared predicate.
- **Both tests strip `//` and `/* */` comments before scanning**, so a string documented in a
  comment is not counted as a reference. `app/layout.tsx` deliberately names the removed Google
  Fonts URL in a comment; without the stripping that test fails on its own documentation.

### 5. Facts and traps

**5.1 — `readyMs` / LCP on the dashboard is NOISE at this scale; do not build a claim on it.**
Two 5-run medians of the *same* build an hour apart gave **2,944 ms** and **3,443 ms**, with a raw
spread of 2,873–3,596 ms. The reason is that `readyMs` waits for the live `/api/owner/dashboard`
call against the real Supabase, so it carries whatever the database is doing. By contrast `loadMs`
was rock stable (2,100–2,112 ms across both sessions) and bytes/requests are exact. **Phase 7 should
report `loadMs`, requests and bytes as the deltas, and either drop the LCP/`readyMs` column or state
its spread.** Phase 5's handoff §5 already warned this column was not comparable after Phase 4 — it
is now also too noisy to compare at all. The stable substitute is the direct instrumentation in
§6.2.

**5.2 — the big shared chunks did NOT move, and Phase 6 could not move them.** `/owner/dashboard`'s
remaining ~682 KB is dominated by two chunks Phase 6 was not allowed to touch:
`9470…js` **186.2 KB = Supabase** (reached only through `AuthSessionProvider`) and
`9859…js` **127.4 KB = framer-motion**. Identify a chunk by grepping it for marker strings:
`node -e 'const s=require("fs").readFileSync(".next/static/chunks/<name>.js","utf8"); for (const k of ["@supabase","framer-motion","MotionConfig","spring"]) console.log(k,(s.match(new RegExp(k,"g"))||[]).length)'`

**5.3 — the manifest measurement over-counts; prefer the browser number.** Scraping
`static/chunks/*.js` out of `page_client-reference-manifest.js` (the method in plan §2, F5) lists
client modules the route does not actually load — `/owner/billing` "contains" the 186 KB Supabase
chunk although nothing on it uses Supabase. It is fine as a **like-for-like** before/after because
the bias is constant, but it is not what the phone downloads. The honest number is
`scripts/measure-owner-load.cjs`'s `transferred`. Both are reported in §6 and labelled.

**5.4 — Next 16 keeps the real font family names.** See decision 3.1. If a future agent "optimizes"
by putting literals back because they appear to work, they will be removing the metric-matched
fallback without noticing. The test is the guard.

**5.5 — `npx next start` serves the build that existed when it STARTED.** Measuring after a rebuild
without restarting the server silently measures the old bundle. Restart it:
`pkill -f "next start -p 3100"`, wait ~2 s, start again, wait ~7 s.

**5.6 — Running a Playwright script from outside the repo needs
`NODE_PATH=/Users/andrewserulneck/Documents/Trivia-Predictions/node_modules`** (hit in Phases 4, 5
and again here — a scratchpad script fails with `Cannot find module 'playwright'` without it).

**5.7 — carried over from Phase 5, still true:** don't run `npx tsc --noEmit` concurrently with
`npm run build` (`.next/types` regenerates); `npm run lint` prints a harmless Babel "deoptimised
styling of `lib/sportsBingo.ts`" note; `npm run test` is the gate, not a named `test:*` script; and
`tests/owner-dashboard-contract.test.ts` slices the dashboard page by string index, so renaming
`const DashboardBody` / `type MerchStoreHostProps` / `const OwnerDashboardPage` silently empties a
slice.

**5.8 — the build is still 180 pages.** Phase 6 added no route. If a later phase reports 179 or 181,
something was lost or added unintentionally.

**5.9 — a mount-time event dispatcher would now be a real bug.** The five runtimes attach a few
milliseconds later than before (their chunks load at hydration). The only event-driven one is
`GlobalTransitionOverlay` (`tp:global-transition-show`), and all three dispatchers are inside
`JoinFlow`'s venue-selection handlers — a user tap, long after hydration, so this is safe today.
**Do not add a dispatcher that fires on mount without buffering the event.** This is written in the
`PlayerRuntime` header comment too.

### 6. How to build, run and test — and what was verified

```
npx vitest run tests/fonts-contract.test.ts            #  7 passed
npx vitest run tests/player-runtime-contract.test.ts   # 12 passed
npx tsc --noEmit                                       # clean
npm run lint                                           # clean
npm run test                                           # 282 files passed / 1 skipped;
                                                       # 3,020 passed / 13 skipped / 0 failed
npm run test:pwa-contract                              # 20 passed
npm run test:god-mode-join                             # 34 passed (5 files)
npm run build                                          # ✓ Compiled successfully, 180 pages
```
(3,001 → 3,020 tests = the 19 new ones. No existing test needed a change.)

**6.1 — the fonts really are self-hosted.** Against `npx next start -p 3100`:

| Check | Result |
|---|---|
| `.next/static/media/*.woff2` emitted | 7 files; the two **preloaded** are **10.1 KB** (Bree Serif latin) + **38.2 KB** (Nunito latin variable) |
| `fonts.googleapis.com` / `fonts.gstatic.com` in any built asset | **0** |
| Preload tags in the served HTML | both, `as="font" type="font/woff2"`, from **our** origin |
| Google Font requests in a real page load | **0** on both `/` and `/owner/dashboard` |
| Emitted `@font-face` family names | `"Bree Serif"`, `"Bree Serif Fallback"`, `Nunito`, `Nunito Fallback` |

**6.2 — measured before/after** (`node --env-file=.env.local scripts/measure-owner-load.cjs --runs 5`,
Slow 4G 1.6 Mbps / 150 ms RTT + 4× CPU, 375×812 DPR 3, median of 5). "Before" is the Phase 5
handoff's table, same script, same machine, same day:

| Page | metric | before | after | change |
|---|---|---|---|---|
| /owner/dashboard | requests | 31 | **25** | −6 |
| | transferred | 421 KB | **352 KB** | **−69 KB (−16%)** |
| | load event | 2,468 ms | **2,103 ms** | **−365 ms (−15%)** |
| | owner API calls | 1 | **1** | unchanged ✓ |
| /owner/login | requests | 43 | **38** | −5 |
| | transferred | 484 KB | **457 KB** | −27 KB |
| | load event | 2,597 ms | **2,290 ms** | −307 ms |
| | **LCP** | 1,664 ms | **1,300 ms** | **−364 ms (−22%)** |

`/owner/login`'s LCP is the clearest font win (that page is mostly text). The dashboard's LCP is the
noisy metric — see §5.1.

**The headline number from Phase 5** — when the dashboard's first request is actually *sent*
(scratchpad instrumentation, 3 runs, same throttling):

| | runs | median |
|---|---|---|
| before (Phase 5) | +2,493 / +2,498 / +2,499 ms | **+2,493 ms** |
| after (Phase 6) | +2,150 / +2,136 / +2,128 ms | **+2,136 ms** |

**−357 ms (−14%).** Real, and the most trustworthy single number in this phase — but the 2.1 s head
is still there.

**JavaScript, manifest method** (plan §2 F5 — like-for-like only, see §5.3):

| | before | after |
|---|---|---|
| /owner/dashboard | 749.3 KB / 24 chunks | **681.7 KB / 21 chunks** |
| /owner/billing | 650.9 KB / 22 chunks | **583.3 KB / 19 chunks** |
| the layout chunk itself | **82.7 KB** | **30.1 KB (−64%)** |

**6.3 — why `AuthSessionProvider` was NOT deferred (the measured check the plan asked for).**
The 186.2 KB Supabase chunk is reachable on `/owner/*` only through it — nothing under `app/owner/`,
`components/owner/` or `app/admin` imports `@/lib/supabase` or `@/lib/auth`
(`components/admin/AdminConsole.tsx` does, but that is the admin console's own use, not the layout's).
So the bytes are real and the prize is the single biggest one left. It is **not clean**, because two
*other* layout-level components consume its context from the same layout:
`components/auth/AuthNavigationGuard.tsx` and `components/auth/LoginStuckStateBreaker.tsx`, both via
`useAuthSession()`. Deferring the provider means deferring those two as well and preserving context
identity across the split. That is a different, larger change than the one this phase authorised.
**Recorded as a follow-up, as the plan instructs. Ask Andrew before starting it.**

**6.4 — real-browser visual pass** (`npx next start -p 3100`, 390×844 DPR 2, Chromium; player
cookies minted from `SESSION_SECRET` for user `3be3b704-1696-4097-817f-abefff808b51` at
`venue-pacific-street`; owner cookie as in Phase 5). Screenshots were taken and inspected:

| Screen | Heading font | Faces loaded | JS errors |
|---|---|---|---|
| `/` (player sign-in) | "How do you want to continue?" → **Bree Serif** | Bree Serif, Nunito | none |
| `/venue/venue-pacific-street` | "Pacific Street" → **Bree Serif** | Bree Serif, Nunito | none |
| `/bingo` | "Menu" → **Bree Serif** | Bree Serif, Nunito | none |
| `/trivia` | "Choose a Category" → **Bree Serif** | Bree Serif, Nunito | none |
| `/owner/dashboard` | "Partner Dashboard" → **Bree Serif** | Bree Serif, Nunito | none |

The venue home's game-card titles (CATEGORY BLITZ / SPEED TRIVIA / NFL PICK 'EM) and Prop Bingo's
title, B-I-N-G-O letters and 25 card squares all render in Bree Serif — those are the
`GameIdentityPanel` / `VenueGamesPanel` / `SportsBingoHome` call sites the rewrite touched, i.e. the
highest-risk surfaces, confirmed correct.

**6.5 — the player/partner split works.** Same browser run:

| | `/` | `/owner/dashboard` |
|---|---|---|
| `/api/ads/slot` request fires | **YES** (page key `join`) | **no** ✓ |
| JS chunks loaded | 29 | **18** |

Ad page keys were re-read in both `PopupAds.tsx` and `MobileAdhesionAd.tsx`: `/` and `/join` → `join`,
`/venue/*` → `venue`, `/trivia/live` → `live-trivia`, `/trivia` → `speed-trivia`, `/bingo` →
`sports-bingo`, `/pickem` → `pickem`, `/fantasy` → `fantasy`. Unchanged by this phase.

**Unverified / risky:**
- **No real phone.** Device-checklist section **H** is still entirely open.
- **Fonts were checked on 5 screens, not all 180 pages.** The contract test proves no literal family
  survives anywhere, and the token resolves identically on every page, so the remaining risk is
  cosmetic and low — but `/tv`, `/info`, `/admin` and the Fantasy and Predictions games were not
  looked at.
- **`prefers-reduced-motion` was not re-checked** in this phase. Nothing here touches motion, but
  `GlobalTransitionOverlay` and `AnimationOverlay` now mount a beat later.
- **Nothing was measured on a cold Vercel deployment** — all numbers are local `next start`.
- **The 2.1 s head was not explained further.** It is JavaScript download + hydration; the two
  biggest contributors are named in §5.2 and both were out of scope.

### 7. Open questions / waiting on Andrew

1. **Device-checklist section H** (`docs/partner-dashboard-app-redesign-device-checklist.md`) — ten
   phone checks, only he can do them. Unchanged from Phases 4 and 5.
2. Whether to commit / push / deploy Phases 1–6 — still his call, nothing is live.
3. **`AuthSessionProvider` / the 186 KB Supabase chunk on `/owner/*`** — measured, real, and *not*
   clean (§6.3). Needs Andrew's go-ahead; it is the biggest single remaining win.
4. **The server-rendered dashboard shell** — still only an option (plan §4 Phase 5's last bullet).
   Phase 5 recommended deciding after Phase 6's numbers. Those numbers are now in: Phase 6 took the
   head from 2.49 s to 2.14 s, so the slow first paint is **reduced but not solved**. My reading is
   unchanged from Phase 5's — the remaining cost is bundle size, not render strategy, and the two
   biggest chunks are items 3 above and framer-motion. Ask Andrew; do not start it unasked.
5. Carried over, still open: the `ChevronRight`-vs-logo top-left button (Phase 4), and whether the
   big sign-in logo looks soft on a 3× phone (Phase 2).

### 8. The accumulated docs debt Phase 7 must clear

`CLAUDE.md` and `SYSTEM_CONTEXT.md` have **not** been touched since Phase 1. Phase 7 must record all
of it:

- **Phase 1:** the Partner Dashboard header "Order Join Merch" button (and "Store" below 360 px).
- **Phases 3–4:** `components/ui/HightopLoader.tsx` is the ONE loading screen app-wide;
  `BouncingBallLoader` is deleted; `app/owner/loading.tsx` exists.
- **Phase 2:** `/brand/web/` files are immutable-cached, so **a logo change must ship under a new
  file name**.
- **Phase 5:** `GET /api/owner/dashboard` is the dashboard's single first-load call;
  `lib/ownerVenueList.ts` is the single venue-list query; the per-list endpoints still serve Retry,
  the venue switch and post-save refetches.
- **Phase 6:** fonts are self-hosted via `next/font` and **the literal family names must never come
  back** — `--ht-font-display` / `--ht-font-body` only (the reason is the metric-matched fallback
  face, §3.1); and `/owner/*` + `/admin` do not load the player runtime, gated by the single
  predicate `isPlayerRuntimePath` in `lib/playerRuntimePaths.ts`, which **fails open to the player**.
- The new tripwires to name alongside the existing ones: `tests/fonts-contract.test.ts` and
  `tests/player-runtime-contract.test.ts` (both run under plain `npm run test`).

### 9. Recommended first steps for Phase 7 (Opus 5.5, medium)

1. **Re-measure in one sitting, same session.** Start `npx next start -p 3100` **after** a fresh
   `npm run build` (§5.5), then `node --env-file=.env.local scripts/measure-owner-load.cjs --runs 5`.
   Use `loadMs` / requests / transferred as the deltas and treat LCP and `readyMs` per §5.1.
2. **Re-run the first-request instrumentation** — it is the most trustworthy number across the whole
   plan. The script is throwaway; §6.2 has the three before/after readings and the method is six
   lines of CDP (`Network.requestWillBeSent`, first request vs the `/api/owner/dashboard` one).
3. **Then `/code-review`** across Phases 1–6. It is a large diff (78 changed entries in
   `git status`), so consider reviewing it in the plan's phase groupings rather than all at once.
4. **Then the docs**, working from §8 — that is the longest single remaining task and it is pure
   writing.
5. Gates before reporting done: `npm run test`, `npm run test:pwa-contract`,
   `npm run test:god-mode-join`, `npx tsc --noEmit`, `npm run lint`, `npm run build` (not
   concurrently with tsc).
6. Finish with `…_PHASE_7_HANDOFF.md` and update the plan's status line.
