# Speed Trivia Phase 5 code review — 2026-10-13

The review found one maintenance issue in the one-time audit helper. **Fixed and committed on 2026-10-13 at Andrew’s request; verification passed.** Startup errors now release the audit lock, and worker failures retain it until every in-flight request finishes. The fix does not affect player gameplay or the nightly generator. No paid calls or production changes were made. Completion and next-agent details are recorded below and in the Phase 5 handoff.

## Scope and starting state

Reviewed application changes from `602aab932bea3d8bf694e8b77aaa1119347e9676` through deployed application commit `0b1f5e819971673ed617b2c1ef98f239c57e2096`, with documentation HEAD `e58a4e506c9692d2dbe134302a0f973447437d82` on `main`. Focus: provider label binding, deadline/error handling, spending reservations, cleanup inventory and keeper drift, resumable audit processing, and approved-only GitHub exports. Existing unrelated changes to `next-env.d.ts` and `.vscode/settings.json` were left alone.

## Finding

**P2 — Audit startup failures leave a stale spending lock.** In `scripts/audit-speed-trivia-refresh.cjs:20`, `openBudget()` acquires the persistent `budget.jsonl.lock`, but the cleanup `try/finally` starts only at line 58. Cache parsing, provider initialization, and journal parsing or model-version validation can throw between those points. The lock is then left behind after a handled ordinary error, so a subsequent attempt fails with `EEXIST` even after the underlying input is repaired. The documented recovery requires checking the recorded PID before removing a stale lock; never remove one belonging to a live process.

Confirmed offline with a synthetic one-row corpus, an empty task plan and malformed `pair-cache.jsonl`: startup rejected with `SyntaxError`, the lock remained, and provider request count was zero. The temporary reproduction directory was removed afterward. No existing audit evidence or locks were touched.

Recommended correction at review time: put all initialization after successful budget acquisition inside the cleanup scope. Ensure all started workers have settled before releasing the lock, including when a worker encounters a filesystem error; the original `Promise.all()` permitted early rejection while other workers were still running. Preserve persistent reservations and crash recovery, and add a synthetic initialization-failure regression. This correction is now implemented locally as detailed below.

## Verification and limits

Ran:

```sh
npx vitest run tests/api.admin.speed-trivia-export.test.ts tests/scripts.speed-trivia-admission.test.ts tests/scripts.speed-trivia-provider-labels.test.ts tests/scripts.speed-trivia-cleanup-inventory.test.ts tests/scripts.speed-trivia-retirement.test.ts tests/lib.speed-trivia-semantic-provider.test.ts tests/speed-trivia-uniqueness-release.test.ts
```

Result: **40 tests passed across 7 files**, zero failures or unhandled errors. These include isolated SQL admission, provider label mismatch refusal, deadline versus pre-deadline outage handling, bounded corpus reads, keeper drift, revision-consistent export and retired-only export deletion. Providers and GitHub were mocked; no paid calls or production mutations occurred.

No additional gameplay regression was identified in the reviewed changes. This is not a guarantee that all defects are absent. The release handoff retains the original raw pilot failures and their limitations; this review does not replace those reports with a clean live run. No third paid pilot is authorized. Future scheduled runs remain useful operational observation.

## Fix completion — 2026-10-13

- `scripts/audit-speed-trivia-refresh.cjs:run`: cleanup scope begins immediately after successful budget acquisition. All six workers are awaited with `Promise.allSettled`; an unexpected worker error stops further task dispatch and retries, and is rethrown after all started workers finish. Existing provider-error partial-report behavior remains intact. Ledger reservations are neither deleted nor reset.
- `tests/scripts.speed-trivia-audit-lock.test.ts`: nine offline regressions cover malformed cache, malformed old/current journals, model drift, provider initialization failure, an existing lock owned by another run, unsettled reservations across restart, worker journal-write failure with five other requests in flight, and successful artifact creation. Tests use temporary synthetic evidence and mocked providers; `fetch` is explicitly forbidden.
- Cost: normal runs retain six-worker concurrency, the same request ceilings and ledger writes. Zero additional network calls or cloud data transfer per run; zero daily/monthly recurring cost increase. A fatal worker failure now prevents further tasks/retries, potentially reducing failed-run spending. Verification cost was $0.
- Checks: **30 tests passed across 6 files**, clean TypeScript check, ESLint for the new test, Node syntax check and Git whitespace check. Commands:

```sh
npx vitest run tests/scripts.speed-trivia-audit-lock.test.ts tests/lib.speed-trivia-semantic-provider.test.ts tests/scripts.speed-trivia-retirement.test.ts tests/scripts.speed-trivia-cleanup-inventory.test.ts tests/scripts.speed-trivia-inventory.test.ts tests/scripts.speed-trivia-configuration.test.ts
npx tsc --noEmit
npx eslint tests/scripts.speed-trivia-audit-lock.test.ts
node --check scripts/audit-speed-trivia-refresh.cjs
git diff --check
```

## Next agent

Phase 5 remains complete; its authoritative handoff is `docs/speed-trivia-uniqueness-plan_PHASE_5_HANDOFF.md`, now including this maintenance follow-up. Branch `main`. Audit fix commit `ea7f828f4445e863d87d587ac48a2728e9b4f8ec`; editor/generated-type commit `2f44182eb10cbe6038f13a0213cfc8e6f61940ce`; approved Speed export PR #5 merged in `5d7788bb30d5d658695443a5ee16de664abb5f13`. Andrew explicitly instructed commit, push and merge of all changes; the documentation commit accompanies this publication to `origin/main`. The standalone audit script needs no website redeploy. No manual deployment or database write is part of this publication. There are no pending questions or approvals.

Do not run a paid audit or pilot to verify this fix, change caps, remove a live process's lock, or reset a ledger. Abrupt process termination still deliberately leaves the lock and charged reservations for manual PID-checked recovery. The correction covers handled failures after `openBudget` successfully returns; it does not redesign the shared ledger reader's own initialization or filesystem failure recovery. No production data, backups, undo logs or deployments were changed, and no new undo log was necessary. Future work is optional monitoring already described in the Phase 5 handoff; use Sol/medium for reporting, Sol/high for a concrete repair.

## Combined publication verification

All 4,246 tests pass locally (13 environment-gated skips; 359 passing files / one skipped). Typecheck and full repository lint pass. All nine merged export files match PR #5 exactly; every one of their 4,274 unique slugs, question texts, option arrays, answer indexes and categories matches the final approved bank snapshot. No retired or pending rows were exported.

GitHub CI was already failing on pre-change main (`e58a4e506c9692d2dbe134302a0f973447437d82`, run `38455539615`): two Speed SQL test suites require the ignored local PGlite installation, and the owner reward date test expects a different timezone. PR #5’s older run `38448639743` also had an unrelated AddVenueSheet timing failure. No checks were disabled or test expectations relaxed. Those CI portability/flakiness issues remain outside this audit-lock repair. Unrelated VPS workflow PR #2 remains open.
