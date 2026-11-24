# Fire TV app plan — Phase T4.2 handoff (Quick Review: keys while busy or loading)

**For Andrew:** In Quick Review (Live and Speed), a **Z** pressed while a Keep / Reject is still saving is no longer lost:
it runs the moment the save finishes (if the save failed, it does nothing). Nothing can be Kept, Rejected, Skipped or
Edited while "Loading…" shows, so a category change can no longer decide a question from the old list. "Nothing left."
no longer flashes before the first load. Admin pages only: website deploy, no store release, no data or migration.
No new on-screen text. Nothing needs you. D36 stands (say if you'd rather Z were ignored while saving).

## For the next agent

- **Next phase:** CR1 (read-only code review of PRs #36, #39, #48, #37, #46; Opus 5.5 / high). Out of scope here: any
  further Quick Review change.
- **State:** branch `fix/quick-review-busy-loading` from `main` `a2a41140` (PR #51 merged). Check `git log` / `gh pr list` for
  whether the PR is merged; this note is written before CI.
- **Files:** `components/admin/sections/LiveTriviaQuickReview.tsx`, `components/admin/sections/SpeedTriviaQuickReview.tsx`
  and their tests `tests/components.live-trivia-quick-review.test.ts`, `tests/components.speed-trivia-quick-review.test.ts`;
  plan status lines.
- **How it works (both components):**
  - `decide` / `keep` / `reject` set `inFlightRef = { id, done: false }` and `decidedRef = null`, and on success put the
    exact history entry they push into `decidedRef` (Speed: `advance` does it). `finally` sets `done = true`.
  - The Z handler: if `inFlightRef.current` is set (even `done` but not yet committed) it stores `queuedUndoRef = id` and
    returns; otherwise `undo()` as before. Other keys while busy stay ignored.
  - An effect on `[busy, history, undo]` runs the queued undo only when `!busy`, the flight is done, and
    `history.at(-1) === decidedRef.current` (same object, same id, not a skip). A failed, "changed", "not pending" or
    star-cap save leaves no such entry, so the Z is dropped. The ref is cleared in the effect (after commit), not in
    `finally`, so a Z in the gap before the commit still queues instead of being lost to a stale `busy`.
  - Category/filter change, Publish and bulk start clear the queue.
  - `reload()` clears `items` (and `beyondPage` / `total`) when it starts; `decide`, `skip`, `undo`, `startEdit`, publish,
    restore and bulk return early when `loading`; the buttons' `disabled` includes `loading`; the "N left" line is empty
    while loading (`min-h-5` keeps the row height). `loading` starts `true`.
  - Live gained `reloadSeqRef` (a stale list response sets nothing). Speed already had `loadSeq`.
- **Trap:** the key listener is bound once and calls `onKeyRef.current`, swapped in a layout effect (T4). Don't read
  `busy` state in the Z branch; use the refs, because state is stale between a save finishing and the render.
- **Tests added** (deferred `fetch`, settled by hand): Z during a Reject save runs after it; Z during a failed save does
  nothing; → during a save is ignored; keys and buttons do nothing while a new list loads; the last-asked list wins when the
  first answer arrives last; first paint (`renderToString`) shows "Loading…" not "Nothing left.". All existing tests
  unchanged (the "250 left" test passes).
- **Verified:** against `a2a41140` in a scratch worktree the new files fail 7 tests (Live: Z-queued, loading-keys,
  stale-list, first paint; Speed: Z-queued, loading-keys, first paint). Two tests, "failed save drops the Z" and "→ is
  ignored during a save", and Speed's "last list wins" pass on the old code by design: they pin behavior that must not
  change (Speed already had `loadSeq`). Both test files 50/50 clean; `npm run test` 7950 passed; lint and
  `npx tsc --noEmit` clean.
- **Unverified:** no real-browser run (jsdom only; admin pages need admin auth).
- **Cost:** none. No new requests, polls or jobs.
