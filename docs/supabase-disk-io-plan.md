# Supabase disk I/O reduction plan

Date: 2026-10-06 (America/New_York). Project: `pkmxupsayzshvpirkaav`.

Status: Phases 1–2 complete. Handoffs: [Phase 1](supabase-disk-io-plan_PHASE_1_HANDOFF.md), [Phase 2](supabase-disk-io-plan_PHASE_2_HANDOFF.md). Phase 3: index deployed and short-interval verification passed; warning-period/full-day monitoring remains incomplete. Handoff: [Phase 3](supabase-disk-io-plan_PHASE_3_HANDOFF.md). Do not describe the Disk I/O warning as resolved.

## Developer summary

We can access the live database through the existing Supabase CLI login. The first measured fix is live: a Category Blitz index removes repeated reads of old rounds from the latest-round lookup. Normal scheduled calls improved from about 85 ms and 9,099 buffer accesses per call to 0.057 ms and four accesses in short observation windows. No compute purchase or game-data change occurred. Actual disk-budget savings still require warning-period/full-day measurements; the original email is not yet explained conclusively.

## Decisions and authorization

- Andrew asked for a fix plan and implementation and replied "I approve" on 2026-10-06 after the assistant described production migrations and cron changes requiring approval. This authorizes necessary migrations and cron changes within this performance fix; do not ask again for that same authorization. Paid compute upgrades still require a separate decision.
- Use the authenticated linked CLI. Andrew confirmed Supabase is connected, but no Supabase connector tools are exposed in this session; CLI database diagnostics work independently.
- Do not read/print `.env.local`, expose secrets or player records, reset database statistics, delete gameplay history, or alter historical Bingo results/rewards.
- Preserve Bingo's atomic RPC, final-confirmation/grace rules, provisional correction checks, venue scoping, and near-instant settlement goals. Preserve fantasy freshness/heartbeat semantics when reducing writes.
- Preserve existing uncommitted POS work in `docs/pos-rewards-integration-plan_PHASE_2h_HANDOFF.md` and untracked `clover-spike/`.
- No parallel agents are requested. Use the current model/effort; no model override specified.

## Phase 1 — Access, baseline, and diagnosis

1. Verify linked project and authenticated read-only queries.
2. Capture aggregate table/database counters twice across a known interval, plus query/capacity signals. Store no player records or query comments containing identities.
3. Inspect deployed trigger/function definitions and schedules to distinguish deployed behavior from repository intent. Determine compute tier and available disk I/O, memory/swap metrics if accessible.
4. Rank changes by current measured load. The number of cron executions is a workload estimate, not a measurement of physical disk reads/writes.
5. Finish with a handoff and evidence; explicitly record inaccessible metrics.

## Phase 2 — Implement and verify targeted reductions

Choose fixes based on Phase 1, then record exact baseline/proposed executions, transferred bytes, retry/fan-out behavior, and expected daily/30-day volume before cost-affecting edits. Candidates:

- Repeated Bingo refreshes and writes: preserve provider-to-client timing and atomic settlement; reduce duplicated scheduled passes or unnecessary pregame observations only if evidence and regressions support it.
- Continuous Category Blitz: inspect empty sessions, round accumulation and whole-history round reads. Keep active gameplay pacing; bound queries rather than truncating history or arbitrarily slowing games.
- Fantasy sync: inspect unchanged upserts and per-player fantasy recalculation fan-out. `source_updated_at` serves freshness, status, and scoring windows, so simply skipping every timestamp-only update is unsafe without an explicit freshness design.
- Legacy Predictions: pending-row audit before removing/reducing its minute cron; existing picks must still resolve.
- Indexes only where live query plans show meaningful benefit; small sequential scans can be appropriate. Additive timestamped migrations only, with explicit API grants if new objects are created.

Regression checks must cover unchanged data, changed stats, live-to-final, corrections, missing provider data, duplicate/concurrent wakeups, and freshness/idle-to-active behavior for affected systems. Run relevant Vitest tests, typecheck, lint and build as appropriate; never run build and typecheck concurrently. Do not apply unrelated pending migrations.

