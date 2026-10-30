# Category Blitz letter die — Phase 11.2 handoff (2026-10-30)

## For Andrew (plain English)

**What changed:** the rolling die now sits *under* the Category Blitz title bar, in the game area, instead of on top of
the whole screen with the title bar lifted over it. On a phone it looks the same as before (the bar with the Back
button stays visible and the die fills everything below it). The difference is behind the scenes: there are no
special "this goes above that" numbers left to keep in step. That also fixes a testing annoyance: the dev-only
"Test mode" and "Skip round" buttons used to be untappable while the die rolled. They work now.

**Is it live?** No. It's uncommitted on the `after-app-review` branch, like Phases 2–11.1. Nothing is deployed, there
is no database change and no new cost.

**What's left:** Phase 11.3 (die component fixes), Phase 11.4 (rows you can't see yet can't be tapped), then Phase 12
(review + your phone pass, which includes judging the die under the title bar).

**Needs you:** nothing for this phase.

---

## For the next agent (Phase 11.3)

### 1. Next phase: goal and scope
Phase 11.3 covers die component fixes in `LetterDieRoll.tsx` (re-review findings 4, 7, 8, 9: no visible letter
changes at landing, delete the dead Reduce Motion buzz, one filler-letter helper, fewer re-renders while rolling).
The full spec is in `docs/category-blitz-letter-die-plan.md` §5 "Phase 11.3". Model: Sonnet 5.5, medium. Out of
scope: 11.4, a die over the header (a new request if Andrew wants it in Phase 12), the engine and the venue TV.

### 2. Starting state
- Branch `after-app-review`; last commit `c3ecdb8a` (Add the live Google Play listing URL). All letter-die work
  (Phases 1–11.2) is **uncommitted** in the working tree; nothing is pushed or deployed. `main` is frozen during App
  Store review: never push `main`, deploy, or change Production env for this work.
- No data touched. No migration. Nothing was run against production. The browser checks used mocked routes only.

### 3. Decisions made in 11.2 (don't re-ask)
- **The stage.** In `CategoryBlitzGame`'s main render, everything after the dev-only controls sits in one
  `<div data-category-blitz-stage className="relative isolate flex min-h-0 flex-1 flex-col">`, with `<LetterDieRoll>`
  as its **last child**. `isolate` keeps the die's `z-10` local to the stage, so the header (a sibling above the
  stage) and the `fixed z-[999]` dev buttons (outside it) are never covered.
- **Deviation from the plan, on purpose: the game-over fireworks (`SessionCompleteFireworks`) stay OUTSIDE the stage.**
  The overlay is `absolute inset-0 z-30`. Inside the `relative` stage it would have shrunk to below the header, which
  would change the complete screen (today the overlay dims and blurs the header too). It now renders after the stage,
  still wrapped in `{phase === "complete" && (<AnimatePresence>…)}` exactly as before. Gating the AnimatePresence
  itself on the phase keeps the old behaviour: leaving "complete" unmounts it with no exit fade. Browser-verified:
  the overlay's rect is the full frame (0,0 → 390×844 and 320×568).
- `LetterDieRoll` root: `absolute inset-0 z-10 overflow-hidden` (+ `pointer-events-none` while flying). The doc
  comment now says it fills its positioned parent.
