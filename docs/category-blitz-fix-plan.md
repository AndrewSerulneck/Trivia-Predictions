# Category Blitz — Phased Fix Plan

## Overview

Six issues were identified during codebase investigation. This plan organizes them into three phases, ordered by impact and dependency. Each phase can be reviewed, tested, and deployed independently.

---

## Phase 1: Unblock Solo Play (Critical — Fixes the Primary Symptom)

These fixes directly address the "nothing gets graded" failure in solo play. Without these, the game cannot function for a single player.

---

### Fix 1.1: `scoreExpiredRoundForVenue` — Fix Silent Error Swallowing

**File:** [`lib/categoryBlitz.ts:480-496`](lib/categoryBlitz.ts:480)

**The Problem:**

The function destructures only `{ data }` from the Supabase query, completely ignoring `error`. When the query fails (e.g., due to a stale session, RLS policy mismatch, or transient network error), `data` is `null`, the `if (data)` guard skips, and the function returns silently. No scoring ever happens, no error is logged, and the caller (`driveVenueCategoryBlitz`) has no way to know.

```typescript
// CURRENT (buggy):
const { data } = await supabaseAdmin!
  .from("category_blitz_rounds")
  .select("id")
  .eq("venue_id", venueId)
  .eq("status", "active")
  .lt("ends_at", cutoff.toISOString())
  .maybeSingle<{ id: string }>();
if (data) {
  await scoreRound(data.id).catch(/* ... */);
}
// If error, data=null, silently no-op
```

**The Fix:**

1. Destructure both `data` and `error`.
2. If `error` is truthy, log a warning and return — so the caller knows we attempted but failed.
3. Keep the `if (data)` guard for the happy path.

```typescript
// FIXED:
const { data, error } = await supabaseAdmin!
  .from("category_blitz_rounds")
  .select("id")
  .eq("venue_id", venueId)
  .eq("status", "active")
  .lt("ends_at", cutoff.toISOString())
  .maybeSingle<{ id: string }>();
if (error) {
  console.warn(`[scoreExpiredRoundForVenue] query failed for venue ${venueId}:`, error.message);
  return;
}
if (data) {
  await scoreRound(data.id).catch(/* ... */);
}
```

---

### Fix 1.2: `forceReveal` Guard — Allow Solo Rounds Past Expiry

**File:** [`lib/categoryBlitzRealtime.ts:275-349`](lib/categoryBlitzRealtime.ts:275) (specifically lines ~307-319)

**The Problem:**

The `forceReveal` guard only fires when `r.status !== "active"`. In solo play, when a player backgrounds the tab and comes back, the round is still in `"active"` status (because scoring never ran — see Fix 1.1). Even after Fix 1.1, there's a race: the round transitions from `active` → `scoring` → `scored` asynchronously, but the client's polling might see `status === "active"` with `ends_at` in the past, and the `forceReveal` path won't fire because the status check fails.

```typescript
// CURRENT:
} else if (opts?.forceReveal && r.status !== "active" && revealDoneRef.current !== r.id) {
  revealDoneRef.current = r.id;
}
```

**The Fix:**

Change the guard to also allow `forceReveal` when the round is past its `ends_at` time, regardless of status. This creates a deadline-based escape hatch.

```typescript
// FIXED:
const isExpired = r.ends_at && new Date(r.ends_at).getTime() < Date.now();
} else if (opts?.forceReveal && (r.status !== "active" || isExpired) && revealDoneRef.current !== r.id) {
  revealDoneRef.current = r.id;
}
```

