# Speed Trivia feedback animations — Phase 3 handoff

## For Andrew (plain English)
Phase 3 is done, including the fix you asked for: **the Correct badge now shows the real points.**
The badge still pops the instant the player taps the right answer; the yellow points chip appears a
split second later with the number the server actually awarded — so during a 3x Challenge it says
"+6 pts", not "+2 pts". If the server is slow, the chip appears as soon as the number arrives (while
the badge is still on screen). If the answer couldn't be saved, the chip simply doesn't show — it
never shows a made-up number.

All automated checks pass (typecheck, lint, tests, PWA checks, production build). **Not committed,
not deployed.** What's left is only your phone check (list in "For the next agent" §8 / below).

**Your phone check** (real phone; installed app/PWA too):
1. Answer a Speed Trivia question **wrong** → sad emojis fall all the way off the bottom edge.
2. Answer **right** → one dark card with a glowing green rim, ✓, "CORRECT", then a yellow chip with
   the points. Easy to read over the background?
3. Answer right **during a Challenge multiplier** → the chip shows the multiplied number.
4. Turn on **Reduce Motion** → no celebration plays at all (same as before these changes).

Still waiting on you (not blocking): keep or delete the design preview
`docs/fixtures/speed-trivia-correct-badge-preview.html`; and whether to commit these changes.

## For the next agent

### 1. Goal and scope
The plan (`docs/speed-trivia-feedback-animations-plan.md`) is complete except Andrew's device pass.
If Andrew reports a device problem, fix only that. Out of scope: redesigning the badge (B · Medal card
is chosen), Live Trivia / Wrong animations, the optimistic "+2" text in `TriviaGame`'s feedback line
and reward pulse (those already update to the real number when the server answers), and all the
unrelated uncommitted Speed Trivia uniqueness/variety work in the tree.

### 2. Starting state
- Branch `main`, last commit `2d6211e`. Phases 1–3 are **uncommitted**, mixed in the working tree with
  unrelated uncommitted uniqueness/variety work (`lib/speed-trivia-uniqueness/*`, `app/api/trivia/route.ts`,
  migration `20261014020000_speed_trivia_variety_review.sql`, etc.). Never `git checkout -- <file>`;
  commit only if Andrew asks, and then only this plan's files (§4). Note `components/trivia/TriviaGame.tsx`
  also carries unrelated edits (e.g. the `SelectionInfo` import) — stage hunks, not the whole file,
  if committing separately.
- Nothing pushed/deployed. No data, migrations or backups involved.

### 3. Decisions already made
- Andrew picked **B · Medal card** (Phase 2).
- Andrew (2026-10-13): "Add a fix for this so the real points always show up on the badge" → done in
  Phase 3. Timing chosen: **badge pops immediately; only the chip waits** for the server number (no
  delay before the badge, no change to the 1400 ms total, so the next question is never later).
- No number → no chip (never a guessed default). Zero points → no chip. `+1 pt` singular.

### 4. Files changed (all phases)
- Phase 3:
  - `components/animations/AnimationTriggerProvider.tsx` — `triggerAnimation` now **returns the id**;
    new `updateAnimationPayload(id, patch)` (reducer action `UPDATE_PAYLOAD`, patches the active item
    or a queued one, no-op once finished). `useAnimationTrigger()` exposes both.
  - `types/animation.ts` — `AnimationPayload.pointsAwarded?: number`.
  - `components/animations/SpeedTriviaCorrectAnimation.tsx` — exported `speedTriviaPointsLabel()`;
    chip text = `pointsLabel` prop (override, still supported) ?? label from `payload.pointsAwarded`.
    Chip reveal moved to its own effect keyed on the label: delay `max(0, 180ms − elapsed)`. The chip
    is always rendered (opacity 0, placeholder text) so the card height never changes.
  - `components/trivia/TriviaGame.tsx` — in `chooseAnswer`: `correctAnimationId = triggerAnimation(...)`,
    then on a server-confirmed correct answer `updateAnimationPayload(correctAnimationId, { pointsAwarded })`;
    `updateAnimationPayload` added to the `useCallback` deps.
  - New test `tests/speed-trivia-correct-points.test.ts` (6 tests: label, payload patch active/queued/
    finished, TriviaGame wiring).
  - Plan doc: status line, phase table, Phase 3 section.
