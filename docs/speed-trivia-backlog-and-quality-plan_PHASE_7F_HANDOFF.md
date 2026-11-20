# Phase 7f handoff: Speed → Live conversions can't get stuck (2026-11-20)

Also covers the thin Live categories fix, done the same session before 7f, with Andrew's approval.

## For Andrew

- **Thin Live categories: fixed and live now.**
  - **63 new Live areas are on production:**
    - Science & Tech: 20 more (25 in all).
    - Geography: 20 more (25).
    - Art, Literature and Comics: 19 more (25).
    - History & Government: 4 more (52 area/era slots).
  - The writer reads areas from the database, so the next Live night uses them. No deploy needed for that part.
  - **Safety net (needs the merge):** a category with fewer slots than the night needs now reuses its slots, rather
    than sending questions out with no area.
  - **Movies on 11-18 was a different problem.** The writer left the area off all 24 questions. The Music night (11-19)
    and the Science night (11-20) both carried areas, so that looks fixed.
- **7f: "Make Live" requests can no longer get stuck.**
  - A Live night with only Make Live rewrites no longer hides the "Writer stopped" warning.
  - A rewrite posted late, or left behind by a crash or a busy night, still gets processed. After 3 days, a stranded
    request is either marked done or sent again.
  - A rewrite that doesn't fit Live's format now shows "ChatGPT's rewrite didn't fit Live's format." It is no longer
    re-sent every night, and it no longer fails the writer's job.
  - A rewrite the nightly couldn't afford to check goes back in the queue. It no longer shows as a failure.
  - A Make Live on a Speed question you later reject now shows "The Speed question wasn't kept."
  - In Quick Review, Undo after L no longer cancels an earlier, separate Make Live.
  - If the conversion read fails, the Live brief now goes out without the conversions instead of not at all.
- **Is it live?** Only the 63 areas are. Everything else is committed on `fix/second-review-remedials` and not pushed.
  7f's database change waits for 7j, which asks you before applying it.
- **Cost:** $0. No paid calls, no new env var, no new scheduled job. The nightly adds one small database call.
- **Needs you:** nothing now. The 7d questions are still open (§7).

## For the next agent

### 1. Next phase and scope

