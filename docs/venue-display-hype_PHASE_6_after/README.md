# Venue display — Phase 6 verification (2026-11-12)

Headless results for `docs/venue-display-hype-and-intro-stinger-plan.md` §4 Phase 6, compared with
`docs/venue-display-hype_PHASE_0_baseline/` (commit `4b4cc05f`, before Phases 0 and 3–5).

**How:** scratchpad clone of the branch (`git archive` + the Phase 0 harness files from
`docs/venue-display-hype_PHASE_0_baseline/harness/`, plus a clone-only `window.__fx = engine` line in `FxCanvas.tsx`),
no `.env.local`, dummy Supabase env, `next build` + `next start -p 3181`. Baseline clone of `4b4cc05f` on :3182 for
4K and reduced-motion numbers the Phase 0 folder didn't have. Playwright Chromium 149 headless, no GPU (canvas and
CSS are rasterised on the CPU, which overstates large-surface costs vs a TV stick's GPU). Throttle = CDP CPU ×6.
Scripts are in `scripts/` (`.mjs.txt`; copy as `.mjs` next to a `node_modules` symlink).

## Three defects found and fixed in this phase

| # | Found | Fix | Proof |
|---|---|---|---|
| 1 | **Reduced motion: React hydration error #418** on question, round break, final (and Blitz round in the baseline). Pre-dates this plan (baseline has it). Server renders "no preference"; framer's `useReducedMotion()` is already true on the client's first render, so `{!reduceMotion && <el/>}` changed the markup. | `fx/useReducedMotionAfterHydration.ts` (`useSyncExternalStore`, server snapshot `false`) for element-existence gates in `TvQuestionReveal`, `TvAnswerReveal`, `TvRoundBreak`, `TvFinalStandings`, `TvBlitzResults`. Animation values still use framer's hook. | `frame-times/1080-reduced.json`: 0 console errors (was 3). Test `tests/venue-screen-reduced-motion-hydration-contract.test.ts`. |
| 2 | **4K: static game screens 22–31 fps at ×6** (baseline 120). Cause: the two drifting 1100 px `BrandStage` washes (Phase 3). Hiding them: 41 → 8.7 ms/frame. The fx watchdog already drops to `off` at 4K, but only the canvas listened. | Engine exposes `subscribeTier`; `useFxTier()` hook; `BrandStage` glides home and stops when the tier is `off` (as under reduced motion). | `frame-times/4k.json`: Live Trivia / Blitz / Bracket 104–118 fps. Test `tests/venue-screen-brand-stage-tier-contract.test.ts`. |
| 3 | **Long run: one slow spell switched effects off for the rest of the night.** The watchdog stepped full → lite → off in 1 s (no pause between judgements) and never stepped back up. In a 3-night run it fired in night 1 (Blitz round 3); every later moment and the twinkles were gone. | `fxEngine.ts`: after a drop, frames aren't judged for `FX_TIER_HOLD_MS` (3 s), so one spell = one tier; each watchdog drop schedules a retry one tier up after `fxTierRetryDelayMs` (1 min, doubling per drop, cap 32 min), never above the ceiling from reduced motion / core count; ambient effects (twinkles) restart when the tier comes back from `off`. | `logs/game-nights-before-fix.log` vs `logs/game-nights-after-fix.log`; `logs/watchdog-recovery.log`. Tests in `tests/venue-screen-fx.test.ts`. |

Also fixed: **sound when autoplay is blocked.** The boom was rejected but the shine still played alone at 2.15 s
(Chromium allowed it). Now a blocked boom means a silent stinger (`soundBlocked` in `TvIntroStinger.tsx`).

## 1. Every state × motion × size (after fixes)

Zero console errors in every run below; **0 elements remounted per 5 s of polls** in every game state.

