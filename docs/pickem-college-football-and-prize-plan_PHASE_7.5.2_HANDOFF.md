# Pick 'Em plan — Phase 7.5.2 handoff (2026-11-01)

## For Andrew (plain English)
- **What changed (three small fixes to grading and payment):**
  1. Automatic grading now reads waiting picks in pages (up to 3,000 per minute instead of a hard 500). Before, picks that
     are allowed to wait up to two days — a college game with no betting line yet, a game the feed calls over but hasn't
     finalised — could fill the 500 and stop every later game from being graded or paid.
  2. Opening the Pick 'Em screen no longer runs a payment every time. A player's screen pays only when it has just graded a
     win for them; the every-minute automatic run still pays everything else (and retries any payment that failed).
  3. The "+10" pop-up and the header's points now appear only once a win is actually paid, never just because it was graded.
- **Is it live?** No. Code only, uncommitted, not deployed (main is frozen). No database change.
- **What's left:** 7.5.1 and 7.5.2 were the two fixes required before Phases 1–6 can deploy — both are now done. Still to
  do: 7.5.3 (one Pick 'Em Prize save at a time per bar; has a migration you'll need to apply), 7.5.4, 7.5.5, the 7.6
  re-review, then your phone pass.
- **Needs you:** nothing.

## For the next agent

### 1. Next phase: 7.5.3 (Opus 5.5 · high)
Spec in `docs/pickem-college-football-and-prize-plan.md` "### Phase 7.5.3" (F17): a per-venue save lease
(`pickem_prize_save_leases` table + `claim_pickem_prize_save` / `release_pickem_prize_save` RPCs) around the Pick 'Em Prize
create branch in `lib/rewards.ts`. New migration via `supabase migration new`, **NOT applied** (Andrew's call; never
`supabase db push`). Out of scope: 7.5.4 (parallel games-list reads), 7.5.5 (cleanups), F7.

### 2. Starting state
- Branch `after-app-review`, last commit `407e4da2` (unrelated Category Blitz work). Everything from Phases 1–7.5.2 is
  uncommitted on top. Main frozen during App Store review: never push `main`, never `supabase db push`, never change
  Production env.
- All Pick 'Em migrations up to `20261101153306` (7.1c) are applied. 7.5.2 added none.
- No data written. Production access was read-only: a keyset syntax check on `pickem_picks` and a count (below).

### 3. Decisions
- Plan spec followed. Details I chose:
  - Cursor filter: `.or('starts_at.gt."S",and(starts_at.eq."S",id.gt."I")')` with **double-quoted** values (timestamps
    carry `:`, `.`, `+`, reserved in PostgREST logic trees). Verified read-only on production: the page after row 3 equals
    rows 4–6 of an unpaged read, and a cursor on the first of two rows sharing one `starts_at` returns the second.
  - The 7.4 stale cancel runs on the first page only, BEFORE paging on (a stale pick always sorts first); after a cancel the
    first page is re-read, then paging continues.
  - "Cap hit" = the 6th page came back full (there may or may not be more). Logged once:
    `[Pick 'Em] settle-page-cap scanned=<n> oldest=<iso>` (console.warn).
  - F15: `payout` is `null` for a player's own call that paid nothing (the type already allowed null). The picks GET
    returns `settlement` to the client, but no client code reads `settlement.payout` (grep of `components/`, `app/`).
  - F19: a game counts toward "+10" only when the previous load had a row for it with `userPickRewardClaimedAt` falsy
    and the new load has it `won` with the stamp set. So pending → won+paid in one refresh still shows "+10"; first sight
    of a paid pick shows nothing. `todayWinPointsOf` unchanged.

### 4. Files
- `lib/pickem.ts` — new exports `PICKEM_SETTLE_PAGE_SIZE` (500), `PICKEM_SETTLE_PAGE_CAP` (6); in
  `settlePendingPickEmPicks`: `readPendingPage(after)` replaces `readPending()`, a paging loop after the stale cancel,
  the cap log, `payout: userId ? null : await payPickEmPoints({ userId })` on the empty return, and
  `const payout = userId && won === 0 ? null : await payPickEmPoints({ userId });` at the end. Doc comments updated.
