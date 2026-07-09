# Category Blitz "no grading" — observability-first phased plan

## Why this plan exists

Two full rounds of fixes have now landed against this symptom (5 phases in
`docs/category-blitz-no-grading-analysis.md`, then a second-opinion review of
a follow-up plan in `docs/category-blitz-fix-plan.md`), and the user reports
the exact same symptom persists in solo dev-server play: submit answers,
round timer expires, nothing gets graded — no reveal, no cascade, no
leaderboard.

Both prior rounds of work were produced by **reading the code and reasoning
about plausible race conditions**, not by watching the actual failure happen.
That's the real gap. The second-opinion review of `category-blitz-fix-plan.md`
found: one genuinely valid, previously-unaddressed bug (silent error
swallowing); several proposed fixes that duplicate protection already shipped
in the 5-phase work without the author recognizing it; and one claim that's
factually wrong about the current code (see
`docs/category-blitz-fix-plan.md` Fix 2.3 vs. `CategoryBlitzGame.tsx:1001-1010`
— `markRevealDone` **is** wired to the hook; the report claims it isn't).

**This plan inverts the approach.** Phase 1 ships the small number of
genuinely good, low-risk, zero-downside items from that review. Phase 2 is
not a code fix at all — it's forcing a live, observed reproduction of the
actual failure, with real logging in place, so the next fix (Phase 3) is
aimed at a *confirmed* cause instead of another plausible-sounding theory.

---

## Phase 1 — Cheap, safe, unconditionally worth doing

None of these are guaranteed to fix the reported symptom. All three are real
gaps or missing basics that should exist regardless of what Phase 2 finds,
and Fix 1.3 doubles as the instrumentation Phase 2 depends on.

### Fix 1.1 — Stop swallowing the error in `scoreExpiredRoundForVenue`

**File:** `lib/categoryBlitz.ts:480-496`

Currently:
```ts
const { data } = await supabaseAdmin!
  .from("category_blitz_rounds")
  .select("id")
  .eq("venue_id", venueId)
  .eq("status", "active")
  .lt("ends_at", cutoff.toISOString())
  .maybeSingle<{ id: string }>();

if (data) {
  await scoreRound(data.id).catch((err) => { /* logs */ });
}
```

`error` is discarded. If this specific query ever fails (RLS mismatch, a
transient blip, a schema drift), `data` is `null`, the `if (data)` guard
skips, and the function returns as if there were simply no expired round —
completely indistinguishable from the happy "nothing to do" path. Given this
function is the server-side self-healing safety net that Phases 1/2 of the
prior work made the *primary* recovery path for solo/dev play, a silent
failure here is a silent failure of the whole recovery mechanism.

**Fix:** destructure `error` too; log and return early if present.

**Model / effort:** Sonnet, trivial. One function, no design decisions.

---

### Fix 1.2 — Document `CATEGORY_BLITZ_ALLOW_SOLO_SCORING` in `.env.example`

**File:** `.env.example`

This env var is required for a solo tester to see real grading (bypasses the
`<3-player` gate in `scoreRound()`) but isn't documented anywhere a new
environment setup would surface it. Add it with a one-line comment.

**Model / effort:** Sonnet, trivial.

---

### Fix 1.3 — Structured logging at the actual decision points

**Files:** `lib/categoryBlitz.ts`, `lib/categoryBlitzRealtime.ts`

This is the one that matters most for what comes next. Right now, tracing a
failed round through the system requires re-deriving the entire state
machine from source on every debugging pass — which is exactly how both
prior rounds of "fixes" ended up guessing instead of observing. Add
`console.debug`/`console.warn` (dev-only is fine — this game doesn't run in
production traffic-sensitive contexts yet) at minimum:

- `scoreExpiredRoundForVenue`: found no expired round / found one and
  scoring it / query errored (ties into Fix 1.1) / `scoreRound` threw.
- `scoreRound`: entered, which branch (already complete / already
  scoring-locked-by-someone-else / claimed the lock / expiry-guard rejected
  it / insufficient players / graded and completed).
- `driveVenueCategoryBlitz`: which branch it took (stale session closed /
  idle session closed / no session + no schedule / created new session /
  advanced existing session's round / no-op) and the venue's session status
  going in and out.
- `lib/categoryBlitzRealtime.ts`: whenever `revealDoneRef` is set and by
  which path (normal `onDone` vs. Phase 2's `forceReveal` vs. Phase 5's
  elapsed-time fallback), whenever the scoring gate's condition is evaluated
  and which sub-condition is false, whenever `triggerScoringRef` actually
  fires a `POST /score` and what it got back.

Keep it behind a single toggle (e.g. a `debug` param already present in the
codebase's conventions, or simplest: gate on `process.env.NODE_ENV !==
"production"`) so it's free to leave in.

**Why this belongs in Phase 1, not Phase 3:** Phase 2 below is only useful if
we can actually see what's happening. Without this, "watch it fail in a
browser" still means squinting at application state through React DevTools
and guessing which of a dozen refs is the blocker. With it, the terminal and
browser console will just say what happened.

**Model / effort:** Sonnet, low-medium. Mechanical, but touches several
functions across two files — budget a careful sweep, not a five-minute patch.

---

## Phase 2 — Get a real, observed reproduction (not a code change)

**This phase does not write a fix.** Its only deliverable is a confirmed,
observed answer to: *what actually happens, step by step, when this fails?*

Everything after this point should cite this phase's findings by file:line
and log line, not "plausibly."

### What to do

1. With Phase 1's logging in place, restart the dev server clean (`rm -rf
   .next` first, to rule out stale-build weirdness — cheap, do it anyway).
2. Drive a real solo round end-to-end in an actual browser with the console
   and network tab open, dev server terminal visible: join the venue → join
   or start a round (test mode toggle is fine, for speed) → submit at least
   one answer → let the timer expire naturally → watch what happens (or
   doesn't) at each phase transition.
3. In parallel, query `category_blitz_sessions` / `category_blitz_rounds`
   directly for that venue (server-only script or Supabase SQL editor) to
   see ground-truth DB state at each step, not just what the UI claims.
4. Before the "clean" repro above, also check for **stale pre-existing
   state**: a session/round left over from before any of these fixes landed,
   sitting in some state the new code was never designed to recover from.
   Clear it and retest clean before concluding anything.
5. Capture: does `phase` (client) ever leave `"answering"`? Does `POST
   /api/category-blitz/rounds/[id]/score` ever fire, and what does it
   return? Does `category_blitz_rounds.status` in the DB ever reach
   `"complete"` regardless of what the UI shows? Any errors — server
   console, browser console, network tab — at any point, even ones that look
   unrelated.

### Why this is its own phase and not folded into Phase 3

Because the prior two rounds of work (5 phases + the reviewed follow-up
plan) were both written *without* this step, and both produced plausible,
partially-overlapping, and in one case factually incorrect fixes for a
problem neither had actually watched happen. Skipping straight to more code
changes a third time has no reason to work better than the first two times.

**Model / effort:** Sonnet, medium-high. Not because any single step is hard,
but because this requires methodical multi-tool orchestration (dev server,
browser automation or manual walkthrough, DB queries, log correlation) and
good judgment about what's signal vs. noise in the output — worth having a
careful, unhurried pass rather than rushing to a conclusion from the first
promising-looking log line.

---

## Phase 3 — Fix the confirmed cause

**Cannot be scoped in detail until Phase 2 completes** — that's the point.
Once Phase 2 identifies the actual failure point, come back and write the
specific fix against it, citing the Phase 2 evidence.

If Phase 2 happens to confirm one of the theories already on the table, these
are pre-vetted (from the review of `docs/category-blitz-fix-plan.md`) and
worth reaching for first rather than re-deriving from scratch:

- If the actual cause turns out to be `scoreExpiredRoundForVenue` genuinely
  failing its query on this environment (not just theoretically, per Fix
  1.1) — the logging from Phase 1 will show the real Postgres error message,
  which will point at the actual fix directly (RLS policy, missing
  permission, etc.) rather than requiring more guessing.
- **Do not** reach for `docs/category-blitz-fix-plan.md`'s Fix 1.3
  (revealDoneRef timeout in the scoring loop) — this duplicates
  `CategoryBlitzGame.tsx:1001-1010` (Phase 5 of the original 5-phase work),
  which already force-completes the reveal gate ~3s into any round via a
  path independent of tab visibility. If Phase 2 shows this specific gate is
  still the blocker, the bug is in *why that already-shipped effect isn't
  firing*, not in "add a second one."
- **Do not** reach for Fix 2.3's rationale as written (it incorrectly claims
  `markRevealDone` isn't wired to the hook — it is, see above). If reveal
  timing in test mode is genuinely still an issue, look at
  `ROUND_START_REVEAL_MAX_MS`'s actual 3000ms value against what Phase 2
  observed the real elapsed time to be, not the theoretical percentage math
  in that doc.

**Model / effort:** Cannot be assigned yet — depends entirely on what Phase 2
finds. Note this explicitly when picking it up rather than defaulting to a
guess; if the confirmed cause turns out to be a single clear bug (most
likely, given how narrow the symptom is), Sonnet at low-medium effort is
probably still right. Only escalate to a higher-effort or different model if
Phase 2's findings point at something architectural (e.g., a genuine
redesign of the scoring trigger mechanism) rather than a discrete bug.

---

## Explicitly deprioritized (from the reviewed follow-up plan)

Not forbidden, just not worth doing blind. Revisit only if Phase 2's findings
specifically implicate one of these:

| Item | Why deprioritized |
|---|---|
| Fix 1.2 (forceReveal on `ends_at` expiry, not just non-`"active"` status) | Phase 5's elapsed-time check already sets `revealDoneRef` ~3s into any round, independent of status/expiry — this becomes redundant in the common case. |
| Fix 1.3 (revealDoneRef timeout in the scoring loop) | Duplicates the already-shipped `CategoryBlitzGame.tsx:1001-1010` effect from Phase 5 of the original work. |
| Fix 2.1 (propagate a scoring-attempted boolean through `driveVenueCategoryBlitz`) | Reasonable but the proposed behavior change is vague ("log if it failed... proceed anyway") — Phase 1's logging gets the same visibility more directly. |
| Fix 2.2 (chained `setTimeout` instead of `setInterval` for the poll) | Largely redundant with the existing `visibilitychange` immediate-resync handler, which is a stronger guarantee for the "user comes back to the tab" case this was aimed at. |
| Fix 2.3 (test-mode-aware `ROUND_START_REVEAL_MAX_MS`) | Its stated second rationale is factually wrong about the current code (see above); its first rationale conflates a stall-recovery ceiling with the animation's actual (fixed, ~1.46s) duration. |
| Fix 3.2 (simulation script exercises the HTTP `/score` path, not just the direct function call) | Genuinely good idea, but it's test-infrastructure hardening, not a fix — do it after the actual bug is found and fixed, as a regression guard, not before. |

---

## Summary

| Phase | What | Model | Effort |
|---|---|---|---|
| 1 | Fix 1.1 (stop swallowing the error) + Fix 1.2 (.env.example) + Fix 1.3 (structured logging) | Sonnet | Low — trivial for 1.1/1.2, low-medium for 1.3's logging sweep |
| 2 | Live, observed reproduction with Phase 1's logging active — no code fix, just evidence | Sonnet | Medium-high — methodical multi-tool investigation, not a quick pass |
| 3 | Fix the confirmed cause from Phase 2 | TBD | Cannot be scoped until Phase 2 completes |

Phase 1 should ship first regardless. Phase 2 must happen before Phase 3 is
written — do not let Phase 3 get drafted from theory again.
