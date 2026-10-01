# Phase 3 Handoff — the Hightop logo loader

Plan: `docs/partner-dashboard-merch-button-loader-speed-plan.md` · Phase 3 finished 2026-10-01.
Previous: `…_PHASE_2_HANDOFF.md` (baseline numbers, logo files), `…_PHASE_1_HANDOFF.md` (header button,
your Q1–Q3 answers).

## For Andrew (plain English)

- **What changed:** the loading animation you asked for is built. The Hightop logo drops in from
  above, spinning, and lands with a squash. Then it hops forever: up with one full spin clockwise,
  land, a beat on the ground, up again with one full spin **the other way**, land. A soft shadow on
  the ground shrinks and fades each time it goes up. If a phone has "Reduce Motion" turned on it
  just shows the logo with a gentle fade in and out — no hopping, no spinning.
- **It is not on any screen yet.** That is the next phase, on purpose: you asked to see the motion
  first. Nothing players or partners see has changed.
- **Please look at it, two ways:**
  1. Open `docs/assets/hightop-loader-normal.webm` (and `…-reduced.webm` for the Reduce Motion
     version) — short phone-sized screen recordings.
  2. Or see it live and full-speed in a browser: run `npm run loader:preview -- --serve` in the
     project folder and open **http://localhost:3117** (Ctrl-C to stop).
  `docs/assets/hightop-loader-still.png` is a single frame if you just want a glance.
- **What I need from you:** a yes / "change this" on the motion. Things you might want tuned, each a
  one-line change: how high it hops (currently 45% of its own height), how fast a full cycle is
  (2.6 seconds for both hops), how long it pauses on the ground between spins, and how lively the
  entrance is. **Phase 4 should not start until you have said yes** — Phase 4 puts it on ~20 screens,
  so changing the motion afterwards is still easy, but re-checking all those screens is not.
- **Is it live?** **No.** Phases 1, 2 and 3 are all saved on this computer only — not committed, not
  pushed, not deployed. Still your call.
- **Cost:** none. No new network requests (it reuses the 17 KB logo file every page already loads),
  no JavaScript running per frame, no server work, no env/database/cron/`vercel.json` change.
- **Repo size note:** the two `.webm` recordings are ~1 MB together. They are review material, not
  app code — once you have approved the motion they can be deleted; `npm run loader:preview`
  regenerates them any time.

---

## For the next agent (Phase 4 — wire the loader into the screens; Opus 5.5, high)

### 1. Goal and scope

Plan §4 Phase 4 **as widened by Andrew's Q1 answer** ("loader everywhere, get rid of the
basketball"), so run it as the two halves the Phase 1 handoff suggested:

- **4a — partner screens.** `app/owner/loading.tsx` (new) + each `/owner/*` page's first-load state;
  the dashboard shows **one** loader until venues *and* both lists have answered, then reveals in one
  step; `app/owner/login/page.tsx:45` shows the loader on sign-in success before
  `router.push("/owner/dashboard")`. Keep `SectionSkeleton` for in-place refreshes (Retry) and keep
  "rows stay until the refetch arrives" after a save. No loader inside sheets (Schedule, Rewards,
  Store, Partner Manual) and none for the Stripe hand-off.
- **4b — player screens.** Replace all 41 `BouncingBallLoader` uses in 18 files
  (`grep -rn "BouncingBallLoader" app components`), then delete
  `components/ui/BouncingBallLoader.tsx` once nothing imports it. Mapping is mechanical:

  | `BouncingBallLoader` | `HightopLoader` |
  |---|---|
  | `<… size="sm" label="Loading games..." />` | `<… size="sm" showLabel label="Loading games..." />` |
  | `<… dark label={x} size="lg" />` | `<… variant="plain" showLabel label={x} size="lg" />` |
  | `<… fullScreen size="lg" />` | `<… variant="fullScreen" size="lg" showLabel label="Hightop Challenge: Game On." />` |
  | default (no `dark`/`fullScreen`) | `variant="card"` + `showLabel` |

  **`showLabel` is opt-in and `BouncingBallLoader`'s label was always visible** — forget it and those
  screens silently lose their text. `BouncingBallLoader`'s default label is
  `"Hightop Challenge: Game On."`; `HightopLoader`'s is `"Loading…"` (announced, not drawn), so pass
  the old text explicitly wherever it was relied on (`RouteLoadingScreen`, `GlobalTransitionOverlay`).

