# Squares + Brackets — Phase 10 handoff (review step; fixes planned as 10.1–10.9)

**Date:** 2026-10-20. **Plan:** `docs/squares-and-brackets-plan.md` (§4 Phase 10 has sub-phases 10.1–10.9; §17 has
the findings). **Next:** 10.1, Opus 5.5 · high.

## For Andrew (plain English)

- **What happened:** I ran the code review over everything built for March Madness (the engine, the player screens,
  Prizes/Results/TV) and checked each of its 10 findings against the code. All 10 are real. As with Squares, I didn't
  patch them in place. Each fix is planned as its own step (10.1–10.4), followed by a re-review, the rehearsal, your
  phone pass, the launch and the live watch (10.5–10.9). I also finished your phone/TV checklist for brackets
  (`docs/squares-and-brackets-device-checklist.md`, section B).
- **The ones that matter most:**
  - If an admin corrects a result after the final, the players' points for that round are taken back and **never paid
    again** (10.1).
  - If a player makes picks and taps Back while the previous save is still going, the newest picks can be lost (10.3).
  - An admin could move a bracket's lock to after the first game has started, letting people pick games already being
    played (10.2).
  - Choosing "No result" on a game doesn't hold it: the next sync puts the feed's answer back (10.1).
- **Is anything broken today?** No. Brackets are switched off and no tournament exists until Selection Sunday
  (Mar 14, 2027), so nothing here is urgent and nothing has to ship on its own. There's plenty of time before the
  **Mar 8, 2027** launch date.