- Phase 2: `SpeedTriviaCorrectAnimation.tsx`; `docs/fixtures/speed-trivia-correct-badge-preview.html`.
- Phase 1: `components/trivia/TriviaGame.tsx` (rain portal), `app/globals.css` (`tp-rain-drip`).

### 5. Facts and traps
- If the server answers "incorrect" after a local "correct" (rare mismatch), the badge still shows
  "Correct" with no chip — pre-existing behaviour, unchanged.
- Other `useAnimationTrigger()` callers (Category Blitz, Bingo, Fantasy, Live Trivia) only destructure
  `triggerAnimation`; the new return value is ignored there, harmless.
- `tests/scripts.speed-trivia-provider-labels.test.ts` failed 4/4 inside the full run but passes 4/4
  alone — timing-sensitive under load and part of the in-flight uniqueness work (file is modified in
  the tree). Not caused by this plan.

### 6. Build/test and verification (2026-10-13)
- `npx tsc --noEmit` clean · `npm run lint` clean · `npm run test:pwa-contract` 20/20 ·
  `npm run build` succeeded.
- `npm run test`: 4310 pass, 13 skip, 4 fail (only the provider-labels file above, passes alone).
- New + related tests: speed-trivia-correct-points, native-share-haptics-contract,
  native-haptics-unified, text-size-floor-contract — all pass.
- **Not done: a browser render of the badge in the real game.** Answering a question hits
  `POST /api/trivia`, which writes to the shared production database, and Andrew's `next dev` holds
  :3000; at this plan's low effort it was left to Andrew's phone pass. Unverified visually: chip
  reveal timing on a slow network, Phase 1 rain on device.

### 7. Open questions for Andrew
- Keep or delete `docs/fixtures/speed-trivia-correct-badge-preview.html`?
- Commit these changes (this plan's files only)?
- Phone pass results (list in the summary above).

### 8. Recommended next steps
Wait for Andrew's phone pass. If something looks wrong, reproduce with the `verify` skill against a
throwaway venue (cookies before navigating, never kill :3000). Model: Sonnet 5.5, low effort.

## Post-phase change (2026-10-13, Andrew's request)

Andrew preferred **A · Glow pill** over B, and said the points took a while to appear and only
flashed briefly. `components/animations/SpeedTriviaCorrectAnimation.tsx` now:

- Renders option A from `docs/fixtures/speed-trivia-correct-badge-preview.html`: one dark pill,
  3px `#34d399` rim + glow, "✓ CORRECT" (26px) over yellow `#fde047` points (22px). No check disc,
  no yellow chip. Particles fly 110–190px (the pill is wider than the card was).
- **Is no longer a fixed 1400 ms.** Timing constants at the top of the file: points reveal 120 ms
  after mount (if the server has answered), pop in over 400 ms, and stay visible at least
  `POINTS_MIN_VISIBLE_MS` = 1500 ms; the pill leaves no earlier than `MIN_EXIT_AT_MS` = 2000 ms and
  no later than `MAX_EXIT_AT_MS` = 3200 ms (server slow or failed), then exits in 400 ms. `onComplete`
  fires when the exit finishes (safety timer at 3.9 s). Typical total ≈ 2.4 s (was 1.4 s). A
  zero-point answer (`payload.pointsAwarded === 0`) counts as settled, so it doesn't wait for the cap.
- Trade-off accepted by Andrew's request: the animation queue is serial, so a player who answers
  the next question within ~2.4 s sees that feedback slightly later. The green screen flash
  (`CORRECT_FEEDBACK_FLASH_DURATION_MS` = 1300 in `TriviaGame.tsx`) was left unchanged.
- Checks run: `npx tsc --noEmit`, `npx eslint` on the file, and
  `tests/speed-trivia-correct-points.test.ts`, `tests/text-size-floor-contract.test.ts`,
  `tests/native-share-haptics-contract.test.ts` — all pass. Not yet seen on a phone.
