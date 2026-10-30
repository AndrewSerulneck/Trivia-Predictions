# Category Blitz Letter Die — Phase 4 handoff (wired into the game)

**Date:** 2026-10-30 · **Branch:** `after-app-review` · **Plan:** `docs/category-blitz-letter-die-plan.md`

## For Andrew (plain English)

- **What changed:** the letter die now plays in the real game. In the last 5 seconds of the break between rounds
  (and of the countdown before the first round) the die covers the screen and tumbles; when the round starts it
  lands on the letter, holds, and flies into the letter badge on the answering screen while the categories slide in
  one after another. On a Majority Rules round the die turns magenta/gold as it lands, and the Majority Rules
  announcement plays **after** the die has flown into the badge, never at the same time. The green "back to normal"
  announcement after a Majority Rules round waits for the die the same way.
- **If something goes wrong** (the letter arrives more than 12 seconds after the die started, the phone was locked or
  the app was in the background during the roll, or someone opens the game in the middle of a round), the die steps
  aside and today's reveal or answering screen shows instead. There is also a safety timer so a player can never be
  left on a blank screen.
- **Live?** No. Not committed, not pushed, not deployed (main is frozen for the App Store review). Zero running cost:
  no new requests, polling, database changes or cron jobs.
- **Checked:** typecheck clean; lint clean on every file I touched; full test suite passes except the same 4 old Bingo
  "star index is out of date" checks that were already failing before this work (unrelated); production build passes.
  New test plays the real game screen through a break and a round start (6 cases).
- **Needs from you:** nothing now. The look on a real phone is Phase 6.
- **One judgment call you may want to look at (§3, item 11):** the letter flies straight into the corner badge and
  the categories slide in on the answering screen itself. Today's separate "reveal" screen is now only the backup for
  when the die is skipped. This is what the plan's plain-English description (§1) says; one line of the technical
  plan described keeping the old reveal screen for the categories, which would have made the letter fly twice and
  added about a second and a half before players can type.

## For the next agent (Phase 5, Sonnet 5.5, medium)

### 1. Goal / scope
Phase 5 (plan §5): polish and guardrails — check the Phase 2 edge cases in the real component, continuous-mode venues
and the global room; contract test (one die component, haptics only through `triggerAnimation`, no sound files, no new
request); full gates; `/verify` Playwright run of a round start. Out of scope: venue TV, feature flag, sound, merging.

### 2. Starting state
Branch `after-app-review`, last commit `c3ecdb8a`. **Nothing from Phases 1–4 is committed.** `main` is frozen during
App Store review: never push `main`, deploy, run `supabase db push` or change Production env. No data, migration, env
var or cron touched by any phase.

Uncommitted Phase 4 changes:
- Changed: `components/category-blitz/CategoryBlitzGame.tsx` (wiring + `AnsweringScreen` `cascadeRows`),
  `components/category-blitz/RoundStartReveal.tsx` (uses the shared cascade constants; no behaviour change),
  `lib/categoryBlitzMotion.ts` (+ cascade constants), `components/category-blitz/DevAnimationPanel.tsx`
  (`LetterDieDemo` passes `cascadeRows`).
- New: `tests/components.category-blitz-letter-die-wiring.test.ts` (6 tests).
- Phase 1–3 files listed in `…_PHASE_3_HANDOFF.md` §2 are still uncommitted too.

