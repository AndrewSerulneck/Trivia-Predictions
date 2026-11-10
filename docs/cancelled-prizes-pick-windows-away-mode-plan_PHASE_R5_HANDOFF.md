# Phase R5 handoff: one look-only payload for Category Blitz (2026-11-09)

## For Andrew (plain English)

- **What changed:** Category Blitz had the same "just look, don't start a round" reply written out twice in one file. It's now written once, so the two copies can't drift apart. Players see no difference.
- **Live?** No. Code and tests only, uncommitted, not deployed; waits for Phase R. No migration.
- **Needs you:** nothing. Next is R6 (arrow functions).

## For the next agent

**Small phase, short note.** File changed: `app/api/category-blitz/sessions/route.ts`: new non-exported `buildPeekPayload({ roomId, venueId, now })` returns `{ ok, session (continuous timing merged, venueId concealed), nextWindowAt, realtimeChannel, live }`. `peek=1` returns it as-is. The not-at-the-bar branch (D8) drops `live` and adds `scheduleWindowEndAt: null`, `serverReceivedAtMs`, `serverNowMs`, so both response shapes are unchanged. A round still starts only from the non-peek path (`driveContinuousCategoryBlitz`); `tests/category-blitz-sleep-contract.test.ts` passes.

Test added in `tests/api.category-blitz-sessions.test.ts`: with a shared room id (`hc-cbz-live`), both branches report the caller's venue, never contain the room id, and match on session, channel and nextWindowAt; D8 has no `live`. The file now mocks `@/lib/venuePresence` and `@/lib/categoryBlitzRoom` (default: enforcement off, room = venue).

Verified: those two test files pass (19 tests); eslint clean on both touched files; `npx tsc --noEmit` has no errors outside the Finder-duplicate `.next/types/routes.d 2.ts`. Not run: full `npm run test`, build.

State: branch `main`, last commit `40d47492`; nothing committed or deployed. Migrations `20261109214742`, `20261109223743`, `20261110014242` still unapplied.

Next: R6 (plan §7), Haiku 5.5 / low per the plan's table. It changes the same route file only if it contains new function declarations; this one uses a `const` arrow.
