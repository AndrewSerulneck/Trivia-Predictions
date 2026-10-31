# Category Blitz letter die — Phase 13.3 handoff (2026-10-31)

## For Andrew (plain English)
**What changed:** three small cleanups, no visible change to players.
- Each game-page check now reads the schedule list from the database once instead of twice (about 4 fewer reads a minute per open player tab at a scheduled venue).
- The background timer now waits the right pause between rounds for test-mode games (real games unchanged).
- One out-of-date code comment was corrected.

**Is it live?** No. Committed locally on `after-app-review` only; nothing pushed, `main` stays frozen until Apple approves.
**Cost:** lower (one fewer `category_blitz_schedules` read per scheduled-venue poll).
**What's left:** 13.4, 13.5, then Phase 14 (review + your phone pass). **Needs you:** nothing.

---

## For the next agent (Phase 13.4)

### 1. Next phase
Plan §Phase 13.4: both engines (`driveVenueCategoryBlitzWithSchedules` ~line 830 and `runCategoryBlitzEngine` ~2010 in `lib/categoryBlitz.ts`) check `roundFitsWindow` against the EARLIER of the live window end and the session's `scheduledEndAt`, via ONE shared helper (e.g. `sessionWindowEndMs`) in `lib/categoryBlitzShared.ts` also used by `anotherRoundFollows`. Do NOT move `scheduledEndAt` on schedule edits. Then 13.5. Out of scope: pushing, merging to `main`.

### 2. Starting state
Branch `after-app-review`; 13.3 commit sits on `8be62504` (13.2). Not pushed or deployed. No DB/Vercel access used; no data changed.

### 3. Decisions
Andrew's earlier answers stand (finding 1 → (a) = 13.4; finding 3 → fix now = 13.5). 13.3a design: new `driveVenueCategoryBlitzWithSchedules(venueId, now, requestedTestMode)` returns `{ session, schedules }`; `schedules` is `null` only when the engine stood down for a continuous venue before reading. `driveVenueCategoryBlitz` is now a thin wrapper returning `.session`, so its other callers (`lib/venueScreen.ts`, `lib/categoryBlitz.ts` ~1135 reschedule helper, tests) are unchanged.

### 4. Files changed
- `lib/categoryBlitz.ts`: new `…WithSchedules`, wrapper, `CategoryBlitzSchedule` type import; cron `nextRoundStartAtMs(latest, session.testMode)` (13.3b).
- `app/api/category-blitz/sessions/route.ts`: uses `…WithSchedules`; own `listSchedules` only as fallback when `schedules` is null.
- `components/category-blitz/CategoryBlitzGame.tsx`: `compactChrome` comment reworded (13.3c).
- `tests/api.category-blitz-sessions.test.ts` (mock renamed, returns `{session, schedules}`, new fallback test), `tests/lib.category-blitz-engine.test.ts` (two 13.3b tests).

### 5. Facts and traps
- `lib/categoryBlitz.ts` has non-UTF-8-safe bytes: edit with Python `encoding='utf-8'` or `grep -a`; macOS `sed -i` needs `''`.
- `lib/venueScreen.ts` still does its own `listSchedules` next to `driveVenueCategoryBlitz` (TV poll). Not in the plan; could use `…WithSchedules` too (saves one read per TV poll at scheduled venues) — mention to Andrew before doing it.
- Don't run `tsc` and `npm run build` at once.

### 6. Verified
`npx tsc --noEmit` clean; eslint clean on touched files; `npm run test` 5,729 pass / 13 skipped / 4 fail (only the known Bingo star-index freshness tripwires); `npm run build` ok. Mutation checks (reverted): cron using `false` → 13.3b test-mode test fails; route always calling `listSchedules` → 4 sessions-route tests fail. No browser/device check.

### 7. Open questions
Whether to apply the same single-read to the venue TV poll (see §5).

### 8. First steps for 13.4
Read plan §13.4; look at `anotherRoundFollows` (`lib/categoryBlitzShared.ts` ~186) and both fit checks; add the helper + tests from the plan; gates; mutation-check; local commit; write `…_PHASE_13.4_HANDOFF.md`; update the status line. Sonnet 5.5, medium.
