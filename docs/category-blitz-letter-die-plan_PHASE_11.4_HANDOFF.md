# Category Blitz letter die — Phase 11.4 handoff (2026-10-30)

## For Andrew (plain English)

**What changed:** when the category list slides in after the die, a row you can't see yet can no longer be tapped. Before,
tapping the empty space below the visible rows could focus a hidden category and pop the keyboard. Each row now ignores
taps until its own fade-in finishes (a safety timer frees all rows about half a second after the last one should be done).

**Is it live?** No. Uncommitted on `after-app-review`, like Phases 2–11.3. No database change, no cost change.

**What's left:** Phase 12 (fresh review of 11.1–11.4, then your phone pass). **Needs you:** nothing for this phase.

---

## For the next agent (Phase 12)

### 1. Next phase
Phase 12 per `docs/category-blitz-letter-die-plan.md`: `/code-review` of the Phase 11.1–11.4 diff only (new findings become
new sub-phases, no in-place patches), then Andrew's phone pass (list in the plan). Opus 5.5, high. Out of scope: merging
(`main` is frozen until Apple approval), engine, venue TV.

### 2. Starting state
Branch `after-app-review`, last commit `c3ecdb8a`. All letter-die work (Phases 1–11.4) is **uncommitted**; nothing pushed
or deployed. No data/migration/production access.

### 3. Decisions
- Per-row `inert` (React 19 boolean prop) on the cascade `motion.div` until `onAnimationComplete` marks it ready; state is
  `readyRows` (a `Set<number>`) in `AnsweringScreen`.
- One fallback timer (cascade end = `CB_ROW_CASCADE_AFTER_DIE_DELAY_S + (rows−1) × STAGGER + row duration`, + 500 ms) marks
  every row ready. Row duration is 0.2 s under Reduce Motion, so the timer is recomputed with `reduceMotion`.
- RoundStartReveal path and plain rows untouched: no `inert` there.

### 4. Files changed
- `components/category-blitz/CategoryBlitzGame.tsx` (`AnsweringScreen`: `readyRows`, `markRowReady`, fallback effect, `inert` + `onAnimationComplete` on the cascade row).
- `tests/components.category-blitz-letter-die-wiring.test.ts`: Phase 8 test 1 now focuses row 1 after 600 ms (not 300); four new 11.4 tests (inert at 100 ms, fallback frees all, fallback with `requestAnimationFrame` stalled, Reduce Motion, non-die path).
- `tests/category-blitz-letter-die-contract.test.ts`: static 11.4 assertion.

### 5. Facts and traps
- **Deviation from the plan's test:** framer's real completion callbacks run on real-time frames that vitest fake timers
  don't drive, so the tests prove "inert at 100 ms, none after the fallback time"; the *per-row early release* (row 1 free
  while row 12 is still inert) is pinned only statically (contract test) and needs the phone pass to confirm
  (tap a visible row mid-cascade: works; empty space below: nothing).
- Phase 8's focus-mid-cascade test passes either way in jsdom (jsdom ignores `inert` on `.focus()`), so it isn't proof of the inert behaviour.

### 6. Build / test
2026-10-30: `npx tsc --noEmit` clean; eslint clean on touched files; `npm run test` 5,682 pass / 13 skipped / 4 fail (only
the 4 known Bingo star-index freshness tripwires); `npm run build` exit 0 (after typecheck). No mutation check done.

### 7. Open questions
None. Parked: intermission "Next round in" copy on a final round (Phase 7).

### 8. First steps
Run `/code-review` on the 11.1–11.4 diff, then hand Andrew the Phase 12 phone checklist from the plan; add "rows already
shown are tappable mid-cascade, the empty space isn't" and "the letter never flickers as the die lands" (11.3).
