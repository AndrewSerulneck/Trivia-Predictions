# Venue Display Hype — Phase 0 Handoff (baseline + effects engine)

Written 2026-11-12 by Claude Opus 5.5 (the plan's named model for Phase 0, high effort).

## For Andrew (plain English)

- **What changed:** I built the shared "effects engine" that the rest of the redesign uses: coin and spark bursts,
  confetti showers, twinkling stars and the shockwave ring from the ads. It's built to stay smooth on cheap TV
  sticks: it does nothing when no effect is playing, and it automatically switches to lighter effects if a TV
  struggles. Effects never repeat on the screen's regular refreshes or when the page reloads.
- **Nothing looks different yet.** No screen uses the engine yet; that happens when Phase 3 is redone (your call,
  2026-11-12) and in Phases 4–5.
- **I also recorded a "before" picture** of every screen and how fast each one draws:
  `docs/venue-display-hype_PHASE_0_baseline/`. Later phases compare against it.
- **One thing to know:** the intro stinger (already built) is by far the heaviest thing on the display. On a
  simulated slow device it drew about 6 frames a second, compared with about 58 for the new effects. The test
  setup exaggerates this (it has no graphics chip), so it may be fine on a real Fire TV Stick. That's what the
  Phase 6 real-TV check will show. If it stutters, there are cheap fixes (below).
- **Is it live?** No. Nothing is committed or deployed. No database, settings or cost changes.
- **Needs you:** nothing for this phase. Phase 3 redo is next when you're ready.

## For the next agent

### 1. Next phase and scope

**Next: redo Phase 3 (brand chrome) properly, on top of this engine.** Andrew said (2026-11-12): "Once this is done, we will revisit Phase 3 and do it properly." Plan §4 Phase 3 has the spec; the first attempt's notes are in
`venue-display-hype-and-intro-stinger-plan_PHASE_3_HANDOFF.md`. Phase 3 now owns:
- **Mounting `<FxProvider armed={!introPlaying}>` once in `VenueScreenClient`** around the whole return (stage +
  stinger), so the canvas sits outside `ViewportFitCanvas`. Phase 0 deliberately did **not** mount it (see §3).
- The twinkle field the first attempt skipped (`fx.twinkles({ area })` in `lite`+ tiers), and the Bracket upset
  spark burst (`fx.burst({ key: \`upset:${upsetId}\`, at: cardRef.current })`).
- Browser verification the first attempt never did: look in every mode, 0 remounts across 10 polls, throttled frame
  times vs this baseline, 4K, reduced motion.

Out of scope for Phase 3: the idle-screen periodic bursts (Phase 4), game moments (Phase 5), stinger changes.

### 2. Starting state

- Branch `feature/venue-display-intro-stinger`, last commit `4b4cc05f` (phases 1–2: stinger, sound, keep-awake).
  **Nothing from Phase 0 or Phase 3 is committed.** Not pushed or deployed. No DB, env, migration or cron changes.
- Working tree mixes two uncommitted sets:
  - **Phase 3 (first attempt, to be redone):** `components/venue-screen/{BracketTvScreen,SquaresTvScreen,TvPairingDisplay,VenueScreenClient}.tsx`,
    `components/venue-screen/fx/CountUp.tsx`, `tests/venue-screen-brand-chrome-contract.test.ts`.
  - **Phase 0 (this phase):** `components/venue-screen/fx/{fxEmitters,fxSprites,fxQuality,fxGate,fxClock,fxEngine}.ts`,
    `fx/FxCanvas.tsx`, `fx/useFx.ts`, rewritten `fx/BrandStage.tsx` and `fx/ShineSweep.tsx` (both were created by
    Phase 3; Phase 0 owns them now, same props), `components/venue-screen/TvIntroStinger.tsx` (sprite helpers moved
    out), `tests/venue-screen-fx.test.ts`, `docs/venue-display-hype_PHASE_0_baseline/`, this note, the plan status line.
- **Undoing Phase 3: don't `git checkout` whole files.** That wipes every uncommitted change in them, and
  `fx/BrandStage.tsx` / `fx/ShineSweep.tsx` are now Phase 0 files. Edit the Phase 3 bits out, or commit Phase 0 first:
  `git add components/venue-screen/fx/{fx*.ts,FxCanvas.tsx,useFx.ts,BrandStage.tsx,ShineSweep.tsx} components/venue-screen/TvIntroStinger.tsx tests/venue-screen-fx.test.ts docs/venue-display-hype_PHASE_0_baseline docs/venue-display-hype-and-intro-stinger-plan_PHASE_0_HANDOFF.md`
  (the plan doc has Phase 3 status edits too). Ask Andrew before committing.
- Pre-existing untracked file, not ours, leave alone: `docs/cancelled-prizes-pick-windows-away-mode-plan_C1_BACKFILL_LOG_2026-11-09.json`.

### 3. Decisions made (don't re-ask)

- **Provider not mounted in Phase 0.** Plan says "mounted once in VenueScreenClient", and "Done when: not yet
  visible". That file is full of uncommitted Phase 3 edits that are being redone, so the mount moves to Phase 3.
  An empty mounted provider draws nothing, so the plan's "not visible" still holds.
- **Reload never replays a moment: the engine has an arming gate** (`fxGate.ts`). The plan only said "same key never
  fires twice in a session". A plain in-memory set would replay the on-screen moment after every reload, breaking
  plan §3. Keys fired before the gate arms are claimed silently; `FxProvider` arms it `FX_ARM_SETTLE_MS` (1 s) after
  `armed` turns true. Pass `armed={!introPlaying}`. Cost: a genuine moment in the first ~5 s after a TV opens
  doesn't play (it's under the stinger anyway).