- `components/pickem/PickEmGameList.tsx` — `newlyWonPointsOf` keys on the payment stamp; comment at its call site.
- `tests/lib.pickem-stale-pending.test.ts` — mock now supports multi-key `order` and the cursor `or()` (throws on any other
  `or` expression; `store.cursorReads` counts cursor reads). New describe "the pending read is paged…": 600 waiting picks
  (one shared kickoff, so the page boundary is inside a tie) + 1 finished later game → graded and paid, 2 reads, scores
  fetched once (15 day-requests); 1,003 picks → 3 reads, each once; < 1 page → 1 read, 0 cursor reads; cap → 6 reads,
  3,000 scanned, one log line; stale cancel still on page 1.
- `tests/admin.pickem-settle.test.ts` — mock `order` now multi-key (needed for the second `order("id")`).
- `tests/lib.pickem-nfl-scoring-mode.test.ts` — "still pays when nothing left" is now the global call; three new F15 cases
  (own call, nothing pending → no RPC; own call grading only a loss → no RPC; own call grading a win → RPC with its id).
- `tests/pickem-automatic-points-contract.test.ts` — the "pays on every path" case now pins the two exact payout lines.
- `tests/pickem-today-win-points.test.ts` — F19 cases (won-unpaid → 0; won-then-paid → 10 once; paid on first sight → 0).
- Plan status line, 7.5.2 table row and section header; CLAUDE.md Pick 'Em bullet.

### 5. Facts and traps
- **V8's `Date.parse` accepts strings like `"wait-0001"`** (it returned a 2001 date). A mock comparer that treats anything
  `Date.parse` accepts as a timestamp sorts ids wrongly; both mocks now treat only `^\d{4}-\d{2}-\d{2}T` as an instant.
- The college score fetch is one request per day of the ±7-day window (15 calls per run), not one per sport.
- `lib/nflPickEmRewardAccrual.ts` line ~66 says its ceiling matches "settlePendingPickEmPicks' own 500-row page" — still
  true (page size is 500); not changed.
- Production 2026-11-02 02:11Z: 6 started pending picks, oldest `2026-07-30T20:20:00+00:00` (the 4 stuck NFL picks 7.4
  cancels on its first run after deploy). So paging costs nothing extra today.
- `npm run test` has 4 failures, all Sports Bingo star-index "snapshot is stale" date tripwires
  (`tests/lib.sportsBingo.{mlb,nfl}-star-index*.test.ts`), unrelated and pre-existing.

### 6. Build / test / verified
- `npx tsc --noEmit` clean; `npx eslint` on the 7 touched files clean.
- `npx vitest run tests/lib.pickem-stale-pending.test.ts tests/admin.pickem-settle.test.ts tests/lib.pickem-nfl-scoring-mode.test.ts tests/pickem-automatic-points-contract.test.ts tests/pickem-today-win-points.test.ts`
  → 59 pass. Full `npm run test`: 6,026 pass / 4 fail (above) / 13 skipped.
- Cost: the cron/webhook make one pending read per run at today's volume (unchanged); +1 indexed read per extra 500
  started pending picks, max 6 per run. Player screens: before, every games/picks load and every 60 s live poll ran one
  `pay_pickem_points` write transaction (≈ 60/hour per open screen); now only a call that graded a win pays.
- Unverified: real paging under load (only mocked + the read-only syntax check); the "+10" on a phone (Andrew's checklist).

### 7. Open questions
None.

### 8. Recommended first steps for 7.5.3
Read the Pick 'Em Prize branch of `createReward` in `lib/rewards.ts` (`findPickEmPrizeConflict`,
`REWARD_PICKEM_OVERLAP_UNCHECKED_MESSAGE`, `RewardConflictError`), `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`,
`tests/security-definer-execute-contract.test.ts` (7.1c: new RPCs must revoke from public/anon/authenticated and grant
`service_role`), and an existing PGlite SQL proof script (e.g. the one behind `npm run test:pickem-prize-awards-sql`) to
copy for `npm run test:pickem-prize-lease-sql`. `isMissingFunction` lives in `lib/supabaseRpcErrors.ts`.
