# Phase 4 Handoff — Stale prediction can no longer overwrite a committed address

**Status:** ✅ DONE (code + tests)
**Date:** 2026-08-06
**Model:** Claude Sonnet 5 · Effort: low
**Plan:** `docs/code-review-remediation-plan.md` Phase 4

---

## The bug

`components/admin/useAddressLookup.ts`. `select()` bumped `requestIdRef` (invalidating any
in-flight `loadPredictions` response) but never cleared `debounceRef` — the 300ms
`setTimeout` scheduled by `handleInput()`'s most recent keystroke. `reset()` already cleared
this timer correctly; `select()` was the one path that didn't.

Sequence that broke: user types (schedules debounced predict) → taps a prediction before the
300ms elapses → `select()` commits the address (query/street/city/state/zip + pin) → ~300ms
later the stale timer fires anyway, calls `loadPredictions`, which (since `requestIdRef` had
already moved on) — wait, actually the request-id guard *inside* `loadPredictions` was already
correct (see below), so the real-world failure mode was narrower than the plan's worst case:
the stale timer's fetch would fire and its response would be discarded by the existing guard.
But the *timer itself* firing was still wrong — it triggers an unnecessary predict request and,
more importantly, the plan's stated risk (dropdown reopening over committed data with a stray
tap silently rewriting fields) was the reason to fix the missing `clearTimeout`, matching what
`reset()` already does. Fixed regardless of how narrow the live blast radius turned out to be,
since leaving a stale timer armed after a commit is the actual bug independent of whether every
consequence was reachable.

## Investigation: the `loadPredictions` requestId guard

Plan asked me to check whether `loadPredictions`'s `requestIdRef` guard only covered
`setLoading`, or also `setPredictions`/`setOpen`. Read the full function
(`useAddressLookup.ts:85-126`, unchanged by this phase) — it already guards **both**:

- Line ~105: `if (requestIdRef.current !== requestId) return;` — placed right after the fetch
  resolves and before `setPredictions`/`setOpen(true)` are called on the success path.
- Line ~114: the same check on the catch path, before `setError`/`setPredictions([])`.
- Line ~120: a third check in `finally`, guarding only `setLoading(false)`.

So a stale predict response landing after `select()` bumped `requestIdRef` already could not
call `setPredictions`/`setOpen(true)` — that guard was correct and needed no change. **Only the
missing `clearTimeout` in `select()` was the actual defect.**

## The fix

One line in `components/admin/useAddressLookup.ts`, at the top of `select()`:

```ts
const select = useCallback(
  async (prediction: AddressPrediction): Promise<AddressDetails | null> => {
    if (debounceRef.current) clearTimeout(debounceRef.current);   // <-- added
    const requestId = ++requestIdRef.current;
    setLoading(true);
    ...
```

Mirrors exactly what `reset()` already does (`if (debounceRef.current) clearTimeout(debounceRef.current);`).

## Tests

Extended the existing `tests/admin-mobile.address-lookup-sequencing.test.ts` (did not create a
new file — this hook already had a sequencing-focused test file from an earlier phase, so the
new case belongs there, not in a fresh file) with a third `it()`:

**"does not let a pending debounced predict reopen the dropdown after select() commits"**

- Stubs `fetch` to route by URL: `/details` resolves immediately with committed address data;
  `/predict` returns a promise that **never resolves** (`new Promise(() => {})`), so if the
  stale timer fires and calls it, the test can prove it via `predictFetch` call count without
  needing to race a real resolution.
- `vi.useFakeTimers()`. `handleInput("1200 Main")` schedules the 300ms debounced predict, then
  `select(prediction)` is called *before* advancing timers (simulating the tap landing before
  the debounce elapses).
- Asserts after `select()` resolves: query contains the committed address, dropdown (`open`) is
  `false`.
- `vi.advanceTimersByTime(300)` — past the debounce window. Asserts `predictFetch` was **never
  called** (proves `select()` cancelled the timer) and `open`/`query` are still the committed
  state.

Ran in isolation and as part of the full suite — passes both ways.

## Gate

```
npx tsc --noEmit  → clean
npm run test      → 168 files passed | 1 skipped
                    1452 passed | 13 skipped | 0 failed
```