- **Ambient vs moments:** one-off effects (`burst`, `shower`, `shockwave`) need a `key`. Ambient (`twinkles`) has
  no key; it stops when the calling component unmounts or its `stop()` is called. Ambient-only frames draw at
  ~30 fps (`FX_AMBIENT_FRAME_MS`).
- **Canvas is 1×1 and `visibility:hidden` when idle**, so there's no full-screen layer to composite and no backing
  memory held between effects.
- **Tiers:** `full` = all particles, backing ≤ 2× DPR; `lite` = half particles, 1× backing; `off` = no canvas
  effects. Start `lite` on ≤ 2 cores, `off` with reduced motion. Watchdog drops one tier per second averaging over
  28 ms and never goes back up (no oscillation). Backing long side capped at 2880 px (same as the stinger).
- **Wall-clock loops:** `BrandStage` uses a negative framer-motion delay so the drift is phased from the wall clock
  (verified in the browser: transforms are mid-loop at load). `ShineSweep`'s `delayMs` now means "offset within each
  wall-clock period", not "after mount". Sweeps on different TVs land together, and a reload doesn't add one. Existing
  callers needed no change.
- **One canvas layer, z-index 60**: above the stage and go-live takeover, below the stinger (80). "Burst *behind*
  the answer" (Phase 5) has to be faked with placement/alpha, or Phase 5 adds a second, back layer to the engine.
- Baseline captured on commit `4b4cc05f` (no Phase 3), as JPEG q82 to keep the folder small (1.7 MB).

### 4. Files

- `fx/fxEmitters.ts` (pure): `createBurst`, `createShower`, `createTwinkleField`, `createShockwave`,
  `combineEmitters`, `seedFromKey` (FNV-1a), `scaleCount`, `isEmitterAlive`, `FX_COLORS`. Emitter =
  `{ duration, frame(t) → FxDrawOp[] }`; ops are sprite ops (`coin`, `spark:<css>`, `twinkle:<css>`,
  `confetti:<css>`) or ring ops. CSS px in viewport space. RNG/drag/gravity from `stingerTimeline.ts`.
- `fx/fxSprites.ts`: `makeCanvas`, `ctx2d`, `glowStarSprite`, `coinSprite`, `confettiSprite` (shared with the
  stinger), and `getFxSprite(id)`, a cached fixed-unit sprite (`FX_SPRITE_UNITS`).
- `fx/fxQuality.ts` (pure): tiers, `createFrameWatchdog`, `fxBackingScale`, `fxDensity`.
- `fx/fxGate.ts` (pure): `createFxGate` → `decide(key)` = `play | swallow | duplicate`; FIFO cap 8000 keys.
- `fx/fxClock.ts` (pure): `wallClockElapsedS`, `wallClockDelayS`.
- `fx/fxEngine.ts`: `createFxEngine()`: the single rAF loop, draw, show/hide, visibility pause, resize, reduced-
  motion listener, watchdog, fail-open per emitter. Creating it touches no browser API (`attach()` does).
- `fx/FxCanvas.tsx`: `FxProvider({ armed })`, `FxContext`, `FX_ARM_SETTLE_MS`, `FX_CANVAS_Z_INDEX`.
- `fx/useFx.ts`: `useFx()` → `{ burst, shower, shockwave, twinkles, tier }`; anchors are a point or an Element
  (centre; smaller side = size); areas are a rect or an Element (default the viewport). No-op outside a provider.
  Fire from effects, never during render.
- `TvIntroStinger.tsx`: imports its sprite helpers from `fxSprites.ts` (pure move, no behaviour change).
- `tests/venue-screen-fx.test.ts` (32 tests): determinism, no emitter alive past its life, density per tier, gate
  dedupe/swallow/cap, engine-through-gate, builder errors dropped, tier start/step-down, watchdog (60 fps holds, one
  drop per slow second, hidden-tab gaps ignored), backing scale, wall clock, source contracts (no `shadowBlur`
  outside sprites, only the engine requests frames, canvas `pointer-events-none` and z < 80, CSS effects
  transform/opacity only).

