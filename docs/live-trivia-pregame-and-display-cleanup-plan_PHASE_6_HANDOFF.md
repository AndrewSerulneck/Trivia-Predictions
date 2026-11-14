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

## Release (2026-11-14, Opus 5.5)

### For Andrew
Live. Both PRs are merged and deployed, and the old Link a TV table is deleted. The display's short link works on both
domains, and the Carrabba's display shows no ad. Before merging I fixed three small review points so nothing ever draws
over the app QR code. **Left for you:** check on a real TV/Fire Stick (pre-game → go-live), and merge PR #18, which only
records the table drop in the repo.

### For the next agent
- **Browser pass (scratchpad clone, dev server `:3192`, `getVenueScreenState` patched in the clone only to read a JSON
  fixture, so the real page, layout, API route and polling ran):** idle (with and without a next game), pre-game at
  ~15:00 / 4:59 / 0:01 (shows 0:00 until the next poll flips to live), pre-game at 1280×720, live, Category Blitz. No
  `/api/ads` request, no overflow. Real-time sequence: idle → pre-game on the first idle poll (20.6 s, **no takeover**) →
  fixture flipped live at 45.1 s → takeover once (46.9–48.6 s) → live. Display page at 350 and 289 px: no overflow, no
  "Link a TV"/"Manual setup", both step lines, URL `hightopchallenge.com/tv/K7M2`. Only console error: the known dev-only
  hydration mismatch from the burn-in drift (Phase 3 handoff §5).
- **Review fixes (`27d37d9a`, Copilot points on PR #17):** the stage twinkle canvas painted over the QR (seen in
  screenshots), and the pre-game entrance `LightStreak` (z-10) swept across it. Now `StageTwinkles` is not mounted on
  `idle` / `live-trivia-pregame` (`VenueScreenClient.tsx`); the pre-game QR sits in `relative z-20`; the idle halo/rings
  and pre-game heartbeat stop at fx tier `off` via `useFxTier()` (as `BrandStage`). Browser recheck: during all 40
  samples of the streak, `elementFromPoint` at four QR points hit the QR. Pinned in
  `tests/venue-screen-pregame-components.test.ts` ("the app QR is never covered…"). Full suite 538 files / 7,087 tests ✔;
  `tsc --noEmit` ✔ in a clean clone.
- **CI:** the push-event `validate` runs failed twice on flakes unrelated to this work: `tests/lib.sportsBingo.nfl-star-tilt.test.ts`
  (random threshold, 0.279 vs > 0.3) and a build OOM on the runner. The pull_request runs of the same commits passed.
- **Merged:** #16 → `491ae015`, #17 → `536208a4` (merge commits, repo convention). Vercel production deploy for
  `536208a4` succeeded (both projects).
- **Post-deploy checks:** `/tv` → 307 `/info` and `/tv/H91A`, `/tv/h91a` → 307 `play.…/venue/brunswick-grove/screen` on
  both `hightopchallenge.com` and `play.hightopchallenge.com`; `/tv/ZZZZ` → `/info`. Production display for
  `venue-carrabba-s-italian-grill-east-brunswick` and via `/tv/H91A`, 30 s each: 0 ad requests, no dialog, only API call
  `/api/venue-screen/state`; idle app-download screen with "Live Trivia · Thursday 5:30 PM".
- **Drop:** row backup `docs/live-trivia-pregame-and-display-cleanup-plan_PHASE_5_DROP_LOG_2026-11-14.json` (1 row,
  restore steps inside); `supabase/migrations/20261114200841_drop_tv_pairing_codes.sql` applied with `supabase db push`
  (dry run showed only this file). After: PostgREST `PGRST205` (table gone); `/tv/H91A` and the screen still 200/307.
  Committed on branch `chore/drop-tv-pairing-codes`, PR #18 (open, needs merging so `main` matches production).
- **Still open:** real-TV check (Andrew; plan Phase 6 step 4: pre-game → go-live on a venue TV); ~2026-11-21 compare display
  poll counts with the Phase 2 estimate (~70 extra calls per display per game) using a log counter (no Observability Plus).
- **Untouched (Andrew's call):** the untracked `* 2.ts/.m4a/.mp4/.md` duplicates and stray backfill logs in the main checkout.