Baseline going into this phase was 1451 passed (Phase 3's handoff number); this phase added
exactly one new test, landing at 1452 passed / 0 failed. Matches "Done when" bar for a clean
gate.

No lint run — Phase 5 owns `npm run lint`, per every prior phase's convention.

## Files modified

- `components/admin/useAddressLookup.ts` — one-line fix: clear `debounceRef` at the top of
  `select()`.
- `tests/admin-mobile.address-lookup-sequencing.test.ts` — added one regression test (file now
  has 3 tests total, up from 2).

No migrations. No route changes. No device-checklist entry needed (plan correctly called this
one fully unit-testable, unlike Phases 2/3). Nothing committed (per plan: no commit unless
Andrew asks).

---

## Notes for the next phase (Phase 5 — Close-out)

Phase 5 is the last phase in the plan. Everything below is what it needs, cross-referenced
against what Phases 1–3's handoffs already flagged as owed to Phase 5 (see
`docs/code-review-remediation-phase3-handoff.md`'s tail section) — **do not re-derive this list
from scratch, but do verify each item against current file contents before writing anything,
since "the plan said so" is not the same as "the file still says so."**

### 1. Full gate (Phase 5 owns this; no prior phase ran lint)

```
npx tsc --noEmit
npm run lint
npm run test
```

Every phase 0–4 has kept `tsc` and `test` clean incrementally, but **`npm run lint` has not
been run once in this remediation effort** — Phase 5 is the first checkpoint for it. Do not
assume it's clean; run it for real.

### 2. Run-log entries — five findings need to land in two log files

Per Phase 2/3 precedent, `docs/admin-mobile-run-log.md` is the run log for this whole
remediation effort (Phases 0, 2, 3 already point there). `docs/billing-dollar-rate-run-log.md`
is billing-specific (Phase 1 belongs there — it edited `lib/billingCustomPrice.ts`).

Read both docs' current contents before writing — don't assume either log's existing structure
or whether Phases 0-3 already wrote their own entries (their handoffs describe *intent* to log,
not necessarily completed writes; verify by reading, not by trusting the handoff prose).

Phase 4 (this phase) belongs in `docs/admin-mobile-run-log.md` — it touched
`components/admin/useAddressLookup.ts`, which per its own file header comment was "Extracted
from VenuesSection's venue form in admin-mobile Phase 4," i.e. this is admin-mobile-effort code
by lineage even though the bug itself has nothing to do with mobile viewport/touch specifically.
Entry should cover: the missing `clearTimeout` in `select()`, that the `loadPredictions`
requestId guard was already correct (no change needed there — call this out explicitly so a
future reader doesn't go looking for a fix that isn't there), and the new regression test.

### 3. Open device-checklist items — confirm the count is still exactly two

As of Phase 3's handoff, two items are open and only Andrew can close them by hand on real
hardware:

- `docs/admin-mobile-device-checklist.md` — Phase 2's notched-header fix ("admin header title +
  More button fully tappable below the status bar on a notched iPhone").
- `docs/venue-activation-device-checklist.md` §3 — Phase 3's radius-dial fix ("drag the radius
  dial across a large range; the map must not re-zoom until release" + the sub-threshold-nudge
  edge case).

Phase 4 added **no** new device-checklist item (confirmed above — it's fully unit-testable).
Phase 5 should state plainly, in its close-out summary to Andrew, that these two items remain
open and are the only two blockers left for full manual sign-off. Do not describe Phase 2 or 3
as "verified" — only their code is done; the human verification step is still pending.

### 4. Also verify (not fix) — Phase 2's desktop-header note

Phase 2's handoff noted `components/admin/AdminShell.tsx:734` (desktop admin header) has no
safe-area padding, concluded this is a non-issue since desktop admin is an ordinary browser
surface per CLAUDE.md, and said to record that conclusion rather than add padding speculatively.
Confirm that conclusion made it into `docs/admin-mobile-run-log.md`; if it didn't, Phase 5
should add it as part of its own log-writing pass rather than leaving it undocumented.

### 5. Scope check

All five findings (Phases 0–4) are now code-complete per their respective handoffs. Phase 5 is
purely: run the full gate, write the log entries, and report open items — **no further
production-code changes are expected** unless the full gate surfaces something new (e.g. lint
finds something Phases 0–4 didn't check for, since none of them ran it).
