# Phase 3 Handoff — Radius dial no longer re-zooms the map mid-drag

**Status:** ✅ DONE (code); one device-checklist item is OPEN and only Andrew can close it
**Date:** 2026-08-06
**Model:** Claude Sonnet 5 · Effort: low
**Plan:** `docs/code-review-remediation-plan.md` Phase 3

---

## The bug

`components/admin/VenueMapPicker.tsx`'s radius-refit effect (was at line 229, now the first of
two effects starting around line 221) only guarded against refitting **mid-marker-drag**
(`dragInProgressRef`). It did not check `radiusEditing` (true while the radius dial itself is
held), so `fitToCircle` fired on every >15% radius step *while the user was actively dragging the
dial* — directly contradicting the effect's own comment ("never mid-drag, so it doesn't fight a
user's manual pan/zoom") and defeating the plan's stated goal: watch the circle grow under your
finger without the map jumping around underneath it.

## The fix

Two changes in `components/admin/VenueMapPicker.tsx`:

1. **New ref:** `pendingFitOnReleaseRef = useRef(false)`, declared alongside `lastFitRadiusRef`.
2. **The existing refit effect** (`useEffect(..., [radius])`) now also depends on
   `radiusEditing`. When a change is material (>15% from `lastFitRadiusRef`) but
   `radiusEditing` is true, it sets `pendingFitOnReleaseRef.current = true` and returns
   *without* touching `lastFitRadiusRef` — so the "last fit" bookkeeping stays honest against
   the fit that hasn't happened yet.
3. **New effect**, `useEffect(..., [radiusEditing, radius])`: fires only when `radiusEditing`
   transitions to `false` **and** `pendingFitOnReleaseRef.current` is true. It clears the flag,
   updates `lastFitRadiusRef.current = radius`, and calls `fitToCircle` once. This is the
   "refit once on release" behavior the plan asked for (preferred over "never refit").

### Why this doesn't double-fit or permanently suppress future fits

- **No double-fit:** the flag is read-and-cleared atomically inside the release effect before
  the `fitToCircle` call, so re-renders during/after the fit don't refire it. `lastFitRadiusRef`
  is only written once per skipped-then-released cycle — either by the deferred effect (when a
  fit was pending) or never (when nothing was pending), never both.
- **No permanent suppression:** the first effect still runs on every `radius` change regardless
  of whether a previous release cycle left `lastFitRadiusRef` stale — the 15%-from-last-fit
  comparison is stateless per call. A skipped drag doesn't disable future materiality checks; it
  only defers the fit for that specific drag.
- **Sub-threshold nudges are inert either way:** if a change never crosses 15%,
  `pendingFitOnReleaseRef` is never set, so releasing the dial after several small nudges does
  nothing — matches existing behavior, now verified by the new checklist item below.

### Marker-drag path untouched

`dragInProgressRef` (marker drags) is still checked first and still short-circuits the whole
effect before the `radiusEditing` branch is reached — the two drag types don't interact and the
marker-drag skip path is unchanged.

### Stroke-weight effect untouched

The separate `useEffect(..., [radiusEditing])` that thickens the circle stroke
(`CIRCLE_STROKE_EDITING` vs `CIRCLE_STROKE_IDLE`) was not touched — it's a distinct effect with
its own dependency array, per the plan's explicit instruction not to disturb it.

## Tests

No unit test added. `tests/venue-activation.geofence-editor.test.ts` (the only existing test
that renders `VenueMapPicker`, via `GeofenceEditor`) stubs `/api/admin/maps-key` to fail
specifically so the map never initializes in jsdom — Google Maps globals (`fitBounds`,
`getBounds`, etc.) don't exist in that environment, so the refit logic is structurally
untestable outside a real browser. This mirrors Phase 2's device-only stance on the notch fix.
This was a deliberate choice, not an oversight — do not add a jsdom test that mocks the entire
`window.google.maps` surface just to exercise this; it would test the mock, not the real
zoom/bounds behavior the plan cares about.

**Verification added:** `docs/venue-activation-device-checklist.md` §3 now has:
- A checklist line specifically calling out the fixed regression: "drag the radius dial across
  a large range; the map must not re-zoom until release."
