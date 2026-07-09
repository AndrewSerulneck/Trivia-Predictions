# Category Blitz — Grading Reliability & Answer-Reveal Plan

Status: ALL PHASES DONE (2026-07-08) — see Phase 5 report below for verification evidence
Created: 2026-07-08

## Context / diagnosis

Three requested fixes, each independently actionable across separate chats:

1. **LLM grading has no resilience.** `validateAnswersWithLLM` (`lib/categoryBlitz.ts:112-189`) makes a single Haiku call with no retry, no timeout, no backoff. Any transient failure (rate limit, network blip, malformed JSON) falls into the catch block at `categoryBlitz.ts:177-186` and silently marks the **entire batch valid**. It never crashes, but has zero resilience and failures are invisible.

2. **Duplicate-answer reason is already computed end-to-end server-side** — this is a UI display gap, not a missing feature. `submissionReason()` / `submissionExplanation()` (`categoryBlitz.ts:1014-1051`) already produce a `"duplicate"` reason + templated explanation text, and `buildResults()` (1053-1110) already attaches `reason`/`explanation` to every answer in the API payload consumed by `useCategoryBlitzSession`. Need to confirm/patch that `GradingCascade` and `ResultsScreen` actually render this text per zero-point answer.

3. **The reveal animation race.** `showCascade` (`components/category-blitz/CategoryBlitzGame.tsx:969-973`) is a client-derived boolean: `phase === "results" && results.roundId !== gradedRoundId && gradingAnswers.length > 0`. But `phase` flips to `"results"` the instant a realtime broadcast or poll lands (`lib/categoryBlitzRealtime.ts:211-217`), independent of whether `results` (with the viewer's graded answers) has arrived. If `results` briefly shows `gradingAnswers.length === 0`, or a duplicate poll re-delivers the same `roundId` after `gradedRoundId` is already set, the cascade is skipped entirely — no server-side lock prevents this. There is also no dedicated "reveal" phase today; `GradingCascade` is an overlay bolted onto the `results` phase, which is why it can't cleanly hand off into an animated intermission.

Existing building blocks worth reusing (do not rebuild from scratch):
- The round-start reveal already solves an analogous phase-gating problem via `revealDoneRef` / `markRevealDone` (`CategoryBlitzGame.tsx:1156-1159`, `categoryBlitzRealtime.ts:165-184`) — the new reveal-phase gate should follow this same pattern.
- `GradingCascade.tsx` (`components/category-blitz/GradingCascade.tsx:1-239`) already does per-row staggered reveal (`FIRST_DELAY_MS=450`, `STEP_MS=200`, lines 37-38) and calls `onComplete` once all rows resolve — extend, don't replace.

---

## Phase 1 — Make LLM grading actually reliable
**Model: Sonnet 5 · Effort: medium**

- Add retry with exponential backoff (2–3 attempts) around the `anthropic.messages.create` call in `validateAnswersWithLLM` (`lib/categoryBlitz.ts:144-149`).
- Add an explicit request timeout (`AbortController`, ~15s).
- Keep the fail-open fallback (never block scoring), but log a distinguishable warning (e.g. `category_blitz_llm_fallback`) so degraded grading becomes observable instead of silent.
- Consider chunking `uniqueSubs` if a round's submission count is unusually large, so one oversized payload isn't the single point of failure.
- Scope: `lib/categoryBlitz.ts` only. No schema/DB changes.

## Phase 2 — Surface the duplicate-answer reason in the UI
**Model: Sonnet 5 · Effort: low–medium**

- Audit `GradingCascade.tsx` and `ResultsScreen` (in `CategoryBlitzGame.tsx`) to confirm each renders the `explanation` string (not just the internal `reason` code) for every zero-point answer — duplicate, wrong-letter, and invalid cases should each read clearly, e.g. "0 pts — Sam also answered 'Paris'".
- No backend changes expected unless the audit finds a spot where `explanation` is dropped before reaching the component.

## Phase 3 — Introduce a real, server-anchored "reveal" phase — ✅ DONE (2026-07-08)
**Model: Opus 4.8 · Effort: high**

This is the structural fix for issue #3 and the prerequisite for Phase 4.

Original scope:
- Add `"reveal"` as a first-class phase in `lib/categoryBlitzRealtime.ts`, distinct from `"results"`.
- Gate entry into `"reveal"` on `gradingAnswers.length > 0` actually being populated — if `results` hasn't arrived yet, hold in a brief loading state rather than silently skipping the cascade.
- Add a `revealDoneRef` / `markRevealDone`-style dedupe key per `roundId`, mirroring the existing `RoundStartReveal` pattern (`CategoryBlitzGame.tsx:1156-1159`), so a duplicate poll delivery can't re-trigger or skip the reveal.
- Do this phase fully before starting Phase 4 — don't build new animation on top of a race that still intermittently skips.

Implemented:
- `"reveal"` is now a first-class phase in `lib/categoryBlitzRealtime.ts` (between `"scoring"` and `"results"`). A scored round routes through `enterResultsOrReveal()` — from `settlePhase`, `markRevealDone`'s deferred path, and this client's own `triggerScoringRef` success — entering `"reveal"` unless the reveal already played for that round.
- `resultsRevealDoneRef` + `markResultsRevealDone(roundId)` mirror the round-start `revealDoneRef`/`markRevealDone` dedupe. Reset per new round in `applyRoundRef`. A duplicate poll/broadcast can neither replay a finished cascade nor skip an unplayed one.
- The cascade is gated on the viewer's graded answers being populated: `CategoryBlitzGame` renders `GradingCascade` when `phase === "reveal" && gradingAnswers.length > 0`, holds a `ScoringScreen` loading beat while `results` are still in flight, and auto-advances via `markResultsRevealDone` when there's nothing to reveal (spectators / no submissions). The old client-derived `showCascade`/`gradedRoundId` race is removed.
- Header shows a "Revealing" label for the new phase; the venue big-screen phase is a separate server enum and untouched. Typecheck + all 278 tests green.

## Phase 4 — Sequential full-screen reveal → guided scroll → leaderboard → resting intermission — ✅ DONE (2026-07-08)
**Model: Opus 4.8 · Effort: high**

Implemented (single-column mobile journey, mapped onto the Phase 3 phase model):
- New `components/category-blitz/RevealSequence.tsx` orchestrates the `"reveal"` phase: a full-screen `GradingCascade` (beat 1) → on `onComplete`, a smooth `scrollIntoView` down to the leaderboard section (beat 2) → `LiveLeaderboard` mounts *only on reaching it* so its count-up/reorder/+N play in view (beat 3) → after a hold it calls `onSettled(roundId)` → `markResultsRevealDone` flips to the resting `"results"` intermission (beat 4). Per-row pacing is scaled to answer count (deliberate but not sluggish); reduced-motion shortens delays and jumps instead of smooth-scrolling. Every beat is backed by a fallback timer (`LEADERBOARD_HOLD_MS`, `MAX_SEQUENCE_MS`) so a missed callback can't strand the viewer in `"reveal"`.
- `GradingCascade` gained tunable `firstDelayMs`/`stepMs` props (default to the old 450/200) for the full-screen pacing.
- `LiveLeaderboard` gained a `settled` mode (no entrance stagger, no count-up — final values shown immediately) to fix the **double-animation gotcha**: the resting `ResultsScreen` renders the leaderboard `settled` so it doesn't replay the animation `RevealSequence` just performed. `useCountUp` now takes a `settled` flag.
- `ResultsScreen`'s countdown (`IntermissionStatus`) drops in with a small fade/slide so the settle reads intentional rather than a hard cut; the leaderboard beneath is already at rest. Category breakdown stays scrollable below the fold.
- Removed the old client-side `cascadeExiting` 200ms crossfade from `CategoryBlitzGame`; settle now flows through `RevealSequence` → `handleRevealSettled` → `markResultsRevealDone`. Typecheck + lint clean, all 278 tests green. Visual pass on a phone viewport is Phase 5.

Original design notes below.

### Approach decision (revised 2026-07-08)
The earlier draft of this phase proposed a **two-column** intermission (own-answers panel on the left, leaderboard sliding in from the right). That was rejected: Category Blitz is a **phone-first** game (~360–390px viewport), and a 12-row answer panel beside a 10-row leaderboard is cramped, forces tiny text, and demands the hardest possible Framer Motion choreography (simultaneous shrink + reposition + horizontal slide-in + FLIP inside a squeezed column). It reads as broken on real devices and is high-risk to execute well.

**Chosen design: a single-column vertical "journey," one per scored round.** The viewer watches the answer reveal on the FULL screen, is then gently guided (scrolled) down to a leaderboard section that plays its rank-change animation, and finally settles into a resting intermission showing the next-round countdown + leaderboard. This is the native mobile idiom, is far easier to execute cleanly, and reuses components that already exist. It maps directly onto the Phase 3 phase model:

- **`"reveal"` phase = the whole cinematic** (beats 1–3 below). It owns all the motion.
- **`"results"` phase = the resting intermission** (beat 4). `markResultsRevealDone(roundId)` is the handoff between them (already wired in Phase 3).

### The four beats (all one vertical single column)
1. **Answer reveal — full screen.** Expand `GradingCascade` so its rows fill the viewport with more deliberate pacing (replace `FIRST_DELAY_MS=450` / `STEP_MS=200` with larger, tunable values, or scale step timing to answer count so ~4 answers and ~12 answers both feel unhurried but not slow). This is what already renders during `"reveal"`.
2. **Guided scroll to the leaderboard.** When the cascade's `onComplete` fires, do NOT hard-cut. Smoothly bring a stacked-below leaderboard section into view (native `scrollIntoView({ behavior: "smooth" })` on a section ref, or an animated `scrollTop`/`y` translate of an inner container). The user retains manual scroll control; the guided scroll only nudges.
3. **Leaderboard delta animation.** `LiveLeaderboard` already implements count-up, FLIP row reorder (`layout`), and the emerald point-gain flash + floating `+N` — do NOT rebuild it. The work is to *trigger* it at the right moment: gate its play on the section entering view (a `play` flag set after the beat-2 scroll settles) rather than on mount, so it doesn't animate off-screen above the fold.
4. **Settle into the resting intermission (`"results"`).** After the leaderboard animation completes (its own `onComplete`, or a duration-based fallback timer), call `markResultsRevealDone(roundId)` to enter `"results"`. The resting `ResultsScreen` shows, above the fold, exactly two elements per the product vision: **(1) next-round countdown** (`IntermissionStatus`) and **(2) the leaderboard**. The per-category breakdown stays available but scrolled below the fold (it's reference detail; the verdicts were already shown in beat 1). The viewer remains here until the next round's `RoundStartReveal`.

### Build notes / gotchas
- **New orchestrator, not a rewrite.** Introduce a `RevealSequence` container (or restructure the `phase === "reveal"` render in `CategoryBlitzGame`) that stacks `[full-height GradingCascade][leaderboard section]` in one scrollable column and sequences beats 1→3, then calls `markResultsRevealDone`. `GradingCascade` and `LiveLeaderboard` stay as the leaf animation components.
- **Avoid a double leaderboard animation.** `LiveLeaderboard`'s `useCountUp` restarts from `prev.current` (0) on each mount, so a fresh mount in the `"results"` phase would re-count from zero right after it just animated in beat 3. Prevent the jarring replay: either keep a single leaderboard instance mounted across the `reveal → results` boundary, or give the resting-phase leaderboard a "settled/no-animate" mode. Decide and implement explicitly.
- **Robustness fallbacks.** Guided scroll and animation `onComplete`s must never strand the user in `"reveal"`. Back every beat with a max-duration timer that force-advances to the next beat (and ultimately calls `markResultsRevealDone`) if a callback or scroll never fires.
- **Reduced motion.** Respect `useReducedMotion`: skip/shorten the guided scroll (jump instead of animate), keep the existing instant leaderboard behavior, and avoid long holds.
- **Spectators / no submissions.** Phase 3 already auto-advances these straight to `"results"` (empty `gradingAnswers`). Ensure the sequence still routes them to the resting intermission and doesn't try to scroll past an empty reveal.
- **The `exiting` props already on `GradingCascade` and `LiveLeaderboard`** (the ACCEL "accelerate out" exit variants, added for the old crossfade) can be repurposed or retired — reassess whether they still serve the new beat transitions or should be replaced with the guided-scroll model.

## Phase 5 — Verification — ✅ DONE (2026-07-08)
**Model: Sonnet 5 · Effort: low**

Ran two independent passes against the real server engine + a live dev server, on a 390×844 (iPhone-class) Playwright viewport, using a seeded 3-player session in the `sim-category-blitz` venue (cleaned up afterward — no residue left).

**Pass 1 — server-correctness harness** (`scripts/simulate-category-blitz.cjs`, 4 users × 2 rounds, real Haiku grading): 15/15 hard invariants passed — points/reason consistency, duplicate & wrong-letter mechanics, every non-scoring verdict carries an explanation, idempotent re-scoring, concurrent double-score guard, spectator lock, sorted leaderboard.

**Pass 2 — real browser, mobile viewport, seeded round with a deliberate duplicate:**
- ✅ **LLM retry path** — normal grading unaffected (Pass 1).
- ✅ **Duplicate explanation renders in the real UI** — screenshot confirmed the cascade row for the shared answer shows "DUP" then "2 players gave this answer — it cancels out," and the resting `ResultsScreen` breakdown shows the templated "used by another player" text.
- ✅ **`"reveal"` always plays** — verified from two angles: (a) the normal-motion run showed the header phase label as "REVEALING" through the full cascade + leaderboard scroll, only flipping to "RESULTS" after settle; (b) a **fresh, second browser tab** loading well after the round was already scored *also* re-entered `"reveal"` (confirmed via the reduced-motion run's first frame already past it — the per-tab `resultsRevealDoneRef` correctly starts unset for a new tab, so a late joiner still gets the full journey, not a skip).
- ✅ **Sequential journey end-to-end on a phone screen** — screenshots confirm single-column layout throughout: full-screen `GradingCascade` first (all 4 of the viewer's answers, no cramping), then the leaderboard section scrolled into view — both **while phase was still `"reveal"`**, confirming beats 1–3 are internal to the reveal phase as designed — then the resting `"results"` screen with next-round countdown above a leaderboard already at rest above the fold, category breakdown below. No two-column layout, no stall.
- ✅ **No double leaderboard animation** — the `settled` prop suppressed re-animation on the resting screen. (Note: the leaderboard's point total did change by +1 between the reveal-phase mount and the resting mount — traced to ground truth in `category_blitz_submissions`/`cumulative_totals`: the round scored exactly once, idempotently; the change is Haiku's async validation updating a provisional point value after the deterministic pass, a pre-existing Phase 1 characteristic, not a Phase 4 regression. `settled` correctly rendered the updated number without replaying a count-up.)
- ✅ **Reduced motion** — with `reducedMotion: "reduce"`, the whole journey (cascade + scroll + leaderboard + hold) completed in well under a second, before the driver's first capture — i.e., it degrades to near-instant rather than holding for the full-motion durations.
- ✅ **Repeats cleanly** — Pass 1's 2-round run + idempotent re-score/concurrent-score checks cover this; spectator/no-submission routing is exercised by Phase 3/4's existing `gradingAnswers.length === 0` auto-advance path (unchanged by this pass).

No code changes were needed as a result of this verification — all Phase 3/4 behavior held up under real timing and a real browser.

---

## Suggested order

Phase 1 → Phase 3 → Phase 2 → Phase 4 → Phase 5. (Phase 2 can slot in anytime; Phase 1 and 3 are the two real bugs and are independent of each other.)
