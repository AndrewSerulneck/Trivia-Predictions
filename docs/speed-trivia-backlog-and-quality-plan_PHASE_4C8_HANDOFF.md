# Phase 4c.8 handoff: old player screens can't mis-grade; the star cap holds on edits

Plan: `docs/speed-trivia-backlog-and-quality-plan.md` §4 "Phase 4c.8" (post-4c.4 review #1 and #4). Done 2026-11-17
on Opus 5.5 / high (the plan's tier).

## For Andrew (plain English)

- **What changed:**
  - **Speed scoring is safe during the deploy.** A browser tab or app screen still running the old version could
    have scored a right answer as wrong, permanently. Now the server turns that tap away with "Refresh to keep
    playing." and records nothing. A time-out still counts as wrong, as before. The new screen drops any questions
    saved by the old version and loads fresh ones.
  - **The 5-per-subject limit also holds when you edit a question.** Before, editing an approved question could
    move it into a subject that already had 5 approved questions. Now Admin shows "Subject full." and saves
    nothing. A database rule backs this up. The edit still costs one Gemini call (about $0.0001), as before.
- **Is it live?** No. It is uncommitted on `feature/speed-trivia-variety`. Nothing was committed, pushed, deployed
  or applied.
- **Database:** one new migration, `20261117135338_speed_trivia_tag_cap.sql`. It is written and tested on a
  throwaway database only, and **not applied**. Phase 4c.10 applies it with your OK. No data changed, and no paid
  call was made.
- **Checks:** typecheck (source), lint (project folders), and `npm run test` (578 files, 7,519 tests) all pass.
  The build wasn't run; 4c.10 runs it.
- **Needs you:** nothing now. Next comes 4c.9.

## For the next agent

### 1. Next phase and scope
Next is **Phase 4c.9** (Live Publish: slugs, expired entries, the review queue in SQL, matchable answers; post-4c.4
review #2, #3, #5, #6). It is fully specified in the plan's §4. It doesn't touch any 4c.8 file. Out of scope for
4c.9: applying migrations (4c.10 does that) and anything in D23.

### 2. Starting state
- Branch `feature/speed-trivia-variety`. Last commit is `1aa32e4e` (PR #19 merge). All work from 4a to 4c.8 is
  uncommitted (about 155 paths). Never `git checkout -- <file>`, `git stash` or `git reset`. Finder duplicates with a
  ` 2` suffix exist (e.g. `tests/venue-screen-brand-stage-tier-contract.test 2.ts`); don't commit them.
- Production: untouched this phase. No reads, writes or paid calls.
- Waiting migrations: `20261117135338_speed_trivia_tag_cap.sql` (this phase), and 4c.10's own when it's written.
  The 4c.2, 4c.3 and 4c.7 migrations are already applied (4c.4 handoff).

### 3. Decisions made (don't re-ask)
- **#1:** implemented exactly as the plan says. Beyond the plan:
  - `PlayerTriviaQuestion.order` is now **required** (`order: 1`, `types/index.ts`). The server always sets it, and
    the client drops anything without it.
  - A saved round snapshot with **any** unmarked question is dropped whole. Indices into the round would shift
    otherwise.
  - `fetchTriviaQuestions` doesn't filter the GET. If a new screen ever hit an old server, the old server ignores
    `order` and its options are in stored order, so the grade is still right.
- **#4:** implemented as the plan says, with three details:
  - **Trigger grants:** `guard_speed_question_tag()` has EXECUTE revoked from `public, anon, authenticated` **and
    `service_role`**, exactly like `guard_speed_trivia_write()`. A trigger function can't be called directly, and
    Postgres doesn't check EXECUTE when a trigger fires (the PGlite tests run as `service_role` and the trigger still
    fires). `speed_trivia_subject_has_room` is `service_role` only. The plan's 4c.10 step 4 is updated to match.
  - The trigger fires on `update of game, question_ref, subject_key` (the plan said `subject_key`). Adding the other
    two closes the gap of moving a tag by changing its ref.
  - If the room RPC can't answer (error, or not applied yet), the edit is saved and the trigger decides at the tag
    write. If the trigger refuses, the old tag stays and the server logs `Tag not changed: subject full.`. So the
    code degrades safely if the migration isn't applied, but 4c.10 must still apply it **before** the deploy.

### 4. Files

**#1, version skew:**
- `app/api/trivia/route.ts`: before `submitTriviaAnswer`, `answer >= 0 && order !== 1` → 409
  `{ ok:false, error:"Refresh to keep playing.", code:"refresh" }`. This runs after the session and presence checks,
  so 401 and presence errors keep their precedence. `submitTriviaAnswer`'s `shownOrder` default (stored order) is
  unchanged for scripts.
- `components/trivia/TriviaGame.tsx`:
  - `normalizeTriviaQuestion` returns `null` without `order: 1`.
  - The snapshot reader rejects a round if any question was dropped.
  - `chooseAnswer` always sends `order: 1`. `forfeitQuestion` still sends -1 unmarked, which the route accepts.
- `lib/warmupCache.ts`: `readWarmTriviaCache` returns `null` if any question lacks `order: 1`, or if `questions`
  isn't an array.
- `types/index.ts`: `order: 1` is required, and the comment is updated.

**#4, star cap on re-tag:**
- `supabase/migrations/20261117135338_speed_trivia_tag_cap.sql`:
  - `guard_speed_question_tag()` is a `before insert or update of game, question_ref, subject_key` trigger on
    `question_tags`, SECURITY DEFINER, `search_path = pg_catalog, public`. It:
    1. passes Live tags, a null subject and a non-uuid ref (the `question_tags_speed_ref` CHECK refuses that one
       later);
    2. reads the **stored** tag's subject_key and passes if it's unchanged;
    3. locks `speed_trivia_control` (`for update`);
    4. passes if the row isn't active `anytime_blitz`;
    5. counts the other active Speed rows with the new subject and raises `star-cap` at 5 or more.
  - `speed_trivia_subject_has_room(text, uuid) returns boolean` uses the same count, excludes the row itself, and
    is `service_role` only.
- `lib/question-variety/tagging.cjs` and `tagging.d.cts`: `tagOne({ ..., write: false })` returns the computed
  `TagRow` (or `null`) without writing it. The default `write: true` is unchanged.
- `lib/speedTriviaTagging.ts` adds four functions:
  - `computeSpeedTag(row)`, which is `tagOne` with `write:false`;
  - `readSpeedSubjectKey(id)`, one indexed read;
  - `speedSubjectHasRoom(key, id)`, the RPC; it returns `true`, `false` or `null` (couldn't tell);
  - `writeSpeedTag(tag)`, an upsert that logs on `star-cap` and never throws.
- `lib/speedTriviaAdmission.ts` (`writeSpeedTrivia`), when the existing row is active Speed, the edited row stays
  active Speed, and `changedContent` is true:
  1. compute the tag before `gate.write`;
  2. if its subject_key differs from the stored one and the RPC says `false`, throw
     `AdmissionError("subject_full")` (the existing `speedTriviaError` returns 409; Admin shows "Subject full.");
  3. otherwise save, then `writeSpeedTag`.

  All other saves (new, waiting, leaving approval) follow the old path: tag after the save.
- `scripts/tag-questions.cjs`: `writeTags` returns `{ written, refused }`. On a `star-cap` batch error it retries
  row by row. `run()` returns `refusedSubjectFull: [ids]`. `writeTags` is exported for the test.

**Tests:**
- `tests/api.speed-trivia-answer-order.test.ts`: the old "without order" tests are replaced. Picks 0–3 unmarked get
  409 and nothing is inserted; `order: 2` gets 409; an unmarked -1 is accepted and graded wrong.
- `tests/components.speed-trivia-answer-reveal.test.ts`: a pick is always `order: 1`. An unmarked or half-unmarked
  snapshot is ignored, the GET runs, and nothing is posted.
- `tests/lib.warmup-cache-trivia-order.test.ts` (new): the warm cache is ignored when unmarked.
- `tests/lib.speed-trivia-tagging.test.ts`: 8 new tests cover:
  - full subject → 409, no save, one Gemini call;
  - room → one call, the new tag;
  - same subject → no RPC;
  - Gemini fails → saved, old tag kept;
  - RPC down → saved;
  - a race → log;
  - waiting or leaving rows → the old path;
  - `tagOne` `write:false`.
- `tests/speed-trivia-tag-cap-sql.test.ts` (new, PGlite): 9 tests cover:
  - refusal on update, upsert and insert;
  - 4 others allowed; retired, waiting and Live rows don't count;
  - waiting and retired rows allowed;
  - an unchanged subject passes even over the cap;
  - Live ignored;
  - a malformed ref is left to the CHECK;
  - the `has_room` count;
  - the `has_room` grants.
- `tests/scripts.question-variety.test.ts`: two new tests. A batch with one refused row writes the rest, and `run`
  reports `refusedSubjectFull`.

### 5. Facts and traps
- **An upsert fires the BEFORE INSERT trigger first, even when the row exists** (`insert … on conflict do update`).
  That's why the trigger compares against the stored tag, not `TG_OP`/`old`. `tagOne`, `tag-questions.cjs`, the
  writer (`lib/question-writer/process.cjs:184`) and `lib/liveTriviaReview.ts` all upsert.
- **Subject keys keep spaces:** "Komodo dragon" → `komodo dragon`, not a slug.
- **The one-time 4a.2 thinning script (`scripts/speed-trivia-thin-subjects.cjs`) would now be refused** if re-run.
  Its alias merge (line ~555) and its undo's alias restore (line ~686) write `question_tags.subject_key` directly,
  so moving an active row into a subject with 5 other active rows raises `star-cap` and the script throws. It
  already ran (2026-11-17), so nothing is pending. Rewrite the order (retire first) before any future run.
- **Admin bulk edit (`lib/admin.ts` ~line 894)** loops `writeSpeedTrivia` row by row and already stops on the first
  error. A bulk category change that moves an active row into a full subject now stops there with 409. Rows before
  it are saved.
- **One pre-deploy interrupted question isn't forfeited:** an old round snapshot is now dropped without the forfeit
  POST. This happens once per player at most, during the deploy.
- `npx tsc --noEmit` prints errors only from `.next/dev/types/validator.ts`, which is stale route types from
  Andrew's dev server for removed `/tv`-pair routes. Source is clean (`npx tsc --noEmit | grep -v '^\.next/'` is
  empty).
- PGlite fixtures that insert `trivia_questions` with triggers off must set `normalized_question_key` (NOT NULL).
  `question_tags.era` needs an `area_id` (`question_tags_era_needs_area`).

### 6. Build, run, test
- Phase tests:
  `npx vitest run tests/api.speed-trivia-answer-order.test.ts tests/components.speed-trivia-answer-reveal.test.ts tests/lib.warmup-cache-trivia-order.test.ts tests/lib.speed-trivia-tagging.test.ts tests/speed-trivia-tag-cap-sql.test.ts tests/scripts.question-variety.test.ts`
- Verified:
  - `npx eslint lib app components scripts tests types` is clean;
  - `npx tsc --noEmit` has no source errors;
  - `npm run test`: 578 files passed and 1 skipped; 7,519 tests passed and 13 skipped.
- **Unverified:**
  - the build (4c.10);
  - the migration on real Postgres or Supabase (PGlite only). The concurrency guarantee from the control-row lock
    is reasoned, not tested, because PGlite has one connection;
  - an old tab against the new server in a browser (4c.10 step 7).

### 7. Open questions
None.

### 8. First steps for 4c.9
Read the plan's "Phase 4c.9" and the shared ground rules above it. Start with #2 (Live Publish slug reservation in
`lib/live-trivia-quality/publish.cjs`). Model and effort: **Opus 5.5 / high**.
