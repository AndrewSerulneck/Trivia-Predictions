# Venue Display Hype — Phase 4 Handoff (idle screen: calm + periodic bursts)

Built 2026-11-12 by Claude Sonnet 5.5 (plan's model for Phase 4, medium effort).

## For Andrew (plain English)

- **What changed:** the between-games screen now does a small "moment" every 75 seconds: a shine across the
  "Hightop" word and a coin-and-spark burst from the Next-up card. It's tied to the clock, so two TVs fire together
  and a reload doesn't add an extra one. The Next-up cards now take each game's colours and artwork (Live Trivia:
  purple spotlight and a cyan "?"; Category Blitz: green with the "B" tile); the words are unchanged. Countdown digits
  flip once under an hour; under 5 minutes the countdown pill beats like a heartbeat with a ring. No new words.
- **Live?** No. Phases 0 + 3 are committed (`d71c2e92`); Phase 4 is **not** committed, pushed or deployed. No
  database, settings or cost changes.
- **Checked in a browser** (throwaway copy, fake data): a simulated 3 hours of idle fired a burst at every one of
  the 144 slots, none at load or on a reload, memory stayed flat, the slow drift kept moving, no errors (also in
  reduced motion). Pictures in `docs/venue-display-hype_PHASE_4_after/`.
- **Needs you:** a look on a real TV when convenient (Phase 6 has the formal device run).

## For the next agent

### 1. Next phase and scope
**Phase 5, game moments** (plan §4 Phase 5; Sonnet 5.5 medium). Out of scope: stinger, idle changes, release work (Phase 6).

### 2. Starting state
Branch `feature/venue-display-intro-stinger`; last commit `d71c2e92` (Phases 0 + 3). Uncommitted: Phase 4 files below.
**Not mine:** at the end of this phase `git status` also showed uncommitted Phase 5 (game moments) work I did not write
(`fx/MomentOverlays.tsx`, `tests/venue-screen-game-moments-contract.test.ts`, edits to `Tv*`/`LiveTrivia*`/`CategoryBlitz*`
screens, `VenueScreenClient.tsx`, `fx/useFx.ts`, `fx/fxEngine.ts`); another session appears to be on it. My Phase 4 files
are only the ones listed in §4. Commit them separately (`git add` by path).
Untracked and not ours: `docs/cancelled-prizes-pick-windows-away-mode-plan_C1_BACKFILL_LOG_2026-11-09.json`. Nothing
pushed or deployed. No DB / env / migration / cron changes.

### 3. Decisions made
- **Moment key** `idle:${Math.floor(nowMs / 75_000)}` (`IDLE_MOMENT_MS`). The slot present at mount is never fired
  (`firstMomentKey` state), so a reload mid-slot is quiet even though the fx gate is already armed.
- **The shine** is the wordmark's `ShineSweep` (`periodMs` 75 s, `delayMs` 0, same slot as the burst). The idle screen
  has no logo image, so the "logo" is the Hightop wordmark. Reduced motion: `ShineSweep` stays invisible; the wordmark
  fades 0.6 → 1 once per slot (key change) instead.
- **Burst** is anchored on the Next-up card (`cardRef`): 10 coins, 26 sparks, no shockwave. The engine handles `lite`
  (half density) and reduced motion / `off` (nothing).
- **Cards**: `NextGame` gained `gameKey` and `remainingSeconds`. Card uses the theme's `surfaceClass`, `backdrop` and
  `art` only (not `renderTitle`, which needs a `cqw` size container); the label is untouched ("styles, never rewords").
  Long labels (> 14 chars) use 54 px instead of 72. Border/heartbeat accent: cyan for Live Trivia, green for Category
  Blitz (`GAME_ACCENT`).
- **Flip**: per-character `FlipChar` (rotateX + opacity), a visually hidden full string keeps the text searchable.
  **Heartbeat**: under 300 s the pill scales on a 1.2 s beat plus a ring (`data-testid="idle-heartbeat"`).
- **Reduced motion renders the same markup** (flip chars and the ring still render, just don't animate). Don't gate
  markup on `useReducedMotion()` (hydration error #418; found and fixed here, same trap as Phase 3).
- Twinkles, `BrandStage`, drift and rotation: unchanged (Phase 3 / existing).

### 4. Files
Changed: `components/venue-screen/TvIdleAttract.tsx`, `components/venue-screen/IdleVenueScreen.tsx` (passes
`gameKey`, `remainingSeconds`; Category Blitz on-demand card also gets `gameKey`). New:
`tests/venue-screen-idle-moments-contract.test.ts` (6), `docs/venue-display-hype_PHASE_4_after/` (5 pictures,
`results.txt`, `verify.mjs.txt`). Plan status line updated.

### 5. Facts and traps
- Playwright `clock.runFor` over 3 h replays ~650 k rAF frames (hours of CPU in headless); use
  `clock.fastForward(ms)` between slots and `runFor(500)` ×6 after each boundary. A pending `node … | tail` shows
  nothing until it exits; write to a file.
- Measure bursts by counting `CanvasRenderingContext2D.drawImage` calls per 500 ms window (rest ≈ 60–160; burst
  ≈ 1100–2500). Counting canvas alpha pixels was too noisy against twinkles.
- The drift element is the div whose inline `transition` contains `900ms` (the first `translate3d` div is the
  venue's burn-in wrapper).
- Scratchpad-clone recipe is in the Phase 3 handoff §5; Phase 4 added an `idle-soon` fixture (4 min / 3 min starts)
  to the clone's `lib/fxBaselineFixtures.ts` only (not in the repo).

### 6. Build, run, test, verification
`npx tsc --noEmit` ✔ · `npx eslint components/venue-screen tests` ✔ · `npm run test` ✔ (526 files, 6980 tests, before
the final reduced-motion fix; venue-screen tests re-run after: 102 ✔). Clone production build ✔.
Browser (Chromium 149, 1080p): 144/144 slots burst (min 1117 draws/500 ms vs ~58 rest), none at load, reload
mid-slot: none before the boundary, one after; heap 4.5 → 5.7 MB, 1 canvas, 122 nodes at the end; drift moves; real
clock, all four idle fixtures, normal + reduced motion: 0 console errors. Flip adds 3–4 nodes/s only under an hour;
heartbeat ring only under 5 min; none under reduced motion. Frame time ×6 throttle idle-2: 19.7 ms mean, p95 25.9,
51 fps (Phase 3 was 17.5–19.6; baseline 11–13.5).
**Not verified:** a real TV; the other game keys' cards (only these two games appear on idle); `lite` tier look;
long real-time run (Phase 6). One earlier run showed 4/144 slots below threshold with the noisy pixel metric; the
draw-call metric showed 0/144.

### 7. Open questions
None. Commit Phase 4 when ready (say when; not committed yet).

### 8. First steps for Phase 5
Read plan §4 Phase 5 and §8; use `useFx().burst/shockwave/shower` with the keys in the table; fire from effects,
never render; keep the answer-reveal gate in `lib/venueScreen.ts` untouched; re-run the Phase 0 harness for frame times.
