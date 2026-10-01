# Phase 1 Handoff — "Order Join Merch" header button

Plan: `docs/partner-dashboard-merch-button-loader-speed-plan.md` · Phase 1 finished 2026-10-01.

## For Andrew (plain English)

- **What changed:** the Partner Dashboard's top bar now has a cyan **Order Join Merch** button with a
  shopping-bag icon in the top-right corner, where the small bouncing logo used to be. Tapping it
  opens the Join Merch store straight away. The "Order Join Merch" row in the menu is still there.
  On very narrow phones (narrower than 360 px, like the first iPhone SE) the button says **Store**.
  Other partner pages (Billing, Account, etc.) don't show it, same as before with the logo.
- **Is it live?** **No.** It's saved on this computer but not committed, pushed or deployed.
  Committing / pushing / deploying is your call.
- **Checked:** all automated tests (2,935), typecheck, lint and a production build pass. I rendered
  the bar at 320, 359, 360, 375 and 430 px: the label never wraps and the venue name keeps room for
  ~13+ characters at 360 px ("The Brunswick …").
- **Needs you:** a quick phone check — section **M** at the end of
  `docs/join-merch-store-device-checklist.md` (two items).
- **Your three answers are recorded** in the plan (§6): loader everywhere and the basketball goes;
  spin that changes direction with a fun entrance; "Store" on narrow phones (done).
- **What's left:** Phases 2–7 (smaller logo file + caching, the logo loader, wiring the loader in,
  one-trip dashboard data, fonts/player-code, re-measure).

---

## For the next agent (Phase 2)

### 1. Next phase goal and scope

**Phase 2 — measure a baseline, then shrink and cache the logo** (plan §4, Phase 2; Sonnet 5.5,
medium). In scope: baseline measurement (cold cache, Slow 4G + 4× CPU, `/owner/login` and signed-in
`/owner/dashboard`: bytes, request count, LCP, time to games list; Vercel p50/p95 for
`/api/owner/venues`, `/api/owner/schedule`, `/api/owner/competitions`, last 7 days),
`scripts/optimize-brand-logo.cjs` + `npm run brand:images` writing `public/brand/web/htc-logo-{96,192,512}.webp`,
repointing every logo reference, and a `Cache-Control: public, max-age=31536000, immutable` header
for `/brand/web/:path*` in `next.config.ts`.

Out of scope for Phase 2: the loader (Phase 3), any page wiring (Phase 4), the dashboard endpoint
(Phase 5), fonts / player-runtime (Phase 6). Do **not** delete the original 1.7 MB PNGs in
`public/brand/` (plan §3). Do not touch `vercel.json`.

### 2. Starting state

