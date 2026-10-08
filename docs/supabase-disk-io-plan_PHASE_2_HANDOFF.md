# Supabase disk I/O — Phase 2 handoff

## Developer summary

The Category Blitz index fix is prepared and its checks pass. It preserves gameplay and makes the frequent latest-round lookup able to read just the needed row. The production dry-run contains exactly this one migration. Nothing is deployed at this handoff's checkpoint. Next: apply it using Andrew's existing approval, verify the live query improvement, then continue monitoring the original disk warning.

## To the next agent

### Goal/scope

Apply and measure only `20261007025200_category_blitz_latest_round_index.sql` in linked project `pkmxupsayzshvpirkaav`. No app or Edge code, cron schedule, data record, policy, grant or existing index changes. Investigate outstanding warning-period capacity metrics separately. Do not purchase compute or claim the disk warning is fixed from a faster cached query alone.

### State and authorization

Branch `main`; HEAD `e2bf1e65747264492213bf8d44e72f5adb6a1a87`; all disk-I/O task files are uncommitted and unpushed. Production migration not yet applied at this checkpoint; no deployments or gameplay-data changes, no data backup/undo log needed for this additive index. Existing unrelated modified `docs/pos-rewards-integration-plan_PHASE_2h_HANDOFF.md` and untracked `clover-spike/` must remain untouched.

Andrew's "I approve" on 2026-10-06 authorizes necessary in-scope production migrations/cron changes after the prior permission explanation. Do not ask again. He confirmed the Supabase plugin is connected, but no tools were exposed in this turn; authenticated CLI works. Paid compute still needs approval. `.env.local` was not read/loaded. Current agent/model unchanged, no delegation requested.

### Implementation, evidence and costs

New migration path: `supabase/migrations/20261007025200_category_blitz_latest_round_index.sql`. One `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_category_blitz_rounds_session_created_at ON public.category_blitz_rounds(session_id, created_at DESC)`. Existing indexes preserved. SQL is outside BEGIN/COMMIT because concurrent indexing cannot run within a transaction. New index only, so no new table/API grants are applicable; the migration security checklist was reviewed.

The plan's "Measured first fix" records baseline executions/buffer work, one-time relation scan, estimated 6–12 MiB index storage, per-round recurring insertion overhead, 11-room and 110-room estimates, unknown physical disk/dollar impact, and unchanged response bandwidth. Latest-round query semantics/order are unchanged. Avoid deploying through Supabase's GitHub branching integration, which wraps migrations in transactions; the official current CLI workflow docs say `db push` detects concurrent statements and executes them standalone:
https://supabase.com/docs/guides/local-development/cli-workflows#what-pg-delta-output-looks-like

Baseline populated-session EXPLAIN SQL: `/private/tmp/hightop-io-explain.sql`; JSON `/private/tmp/hightop-io-explain-before.json`. One result, 16,948 history rows, 9,398 shared-buffer blocks, 1,563.296 ms. Choose same session-selection subquery after deployment. Query stats evidence at `/private/tmp/hightop-io-queries-{1,2}.json`; 22 service-role latest-round calls/131.258149 seconds, 200,176 buffer hits, 1,878.30 ms total. Current quiet rate calculates to 14,481 calls/day and 434,442/30 days; earlier rough docs round this slightly differently, correct when writing final evidence. Physical reads/spill for this query were zero. Separately observed temp-file growth remains unattributed.

### Verification

Commands and outcomes:

```sh
npx vitest run tests/supabase-migration-grants-contract.test.ts
# 20/20 pass, 2026-10-06 22:52 EDT.
git diff --check
# clean.
supabase db push --linked --skip-vault --dry-run
# only 20261007025200_category_blitz_latest_round_index.sql; no roles/seeds.
```

No application code changed, so app builds/typechecks/full game suites are not needed to validate this index-only phase. Local isolated SQL runtime was not available/tested; production concurrent build and validity are still to verify. CLI 2.116.0 uses existing auth and needs approved elevated execution due telemetry filesystem permissions. Dry-run skips vault updates explicitly. A non-timestamped existing migration file named `Warnings...` is skipped by CLI; unrelated, not touched.

### Phase 3 first steps, rollback and open facts

1. Run `supabase db push --linked --skip-vault --yes` with the recorded authorization. Record outcome and exact UTC timestamp.
2. Query `pg_index` for `indisvalid/indisready`, `pg_get_indexdef` and `pg_relation_size` for the exact new index, plus its `supabase_migrations.schema_migrations` row. A failed concurrent build can leave an invalid index despite `IF NOT EXISTS`; inspect before retry, do not mark it applied if invalid.
3. Repeat `supabase db query --linked --file /private/tmp/hightop-io-explain.sql`, and compare plan/time/buffers. Save sanitized evidence next to the plan. Do not expose internal session/user records.
4. Measure a fresh query-counter interval without resetting stats. Use read-only diagnostics with 10-second timeout; favor catalog stats rather than repeatedly counting round history.
5. If regression requires rollback, `DROP INDEX CONCURRENTLY IF EXISTS public.idx_category_blitz_rounds_session_created_at` only, through a new forward migration/recorded operational change. Preserve migration history and all pre-existing indexes. No data restoration is necessary because this index changes no rows.
6. Create Phase 3 handoff/status noting release facts and any incomplete full-day observation. Exact compute tier, warning time, remaining budget and RAM/swap/physical IOPS metrics remain open. Follow the Phase 1 handoff for all diagnostic traps and broader repository context.
