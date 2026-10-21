# Squares + Brackets plan — 10.7.1 handoff (2026-10-21)

## For Andrew (plain English)
- **Fixed:** in a rehearsal where we jump the clock forward, bracket prizes never paid and Results showed the
  brackets on the wrong dates. A rehearsal now writes down the moment each bracket really locked, and prizes and
  Results both use that moment.
- **Live:** yes. It's committed as `28a5328`, pushed and deployed to Production. The small database change (two new
  columns) is applied.
- **Rehearsal switch:** Production was redeployed, so `BRACKETS_REHEARSAL_ENABLED` is on there now. It stays on until
  launch (10.8), as you asked.
- **Checked for real:** a fresh men's rehearsal on the hidden Hightop Test Bar. Production's own every-minute job graded
  it, paid each round and paid the prize: 1st place $25 to `bktrehearsal1`, 2nd place $15 to `bktrehearsal2`. The
  coupon shows in the winner's wallet, and Results shows the bracket on Oct 21 with its prize rows. Afterwards I
  archived the rehearsal and switched the test prize off.
- **What's left for you:** the phone + TV pass (10.7) on the Preview
  `https://hightop-challenge-dfmbdbzwb-andrewserulnecks-projects.vercel.app` (checklist section B). Create a new
  rehearsal for it first; none is current right now. Launch (10.8) by Mon Mar 8, 2027.

---

## For the next agent

### 1. Next phase: 10.7 (Andrew's phone + TV pass), then 10.8 (launch)
- 10.7 is Andrew's: `docs/squares-and-brackets-device-checklist.md` section B on the Preview above. A failure there
  becomes 10.7.x (designed sub-phase, never patched in place). If he wants a rehearsal set up for it, create one as in
  §4 below (men's and/or women's), and archive it after.
- 10.8 (plan §4): no rehearsal tournament may be current. Turn `BRACKETS_REHEARSAL_ENABLED` off, turn
  `NEXT_PUBLIC_BRACKETS_ENABLED` on in Production, redeploy by **Mon Mar 8, 2027**. Bump `LEGAL_LAST_UPDATED`, check
  `/rules`, and confirm the partner wizard offers the bracket prize.
- Out of scope: Squares 6.5 (parked until the Oct 19/22 captures; see `project_squares_6_5_pending` memory and the 6.5
  handoff), 6.6.

### 2. Starting state
- Branch `main`. `28a5328` (10.7.1 code + migration) pushed; the docs commit for this handoff follows it (see
  `git log`; **not pushed** unless Andrew asked). Production deploy `hightop-challenge-kwrih3x7r` = `28a5328`, Ready.
- Earlier the same day: `1530a61` (10.6 docs) was pushed, which deployed `hightop-challenge-ohyvvlj5a` and activated
  the Production `BRACKETS_REHEARSAL_ENABLED=true` (env var added 2026-10-21 in 10.6).
- Preview branch `brackets-rehearsal` was force-updated to `main@28a5328` (the 10.6 empty commit `4aaa790` is gone, as
  the 10.6 handoff allowed). Preview `hightop-challenge-dfmbdbzwb`, Ready. Its branch-scoped env:
  `NEXT_PUBLIC_BRACKETS_ENABLED=true`, `BRACKETS_REHEARSAL_ENABLED=true`. Preview URLs are public (no Vercel protection).
  They show rehearsals only at hidden venues.
- Migration `20261021203544_bracket_lock_passed_at.sql` APPLIED (`supabase db push`, 2026-10-21 ≈ 20:35Z). The columns
  were read back through PostgREST.