Also in scope: check `GlobalTransitionOverlay` (`tp:global-transition-show`) never fires on
`/owner/*` so two overlays can't stack (plan §4 Phase 4 item 6).

**Out of scope:** the `/api/owner/dashboard` endpoint (Phase 5), fonts / player-runtime (Phase 6),
re-measuring (Phase 7). Do not change the loader's motion unless Andrew asked for a change.

### 2. Starting state

- Branch `main`, last commit `e900ce7`. **Phases 1, 2 and 3 are all uncommitted**; nothing pushed or
  deployed. No database, Supabase, env var, cron or Vercel change in any of the three phases.
- `git status` at the end of Phase 3 (M = modified, ?? = untracked):
  `M app/coming-soon/page.tsx app/layout.tsx components/owner/OwnerAppBar.tsx
  components/ui/{ExplodingLogo,GlobalTransitionOverlay,HightopLogo}.tsx
  docs/join-merch-store-device-checklist.md next.config.ts package.json tailwind.config.ts
  tests/{components.owner-app-bar,owner-menu-contract}.test.ts`;
  `?? components/ui/HightopLoader.tsx lib/useLoaderVisible.ts docs/assets/ public/brand/web/
  scripts/{capture-hightop-loader,measure-owner-load,optimize-brand-logo}.cjs
  tests/{brand-logo-assets-contract,components.hightop-loader,hightop-loader-contract}.test.ts`
  plus the plan and the three handoffs.
- Commit trailer if Andrew asks for a commit: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Blocking:** Andrew's approval of the motion (§1 above). If he asks for changes, they live in
  `tailwind.config.ts` keyframes only — `HightopLoader.tsx` needs no edit for timing/height changes.

### 3. Decisions made in Phase 3 (do not re-ask)

- **One component, three `variant`s** (`plain` / `card` / `fullScreen`) instead of
  `BouncingBallLoader`'s two booleans (`dark`, `fullScreen`). `plain` == the old `dark`; `card` keeps
  the old bordered panel (`rounded-ht-xl border border-ht-border-hairline bg-ht-elevated px-4 py-6`);
  `fullScreen` keeps the old overlay chrome exactly (`fixed inset-0 z-[2400] … bg-[#030712]`,
  `pointer-events-none`).
- **The label is announced always, drawn only with `showLabel`.** Partner screens want silence;
  player screens pass their text. `role="status" aria-live="polite"` sits on the wrapper, the logo is
  `aria-hidden` with `alt=""`, so a screen reader hears the label once and not "image".
- **One image for every size: `/brand/web/htc-logo-192.webp` (16.6 KB).** The sizes are 32 / 48 /
  64 px, so 192 px is ≥3× on all three, and because `HightopLogo`, `GlobalTransitionOverlay` and
  `/coming-soon` already load that exact URL (Phase 2), a loader costs **zero extra bytes** on a page
  that showed a logo and one cheap cached request elsewhere. The 96 px file is deliberately unused
  here — using it would have added a second cache entry to save 10 KB once.
- **Entrance 0.95 s, then an endless 2.6 s two-hop loop**, chained by a single CSS `animation`
  shorthand holding two animations (`logo-arrive … , logo-hop … 0.95s infinite`) — not an
  `onAnimationEnd` phase state. No React re-render, nothing to get stuck. The loop is listed second so
  it wins the composite `transform` once it starts.
- **Hop and spin are separate elements.** The hopper is `origin-bottom` (so the squash anchors to the
  ground), the spinner inside it is `origin-center`. Putting both on one element makes a squashed
  rotation skew. Do not merge them.
- **Spin alternates by returning to 0°**: `0deg → 360deg` (held across the landing, which is the
  visible "stop") `→ 0deg`. Net zero per cycle, so the loop is seamless and genuinely reverses —
  Andrew's Q2 answer.
- **Reduce Motion:** hopper and spinner get `motion-reduce:animate-none`, the shadow
  `motion-reduce:hidden`, and the image `motion-reduce:animate-logo-pulse` (1.6 s opacity 0.45↔1).
  Verified in a real Chromium with `reducedMotion: "reduce"`: computed `animation-name` is `none` on
  the hopper, `logo-pulse` on the image, `display: none` on the shadow.
