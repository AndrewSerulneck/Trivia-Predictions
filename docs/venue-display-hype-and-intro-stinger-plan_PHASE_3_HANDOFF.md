# Venue Display Hype — Phase 3 Handoff (brand chrome, redone on the Phase 0 engine)

Redone 2026-11-12 by Claude Sonnet 5.5 (the plan's named model for Phase 3, medium effort). This replaces the first
attempt's note (that attempt was built without the engine; its pieces were kept where they held up).

## For Andrew (plain English)

- **What changed:** every venue screen now has the Hightop look: the logo in the header with a shine every 45 s, a
  gradient "Hightop Challenge" label, a game chip with a gradient border and slow glow, a light running along the
  line under the header, a background whose colours drift, and a few faint twinkling stars. Squares rows slide in
  and scores count up when they change. Bracket top 3 get gold/silver/bronze edges with a slow shine, scores count
  up, and a **new upset** gets a coin-and-ring burst (once, never on a refresh or reload). The `/tv` pairing screen
  gets the drifting background, a shining logo and springy code digits.
- **Is it live?** No. Not committed, pushed or deployed. No database, settings or cost changes.
- **I checked it in a browser** (a throwaway copy, fake data): every mode at 1080p, plus 4K and reduced motion.
  Nothing re-draws on refreshes, no errors, and on a simulated slow device every screen stays at 48 fps or better.
  Pictures are in `docs/venue-display-hype_PHASE_3_after/`.
- **Two things to know:** (1) at 4K on the *simulated* slow device the app turned the stars off by itself, which is
  the safety net working; a real TV may differ. (2) The intro stinger is still the heaviest thing (about 7 fps
  simulated); the real-TV check in Phase 6 decides if it needs trimming.
- **Needs you:** a look at `/venue/<id>/screen` (and `?mode=` debug modes) on a real screen when convenient.

## For the next agent

### 1. Next phase and scope

**Next: Phase 4, idle screen: calm + periodic bursts** (plan §4 Phase 4; **Sonnet 5.5, medium**). Twinkle field and
`BrandStage` already run on idle (Phase 3), so Phase 4 is: the 75 s wall-clock "moment" (logo shine + coin/spark
burst, key `Math.floor(nowMs / 75_000)`), game-coloured next-game cards from `GAME_TILE_THEMES` (read
`docs/game-themes-plan.md` Standing rules first), countdown flip/heartbeat. **Out of scope:** game moments
(Phase 5), stinger changes, perf release work (Phase 6).

### 2. Starting state

- Branch `feature/venue-display-intro-stinger`, last commit `4b4cc05f`. **Nothing from Phases 0 and 3 is committed**
  (Phase 0's handoff §2 lists its files and suggests committing it alone; Andrew hasn't said yes). Not pushed or
  deployed. No DB / env / migration / cron changes; no backups needed.
- Untracked, not ours, leave alone: `docs/cancelled-prizes-pick-windows-away-mode-plan_C1_BACKFILL_LOG_2026-11-09.json`.
- Don't `git checkout` whole files to undo anything: it wipes all uncommitted work in them (see memory note).

### 3. Decisions made (don't re-ask)

- **One `FxProvider`**, mounted in `VenueScreenClient` around the whole return, `armed={!introPlaying}`. `/tv` has no
  provider (no canvas effects there; its stage/logo/digits are CSS-only), so `BrandStage` works with or without one.
- **Twinkles** (`fx/StageTwinkles.tsx`, 14 stars, viewport-wide) mount only after the stinger ends, so they never
  compete with it for CPU. The engine halves them in `lite` and drops them in `off` / reduced motion.
- **`BrandStage` washes shrunk 1500 → 1100 px** (`BLOB_PX`). Measured at ×6 CPU throttle: 1500 px cost ~10 ms per
  frame, 1100 px ~6 ms, 800 px ~2 ms. 1100 keeps the look and p95 under 26 ms.
- **Reduced motion renders the same markup, just doesn't animate** (`ShineSweep` no longer returns `null`; the
  header's light rule is always rendered, parked off its left edge). Returning `null` only on the client caused React
  hydration error #418 in every mode that has a header. Don't reintroduce `if (reduceMotion) return null` in SSR'd
  components.
- **Bracket rows are keyed by `row.username`** (was `rank-username`), so a rank change on a poll doesn't remount the
  row and replay its entrance; verified the same DOM nodes survive a poll.
- **Upset burst key** = `upset:${bracket.key}:${round}:${winner.name}>${loser.name}` (the payload has no upset id).
- **Skipped on purpose:** sponsor-rail shine (`SponsorRail` is unused and has no rotation); Squares has no ranking, so
  no gold/silver/bronze there; the eyebrow's gradient is static (animating `background-position` isn't
  transform-only). The venue-name glow sits in padding (`-mx-12 -my-6 px-12 py-6`) because `truncate` clips shadows
  into a visible box.
