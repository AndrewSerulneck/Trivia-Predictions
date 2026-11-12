# Phase 5 — game moments: browser check (2026-11-12)

Throwaway copy of the working tree (no `.env.local`, mocked `/api/venue-screen/state`), production build, Chromium 149
headless at 1920×1080 (one run at 4K, one with reduced motion). Scripts: `verify5.mjs.txt` (everything),
`verify5-glow-pop-winner.mjs.txt` (re-run after the edge-glow/anchor tweaks). The copy had a clone-only
`window.__fx = engine` line in `FxCanvas.tsx` so the script could count effects (`engine.liveCount()` rising edges);
that line is **not** in the repo.

## Fires once, on the page that is open (counts of canvas effects; ambient twinkles excluded)

| Step | Expected | Got |
|---|---|---|
| Load on a round break | 0 | 0 |
| Question appears (r4) | streak ×1, 0 canvas | streak ×1, 0 |
| 5 s of polls on it | no repeat | streak still ×1 |
| Answer reveal (r4) | 1 burst+ring, shine ×1 | 1, shine ×1 |
| 6 s of polls on it | 0 | 0 |
| Round break, new leader | 1 coin pop | 1 |
| Same break held 5 s | 0 | 0 |
| Next break, same leader | 0 | 0 |
| Next break, another new leader | 1 | 1 |
| Final standings | 2 (shower + burst) | 2 |
| Final held 6 s | 0 | 0 |
| Blitz round (letter slam) | 1 + rings | 1 |
| Blitz results | 1 burst + winner shine ×1 | 1, shine ×1 |
| Held 5 s each | 0 | 0 |
| Go-live (idle → live) | 1 | 1 (one run showed 2: the Phase 4 idle burst crossed its 75 s boundary in the same window) |

## Reload at each step: nothing plays

`lt-question`, `lt-reveal`, `lt-intermission`, `lt-final`, `cb-round`, `cb-intermission`, `cb-results`: 0 canvas
effects, no streak/shine overlays, over 5 s after load.

## Other

- Last 5 s: edge glow absent at 40 s, present at 4 s; ring beats (screenshot). Reduced motion: 0 effects, no overlays.
- ×6 CPU throttle through each moment (mean ms / p95 / fps): answer reveal 14.6–16.4 / 25–26 / 61–68; final standings
  18.8–21.4 / 26–34 / 49–53; round break with a pop 13.0–14.7 / 25 / 68–77. Baseline static panels were 8.3 ms.
  In one final-standings run the watchdog dropped the canvas to `off`, as designed.
- 4K screenshot: the watchdog had already turned canvas effects `off` in headless (same as Phase 3), so it shows the
  settled podium, not the burst.
- Console: no errors in any moment. One React #418 hydration warning appeared in 2 of 3 full runs on a
  `/tv/fx-baseline/lt-intermission` load; it did not reproduce in ~100 other loads (plain, reduced motion, 4K, with and
  without the mocked route). Likely the long-standing server/client `Date.now()` second-boundary mismatch on the
  countdown digit; nothing Phase 5 changed affects the round break's server markup.
