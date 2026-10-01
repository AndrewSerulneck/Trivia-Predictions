# Phase 7 Handoff — re-measure, code review, docs. The plan is COMPLETE.

Plan: `docs/partner-dashboard-merch-button-loader-speed-plan.md` · Phase 7 finished 2026-10-01.
Previous: `…_PHASE_6_HANDOFF.md` (self-hosted fonts + player/partner code split),
`…_PHASE_5_HANDOFF.md` (dashboard in one round trip), `…_PHASE_4_HANDOFF.md` (the loader on every
screen), `…_PHASE_3_HANDOFF.md` (the loader itself), `…_PHASE_2_HANDOFF.md` (baseline + logo files),
`…_PHASE_1_HANDOFF.md` (header store button, your Q1–Q3 answers).

## For Andrew (plain English)

**All seven phases are done. Nothing is live — it is all still saved on this computer only.**

### What this phase did

Three things, in this order: measured everything again, had the whole six-phase change set
code-reviewed, and wrote down what we learned in the two files that tell the next agent how this
project works.

### The numbers, start to finish

Measured the same way every time: a simulated new phone on a slow 4G connection with a processor
four times slower than a desktop, empty cache, five loads, middle number reported.

| Partner Dashboard, first visit | before the plan | now | change |
|---|---|---|---|
| Data downloaded | 2,056 KB | **352 KB** | **−83%** |
| Things downloaded | 32 | **25** | −7 |
| Page finished loading | 10,414 ms | **2,106 ms** | **−80%** |
| Games list on screen | 10,438 ms | **~2,970 ms** | **−72%** |
| Server calls to show the page | 3 | **1** | −2 |

| Partner sign-in page | before | now | change |
|---|---|---|---|
| Data downloaded | 3,714 KB | **458 KB** | **−88%** |
| Page finished loading | 18,545 ms | **2,318 ms** | **−88%** |
| Main text on screen | 1,660 ms | **1,316 ms** | **−21%** |

The player join screen, which I measured for the first time this phase (it was the one gap left):
**509 KB** and the main logo on screen at **1,312 ms**, downloading **zero** of the old 1.7 MB
picture files. Before the plan that one screen alone pulled 3.4 MB of logo.

**Two honest caveats.** First, these are measured against a production build running on this
computer — there is no real network, no CDN and no cold server start in the numbers, so the real
phone numbers will be worse than these in absolute terms; the *improvements* are what transfers.
Second, I could not get the two things the plan asked for that need the live site: Vercel's
per-route timings need a paid add-on we don't have (Phase 2 hit the same wall), and a bandwidth
trend needs this to be deployed first. Both stay open until you deploy.

**What did NOT improve:** nothing got worse, but two things did not move at all. The 2.1-second
head on the dashboard is still there — it is the time the phone spends downloading and starting up
JavaScript, and the two biggest pieces (a 186 KB sign-in library and a 127 KB animation library)
were out of scope for every phase of this plan. Phase 6 already flagged this. See "still open"
below.

### The code review found five things. I fixed four.

1. **A real bug, and the worst of the five.** If your account has more than one venue: open the
   dashboard, schedule a game at venue A, switch to venue B, then switch back to A — **the game you
   just scheduled disappeared.** No error, no loading spinner, just gone until you reloaded the
   page. The one-round-trip speed-up from Phase 5 keeps the first batch of data it fetched, and
   coming back to a venue re-used that old batch instead of asking again. Fixed, and there is now a
   test that fails if it ever comes back. **This is on your phone checklist** (section I).
2. **Signing in could strand you.** The spinning-logo screen that covers the sign-in form on
   success never went away if the navigation failed (dead network at the wrong moment, or an old
   browser tab against a new deploy). The button stayed disabled too, so there was no way out but
   reloading. It now gives you the form back after 12 seconds with a message. Also on the checklist.
3. **A test that failed about one run in eight.** Not a bug in the app, but it would have broken
   builds at random. Found the cause, fixed it, then ran the whole 3,025-test suite four times in a
   row clean to prove it.
4. **A wrong comment** in the code describing how the player/partner split works. Wrong
   documentation is how the next person introduces a real bug, so I corrected it.
