# Phase 2 Handoff — baseline measurement + smaller, cached logo

Plan: `docs/partner-dashboard-merch-button-loader-speed-plan.md` · Phase 2 finished 2026-10-01.
Previous: `…_PHASE_1_HANDOFF.md` (still valid for the header button, Andrew's Q1–Q3 answers).

## For Andrew (plain English)

- **What changed:** the logo that every page downloaded was a 1.7 MB picture (twice, under two file
  names). It is now a 17 KB file for small spots and a 59 KB file for the big sign-in logo. Those files
  are also remembered by the phone for a year, so repeat visits don't re-download them.
- **Result (simulated slow 4G phone, empty cache):** Partner Dashboard went from **2,056 KB → 418 KB**
  downloaded and from about **10.4 s → 2.4 s** until the page finished loading; the games list shows at
  ~2.8 s instead of ~10.4 s. The sign-in page went from 3,714 KB → 481 KB.
- **Is it live?** **No.** Saved on this computer only; not committed, pushed or deployed. Your call.
- **Needs you (optional):** on a phone, glance at the logo on the player sign-in screen and the TV page —
  the big logo is a 512 px file shown at 320 px, so it could look a touch softer than before on a
  3× phone screen. If it does, tell the next agent to add a 768 px file (about 100 KB).
- **Cost:** lower. Less data sent per visitor. Nothing else changed (no env, database, cron, vercel.json).
- **Couldn't get:** Vercel's per-route API timings (p50/p95) need the paid "Observability Plus" add-on —
  the query returned 402. I did not buy it. Phase 5's before/after will rely on request counts instead.

---

## For the next agent (Phase 3 — the logo loader; Opus 5.5, high)

### 1. Goal and scope
Plan §4 Phase 3: build `components/ui/HightopLoader.tsx` (+ `logo-hop` keyframes in `tailwind.config.ts`),
using `/brand/web/htc-logo-192.webp` (or `-96.webp` for small sizes). Andrew's Q2 answer: **spin, stop, then
spin the other way; a fun entrance is welcome** (see Phase 1 handoff §3). Loader must also support a
visible text label (player screens' `BouncingBallLoader` callers pass one — Q1 "everywhere"). Preview video
for Andrew is required **before** any page wiring (Phase 4). Out of scope: wiring, dashboard endpoint,
fonts. Do not delete the original PNGs.

### 2. Starting state
Branch `main`, last commit `e900ce7`. **Uncommitted: Phase 1 + Phase 2** (nothing pushed/deployed). No data
changed anywhere. New files are untracked; `git status` shows them. Commit trailer if Andrew asks:
`Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (per the session's attribution reminder).

### 3. Decisions made
- Dropped the global logo `<link rel="preload">` from `app/layout.tsx` instead of repointing it: the
  join screen shows the 512 px file but other pages the 192 px one, so one global preload would be wasted
  on half of them. `ExplodingLogo`'s `<img>` is `loading="eager" fetchPriority="high"` instead.
- `app/info/layout.tsx` schema.org `logo:` URL **keeps the PNG** (crawler-facing, not a page load).
  `lib/venueScreenDebug.ts` and `scripts/generate-pwa-icons.cjs` still use the PNG deliberately.
- `ExplodingLogo` picks 512 when `width > 120`, else 192. `HightopLogo`, `GlobalTransitionOverlay`
  (hidden preload `<img>` + `new Image()` preload) and `/coming-soon` use 192.

### 4. Files changed
- NEW `scripts/optimize-brand-logo.cjs`, `npm run brand:images` in `package.json` → writes
  `public/brand/web/htc-logo-{96,192,512}.webp` (sharp, quality 82): **6.7 / 16.6 / 59.1 KB**. Header
  comment states the immutable-name rule (never overwrite in place; new name for new artwork).
- NEW `public/brand/web/*.webp` (3 files, committed assets).
- `next.config.ts` `headers()`: `/brand/web/:path*` → `Cache-Control: public, max-age=31536000, immutable`
  (verified via `curl -I` on a local prod server).
- Repointed: `app/layout.tsx` (preload removed), `app/coming-soon/page.tsx`,
  `components/ui/{ExplodingLogo,HightopLogo,GlobalTransitionOverlay}.tsx`.
- NEW `tests/brand-logo-assets-contract.test.ts` (4 tests: sizes < 100 KB; no app/components reference to
  the originals except the `/info` schema URL; no global brand preload; immutable header only on that path).
- NEW `scripts/measure-owner-load.cjs` — the baseline tool (see §6). Reuse it for Phase 7.

### 5. Facts and traps
- `/owner/dashboard` no longer loads the logo at all except via the root preload, which is now gone: the
  17 KB left on the dashboard is the `GlobalTransitionOverlay` hidden preload image (it is mounted on every
  page). Phase 6 moves that overlay off `/owner/*`.
- The 1.7 MB PNG is still served at `/brand/htc-logo.png` with `max-age=0` — intentionally untouched.
- `.next/` was rebuilt this phase; `next start -p 3100` must be re-run for the measure script.
- Vercel observability queries: team `team_uGVCpxcJGBQ1VdCDO0lSMRZf`, projects `hightop-challenge`
  `prj_yjIvzEUquV1gPWBsgOIluVp8v1ci` / `trivia-predictions` `prj_OpAN1WsW4vxk9rvc4I6oZANNLeLF` (which one is
  production was not confirmed). `create_observability_query` returns 402 without Observability Plus.
- No `.vercel/` dir in the repo.

### 6. Baseline (BEFORE) and after — Phase 7 compares against these
Method: local **production build** (`npx next start -p 3100`, build of the Phase 1 tree for BEFORE; this
phase's tree for AFTER), headless Chromium 375×812 @3x, fresh context (cold cache), CDP "Slow 4G"
(1.6 Mbps down / 750 kbps up / 150 ms RTT) + 4× CPU, median of 3. Signed-in cookie minted from
`SESSION_SECRET` for owner `64f046ff-…` (venue-pacific-street; value never printed). Local = no CDN/cold
start/Vercel latency, so absolute numbers are optimistic; use them for relative comparison.
Command: `npx next start -p 3100 &` then `node --env-file=.env.local scripts/measure-owner-load.cjs`.

| Page | | requests | transferred | logo bytes | load event | LCP | games list visible |
|---|---|---|---|---|---|---|---|
| /owner/login | BEFORE | 42 | 3,714 KB | 3,310 KB | 18,545 ms | 1,660 ms | n/a |
| /owner/login | AFTER | 42 | 481 KB | 76 KB | 2,546 ms | 1,596 ms | n/a |
| /owner/dashboard | BEFORE | 32 | 2,056 KB | 1,655 KB | 10,414 ms | 3,728 ms | 10,438 ms |
| /owner/dashboard | AFTER | 32 | 418 KB | 17 KB | 2,397 ms | 2,836 ms | 2,827 ms |

"Games list visible" = body text contains "Offer Rewards" (both lists loaded). Request counts unchanged
(this phase removes bytes, not requests). The `/owner/login` login page still shows 76 KB of logo (the
512 px `ExplodingLogo` plus the 17 KB overlay preload). API p50/p95: unavailable (402). Vercel bandwidth
trend: not checked (needs a deploy first).
Not separately measured: the player join screen (`/`) LCP before/after. It now loads a 59 KB file
instead of a 1.7 MB one, and the `<img>` has `fetchPriority="high"`, so a regression is implausible,
but if Phase 7 wants proof, run the script against `/`.

### 7. Verified
`npx tsc --noEmit` clean; `npm run lint` clean (harmless Babel sportsBingo note); `npm run test`
275 files / 2,939 tests pass, 13 skipped; `npm run test:god-mode-join` 34/34; `npm run build` OK.
`test:pwa-contract` not run — manifest/icons untouched. **Unverified:** crispness on a real 3× phone.

### 8. Open questions
None blocking. Whether to commit/push is Andrew's. Possible add-on: a 768 px logo if the sign-in logo looks soft.

### 9. First steps for Phase 3
1. Read Phase 1 handoff §3 (Q1/Q2) and plan Phase 3. 2. Add `logo-hop`/entrance keyframes next to
`logo-burst` in `tailwind.config.ts` (transform/opacity only; alternate direction in one two-half cycle).
3. Build `HightopLoader` (`size` prop, `label` visible option, `delayMs` default 200, `motion-reduce:` fade
pulse, `role="status"`). 4. Vitest fake-timer test + static no-framer/no-inline-style test. 5. Record a
375×812 Playwright video (normal + Reduce Motion) under `docs/assets/`; stop for Andrew's approval.
6. Write `…_PHASE_3_HANDOFF.md` and update the plan's status line.
