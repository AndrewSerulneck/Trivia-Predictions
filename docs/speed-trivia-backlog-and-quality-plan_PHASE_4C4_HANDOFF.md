# Phase 4c.4 handoff — writer-stopped warning, re-score version, checks

Plan: `docs/speed-trivia-backlog-and-quality-plan.md` §4 "Phase 4c.4". Done 2026-11-17 on Sonnet 5.5 / medium (the plan's tier).

## For Andrew (plain English)

- **What changed:** Quick Review now shows "Writer stopped" in **both** Speed and Live when no batch has arrived for
  more than 2 days, or the last two days were both the Gemini fallback. Nothing shows before the writer's first run.
  The free re-score script no longer stamps newer (v3/v4) scores as `bar-test-v2.1`.
- **Is it live?** No. Uncommitted on `feature/speed-trivia-variety`. Nothing was committed, merged or deployed.
- **Database:** the three waiting migrations (4c.2, 4c.3, 4c.7) are **already applied** on production (the migration
  list shows them on both sides, `question_reports` exists and is empty). I did not push anything. Their grants check
  out: `service_role` only, no `anon` / `authenticated`; RLS forced on `question_reports`.
- **Checks:** lint (project folders), `npm run test` (576 files, 7,489 tests), `npm run build` all pass.
- **Needs you:** your word for the D23 commit, merge and deploy. Then re-enable Trivia Nightly once the deploy is
  READY (`gh workflow enable trivia-nightly.yml`).

## For the next agent

1. **Goal:** the D23 commit / merge / deploy (each step on Andrew's word), then Phase 4d (the writer trial). Out of
   scope: any Admin screen for reports; auto-acting on reports.
2. **State:** branch `feature/speed-trivia-variety`, last commit `1aa32e4e`; ~151 uncommitted paths (all 4a–4c.7 work).
   Never `git checkout -- <file>`, `git stash`, `git reset`. Finder duplicates with a ` 2` suffix exist; don't commit them.
   Production: read-only queries only this phase; no data changed, no paid call.
3. **Decisions:** D29 as written. `writerStopped` stays a boolean in both API responses (true for `silent` or `fallback`).
   "Over 2 days" is counted in whole UTC days (run dates are dates): a run 2 days ago is fine, 3 days ago is stopped.
4. **Files:** `lib/speedTriviaQuickReview.ts` (`readWriterState(game)` → `'none'|'silent'|'fallback'|'ok'`;
   `readWriterStopped(game='speed')`), `app/api/admin/trivia/live-review/route.ts` (GET adds `writerStopped`),
   `types/liveTriviaReview.ts`, `components/admin/sections/LiveTriviaQuickReview.tsx` (banner),
   `scripts/rescore-speed-trivia-checks.cjs` (stamp only v0–v2 scores). Tests: `tests/api.admin.speed-trivia-quick-review.test.ts`,
   `tests/api.admin.live-review.test.ts`, `tests/scripts.speed-trivia-rescore.test.ts`.
5. **Facts / traps:**
   - Turning the writer schedule off after the 4d trial will show "Writer stopped" after 2 days. That's correct.
   - Plain `npm run lint` fails on 300+ errors from the scratch folder `tmp/`; lint the project dirs:
     `npx eslint lib app components scripts tests types`.
   - `npx tsc --noEmit` printed no source errors after the build regenerated `.next/types`.
   - Production check 2026-11-17: 0 Speed rows with NULL category; 0 Current Events; 0 writer runs; 0 reports; 6 marks at
     `bar-test-v2.1` (the 3d re-score). The 3,454 active/waiting rows with no tag are all `live_showdown` (Live isn't
     tagged); Speed has 0 untagged.
   - The Live Quick Review flake from 4c.7 (`components.live-trivia-quick-review` timeout) did not recur.
6. **Run:** `npx vitest run tests/api.admin.live-review.test.ts tests/api.admin.speed-trivia-quick-review.test.ts tests/scripts.speed-trivia-rescore.test.ts`.
   **Unverified:** the banner in a browser; the report route against the real table (do one real report per game after
   the deploy, run `npm run trivia:reports`, then `--resolve <id> --yes` the test report).
7. **Open questions:** none; waiting only on Andrew's OK to commit / merge / deploy.
8. **First steps:** ask Andrew to confirm the commit; commit in sensible groups; PR; merge; deploy; confirm READY;
   `gh workflow enable trivia-nightly.yml`; smoke-test reports; start 4d.