This ensures that even if the round is technically still `"active"` in the database (because scoring is mid-flight or hasn't started), the client can proceed if the deadline has passed.

---

### Fix 1.3: Add Deadline-Based Timeout for `revealDoneRef`

**File:** [`lib/categoryBlitzRealtime.ts:547-590`](lib/categoryBlitzRealtime.ts:547)

**The Problem:**

The scoring trigger loop (lines 548-587) waits for `revealDoneRef.current === currentRoundIdRef.current` before calling `POST /score`. There is no timeout. If the reveal animation never completes (e.g., component unmounts, layoutId morph glitches, or the user navigates away during the reveal), this ref is never set, and scoring is permanently blocked. The round sits in limbo forever.

```typescript
// CURRENT (simplified):
if (needsScoring && revealDoneRef.current === currentRoundIdRef.current) {
  await triggerScoringRef.current(roundId);
}
```

**The Fix:**

Add a maximum wait duration (e.g., 10 seconds) after which scoring proceeds regardless of `revealDoneRef`. Use a timestamp captured when the loop starts waiting.

```typescript
// FIXED (conceptual):
const revealWaitStartedAt = useRef<number>(0);
const REVEAL_WAIT_TIMEOUT_MS = 10_000;

// In the scoring loop:
if (needsScoring) {
  if (revealDoneRef.current === currentRoundIdRef.current) {
    revealWaitStartedAt.current = 0; // reset
    await triggerScoringRef.current(roundId);
  } else if (!revealWaitStartedAt.current) {
    revealWaitStartedAt.current = Date.now();
  } else if (Date.now() - revealWaitStartedAt.current > REVEAL_WAIT_TIMEOUT_MS) {
    // Timeout exceeded — proceed anyway
    revealWaitStartedAt.current = 0;
    console.warn(`[categoryBlitz] revealDone timeout — forcing scoring for round ${roundId}`);
    await triggerScoringRef.current(roundId);
  }
}
```

---

## Phase 2: Robustness & Race Condition Hardening (Medium Priority)

These fixes address scenarios where Phase 1 fixes could still fail under edge cases, or where the system silently degrades.

---

### Fix 2.1: `driveVenueCategoryBlitz` — Verify Scoring Occurred

**File:** [`lib/categoryBlitz.ts:536-617`](lib/categoryBlitz.ts:536)

**The Problem:**

`driveVenueCategoryBlitz` calls `scoreExpiredRoundForVenue` as a fire-and-forget with no return value check. If scoring failed (even after Fix 1.1), the function proceeds to advance the session state as if scoring succeeded. This can result in a session that's moved past the expired round but with no scores recorded.

```typescript
// CURRENT (simplified):
await scoreExpiredRoundForVenue(venueId, now);
// No check — unconditionally proceeds to next phase
```

**The Fix:**

1. Make `scoreExpiredRoundForVenue` return a `boolean` indicating whether scoring was attempted/needed.
2. In `driveVenueCategoryBlitz`, check this return value and only advance session state if scoring either succeeded or wasn't needed.

```typescript
// FIXED:
async function scoreExpiredRoundForVenue(venueId: string, now: Date): Promise<boolean> {
  // ... existing logic ...
  if (error) return false;
  if (data) {
    await scoreRound(data.id).catch(/* ... */);
    return true; // scoring was attempted
  }
  return false; // no round needed scoring
}

// In driveVenueCategoryBlitz:
const scored = await scoreExpiredRoundForVenue(venueId, now);
if (!scored) {
  // Only advance if no scoring was needed, or log if it failed
  // ... proceed with advancement logic ...
}
```

---

### Fix 2.2: Background Tab `setInterval` Throttling

**File:** [`lib/categoryBlitzRealtime.ts:652-671`](lib/categoryBlitzRealtime.ts:652)

**The Problem:**

Modern browsers throttle `setInterval` to ~1 execution per minute when the tab is backgrounded. The current 15-second poll interval becomes effectively useless after ~30 seconds of backgrounding. If a user switches tabs during answering, the client won't detect the round transition for up to 60 seconds.

```typescript
// CURRENT:
const poll = setInterval(async () => {
  await loadSession({ forceReveal: true });
}, POLL_INTERVAL_MS); // 15,000ms
```

**The Fix:**

Replace `setInterval` with a mechanism that uses `visibilitychange` events to immediately poll when the tab becomes visible again. Optionally, use `setTimeout` chaining with a `document.hidden` check to avoid throttling.

```typescript
// FIXED (conceptual):
const poll = () => {
  const timer = setTimeout(async () => {
    await loadSession({ forceReveal: true });
    poll(); // chain instead of interval
  }, document.hidden ? POLL_INTERVAL_MS : POLL_INTERVAL_MS);
  
  cleanupRef.current = () => clearTimeout(timer);
};
poll();

// On visibility change (existing handler, line 684-692):
const onVisibilityChange = (): void => {
  if (document.visibilityState === "visible") {
    loadSession({ forceReveal: true }); // immediate poll on return
  }
};
```

The key change is using chained `setTimeout` instead of `setInterval` (harder for browsers to throttle) AND ensuring `visibilitychange` triggers an immediate poll.

---

### Fix 2.3: `ROUND_START_REVEAL_MAX_MS` in Test Mode

**File:** [`components/category-blitz/CategoryBlitzGame.tsx:984-1010`](components/category-blitz/CategoryBlitzGame.tsx:984) and [`components/category-blitz/RoundStartReveal.tsx:1-158`](components/category-blitz/RoundStartReveal.tsx:1)

**The Problem:**

`ROUND_START_REVEAL_MAX_MS` is hardcoded to 3,000ms. In test mode (10-second rounds), a 3-second reveal consumes 30% of the round duration. The animation might also not complete within 3 seconds if there are many categories, causing the auto-dismiss to race the animation.

Additionally, the hook's `revealDoneRef` gate and the component's auto-dismiss timer are independent — meaning the component might auto-dismiss (clearing the reveal UI) but the hook never gets `markRevealDone` called if the callback path is different.

```typescript
// CURRENT — in CategoryBlitzGame.tsx:
const ROUND_START_REVEAL_MAX_MS = 3000; // hardcoded
```

**The Fix:**

1. Export `ROUND_START_REVEAL_MAX_MS` from a shared location and make it configurable based on test mode.
2. In test mode, reduce to ~1,500ms.
3. Ensure the auto-dismiss timer calls `markRevealDone` on the hook, not just the component's local state.

```typescript
// FIXED — in categoryBlitzShared.ts:
export const ROUND_START_REVEAL_MAX_MS = (testMode: boolean): number =>
  testMode ? 1500 : 3000;
```

---

## Phase 3: Developer Experience & Observability (Lower Priority)

These fixes won't change behavior for end users but will prevent future regressions and make debugging easier.

---

### Fix 3.1: Document `CATEGORY_BLITZ_ALLOW_SOLO_SCORING` in `.env.example`

**File:** [`.env.example`](.env.example)

**The Problem:**

The env var `CATEGORY_BLITZ_ALLOW_SOLO_SCORING` is required for solo play but is not listed in `.env.example`. Any developer setting up a new environment won't know it exists, and solo play will silently fail.

**The Fix:**

Add the missing env var with a clear comment.

```env
# Category Blitz
NEXT_PUBLIC_CATEGORY_BLITZ_TEST_MODE=false
CATEGORY_BLITZ_ALLOW_SOLO_SCORING=true  # Required for solo play (< 3 players)
```

---

### Fix 3.2: Update Simulation Script to Test Browser Path

**File:** [`scripts/simulate-category-blitz.cjs`](scripts/simulate-category-blitz.cjs)

**The Problem:**

The simulation script calls `engine.scoreRound()` directly, bypassing the entire `revealDoneRef` → `POST /score` browser chain. It never tests the path that's actually failing in production. A passing simulation gives false confidence.

**The Fix:**

Add a test mode to the simulation that exercises the HTTP API path (calling `POST /api/category-blitz/rounds/[id]/score`) instead of the direct function call. This would catch issues like the ones in Phase 1.

---

### Fix 3.3: Add Logging for Solo Play Debugging

**File:** [`lib/categoryBlitzRealtime.ts`](lib/categoryBlitzRealtime.ts) and [`lib/categoryBlitz.ts`](lib/categoryBlitz.ts)

**The Problem:**

There is very little logging throughout the scoring and phase transition code. When something goes wrong, developers have to read the full codebase to understand what happened. Adding structured logging would make future debugging much faster.

**The Fix:**

Add `console.debug` / `console.warn` calls at key decision points:
- When `scoreExpiredRoundForVenue` finds no expired round (or fails)
- When `revealDoneRef` is toggled and why
- When scoring trigger fires with the round ID
- When a phase transition is gated by a condition check
- When the `forceReveal` path fires

These should be wrapped in a helper to make them easy to disable in production.

---

## Summary Table

| Fix | File | Priority | Complexity | Risk |
|-----|------|----------|------------|------|
| 1.1 — Error swallowing | `lib/categoryBlitz.ts:480-496` | Critical | Low | None |
| 1.2 — forceReveal guard | `lib/categoryBlitzRealtime.ts:307-319` | Critical | Low | Low |
| 1.3 — revealDoneRef timeout | `lib/categoryBlitzRealtime.ts:547-590` | Critical | Medium | Low |
| 2.1 — Verify scoring happened | `lib/categoryBlitz.ts:536-617` | Medium | Low | Low |
| 2.2 — Background tab polling | `lib/categoryBlitzRealtime.ts:652-671` | Medium | Medium | Low |
| 2.3 — Reveal timing in test mode | `CategoryBlitzGame.tsx:984` / `RoundStartReveal.tsx` | Medium | Low | Low |
| 3.1 — Document env var | `.env.example` | Low | Trivial | None |
| 3.2 — Simulate browser path | `scripts/simulate-category-blitz.cjs` | Low | Medium | None |
| 3.3 — Add logging | Multiple files | Low | Low | None |

---

## Execution Order

```
Phase 1 (Critical) ──► Phase 2 (Medium) ──► Phase 3 (Low)
     │                      │                      │
     ├─ Fix 1.1             ├─ Fix 2.1             ├─ Fix 3.1
     ├─ Fix 1.2             ├─ Fix 2.2             ├─ Fix 3.2
     └─ Fix 1.3             └─ Fix 2.3             └─ Fix 3.3
```

Each phase should be tested independently before moving to the next. Phase 1 alone should resolve the primary "nothing gets graded" symptom in solo play.
