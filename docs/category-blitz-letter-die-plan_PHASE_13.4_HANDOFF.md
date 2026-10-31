# Category Blitz letter die — Phase 13.4 handoff (2026-10-31)

## For Andrew (plain English)
**What changed:** if you extend tonight's Category Blitz window while a game is running, the game still ends at the
original time (as before) — but it no longer starts one last round a minute before that time only to cut it off
~2 minutes early. If no full round fits before the original end, the game ends cleanly after the round already played.
Shortening a window works as before. Nothing else visible changes.

**Is it live?** No. Committed locally on `after-app-review` only; nothing pushed, `main` stays frozen until Apple approves.
**Cost:** zero (both times are already in memory; no new reads or writes).
**What's left:** 13.5 (one server-clock "round age"), then Phase 14 (re-review + your phone pass). **Needs you:** nothing.

---

## For the next agent (Phase 13.5)

### 1. Next phase
Plan §Phase 13.5 (`docs/category-blitz-letter-die-plan.md`): one pure `roundAgeMs(roundStartedAtMs, phoneNowMs,
serverClockOffsetMs)` used by `showReveal` (`components/category-blitz/CategoryBlitzGame.tsx` ~2466), the die watchdog's
`sawRoundStart` (~2608, so the Majority Rules takeover ~2624) and `dieStage`'s cutoff (`lib/categoryBlitzLetterDie.ts`),
keeping the 13.1a latched offset. Out of scope: the round timer and submission deadlines (note for Andrew only), pushing,
merging to `main`, the TV poll's double schedules read (open question from 13.3).

### 2. Starting state
Branch `after-app-review`; the 13.4 commit sits on `03f79653` (13.3). Not pushed or deployed. No DB/Vercel access used;
no data changed.

### 3. Decisions
Andrew chose option (a) for 13-review finding 1 (2026-10-30): the engines' fit check uses the earlier of the live window
end and the frozen `scheduledEndAt`. Option (b) — moving `scheduledEndAt` on a schedule edit — was NOT chosen; don't
build it. Finding 3 → fix now = 13.5.

### 4. Files changed
- `lib/categoryBlitzShared.ts`: new `sessionWindowEndMs(liveEndMs, scheduledEndAt)` (min of the two; a null/unparsable
  frozen end → live end). `anotherRoundFollows` now calls it instead of its own inline min.
- `lib/categoryBlitz.ts`: imports it; `driveVenueCategoryBlitzWithSchedules` (`canFitAnother`, ~855) and
  `runCategoryBlitzEngine` (~2023) pass `sessionWindowEndMs(<live end>, session.scheduledEndAt)` to `roundFitsWindow`.
  In drive, "doesn't fit + last round scored" already ends the session at once (`endSession`), so an extended window now
  ends after the last round that fits.
- Tests: `tests/lib.category-blitz-shared.test.ts` (3 `sessionWindowEndMs` cases), `tests/lib.category-blitz-engine.test.ts`
  (cron: extended → no fit; shortened → live wins; null frozen end → live only), `tests/lib.category-blitz-continuous-engine.test.ts`
  (new describe: drive with extended and shortened windows, real engine on the in-memory fake → session `complete`, no new round).

### 5. Facts and traps
- `lib/categoryBlitz.ts` has non-UTF-8-safe bytes: plain `grep` finds nothing in it — use `grep -a`; edit with Python
  `encoding='utf-8'`; macOS `sed -i` needs `''`.
- In the cron fixture (`tests/lib.category-blitz-engine.test.ts`), `latestRoundReads` is the "fit check passed" signal
  (with an active round the engine stops right after the read). The schedule's live end = start + `windowMinutes`.
- The drive tests live in the continuous-engine file because it has the full in-memory Supabase fake that runs the real
  scheduled engine (`activeScheduleRow`, `scheduledSession`).
- Don't run `tsc` and `npm run build` at once.

### 6. Verified
`npx tsc --noEmit` clean; eslint clean on the 5 touched files; `npm run test` 5,737 pass / 13 skipped / 4 fail (only the
known Bingo star-index freshness tripwires); `npm run build` ok. Mutation checks (all reverted): drive using the live
end only → drive "extended" test fails; cron using the live end only → cron "extended" test fails; helper `min`→`max` →
8 tests fail (incl. the 12.1a `anotherRoundFollows` ones). No browser/device check.

### 7. Open questions
Still open from 13.3: whether the venue TV poll (`lib/venueScreen.ts`) should also use `driveVenueCategoryBlitzWithSchedules`
to drop its second schedules read. Ask Andrew; not in the plan.

### 8. First steps for 13.5
Read plan §13.5; read `dieStage` and the 13.1a latch in `LetterDieRoll.tsx`; add `roundAgeMs` + tests from the plan;
wire the three callers; gates; mutation-check; local commit; write `…_PHASE_13.5_HANDOFF.md`; update the status line.
Opus 5.5, high (plan table).