5. **The one I did NOT change — and I want your eyes on it.** The big logo on the sign-in and
   player join screens is a 512-pixel image shown at 320 points, which on a modern phone screen
   means it is drawn at about half the resolution it ideally wants. Phase 2 raised this and left it
   for you; the reviewer independently flagged the same thing. Fixing it costs roughly 100 KB more
   on those two screens, which eats into the win above. **It is a judgement call about how it looks,
   so it is yours.** Glance at the sign-in logo on your phone and tell me "it's fine" or "sharpen
   it" — if the latter, it is a one-command change (`npm run brand:images` with a larger size).

### What I need from you

1. **Your phone pass:** section **H** (the loader, ten checks) and the new section **I** (the two
   fixes above) of `docs/partner-dashboard-app-redesign-device-checklist.md`, plus section **M** of
   `docs/join-merch-store-device-checklist.md` (the header button). Only you can do these.
2. **The logo sharpness call** (item 5 above).
3. **Whether to commit, push and deploy.** Still entirely your call; nothing is live.
4. **Two bigger optimizations I am NOT starting without you** — see "still open", items 1 and 2.

---

## For the next agent

### 1. Status: the plan is complete

All seven phases are done. There is **no Phase 8**. Everything below is either a record of what was
verified, or an item explicitly parked for Andrew. **Do not start any of the parked items without
his go-ahead** — two of them he has already been asked about twice.

### 2. Starting state

- Branch `main`, last commit **`e900ce7`**. **Phases 1–7 are ALL uncommitted** (83 entries in
  `git status`); nothing pushed, nothing deployed.
- **No** database, Supabase, migration, env var, cron or `vercel.json` change in any of the seven
  phases. The Supabase grants checklist and
  `tests/supabase-migration-grants-contract.test.ts` do not apply to this plan at all.
- Commit trailer if Andrew asks for a commit:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Phase 7's own files are exactly these 11 (everything else in `git status` belongs to Phases 1–6
  — see their handoffs):
  - **Code fixes (3):** `app/owner/dashboard/page.tsx` (seed consumed),
    `app/owner/login/page.tsx` (watchdog), `components/ui/PlayerRuntime.tsx` (**comment only**, no
    behaviour change)
  - **Tests (3):** `tests/app.owner-login-navigation.test.ts` (**new**, 4 tests),
    `tests/app.owner-dashboard-one-round-trip.test.ts` (7 → 8 tests, new P5),
    `tests/app.owner-dashboard-merch.test.ts` (flake fix: new `awaitDashboardMounted()` gate + a
    depth assertion in F4)
  - **Docs (5):** `CLAUDE.md` (new section), `SYSTEM_CONTEXT.md` (§§3, 9, 10, 11, 12),
    `docs/partner-dashboard-app-redesign-device-checklist.md` (new section **I**),
    `docs/partner-dashboard-merch-button-loader-speed-plan.md` (status line + Phase 7 as-built),
    and this handoff.

### 3. Decisions made in Phase 7 (do not re-ask, do not quietly undo)

1. **The one-round-trip seed is consumed once.** `app/owner/dashboard/page.tsx`'s
   `handleBodyReady` now calls `setInitialLists(null)` alongside `setBodyReady(true)`. This is the
   fix for review finding 1 and it is load-bearing — see §5.1 for exactly why, and P5 in
   `tests/app.owner-dashboard-one-round-trip.test.ts` for the proof. Clearing the prop cannot
   disturb the mounted body: `initial` is read only in `useState` initialisers and in the pinned
   `prefetched` flag.
2. **The sign-in loader gets a watchdog, not a removal of the `submitting` lock.** The lock is
   deliberate (it stops a double submit) and stays; `NAVIGATION_WATCHDOG_MS = 12000` is the
   release. 12 s is deliberately generous — a *successful* `router.push` on a slow phone can take
   several seconds to fetch the dashboard's chunks, and yanking the form back mid-navigation would
   be the worse bug. Do not shorten it without measuring.
3. **The flaky test was fixed by making the test deterministic, not by loosening the assertion.**
   See §5.2. The alternative (wrapping the assertion in `waitFor`) would have made F4 pass while
   silently testing nothing.
4. **The logo-resolution finding was deliberately NOT fixed.** It is a bytes-versus-sharpness
   trade-off Andrew owns, it was already his open question from Phase 2, and "fixing" it would
   undo part of the plan's headline win. §7 item 3 has the exact numbers and the one-command
   remedy. **Do not add a larger logo file unasked.**
