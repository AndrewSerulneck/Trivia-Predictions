# Category Blitz Letter Die — Phase 9 handoff (Back stays reachable + dev panel fixes)

**Date:** 2026-10-30 · **Branch:** `after-app-review` · **Plan:** `docs/category-blitz-letter-die-plan.md`

## For Andrew (plain English)
- **What changed:** while the letter die is tumbling (5–14 s), the top bar with the Back button now sits *above*
  the die, so you can leave the game any time. Before, the die covered it. The die still covers everything below the bar.
  Also, in the developer-only animation panel, Replay/Close no longer hide behind the die, and the die demos are one list.
- **Live?** No. Nothing committed, pushed or deployed (main is frozen for App Store review). No cost, DB or server change.
- **Needs from you (Phase 11, phone):** tap Back during the tumble — it must leave. Judge the look: the bar over the die,
  die below it. If you want the die truly full-screen, the alternative is a transparent bar showing only the Back button.

## For the next agent (Phase 10, Sonnet 5.5, medium — die component cleanup)
1. **Goal / scope:** plan §5 Phase 10 (10.1 static transforms → Tailwind classes + CLAUDE.md styling exception line,
   10.2 delete unused `roundNumber`, 10.3 compute `faceViews` once per frame). Out of scope: Phase 11, engine, TV, merging `main`.
2. **Starting state:** branch `after-app-review`, last commit `c3ecdb8a`. **Nothing from Phases 1–9 is committed.** No data,
   migration, env or cron touched. Never push `main`, deploy, `supabase db push`, or change Production env.
3. **Decisions:** plan §2. Phase 9 followed the plan's recommended fix (raised header), not the transparent-header alternative.
4. **Files changed (Phase 9):**
   - `components/category-blitz/CategoryBlitzGame.tsx`: `Header` got a `raised` prop → `relative z-[1110]`; the main return
     passes `raised={dieKey !== null && !dieSkipped}` (same condition that mounts `<LetterDieRoll`). Early-return Headers
     (loading/no venue/error) don't pass it: no die there.
   - `components/category-blitz/DevAnimationPanel.tsx`: `LETTER_DIE_DEMOS` record + `isLetterDieDemo()`; `DEMO_CONTROL_Z = "z-[1110]"`
     used by Close and Replay; both hand-written three-key lists removed. A fourth demo = one record entry + `DemoKey` + `DEMO_LABELS`.
   - `tests/components.category-blitz-letter-die-wiring.test.ts`: `mount(initial, onBack?)`; `next/navigation` mock (ExitBackButton needs a
     router); new `describe("9 …")` — Back is outside the die, inside a `.z-[1110]` bar, calls `onBack`; not raised with no die.
   - `tests/category-blitz-letter-die-contract.test.ts`: two assertions (header raised exactly when the die mounts, one `ExitBackButton`,
     none in `LetterDieRoll`; dev panel uses the shared z constant and the record).
5. **Traps:** `CategoryBlitzGame`'s `({onBack} = {})` signature makes `createElement(CategoryBlitzGame, {onBack})` fail typecheck — cast
   to `FunctionComponent<{ onBack?: () => void }>` (done in `mount`). macOS `sed -i` needs `''`.
6. **Gates run:** `npx tsc --noEmit` clean; eslint clean on the 4 touched files; `npm run test` 5,658 pass / 13 skipped / 4 fail (the known
   Bingo star-index freshness tripwires); `npm run build` exit 0. **Mutation-checked:** `raised={false}` fails 2 tests.
   Unverified: real phone; the dev panel in a browser (z-order is by inspection only — check from a scratchpad clone, never `pkill next-server`).
7. **Open questions:** none new (still open: the intermission's "Next round in" copy on a final round — ask Andrew first).
8. **First steps for Phase 10:** read plan §5 Phase 10; `LetterDieRoll.tsx` `drawFrame`, `FACE_ORIENTATIONS`, `roundNumber` prop.