## Phase 3 — Release and compare

1. Save exact prior definitions/configuration needed for rollback and verify migration inventory.
2. Apply only prepared in-scope production changes using the authorization above; deploy application/Edge code if changed. Record exact migration IDs, commits and deployments. Never claim deployed code matches local source without checking.
3. Compare database counter deltas and latency at comparable load, then review disk-budget consumption through a full day including real game traffic.
4. Record what was observed and what remains unverified. Roll back regressions using recorded steps. No speculative paid upgrade.

## Initial workload estimate

`vercel.json` has seven once-per-minute jobs: 10,080 scheduled invocations/day, 302,400 per 30 days, excluding retries, provider webhooks, client refreshes and manually scheduled Edge invocations. Bingo is additionally refreshed by `fantasy-live-sync`, yielding up to 2,880 scheduled sweep invocations/day before those other wakeups. These jobs are shared, but each sweep's cost can grow with active boards/venues/players.

Actual executions, transferred bytes, live tier, per-run query counts, retry rate and warning-period disk throughput are not yet known. Measure them before claiming costs or savings. Same scheduling at 10× player/venue volume still has the same cron invocation count, but can multiply per-run database work by 10× or more if fan-out is unbounded.

## Measured first fix — latest Category Blitz round

Live statement `-6483483423078652727` has 22 calls across 131.258149 seconds (2026-10-07T02:48:36.571109Z–02:50:47.829258Z), 200,176 additional shared-buffer hits and 1,878.30 ms total execution time. This projects to approximately 14,481 calls/day, 434,442 per 30 days at the observed quiet-period rate, without multiplying by additional traffic. It is not a peak-load forecast. The query returns one row but reads roughly 9,099 buffer blocks per call (~71 MiB of logical buffer accesses); these are cached accesses, NOT physical disk bytes or transferred network bytes. Its response remains one round (~0.4–1 KiB plus PostgREST overhead, not measured), so this index does not increase client bandwidth.

An isolated populated-session EXPLAIN returned the latest round by reading 16,948 history rows and 9,398 shared-buffer blocks, taking 1,563.296 ms. The existing `session_id` index cannot supply `ORDER BY created_at DESC`. Add `idx_category_blitz_rounds_session_created_at` on `(session_id, created_at DESC)`, concurrently, preserving the same row selection and game timing. Expected search work becomes an index lookup plus one heap row instead of the history walk. No whole-table reads are added to gameplay; one-time index creation scans the ~95 MiB relation and sorts narrow keys. New index storage is estimated at 6–12 MiB (measure after creation).

Recurring tradeoff: one additional index entry per inserted round and removal on deletion; `created_at`/`session_id` do not change on ordinary scoring updates. At an illustrative maximum of one new round/minute across 11 rooms, 15,840 new entries/day and 475,200/30 days add roughly 0.8–1.6 MiB/day of narrow index data before page/retry/WAL overhead. At 10× rooms, roughly 8–16 MiB/day before overhead. The observed 22 calls/131 seconds should fall from ~1 TiB/day of logical buffer accesses to a few hundred MiB/day if the new plan uses a few blocks per call; actual disk-budget savings and dollars cannot be inferred from these cached counts. No new cloud service or paid compute is introduced. SQL errors must be retried only after checking whether a concurrent index build left an invalid index.

The short table-counter interval (38.644345 seconds) showed no Bingo/stats/fantasy updates, zero additional database blocks read, one webhook insert, and 8,561,426 additional temp-file bytes. This does NOT establish that the latest-round query caused the Disk I/O email; its tested plan did not spill. Subsequent statement checks traced temporary-file writes in the diagnostic window to our initial `pg_stat_statements` queries: the view materializes all query text by default. Final counter/query scripts use `extensions.pg_stat_statements(false)` to avoid that overhead. Do not mistake diagnostic-generated temp writes for app load. Warning-period memory/swap and disk-budget activity still require further evidence.

