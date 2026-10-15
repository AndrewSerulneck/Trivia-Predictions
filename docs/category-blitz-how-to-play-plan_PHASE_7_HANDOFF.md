# Category Blitz How-to-Play Plan — Phase 7 Handoff (verification & release record)

**Date:** 2026-10-15 · **Plan:** `docs/category-blitz-how-to-play-plan.md` · **Status: done, except the items for Andrew below.**

## For Andrew (plain English)
- All automated checks pass on the exact code that is live (`origin/main` `79da7d2`): type check, lint, 388 test files / 4,585 tests, and the production build.
- I did NOT drive the game in a browser. A browser test would have created real rounds in the production database (dev shares it), so I left it for your phone pass.
- **Needs you:** on a real phone check: the 7 tutorial cards read well; no lobby flash after tapping the game; "How to play" popup under the countdown (Android Back closes it); bigger letter badge; keyboard open/close; Majority Rules on round 5; the "+1" alliteration chip; the TV shows the asleep state and wakes when a player opens the game; with everyone gone, no new round starts.
- Still open from Phase 6: re-run the empty-round cleanup on/after 2026-10-16 (`node --env-file=.env.local scripts/cleanup-empty-category-blitz-rounds.cjs`, then add `--apply`).
- The `CLAUDE.md` bullet, this handoff, the plan status line and the venue-tile subtitle ("Our twist on a classic word game.") were committed to `main` on 2026-10-15.

## For the next agent
1. **Scope:** plan is complete. Nothing further is planned. Out of scope: engine changes, more deletes.
2. **State:** gates were run on `79da7d2`. The `CLAUDE.md` bullet (before "Global room pooling"), plan status line, this file and the venue-tile subtitle are now committed on `main` (branch `category-blitz-phase7-docs`). The old local branch `category-blitz-scoring-cadence` is fully contained in `main`. The unrelated Speed Trivia variety work lives on branch `speed-trivia-variety-backlog` (not merged, never deploy).
3. **Decisions:** unchanged (plan §2). Optional daily prune of empty rounds (plan §7) still unasked.
4. **Gates run** in a scratch worktree of `origin/main` with `npm ci` (sequential): `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` 388 passed / 1 skipped files, 4,585 passed / 13 skipped; `npm run build` green. Worktree removed afterwards.
5. **Not verified:** the `verify` browser walkthrough and the phone checklist above. Any driven session on a dev server creates real production rounds; clean up throwaway sessions if you do it.
6. **Homes:** cadence `isReverseRound` (`lib/categoryBlitzModes.ts`); alliteration `lib/categoryBlitzAlliteration.ts`; rules/tutorial copy `lib/categoryBlitzHowToPlay.ts`; sleep tripwire `tests/category-blitz-sleep-contract.test.ts`.
