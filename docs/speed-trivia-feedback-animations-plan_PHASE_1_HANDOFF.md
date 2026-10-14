# Speed Trivia feedback animations — Phase 1 handoff

## For Andrew (plain English)
Phase 1 is built: after a wrong answer the sad emojis now fall the whole way and slide off the very
bottom of the screen, staying fully solid on the way down (before, they faded out and were cut off
partway). **Not committed, not deployed** — it only exists in your working copy. Still to do: you
check it on a real phone (Phase 3), and Phase 2 (the single "Correct + points" badge) is untouched.
One thing needs your eye: 3 tests in `tests/scripts.speed-trivia-admission.test.ts` fail, but they
belong to the separate Speed Trivia uniqueness work that was already half-finished in your folder
(see §5) — not to this change.

## For the next agent (Phase 2: one combined Correct badge — Opus 5.5, medium)

### 1. Goal and scope
Follow "Phase 2" in `docs/speed-trivia-feedback-animations-plan.md` exactly: design preview first
(2–3 options over the bright trivia background + green flash, Andrew picks), then implement in
`components/animations/SpeedTriviaCorrectAnimation.tsx`. Out of scope: emoji rain (done), Live Trivia
and Wrong animations, the "real points number" gap (ask Andrew only if he raises it), Phase 3 checks.

### 2. Starting state
Branch `main`, last commit `2d6211e`. Phase 1 edits are UNCOMMITTED, mixed in the working tree with
unrelated uncommitted trivia-uniqueness work (see `git status`). Nothing pushed/deployed. No data,
migrations or backups involved. `components/trivia/TriviaGame.tsx` already had unrelated uncommitted
edits (the `SelectionInfo` import etc.) — don't revert them; never `git checkout -- <file>`.

### 3. Decisions already made
- Portal the rain to `document.body` rather than just using `fixed` (the game wrapper has a transform
  animation, which would trap a fixed child). Z-index `z-[1100]`, below AnimationOverlay's `z-[1200]`.
- Added a NEW keyframe `tp-rain-drip` and left `tp-rain` alone, because the (dead, always-empty)
  `fireworks` layer in TriviaGame still uses `animate-tp-rain`.
- No commit — plan says commit only if Andrew asks.

### 4. Files changed (Phase 1)
- `components/trivia/TriviaGame.tsx`: `createPortal` import; `RAIN_HIDE_DELAY_MS` replaced by
  `RAIN_HIDE_BUFFER_MS = 150`; `triggerCelebration` now computes the unmount delay as
  max(delayMs+durationMs)+buffer over the actual tokens; `portalReady` state (mount guard for SSR);
  rain layer now `createPortal(<div fixed inset-0 z-[1100] pointer-events-none overflow-hidden>…)`,
  emojis start at `top-[-1.2em]` with class `animate-tp-rain-drip`.
- `app/globals.css`: `@keyframes tp-rain-drip` + `.animate-tp-rain-drip` (opacity stays 1; short
  ease-out hang to 6vh, then ease-in fall to `calc(100dvh + 2.4em)` with a `100vh` fallback line
  before it); class added to BOTH Reduce Motion blocks (animation none, and visibility hidden).

### 5. Facts and traps
- `npm run test`: 4244 pass, 3 fail, 13 skip. All 3 failures are in
  `tests/scripts.speed-trivia-admission.test.ts` (admitted 0 vs expected 1, etc.). That area
  (`lib/speed-trivia-uniqueness/*`) has uncommitted edits from other work; I did not touch it and did
  not check whether it fails on a clean checkout. Ask Andrew / treat as pre-existing before Phase 3.
- Passing: `npx tsc --noEmit`, eslint on TriviaGame.tsx, text-size-floor and haptics contract tests.
- Badge-readability context for Phase 2: behind it are `tp-trivia-bg` plus the 1300ms
  `bg-emerald-500/35` flash in TriviaGame (see plan "Where the code is").
- Don't touch `.env.local`; don't kill Andrew's `next dev` on :3000.

### 6. Verification status
Verified: typecheck, lint, tests above. NOT verified visually — no browser run was done (the portal,
the full-height travel and the 390×844 / 430×932 "exits past the bottom" criterion still need a look,
ideally by Andrew on a phone in Phase 3; headless can't judge PWA chrome). `npm run build` and
`npm run test:pwa-contract` not run.

### 7. Open questions for Andrew
- Does he want the real (multiplier) points number on the badge? (plan "Known gap")
- Treat the 3 admission-test failures as someone else's in-flight work?

### 8. First steps for Phase 2
Read the plan's Phase 2 section and `SpeedTriviaCorrectAnimation.tsx`; build the preview page in the
scratchpad (or private Artifact); show Andrew; implement the chosen option; keep registry key
`SPEED_TRIVIA_CORRECT`, `pointsLabel` prop and ~1400ms duration; write the Phase 2 handoff note.