## First production release and results

- Applied `20261007025200_category_blitz_latest_round_index.sql` through `supabase db push --linked --skip-vault --yes`, using Andrew's approval; verified `2026-10-07T02:54:02.532183Z` (2026-10-06 22:54 EDT).
- Index is valid/ready, exact definition matches, migration is recorded. Actual index size: 7,217,152 bytes (~6.88 MiB). No paid upgrade, application/Edge deployment, cron change or gameplay-data update was needed.
- Populated-session EXPLAIN: 1,563.296 ms / 9,398 shared-buffer accesses / 16,948 rows before; 0.785 ms / 9 accesses / one row afterward. No physical reads or spills in either plan. One timing sample is not a general latency guarantee.
- Normal service-role calls over 58.859063 seconds after release: 11 calls, 0.621949 ms total (0.056541 ms mean), 44 total buffer accesses (four/call), zero physical reads or temp spill. The before sample averaged 85.377 ms / 9,098.91 accesses per call. Buffer work dropped approximately 99.96% for this query in these windows.
- Post-release dry-run: remote database up to date; no pending migrations/seeds/roles. Migration grant contract: 20/20 pass. `git diff --check` clean for this task's edits.
- Reproducible lean measurement: `supabase db query --linked --file scripts/supabase-disk-io-counter-snapshot.sql` twice across a known interval; compare counters without resetting them. Full baseline history counts are for occasional diagnosis only.
- The final diagnostic scripts use `showtext=false` and transaction-local `work_mem=16MB` (released at transaction end, no global change). Residual database temp-file growth of 21,998,572 bytes over 113.375312 seconds remains in the last interval, with zero additional database blocks read; not all temp activity can be attributed conclusively to diagnostic spill. Infrastructure metrics are still required to explain the email.
- Aggregate evidence: [JSON](supabase-disk-io-evidence-2026-10-06.json). Source/records remain uncommitted and unpushed at this checkpoint; the database migration itself is already live.
- Email timestamp confirmed by Andrew: 2026-10-06 22:05 EDT = 2026-10-07T02:05:00Z. Andrew subsequently confirmed the compute tier is Nano. Remaining: warning-period budget/RAM/swap/activity, real-game latency and a comparable full-day disk-budget check. The separate keychain-based metrics route was initially auto-review rejected; Andrew specifically authorized limited credential reuse, so approved retries ran, but the helper could not retrieve a credential and made no metrics requests. Native CLI DB access still works. No recurring monitoring job was added. Further changes should depend on warning-period infrastructure evidence.
- Final CLI help checks (`supabase --help`, `supabase projects --help`, `supabase inspect --help`, `supabase config --help`) expose no supported infrastructure-metrics read command. Andrew provided dashboard values below and confirmed Nano. Warning-period metrics remain incomplete. Do not re-request credential permission or a Supabase installation.

## Dashboard follow-up — October 6, 2026

Andrew pasted these labels/values: Compute 71%, CPU 17%, Memory 71%, Disk IO 44%; graph date labels Sep 29–Oct 6. Disk space 6%, Database 209.3 MB, WAL 96 MB, System 171.6 MB. These are user-reported values, not independently fetched time series. The Compute summary percentage is not a compute tier. The selected range/aggregation and exact warning-time data point are unknown.

