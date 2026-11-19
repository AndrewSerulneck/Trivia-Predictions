# Phase 7 handoff: seasonal writer slots (D34)

Written 2026-11-19 by Claude (Opus 5.5; the plan names Opus 5.5 / medium).

## For Andrew (plain English)

- **What changed:** when a holiday, big game or awards show is within 10 days, one of each night's writer questions is
  about it. Speed gets one a night. Live gets one only on the night it writes that event's category. The number of
  questions per night is unchanged, so the cost is the same. The questions are timeless facts about the event, never
  news.
- **The list (20 events)** is in `data/question-variety/calendar.json`. Moving events (Super Bowl, Oscars, etc.) use
  approximate rules like "2nd Sunday of February". Within the 10-day window that's close enough, and an exact date can
  be added for any year.
- **Is it live?** **No.** It's on branch `feature/seasonal-slots-phase7`. The plan (D34) says you approve the list once
  before it goes on.
- **What needs you:** approve the list (or tell me what to change). Then it gets merged.

## For the next agent

### 1. Next phase and scope
- **Waiting on Andrew:** approval of `data/question-variety/calendar.json` (D34). Then rebase onto `main`, open or
  merge the PR, and check the first brief (step 6 below).
- **Also open from 4f.2:** step 6, the production check after the first OpenAI nightly (see the
  `PHASE_4F2_HANDOFF.md` §8, step 3). Expect `provider='openai'` rows in `llm_usage_logs`.
- **Then:** the second code review (4c.8 through 7), per the plan's order line.
- **Out of scope:** a full seasonal Live round (plan step 4); Phase 6 (deferred, D41).

### 2. Starting state
- **4f.1 + 4f.2:** migration `20261119153651_llm_usage_logs_openai.sql` was applied 2026-11-19 with Andrew's OK. Only
  that migration was pending. Verified by a service-role insert and delete of one `provider='openai'` row.
  PR #29 (`feature/gemini-writers-out-4f1`) was opened. Andrew allowed the agent to merge it once CI passes. Check
  `gh pr view 29` for whether it merged.
- **Phase 7 branch:** `feature/seasonal-slots-phase7`, cut from `feature/gemini-writers-out-4f1` at `675b778b`.
  After #29 merges, rebase it onto `main` (`git rebase origin/main`; the 4f commits drop out).
- No migration, no data change, no paid call in Phase 7.
- `GEMINI_API_KEY` stays in GitHub, Vercel and `.env.local` (D42: Andrew chose to leave it, and nothing reads it).

### 3. Decisions
- **D34:** at most one seasonal slot a day per game, within 10 days of an event, with the same total. Andrew approves
  the list once.
- **D42:** the Gemini key can stay.
- **Choices made here (and why):**
  - **The slot keeps a real map area and era.** The event is added as `seasonal: <event>` in the prompt line. The plan
    said "the event name as the slot's area", but `process.cjs` and `liveProcess.cjs` require a real map area
    (`map.validateTag`). So each calendar entry names a category and area per game. The era is that area's
    least-covered cell, not already used by another slot that night.
  - **Speed** replaces the *last* regular slot of the event's category (every Speed category gets at least one slot
    each night).
  - **Live** writes one category a night, so a seasonal slot happens only when that night's category matches. That's
    about once or twice per window. It replaces the last of the 24 asked.
  - **When two events fall in the window, the soonest wins** (ties go to list order). The window is 0–10 days before
    the start date, so it isn't used during a multi-day event.
  - **If the area is switched off or missing, the slot is skipped.**
  - **`WRITER_VERSION` is now `writer-v5`**, because the prompt gains a seasonal rule. That rule appears only when a
    seasonal slot is present.

### 4. Files
- **New:** `data/question-variety/calendar.json` (`calendar-v1`, 20 events).
- **New:** `lib/question-variety/calendar.cjs` (+ `.d.cts`):
  - `dateFor(rule, year)` handles `on: "MM-DD"`, `month` + `weekday` + `nth` (where `-1` means last), an optional
    `offset`, and per-year `exact` dates.
  - `validateCalendar(calendar, categories, areas?)`.
  - `seasonalFor({ game, categories, today, calendar })`.
- **`lib/question-variety/slots.cjs` (+ `.d.cts`):**
  - `chooseSlots` takes `seasonal` and returns `seasonal` (the event tag or `null`).
  - The seasonal slot carries `event: { id, name, date }`.
- **`lib/question-writer/brief.cjs` (+ `.d.cts`):**
  - Calls `calendar.seasonalFor` for the night's categories. A `seasonalCalendar` argument lets tests inject a calendar.
  - The brief returns `seasonal`.
  - The slot view adds `event: <name>`. The private writer copies slots as-is, and `candidates.parseSlot` keeps only
    n/category/area/era, so the writer repo needs no change.
- **`lib/question-writer/rules.cjs` (+ `.d.cts`):** `SEASONAL_RULE`, the `cell()` suffix, and `writer-v5`.
- **Tests:**
  - New `tests/lib.question-variety-seasonal.test.ts` (11 tests):
    - the file is valid against the draft map;
    - a bad file is refused;
    - date rules;
    - 10 days out gets a slot, 11 days out doesn't;
    - two events give one slot;
    - the Live category gate;
    - the total is unchanged;
    - the prompt text;
    - the brief.
  - Version pins updated in `tests/lib.question-writer.test.ts` and `tests/scripts.question-candidates.test.ts`.
- **Plan:** status line, Phase 7 "Built" note, D42 row.

### 5. Facts and traps
- **Dates are computed in UTC from `map.isoDay(today)`.** The writer runs at 00:30 UTC, which is the previous evening
  in the US. So "10 days out" is counted from the UTC date.
- **The real Oscars 2026 date was later than the rule gives** (the rule says 2026-03-08). Approximate dates are expected.
  Add `"exact": { "2027": "YYYY-MM-DD" }` once a date is announced.
- **On 2026-11-20 (tonight's run), Speed gets a Thanksgiving slot** (General Knowledge / Holidays and traditions), 6
  days out, once this ships.
- **`tests/components.live-trivia-quick-review.test.ts` can fail under full-suite load.** It passes alone. This is the
  known flake from 4f.2.

### 6. Verified
- `npx tsc --noEmit`: clean.
- `npx eslint` on the changed files: clean.
- `npx vitest run`: everything passes except the known flake, which passes on its own.
- `npm run build` (6 GB heap): passes.
- **Not yet verified live:** the first brief with a seasonal slot. After the merge, run
  `curl -H "Authorization: Bearer $QUESTION_WRITER_TOKEN" https://<site>/api/question-writer/brief?game=speed` (or read
  the next writer run's log). Expect `seasonal` to be set and one slot with `event`. Then check that the question is
  admitted with a normal tag.

### 7. Open questions for Andrew
- Approve the 20-event list (names, the category and area each one writes into, and the approximate dates)?

### 8. Recommended first steps
1. `gh pr view 29`. If it's merged, `git rebase origin/main` on `feature/seasonal-slots-phase7`, push, and open the
   PR.
2. Once Andrew approves the list, merge. Then do the step 6 check above.