- **Is it live?** No code changed in this step: only the plan, the checklist, this note and one line in `CLAUDE.md`.
  None of it is committed (you didn't ask for a commit).
- **Needs you later:** one `supabase db push` (10.1 adds one small column), the phone pass during the rehearsal (10.7),
  and the launch (10.8).
- **Cost:** no change from this step. 10.2 stops a possible every-2-minutes loop after the final, and 10.4 cuts repeat
  reads after a correction.

---

## For the next agent

### 1. Next phase goal and scope
**10.1 (plan §4 Phase 10): admin corrections reach players and stick** (§17 B1, B2, B3, B8):
- Any successful `override_result` / `link_opener` / `set_seat_team` (`runBracketsAdminAction`, `lib/bracketsAdmin.ts`)
  sets `next_sync_at = now` so the next cron minute re-pays re-graded rounds. Today `isBracketSyncDue`
  (`lib/bracketsSync.ts:121`) is false forever once `next_sync_at` is null and `completed_at` is set.
- "No result" must hold: new column `bracket_games.result_held` (new migration; the check
  `bracket_games_result_complete` = `(winner_side is null) = (result_source is null)` forbids an admin-sourced null
  winner). `mergeOne` (`lib/brackets/games.ts`) must not fill a held game; a new admin action "Let the feed decide"
  clears the hold; a winner override clears it too.
- The sync must not overwrite an admin result written between its read and its write (`saveBracketGames` upserts whole
  rows today). Feed-owned columns only, plus a conditional fill. Decide RPC vs two upsert batches and record why.
- TV `revisionOf` (`lib/bracketsTvRead.ts:34`): key on the winner seats, not their count.

**Out of scope for 10.1:** 10.2–10.4 (lock guard, final score entry, editor saves, TV filter, helper de-duplication,
one-pass payment). They are separate sub-phases. Don't fold them in, though 10.2 touches the same files: do 10.1
first.

### 2. Starting state
- Branch `main`, last commit `3273e4d` (Phase 9). Local `main` is **11 commits ahead of `origin/main`** (`b5c1778`):
  Squares 6.1–6.4 and Brackets 7–9, all flag-off. Nothing pushed or deployed.
- **Uncommitted, ours (this step):** `docs/squares-and-brackets-plan.md` (status line, "Needs you", phase table row,
  Phase 10 section, new §17), `docs/squares-and-brackets-device-checklist.md` (header + section B finished: B2 second
  chance, B3–B5), this file (new), and one `CLAUDE.md` bullet at the end of the Squares + March Madness section.
- **Uncommitted, NOT ours, leave alone:** `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`,
  `lib/pos/providers.ts`, the first `CLAUDE.md` hunk (POS/Toast), the deleted/moved `design-system/project/public/info/*`
  images, and `tests/fixtures/squares/nfl-live-capture-1392308.json` (the 6.5 Oct 19 capture; 6.5 commits it). When
  committing `CLAUDE.md`, stage only our hunk (`git diff CLAUDE.md` → keep the bracket hunk → `git apply --cached`).
- Data: nothing written; no production reads were needed (0 tournaments, 0 bracket prizes as of Phase 9's check on
  2026-10-20). Migrations `20261019203858` and `20261019213121` are applied. Flags: `NEXT_PUBLIC_BRACKETS_ENABLED` off,
  `BRACKETS_REHEARSAL_ENABLED` unset.
- Squares 6.5 recorder: PID 10302 (`caffeinate -i node … capture-nfl-live-game.cjs 1392309`, NE @ CHI, kickoff
  2026-10-23T00:15Z) is still waiting. The original PIDs 71943/71944 in the 6.5 handoff are gone. The Oct 19 capture
  (`1392308`) is on disk, untracked.

### 3. Decisions already made
- **Andrew (2026-10-19), applied again here:** review findings are not patched in place. Each gets a designed fix as
  its own sub-phase. 10.5's re-review findings become 10.5.1, 10.5.2, …
- **This step's recommendation (given to Andrew 2026-10-20):** don't fix all findings in one pass. Reasons: each fix gets its own tests
  and commit, a fresh context per fix, and a re-review (10.5) that reviews the fixes themselves.
- Grouping: by the code they touch, not one sub-phase per finding: corrections (sync/admin/TV cache) → 10.1;
  admin guards (lock, final score) → 10.2; editor → 10.3; tidy-ups (TV filter, helpers, payment pass) → 10.4.
- Prizes still never settle without the championship total (the tiebreaker is a promised rule); 10.2 gives the admin a
  way to enter it instead.
- Phase 9 decisions still stand: no Prize line on the bracket screen; an admin correction after settlement does NOT
  change prizes.
- 6.6 now re-reviews only 6.1–6.5; Phases 7–9 were reviewed here.

### 4. Files created or changed (this step)
- `docs/squares-and-brackets-plan.md`: Phase 10 section rewritten into 10.1–10.9 with designs; §17 findings table;
  status line, phase table row and "Needs you".
- `docs/squares-and-brackets-device-checklist.md`: section B finished (B2 + second chance, B3 corrections, B4 Prizes
  and Results, B5 TV).
- `CLAUDE.md`: one bullet (Phase 10 review; flag stays off until 10.1–10.4 + 10.6).
- This file.

### 5. Facts and traps found while checking
- `completed_at` is written by `bracket_record_results` as `coalesce(t.completed_at, now())` while slot 63 is decided
  (migration `20261019203858`, line ~630), so a correction to an earlier round never clears it. That is why B1 loses
  points instead of just delaying them. A correction that clears the final itself does clear it (then the sync is due).
- During the tournament, `next_sync_at` is at most an hour away (`nextBracketSyncAt`), so before the final B1 only
  delays payment.
- The sync's conflict check (`lib/bracketsSync.ts`, `conflict`) compares against `tournament.winnerSeats` read at the
  start of the tick. The B3 race therefore shows up one tick later, as `needsAdmin`.
- `rankBracketEntries` (`lib/brackets/scoring.ts:94`) already handles `championshipTotal = null` (ties → submit time →
  entry id). Only prize settlement requires the total.
- The admin "Override" control (`components/admin/sections/BracketsSection.tsx` ~line 68) offers "No result" as a
  winner choice; its confirm text promises points are "paid again".
- `BracketEditor`'s visibilitychange save already skips while saving (`!savingRef.current`), so the tab-hide path
  has the same drop problem as Back (B4).
- `/rules` already renders a bracket section when the flag is on (`app/rules/page.tsx:88`); 10.8 still bumps
  `LEGAL_LAST_UPDATED` (currently "October 8, 2026").

### 6. Build, run, test
- Nothing was built or run in this step (docs only). The review read the diff.
- For 10.1: `npx tsc --noEmit`, `npm run lint`, `npx vitest run tests/brackets-*.test.ts tests/bracket-*.test.ts`,
  `npm run test:brackets-sql` (PGlite: proves the new migration), then `npm run test` and `npm run build`. Don't run
  typecheck and build at the same time (`.next/types`). New migration: `supabase migration new <name>`, grant
  `service_role` on anything new (`supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`; a column on an existing table needs
  no new grant). `supabase db push` is Andrew's call.
- Unverified: none of the 10 findings was reproduced by running code. Each was confirmed by reading the code paths
  named in §17. The 10.1 tests should reproduce B1–B3 first.

### 7. Open questions for Andrew
- None blocking. 10.4 has one product choice it can make itself and record: the TV's "today's games" shows only the
  bracket shown beside it (recommended) or both genders.

### 8. Recommended first steps for 10.1 (Opus 5.5 · high)
1. Read plan §4 Phase 10 (10.1), §14, §17, and the Phase 7 handoff's sync/admin sections.
2. Write failing tests: override after championship → tournament due on the next tick and round re-paid; "No result"
   survives a sync with the feed showing a final; sync write after an interleaved admin override keeps the admin
   winner; TV revision changes when a winner flips.
3. Migration (`result_held` + conditional-fill RPC if chosen), PGlite proof, then code.
4. Re-run the full 2026 replay tests: totals must be unchanged (6,411 feed requests in the Phase 7 replay).
5. Write `docs/squares-and-brackets-plan_PHASE_10.1_HANDOFF.md` and update the plan's status line.