5. **`readyMs`/LCP is reported WITH its spread, not as a headline.** Phase 6 §5.1 established it is
   noise; this phase reproduced that (2,875–3,296 ms across five runs of one build). The deltas
   quoted are `loadMs`, request count and bytes, which are stable to within ~0.5%.

### 4. Files changed, and how they fit together

**4.1 — `app/owner/dashboard/page.tsx`** (review finding 1)
`initialLists` state moved up beside `bodyReady` so `handleBodyReady` can clear it. The comment on
`handleBodyReady` states the A→B→A failure mode in full. `DashboardBody`'s `seeded` comment now
says the page clears the seed too (belt and braces: the venue-id guard still stands on its own).

**4.2 — `app/owner/login/page.tsx`** (review finding 2)
Added `NAVIGATION_WATCHDOG_MS` (12 s) and a `useEffect` keyed on `navigating` that clears
`navigating` + `submitting` and sets the error
`"You're signed in, but the dashboard didn't open. Please try again."`. The effect's cleanup clears
the timer, so a successful navigation (which unmounts the page) never fires it. `setNavigating(true)`
still precedes `router.push`, which is what `tests/owner-loader-contract.test.ts` pins.

**4.3 — `components/ui/PlayerRuntime.tsx`** (review finding 5, comment only — no behaviour change)
The old comment claimed all five runtimes render `null` on the server. False:
`GlobalTransitionOverlay` renders a 1px invisible `<img>` that warms the transition logo. The
comment now says so, says `ssr: false` is still right (it is a cache warm-up, not content), and
explains that the warm-up happens at hydration.

**4.4 — `tests/app.owner-dashboard-merch.test.ts`** (review finding 3)
New `awaitDashboardMounted()` helper replaces the bare
`findByRole("button", { name: "Select venue" })` gate in F1 and F4. F4 also now asserts
`{ ownerSheetDepth: 1 }` on the Review entry before clicking Back, so if the precondition ever
drifts again the test fails loudly instead of going vacuous. Full mechanism in §5.2.

**4.5 — `tests/app.owner-dashboard-one-round-trip.test.ts`** (new P5)
`SEEDED_GAME` extracted to module scope (P1 used it inline) and a `switchVenue()` helper added
(P4 did it inline). **P5** is the regression test for finding 1: the seed carries a game for
venue-1 and the per-list stub does not, so A→B→A must both re-request venue-1's lists *and* stop
showing the seeded row. **Verified it fails without the fix** (`expected [...] to include
'/api/owner/schedule?venueId=venue-1'`) and passes with it.

**4.6 — `tests/app.owner-login-navigation.test.ts` (new, 4 tests)**
The first jsdom test for this page. Covers: the loader goes up and the button locks on success; the
watchdog releases the form at 12 s with the message; at 8 s it has NOT released (a real slow
navigation is not disturbed); and a rejected sign-in still returns the form immediately with no
loader. **Verified the watchdog test fails when the watchdog is disabled.**

### 5. Facts and traps

**5.1 — why the A→B→A bug existed, so nobody reintroduces it.** `DashboardBody` is keyed by
`selectedVenueId`, so every venue switch is a fresh mount. The seed was page-level state that was
never cleared, and the body accepts it whenever `initial.venueId === venueId`. So switching back to
the venue the page opened on re-matched, and `prefetched` (pinned at mount from the seed) then
suppressed **both** fetch effects via `prefetched && attempt === 0`. Result: the session-start
payload rendered again, with no loading state, and `gamesAsOfMs` carried the session-start "now"
into upcoming-vs-past bucketing. The venue-id guard alone cannot fix this — "is this the right
venue" was never the question; "has this seed already been used" was.

**5.2 — the test flake, in full, because the mechanism is subtle.** Two components call
`useOwnerSheet()`: `MerchStoreHost` (mounts on the first render) and `DashboardBody` (mounts once
the venue list lands). Each runs `normalizeLandedSheet` **once, on mount**, which upgrades a
`?sheet=` URL sitting at depth 0 to depth 1. F4's `go("?sheet=store")` pushes with `state: null`
(depth 0), and the test's gate — the venue switcher — is rendered by the **page**, not the body. If
the body's mount commits after `go()`, its normalisation fires, Shop becomes depth 1, Review
becomes depth 2, and `stepBack` takes the `readSheetDepth >= 2` branch: `history.go(-1)`, which is
**asynchronous**. F4's assertion was synchronous, so it saw `?sheet=store&step=review` and failed.
Phase 5's stub change (3 first-load fetches → 1) re-timed that mount, which is why this surfaced
now. **The lesson for any future test on this page: waiting for the app bar does not mean
`DashboardBody` is mounted.** Use `awaitDashboardMounted()`.

