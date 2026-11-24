# Fire TV plan — Phase CR1.3 handoff (weekly NFL star workflow hardening)

**For Andrew:** The weekly NFL star-ratings job now turns red (and GitHub emails you) when it fails, instead of
quietly going green. It also runs on Sep 1 each year, and refuses more bad data (a shrunken last-season list or
wrong-season rows). Website/CI only; no store release. Live once the PR merges, in time for Tue 2026-12-01 10:00 UTC.
Nothing is waiting on you except merge (auto-merge rule applies once CI is green).

## For the next agent
- **Next:** CR1.4 (TV sports feed fixes, Opus 5.5 / high) — see `docs/fire-tv-app-plan.md` "Phase CR1.4". Out of scope here: CR1.5–CR1.7.
- **State:** branch `fix/nfl-star-workflow-hardening` from `origin/main` (`eb9f311e`). The local branch `fix/nfl-pickem-moved-game`
  (CR1.2.1, commit `bdc556bb`) is separate and unpushed; untouched.
- **Decisions:** F41 was already done in PR `chore/fewer-builds` (`scripts/vercel-ignore-build.cjs`); skipped. `vercel.json` unchanged.
- **Files:**
  - `.github/workflows/nfl-star-index-weekly.yml`: `shell: bash` on both steps (pipefail); `persist-credentials: false`;
    push URL with `github.token` set only in the commit step; JSON parse check before `git add`; failed rebase →
    `git rebase --abort` + "Conflict with a concurrent snapshot change."; extra cron `5 0 1 9 *`.
  - `scripts/refresh-nfl-star-index.cjs`: `guardFailure` now takes raw `rows`, refuses > 5 % wrong-season rows, and applies
    the 50 % rule to `prior` (vs old `prior`, or old `current` at rollover). Exported; `main()` runs only when executed directly.
  - `tests/nfl-star-index-workflow-contract.test.ts` (new, 8 tests).
  - `docs/fire-tv-app-plan_PHASE_T2_HANDOFF.md`: the "emails you" claim now notes it holds only since CR1.3.
- **Trap:** the snapshot JSON rows carry no `season`; the wrong-season check uses the raw API rows, which is why `rows` is passed in.
- **Verified:** `npm run test` (611 files pass), `npx tsc --noEmit`, eslint on the new test, YAML parses, `node --check`.
  **Not verified:** a real Actions run (needs merge). Suggest `workflow_dispatch` once after merge: off-season-safe, it exits 0 or commits.
- **First step next phase:** read CR1.4 details; Pick 'Em callers of `lib/pickem.ts` must stay unchanged.
