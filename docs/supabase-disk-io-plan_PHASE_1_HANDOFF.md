# Supabase disk I/O — Phase 1 handoff

## Developer summary

Live Supabase access works through the existing CLI; the plugin is not required for these diagnostics. We measured a frequent Category Blitz query that reads thousands of old rounds to return just the newest one. A matching index is the first targeted fix. No production fix, deployment, purchase, or player-data change occurred in Phase 1. The exact Disk I/O warning period and compute/memory/swap metrics are still unverified, so the warning itself is not yet resolved.

## To the next agent

### Goal and scope

Phase 2 prepares and verifies a concurrent `(session_id, created_at DESC)` index on `public.category_blitz_rounds`, followed by Phase 3 production application and fresh measurements. Continue diagnosis of temp-file activity and capacity if accessible. Keep game timing, historical boards, rewards and player data intact. Do not broaden this into arbitrary retention deletion, whole-database tuning, disabling Realtime, paid compute purchases, or the unrelated POS project.

### Starting state

- Repository: `/Users/andrewserulneck/Documents/Trivia-Predictions`; branch `main`; HEAD `e2bf1e65747264492213bf8d44e72f5adb6a1a87`.
- Existing unrelated dirty paths: modified `docs/pos-rewards-integration-plan_PHASE_2h_HANDOFF.md` and untracked `clover-spike/`. Preserve them.
- New Phase 1 files are uncommitted/unpushed: this handoff, `docs/supabase-disk-io-plan.md`, `scripts/supabase-disk-io-baseline.sql`, `scripts/supabase-disk-io-query-stats.sql`.
- No application deployment, production DDL/DML, backups, data cleanup or repair in Phase 1. Aggregate diagnostics were executed with read-only transactions. CLI inspector initializes its temporary login role; that normal auth operation is not a gameplay change. No undo log is needed for the SELECT diagnostics.
- Linked project: `pkmxupsayzshvpirkaav`. CLI 2.116.0 authenticated successfully. Applied migration inventory inspected through `supabase migration list --linked`: latest `20261005123950`, and all displayed local/remote versions matched. Recheck with dry-run before applying a new migration; do not include unrelated new work.
- Edge function inventory: `sync-live-player-stats`, ACTIVE version 15, JWT verification false, updated epoch-ms `1778556405412`; source has not been downloaded or compared with the repository. Do not deploy local Edge code speculatively.

### Decisions and permission

Andrew asked whether we could access Supabase, plan and implement the fix, and then said "I approve" on 2026-10-06 after the assistant explained production migrations/cron changes. Necessary performance-fix migrations and cron changes are authorized; do not re-ask. Paid compute remains a separate approval. Andrew subsequently confirmed "I've connected Supabase"; tools were not yet exposed in the current tool list, so we proceeded with authenticated CLI access. Do not repeat a plugin-install blocker.

`.env.local` must not be read, printed, overwritten or loaded for this task. Existing CLI credentials suffice. No need for passwords/API keys in chat. Read `CLAUDE.md`, `SYSTEM_CONTEXT.md` and `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`; the latter was reviewed. Existing migration files remain immutable. No parallel agents requested.

### Files and functions

- `scripts/supabase-disk-io-baseline.sql`: read-only aggregate snapshot of database/table counters and game status counts; 10-second statement timeout. Includes group counts across round history, so run sparingly, not on a recurring per-user schedule.
- `scripts/supabase-disk-io-query-stats.sql`: top 20 statement counters by temp writes/execution time; omits query text and player data. `queryid` is already text in `pg_stat_statements` output here; cast query IDs to text in any JSON builder to avoid JavaScript 64-bit precision loss.
- `lib/categoryBlitz.ts:getLatestRound` (~line 1856): `.eq("session_id", sessionId).order("created_at", { ascending: false }).limit(1)`; called by continuous engine and client/game paths. No matching composite index in production.
- Existing round indexes: primary key `id`, `idx_category_blitz_rounds_session(session_id)`, `idx_category_blitz_rounds_venue(venue_id)`, partial unique `uq_category_blitz_rounds_session_open(session_id) WHERE status IN ('active','scoring')`. Keep all.
- `vercel.json`: seven minute jobs (10,080 scheduled calls/day, 302,400/30 days), and both `bingo-progress` and `fantasy-live-sync` refresh Bingo. Counts are schedule estimates, not live execution counts.
- `supabase/functions/sync-live-player-stats/index.ts`: timestamp-only upserts can cause fantasy recalc fan-out. Actual deployed behavior unverified; no active fantasy rows in current interval. Preserve `source_updated_at` freshness if optimizing later. Active poll is clamped to at least 20 seconds inside the local Edge code, despite the Vercel caller passing 2,500 ms; don't estimate 24 cycles/minute from the caller alone.

