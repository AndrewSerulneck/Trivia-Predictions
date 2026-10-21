# Squares + Brackets — Phase 6.5 handoff (quarter rule vs live captures) — PART 1 DONE, PART 2 WAITING

**Date:** 2026-10-21. **Plan:** `docs/squares-and-brackets-plan.md` (§4 Phase 6, sub-phase 6.5; as-built §28).
**Next:** part 2 of 6.5 after Thu Oct 22 (below), then 6.6 (Opus 5.5 · high).

## For Andrew (plain English)
- **What changed:** we recorded Sunday's Commanders–49ers game minute by minute and replayed it through the Squares
  rule that decides "this quarter is over". It picked the **right winning score every time**, but it was slow: the
  1st-quarter winner would have been announced over an hour late, because the sports feed writes the game clock as
  "14:25 - 2nd" and the rule didn't understand that wording. It does now, so each quarter's winner is announced a
  minute or two into the next quarter.
- **Live?** No. Squares is still switched off; this change is committed on your Mac only, not pushed or deployed.
- **What's left in 6.5:** one more recording, Thursday's Patriots–Bears game (8:15 PM ET Oct 22), to see the
  halftime and end-of-quarter wording, which Sunday's recording missed because the Mac went to sleep for stretches.
- **Needs you:** Thursday evening, keep the Mac **on, plugged in, lid open** from about 8 PM to midnight ET. The
  recorder is already running and waiting.

## For the next agent

### 1. Goal and scope
Part 2 of 6.5: replay capture `1392309` (NE @ CHI, kickoff 2026-10-23T00:15Z) through
`npx vitest run tests/squares-engine.test.ts`. The "live capture replay" test picks up every
`tests/fixtures/squares/nfl-live-capture-<id>.json` automatically and checks each graded score against the final.
Look for status strings not yet seen (halftime, "End of …", OT, anything between quarters); if one proves a quarter is
over and the rule ignores it, add it to `quartersFinishedFromStatus` with a test case. Consider extending the
"grades each quarter during the next one" test to the new capture. Record the strings in plan §28.
Out of scope: 6.6–6.9, any flag change, any deploy.

### 2. Starting state
- Branch `main`. 6.5 part 1 is committed locally (commit message starts `feat(squares): plan 6.5 part 1`); NOT pushed or
  deployed. `origin/main` was `4facaac` before it.
- Uncommitted and NOT ours (leave alone): `CLAUDE.md` (POS hunk), `docs/pos-rewards-integration-plan.md`,
  `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`, the deleted `design-system/project/public/info/*.png`
  and the untracked `design-system/project/public/info/New Folder With Items/`.
- No data touched, no migration. Squares flag `NEXT_PUBLIC_SQUARES_ENABLED` is not set in any Vercel environment.
- Recorder for `1392309`: PID **10302**, `nohup caffeinate -i node --env-file=.env.local scripts/capture-nfl-live-game.cjs 1392309`,
  log `~/Library/Caches/hightop-squares-capture/capture-1392309.log` (last line on 2026-10-21: `waiting until
  2026-10-23T00:05:00.000Z`). It writes the fixture after every poll and stops after 10 final polls or 7 h. Check with
  `ps -p 10302`. The `1392308` recorder finished normally (`done: 45 polls, 28 distinct records`).

### 3. Decisions
- Being late is the safe failure; never grade on weaker evidence. The new pattern is anchored on both ends
  (`^m:ss - Nth$`) so down-and-distance text ("3rd & 5") or the kickoff time can't match.
- Unseen wording (e.g. OT as "10:00 - OT") was deliberately NOT guessed: OT only matters for Q3, which is already
  proven by the 4th-quarter clock, and the final uses totals.

### 4. Files changed
- `lib/squares.ts` — `quartersFinishedFromStatus`: new `clock` match, quarter N in progress → N − 1 finished.
- `tests/squares-engine.test.ts` — status cases from the capture; `replayCapture` helper (shared by the replay test);
  new test `grades each quarter during the next one (WSH @ SF, 1392308)` (fails on the old rule: Q1 was graded on
  `"5:56 - 3rd"`).
- `tests/fixtures/squares/nfl-live-capture-1392308.json` — the capture (committed).
- `docs/squares-and-brackets-plan.md` — status line, Phase 6 table row, new §28.

### 5. Facts and traps
- Live record shape: `status_state` `scheduled` → `in_progress` → `final`; `status` `"10/19 - 8:15 PM EDT"` →
  `"15:00 - 1st"` … → `"Final"`. No `period`/`time` fields. `status_state` stayed `scheduled` for ~3 min after kickoff.
- A quarter field flips `null` → `0` when the quarter starts (Q2 = 0 at `"14:25 - 2nd"`). Still don't treat 0 as proof
  (Phase 0 saw pre-filled zeros in finals).
- `caffeinate -i` stops idle sleep only; a closed lid still sleeps the Mac. That's why `1392308` has 5–35 min gaps and
  no halftime record.
- The replay walks each snapshot from `firstSeen` to `lastSeen` in 60 s steps, so with gaps the 60 s hold completes on
  the NEXT snapshot; in production the cron polls each minute.
- zsh: `grep --include=*.ts` fails with "no matches found"; quote the glob.

### 6. Build / test
`npx vitest run tests/squares-engine.test.ts` (44 pass), `npx tsc --noEmit` (clean), `npx eslint lib/squares.ts
tests/squares-engine.test.ts` (clean), `npm run test` (428 files / 5,232 pass / 13 skipped). Timeline script used for
the analysis (not in the repo): replay each snapshot through `squaresMomentEvidence` + `planMomentStep` and print the
status each moment was graded on — the new test does the same.
Unverified: halftime/end-of-quarter/OT strings (part 2).

### 7. Open questions for Andrew
None.

### 8. Recommended first steps
1. After ~00:30 ET Fri Oct 23, `tail ~/Library/Caches/hightop-squares-capture/capture-1392309.log` — expect `done: …`.
2. `npx vitest run tests/squares-engine.test.ts`; then list the distinct `status` values in the new fixture.
3. If the capture failed, re-run `node --env-file=.env.local scripts/capture-nfl-live-game.cjs <id>` on a later
   prime-time game (ids via BallDontLie `GET /nfl/v1/games?dates[]=YYYY-MM-DD`), with the lid open.
4. Commit the fixture + any rule change, update §28 and the status line, then 6.6 (`/code-review high` over 6.1–6.5).
