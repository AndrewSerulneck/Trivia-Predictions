# Pick 'Em plan — Phase 7.5.3 handoff (2026-11-01)

## For Andrew (plain English)
- **What changed:** a bar can now save only one Pick 'Em Prize at a time. Before, if two people (two tabs, or you in admin
  and the partner on their dashboard) pressed Create at nearly the same moment, both could pass the "no overlapping prizes"
  check and the bar would end up with two prizes limiting the same games. Now the first save holds a 30-second "I'm saving"
  marker for that bar. A second save in that window gets "Another Pick 'Em Prize is being saved for this bar. Try again in a
  moment." Once the first save finishes (normally well under a second), the marker is removed.
- **Is it live?** No. Code is uncommitted and not deployed (main is frozen). There is a new database migration,
  `supabase/migrations/20261102021619_pickem_prize_save_leases.sql`, **not applied**.
- **Needs you:** apply that migration **before** the Phases 1–7.5.x code deploys. Without it, every Pick 'Em Prize Create is
  refused with "We couldn't check this bar's other Pick 'Em prizes" (it fails safe — never creates without the check). It
  only adds one small table and two functions; nothing else reads or writes it, so applying it early is harmless.
- **What's left:** 7.5.4, 7.5.5, the 7.6 re-review, then your phone pass (new check 6.4 added to the checklist).

## For the next agent

### 1. Next phase: 7.5.4 (Sonnet 5.5 · medium)
Spec in `docs/pickem-college-football-and-prize-plan.md` "### Phase 7.5.4" (F16): run `applyCollegeFootballLines`,
`loadPickEmGamePrizes` and `getPickEmTodaySummary` in `listPickEmGames` (`lib/pickem.ts`) concurrently, after confirming
they touch different fields; 30 s per-instance cache for `resolveCollegeScoringModeForDisplay`. Out of scope: 7.5.5
(cleanups), F7, anything about the lease.

### 2. Starting state
- Branch `after-app-review`, last commit `407e4da2` (unrelated Category Blitz work). Everything from Phases 1–7.5.3 is
  uncommitted on top. Main frozen during App Store review: never push `main`, never `supabase db push`, never change
  Production env.
- Applied Pick 'Em migrations: everything up to `20261101153306` (7.1c). **New, NOT applied:**
  `20261102021619_pickem_prize_save_leases.sql` (created with `supabase migration new`).
- No data written anywhere; no production access was used in this phase.

### 3. Decisions (spec followed; details I chose)
- Lease helper lives in its own file, `lib/pickemPrizeSaveLease.ts`, not inline in `lib/rewards.ts` (which has no
  `supabaseAdmin` import). `claimPickEmPrizeSave(venueId)` returns `{status:"held",token} | {status:"busy"} |
  {status:"failed"}`; `releasePickEmPrizeSave(venueId, token)` never throws (an unreleased lease just runs out).
- TTL `PICKEM_PRIZE_SAVE_LEASE_TTL_SECONDS` = 30 (SQL default also 30; SQL refuses < 1 or > 300).
- The claim also succeeds for the **same token** while live (renew). Not used by the app today; harmless and lets a future
  long save extend its lease.
- `release_pickem_prize_save` returns boolean (`found`) — the spec didn't specify; it makes the SQL proof direct.
- Advisory lock: `pg_advisory_xact_lock(hashtext('pickem_prize_save:' || p_venue_id))`, exactly as the spec wrote (other
  migrations use `hashtextextended(…, 0)`; either works).
- In `createPickEmReward` (`lib/rewards.ts`) the claim is taken **after** input validation (no lease for a bad form) and
  **before** `listActivePickEmPrizeCampaigns`; the overlap check and `createChallengeCampaign` run inside
  `try { … return await createChallengeCampaign(…) } finally { release }` (the `await` matters: without it `finally` would
  release before the insert finished).
- Busy → `RewardConflictError(REWARD_PICKEM_SAVE_BUSY_MESSAGE)` → 409 in both routes (they already map the class by type;
  no route change). Failed / missing RPC / no client → `Error(REWARD_PICKEM_OVERLAP_UNCHECKED_MESSAGE)` → 500. Logs:
  `[PickEmPrize] save-lease-missing` (once per instance), `save-lease-claim-failed`, `save-lease-release-failed`.

