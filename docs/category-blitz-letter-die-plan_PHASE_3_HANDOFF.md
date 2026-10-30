# Category Blitz Letter Die — Phase 3 handoff (the die component)

**Date:** 2026-10-30 · **Branch:** `after-app-review` · **Plan:** `docs/category-blitz-letter-die-plan.md`

## For Andrew (plain English)

- **What changed:** the real 3D letter die now exists as a building block in the app's code. It drops in, bounces
  and tumbles with letters changing on the hidden sides, lands on the round's letter (magenta/gold on a Majority
  Rules round), holds, and flies into the letter badge in the corner. Phones buzz lightly on each bounce and
  strongly on the landing (app only; the website can't buzz an iPhone).
- **Can I see it?** Not in a real game yet: that's Phase 4. In test mode on the Category Blitz page, the
  "Animations" dev panel has three new buttons: **Letter die roll**, **Letter die — letter 3 s late**,
  **Letter die — Majority Rules** (with a Replay button).
- **Your decision on the cap is recorded:** if the letter hasn't arrived 12 seconds after the die started
  tumbling, the die steps aside and today's normal reveal shows the letter.
- **Live?** No. Not wired into the game, not committed, not deployed. Zero running cost (no requests, no database).
- **Checked:** new tests pass, typecheck, lint and the production build are clean. I also played it in a real
  browser engine (Chrome's and Safari's) from a separate copy: the cube, the Majority Rules colours, the
  Reduce Motion version and the fly into the badge all work.
- **Needs from you:** nothing now. In Phase 6, how smooth it feels on an older phone (only a real phone can tell).

## For the next agent (Phase 4, Opus 5.5, high)

### 1. Goal / scope
Phase 4 (plan §5): wire `LetterDieRoll` into `components/category-blitz/CategoryBlitzGame.tsx`; `RoundStartReveal`
keeps only the category cascade; Majority Rules sequence die → existing MR takeover → board, never overlapping.
Out of scope: venue TV, a feature flag, sound, Phase 5 contract tests beyond what Phase 4 touches.

### 2. Starting state
Branch `after-app-review`, last commit `c3ecdb8a`. **Nothing committed by Phases 1–3.** `main` is frozen during App
Store review: never push `main`, deploy, run `supabase db push` or change Production env. No data, migration,
env var or cron touched. The scratch worktree and dev server used for browser checks were removed/stopped.

Uncommitted Phase 3 files:
- New: `components/category-blitz/LetterDieRoll.tsx`, `lib/categoryBlitzDieMotion.ts`,
  `tests/components.letter-die-roll.test.ts` (7 tests), `tests/lib.category-blitz-die-motion.test.ts` (11 tests).
- Changed: `lib/categoryBlitzLetterDie.ts` (+`DIE_USABLE_LETTERS`), `tests/lib.category-blitz-letter-die.test.ts`
  (+1 pin test, now 18), `types/animation.ts`, `lib/nativeHaptics.ts`, `components/animations/AnimationTriggerProvider.tsx`,
  `components/animations/animationRegistry.ts`, `components/animations/AnimationOverlay.tsx`, `lib/themeTokens.ts`,
  `components/category-blitz/DevAnimationPanel.tsx`.
- Still untracked from Phases 1–2: the plan, Phase 1/2 handoffs, `docs/prototypes/`, `lib/categoryBlitzLetterDie.ts`
  and its test.

### 3. Decisions (don't re-ask)
Plan §2 items 1–10. Item 10 (new, 2026-10-30): Andrew accepted the Phase 2 late-letter cap — tumble at most
`DIE_MAX_TUMBLE_MS` (12 s); past that the die ends `done` with `flew: false` and the normal reveal shows the letter.

### 4. Files and how they fit
- **`LetterDieRoll.tsx`** (default export). Props: `letter` (null while secret), `nextRoundStartsIn`,
  `roundStartedAtMs`, `reverse?`, `roundNumber?`, `usableLetters?` (defaults to `DIE_USABLE_LETTERS`),
  `onStageChange?(stage)`, `onDone?({ flew })`.
  - **Mount it for the whole break, remount per roll (React `key`).** It owns the three latches `dieStage` needs
    (tumble start, letter arrival, tab hidden). Renders `null` while `idle` and after `done`. A finished instance
    never restarts.
  - `onStageChange` / `onDone` fire **from the animation frame, not from a render**, so the parent hears every stage
    even when React batches, and can mount the badge in the same frame as `flying`. `onDone` fires once;
    `flew: false` = skipped (opened mid-round, tab hidden, letter later than the cap) → show the normal reveal.
  - 60 fps writes (cube rotation, bounce, shading, letters) go straight to DOM via refs; React renders only on a
    stage change, the MR tint and the tile mount (≈ 6 renders per roll).
  - **The FLIP:** ~220 ms into `holding` the cube hides and a flat tile with `layoutId={CB_LETTER_BADGE_LAYOUT_ID}`
    (196 px = the front face's projected size, `DIE_HOLD_TILE_PX`) takes its place; it stays mounted through `flying`.
    Whatever mounts with the same layoutId while it is up (the `AnsweringScreen` badge with `morphFromReveal`)
    animates out of it. During `flying` the backdrop fades (0.8 × 450 ms) and the overlay stops catching taps.
  - Overlay is `fixed inset-0 z-[1100]` (below `AnimationOverlay`'s z-[1200], above the dev panel's z-[1000]).
    It catches taps until `flying`.
  - Reduce Motion: no cube; a still "?" tile cross-fades to the letter, holds, fades out (no layoutId, no flight).
- **`lib/categoryBlitzDieMotion.ts`** (pure): quaternions, `FACE_ORIENTATIONS`, `faceViews` (hidden/shade),
  `mostHiddenFace`, `faceFrontOrientation`, `tumbleHeightPx`/`tumbleImpacts` (the drop-in is the first hop, so impacts
  land exactly on `tumbleStart + k·DIE_HOP_MS` = `landingStartMs`'s instants), `landingFrame` (hop + 2 settles sized
  to fill `DIE_SETTLE_MS` exactly), `squash`. Visual constants (size 168, perspective 900, spin 620 °/s, swap 110 ms…).
- **Haptics:** new animation types `CATEGORY_BLITZ_DIE_BOUNCE` → `"tap"` (LIGHT impact) and
  `CATEGORY_BLITZ_DIE_LAND` → new kind `"thud"` (HEAVY impact) in `lib/nativeHaptics.ts`. They are **haptic-only**
  (`HapticOnlyAnimationType` in `types/animation.ts`, `isHapticOnlyAnimation` in `lib/nativeHaptics.ts`):
  `triggerAnimation` plays the buzz and **does not queue** an overlay animation (otherwise every bounce would re-render
  every `useAnimationTrigger` consumer — including the 2,700-line game — twice). `ANIMATION_REGISTRY` is now typed on
  `GameplayAnimationType` (the rendered ones). `playHaptic` is still the only native call site.
- **Tokens:** `dieGlow`, `dieCore`, `dieRing` added to `GAME_THEME.blitzStandard` / `blitzReverse` in `lib/themeTokens.ts`.
- **`DIE_USABLE_LETTERS`** in `lib/categoryBlitzLetterDie.ts`: a copy of the 18 usable letters so the phone never
  downloads the 230 KB letter index; a test pins it equal to both `usableLetters` and `bUsableLetters`.
- **DevAnimationPanel:** `LetterDieDemo` (7 s mock break, letter at 0 s or +3 s, mounts a mock `AnsweringScreen` on
  `flying` inside a `LayoutGroup`) — the reference wiring for Phase 4.

### 5. Facts and traps for Phase 4
- **Never have another element with `CB_LETTER_BADGE_LAYOUT_ID` mounted when the die's tile mounts** (~hold + 220 ms),
  or the tile becomes the new lead and animates *from* that element. Today `RoundStartReveal`'s badge carries the same
  id: Phase 4 must remove/rename it (or not render it) whenever the die flew. The `AnsweringScreen` badge only carries
  the id while `morphActive` (`morphFromReveal`), so mount the answering screen with `morphFromReveal` on `flying`.
- Category rows also use layoutIds (`cbCategoryRowLayoutId`). In the dev demo, rows just appear (no source to morph
  from). Phase 4 decides the cascade: plan says `RoundStartReveal` keeps only the cascade.
- `fixed` breaks under an ancestor with `transform`/`filter`; mount the die outside any transformed game wrapper (or
  check). In the dev panel it sits inside the panel's own fixed layer and works.
- `roundStartedAtMs` is server time; the client clock may be skewed. It only matters for the mid-round cutoff
  (never-tumbled case). Use the game's existing server-offset if it has one.
- `nextRoundStartsIn` ticks once a second, so the tumble starts within ~1 s of the 5 s mark — matches the prototype.
- framer-motion caches Reduce Motion once per process: the component test mocks `useReducedMotion` instead of matchMedia.
- In the game, `.tp-game-page .tp-page-main .text-xs` is inflated; the die uses `text-footnote` and px sizes only.

### 6. Build / test / what was verified
- `npx vitest run tests/components.letter-die-roll.test.ts tests/lib.category-blitz-die-motion.test.ts tests/lib.category-blitz-letter-die.test.ts`
  → 36 pass. Component test runs a full roll with fake timers: stages `tumbling → landing → holding → flying → done`,
  3 light buzzes before arrival, exactly 1 strong buzz, `onDone({ flew: true })`; mid-round open; tab hidden; Reduce Motion;
  haptic-only types never reach the overlay queue.
- `npx tsc --noEmit` clean; `npx eslint` on every touched file clean; `npm run build` passed (EXIT 0).
- `npm run test`: 5,621 pass / 13 skipped / **4 fail, all unrelated** — the Bingo star-index freshness tripwires
  (`tests/lib.sportsBingo.{mlb,nfl}-star-index{,-freshness}.test.ts`): `data/sports-bingo/{mlb,nfl}-star-index.json`
  were generated 2026-10-14 and are now past their freshness window. Not touched here; tell Andrew separately if asked.
- **Real-browser check** (Playwright, 390×844 @2x, from a throwaway `git worktree` + `next dev --webpack -p 3100` with no
  `.env.local`; Turbopack refuses a symlinked `node_modules`, webpack doesn't): Chromium + WebKit render the cube,
  tumble letters, landing, hold, MR magenta/gold, Reduce Motion "?" tile; no page errors. Per-frame badge tracking shows
  the FLIP: badge starts at the tile (x 97, y 273, 196 px) and eases into the corner (x 14, y 21, 53 px) over ~450 ms;
  overlay unmounts right after. Chromium headless ran ~120 fps during the tumble (not meaningful for phones).
- **Unverified:** frame rate on an iPhone SE / older Android; whether the badge reads clearly through the fading backdrop
  during the 450 ms fly (screenshots were too slow to catch mid-flight); haptics on a real device.

### 7. Open questions
None blocking. Phase 6 phone pass: smoothness on an old phone, fly visibility.

### 8. Recommended first steps for Phase 4 (Opus 5.5, high)
1. Read `CategoryBlitzGame.tsx` around `showReveal` (~line 2384), the about-to-start check (~2476), the MR triggers
   (~2501–2538) and `finishedRevealRoundId` / `morphFromReveal` (~2397, ~2696). Copy the `LetterDieDemo` wiring in
   `DevAnimationPanel.tsx`.
2. Key the die per upcoming round; hide the intermission only once the stage is `tumbling`; on `flying` mount the
   answering screen with `morphFromReveal`; on `onDone({ flew: false })` fall back to today's `RoundStartReveal`.
3. Sequence MR after `onDone` (or `flying` + 450 ms), never overlapping the FLIP.
4. `npx tsc --noEmit`, `npm run lint`, `npm run test`, then `npm run build` (not at the same time as typecheck).
