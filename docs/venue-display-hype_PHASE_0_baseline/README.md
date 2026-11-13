# Venue display — Phase 0 baseline (2026-11-12)

What the venue TV display looked like and how fast it drew **before** the redesign
(`docs/venue-display-hype-and-intro-stinger-plan.md`). Phase 3 ("every mode screenshots differently") and Phase 6
(throttled frame times vs baseline) compare against this folder.

- **Code captured:** commit `4b4cc05f` on `feature/venue-display-intro-stinger` (intro stinger + sound, phases 1–2;
  **no** Phase 3 brand chrome — that work was uncommitted and is being redone).
- **How:** scratchpad copy of that commit (`git archive`), no `.env.local`, dummy Supabase env, `next build` +
  `next start -p 3157`. A harness page `/tv/fx-baseline/[name]` renders `VenueScreenClient` from fixtures, and the
  clone's `/api/venue-screen/state` answers polls from the same fixtures. Copies are in `harness/` (`.txt` so the
  repo's typecheck/lint/tests ignore them). States were shot with the stinger off (`intro` not set to 1).
- **Browser:** Playwright Chromium 149 headless, 1920×1080 @1×. Frame times = `requestAnimationFrame` deltas over
  5 s, with CDP `Emulation.setCPUThrottlingRate` ×6 as a rough Fire TV Stick stand-in.

## Screenshots (1920×1080, JPEG q82)

`idle-0/1/2` (0, 1, 2 next games), `lt-question`, `lt-reveal`, `lt-intermission` (round break), `lt-final`,
`cb-round`, `cb-intermission`, `cb-results`, `squares`, `bracket`, `golive-takeover-0.6s`, `tv-pairing`,
`intro-stinger-1.2s`, `intro-stinger-2.6s`.

## Frame times (×6 CPU throttle) — full data in `frame-times.json`

| State | mean ms | p95 ms | fps | Polls remounting elements (5 s) |
|---|---|---|---|---|
| idle 0 / 1 / 2 | 11.0 / 13.5 / 13.0 | 17–18 | 74–91 | — |
| Live Trivia question / reveal / break / final | 8.3 | 9.2 | 120 | 0 |
| Category Blitz round / intermission / results | 8.3 | 9.2 | 120 | 0 |
| Squares, Bracket, `/tv` pairing | 8.3 | 9.2 | 120 | — |
| Go-live takeover (first 2.5 s) | 12.7 | 25.9 | 79 | — |
| **Intro stinger** (once running, `stinger-fps.mjs`) | **174** | **250** | **5.7** | — |
| Intro stinger, no throttle | 31.4 | 41.9 | 31.8 | — |

No console errors in any state.

**Reading it:** static panels are idle for the CPU (headless rAF runs at 120 Hz when nothing animates). The
**stinger is the heavy item**: its full-screen gradient fills and rays are rasterised on the CPU in headless Chromium
(no GPU), so throttling hits it hard. A real TV stick draws canvas on its GPU, so this overstates the problem, but it's
the thing to watch on the Phase 6 device run. See the Phase 0 handoff for options.

## Engine check (Phase 0 engine on the same clone, `engine-check.mjs`)

Burst + shockwave + confetti shower at ×6: **57.8 fps** (mean 17.3 ms, p95 24.9 ms); tier stayed `full`.
Ambient twinkle field (30 stars) unthrottled: 67 fps. Canvas 1×1 and hidden when idle; 2880×1620 backing at
1920×1080 @2×; reduced motion → tier `off`; no console errors.

## Re-running

1. `git archive <commit> | tar -x -C <scratch>/clone`, `cp -Rc node_modules` into it.
2. Copy `harness/fxBaselineFixtures.ts.txt` → `lib/fxBaselineFixtures.ts`, `fx-baseline-page.tsx.txt` →
   `app/tv/fx-baseline/[name]/page.tsx`, `mock-state-route.ts.txt` → `app/api/venue-screen/state/route.ts`
   (clone only — never in the repo).
3. `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy npx next build`, then the same env with `npx next start -p 3157`.
4. Put the `.mjs` scripts in a folder with a `node_modules` symlink to the clone's, and run
   `node capture.mjs <outDir>` and `node stinger-fps.mjs`.
