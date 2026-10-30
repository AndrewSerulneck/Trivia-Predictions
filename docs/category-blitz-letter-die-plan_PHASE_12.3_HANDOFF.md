# Category Blitz letter die — Phase 12.3 handoff (2026-10-30)

## For Andrew (plain English)
**What changed:** when the categories slide in after the letter die lands, each row used to tell the whole answer board
"I'm ready" as it finished, so the board redrew about a dozen times in under a second, right while the letter badge
was gliding into place. Now each row keeps that to itself, so the board doesn't redraw. A phone that is slow to draw
should see a smoother landing. Rows still can't be tapped until they have faded in (same as Phase 11.4). Also, the
"quick fade" used by Reduce Motion is now one named setting instead of the number 0.2 typed in three places.

**Is it live?** No. All letter-die work (Phases 1–12.3) is uncommitted on `after-app-review`. No database change, no
new requests, no cost change.

**What's left:** Phase 13 — one more code review, then your phone pass (list is in the plan, Phase 13). New item for
the pass: tap a row while the categories slide in (rows already shown work, empty space below doesn't).
**Needs you:** nothing blocking. Optional: may the letter-die work be committed locally on `after-app-review` so
Phase 13 reviews an exact diff?

---

## For the next agent (Phase 13)

### 1. Next phase
Phase 13 in `docs/category-blitz-letter-die-plan.md`: fresh-eyes `/code-review` (Opus 5.5, high) of the 12.1–12.3 changes
only; any finding becomes a new sub-phase; then Andrew's phone pass. **Out of scope:** moving the round timer,
`showReveal`, the elapsed-time fallback or die watchdog onto the server clock; engine close timing; cron test-mode
cadence; merging (`main` frozen until Apple approval).

### 2. Starting state
Branch `after-app-review`, last commit `c3ecdb8a`. Phases 1–12.3 uncommitted; nothing pushed/deployed; no data or
production access used.

### 3. Decisions in 12.3 (and why)
- **12.3a: per-row wrapper, per-row fallback timer** (the plan's preferred option). `CascadeRow` (in
  `components/category-blitz/CategoryBlitzGame.tsx`, just above `AnswerRow`) owns `ready`; `inert={!ready}`,
  `onAnimationComplete → setReady(true)`, and ONE fallback: a timer at `(delay + duration) * 1000 + 500` for that row.
  The old screen-wide Set, `markRowReady` and the single end-of-cascade timer are deleted from `AnsweringScreen`.
  `children` is the board's existing memoized `<AnswerRow>` element, so a ready flip doesn't re-render it.
- **12.3b:** `CB_ROW_CASCADE_REDUCED_DURATION_S = 0.2` in `lib/categoryBlitzMotion.ts`. Used by `CascadeRow` and by
  `RoundStartReveal`'s `rowReduced` variant (checked: same opacity-only 0.2 s fade). RoundStartReveal's other
  `duration: 0.25` is the layout morph, a different thing, untouched.

### 4. Files changed
`components/category-blitz/CategoryBlitzGame.tsx` (CascadeRow; AnsweringScreen simplified), `lib/categoryBlitzMotion.ts`,
`components/category-blitz/RoundStartReveal.tsx` (one constant), `tests/components.category-blitz-letter-die-wiring.test.ts`
(render counter in the framer mock; new "12.3a" test), `tests/category-blitz-letter-die-contract.test.ts` (11.4 pins
updated; new 12.3 pin).

### 5. Facts and traps
- The 12.3a test counts `AnsweringScreen` renders via the mocked `useReducedMotion` (only AnsweringScreen calls it in
  that tree). It asserts the die-path board renders no more than a plain board over the same window — the plain board
  re-renders once when its morph settles, so the counts differ by a constant; absolute counts are not stable.
- As in 11.4, framer's real completion callbacks don't run under fake timers; the per-row early release is pinned
  statically and needs the phone pass. Fallback timing is tested.
- `lib/categoryBlitz.ts` still has a non-text byte (use `grep -a`).
- No mutation check was run for 12.3a (the render-count test was not proven to fail against the old code).

### 6. Build / test (2026-10-30, sequential)
`npx tsc --noEmit` clean; eslint clean on touched files; `npm run test` 5,712 pass / 13 skipped / 4 fail (only the 4 known
Bingo star-index freshness tripwires); `npm run build` exit 0. Not verified: real device.

### 7. Open questions
Carried over (information only): round timer/old letter drop/watchdog still on the phone clock; extending tonight's
window mid-game still ends the game at the old time. Optional: permission to commit locally.

### 8. First steps for Phase 13
1. Read plan §Phase 13 and the 12.1, 12.2, 12.3 handoffs. 2. Run `/code-review high` on the 12.1–12.3 changes (working
tree; use the handoffs' file lists). 3. Optionally mutation-check 12.3a (move `ready` state back to AnsweringScreen →
the render-count test should fail). 4. Give Andrew the Phase 13 phone checklist.