- **Show-delay lives in `lib/useLoaderVisible.ts`, used by the component for itself.** The component
  renders `null` for its first `delayMs` (default 200 ms). The same hook also implements the
  *minimum-visible* half, which only a caller can use — see §5.

### 4. Files created / changed

- **NEW `components/ui/HightopLoader.tsx`** — arrow component, `"use client"`, Tailwind only.
  Props: `size?: "sm"|"md"|"lg"` (default `md`), `label?` (default `"Loading…"`), `showLabel?`,
  `variant?: "plain"|"card"|"fullScreen"` (default `plain`), `delayMs?` (default 200), `className?`.
  `SIZES` maps each size to stage/logo/shadow classes, the `width`/`height` attributes and the
  label text size. DOM: `div[role=status] > div.stage[aria-hidden] > (shadow div, hopper div >
  spinner div > img)` then `<p>` (label, `sr-only` unless `showLabel`).
- **NEW `lib/useLoaderVisible.ts`** — `useLoaderVisible(loading, { delayMs, minVisibleMs })` plus
  `LOADER_DELAY_MS` (200) and `LOADER_MIN_VISIBLE_MS` (500).
- **`tailwind.config.ts`** — seven new keyframes after `logo-release`
  (`logo-arrive`, `logo-arrive-spin`, `logo-arrive-shadow`, `logo-hop`, `logo-spin`,
  `logo-hop-shadow`, `logo-pulse`) and four new `animation` entries (`logo-loader-body`,
  `logo-loader-spin`, `logo-loader-shadow`, `logo-pulse`). Transform/opacity only; gravity comes from
  per-keyframe `animationTimingFunction`. **This is the only file to edit for motion tuning.**
  Timeline inside the 2.6 s loop (percent of cycle): 5 crouch · 9 launch · 24 apex (−45% of its
  height) · 36 contact · 39 land-squash · 44 settle · 44–50 **pause** · 55–94 the same mirrored ·
  94–100 pause. The spin turns during 9→36 and unwinds during 59→86.
