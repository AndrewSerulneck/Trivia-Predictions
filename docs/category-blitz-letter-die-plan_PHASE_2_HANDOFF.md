# Category Blitz Letter Die — Phase 2 handoff (timing logic)

**Date:** 2026-10-30 · **Branch:** `after-app-review` · **Plan:** `docs/category-blitz-letter-die-plan.md`

## For Andrew (plain English)

- **What changed:** the "brain" of the die is written and tested: a small file that, given the countdown and
  whether the round's letter has arrived, says what the die should be doing (waiting, tumbling, landing,
  holding, flying, done). Nothing you can see in the game changed yet.
- **Live?** No. Not wired into the game, not committed, not deployed. Zero cost (no requests, no database).
- **Checked:** 17 new tests pass; typecheck and lint are clean.
- **Left:** Phase 3 (the 3D die you see), Phase 4 (hook it into the game + Majority Rules), 5, 6.
- **Needs from you:** nothing. One judgment call to be aware of (below, "late letter").

## For the next agent (Phase 3, Opus 5.5, high)

### 1. Goal / scope
Build `components/category-blitz/LetterDieRoll.tsx` (plan §5 Phase 3): full-screen fixed overlay, CSS 3D cube via
framer-motion, haptics through `triggerAnimation`, `layoutId={CB_LETTER_BADGE_LAYOUT_ID}` on the held letter,
add to `DevAnimationPanel`. Port helpers from `docs/prototypes/category-blitz-letter-die.html` (see Phase 1 handoff §4).
Out of scope: wiring into `CategoryBlitzGame.tsx` / Majority Rules (Phase 4), venue TV, feature flag, sound.

### 2. Starting state
Branch `after-app-review`, last commit `c3ecdb8a`. **Nothing committed** by Phases 1–2. Untracked: the plan,
Phase 1 + 2 handoffs, `docs/prototypes/`, and the two new files below. `main` frozen (App Store review): never push
`main`, deploy, or touch Production env. No data/migration/env touched.

### 3. Decisions (don't re-ask)
Plan §2 items 1–9. Timings are the prototype defaults, now constants in the lib file.

### 4. Files
- `lib/categoryBlitzLetterDie.ts` (pure, no React):
  - `dieStage(input: DieTimingInput): DieTiming` → `{ stage, stageElapsedMs, nextStageInMs, reduced }`;
    stages `idle | tumbling | landing | holding | flying | done`.
  - **The caller owns three latched timestamps** (the function holds no state): `tumbleStartedAtMs` (set the first
    time the stage is `tumbling`), `letterArrivedAtMs` (when the round/letter was first seen), `hiddenDuringRoll`
    (set if `document.visibilityState === "hidden"` at any point during the roll). Also pass `roundStartedAtMs`,
    `nextRoundStartsIn`, `nowMs`, `reducedMotion`. Reset all latches per round.
  - `landingStartMs()`: landing begins at the next bounce impact (`tumbleStart + k·DIE_HOP_MS`) at/after arrival;
    with no tumble it begins at arrival. Use it to schedule the light buzz on each impact and the strong buzz at landing start.
  - `pickFillerLetters(usableLetters, count, rng?, avoid?)`: shuffled-bag filler letters, usable letters only, never
    the same letter twice in a row, excludes `avoid` (pass the real letter once known; put the real letter on one hidden face only).
  - Constants: `DIE_TUMBLE_LEAD_S` 5, `DIE_HOP_MS` 520, `DIE_LAND_MS` 760, `DIE_SETTLE_MS` 340 (2 bounces),
    `DIE_LANDING_TOTAL_MS` 1100 (hop + settles; the `landing` stage covers both), `DIE_HOLD_MS` 700, `DIE_FLY_MS` 450,
    `DIE_MAX_TUMBLE_MS` 12 000, `DIE_MID_ROUND_CUTOFF_MS` 3000, `DIE_REDUCED_MIN_HOLD_MS` 250.
- `tests/lib.category-blitz-letter-die.test.ts` (17 tests; also pins the cutoff = `ROUND_START_REVEAL_MAX_MS`).

### 5. Facts and traps
- **Late-letter judgment call:** the plan said "cap, then land anyway when it shows". I implemented: tumble up to
  12 s; if the letter has not arrived by then, or arrives after it, the stage is `done` and the game's existing
  `RoundStartReveal` handles it (so the player is never stuck behind an overlay). Say so to Andrew if he wanted it
  to land after the cap; it is a one-line change in `dieStage`.
- Reduce Motion: stages are `tumbling` (static "?" tile) → `holding` (cross-fade to letter, ≥ max(250, hold)) →
  `flying` (fade into badge, no flight) → `done`; `landing` never occurs and `reduced: true` is returned.
- `idle` is returned when `nextRoundStartsIn` is null/>5, and also at exactly 0 with no latch (round about to
  arrive); the caller should latch `tumbleStartedAtMs` when it first sees `tumbling`.
- Mid-round-open rule applies only when the die never tumbled; a roll that tumbled is never cut off by round age.
- `showReveal` in `CategoryBlitzGame.tsx` (~line 2384) is keyed to `round.startedAt` + 3000 ms; Phase 4 must
  keep its `markRevealDone` fallback working when the die ends as `done` without a reveal.
- Text-size floor and `text-caption` rules apply to the countdown under the die.

### 6. Build / test
`npx vitest run tests/lib.category-blitz-letter-die.test.ts`, `npx tsc --noEmit`, `npx eslint <files>` — all pass.
Full `npm run test` and `npm run build` were NOT run (new files are isolated; run them in Phase 3, not typecheck + build at once).

### 7. Open questions
None blocking. Late-letter behaviour above is the only thing Andrew might want changed.

### 8. First steps for Phase 3
1. Read Phase 1 handoff §4–§5 and the prototype's quaternion/shading/squash code.
2. Build `LetterDieRoll.tsx` driven by `dieStage` from a `useAnimationFrame`/interval tick; haptics via `triggerAnimation`.
3. Add a `DevAnimationPanel` replay; check frame rate on a low-end device (Andrew).