Disk space is not full in that display. Memory at 71% alone does not establish swap pressure. [Supabase's documentation](https://supabase.com/docs/guides/platform/compute-and-disk) defines `Disk IO % consumed` as reaching budget exhaustion at 100%. If the pasted Disk IO label is that metric, 44% is below exhaustion for the displayed statistic; do not assume 56% remains today or claim a post-index budget improvement. No paid upgrade or additional production change is justified solely by these summary values. Andrew answered the compute-size question with Nano. Disk IO value when hovering October 6, swap/IOWait and a comparable full day remain unverified.

A fresh lean counter snapshot at `2026-10-07T03:08:23.249726Z` (October 6 at 23:08 EDT), compared with the preceding snapshot over 308.325870 seconds, confirms continued index benefit: 55 latest-round calls, 221 buffer hits (~4.02/call), 35.579107 ms total (~0.647 ms/call), zero physical reads or query spill. Database temporary-file counters still grew by 33,007,458 bytes / nine files with unchanged tracked spill-by-role counters. This remains an unresolved attribution issue, not proof that the latest-round query causes the warning. Evidence keys: `user_reported_dashboard`, `post_release_7_dashboard_followup`, `dashboard_followup_interval`.

## Nano confirmation and cost options — October 6, 2026

Andrew confirmed Nano. [Current Supabase limits](https://supabase.com/docs/guides/platform/compute-and-disk) list up to 0.5 GB RAM, baseline 250 IOPS and 5 MB/s throughput for Nano; Micro has 1 GB RAM, 500 IOPS and 11 MB/s. These are documented minimums, not measured project capacities. Nano's limited headroom makes compute a plausible contributing factor, but does not establish the original warning cause or prove swapping.

Before choosing an upgrade, establish the organization plan. Existing Nano on paid plans is billed at the same compute price as Micro, so Micro is the first upgrade to consider if already paid. If Free, [Pro starts at $25/month](https://supabase.com/pricing), including $10/month compute credit covering one Micro; other projects, add-ons and overages can add cost. At unchanged workload, upgrading changes capacity and the recurring compute/plan bill, not scheduled execution count or response bandwidth. It does not eliminate the need for sound queries.

Andrew answered **Pro or another paid plan**, confirming a paid organization. If already paid, recommend Micro for additional headroom at the same listed compute price after reviewing the dashboard estimate. If Free and service remains responsive, the lower-cost option is to keep the index fix and compare a full post-release day; repeat warnings/throttling would strengthen the case for Pro/Micro. A compute change can cause brief downtime (Supabase says usually under two minutes, sometimes longer). No upgrade was authorized or performed, and no new source/database changes were needed on this follow-up. Phase 3 remains partial. Evidence key: `compute_tier_followup`.

## Diagnostic commands

```sh
supabase inspect db db-stats --linked
supabase inspect db table-stats --linked
supabase inspect db traffic-profile --linked
supabase db query --linked --file scripts/supabase-disk-io-baseline.sql
```

CLI version available here is 2.116.0. Sandbox execution failed trying to write CLI telemetry under `~/.supabase`; approved elevated CLI execution works. No credential values were read or printed. `traffic-profile` write-block values are estimates, not direct physical disk counters. Database stats have accumulated for about 225 days; compare deltas without resetting them.

### Paid-plan answer and concrete recommendation

Andrew confirmed **Pro or another paid plan**. Recommend changing this existing paid project from **Nano to Micro**, preserving region, disk configuration and application data. Expected incremental recurring compute charge: **$0**, because Supabase bills paid-plan Nano at Micro's listed rate ($0.01344/hour, approximately $10/month); verify the dashboard estimate before applying. Benefits: 1 GB RAM versus up to 0.5 GB, baseline 500 versus 250 IOPS and 11 versus 5 MB/s. This provides more capacity without changing cron frequency, client bandwidth or gameplay rules. Possible brief downtime, usually under two minutes per Supabase. The lower-interruption alternative is keeping Nano while measuring a full post-index day, but it retains the smaller resource limits.

Available tools expose database operations but no supported compute-change control, and the separately authorized credential scope was read-only; no upgrade has been executed. Andrew can apply the recommended change at [this project's Compute and Disk settings](https://supabase.com/dashboard/project/pkmxupsayzshvpirkaav/settings/compute-and-disk) after reviewing the quoted amount. Do not pretend a billing-plan answer authorizes a compute change or silently broaden credential permissions. After an upgrade, record its timestamp and compare a full day of Disk IO budget, memory/swap and real-game latency. The original warning remains unverified.