- Entrances (Squares rows, Bracket rows, upset card, `/tv` digits) run on mount, so a reload plays them once; polls
  don't (identities stable). These are entrances, not "moments", so plan §3's no-replay rule doesn't apply.

### 4. Files

- New: `components/venue-screen/fx/StageTwinkles.tsx`; `docs/venue-display-hype_PHASE_3_after/` (8 screenshots,
  `frame-times.json`, `verify.mjs.txt`).
- Changed: `VenueScreenClient.tsx` (`FxProvider` wrap, `StageTwinkles`, `VenueTitle` takes `theme`: logo + `ShineSweep`,
  gradient eyebrow, gradient chip + breathing glow, light rule), `BracketTvScreen.tsx` (`useFx`, `upsetRef` burst,
  username keys, podium edge + shine, `CountUp`), `SquaresTvScreen.tsx` (`CountUp`, staggered rows),
  `TvPairingDisplay.tsx` (`BrandStage`, logo shine, spring digits), `fx/BrandStage.tsx` (`BLOB_PX`),
  `fx/ShineSweep.tsx` (hydration-safe), `fx/CountUp.tsx` (unchanged from attempt 1).
- Tests: `tests/venue-screen-brand-chrome-contract.test.ts` (9): stage on every mode and `/tv`, transform/opacity-only
  fx files, reduced-motion paths, header chrome, count-ups, podium edge, one `FxProvider` armed after the intro,
  upset burst keyed + username row keys, logo file exists.
- Plan status line updated.

### 5. Facts and traps

- Headless Chromium paints canvas and big gradients on the CPU, so ×6 throttling overstates cost on a real TV GPU.
  Compare like with like: numbers below use the same script and machine as the baseline.
- At 4K (2880 px backing) the watchdog turned the canvas `off` within ~1 s in headless; at 1080p it stayed `full`.
  So 4K twinkles/bursts on weak hardware are best-effort by design.
- Scratchpad clone recipe that worked this time: `rsync -a --exclude node_modules --exclude .next --exclude '.env*'
  --exclude .git --exclude docs --exclude data ./ <clone>/`, then `rsync` `data/` back and `docs/phase0-artifacts`
  (a stray `tests/*` file imports it during `next build`'s typecheck; or `rm -rf <clone>/tests`), `cp -Rc node_modules`,
  then the baseline README's harness steps. `pkill -f "next start -p 3157"` is safe (own port); never `pkill next`.
- Burst check method: sample the fx canvas alpha: ~80 px of twinkles at rest vs ~1000+ during a burst
  (`verify.mjs.txt`). Needs a route override that changes the upset on the 2nd poll (Bracket polls every 30 s).

### 6. Build, run, test, verification

- `npx tsc --noEmit` ✔ · `npx eslint components/venue-screen tests/venue-screen-brand-chrome-contract.test.ts` ✔ ·
  `npm run test` ✔ (525 files, 6975 tests). `npm run build` not run in the repo (it ran in the clone, ✔).
- Browser (production build, clone, port 3157, Chromium 149, ×6 CPU throttle; after vs Phase 0 baseline, mean ms /
  fps): idle 17.5–19.6 / 51–57 (was 11–13.5); Live Trivia 10.5–14.6 / 68–95; Category Blitz 10.5–12 / 83–95; Squares
  13.3 / 75; Bracket 11.6 / 86; `/tv` 8.3 / 120 (unchanged); go-live takeover 20.8 / 48 (was 12.7 / 79); stinger
  137 / 7.3 (unchanged). 0 elements added over 5 s of polls in LT/CB; Bracket rows kept the same DOM nodes across a
  poll; no console errors at 1080p, 4K or reduced motion; hydration error #418 found and fixed (see §3).
- Burst: none at load; none on an unchanged poll; fires once on a changed upset, then settles.
- **Not verified:** a real TV; the watchdog stepping down *during* a long run; long-run heap (Phase 6); `/tv` on a
  real paired flow; Squares count-up on an actual score change (code path shared with Bracket's, which is covered).

### 7. Open questions for Andrew

None blocking. Commit Phase 0 + 3 together or separately? (Say when.)

### 8. Recommended first steps (Phase 4)

1. Read plan §3, §4 Phase 4, §8; `TvIdleAttract.tsx` (keep its wall-clock drift/rotation) and `docs/game-themes-plan.md`
   Standing rules.
2. Fire the 75 s moment with `fx.burst({ key: \`idle:${Math.floor(nowMs / 75_000)}\`, at: nextUpCardRef.current })`;
   remember the arming gate swallows keys fired in the first ~1 s after the stinger.
3. Reuse `ShineSweep` (wall-clock `delayMs`) for the logo; `lite` tier: shine + sparks only; reduced: shine fade only.
4. Verify with the accelerated-clock run from the plan, and re-run the Phase 0 baseline harness for frame times.