- Database (production, shared) after the re-run:
  - Rehearsal `9ff190e7-579f-4626-96e1-75b2c92d0175` (men's, season 2025) ARCHIVED. No current bracket tournament.
  - Prize `42449580-888d-468a-9e68-d395f562c693` set `is_active = false`. No active `bracket_challenge` prize.
  - Its two coupons stay (`challenge_cycle_winners` `c2bc1b5f-…` $25 → `bktrehearsal1` user
    `72144672-7506-428c-9347-421c1c3c5411`; `98fef4aa-…` $15 → `bktrehearsal2` user `221c4bfa-be33-4945-a8d0-c223836c2c5b`).
    The settlements stay too. Test accounts' venue points went up by their bracket scores ÷ 10 (66 + 10), and their
    `seasonal_points_credits` rows stay. All on hidden `venue-hightop-test`.
  - Admin actions logged in `bracket_admin_log` with actor `claude-10.7.1`.
- Not mine, leave out of commits: the `CLAUDE.md` POS hunk, `docs/pos-rewards-integration-plan.md`,
  `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`, deleted `design-system/project/public/info/*.png`,
  untracked `design-system/project/public/info/New Folder With Items/`, `tests/fixtures/squares/nfl-live-capture-1392308.json`.
  (This session staged only its own CLAUDE.md lines via `git hash-object` + `git update-index --cacheinfo`. `git add -p`
  isn't available.)

### 3. Decisions made (don't re-ask)
- Andrew (2026-10-21): redeploy Production to activate the rehearsal switch and keep it on until 10.8. Push main.
  Execute 10.7.1, and `supabase db push` once it's written. Push `28a5328` before the re-run (asked mid-session,
  "Push main, then re-run"). Reason: Production's cron shares the database and would otherwise have settled the
  rehearsal's prize with the old rule first.
- Design = plan §4 10.7.1 as recommended, with one addition: `set_clock` also stamps a lock that had ALREADY passed on
  the old clock (lock + the OLD offset). Otherwise a sync run that failed before stamping, followed by a jump, would
  leave the sync to stamp with the new, wrong offset.
- `move_lock` doesn't clear or change a stamp. The stamp is when entries really closed, which is what prize
  eligibility asks.
- The two archived 10.6 rehearsals were NOT backfilled (test data; Results still dates them Oct 3–12).

### 4. Files changed and how they fit
- `supabase/migrations/20261021203544_bracket_lock_passed_at.sql`: two nullable `timestamptz` columns. There's no new
  table, so no grant is needed (the grants contract passes).
- `lib/bracketsStore.ts`: `BracketTournamentRecord.mainLockPassedAt/secondLockPassedAt`, `TOURNAMENT_COLUMNS`,
  `tournamentFromRow` (`?? null`). `bracketRealLockMs` returns the stamp when it is set. New
  `lockPassedPatch(tournament, locks, tournamentNow, { offsetSeconds } | { atMs })` is the only place that builds stamp
  writes and the only place (with `bracketRealLockMs`) that adds an offset to a lock.
- `lib/bracketsSync.ts` (`syncBracketTournament`): computes `lockPassed` from the locks this run leaves in place (after
  `lockPatch`) and writes it in `finishBracketSyncRun`'s patch. A dry run writes nothing.
- `lib/bracketsAdmin.ts` (`set_clock`): `{ ...crossing (atMs: now), ...alreadyPassed (old offset) }`. The old-clock
  stamp wins. Written in the same update as the new offset, and logged in `bracket_admin_log` detail.
- `lib/results/adapters/bracket.ts`: selects and passes the two columns.
- Tests: `tests/brackets-sync.test.ts` (new describe "a walked rehearsal remembers when its lock really passed"),
  `tests/lib.results-bracket-adapter.test.ts` (stamp-day dating), `tests/brackets-contract.test.ts` (one home for
  stamps).

### 5. Facts and traps
- Deploy order matters: the code selects the new columns in `TOURNAMENT_COLUMNS`. Applying the migration BEFORE
  deploying is what made this safe. Any future column added there needs the same order.
- With the rehearsal switch on in Production, **the Production cron drives any current rehearsal every minute**,
  including settling prizes. A rehearsal driven from a session or Preview races it. That's harmless now: everything is
  idempotent, and the cron is the path we want tested. Just don't expect only your own ticks.
- The re-run's quick way to make entries: `saveBracketEntry` (the real RPC) with an all-home / all-away bracket. These
  are valid seat picks without linking the opening-round games.
- The redeem API needs the cookies from `scripts/print-test-auth-cookies.cjs … --format raw`. Keep only the `tp_*=`
  lines: the header line breaks a naive parse and gives 403.
- The driver script used (not in the repo): `/private/tmp/claude-501/-Users-andrewserulneck-Documents-Trivia-Predictions/a1e362f5-26da-4a41-87e5-10bbc204fdf8/scratchpad/rerun.mts`
  with wrapper `r.sh` (commands `admin '<json>'`, `tick`, `prize`, `entries <tid>`, `state <tid>`, `coupons <prizeId>`,
  `results`, `deactivate <prizeId>`). Run with `BRACKETS_REHEARSAL_ENABLED=true NEXT_PUBLIC_BRACKETS_ENABLED=true node
  --env-file=.env.local --conditions react-server --import tsx`. It must be `.mts` (top-level await).

### 6. Build, test, verification
- `npx tsc --noEmit` clean. eslint clean on the changed files (`npm run lint` clean before the contract fix). `npm run
  test` → 428 files passed, 1 skipped, 0 failed. `npm run test:brackets-sql` passed. `npm run build` compiled.
- Both new behaviour tests fail with the old rule (checked by switching off the stamp read, then restoring it).
- Re-run verified from the database, the Results timeline function (`getResultsTimelinePage`) and the Preview wallet
  API. Times are in plan §26.
- Not verified: the Redeem Prizes page visually (the API that feeds it shows the coupon; the page returned 200), the
  Results sheet visually, real phones and TV (10.7).

### 7. Open questions for Andrew
- Still open from 10.5.1: should `bracket_save_entry` also refuse picks of games already tipped in a late-lock window
  (option b)?
- Push the docs commit for this handoff (docs only; pushing redeploys Production)?

### 8. Recommended first steps
1. Read plan §26 and this note. If Andrew is ready for 10.7, create a rehearsal for him on `venue-hightop-test` (§5
   driver, `create` with `asOf` 2026-03-15T23:00Z), and leave the clock walking to him or walk it on request.
2. After 10.7, archive any rehearsal. Then 10.8 per plan §4 (Opus 5.5 · medium).