- `DevAnimationPanel`: `DEMO_CONTROL_Z = "z-20"` (one step above the die, which is `z-10` in the panel's `fixed
  z-[1000]` stacking context). The die's demo container was already `relative`, so the die fills it.
- `Header`'s `raised` prop, its doc comment and the `relative z-[1110]` branch are deleted. No `z-[1100]`/`z-[1110]`
  remains in `components/category-blitz/` (the contract test enforces this).
- The "Phase 9.1 superseded" note was already in the plan; the plan's Phase 9 text is history and was left as is.

### 4. Files changed in 11.2
- `components/category-blitz/CategoryBlitzGame.tsx`: `Header` loses `raised`; the main render adds the stage wrapper
  (its contents re-indented by 2 spaces, otherwise unchanged); the die moved from before the phase content to the
  stage's last child; the fireworks moved after the stage; one comment changed from "covers the screen" to "covers the stage".
- `components/category-blitz/LetterDieRoll.tsx`: root class, doc comment.
- `components/category-blitz/DevAnimationPanel.tsx`: `DEMO_CONTROL_Z` + its comment.
- `tests/category-blitz-letter-die-contract.test.ts`: the `raised`/`z-[1110]` test is replaced by "the die lives in the
  game's stage": root is `absolute inset-0 z-10`, no `fixed` in `LetterDieRoll.tsx`, the stage comes after `<Header`
  and is `relative isolate`, `<LetterDieRoll` comes after the stage, there is no `raised`, there is one `ExitBackButton`,
  and no `z-[1100]`/`z-[1110]` remains in `components/category-blitz/`. The dev-panel test now expects `"z-20"`.
- `tests/components.category-blitz-letter-die-wiring.test.ts`: describe "9 / 11.2 …". While tumbling, the die's
  `parentElement` is the stage, and Back is outside both the die and the stage and calls `onBack`. A new test turns on
  test mode (localStorage `tp:category-blitz-test-mode` + `session.testMode: true`) and checks that the Test mode and
  Skip round buttons are outside the stage while the die tumbles. The old "header is not raised" test was deleted.

### 5. Facts and traps
- **Only one phase element was positioned against the frame:** `SessionCompleteFireworks` (see §3). Every other
  `absolute inset-0` (`SubmitLockAnimation`, `CorrectBurst`, `ValidAnswerGlow`, `LiveLeaderboard`, `WrongLetterReject`)
  already has a nearer `relative` ancestor. The "How to play" sheet is an `OwnerSheet` that portals to the body. The
  phase screens have no z-index above 10 that could poke through the die while it rolls: `SubmitLockAnimation` is
  `z-20`, but it shows only on submit at round end, never while the die is mounted.
- The visible frame (`.tp-cbz-visible-frame`) has a `translate3d` transform, so it is already the containing block and
  stacking context for every `fixed` child. That is why the old die `fixed inset-0` covered the frame and not the page.
- **Browser harness (reusable):** the scratchpad clone was made with `rsync -a` of the repo, using ANCHORED excludes
  (`--exclude /native`, not `native`: an unanchored exclude also drops `components/native` and the root layout fails to
  compile). It had no `.env*`, and `node_modules` was symlinked. Run it with `npx next dev --webpack -p 3100`
  (Turbopack refuses a symlinked `node_modules`). Set cookies `tp_venue_id` + `tp_user_id` and localStorage
  `tp:venue-id` / `tp:user-id` / `tp:username`, then `page.route("**/api/**")` mocks `GET /api/category-blitz/sessions`,
  `…/current-round` and `…/rounds/:id/results`. The scripts were scratchpad-only and are gone with the session.
  Rebuild them from these notes if needed.
- **Mock timing traps:** with no realtime, the next round arrives through the boundary kick, whose random jitter is
  `min(3 s, 200 ms × players)`. With `playerCount` 5 the letter often lands more than 3 s late, and 11.1a then
  (correctly) skips the landing. Use `playerCount: 1` and serve the new round from ~2.5 s before its `startedAt` to see a
  real landing and FLIP. The die tumbles only over a *resting* intermission. A fresh load of a just-scored round first
  plays the grading cascade (~12 s), so the die can't be seen until after that.
- The Next.js dev indicator (`nextjs-portal`, bottom-left) covers the centre of the dev panel's Replay button in a dev
  browser. That is a dev-tools artifact, not the die. Hit-test Replay at its right edge.

### 6. Build / test / verification
- Gates run 2026-10-30: `npx tsc --noEmit` clean; `npx eslint` on the 5 touched files clean; `npm run test` gave
  5,673 pass / 13 skipped / 4 fail (only the 4 known Bingo star-index freshness tripwires); `npm run build` exit 0
  (run after typecheck, not alongside it).
- **Layout before/after** (Playwright Chromium, iPhone-like context at @2x, 390×844 and 320×568, mocked routes):
  lobby, continuous wait, answering, results (2.5 s and 14 s), Majority Rules results (2.5 s and 14 s) and complete
  (champion, 2.5 s and 14 s). I compared dumps of every element's rect under the visible frame, ignoring the stage
  wrapper itself, and took screenshots. Every settled screen is **identical**. The only differences were in the
  2.5 s results shots: sparkle/particle positions in the mid-animation grading cascade (timing noise). Runner-up
  complete (fireworks) was checked after the change only: the overlay covers the full frame, header included.
- **Finding 5 reproduced, then fixed:** while the die tumbles, a hit-test on the Test mode button gave
  *before* not tappable (die over it) and *after* tappable. Back was tappable in both. The die's rect went from
  `0,0 390×844` (whole frame) to `0,66 390×778` (below the header), and at 320×568 to `0,65 320×504`.
- **FLIP:** a real landing (continuous, `playerCount` 1). The badge's first frame sits at the held tile (`56,249`,
  125 px) and eases into the corner (`14,187`, 53 px; the y includes the solo-player banner) in about 280 ms. The die
  unmounts right after. It is not clipped by the die's `overflow-hidden`, because the path stays inside the stage.
- **Keyboard chrome:** focusing row 1 turns `compactChrome` on, the header (Back) hides, the stage fills the frame
  (`0,0 390×844`) and the answer list starts under the compact strip. The visual-viewport frame hook targets the
  frame element, which did not change.
- **Dev panel:** in both the "Letter die roll" and "Majority Rules" demos, Close and Replay are tappable on every
  sampled frame while the die is mounted.
- **Mutation checks** (files backed up to the scratchpad, restored, `cmp`-verified): die root back to
  `fixed inset-0 z-[1100]` made the contract test fail; the stage marker moved off the die's parent made the wiring
  test fail.
- **Not verified:** real devices (iOS Safari keyboard + safe areas), WebKit (only Chromium ran this time), and the
  look of the die under the header bar. All three are Phase 12 phone-pass items.

### 7. Open questions for Andrew
None new. Still parked: the intermission's "Next round in" copy on a final round (Phase 7). A truly full-screen die
over the header is out of scope; it becomes a new request if he asks for it in Phase 12.

### 8. Recommended first steps for 11.3
1. Read plan §5 "Phase 11.3" and `components/category-blitz/LetterDieRoll.tsx` (`beginLanding`, `freshFiller`,
   `reducedLandRef`, the glyph/shade ref callbacks) plus `tests/components.letter-die-roll.test.ts`.
2. 11.3d's `memo` + `useCallback` touches `handleDieStage` / `handleDieDone` in `CategoryBlitzGame.tsx`. Since 11.2
   the `<LetterDieRoll>` element is the stage's last child (around line 2918); its props are unchanged.
3. Sonnet 5.5, medium effort. Same gates; write `…_PHASE_11.3_HANDOFF.md` and update the plan's status line.
