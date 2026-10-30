# Category Blitz letter die — Phase 11.3 handoff (2026-10-30)

## For Andrew (plain English)

**What changed:** four small clean-ups inside the rolling letter die, none of which changes how it looks except one
glitch fix. (1) When the die lands, the letter you see can no longer flicker or swap at the last moment: the die now
lands on the face that already shows the round's letter instead of rewriting a face. (2) Removed a buzz that never
actually fired for people with Reduce Motion on. (3) Merged two copies of the "pick new random letters" code into one.
(4) The die no longer redraws itself every time the game's clock ticks, which saves phone battery during the roll.

**Is it live?** No. Uncommitted on `after-app-review`, like Phases 2–11.2. Nothing deployed, no database change, no
new cost (it only reduces work on the phone).

**What's left:** Phase 11.4 (rows you can't see yet can't be tapped), then Phase 12 (review + your phone pass).

**Needs you:** nothing for this phase.

---

## For the next agent (Phase 11.4)

### 1. Next phase
Phase 11.4, `AnsweringScreen` hidden cascade rows are `inert` until their own fade-in completes (re-review finding 10).
Spec: `docs/category-blitz-letter-die-plan.md`, "Phase 11.4". Model: Sonnet 5.5, medium. Out of scope: Phase 12, a die
over the header, the engine, the venue TV.

### 2. Starting state
Branch `after-app-review`, last commit `c3ecdb8a`. All letter-die work (Phases 1–11.3) is **uncommitted**; nothing
pushed/deployed. `main` is frozen during App Store review. No data, migration or production access involved.

### 3. Decisions made in 11.3 (don't re-ask)
- **Landing target:** the face already showing the real letter (`m.letters.indexOf(real)`), else `mostHiddenFace`.
  The swap loop is gone; a face is only rewritten when the target is a hidden face receiving the letter.
- **Reduce Motion hold is exactly `DIE_HOLD_MS`.** `DIE_REDUCED_MIN_HOLD_MS` and the `Math.max` are deleted; the
  Reduce Motion `CATEGORY_BLITZ_DIE_LAND` trigger and `reducedLandRef` are deleted (`playHaptic` stands down under
  `prefers-reduced-motion` anyway).
- **`freshFillers(count, avoid)`** (inside `LetterDieRoll.tsx`) is the only filler picker; in-use set is upper-cased.
- **Memo:** `LetterDieRoll = memo(LetterDieRollInner)`; the 6 glyph + 6 shade ref callbacks are created once with
  `useState(() => …)`.
- **Parent callbacks:** `handleDieStage` / `handleDieDone` in `CategoryBlitzGame.tsx` are `useCallback`. They depend on
  `dieRoundId = round?.id ?? null` (a string) rather than the `round` object, so a poll that swaps the object does not
  change them. `markRevealDone` is already a `useCallback` in `lib/categoryBlitzRealtime.ts`.

### 4. Files changed
- `components/category-blitz/LetterDieRoll.tsx`: landing target, `freshFillers`, ref callbacks, memo, Reduce Motion buzz removed.
- `components/category-blitz/CategoryBlitzGame.tsx`: `dieRoundId`, `useCallback` handlers (around line 2535).
- `lib/categoryBlitzLetterDie.ts`: `DIE_REDUCED_MIN_HOLD_MS` deleted; reduced `hold = DIE_HOLD_MS`.
- `tests/lib.category-blitz-letter-die.test.ts`: dropped the constant import and the vacuous `Math.max` assertion.
- `tests/components.letter-die-roll.test.ts`: describe "Phase 11.3" (a: six usable letters so every face is already
  in play; letters never change through landing/hold and the real letter is on exactly one face; b: Reduce Motion no
  buzz; d: re-render count via a counting `useReducedMotion` mock, which the die calls once per render). The mock
  now counts reads in `reduceMotionFlag.reads`.
- `tests/category-blitz-letter-die-contract.test.ts`: static 11.3 assertions.

### 5. Facts and traps
- **Deviation from the plan:** the plan asked for a `React.Profiler` test around the game's die. A Profiler fires
  whenever its parent re-renders (the Profiler fiber itself updates), so it can't show a memo bail-out. The test
  instead counts the die's own renders through the `useReducedMotion` mock, on a small parent. The game's callbacks are
  pinned statically (contract test) rather than by rendering the whole game.
- **jsdom trap:** a state change made inside `advance()` renders only when that `act` ends, so the die's frame loop
  starts on the NEXT `advance`. After the first render of a rolling die do `advance(50)` then the rest, or no filler
  letters are ever written.
- Lint rule `react-hooks/globals` rejects assigning an outer variable during render in tests; assign in an effect.

### 6. Build / test / verification
2026-10-30: `npx tsc --noEmit` clean; eslint clean on the touched files; `npm run test` 5,677 pass / 13 skipped / 4 fail
(only the 4 known Bingo star-index freshness tripwires); `npm run build` exit 0 (after typecheck, not alongside).
Mutation checks (backup restored and `cmp`-verified): old `mostHiddenFace` landing made test a fail; removing `memo`
made test d fail. **Not verified:** a real device or browser run of the landing; the 11.3a fix is covered by jsdom only
(Phase 12 phone pass should watch that the letter never flickers as the die lands).

### 7. Open questions
None new. Still parked: the intermission's "Next round in" copy on a final round (Phase 7).

### 8. First steps for 11.4
Read plan "Phase 11.4", `AnsweringScreen` (cascade row `motion.div`, `CB_ROW_CASCADE_AFTER_DIE_DELAY_S`,
`CB_ROW_CASCADE_STAGGER_S`) and Phase 8's test 1. Same gates; write `…_PHASE_11.4_HANDOFF.md`, update the status line.
