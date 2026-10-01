# Phase 4 Handoff — the loader is on the screens (partner **and** player)

Plan: `docs/partner-dashboard-merch-button-loader-speed-plan.md` · Phase 4 finished 2026-10-01.
Previous: `…_PHASE_3_HANDOFF.md` (the loader itself), `…_PHASE_2_HANDOFF.md` (baseline numbers, logo
files), `…_PHASE_1_HANDOFF.md` (header store button, your Q1–Q3 answers).

## For Andrew (plain English)

- **You approved the motion, so it is now wired in.** The logo animation you watched is the loading
  screen for the whole app.
- **The orange basketball is gone.** `BouncingBallLoader.tsx` is deleted. Every place it used to
  bounce — 21 spots across 17 files: Pick 'Em, NFL Pick 'Em, Bingo, Fantasy, the prize wallet, the
  activity timeline, the challenge redemption panel, the full-screen screen between pages — now
  shows the hopping logo with the same wording underneath it as before. A test now fails the build
  if anyone puts it back.
- **Partner screens.** Billing, Venue Display, Game Settings, Account and the Billing setup page used
  to show the word "Loading…" in small grey text; they show the animation now. Tapping **Sign In** on
  the partner login covers the form with it immediately, so the tap feels answered.
- **The Partner Dashboard shows ONE loader, not a loader and then grey boxes.** It waits for the venue
  list *and* the Live Games list *and* the Rewards list, then puts the whole page up in one step. I
  measured this on a throttled "slow 4G" phone profile against the real build: animation from about
  0.2 s to about 1.1 s, then both sections appear together — no grey placeholder flash at any point.
  The grey boxes still exist for one job only: when a section fails and you tap **Retry**, that one
  section refreshes in place instead of blanking the whole screen.
- **A fast screen shows nothing at all.** The animation waits 200 ms before appearing, so a screen
  that opens quickly never flashes it; once it does appear it stays about half a second so it can
  never blink on and off.
- **Reduce Motion still works** — verified in a real browser on the Billing page: with Reduce Motion
  on, the hop and spin are switched off and the logo just fades, exactly as in your preview video.
- **Is it live?** **No.** Phases 1–4 are all saved on this computer only — not committed, not pushed,
  not deployed. Still your call.
- **Cost:** none, and marginally lower. The loader reuses the 17 KB logo file the page already loads,
  and deleting `BouncingBallLoader` removes a framer-motion-animated component from eighteen player
  bundles. No new network requests, no server work, no env/database/cron/`vercel.json` change.
- **What I need from you:** section **H** of `docs/partner-dashboard-app-redesign-device-checklist.md`
  is new — ten checks on a real phone (cold open, sign-in, menu → Billing → Back, slow connection,
  Reduce Motion, a player game). Only you can do those; a headless browser has no browser chrome.
- **One thing I noticed but did not change:** the dashboard's top-left button draws a `ChevronRight`
  icon, not the logo, even though the code comments around it call it "the logo menu button". That
  predates this plan (it is Phase 1/the redesign, untouched here). Say the word if it should be the
  logo and it is a one-line change.

---

## For the next agent (Phase 5 — dashboard data in one round trip; Opus 5.5, high)

### 1. Goal and scope

Plan §4 **Phase 5** exactly as written: add `GET /api/owner/dashboard` (optional `?venueId=`) that
does **one** `requireOwnerAuth`, then the venue list, then — for the requested venue if the caller
owns it (`ownsVenue`), else their first venue — the schedules and competitions in parallel. Each
list carries its own `ok`/`error` so one failure still shows the other section. Extract the
competitions query into a shared `lib/` function instead of copying it. Same 401 contract
(`no_session` / `no_venue` from `lib/ownerAuthCodes.ts`).

Then make the dashboard's **first load** use only that endpoint. Venue switch, Retry and the
post-save refetch keep the existing per-list endpoints untouched (sheets still use them).

**Out of scope:** fonts and the player-runtime split (Phase 6), re-measuring and the `/code-review`
pass (Phase 7), and anything about the loader's motion. Phase 5 is independent of Phases 3–4 —
nothing below blocks it.

### 2. Starting state

