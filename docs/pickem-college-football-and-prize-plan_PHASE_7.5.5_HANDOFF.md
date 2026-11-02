# Pick 'Em plan — Phase 7.5.5 handoff (2026-11-01)

## For Andrew (plain English)
- **What changed:** three small cleanups. (1) Deleted an old, unused screen panel that still had a "Claim Points!" button
  (no player could ever see it). (2) The check that counts how many prizes a period has already given out now reads its list in
  a fixed order, so no winner can be skipped or counted twice when the list is long. (3) Fixed two code comments that wrongly
  said the first run would pay the old backlog of unpaid picks; it does not (your D12 decision).
- **Live?** No: code only, uncommitted, not deployed. No migration, no data touched.
- **What's left:** the 7.6 re-review, then your phone pass. Still waiting on you: apply migration `20261102021619` before the code deploys (from 7.5.3).

## For the next agent

### 1. Next phase: 7.6 (Opus 5.5 · xhigh)
Re-review of 7.1–7.5.5 (plan "### Phase 7.6"). F7 (TBA kickoffs) is build-only-if-Andrew-says-so.

### 2. Starting state
Branch `after-app-review`, last commit `407e4da2`; Phases 1–7.5.5 uncommitted. Main frozen (no push main, no `supabase db push`, no prod env). `20261102021619` NOT applied. No data written.

### 3. Decisions
- F13: deleted `components/activity/ActiveGamesPanel.tsx` (no importers in app/components/lib/tests; only docs mention it). Route keeps answering `claimed: false` for old app builds.
- F20: only `lib/pickemPoints.ts` header carried the wrong claim; `settlePendingPickEmPicks`'s comment in `lib/pickem.ts` had no backlog text, so it is unchanged.

### 4. Files
- `lib/pickemPrizeAwards.ts` — winners-ledger read selects `id`, orders `cycle_start` then `id`; deleted-player key is `deleted:${row.id}`.
- `lib/pickemPoints.ts` — header comment corrected.
- `tests/pickem-automatic-points-contract.test.ts` — new test: no file under app/components/lib that mentions `/api/pickem/picks` sends `action: "claim"|"claim_points"` (scoped so the Squares claim route doesn't trip it).
- `tests/lib.pickem-prize-awards.test.ts` — static test pinning the ledger ordering and the `deleted:${row.id}` key (the fake DB ignores `.order()`, so a behavioural boundary test isn't possible there).
- Plan status/table/section, `CLAUDE.md` Pick 'Em bullet.

### 5. Facts and traps
- The same 4 pre-existing Sports Bingo star-index tripwire failures remain in `npm run test`; unrelated.

### 6. Verified
`npx tsc --noEmit` clean; eslint clean on touched files; full `npm run test` 6,038 pass / 4 unrelated fail / 13 skipped.

### 7. Open questions
None.

### 8. First steps for 7.6
Read plan §9–§10, review the uncommitted diff against the findings F1–F20, run tsc/lint/test.