- **NEW `scripts/capture-hightop-loader.cjs` + `npm run loader:preview`** — renders the *real*
  component with `react-dom/server`, compiles the *real* `tailwind.config.ts` with the repo's
  Tailwind CLI (plus `app/globals.css`'s `:root` tokens), serves it on **port 3117** with `/brand/*`
  proxied out of `public/`, and records two Playwright videos at 375×812. `--serve` skips recording
  and leaves the server up for a human. Nothing in it can drift from what ships.
- **NEW `docs/assets/`** — `hightop-loader.html` (self-contained preview page; its `/brand/…` image
  only resolves over the script's server, not via `file://`), `hightop-loader-normal.webm`,
  `hightop-loader-reduced.webm`, `hightop-loader-still.png`.
- **NEW `tests/components.hightop-loader.test.ts`** (jsdom, 11 tests) — the hook's four timing cases
  under fake timers, plus the component's delay, label modes, image, animation classes and variants.
- **NEW `tests/hightop-loader-contract.test.ts`** (static, 10 tests) — no framer-motion import, no
  inline `style`, no `!` utilities, every `animate-logo-*` class exists in `tailwind.config.ts`, the
  keyframes animate **only** transform/opacity/timing-function, the spin is `0 → 360 → 0` with the
  `"36%, 59%"` hold, the entrance→loop shorthand shape, Reduce Motion, `role="status"`, and that the
  192 px WebP is used and the 1.7 MB originals are not.
- `package.json` — one new script line (`loader:preview`).

### 5. Facts and traps

- **`delayMs` is paid once per component instance.** If a page gates on `useLoaderVisible` itself
  (the dashboard's "one loader until all three answered"), pass `delayMs={0}` to the component or the
  200 ms is charged twice. The hook's doc comment shows the pattern.
- **`useLoaderVisible`'s minimum-visible half only works if the *caller* keeps rendering.** The
  component cannot delay its own unmount — a parent that does `{loading && <HightopLoader/>}` gets
  the delay but not the minimum. For a surface where a blink is likely (a fast cached dashboard),
  drive visibility from the hook in the parent.
- **ESLint `react-hooks/purity` and `react-hooks/set-state-in-effect` are errors here.** `Date.now()`
  may not be called during render (hence the ref is stamped in the effect), and `setState` may not be
  called synchronously in an effect body — both transitions go through `setTimeout`, even at 0 ms.
  A "simplification" that removes either timer will fail `npm run lint`.
- **The loader needs vertical headroom and must not be clipped.** The stage reserves ~45% of the
  logo's height above it, and the *entrance* starts 105% above the stage — a parent with
  `overflow-hidden` will cut the drop-in. `BouncingBallLoader`'s own container had
  `overflow-hidden`; `HightopLoader`'s does not, deliberately. Check tight containers when wiring.
- **`motion-reduce:` beats the base class only because Tailwind emits variants after base
  utilities.** Do not reorder/extract those classes into a `clsx` that could change emission order.
- **Keyframe percentages on `translateY` are relative to the element's own height**, which is why one
  keyframe set serves all three sizes. Don't switch to `px`.
- `npm run loader:preview` writes scratch files to `.next/cache/loader-preview/` (gitignored) and
  needs `node_modules/.bin/tailwindcss` plus Playwright's Chromium — both already present.
- Don't run `npx tsc --noEmit` concurrently with `npm run build` (`.next/types` regenerates).
- `npm run lint` prints a harmless Babel "deoptimised styling of lib/sportsBingo.ts" note.

### 6. How to build, run and test — and what was verified

```
npm run loader:preview            # re-record the videos (or `-- --serve` to just view it)
npx vitest run tests/components.hightop-loader.test.ts tests/hightop-loader-contract.test.ts
npx tsc --noEmit                  # clean
npm run lint                      # clean
npm run test                      # 277 files passed / 1 skipped; 2,960 passed / 13 skipped / 0 failed
npm run build                     # ✓ Compiled successfully
```

Verified beyond the tests: the animation really runs in Chromium (twelve frames sampled across one
entrance + one full loop show the drop-in, both hops, both spin directions and the shadow pumping);
Reduce Motion verified by computed style as described in §3. **Unverified / risky:** nothing has been
seen on a real phone, and nothing is wired into a page, so there is no evidence yet about how it
behaves under a real slow load, inside a scrolling list, or against the dashboard's dark canvas at
device scale 3. Phase 4 must add device-checklist items (plan §4 Phase 4: cold open, menu → Billing →
Back, slow connection, Reduce Motion) to `docs/partner-dashboard-app-redesign-device-checklist.md`.

### 7. Open questions / waiting on Andrew

1. **Motion approval** (blocking Phase 4). See §1 for how to view it and what is cheap to tune.
2. Whether to commit / push / deploy Phases 1–3 — still his call, nothing is live.
3. Carried over from Phase 2, still open: whether the big sign-in logo looks soft on a 3× phone (if
   so, add a 768 px WebP). Does not affect the loader, which is ≥3× at every size.

### 8. Recommended first steps for Phase 4 (Opus 5.5, high)

1. Confirm Andrew approved the motion; apply any tweak in `tailwind.config.ts` and re-run
   `npm run loader:preview` for a second look before touching pages.
2. Do **4a** first and keep it reviewable: add `app/owner/loading.tsx`
   (`<HightopLoader variant="fullScreen" size="lg" delayMs={0} />` on the dark canvas), then the
   per-page states found with `grep -rln "SectionSkeleton\|Loading" app/owner`, then the dashboard's
   single-loader rule (this is the one with real logic — use `useLoaderVisible` in the page).
3. Then **4b**, one directory at a time, using the mapping table in §1; delete
   `BouncingBallLoader.tsx` only when `grep -rn "BouncingBallLoader" app components` is empty.
4. Write `tests/owner-loader-contract.test.ts` as the plan specifies, and extend it for 4b: no file
   under `app/`/`components/` imports `BouncingBallLoader`, and every `HightopLoader` that replaced a
   labelled ball still passes `showLabel`.
5. Gates: `npm run test`, `npm run test:pwa-contract` (bingo screens are touched in 4b),
   `npm run test:god-mode-join` if `JoinFlow` is touched, `npx tsc --noEmit`, `npm run lint`,
   `npm run build`. Then `…_PHASE_4_HANDOFF.md` and the plan's status line.
