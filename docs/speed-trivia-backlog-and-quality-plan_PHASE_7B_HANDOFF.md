# Phase 7b handoff — every event gets its turn, with time for review (2026-11-19)

**For Andrew:** holiday/event questions now get written 14 to 3 days before the event (was 10 days to the day itself),
so the last night's questions still have 2–3 days to sit in Quick Review before the event. Events that overlap now take
turns night by night instead of the soonest one winning, so every event gets nights: in 2027 Valentine's Day goes from
0 Speed nights to 5, March Madness 1 → 6, NBA Finals 1 → 4; every event now gets 4–12. A test makes that a rule: a
calendar edit that starves an event fails CI. Not live yet — uncommitted on the same branch as 7a, and it ships in one
PR with 7c, which merges only with your OK. Nothing needs you now. Run 7c next with **Opus 5.5, medium effort**.

**For the next agent (7c, Opus 5.5 / medium; plan §4 "Phase 7c"):**

- **Branch / state:** `fix/seasonal-slots-7abc` (from `origin/main` at `fa6979a1`). **Nothing committed or pushed.**
  Uncommitted: 7a's `lib/question-variety/slots.cjs`; 7b's files below; `tests/lib.question-variety-seasonal.test.ts`
  (7a + 7b); `docs/speed-trivia-backlog-and-quality-plan.md` (planning agent's 7a–7j additions + status updates); the
  7A and 7B handoffs. Commit all of it in 7c. Never `git checkout -- <file>`, `git stash` or `git reset`. The untracked
  " 2" copies (e.g. `lib/question-variety/calendar 2.cjs`, `tests/lib.question-variety-seasonal.test 2.ts`) are still
  7c's job — they are stale copies of the pre-7b files; delete, don't merge from them.
- **What changed (decisions D43 and D44 taken at their defaults; Andrew said nothing otherwise):**
  - `lib/question-variety/calendar.cjs`: `WINDOW_DAYS = 14`, new `LEAD_DAYS = 3` (exported; `seasonalFor` also takes
    `leadDays`). `seasonalFor` collects every event `leadDays..windowDays` days ahead whose category is written
    tonight, sorts by date then list index, returns `candidates[floor(utc(today)/DAY_MS) % length]` (same day count as
    `slots.nightPlan`). Return shape unchanged, so `brief.cjs` and 7a's `chooseSlots` are untouched.
  - Review #7: the local `GAMES` is gone; uses `map.GAMES` / `map.isGame`. `utc` = `map.utcDay(day).getTime()`;
    `validDay` = regex + `map.isoDay(day) === day` inside try. **`utcDay` was not exported from `map.cjs` — I added it
    to `module.exports` and `lib/question-variety/map.d.cts`** (one-word change, no behaviour change).
  - Review #8: `dateFor` uses `exact[year]` only when it's a real day in that year (`validExact`), else falls back to
    the rule. `validateCalendar` checks each `exact` entry with `validExact` directly and still reports
    `<id>: exact <year> <value>`; a non-object `exact` reports `<id>: exact`.
  - `calendar.d.cts`: `LEAD_DAYS`, `leadDays`. `data/question-variety/calendar.json`: only the `note` text (window and
    rotation wording); no event changed, version still `calendar-v1`.
  - Plan: Phase 7 step 2 / tests / "Built" note marked superseded by 7b; 7b heading and the "What runs next" box
    marked DONE; status paragraph points here.
- **Tests (in `tests/lib.question-variety-seasonal.test.ts`):** window 14 ✓ / 15 ✗ / 3 ✓ / 2, 0, −1 ✗; two same-date
  events alternate across all 12 nights and the pick is pinned to `dayNumber % 2`; candidates sorted by date then list
  order; bad `exact` (`"2028-2-13"`, `null`, wrong year, `"2028-02-30"`) falls back and is reported; `calendar.GAMES`
  is undefined, a missing game is reported from `map.GAMES`, an unknown game gets null; **contract: every real-calendar
  event gets ≥ 2 Speed nights in this year and the next two** (counts nights whose picked date falls in that year,
  simulating from 1 Dec of the year before). 7a's year-simulation test still passes unchanged (its `> 100` / `> 10`
  thresholds still hold).
- **Per-event nights (real calendar + `nightPlan`, $0, script was in the session scratchpad):** Speed 2027 4–12 for
  every event (Super Bowl 4, Valentine's 5, St. Patrick's 4, NBA Finals 4; Masters, Derby, July 4, Labor Day, Emmys,
  Thanksgiving 12); Speed 2028 4–12. Live 2027: Stanley Cup Final **0**, everything else 1–2 — the accepted "Known
  limit" under D43 (it shares Sports nights with the NBA Finals and the Indy 500); Live 2028: all ≥ 1.
- **Checks run:** `npx vitest run tests/lib.question-variety tests/lib.question-writer.test.ts` → 3 files, 65 tests
  green; eslint on `calendar.cjs`, `map.cjs` and the test file clean; `npx tsc --noEmit` clean. Full `npm run test`,
  lint and build not run (7c runs them; never typecheck and build at once).
- **Trap:** the contract test uses `new Date().getUTCFullYear()`, so it re-checks a new three-year span every January.
  If a future calendar edit fails it, fix the calendar (e.g. move an event's Speed entry to a less crowded category),
  don't loosen the test.
- **Open questions for Andrew:** none. (Optional, not blocking: moving the Stanley Cup Final's Live entry out of Sports
  in `calendar.json` would give it Live nights in 2027.)
- **First steps for 7c:** read plan §4 "Phase 7c"; do the `writer-v6` seasonal subject rule, the `@/` type import, the
  sharper brief test (the brief test still expects `writer-v5` — update with the bump), delete the " 2" copies + add
  the tripwire; then full `npm run lint`, `npm run test`, `npx tsc --noEmit`, `npm run build` (one at a time), commit,
  open one PR for 7a–7c, merge only with Andrew's OK.