Usage for Phase 3/4/5:

```tsx
const fx = useFx();
useEffect(() => { if (upset) fx.burst({ key: `upset:${upset.id}`, at: cardRef.current, shockwave: true }); }, [fx, upset]);
useEffect(() => (stageRef.current ? fx.twinkles({ area: stageRef.current, count: 14 }) : undefined), [fx]);
```

### 5. Facts and traps

- **Element anchors are read once at fire time** (`getBoundingClientRect`), in viewport px, so they already
  include `ViewportFitCanvas`'s scale. An area resolved for an ambient field doesn't follow later layout or burn-in
  drift (small, fine).
- **Default burst sizing comes from the anchor's smaller side.** At a 500×300 card the coins are small; pass `size`
  (≈ the stinger's L) for a bigger moment. Counts default to 18 coins / 28 sparks, tuned per moment in Phases 4–5.
- **Headless Chromium rasterises canvas on the CPU**, so CPU throttling hits canvas far harder than on a real TV
  GPU. Treat throttled canvas numbers as worst case, and compare like with like (same script, same machine).
- **Stinger is heavy (5.7 fps at ×6, 32 fps unthrottled headless).** Cost is the per-frame full-screen
  `createRadialGradient` fills (bloom, rays, vignette, flash) at up to 2880 px. Options if the Phase 6 device run
  stutters: render bloom/vignette once to a sprite canvas and `drawImage` it with alpha; draw rays at half
  resolution; use `fxBackingScale(..., "lite")` (1× DPR) on low-core devices. Not done: out of scope, and it
  changes Phase 1's approved look.
- Building the scratchpad clone: `git archive HEAD | tar -x -C <dir>` avoids the `.env.local` hook issue the Phase 1
  agent hit with `cp -Rc` (the archive has no `.env.local`). `next build` passes with dummy
  `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` on the command line.
  Proxy lets `/tv/*` through without cookies, so harness pages live under `/tv/`.
- `npx tsc` narrows `let tier` after an early `=== "off"` return even across a call that changes it. Use the value
  you set (`const lower = …; setTier(lower); if (lower === "off")`).
- `eslint` flags reading `ref.current` during render (react-hooks v7). `useFx` holds its ambient-stop set in
  `useState`, not `useRef`.

### 6. Build, test, verification

- `npx tsc --noEmit` ✔ · `npx eslint components/venue-screen/fx components/venue-screen/TvIntroStinger.tsx tests/venue-screen-fx.test.ts` ✔
- `npx vitest run tests/venue-screen-fx.test.ts tests/venue-screen-intro-stinger-contract.test.ts tests/venue-screen-brand-chrome-contract.test.ts` ✔ (56)
- `npm run test` ✔ (525 files, 6973 tests).
- **Browser (production build of the clone, port 3157, harness `/tv/fx-harness` = `harness/fx-harness-page.tsx.txt`):**
  canvas hidden/1×1 at load; before arming → `swallow`; repeat → `duplicate`; new key → `play`, canvas 1920×1080
  visible; burst + ring and confetti render correctly; canvas back to hidden/1×1 after all effects end and after
  `twinkles` stop; DPR 2 → 2880×1620 backing; reduced motion → tier `off`, `burst` → `off`; BrandStage mid-loop at
  load; ×6 throttle during burst + shower: 57.8 fps, tier stayed `full`; no console errors. Results are in
  `docs/venue-display-hype_PHASE_0_baseline/README.md`.
- **Not verified:** that the watchdog actually steps down in a browser (unit-tested only; ×6 headless never got
  slow enough), a long ambient run (heap/canvas count flat, which is Phase 6), the engine mounted in the real
  `VenueScreenClient` (Phase 3), any real TV device.

### 7. Open questions for Andrew

None blocking. When to commit Phase 0 (it can be committed on its own, before the Phase 3 redo).

### 8. Recommended first steps (Phase 3 redo, **Sonnet 5.5, medium effort** per the plan table)

1. Read plan §3, §4 Phase 3, §8, the first attempt's handoff, and this note's §3–§5.
2. With Andrew's OK, commit Phase 0 alone (list in §2) so the Phase 3 redo has a clean diff.
3. Mount `FxProvider armed={!introPlaying}` in `VenueScreenClient`, then redo the Phase 3 items using `BrandStage`,
   `ShineSweep`, `useFx().twinkles` / `burst`. Keep `CountUp` if it holds up.
4. Verify in a browser with the baseline harness (`docs/venue-display-hype_PHASE_0_baseline/README.md` → Re-running),
   comparing screenshots and frame times with the baseline.

**Full test suite (`npm run test`, 2026-11-12):** ✔ 525 files passed, 1 skipped; 6973 tests passed, 13 skipped.