**5.3 — the four measurements all reproduced Phase 6 exactly**, which is the strongest evidence
this tooling is trustworthy: dashboard 25 requests / 352 KB / 2,106 ms, first-request instrumentation
2,136 ms median, JS 681.7 KB / 21 chunks — all identical to Phase 6's figures, on a fresh build, in a
separate session. Then identical **again** after the code-review fixes (§6.2). When a number here
moves, something real moved.

**5.4 — the review's "179 routes" is not a regression.** Its build reported 179 routes; the build
log's own line is `Generating static pages (180/180)`, matching Phase 6 §5.8. The two count
different things (route-table entries vs generated pages). Trust the `(180/180)` line.

**5.5 — the login page's `<label>`s are not associated with their inputs** (plain siblings, no
`htmlFor`/`id`), so `getByLabelText` finds nothing and
`tests/app.owner-login-navigation.test.ts` queries by selector with a comment saying why. This is
**pre-existing and unrelated to this plan** — I did not fix it because it is outside Phase 7's
scope, but it is a genuine small a11y gap on a real sign-in form and a fine candidate for a
one-line follow-up.

**5.6 — carried over, all still true:** don't run `npx tsc --noEmit` concurrently with
`npm run build` (`.next/types` regenerates); `npm run lint` prints a harmless Babel "deoptimised
styling of `lib/sportsBingo.ts`" note; `npx next start` serves the build that existed when it
STARTED, so restart it after a rebuild (`pkill -f "next start -p 3100"`, wait 2 s, start, wait 7 s);
a Playwright script run from outside the repo needs
`NODE_PATH=/Users/andrewserulneck/Documents/Trivia-Predictions/node_modules`; and
`tests/owner-dashboard-contract.test.ts` slices the dashboard page by string index, so renaming
`const DashboardBody` / `type MerchStoreHostProps` / `const OwnerDashboardPage` silently empties a
slice.

### 6. How to build, run and test — and what was verified

```
npx tsc --noEmit                                  # clean
npm run lint                                      # clean (Babel sportsBingo note only)
npm run test                                      # 283 files passed / 1 skipped;
                                                  # 3,025 passed / 13 skipped / 0 failed
                                                  # — run FIVE times, identical, zero flakes
npm run test:pwa-contract                         # 20 passed
npm run test:god-mode-join                        # 34 passed (5 files)
npm run build                                     # ✓ Compiled successfully, 180/180 pages
```
`npm run build` was run after the last **code** change; only markdown changed after it, and no test
reads a `.md` file (verified), so the build and suite results stand. Typecheck and lint were both
re-run after the docs edits as well.
3,020 → 3,025 tests = Phase 7's 5 new ones (4 login + P5). No existing test needed changing beyond
the two F-test gates in §4.4.

**6.1 — final measurement (Phase 7), against the full plan's starting point.**
`npm run build`, then `npx next start -p 3100`, then
`node --env-file=.env.local scripts/measure-owner-load.cjs --runs 5`. Slow 4G (1.6 Mbps / 150 ms
RTT) + 4× CPU, 375×812 DPR 3, cold context per run, median of 5. "BEFORE" is the Phase 2 handoff
§6 baseline (same script, same machine).

| Page | metric | BEFORE (pre-plan) | AFTER (Phase 7) | change |
|---|---|---|---|---|
| /owner/dashboard | requests | 32 | **25** | −7 |
| | transferred | 2,056 KB | **352 KB** | **−1,704 KB (−83%)** |
| | of which logo | 1,655 KB | **17 KB** | −99% |
| | load event | 10,414 ms | **2,106 ms** | **−8,308 ms (−80%)** |
| | games list visible | 10,438 ms | **2,970 ms** (2,875–3,296) | −72% |
| | owner API calls | 3 | **1** | −2 |
| /owner/login | requests | 42 | **38** | −4 |
| | transferred | 3,714 KB | **458 KB** | **−3,256 KB (−88%)** |
| | load event | 18,545 ms | **2,318 ms** | **−88%** |
| | LCP | 1,660 ms | **1,316 ms** | −344 ms (−21%) |

