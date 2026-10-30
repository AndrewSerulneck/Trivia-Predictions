# Category Blitz Letter Die — Phase 10 handoff (die component cleanup)

**Date:** 2026-10-30 · **Branch:** `after-app-review` · **Plan:** `docs/category-blitz-letter-die-plan.md` §5 Phase 10

## For Andrew (plain English)
- **What changed:** tidy-up inside the letter die only. Nothing should look or behave differently. The six faces' fixed
  placement is now ordinary styling classes instead of code; an unused "Round N" label (never shown) is gone; the die does
  less math per frame. I added one line to CLAUDE.md allowing per-frame animation values written directly to the page for
  this one file (the plan's default; tell me if you object).
- **Live?** No. Nothing committed, pushed or deployed (main is frozen for App Store review). No DB, server, env or cost change.
- **Needs from you:** nothing now. Phase 11 is a re-review, then your phone pass.

## For the next agent (Phase 11, re-review + phone pass)
1. **Goal / scope:** plan §5 Phase 11: fresh-eyes `/code-review` of the Phase 7–10 diff only; any finding becomes a new sub-phase,
   not an in-place patch. Then Andrew's phone pass (list in the plan). Out of scope: merging `main`, deploying.
2. **Starting state:** branch `after-app-review`, last commit `c3ecdb8a`. **Nothing from Phases 1–10 is committed.** No data/migration/env/cron touched.
   Never push `main`, deploy, `supabase db push`, or change Production env.
3. **Decisions:** plan §2. 10.1 CLAUDE.md exception added per the plan's default wording. `roundNumber` removed (no label, per "minimal and simple").
4. **Files changed (Phase 10):**
   - `components/category-blitz/LetterDieRoll.tsx`: exported `FACE_PLACEMENT_CLASSES` / `CORE_PLACEMENT_CLASSES` (literal Tailwind
     `[transform:rotateX/Y(θdeg)_translateZ(84px | 78.5px)]`, FACE_ORIENTATIONS order); ref callbacks no longer write transforms;
     `roundNumber` prop, label and tint branch deleted; in `drawFrame` the tumble swap now does `faceViews` once, one
     `pickFillerLetters(free, hiddenCount, …, avoid)` batch (in-use letters excluded, never the round's letter) and the shading reuses that
     array (`views ?? faceViews(m.q)`); `freshFiller` remains for `beginLanding` only. `[transform-style:preserve-3d]` kept.
   - `lib/categoryBlitzDieMotion.ts`: deleted the now-unused `faceTransform` (no other caller or test).
   - `components/category-blitz/DevAnimationPanel.tsx`: removed `roundNumber={…}`.
   - `CLAUDE.md`: Styling exception line for `LetterDieRoll.tsx`.
   - `tests/components.letter-die-roll.test.ts`: new `10.1` (each class's rotation equals `cssRotation(FACE_ORIENTATIONS[i])` as a matrix, translateZ = 84 / 78.5; mutation-checked by flipping a rotateX sign → fails) and `10.3` (12 checkpoints during a tumble: 6 faces, 6 distinct letters; then with a letter set, at most one face shows it).
5. **Traps:** the faces' letters are blank until the first frame after mount (advance ~100 ms in tests before reading). `faceViews` is computed on
   a frame only when needed: on non-swap tumble frames and other stages the shading call computes it (still one per frame).
6. **Gates run:** `npx tsc --noEmit` clean; eslint clean on touched files; `npm run test` 5,660 pass / 13 skipped / 4 fail (the known Bingo star-index freshness tripwires); `npm run build` exit 0.
   Unverified: real phone / visual identity of the faces (the matrix test proves the transforms equal the old ones, not a screenshot).
7. **Open questions:** none new (still open: the intermission's "Next round in" copy on a final round — ask Andrew first).
8. **First steps for Phase 11:** run `/code-review` on the Phase 7–10 changes; then hand Andrew the phone checklist from plan §5 Phase 11.