### 4. Files
- `supabase/migrations/20261102021619_pickem_prize_save_leases.sql` — table `pickem_prize_save_leases (venue_id text PK →
  venues ON DELETE CASCADE, token uuid, expires_at timestamptz)`, RLS enabled + forced, no policies, `service_role` CRUD
  only; `claim_pickem_prize_save(text, uuid, integer default 30) returns boolean` (insert … on conflict do update where
  expired or own token; `row_count > 0`); `release_pickem_prize_save(text, uuid) returns boolean`. Both SECURITY DEFINER,
  `search_path = public`, revoked from public/anon/authenticated, granted to service_role.
- `lib/pickemPrizeSaveLease.ts` — new (above).
- `lib/rewards.ts` — import; `REWARD_PICKEM_SAVE_BUSY_MESSAGE` next to `REWARD_PICKEM_OVERLAP_UNCHECKED_MESSAGE`; lease +
  try/finally in `createPickEmReward` (the overlap/insert body is unchanged, only re-indented); doc comment updated.
- `tests/lib.pickem-prizes.test.ts` — the `supabaseAdmin` mock gained an in-memory `rpc` that follows the migration's rules
  (`store.leases`, `store.leaseError`, `store.rpcCalls`). New describe "createReward — Pick 'Em Prize save lease": two
  concurrent creates → one created, one `RewardConflictError` with the busy message, no overlap, lease released; lease held
  during both the overlap read and the insert, same token released; another venue not blocked; released when the insert
  throws; a leftover live lease blocks until it expires (no release by the busy save); missing RPC and generic error both
  fail closed with nothing read or created. The existing overlap test also asserts the lease is released on refusal.
- `scripts/test-pickem-prize-lease-sql.cjs` + `package.json` script `test:pickem-prize-lease-sql`.
- Plan (status line, 7.5.3 table row and section header), `CLAUDE.md` Pick 'Em bullet, device checklist row 6.4.

### 5. Facts and traps
- The 7.1c contract test (`tests/security-definer-execute-contract.test.ts`) and the grants contract
  (`tests/supabase-migration-grants-contract.test.ts`) both pass with the new migration; any new SECURITY DEFINER function
  needs the same revoke/grant pair or 7.1c's test fails.
- PGlite is a single connection, so the SQL proof can't run two claims truly at once; the advisory lock + primary key are
  what serialise them in real Postgres. The concurrency test is at the TypeScript level with a mocked lease.
- I mutation-checked the SQL proof: dropping the `revoke all on function` lines fails it ("Missing expected rejection: anon:
  claim"), and dropping the `where … expires_at <= now() or token = …` clause fails it too.
- Known limit (accepted by the spec): a save slower than 30 s could have its lease taken over. Today's save is one read +
  one insert.
- Not covered by the lease today because no such path exists: editing a Pick 'Em Prize's terms, or re-activating an archived
  one. There is no un-archive for campaigns (`is_active: true` is never written back in `lib/challengeCampaigns.ts` /
  `lib/rewards.ts`). If one is added, it must take the lease and re-run the overlap check — the comment in
  `createPickEmReward` and the migration header say so.
- `npm run test` has the same 4 pre-existing failures as 7.5.2 (Sports Bingo star-index "snapshot is stale" date tripwires,
  `tests/lib.sportsBingo.{mlb,nfl}-star-index*.test.ts`), unrelated.

### 6. Build / test / verified
- `npx tsc --noEmit` clean; `npx eslint lib/rewards.ts lib/pickemPrizeSaveLease.ts tests/lib.pickem-prizes.test.ts
  scripts/test-pickem-prize-lease-sql.cjs` clean.
- `npx vitest run tests/lib.pickem-prizes.test.ts` → 59 pass (6 new). With the two migration contract tests, owner reward
  flow and wizard tests: 191 pass.
- `npm run test:pickem-prize-lease-sql` → all 10 checks pass.
- Full `npm run test`: 6,033 pass / 4 fail (above) / 13 skipped.
- Cost: two extra RPC calls per Pick 'Em Prize save (a partner action, a few a week). Nothing on any poll, cron or player
  screen. Storage: at most one tiny row per venue that ever saved a Pick 'Em Prize (released rows are deleted).
- Unverified: the migration against the real database (not applied); the two-tab check on a phone/desktop (checklist 6.4).

### 7. Open questions
None. Waiting on Andrew only to apply `20261102021619` (before the code deploys).

### 8. Recommended first steps for 7.5.4
Read `listPickEmGames` in `lib/pickem.ts` and the three helpers it awaits in sequence; check which `games` fields each one
writes and reads before parallelising. The prize cache shape to copy for the display rule cache is in
`lib/pickemPrizeLimit.ts`.
