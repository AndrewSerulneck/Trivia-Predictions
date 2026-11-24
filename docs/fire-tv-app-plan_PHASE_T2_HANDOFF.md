# Fire TV plan — Phase T2 handoff

**For Andrew:** A weekly GitHub Action now refreshes the NFL star snapshot and commits it straight to `main` (your call,
D32), so the freshness test stops turning CI red every two weeks. **Live 2026-11-23:** #45 and #46 merged; the first run
(manual) committed `467fcd35` to `main`. Next scheduled run: Tue 2026-12-01 10:00 UTC. If BallDontLie is down or returns a much smaller player list, the run fails
without committing, and GitHub emails you about the failed run (true only since CR1.3; before it, the run went green). Website/CI only, no store release.

## For the next agent

1. **Scope done:** `.github/workflows/nfl-star-index-weekly.yml` (Tuesdays 10:00 UTC + `workflow_dispatch`; Node 20; runs
   `node --conditions react-server --import tsx scripts/refresh-nfl-star-index.cjs --if-in-season --guard`; commits only
   `data/sports-bingo/nfl-star-index.json` as `github-actions[bot]`, pull --rebase + push to `main`, 3 tries;
   `permissions: contents: write`). Out of scope: the other flaky test (below), N1.
2. **Starting state:** branch `feat/nfl-star-index-weekly`, stacked on `fix/star-tilt-seeded` (PR #45, T3). PR #46 targets
   `main`; merge #45 first. Nothing deployed. No data changed. The snapshot on `main` is dated 2026-11-23 (T1) and goes stale
   ~2026-12-07, so the first scheduled run (Tue 2026-12-01) is in time if both PRs merge before then.
3. **Decisions:** D32 — commit straight to `main`, no PR (Andrew, 2026-11-23). Andrew also said yes to turning on "Allow
   GitHub Actions to create and approve pull requests", but with no PR it isn't needed, so it was left unchanged. Secret
   `BALLDONTLIE_API_KEY` added by Andrew 2026-11-23 21:05 UTC (`gh secret list`). `main` has no branch protection or
   rulesets (checked via `gh api`), so the bot's push works with `GITHUB_TOKEN`.
4. **Files:** `scripts/refresh-nfl-star-index.cjs` gained `--if-in-season` (exit 0 when
   `resolveLeagueSeasonStatus("americanfootball_nfl")` isn't `in_season`) and `--guard` (`guardFailure`: refuse and exit 1
   if either `fetchNFLSeasonStats` failure box is set, the prior slate is empty, or the current slate is under 50% of the
   committed one for the same season). Manual `npm run bingo:stars:nfl` behaves as before.
5. **Traps:** `fetchNFLSeasonStats` swallows errors and returns `[]`; without `--guard` a bad key wrote two empty slates
   (reproduced). A push made with `GITHUB_TOKEN` triggers no GitHub workflows (CI doesn't run on the bot commit), but the
   Vercel GitHub app still builds production from it (about 17 extra builds a season; the snapshot isn't read at runtime,
   only by tests/humans). The season check logs `[BallDontLie][feed_failure] … page_limit` — harmless (one-row probe).
   `gh workflow run` only works once the workflow file is on `main`.
6. **Verified:** `--dry-run --if-in-season --guard` with the real key: in season, 571 current / 602 prior players, exit 0.
   With `BALLDONTLIE_API_KEY=bogus`: "--guard: not writing, a season_stats fetch failed", exit 1, snapshot untouched.
   With a blank key: exits 1 before writing. `npx eslint` on the script clean; `npm run test` 7892 passed.
   **On GitHub, 2026-11-23:** #45 merged (`7a85696f`), #46 merged (`0bd94034`); `gh workflow run` → run 45268818494, all
   steps green, in season, 571 current / 602 prior, 0 entrants / 0 drop-offs. Bot commit `467fcd35` "Refresh NFL star
   index snapshot (weekly)" on `main` changed only `generatedAt`. That's expected: the timestamp is what the 14-day
   freshness test reads, so every in-season week commits even when no player moves.
   **Still unverified:** a cron-triggered run (first Tue 2026-12-01) and the `git pull --rebase` retry path.
7. **Open for Andrew:** nothing.
8. **First steps next:** glance at the 2026-12-01 run (`gh run list --workflow nfl-star-index-weekly.yml`). The
   `nfl-flavor-squares` flake from PR #44 was a 5 s timeout, not randomness; PR #47 gives its board loops 30 s. Next plan
   phase: N1 (Opus 5.5 / high).

Model: done on Opus 5.5 (Andrew switched the session), above the plan's Sonnet 5.5 / medium.