- Branch `main`, last commit **`e900ce7`**. **Phases 1, 2, 3 and 4 are ALL uncommitted**; nothing
  pushed, nothing deployed. No database, Supabase, env var, cron or `vercel.json` change in any of
  the four phases.
- Commit trailer if Andrew asks for a commit:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- `git status` at the end of Phase 4 — **Phase 4's own files** are:
  - `?? app/owner/loading.tsx` (written in a previous session, kept as-is)
  - `?? tests/owner-loader-contract.test.ts` (new)
  - `D  components/ui/BouncingBallLoader.tsx` (deleted)
  - `M  app/owner/{dashboard,login,display,billing,billing/setup,account,game-settings}/page.tsx`
  - `M  app/nfl-pickem/loading.tsx`, `M components/ui/{RouteLoadingScreen,GlobalTransitionOverlay}.tsx`
  - `M` the fourteen player components listed in §4.3
  - `M  tests/{components.player-pending,components.player-reduced-motion,owner-dashboard-contract}.test.ts`
  - `M  docs/partner-dashboard-app-redesign-device-checklist.md`
  Everything else in `git status` belongs to Phases 1–3 (see their handoffs).

### 3. Decisions made in Phase 4 (do not re-ask, do not quietly undo)

1. **Route-level loaders use `delayMs={0}`; in-page loaders keep the default 200 ms.** A `loading.tsx`
   or a navigation overlay *is* the answer to the tap, so it must not wait. An in-page data loader
   must wait, or a cached response flashes it.
2. **Every player call site kept `variant="card"`**, because `BouncingBallLoader` with neither `dark`
   nor `fullScreen` drew the bordered panel — all 18 in-page player call sites were that shape.
   ⚠️ The Phase 3 handoff's mapping table contradicted itself here (its first row implied the `plain`
   default for a bare `size="sm" label="…"` call). The *last* row was the correct one; this phase
   followed the component's actual behaviour, so nothing changed visually.
3. **`showLabel` was passed everywhere a label was passed**, because `BouncingBallLoader` always drew
   its label. `tests/owner-loader-contract.test.ts` now fails on any `<HightopLoader …label=… />`
   without `showLabel`, so this cannot silently regress.
4. **`RouteLoadingScreen` keeps the old default label `"Hightop Challenge: Game On."`** (with the
   period). `GlobalTransitionOverlay` keeps its own `"Hightop Challenge: Game On"` (no period) — that
   difference is pre-existing, not a typo introduced here.
5. **The dashboard reveals by `display:none`, not by not-mounting.** `DashboardBody` is mounted as
   soon as venues resolve (so its two fetches start immediately) inside
   `<div className={revealed ? "space-y-4" : "hidden"}>`. React effects run normally under
   `display:none`, and `display:none` removes the subtree from the accessibility tree — which is
   exactly what stops the two hidden `SectionSkeleton`s (each a `role="status"`) from being announced
   alongside the real loader. **Do not "simplify" this to `{revealed && <DashboardBody/>}`** — that
   delays both fetches until after the loader, which is the opposite of the point.
6. **`bodyReady` is latched, never reset.** Only the FIRST load gets the full loader. A venue switch
   remounts `DashboardBody` (it is `key`ed by venue) and shows the per-section skeletons, as today; a
   section Retry shows that section's skeleton in place, as the plan requires.
7. **The dashboard drives `useLoaderVisible` itself and passes `delayMs={0}` to the component**, per
   the Phase 3 trap: only the caller can enforce the minimum-visible half, and the delay must not be
   paid twice.
8. **`Suspense fallback` for `DashboardBody` is `null`, not a skeleton.** While suspended it is not
   mounted, so nothing has been requested and the page-level loader is still the honest answer.
9. **Owner login does not clear `submitting` on success.** `setNavigating(true)` raises the
   full-screen loader and the button stays disabled until the route changes; the old
   `finally { setSubmitting(false) }` was replaced by explicit resets on the two failure paths.