### Evidence and traps

Private local aggregate evidence (no player rows) currently exists in `/private/tmp/hightop-io-baseline-1.json`, `hightop-io-baseline-2.json`, `hightop-io-queries-1.json`, `hightop-io-queries-2.json`, `hightop-io-inspect.json`, `hightop-io-explain-before.json`. Preserve/copy sanitized summaries into repository docs; `/private/tmp` may be cleared. Temporary SQL lives at `/private/tmp/hightop-io-inspection-safe.sql` and `/private/tmp/hightop-io-explain.sql`.

Live database ~188 MiB (`197086355` bytes). Shared buffers `28672` × 8 KiB = 224 MiB, `work_mem=2184 kB`, max connections 60, I/O timing off. These settings do not prove the paid compute tier. Both cumulative cache-hit ratios rounded to 1.00. Statement stats reset on `2026-02-24T01:29:11.499806Z`; database `stats_reset` was null. CLI reported ~225-day age. Historical totals are not the current warning window.

Current counts: 17 Bingo cards, all lost; 6 fantasy entries, all final; zero pending legacy predictions; newest live-player stat observation `2026-06-14T03:25:36.063Z`; 11 active continuous sessions and 51 complete scheduled sessions; 177,141 Category Blitz rounds (177,140 complete, one active), ~95 MiB total relation. No current Bingo/fantasy/stats writes in the short interval.

38.644345-second interval beginning `2026-10-07T02:48:33.224508Z`: zero added `blks_read`, 124,616 added `blks_hit`, 8,561,426 added `temp_bytes`, two temp files, zero updated/deleted tuples and one webhook-event insert. Our history-count diagnostics add their own read work; do not claim all measured activity belongs to the app.

Service-role statement `-6483483423078652727` is the latest-round query. Across 131.258149 seconds starting `2026-10-07T02:48:36.571109Z`: 22 calls, 200,176 buffer hits, 1,878.30 ms execution, no recorded reads/spill. Normalized query shape confirmed from statement text. Approximate observed rate 14,482 calls/day; cost/scale discussion in the plan.

Read-only EXPLAIN for the oldest active continuous session returned one round but read 16,948 historical rows via bitmap scan, 9,398 shared blocks, top-N sort, 1,563.296 ms execution; zero physical reads or temp blocks. The first EXPLAIN joined override config and found no session (global defaults create sessions without override rows); it was discarded, rerun against a populated session. Do not mistake that initial empty plan for a baseline.

`cron.job` does not exist (pg_cron not installed), so queries referencing it fail. CLI `outliers` only showed postgres dashboard statements; direct `extensions.pg_stat_statements` SQL with role aggregation exposes service-role workload. Query-stat totals include huge past Bingo heartbeat writes from legacy code; do not weaken the current atomic RPC based on them.

CLI requires elevated execution here because sandbox execution fails writing `~/.supabase/telemetry.json.tmp.*`. Elevated read-only commands were auto-approved. There has been no auto-review rejection. Preserve secrets by avoiding CLI debug and never list API keys/secrets.

### Exact checks

```sh
supabase inspect db db-stats --linked
supabase inspect db table-stats --linked
supabase inspect db traffic-profile --linked
supabase db query --linked --file scripts/supabase-disk-io-baseline.sql
supabase db query --linked --file scripts/supabase-disk-io-query-stats.sql
supabase migration list --linked
```

All above succeeded. Also `supabase functions list --project-ref pkmxupsayzshvpirkaav` succeeded. No application changes were made, so no typecheck/build/full test pass was needed for Phase 1. Baseline SQL ran with `BEGIN READ ONLY` and statement timeout. Live metrics for disk-budget percentage, IOPS/throughput, swap/RAM, paid tier and exact warning time remain unavailable through these commands.

### Next steps and open questions

1. Prepare the additive index migration and document rollback (`DROP INDEX CONCURRENTLY public.idx_category_blitz_rounds_session_created_at`, only if regression requires it; leave migration history immutable).
2. Run migration contract checks and `supabase db push --linked --skip-vault --dry-run`; expect only the new index migration. Supabase's current official CLI workflow docs explain concurrent statements are applied standalone. Review compatibility before deployment.
3. Apply using existing authorization, verify `pg_index.indisvalid/indisready` and actual size, and repeat the same populated-session EXPLAIN/query-counter interval.
4. Finish Phase 2 handoff before marking it complete; record release/validation separately in Phase 3. Remaining operational observation requires a comparable real-game/full-day window.
5. Obtain warning timestamp/tier/budget/memory/swap from newly connected plugin if tools refresh or dashboard if necessary; no need to ask Andrew for authorization again. These facts are open, not blockers for the justified index fix.
