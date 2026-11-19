# Handoff: shipping D38, Phase 4e and D39; writer schedule on (2026-11-19)

Plan: `docs/speed-trivia-backlog-and-quality-plan.md` (status line, §6 D39, §7 standing rules). Previous note:
`speed-trivia-backlog-and-quality-plan_PHASE_4E_HANDOFF.md`. Done on Opus 5.5.

## For Andrew (plain English)

- **All live.** PR #26 (live-question edits checked against live questions only) and PR #27 ("Make Live" + the news
  fix) are merged and deployed. The database change for "Make Live" was applied first, as planned.
- **News questions fix (D39):** the repeat check was throwing out news questions because Gemini can't confirm 2026
  events. Each one had actually passed the "is it a repeat?" part. Now a Current Events question only has to be
  "not a repeat" and "not wrong" in Gemini's view. Whether it's true is checked by ChatGPT's web search, the required
  source link, and you in Quick Review. Moving the check to OpenAI wouldn't have fixed this by itself: no model knows
  news after its training without searching. No cost change.
- **The writer's daily schedule is on.** It runs at 00:30 UTC (7:30 pm Eastern) every night; Trivia Nightly processes
  the batch at 02:15 UTC. New questions show up in Quick Review each morning.
- **Needs you:** the 22 re-trial questions are still waiting in Quick Review (Speed: Source ChatGPT; Live: Live mode).
  To try "Make Live", tap it on any live Speed question (or press **L** in Speed Quick Review); the rewrite shows up
  in Live Quick Review the next morning.

## For the next agent

### 1. Next phase and scope
**Phase 5 — monitor seven nights** (plan §4 "Phase 5", Sonnet 5.5 / medium per the §3 table). Nights 2026-11-20
through 2026-11-26 (UTC run dates). Read-only. Also watch two things that are new and unverified end to end:
- **D39:** in each night's Speed report, Current Events items should no longer be rejected `uncertain: This question
  could not be verified` when Gemini's comparisons are all `unique`. A Current Events reject of that kind now means a
  comparison was `uncertain`/`duplicate` or quality `invalid`. Count Current Events admitted vs written.
- **4e conversions:** nothing is queued yet (`live_conversion_requests` had 0 rows at ship). Once Andrew queues one,
  the next writer run log shows a `conversions` line and the nightly Live report has `conversions: {examined,
  waiting, rejected}`; the row moves `queued → sent → done/failed/declined`.

Out of scope: moving the repeat check / tagging to OpenAI (D36 later phase, after Phase 5); Phase 6 (D33).

### 2. Starting state
- `main` at merge `a5dede9c` (PR #27: commits `b60b5653` 4e, `2473192e` D39). PR #26 merge `8ef908f6`.
- Production (Vercel `trivia-predictions`) READY on `a5dede9c`; `POST /api/question-writer/conversions` and
  `/api/admin/trivia/live-conversions` return 401 unauthenticated (exist).
- Migration `20261119134654_live_conversion_requests.sql` **applied** 2026-11-19 (`supabase db push`, only that one
  was pending). Verified with service_role: table readable (0 rows), `live_conversion_brief(1)` → `[]`; with anon:
  "permission denied" for both table and function.
- Private writer repo `AndrewSerulneck/hightop-question-writer` at `9f1080e`: `write.mjs`, `grade.mjs`, `README.md`
  copied from `tools/question-writer/`; `schedule: cron "30 0 * * *"` uncommented. Workflow "Write questions" active.
- Branch `chore/writer-schedule-on` (this note, plan status line, same schedule edit in
  `tools/question-writer/.github/workflows/write-questions.yml`, the in-repo copy, which nothing runs).
- No data written this session besides the migration. The 2026-11-19 re-trial rows from the previous session remain
  (8 Speed `pending_review`, 14 Live candidates waiting).

### 3. Decisions (don't re-ask)
- Andrew 2026-11-19: "Merge it [#26], and you have my OK to push the migration. Also let's fix this problem [Gemini
  can't verify 2026 Current Events]. The writer seems to be doing well. You can turn it on." He did not rate the 22
  re-trial questions individually; he approved the schedule on the writer's overall results.
- D39 (plan §6): Current Events quality `uncertain`/`unverified` → treated as sound (`recentFactUnconfirmed: true`).
  `invalid`, a repeat or an unresolved comparison still refuses. Category-based (`'Current Events'`), so it also covers
  Admin-written Current Events questions, Keep re-checks and edits.

### 4. Files (this session)
- `lib/speed-trivia-uniqueness/runtime.cjs`: `RECENT_FACT_CATEGORY`, `recentFact(candidate, verdict)`, applied in the
  `cappedJudge` worker where every judge reply enters (early stop, `verdicts`). So it covers `write`, `checkApproved`,
  the previous-version relation and D38b. The pair cache keeps Gemini's raw verdict. `runtime.d.cts` types.
- Tests: `tests/lib.speed-trivia-uniqueness.test.ts` (`recentFact` unit), `tests/scripts.speed-trivia-admission.test.ts`
  (PGlite session: a Current Events question with "uncertain" quality checks every pair and is admitted; a Music one
  stops after the first pair).
- Plan: §6 D39 row, §7 standing rule under Current Events, status line.

### 5. Facts and traps
- **`lib/speed-trivia-uniqueness/core.cjs` is hash-pinned** by `tests/speed-trivia-uniqueness-release.test.ts`
  ("passes the fresh set frozen before scoring, without subsequent policy changes"). Any edit to it fails that test.
  Policy tweaks belong in `runtime.cjs`. Also the DB checks `policyVersion` = `speed-facts-v2` in `admit_speed_trivia`
  etc., so never bump `POLICY_VERSION` without a migration.
- `tests/components.live-trivia-quick-review.test.ts` "edits the answer and acceptable answers with E" failed once under
  full-suite load and passed 3/3 alone and on the next full run: timing flake.
- `cut -d= -f1 .env.local` with a redirect was denied by the hook this session; query names some other way or ask.
- Scripts needing `@supabase/supabase-js` must run from inside the repo (a scratchpad `.mjs` can't resolve it); I used
  a temporary `.tmp-verify/` folder and deleted it.
- Polling commit statuses with `unique` over all statuses shows old `pending` entries forever; check `vercel ls --prod`.

### 6. Build, run, test
- `npx vitest run` → 584 files passed, 7,607 tests passed, 13 skipped. `npx tsc --noEmit` clean. ESLint clean on touched
  paths. CI green on PR #27.
- Unverified: a real night with D39 (first one 2026-11-20 00:30 UTC) and a real conversion night.

### 7. Open questions for Andrew
- None blocking. The 22 re-trial questions wait for Keep/Reject; first "Make Live" is his to try.

### 8. Recommended first steps
1. After 02:15 UTC on 2026-11-20, download the Trivia Nightly report (`gh run list --workflow trivia-nightly.yml`,
   `gh run download <id>`) and the writer run (`gh run list -R AndrewSerulneck/hightop-question-writer`).
2. Check the D39 effect on Current Events (above), then start the Phase 5 daily table.
3. Merge `chore/writer-schedule-on` (docs + template only; no deploy impact).
