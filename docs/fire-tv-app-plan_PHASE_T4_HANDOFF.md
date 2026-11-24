# Fire TV app plan — Phase T4 handoff (Live Quick Review undo test, D35)

**For Andrew:** The Live Trivia Quick Review keyboard shortcuts can no longer miss a key pressed right after a decision,
which is what made the "undo with Z" test fail CI once. Admin page only: website deploy, no store release. Also, lint
now skips the `tmp/` and `.claude/worktrees/` folders (leftover app copies there caused 480 local-only lint errors). Nothing needs you.

**For the next agent:** `components/admin/sections/LiveTriviaQuickReview.tsx` used to re-register its `keydown`
listener in a `useEffect` keyed on `decide`/`skip`/`startEdit`/`undo`/`draft`; a key pressed before that effect ran hit
a stale `undo` (empty `history` / `busy`) and was dropped. It now matches `SpeedTriviaQuickReview.tsx` (already fixed
earlier): the handler lives in `onKeyRef`, swapped in a `useLayoutEffect`, and the listener is bound once. Same keys and
behavior. New test in `tests/components.live-trivia-quick-review.test.ts`: "undoes with Z pressed the instant a reject
renders (no stale key handler)". Speed Quick Review needed no change. `eslint.config.mjs` ignores gain `tmp/**` and `.claude/worktrees/**` (`tmp/` and, since T4.1, `.claude/worktrees/` are in `.gitignore`; CI never saw them).
Verified: the test file 50/50 runs clean; `npm run test` (7935 passed), `npx tsc --noEmit` clean, my files lint clean.
Race check (T4.1): the first T4 test passed on old `fd3bf936` too, so it guarded nothing; T4.1 replaced it with two tests that
both fail on `fd3bf936` (Z pressed in the microtask after the commit; keydown bound exactly once) and pass on the fix.
PR #51, branch `fix/live-quick-review-undo-race` off `main` at `fd3bf936` (PR #50 merge); commits `72ff0638` (fix) and the T4.1 commit. Next phase: T4.2.