- A new line for the sub-threshold-nudges edge case (confirms `lastFitRadiusRef` /
  `pendingFitOnReleaseRef` bookkeeping doesn't get corrupted by a string of no-op nudges
  followed by a real one).

## Gate

```
npx tsc --noEmit  → clean
npm run test      → 168 files passed | 1 skipped
                    1451 passed | 13 skipped | 0 failed
```

Same count as Phase 2's baseline (1451) — this phase added no new automated tests, only edited
production code and a device checklist doc.

No lint run — Phase 5 owns `npm run lint`.

## Files modified

- `components/admin/VenueMapPicker.tsx` — added `pendingFitOnReleaseRef`; refit effect now also
  gates on `radiusEditing`; new effect fires the deferred refit once on release
- `docs/venue-activation-device-checklist.md` — §3 updated with the fixed-regression callout and
  a new sub-threshold-nudge verification line

No migrations. No route changes. Nothing committed (per plan: no commit unless Andrew asks).

---

## OPEN — device verification (Andrew only)

Headless browsers cannot render real Google Maps (`window.google.maps` doesn't exist without a
live API key + network, and even stubbed it wouldn't reproduce real drag-gesture timing), so
this fix is **structurally unverifiable by automation** — same category as Phase 2's notch fix.

`docs/venue-activation-device-checklist.md` §3 now asks Andrew to:
> Drag the radius dial across a large range in one continuous motion — the map must not re-zoom
> until release.

This is the exact scenario the bug affected. Phase 5 must list this as open alongside Phase 2's
notched-header item.

---

## Notes for the next phase

**Phase 4 (Sonnet, low) — stale prediction can overwrite a committed address** is next in plan
order. It is fully independent of Phases 0–3; nothing here touches it.

- File: `components/admin/useAddressLookup.ts:146`. `select()` bumps `requestIdRef` but never
  clears `debounceRef`, so a 300ms predict scheduled by the keystroke immediately before the tap
  can still fire *after* the address is chosen, reopen the dropdown over the committed value, and
  a stray tap then silently rewrites street/city/state/zip **and moves the pin**.
- Fix: clear `debounceRef` at the top of `select()`, alongside the `requestIdRef` bump — mirror
  what `reset()` already does (it already clears the timer correctly; `select()` is the one
  path that doesn't).
- Also check `loadPredictions`' own `requestIdRef` guard: if it only guards `setLoading`, extend
  it so a stale response (one that started before the tap, whose promise resolves after) can't
  call `setPredictions`/`setOpen(true)` either. Read the full function body before editing —
  don't assume the guard shape from this summary.
- **Tests are expected and testable here** (unlike Phases 2/3) — this is plain React state/timer
  logic, no Google Maps or notch/viewport dependency. Add a `useAddressLookup` unit test with
  fake timers: type, tap a prediction before the debounce elapses, advance timers, assert the
  dropdown stays closed and the committed fields are untouched. Use `vi.useFakeTimers()` /
  `vi.advanceTimersByTime(...)`, consistent with this repo's existing timer-based tests (grep for
  `useFakeTimers` for examples of the pattern already in use).
- No device-checklist item needed for this one — it's fully unit-testable, unlike Phases 2/3.

**Phase 5 close-out** now owes, in addition to what Phases 1 and 2's handoffs listed:

- Full gate: `npx tsc --noEmit`, `npm run lint`, `npm run test`.
- Run-log entry: **Phase 3's resolution belongs in `docs/admin-mobile-run-log.md`** — despite
  touching `VenueMapPicker.tsx` (which is venue-activation code, not admin-mobile), the plan
  groups Phases 1-4 under the same code-review remediation effort and Phase 2 already
  established `docs/admin-mobile-run-log.md` as this run's log. Cross-check against
  `docs/billing-dollar-rate-run-log.md` too in case Phase 3 belongs in venue-activation's own
  log instead — inspect both docs' existing scope before deciding, since neither Phase 0's nor
  Phase 1's handoff had a VenueMapPicker precedent to follow.
- The list of open device-checklist items now has **three** entries, not two: Phase 2's
  notched-header line (`docs/admin-mobile-device-checklist.md`), and Phase 3's radius-dial line
  (`docs/venue-activation-device-checklist.md`, §3) — note these are two *different* files. Say
  plainly that both are open, not "verified."