**Per-phase attribution** (each from its own handoff, same script): Phase 2 took the dashboard
2,056 → 418 KB and 10.4 → 2.4 s (the logo). Phase 5 restructured the data path (3 calls → 1) and
cost nothing in bytes. Phase 6 took 421 → 352 KB and 2,468 → 2,103 ms (fonts + the player/partner
split). Phases 1, 3, 4 and 7 are neutral on these numbers by design.

**The first-request instrumentation** (how long before the dashboard can even ask the server for
your games — Phase 5's headline, and the most trustworthy single number in the plan):

| | runs | median |
|---|---|---|
| Phase 5 | +2,493 / +2,498 / +2,499 ms | +2,493 ms |
| Phase 6 | +2,150 / +2,136 / +2,128 ms | +2,136 ms |
| **Phase 7 (re-run)** | +2,136 / +2,145 / +2,135 ms | **+2,136 ms** |

Phase 6's figure reproduced to the millisecond. The script is throwaway (six lines of CDP:
`Network.requestWillBeSent`, first request vs the `/api/owner/dashboard` one, same throttling).

**The player join screen `/`** — the gap Phase 2 §6 left unmeasured, closed this phase (5 runs,
signed out, same throttling): **43 requests / 509 KB / load 2,807 ms / LCP 1,312 ms**, logo bytes
**76 KB** across `htc-logo-192.webp` (the transition overlay's warm-up) and `htc-logo-512.webp`
(the big `ExplodingLogo`), and **zero** requests for either 1.7 MB PNG. Before the plan this screen
fetched 3.4 MB of logo (the same picture under two names). No pre-plan LCP figure exists for it, so
the LCP is an absolute, not a delta.

**JavaScript, manifest method** (plan §2 F5 — like-for-like only; it over-counts what the phone
actually downloads, see Phase 6 §5.3): `/owner/dashboard` **681.7 KB / 21 chunks**,
`/owner/billing` **583.3 KB / 19 chunks** — both identical to Phase 6.

**6.2 — re-measured AFTER the code-review fixes**, because two of them touch these exact pages:
dashboard 25 requests / 352 KB / 2,106 ms / 1 owner API call; login 38 / 458 KB / 2,318 ms / LCP
1,316 ms; JS 681.7 KB / 21 chunks. **No regression from the fixes.**

**6.3 — what the plan asked for and I could NOT get.**
- **Vercel API p50/p95 per route:** `create_observability_query` returns **402** without the
  Observability Plus add-on. Phase 2 hit this and did not buy it; neither did I. Request counts
  (3 → 1) are the substitute.
- **Vercel bandwidth trend:** needs a deploy. Nothing from this plan is deployed, so there is no
  trend to read and any figure would be unrelated to these changes. **Re-check after Andrew
  deploys** — the expected signal is a step down in image bandwidth (the 3.4 MB logo per new
  visitor on *every* page, players included).

**Unverified / risky:**
- **No real phone, still.** Device-checklist sections **H** and the new **I** are entirely open, as
  is section **M** of the join-merch checklist. Headless browsers cannot judge the loader's motion
  or the logo's sharpness.
- **Nothing measured on a cold Vercel deployment.** All numbers are local `next start`: no CDN, no
  real network, no cold function start.
- **The 2.1 s head is unexplained beyond "JavaScript download + hydration."** Its two biggest
  contributors are §7 items 1 and 2, both out of scope for all seven phases.
- **Fonts were visually checked on 5 screens in Phase 6, not all 180 pages.** `/tv`, `/info`,
  `/admin`, Fantasy and Predictions were never looked at. The contract test proves no literal
  family name survives anywhere, so the residual risk is cosmetic.
- **`prefers-reduced-motion` has not been re-checked since Phase 4.**

### 7. Still open — all of it waiting on Andrew

1. **`AuthSessionProvider` / the 186 KB Supabase chunk on `/owner/*`.** The biggest single
   remaining win, measured and real: nothing under `app/owner/`, `components/owner/` or
   `app/admin` imports `@/lib/supabase` or `@/lib/auth`, so on partner pages those bytes are pure
   waste. **Not clean:** `components/auth/AuthNavigationGuard.tsx` and
   `components/auth/LoginStuckStateBreaker.tsx` consume its context from the same layout, so
   deferring the provider means deferring them too and preserving context identity across the
   split. Asked in Phases 6 and 7; **needs his go-ahead.**
2. **Server-rendering the dashboard shell.** Still only an option (plan §4 Phase 5, last bullet).
   My reading matches Phases 5 and 6: the remaining cost is bundle size, not render strategy, so
   item 1 and framer-motion are the better targets. **Do not start it unasked.**
3. **Logo sharpness on a 3× phone** (review finding 4, and Andrew's open question since Phase 2).
   Exact arithmetic: `ExplodingLogo` renders at `width={320}` CSS px on the player join screen
   (`components/join/JoinFlow.tsx:2723`) and the partner sign-in (`components/owner/OwnerShell.tsx:102`),
   and picks `htc-logo-512.webp` for anything over 120 px. At DPR 3 that slot wants ~960 device px,
   so 512 is about half the ideal; the pre-plan source was 1254 px. Remedy if he says sharpen it:
   add a 768 or 1024 px size to `scripts/optimize-brand-logo.cjs`, run `npm run brand:images`,
   raise `ExplodingLogo`'s threshold. Cost ~100 KB on those two screens. **Remember the immutable
   rule: new size = new file name, never overwrite.**
4. **Device checklists** — `docs/partner-dashboard-app-redesign-device-checklist.md` sections H
   and I; `docs/join-merch-store-device-checklist.md` section M.
5. **Commit / push / deploy** Phases 1–7. Nothing is live.
6. Carried over, minor: the `ChevronRight`-vs-logo top-left button question (Phase 4).
7. New, tiny, out of scope (§5.5): the owner login form's labels are not tied to their inputs.

### 8. Docs updated this phase (Phase 6 §8's list, cleared)

**`CLAUDE.md`** — new section **"Loading screen, brand images & the dashboard's one round trip
(2026-10-01)"**, placed before "PWA / Bingo Landscape Fullscreen". It records, as rules: the single
app-wide `HightopLoader` and the deleted `BouncingBallLoader`; `lib/useLoaderVisible.ts` being
caller-driven; `app/owner/loading.tsx`; the header store button ("Store" below 360 px, `pushSheet`
never `router.push`); `/brand/web/`'s immutable cache and therefore the **new-file-name rule**;
`GET /api/owner/dashboard` plus the per-list routes staying live and `lib/ownerVenueList.ts`; the
**single-use seed**; self-hosted fonts and the **no-literal-family-name** rule with the real
reason (the metric-matched fallback face); `PlayerRuntime` / `isPlayerRuntimePath` and its
**fail-open** direction; `AuthSessionProvider` being deliberately not deferred; the login
watchdog; and the measurement caveats. Every tripwire is named.

**`SYSTEM_CONTEXT.md`** — §3 root shell now describes the `PlayerRuntime` gate and the fonts, plus
a new "Loading screen (one, app-wide)" bullet; §9 partner surface gains the one-round-trip endpoint
(with the single-use seed) and the app-bar store button; §10 gains the self-hosted-font rule and a
new "Brand images" bullet with the immutable-name rule; §11 notes `next/font`; §12 gains a
seven-bullet constraints entry.

**`docs/partner-dashboard-app-redesign-device-checklist.md`** — new section **I** with the two
Phase 7 fixes to check on a phone.

Nothing from Phase 6 §8 is left unwritten.

### 9. If you are picking this up next

The plan is complete; there is no next phase to start. In order of what is actually useful:

1. **If Andrew has done the device pass:** fix whatever he found, then re-run
   `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
2. **If he says "sharpen the logo":** §7 item 3 has the exact steps.
3. **If he green-lights the `AuthSessionProvider` split:** that is its own plan, not a phase of
   this one. Start from Phase 6 §6.3 and §7 item 1 above; the hard part is context identity across
   the dynamic boundary, not the dynamic import.
4. **If he deploys:** re-check the bandwidth trend (§6.3) and confirm the real-phone numbers, and
   note that the local figures here are optimistic by construction.
5. **Do not** re-run the whole measurement suite without a reason. It reproduces to the
   millisecond (§5.3), so repeating it tells you nothing new unless the code changed.