- **Next: 7g** (Opus 5.5 / high): plan §4 "Phase 7g — Live Publish, Speed answers, Admin edits" (R2 #20.1–#20.5,
  #20.7, #20.9). Same branch.
- **Out of scope here (not done):**
  - Pushing, the PR, applying `20261120145222` and the merge: all 7j, with Andrew's OK.
  - The writer's log line (`tools/question-writer/write.mjs`) doesn't print the new `failed` count. It still treats
    the 200 as saved, so no private-repo sync is needed for 7f.

### 2. Starting state

- **Branch:** `fix/second-review-remedials`. Nothing pushed. Commits added this session:
  - `94651823`: thin-category fix (`slots.cjs` cell reuse + `variety-map-v3`).
  - The 7f commit (code, tests, migration, this note, plan updates); see `git log`.
- **Migrations not applied:**
  - `20261119193552` (7d).
  - `20261120145222_live_conversions_cant_get_stuck.sql` (7f).
  - 7j applies both with Andrew's OK.
- **Production data changed (with Andrew's OK, 2026-11-20):** 63 rows inserted into `question_coverage_areas`
  (game `live`), all `created_by = 'seed:variety-map-v3'`.
  - Run with `node --env-file=.env.local scripts/seed-question-variety-map.cjs --game live --apply`. The dry run first
    showed exactly 63.
  - **Undo:** delete those rows by `created_by`, but only while no Live question is tagged to them.
  - Andrew can also switch areas off on Admin → Trivia Questions → Variety.
- **Production state (read-only checks, 2026-11-20):**
  - `live_conversion_requests` is empty and there are no conversion candidates, so the first sweep has nothing to do.
  - Every 7f finding was latent.
- **Left untracked on purpose (not ours):**
  - `docs/cancelled-prizes-pick-windows-away-mode-plan_C1_BACKFILL_LOG_2026-11-09.json`
  - `docs/partner-business-type-plan_PHASE_1_BACKFILL_LOG_2026-11-12.json`

### 3. Decisions (Andrew's, and the agent's own calls)

- **Andrew (2026-11-20):**
  - "Sounds good. Do that, then execute 7f." That approved:
    - the area lists as proposed;
    - adding them to production;
    - the cell-reuse safety net.
- **Agent:**
  - **The sweep's stranded `sent` rule is narrower than the plan.** The plan says a `sent` request older than 3 days
    whose candidate is gone or settled goes back to `queued`. The sweep does that, except when the candidate reached
    Live review (it has a `question_ref`): then the request becomes `done`, as the nightly would have set it. Without
    that exception, a Live version waiting in review could be written again, and the second copy would fail as a
    repeat of the first.
    - A candidate still `received` is left alone, because the nightly reads it.
  - **R2 #27.1 by dropping the foreign key `question_candidates_run`.**
    - Conversion candidates must exist without a run row.
    - Nothing joins candidates to runs.
    - `question_writer_receive` still creates the run row before inserting regular items.
    - `service_role` can only select runs, so they can't be deleted.
  - **The sweep runs inside `processLiveDay`, first.** A sweep failure is logged (`warn`) and the night goes on;
    `report.sweep` holds its counts or `null`.
  - **Budget-skipped conversions re-queue with `reason = null`.** "Sent again" is used only by the sweep. A queued
    request's reason isn't shown in the list anyway.
  - **"Received today" means a conversion candidate exists for today's run date.** The brief checks that. A
    declined-only or invalid-only post makes no candidate, so a re-run could send the next queued ones. That's harmless:
    those requests are already settled.
  - **Thin categories:** `spread()` cycles through the sorted cells (least covered first) once every cell has a slot.
    `fallbackSlot` stays only for a category with no active area. When the only cell is the seasonal one, it is
    reused without its event.

### 4. Files changed

- **Thin-category commit `94651823`:**
  - `lib/question-variety/slots.cjs`: `spread()` reuses cells. `chooseSlots` falls back to the full list when only
    the seasonal cell was left. Header comment updated.
  - `data/question-variety/draft-map.json`: `variety-map-v3`, 63 Live areas. "Presidents and first ladies" and "The
    Constitution and Supreme Court" use eras 1500-1799 → 2000-present.
  - `tests/lib.question-variety.test.ts`: 24 slots from 5 cells all have areas; Current Events reuses cells.
  - `tests/lib.live-trivia-quality.test.ts`:
    - Every `AREA_SUBCATEGORIES` entry must be on the map.
    - New areas use the slug fallback (`subcategoryFor`).
- **7f:**
  - `supabase/migrations/20261120145222_live_conversions_cant_get_stuck.sql`:
    - drops the FK `question_candidates_run`;
    - `create or replace live_conversion_receive`: no run-row insert; new item `{requestId, invalid: true}` → `failed`;
      returns `failed`;
    - new `live_conversion_sweep()`: returns `{failed, requeued, done}`; SECURITY DEFINER, `service_role` only.
  - `lib/question-writer/candidates.cjs` (+ `.d.cts`): `parseConversions` sends an invalid rewrite as
    `{requestId, invalid: true}` and throws 422 only when no entry has a valid request id. `receiveConversions`
    returns `failed`.
  - `lib/question-writer/brief.cjs` (+ `.d.cts`):
    - `conversionsReceivedOn(client, runDate)` (≤ 1 row).
    - The conversion reads are wrapped in try/catch with `warn` (a new optional `buildBrief` input).
  - `lib/question-writer/liveProcess.cjs`:
    - `readReceived` reads regular items only (`slot->>kind` is null, ≤ `MAX_ITEMS`).
    - New `readConversionCandidates` (`received`, `kind = conversion`, `run_date <= today`, oldest first,
      ≤ `MAX_CONVERSIONS`).
    - New `requeueRequest`.
    - `processLiveDay` runs the sweep first, proceeds without a run row, and requeues on a budget skip.
    - The report adds `conversions.requeued` and `sweep`. New optional input `warn`.
  - `app/api/question-writer/conversions/route.ts`: comment only (an all-invalid post now answers 200 from the parser).
  - `components/admin/sections/SpeedTriviaQuickReview.tsx`: L records `live: !already` (R2 #27.8).
  - `components/admin/sections/TriviaListSection.tsx`: `toggleLive` is an arrow function (R2 #27.10).
  - **Tests:**
    - `tests/live-conversion-requests-sql.test.ts`:
      - loads the new migration; receive creates no run row; invalid → failed; three sweep tests; sweep grants;
      - **the flaky brief test is fixed:** `queue()` gives each new request its own `requested_at`, 1 s apart.
    - `tests/scripts.live-question-candidates.test.ts`:
      - the fake client gains JSON-path filters, `is` and `lte`, and the sweep rpc;
      - four new tests: no run row, earlier-day pickup, budget requeue, sweep failure.
    - `tests/lib.question-writer.test.ts`: brief fake per table; re-run sends no conversions; a failed read is logged
      and skipped; invalid rewrites are parsed as failed.
    - `tests/api.question-writer.test.ts`: an all-invalid post answers 200 with `failed`. "Nothing usable" is now a bad
      request id.
    - `tests/components.speed-trivia-quick-review.test.ts`: L then Z with `already: true` sends no DELETE.
  - **Plan doc:** top table, status line, 7f heading.

### 5. Facts and traps

- **PostgREST JSON-path filters work on production:**
  - `.is('slot->>kind', null)` returned all 24 of 2026-11-20's Live items.
  - `.eq('slot->>kind', 'conversion').lte('run_date', …)` ran without error (0 rows).
  - Both checks were read-only.
- **Live slot n:** conversion slots are numbered 1..k among rewrites only; invalid entries don't take a number.
  `processLiveDay` sorts only regular items by `slot.n`.
- **Seed script:** it only ever adds areas (matched by game, category and normalized name). `--game live` limits it.
  It needs `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` from `.env.local` via `--env-file`.
- **Scratch scripts** that import `@supabase/supabase-js` from the scratchpad need the absolute path
  `node_modules/@supabase/supabase-js/dist/index.mjs`. Bare imports don't resolve outside the repo.
- Never `git checkout -- <file>`, `git stash` or `git reset`.

### 6. Checks run (2026-11-20)

- Targeted: conversion SQL 16, Live nightly 19, writer lib 26, writer API 10, Quick Review + Make Live components 20,
  variety 26 + 17 + Live quality 30. All green.
- `npm run test` → 591 files passed, 1 skipped; 7,677 tests passed, 13 skipped.
- `npx tsc --noEmit` → clean.
- `npx eslint` on every changed file → clean.
- `npm run build` → success (run after the typecheck, not at the same time).
- `/verify` (browser) not run: no game page changed. The UI changes are an Admin undo detail and an arrow-function
  refactor, both covered by component tests.
- **Unverified until 7j applies the migration and merges:**
  - `live_conversion_sweep` and the new `live_conversion_receive` on real Postgres (PGlite only);
  - the first nightly with the sweep call.
  - **If the code deploys before the migration is applied, the sweep rpc errors.** That's harmless: it is caught and
    logged. But a conversion post on such a day still creates a run row through the old receive, so apply the
    migration with the merge.

### 7. Open questions for Andrew

- From 7d, still open:
  - Are you OK with "a question may return to its own reserved fact"?
  - One PR for 7d–7j, or one per phase?

### 8. Recommended first steps for 7g

1. `git switch fix/second-review-remedials`. Read plan §4 "Phase 7g" and the ground rules ("Remedial phases 7d–7j").
2. 7g shares no files with 7f's Live processor, except possibly the Live publish helpers. Check `git log -p` for
   `lib/live-trivia-quality/` before editing.
3. Model: **Opus 5.5 / high** (plan's top table).
