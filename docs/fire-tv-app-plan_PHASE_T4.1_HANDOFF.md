# Fire TV app plan — Phase T4.1 handoff (finish T4 on PR #51)

**For Andrew:** T4's new test could not catch the bug it was written for. It now can: two replacement tests fail on the
old code and pass on the fix. Also `.claude/worktrees/` is now git-ignored for everyone, and the T4 handoff is corrected.
Admin page only; no store release. Nothing needs you; PR #51 merges after CI is green.

**Changed:** `tests/components.live-trivia-quick-review.test.ts` (old "instant" test replaced by (a) a MutationObserver test
that presses Z in the microtask after the commit showing "Nothing left." and asserts `["reject","undo"]`, and (b) a test
that `keydown` is registered exactly once); `.gitignore` (+`.claude/worktrees/`); `docs/fire-tv-app-plan_PHASE_T4_HANDOFF.md`.
The component was not touched.

**Verified:** in a scratch worktree on `fd3bf936` with the new test file, (a) and (b) fail (the first test of the file also
timed out at ~1 s there, a cold-start effect in the throwaway worktree, not a product issue); on the branch the file passed
50/50 runs; `npm run test` 7936 passed; lint and `npx tsc --noEmit` clean.

**Next (T4.2):** Quick Review keys while busy or loading (D36; findings F4–F6 in the plan). Sonnet 5.5 / high. Start from
`main` after PR #51 merges.