### 3. Decisions (don't re-ask)
Plan §2 items 1–10. Phase 4 judgment calls (recorded in plan §2 as item 11):
11. **The letter flies directly into the AnsweringScreen corner badge and the rows cascade in on the AnsweringScreen**
    (`cascadeRows`), reusing RoundStartReveal's row timing via shared constants. `RoundStartReveal` is unchanged and is
    used only as the fallback when the die ends `flew: false`. Reason: plan §1 (Andrew's plain-English spec) and the
    Phase 3 build/verification fly the letter into the corner badge; routing through RoundStartReveal's centred badge
    would fly the letter twice and add ~1.4 s before typing.
12. **The die also plays before a session's first round** (lobby countdown = its tumble lead), so the first round
    looks like every other round. With no countdown seen (first visit right at a round start) it lands without
    tumbling, like the Phase 3 component already did.
13. **The die only tumbles off the resting intermission (`phase === "results"`)**, never over a still-playing grading
    cascade (`reveal`) or the pre-scoring estimate (`scoring`). If the break is still in `reveal` at the 5 s mark, the
    die starts when `results` begins, or lands without tumbling at round start.

### 4. Files and how they fit (all in `CategoryBlitzGame.tsx` unless named)
- **`roundLineage`** state `{ id, mode, prevId, prevMode }`, updated during render when `round.id` changes (same
  pattern as `firstRank`, so a stale key is never committed).
- **`dieKey`** = `after:<round the break follows>`: in break phases (`lobby | scoring | reveal | results`) that is
  `round?.id ?? "none"`; in `answering` it is `roundLineage.prevId ?? "none"`. So the same `LetterDieRoll` instance
  survives the new round's arrival (it holds its own latches); a new break gets a new instance.
- **`dieCountdown`** = `nextRoundStartsIn` in `results`, `lobbyCountdown` in `lobby`, else null.
- **`<LetterDieRoll key={dieKey} …>`** is rendered inside `CategoryBlitzFrame` right after the dev-only UI, whenever
  `dieKey !== null && !dieSkipped`. Props: `letter`/`roundStartedAtMs`/`reverse` only in `answering`.
  `roundNumber` is not passed (the session has no round number; no label shows).
- **`dieOutcome`** `{ key, stage, flew }` from `handleDieStage` / `handleDieDone` (both called from the die's frame).
  `dieSkipped` = this key ended `flew: false`.
- **`dieHoldsBoard`** = answering, round not yet revealed, die not skipped → the answering branch renders an empty
  `flex-1` div (no RoundStartReveal: its badge carries `CB_LETTER_BADGE_LAYOUT_ID` and would steal the die tile's FLIP).
- **On `flying`:** `setFinishedRevealRoundId(round.id)` + `markRevealDone(round.id)` + `fallbackMarkedRevealRoundIdRef`
  (exactly what RoundStartReveal's `onDone` does) and `dieBoardRoundId = round.id` → `AnsweringScreen` mounts with
  `morphFromReveal` and `cascadeRows` in the same frame the tile is up, so its badge FLIPs out of the tile.
- **On `done` with `flew: true`:** `dieDoneRoundId = round.id` → `modeFlipCue` → the MR / toStandard takeovers.
- **`modeFlipCue`** = answering && (`dieDoneRoundId === round.id` || (`dieSkipped` && `showReveal`)). Both takeover
  effects key off it instead of `showReveal`. The toStandard effect now reads `roundLineage.prevMode` (the old
  `prevRoundModeRef` was removed: with the cue arriving seconds after the round, "last mode this effect saw" would
  already be the new round's).
- **Watchdog:** while `dieHoldsBoard`, a timeout of `DIE_ARRIVAL_TO_BADGE_MAX_MS` (2,770) + `DIE_WATCHDOG_SLACK_MS`
  (1,500) marks the key skipped if the die never reached `flying` (e.g. its frames never ran because the tab was hidden
  when the round arrived). Skipped → die unmounted → normal board / reveal.
- **`AnsweringScreen` `cascadeRows`:** rows (still the `morphActive` motion wrappers with their layoutIds) get
  `initial {opacity 0, y 12}` → `animate {opacity 1, y 0}`, delay `0.15 + i × 0.06` s, 0.3 s each (opacity-only under
  Reduce Motion). `morphActive` stays on until the cascade ends (`cbRowCascadeAfterDieEndMs(n) + 120`, ≈ 1.23 s for 12
  rows) instead of 570 ms — swapping to plain divs mid-cascade would pop the remaining rows in. Without `cascadeRows`
  nothing changed.
- **`lib/categoryBlitzMotion.ts`:** `CB_ROW_CASCADE_STAGGER_S` 0.06, `CB_ROW_CASCADE_DURATION_S` 0.3,
  `CB_ROW_CASCADE_AFTER_DIE_DELAY_S` 0.15, `cbRowCascadeAfterDieEndMs(rowCount)`.

### 5. Facts and traps
- The die overlay renders inside the visible frame (`.tp-cbz-visible-frame`, which uses `translate3d`), so its
  `fixed inset-0` is relative to that frame = the visual viewport. That is intended; the global `AnimationOverlay`
  (MR takeover, z-1200) still sits above the whole game.
- The die covers the header (Back button) for its ~5–8 s; taps are caught until `flying`.
- The elapsed-time fallback effect (`revealElapsedMs > ROUND_START_REVEAL_MAX_MS`) can call `markRevealDone` while the
  die is still landing (letter latency + 2.3 s can exceed 3 s). Harmless: it only unblocks the scoring gate; it does not
  set `finishedRevealRoundId`.
- Timing is client-clock vs server `round.startedAt` (no server offset in the game, same as `showReveal`).
- The round-start sequence is now ~2.3–2.8 s from the round's arrival to the board (landing 1.1 s + hold 0.7 s + up to
  one hop), versus ~2 s for today's reveal; the tumble itself happens in the break.
- Test harness for the real game: `tests/components.category-blitz-letter-die-wiring.test.ts` mocks
  `useCategoryBlitzSession`, `@/lib/storage`, `useAnimationTrigger` and `useReducedMotion`; advance timers in ≤ 50 ms
  steps inside `act` (the die runs on fake rAF). Mutation-checked: reverting the MR cue to `showReveal`, or rendering
  RoundStartReveal under the die, fails 2 tests each.
- Lint: `npm run lint` reports 309 parsing errors, all under `tmp/group-games-phase-4/` (a git-ignored copy from
  2026-10-24, not part of this work; eslint doesn't read `.gitignore`). Zero errors anywhere else. Every file touched in Phase 4 lints clean with `npx eslint <files>`.

### 6. Build / test / what was verified
- `npx vitest run tests/components.category-blitz-letter-die-wiring.test.ts tests/components.letter-die-roll.test.ts tests/lib.category-blitz-die-motion.test.ts tests/lib.category-blitz-letter-die.test.ts` → 42 pass.
- `npx tsc --noEmit` clean. `npx eslint` on the 4 touched source files clean.
- `npm run test`: 5,627 pass / 13 skipped / 4 fail — the same unrelated Bingo star-index freshness tripwires
  (`tests/lib.sportsBingo.{mlb,nfl}-star-index{,-freshness}.test.ts`) recorded in the Phase 3 handoff.
- `npm run build`: passed (exit 0).
- **Unverified:** a real browser round start against a live session (Phase 5 `/verify`; dev shares the production DB —
  use a scratchpad clone, never `pkill next-server`); Majority Rules takeover timing by eye; continuous mode + the
  global room; frame rate and haptics on a real phone (Phase 6).

### 7. Open questions
None blocking. Andrew may want to weigh in on §3 item 11 (direct fly + cascade on the board).

### 8. Recommended first steps for Phase 5 (Sonnet 5.5, medium)
1. Read this handoff §4–§5 and the wiring test.
2. Add the plan's contract test (one die component; haptics only via `triggerAnimation`; no audio files/imports under
   `components/category-blitz/`; no `fetch(` in `LetterDieRoll.tsx` / `lib/categoryBlitzLetterDie.ts` /
   `lib/categoryBlitzDieMotion.ts`; the game renders RoundStartReveal only when the die is skipped).
3. Edge cases: continuous sessions (lobby → first round), the global room flag, a slow round arrival, Reduce Motion in
   the game, visibility changes mid-landing.
4. `/verify` a round start; then `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` (not tsc and build
   at once).
