# Phase 6 handoff: verify and release

## For Andrew
- **What changed:** automated checks all pass; docs now carry the standing rules (plan §7, CLAUDE.md row, SYSTEM_CONTEXT §0 and §5). A PR is open.
- **Live?** No. Nothing is merged or deployed. Merging to `main` deploys to production, so it waits for your go.
- **Left:** (1) browser pass of every display mode (not done, see below); (2) merge PR #16 first, then this PR, deploy;
  (3) after deploy: drop-table migration (you approved the `db push`); (4) real-TV check; (5) ~1 week later compare poll counts.

## For the next agent (Sonnet 5.5 / medium)
1. **Scope:** finish release steps below. Out of scope: new features.
2. **State:** branch `feature/live-trivia-pregame-display`, stacked on PR #16 (`fix/no-ads-on-venue-display`, Phase 1). Commits: Phases 2-5 plus the Phase 6 docs commit. Production DB has the `display_code` migration; `tv_pairing_codes` still exists, unused by code.
3. **Decisions:** Andrew (2026-11-14) approved the later `db push` for the drop migration; said the untracked `* 2.ts/.m4a/.mp4` duplicates and stray logs stay untouched; signed off the Fire Stick paste check and Phase 4 wording.
4. **Files:** `docs/live-trivia-pregame-and-display-cleanup-plan.md` (status, §7), `CLAUDE.md` (feature row), `SYSTEM_CONTEXT.md` (§0 item 2, §5).
5. **Traps:** `npm run lint` reports ~309 parse errors only under untracked/ignored `tmp/` (`tmp/group-games-phase-4/release/*.d.cts`), none in repo code. Typecheck/build in the main checkout can hit stale `.next/types`; use a clean clone with `node_modules` symlinked and `npx next typegen` first.
6. **Verified (2026-11-14):** `npm run test` 538 files / 7,084 tests pass; `npx tsc --noEmit` clean and `npm run build` succeeds in a clean clone (`/tv`, `/tv/[code]`, screen routes built). **Not done:** scratchpad browser pass (pre-game at 15:00 / 4:59 / 0:01, Display page at 350/289 px), post-deploy check that both domains serve `/tv/<code>` and the display makes no `/api/ads` calls, real-TV check.
7. **Open:** Andrew's go to merge/deploy.
8. **First steps:** browser pass from a scratchpad clone (no `.env.local`, mocked routes); `/code-review`; merge #16 then this PR; confirm deploy; `supabase migration new drop_tv_pairing_codes` with `drop table if exists public.tv_pairing_codes;`, then `supabase db push` (approved); real-TV check; ~2026-11-21 compare display poll counts with the Phase 2 estimate (~70 extra calls per display per game).