- Branch `main`, last commit `e900ce7` ("Join Merch Store: look-only partner store on the Partner
  Dashboard"). **Phase 1 is uncommitted** in the working tree:
  - `M components/owner/OwnerAppBar.tsx`
  - `M tests/owner-menu-contract.test.ts`
  - `M tests/components.owner-app-bar.test.ts`
  - `M docs/join-merch-store-device-checklist.md` (new section M)
  - `?? docs/partner-dashboard-merch-button-loader-speed-plan.md` (the plan itself was never committed)
  - `?? docs/partner-dashboard-merch-button-loader-speed-plan_PHASE_1_HANDOFF.md` (this file)
- Nothing pushed, nothing deployed. No database, env var, Supabase or Vercel change of any kind.
  No data scripts run; no backups needed. Ask Andrew before committing if he hasn't said to; if he
  says to commit, the commit trailer is `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### 3. Decisions already made (do not re-ask)

Andrew's answers, 2026-10-01 (also written into plan §6):

- **Q1 — loader everywhere; get rid of the basketball.** `HightopLoader` replaces
  `BouncingBallLoader` on player screens too, not just `/owner/*`. At Phase 1 time there were
  **41 references in 18 files** (`grep -rn "BouncingBallLoader" app components`), including
  `components/ui/RouteLoadingScreen.tsx` (used by root `app/loading.tsx`),
  `app/nfl-pickem/loading.tsx`, `components/ui/GlobalTransitionOverlay.tsx`, and in-page loaders in
  `components/{activity,challenges,nfl-pickem,pickem,prizes,bingo,fantasy}/…`. Suggested split for
  Phase 4: **4a** partner screens (as written) and **4b** player screens + deleting
  `BouncingBallLoader` once nothing imports it (check its `[font-family:'Bree_Serif'…]` text label
  usage — some callers pass a `label` that shows under the ball; `HightopLoader` needs an equivalent
  visible-label option or those screens lose their text). Player screens touched → run
  `npm run test:pwa-contract` (bingo screens) and `npm run test:god-mode-join` if JoinFlow is touched.
- **Q2 — spin, in different directions.** "Make it spin. Make it spin in different directions too if
  possible (stop, then go in another direction). If you can make it appear in a fun, cool or
  interesting way too, that'd be great." Phase 3 should design a loop that alternates direction
  (e.g. hop + clockwise turn → land/squash/pause → hop + counter-clockwise turn → land), which is a
  two-half keyframe cycle in one `@keyframes` (no JS timers). The entrance may be livelier than the
  plain `logo-burst` pop. Reduce Motion: fade pulse only (plan §3, unchanged). Preview video for
  Andrew still required before Phase 4.
- **Q3 — narrow phones say "Store".** Built: below 360 px the button reads bag icon + **Store**.
- Plan §3 decisions still stand (menu row stays; logo removed from the dashboard header only;
  CSS keyframes not framer-motion; originals stay in `public/brand/`; no service worker).

### 4. Files changed in Phase 1 and how they fit

- `components/owner/OwnerAppBar.tsx`
  - Removed the `ExplodingLogo` import and the trailing logo. Trailing slot is now
    `{leading ? <span aria-hidden="true" className="h-10 w-10 shrink-0" /> : <HeaderStoreButton />}`
    (a contract test pins this exact line).
  - `HeaderStoreButtonView({ expanded })` — the button: `data-header-store-button`,
    `aria-haspopup="dialog"`, `aria-expanded`, `aria-label="Order Join Merch"` (constant accessible
    name whichever label is visible), `ShoppingBag` icon, two spans
    (`min-[360px]:hidden` "Store" / `hidden min-[360px]:inline` "Order Join Merch"). onClick:
    `event.currentTarget.focus()` then `openDashboardSheet("store")` (the existing helper, which
    calls `pushSheet(window.history, window.location, "store")` and refuses off `/owner/dashboard`).
  - `HeaderStoreButtonLive` reads `useSearchParams()` → `parseSheetParam(…) === "store"` for
    `aria-expanded`. `HeaderStoreButton` wraps it in `<Suspense>` whose fallback is the same button
    with `expanded={false}` (Next 16 requires Suspense around `useSearchParams`; OwnerAppBar is used
    by statically-rendered owner pages too).
  - **Focus return:** no new focus system. `useModalOverlay` (`components/owner/sheet/useModalOverlay.ts`)
    captures `document.activeElement` as the opener when a sheet opens and refocuses it on exit when
    no `returnFocusRef` is passed — `MerchStoreSheet` passes none. Focusing the button on click
    guarantees it is the active element even in Safari (which doesn't focus tapped buttons).
- `tests/owner-menu-contract.test.ts` — two new static tests: no `ExplodingLogo` in the bar; button
  only without `leading`; calls `openDashboardSheet("store")`, never `router.`; dialog semantics;
  the "Store"/"Order Join Merch" responsive spans; Suspense + URL-driven `aria-expanded`. The
  existing tests (row order, `router.push(href)` as the only navigation) are untouched and pass.
- `tests/components.owner-app-bar.test.ts` — the `next/navigation` mock gained
  `useSearchParams: () => new URLSearchParams(window.location.search)`; the three menu-row tests now
  query `within(drawer())` because the header button shares the "Order Join Merch" name. New jsdom
  tests: click pushes `?venueId=v1&sheet=store` with sheet depth 1, no drawer, no `router.push`,
  focus on the button; `aria-expanded="true"` when the URL has `?sheet=store`; sub-pages have no
  button, only the spacer.
- `docs/join-merch-store-device-checklist.md` — section **M** (two items) for Andrew.
- `docs/partner-dashboard-merch-button-loader-speed-plan.md` — status line + §6 answers + Phase 4
  scope note.

### 5. Facts and traps

- Any test that queries `getByRole("button", { name: /Order Join Merch/ })` on the dashboard bar now
  matches **two** buttons once the drawer is open (header + menu row). Scope to the drawer.
- Any test file that mocks `next/navigation` and renders `OwnerAppBar` (or `OwnerShell` dark,
  dashboard variant) must provide `useSearchParams`, or vitest throws "No useSearchParams export".
- The trailing button is ~145 px wide at ≥360 px and ~78 px below. Width measurement method: a
  standalone HTML copy of the bar with Tailwind CDN + Nunito, measured with the repo's Playwright
  (`node_modules/playwright`). Results (venue-name box width): 320 → 150 px, 359 → 189, 360 → 123,
  375 → 138, 430 → 193 px; 9 chars of Nunito 900 @16px ≈ 80 px. The multi-venue Dropdown trigger
  adds a caret + padding (~30 px less name). The real owner pages were **not** driven in a browser
  (needs an owner session cookie) — device check M covers it.
- `ExplodingLogo` is still used elsewhere (JoinFlow, `/tv`, etc.) — it was only removed from the bar.
  It loads `public/brand/HTC_Logo_Final_Transparent copy.png` (1.7 MB) — Phase 2 repoints it.
- Logo references to repoint in Phase 2: `grep -rn "htc-logo.png\|HTC_Logo_Final" app components lib`.
- Don't run `npx tsc --noEmit` concurrently with `npm run build` (`.next/types` regenerates).
- `npm run lint` prints a harmless Babel "deoptimised styling of lib/sportsBingo.ts" note.

### 6. Build / test / verification

Run sequentially from the repo root:

```
npx tsc --noEmit          # clean
npm run lint              # clean
npm run test              # 274 files passed / 1 skipped; 2,935 tests passed / 13 skipped / 0 failed
npm run build             # succeeded
```

Focused: `npx vitest run tests/components.owner-app-bar.test.ts tests/owner-menu-contract.test.ts tests/owner-dashboard-contract.test.ts` (36 pass).

Unverified: real-phone tap → store → Back (checklist M); VoiceOver reading of the button.

### 7. Open questions for Andrew

None blocking. Commit/push/deploy of Phase 1 is his call. Phase 3's preview video must be approved
by him before Phase 4 wiring.

### 8. Recommended first steps for Phase 2 (Sonnet 5.5, medium)

1. Read the plan §2 (F1, F2) and §4 Phase 2, and this handoff's §3 (loader now goes everywhere —
   Phase 3 will want the 192 px WebP and possibly the 96 px one for small in-page loaders).
2. Take the baseline **before** changing any asset; write the numbers into the Phase 2 handoff.
   Owner cookie for the signed-in dashboard: see `CLAUDE.md` "Manual Testing & Auth Storage" and
   `lib/serverSession.ts`.
3. Write `scripts/optimize-brand-logo.cjs` modelled on the `store:images` script (check
   `package.json` for its command and reuse the same image library), run it, record file sizes.
4. Repoint the references, add the `next.config.ts` header, run `npm run test`,
   `npm run test:god-mode-join` (JoinFlow touched), typecheck, lint, build.
5. Write `docs/partner-dashboard-merch-button-loader-speed-plan_PHASE_2_HANDOFF.md` and update the
   plan's status line.
