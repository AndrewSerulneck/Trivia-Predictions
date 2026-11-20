# Phase 7j handoff: code done; apply, merge, writer sync, post-nightly check still to do (2026-11-20)

## For Andrew
- **Done:** Sync Live Trivia can no longer run twice at once (a second run waits). A new test fails if any GitHub workflow calls an npm script that reads `.env.local`. The old 4c.10 handoff has a "historical" banner. Committed, not pushed.
- **Live?** No. **Waiting on you:** (1) OK to run `supabase db push` for three migrations (`20261119193552`, `20261120145222`, `20261120151403`; confirmed by `supabase migration list` as the only unapplied ones); (2) OK to push and merge the one PR for 7d–7j.
- **Cost:** $0.

## For the next agent
1. **Scope left (plan §4 "Phase 7j", Ship steps 2–6):** `supabase db push` (always ask Andrew first), verify each new function's behaviour with a read-only call or test insert + delete (as 4f.2); push `fix/second-review-remedials` and open ONE PR for 7d–7j (Andrew's OK); merge (OK); sync the private writer repo `AndrewSerulneck/hightop-question-writer` (7h handoff §1); after the next nightly (00:30 UTC) check Keep Queue tags and tag dollars, `llm_usage_logs` call counts, writer batch posted, Quick Review "Writer stopped" only when right; compare with 7e's baseline (nightly 3.5¢ on 253 OpenAI calls, Keep Queue 7.8¢ for 22 Keeps, 0 tag calls).
2. **State:** branch `fix/second-review-remedials`, last commit `074aa23c`, nothing pushed, no data changed. Untracked and not ours: two `docs/*_BACKFILL_LOG_*.json` files.
3. **Decisions:** Node 22 `--env-file-if-exists` switch NOT done (workflow uses node 20); follow-up only.
4. **Files:** `.github/workflows/sync-live-trivia.yml` (concurrency group `sync-live-trivia`, no cancel); `tests/workflow-env-file-contract.test.ts` (scans `npm run` in workflows vs `--env-file=` in package.json scripts; also pins the concurrency block); banner in `..._PHASE_4C10_HANDOFF.md`.
5. **Traps:** `npm run lint` fails on 309 parse errors in the gitignored `tmp/group-games-phase-4/` leftover (not tracked, not ours); eslint on changed files is clean. Delete or ignore `tmp/` only with Andrew's OK. Never `git checkout -- <file>`, stash or reset. No `timeout` command on this Mac.
6. **Verified:** tsc clean; 593 test files / 7,733 tests pass; `npm run build` succeeds; new test 7/7. Not verified: Live report-sheet real-browser check (7i), anything after the DB push.
7. **Open:** the two OKs above.
8. **Model:** Sonnet 5.5 / medium.