| Run | Result | File |
|---|---|---|
| 1920×1080 | all states ≥ 48 fps at ×6 (idle 52–58, game 71–95, go-live 48); baseline game screens 120, idle 74–91 | `frame-times/1080.json` |
| 1920×1080 reduced motion | 120 fps everywhere, stinger 42 fps; same as baseline; 0 errors (baseline: 4 × #418) | `frame-times/1080-reduced.json` |
| 3840×2160 | game screens 104–118 fps; idle 14–25 (baseline 16–18); go-live 39 (43.6); stinger 4.1 (4.3) | `frame-times/4k.json`, `baseline-4k.json` |
| 390×844 phone portrait (DPR 3) | 117–140 fps, stinger 10 fps | `frame-times/phone.json` |

`1080.json` and `phone.json` were captured before fixes 1–3 (none of them changes a full-tier, no-preference
render). `4k.json` and `1080-reduced.json` are after.

**Watchdog / "never below ~30 fps for more than a second":** at 1080p ×6 no state had a sub-30 fps stretch longer
than 0.4 s except the intro stinger (Phase 0's known heavy item, unchanged: 7 fps at ×6 headless) and the go-live
takeover (12 % of frames > 33 ms, unchanged in kind from baseline). At 4K the tier drops to `off` within ~1 s
and, after fix 2, the game screens settle at 95–118 fps. Idle at 4K stays slow (14–25 fps at ×6), as in the
baseline: the slow item is the idle screen's own full-screen wash (pre-dates this plan), not the new effects.

## 2. Moments fire once (Phase 5 suite re-run)

`docs/venue-display-hype_PHASE_5_after/verify5*.mjs.txt` on the fixed build: every moment fires exactly once, 0 on
polls held 5–6 s, 0 on reloads of all 7 states, 0 under reduced motion, no errors.

## 3. Sound (`scripts/sound.mjs.txt`)

| Case | Boom (t≈0.12 s) | Shine (t≈2.26 s) | Errors |
|---|---|---|---|
| autoplay blocked (TV-like) | NotAllowedError → silent | not played | 0 |
| autoplay allowed | played | played | 0 |
| `intro=0` (dashboard thumbnail) | no audio at all | — | 0 |
| Expand-style iframe, phone portrait, allowed | played | played | 0 |
| Expand-style iframe, blocked | silent | not played | 0 |

Not checked: actual playback by ear; iOS Safari.

## 4. Long run

- **3 h idle, accelerated clock** (`scripts/longrun-idle.mjs.txt`, fake clock): 145 canvas effects fired in 3 h
  (one burst per 75 s slot + the twinkle field); heap after GC 4.58 → 5.36 → 5.63 → 5.69 MB at 0/1/2/3 h; 1 canvas
  and 122 elements throughout; the drift kept moving. (The script's per-slot miss counter reads 144/144: a fake-clock
  attribution artefact; the totals show one burst per slot.)
- **3 game nights on one page, real clock** (`scripts/gamenights.mjs.txt`; each night = go-live, 8 Live Trivia
  rounds incl. last-5-s, reveal, round break with a new leader, final, then 8 Category Blitz rounds, then idle):
  after the fix, every night fired go-live 1, 8 reveals, 7 leader pops, final 2 (shower + burst), 8 slams, 8 winner
  bursts. Heap 4.14 → 6.02 → 6.14 → 6.17 → 6.30 MB (start / after each night / idle after); 1 canvas and 122
  elements throughout; 0 errors. One slow spell dropped the tier to `lite` in night 2 and it climbed back to `full`
  60 s later.
- The fake clock couldn't drive game nights (screen changes stalled under faked timers), so those ran in real time.

## 5. Known, not fixed

- **#418 when the TV's clock differs from the server's.** With a fake clock ahead of the server, the first render's
  countdown digits differ from the server HTML and React re-renders on the client (one console error, no visible
  effect; the fx gate swallows keys before it arms, so nothing replays). Real TVs whose clocks are off by a second
  or more will log it. Fix later by rendering countdowns from `state.updatedAt` on the first client render, or
  `suppressHydrationWarning` on the digit elements.
- **Twinkles in the phone letterbox:** the effects canvas covers the whole viewport, so in portrait (dashboard
  Expand) stars twinkle in the black bars above and below the stage (`shots/phone-lt-question.jpg`). Cosmetic.
- **Intro stinger weight** on a weak stick (Phase 0 handoff §5 has options): decide after the real-TV run.