10. **Plan item 6 (two overlays can't stack) is satisfied and now pinned by a test, not by new code.**
    `tp:global-transition-show` is dispatched only from `components/join/JoinFlow.tsx`, and no file
    under `app/owner/`, `components/owner/` or `app/admin` mentions `tp:global-transition` at all.

### 4. Files created / changed

**4.1 — new**
- **`tests/owner-loader-contract.test.ts`** (12 tests, static). Four groups: *the basketball is gone*
  (no `BouncingBallLoader.tsx`, nothing imports it, no `border-orange-900` markup survives, no
  `label` without `showLabel`); *partner route transitions* (`app/owner/loading.tsx` renders
  `HightopLoader` with `delayMs={0}`; all six signed-in `/owner` pages render it and no longer carry
  a `>Loading…<` text node; login raises the loader **before** `router.push`); *the dashboard shows
  one loader* (uses `useLoaderVisible`, passes `delayMs={0}`, waits on the exact
  `games.status !== "loading" && rewards.status !== "loading"` conjunction, and no longer renders or
  imports `SectionSkeleton` while the two sections still do); *no two overlays can stack*.

**4.2 — partner (4a)**
- `app/owner/loading.tsx` — unchanged from the previous session: `variant="fullScreen" size="lg"
  delayMs={0}`.
- `app/owner/{display,billing,billing/setup,account,game-settings}/page.tsx` — unchanged from the
  previous session: the `<p>Loading…</p>` line became `<HightopLoader size="lg" className="py-10" />`
  (six call sites; `billing/setup` has two).
- **`app/owner/dashboard/page.tsx`** — the real logic of this phase.
  - `DashboardBody` gained an `onReady: () => void` prop and one effect: when
    `games.status !== "loading" && rewards.status !== "loading"`, call it.
  - The page gained `bodyReady` + `handleBodyReady` (a `useCallback(…, [])`, so the effect's deps are
    stable), and three derived values:
    `firstLoadPending = loading || (selectedVenueId !== "" && !bodyReady)`,
    `showLoader = useLoaderVisible(firstLoadPending)`,
    `revealed = !firstLoadPending && !showLoader`.
  - Render: the loader when `showLoader`; the "No venue found" card when `revealed && !selectedVenueId`;
    and the body in the reveal `div` when `!loading && selectedVenueId`.
  - The page-level `SectionSkeleton` import and its three uses are gone.
- **`app/owner/login/page.tsx`** — `navigating` state; the component now returns a fragment with
  `{navigating ? <HightopLoader variant="fullScreen" size="lg" delayMs={0} /> : null}` above
  `<OwnerShell>`.

**4.3 — player (4b)**
- Deleted `components/ui/BouncingBallLoader.tsx`.
- `components/ui/RouteLoadingScreen.tsx` — rewritten: `variant="fullScreen" size="lg" delayMs={0}
  showLabel label="Hightop Challenge: Game On."`.
- `app/nfl-pickem/loading.tsx` — `variant="plain" size="lg" delayMs={0} showLabel label="Loading NFL
  Pick 'Em..."` (plain, because the file supplies its own full-screen `bg-slate-950` wrapper; the
  old call was the card inside that wrapper, so this is the one place the shape *did* change — it
  reads better and is a route-level screen).
- `components/ui/GlobalTransitionOverlay.tsx` — `variant="plain" size="lg" delayMs={0} showLabel
  label={overlayLabel}`. Still a framer-motion component for its own fade; only the inner loader
  changed.
- Fourteen files, 18 call sites, all mechanically `→ <HightopLoader size={same} variant="card"
  showLabel label={same} />`: `components/activity/{ActivityTimeline×2,CareerStatsPanel,
  ActiveGamesPanel}`, `components/challenges/ChallengeRedeemPanel`,
  `components/nfl-pickem/{NFLPickEmGameList×2,NFLPickEmLeaderboard}`,
  `components/pickem/{PickEmRecentPicks,PickEmGameList×3,PickEmSportSelect}`,
  `components/bingo/{SportsBingoSelectBoard,SportsBingoSelectGame,SportsBingoHome}`,
  `components/prizes/PrizeWalletPanel`, `components/fantasy/FantasyHome`.

**4.4 — tests and docs touched**
- `tests/components.player-pending.test.ts` and `tests/components.player-reduced-motion.test.ts` —
  both `vi.mock`ed `@/components/ui/BouncingBallLoader`; repointed to `@/components/ui/HightopLoader`.
  **Keep these mocks.** `components.player-pending` asserts on `getByRole("status")`; an unmocked
  `HightopLoader` renders its own `role="status"` and would make that query ambiguous.
- `tests/owner-dashboard-contract.test.ts` — one regex loosened. It pinned
  `</Suspense>)}<Suspense fallback={null}><MerchStoreHost`; the reveal `div` now sits between, so it
  is `</Suspense></div>) : null}<Suspense fallback={null}><MerchStoreHost`. The *intent* (the merch
  store host is a sibling of the conditional, not inside it) is unchanged and still asserted.
- `docs/partner-dashboard-app-redesign-device-checklist.md` — new section **H** (10 items).

### 5. Facts and traps

- **`npm run test` must be run after any loader change, not just the named `test:*` scripts.** Three
  separate contract files now constrain this feature and all run under plain `npm run test`:
  `hightop-loader-contract` (Phase 3, the component), `owner-loader-contract` (Phase 4, the wiring),
  `owner-dashboard-contract` (the dashboard's shape).
- **`owner-loader-contract.test.ts` walks every `.ts/.tsx` under `app/`, `components/` and `lib/`
  on each run.** It is fast (~120 ms) but it is a full-tree read: if you add a large generated
  directory under those roots, exclude it there.
- **A `label` without `showLabel` is now a build failure, by design.** If a surface genuinely wants a
  silent loader, pass no `label` (it falls back to the announced-only `"Loading…"`), do not delete
  the assertion.
- **The loader needs vertical headroom** (Phase 3): the stage reserves ~45 % of the logo's height
  above it and the entrance starts 105 % above the stage, so a parent with `overflow-hidden` clips
  the drop-in. None of the 21 call sites wired here are inside one — verified visually on
  `/owner/billing` and `/owner/dashboard` — but check it when adding a new one.
- **Playwright screenshots race the animation.** A screenshot taken ~500 ms after
  `domcontentloaded` came back with the loader absent from the picture while
  `getBoundingClientRect()` and `getComputedStyle().opacity` proved it was on screen at full
  opacity. Trust the measured DOM, not a single frame; sample at several timestamps.
- `scripts/measure-owner-load.cjs` (Phase 2) is the way to get a signed-in owner session locally — it
  mints the `tp_owner_sess` cookie from `SESSION_SECRET` in `lib/ownerSession.ts` format. Copy that
  `ownerCookie()` helper for any new owner-side browser check; run the script with
  `node --env-file=.env.local`, and if the script lives outside the repo set
  `NODE_PATH=<repo>/node_modules` or `require("playwright")` fails.
- **ESLint `react-hooks/purity` and `react-hooks/set-state-in-effect` are errors here.** Calling the
  *prop* `onReady()` inside an effect passes (it is opaque to the rule); calling `setBodyReady`
  directly from inside `DashboardBody` would not. Keep the indirection.
- Don't run `npx tsc --noEmit` concurrently with `npm run build` (`.next/types` regenerates).
- `npm run lint` prints a harmless Babel "deoptimised styling of `lib/sportsBingo.ts`" note.
- `docs/` still contains historical references to `BouncingBallLoader`
  (`app-feel-and-footer-removal-plan.md`, `NFL_PICKEM_IMPLEMENTATION_PLAN.md`). Those are dated
  history; leave them. **`CLAUDE.md` and `SYSTEM_CONTEXT.md` have NOT been updated** — that is
  explicitly Phase 7's job (plan §4 Phase 7), and it must now also record that
  `BouncingBallLoader` is gone and `HightopLoader` is the app-wide loading screen.
- Plan §4 **Phase 6** item 1 says to keep the `[font-family:'Bree_Serif','Nunito',serif]` class in
  `BouncingBallLoader` working. That file no longer exists — the same class now lives in
  `components/ui/HightopLoader.tsx` (the `fullScreen` label). Grep for the class, not the file.

### 6. How to build, run and test — and what was verified

```
npx vitest run tests/owner-loader-contract.test.ts        # 12 passed
npx tsc --noEmit                                          # clean
npm run lint                                              # clean
npm run test                                              # 278 files passed / 1 skipped;
                                                          # 2,972 passed / 13 skipped / 0 failed
npm run test:pwa-contract                                 # 20/20
npm run test:god-mode-join                                # 5 files, 34/34
npm run build                                             # ✓ Compiled successfully, 179 pages
npm run loader:preview -- --serve                         # the Phase 3 preview, unchanged
```

**Verified in a real Chromium** against `npx next start -p 3100` (the production build), 375×812 at
DPR 2–3, throttled to Slow 4G (1.6 Mbps / 150 ms RTT) + 4× CPU, with a locally-minted owner cookie:

| Check | Result |
|---|---|
| `/owner/dashboard` cold | loader absent at DCL+0, up at DCL+200 ms, still up at 700 ms, gone at 1100 ms |
| Reveal shape | at 1100 ms **both** Live Games and Offer Rewards are present at once; `animate-pulse` skeleton count goes 0 → 2 (hidden subtree) → 0, never visible |
| Accessibility | exactly one *visible* `role="status"`; the two section skeletons sit inside the `display:none` subtree, so they are out of the accessibility tree |
| `/owner/billing` cold | loader on screen, image loaded (`naturalWidth` 192), `opacity: 1`, not clipped; gone by 1000 ms when the data lands |
| Reduce Motion (`reducedMotion: "reduce"`) | hopper `animation-name: none`, image `animation-name: logo-pulse` — the Phase 3 contract holds through the wiring |

**Unverified / risky:**
- **No real phone.** Everything in device-checklist section H is still open, and a headless browser
  cannot close it.
- The **player** call sites were changed mechanically and are covered by the static contract test,
  but were **not** opened in a browser one by one. The highest-value spot-checks are
  `SportsBingoHome` and `FantasyHome` (they pass a computed `label` variable) and
  `GlobalTransitionOverlay` (venue → game transition, the one place a loader sits inside another
  animated overlay).
- The **owner login** loader was not exercised end-to-end (it needs a real password); its wiring is
  pinned statically only.
- Nothing was measured for Phase 7 in this phase — Phase 2's baseline is still the comparison point.

### 7. Open questions / waiting on Andrew

1. **Device-checklist section H** (`docs/partner-dashboard-app-redesign-device-checklist.md`) — ten
   phone checks, only he can do them.
2. Whether to commit / push / deploy Phases 1–4 — still his call, nothing is live.
3. The dashboard's top-left button draws a `ChevronRight` where the code comments say "logo menu
   button" (see §For Andrew). Cosmetic, pre-existing, not touched.
4. Carried over from Phase 2, still open: whether the big sign-in logo looks soft on a 3× phone (if
   so, add a 768 px WebP). Does not affect the loader, which is ≥3× at every size.

### 8. Recommended first steps for Phase 5 (Opus 5.5, high)

1. Read `app/api/owner/venues/route.ts`, `app/api/owner/schedule/route.ts` and
   `app/api/owner/competitions/route.ts` together first — the new route must reproduce their exact
   queries and their `display_name ?? name` mapping, not approximate them.
2. Extract the competitions lister into `lib/` **before** writing the new route, and switch
   `app/api/owner/competitions/route.ts` to it in the same change, so there is only ever one copy.
3. Write the route tests from `tests/api.*` first (unauthenticated → 401 with the right code; a
   venue the caller does not own is never returned; one list failing still returns the other; an
   empty-venue account), then the route.
4. On the dashboard, the first-load fetch moves into the page's existing `load()` effect and must
   feed **both** the venue list and `DashboardBody`'s two lists. `DashboardBody` currently owns its
   fetches; the least invasive shape is optional `initialGames` / `initialRewards` props that seed
   its state and suppress the first effect run, leaving Retry and the post-save refetch untouched.
   Whatever shape you choose, **`onReady` must still fire** or the loader never lifts — and the
   contract test in `tests/owner-loader-contract.test.ts` pins the exact readiness expression, so
   update that test deliberately if the shape changes.
5. Measure before/after (plan §5 cost note: 3 invocations / ~9 queries → 1 / ~5) and put the numbers
   in the Phase 5 handoff for Phase 7 to compare.
6. Gates: `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` (not concurrently with
   tsc). Then `…_PHASE_5_HANDOFF.md` and the plan's status line.
