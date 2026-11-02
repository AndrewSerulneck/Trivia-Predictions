# Pick 'Em plan: Phase 7.3 handoff (never grade a called-off college game)

Plan: `docs/pickem-college-football-and-prize-plan.md` — finding **F3** in §9, "### Phase 7.3" in §7. Previous handoff:
`…_PHASE_7.1c_HANDOFF.md` (built earlier in the same session, 2026-11-01). Built 2026-11-01.

## For Andrew (plain English)

**What changed:** College Football Pick 'Em now only scores a game when the data provider plainly says it's over ("post"
+ "final") with a real score. If the provider says a game was cancelled, postponed, forfeited or abandoned, everyone's
picks on it are cancelled right away (no points, no loss). Before this, a cancelled game could be scored as 0–0, which
in spread mode would have paid everyone who picked the away team. A 0–0 "final" is never believed (football can't end
0–0); those picks wait and are cancelled 48 hours after kickoff, as before. NFL Pick 'Em and every other sport are
unchanged.

**Is it live?** No. Code only (no database change), uncommitted, not deployed (`main` is frozen). It ships with Phases 1–6.

**What's left:** 7.4 (stuck old picks can't jam settlement), 7.5 (small fixes), 7.6 (re-review), then your phone pass.
Phases 1–6 must not deploy before 7.4 is done. The plan now lists every 7.x fix as its own phase with model and effort
(table at the top of "### Phase 7").

**What needs you:** nothing for 7.3. (7.1c's database change is waiting for you to apply: see its handoff.)

## For the next agent

### 1. Next phase goal and scope
**Next: Phase 7.4 — stuck pending picks can't stop settlement (F4). Opus 5.5 · high.** Spec: "### Phase 7.4" in plan §7
and F4 in §9. A pending pick whose game started > 8 days ago (outside the ±7-day score window) is cancelled with one
`[Pick 'Em] stale-pending-canceled` log line per run (count + oldest); a college pick whose game isn't found at all still
gets its 48-hour cancel. Out of scope: 7.5, 7.6, F7 (Andrew: leave the default), any display change for cancelled games.

### 2. Starting state
- Branch `after-app-review`, last commit `407e4da2` (unrelated). Phases 1–6, every Phase 7 doc and 7.1/7.1b/7.2/7.1c/7.3
  are **uncommitted**. Nothing pushed or deployed. `main` frozen: never push `main`, never `supabase db push`, never change
  Production env without Andrew.
- **Production DB:** untouched by 7.3. `20261101153306` (7.1c) is written but **not applied**; the earlier seven Pick 'Em
  migrations are applied.

### 3. Decisions already made (don't re-ask)
- Final = `status` "post" AND `status_state` "final" (case-insensitive) AND both scores AND not 0–0 — exactly the plan.
  All 7 overtime games in the Oct 24 fixture report `post`/`final` (period 0), so OT games grade.
- Called off (cancel at once) = `status` or `status_state` containing `cancel` (both spellings, and e.g.
  `STATUS_CANCELED`), `postpon`, `forfeit`, `abandon`. Forfeit/abandoned were added beyond the plan's
  cancelled/postponed: a forfeit's score isn't a played game (it would grade spreads wrongly), and the outcome is the
  same as the 48-hour cancel, only sooner.
- **Suspended / delayed are NOT called off:** the game may resume, so it waits like any unfinished game and is cancelled
  48 h after kickoff if no final arrives.
- `isBallDontLieFinalStatus` (all sports) is unchanged; only college grading stopped using it. The games LIST still uses
  it for `status: "final"`, so a cancelled college game shows as "Final" with no score on the list — left as is (a
  display question, not money; changing it could make a cancelled future game look pickable). Mention in 7.6 if wanted.

### 4. Files changed
- `lib/pickemCollegeFootball.ts`: new `isCollegeFootballCalledOff({ status, statusState })` and
  `isCollegeFootballFinal({ status, statusState, homeScore, awayScore })`; `collegeFootballGradeGate` now takes
  `status`/`statusState` (no more `completed`) and returns `"grade" | "wait" | "cancel" | "called_off"`.
- `lib/pickem.ts`: `BallDontLieScoreEvent` gains `status` / `status_state` (the provider's raw words), set in the generic
  branch of `fetchScoresForSportKey` (not the MMA branch). In `settlePendingPickEmPicks`: the gate gets those fields;
  `"called_off"` and `"cancel"` both cancel (own log lines: `the provider says "<status_state>"` vs `no final 48 hours
  after kickoff`); a college game the provider calls "post" that isn't a gradeable final logs once per game per run
  (`collegeNotFinalWarned`) — so a provider wording change can't silently run every college pick into the 48-hour cancel.
  A called-off game cancels even when the spread line lock read failed (no line is needed to cancel).
- `tests/lib.pickem-college-football.test.ts`: gate unit tests rewritten (post+final only, every captured OT final grades,
  called-off spellings in either field, suspended/delayed wait, 0–0 final waits then cancels, shutout grades); new
  settlement block "never grades a called-off college game" (winner mode: `post/canceled`, `post/cancelled`,
  `pre/postponed` → both picks canceled, never push; 0–0 "final" waits with one warning, then cancels at 48 h).
- `tests/lib.pickem-college-spreads.test.ts`: cancelled game with home −7 → both spread picks canceled (the old rule paid
  the away picker); postponed game cancels even with the line lock failing.
- Plan (status line, Phase 7 table + headings, F3 row), `CLAUDE.md` Pick 'Em Phase 7 bullet, this file.

### 5. Facts and traps
- How BallDontLie marks a cancelled/postponed college game is still **unverified** (no captured example; the provider
  looks ESPN-shaped: `pre`/`in`/`post` + `scheduled`/`in_progress`/`final`). The tests use synthetic payloads; the
  "post but not final" warning is the safety net. If such a line shows up in logs, capture the payload as a fixture.
- Settlement reads the score by team NAME (`getTeamScore`), so the synthetic tests keep the real teams.
- The old gate passed `scoreEvent.completed` (= `isBallDontLieFinalStatus`, which counts `canceled` and anything with
  "final" as over). That `completed` field is still set and still used for every other sport.
- Typecheck and build must not run at the same time (`.next/types`).

### 6. Build / test / verification (2026-11-01, after 7.1c + 7.3)
- `npx tsc --noEmit` clean; `npx eslint lib/pickem.ts lib/pickemCollegeFootball.ts` + the changed tests clean.
- `npm run test`: 5,994 pass / 13 skipped / 4 fail — the same four date-based Prop Bingo star-index tripwires as every
  phase (`tests/lib.sportsBingo.{nfl,mlb}-star-index{,-freshness}.test.ts`). NFL Pick 'Em tests
  (`tests/lib.pickem-nfl-scoring-mode.test.ts` etc.) pass unchanged.
- `npm run test:bingo-nfl`: 292 pass / 2 fail (the NFL half of the same tripwires).
- `test:pickem-points-sql`, `test:pickem-lines-sql`, `test:pickem-prizes-sql`, `test:pickem-prize-awards-sql`,
  `test:player-write-lockdown-sql`, `test:security-definer-sql` pass.
- `npm run build` passes.
- Non-vacuous by construction: on the old gate, `post/canceled` 0–0 graded (winner picks → push, away spread picker →
  won) and `pre/postponed` waited 48 h — each new settlement test asserts the opposite.
- **Unverified:** a real cancelled/postponed college payload from the provider.

### 7. Open questions for Andrew
- None new. Waiting on him: apply 7.1c's migration. Still open: §8 Q1 (NBA/WNBA spreads later), Q3 (Pick 'Em standings
  in Partner Results; default no).

### 8. Recommended first steps for Phase 7.4 (Opus 5.5 · high)
1. Read F4 in plan §9 and "### Phase 7.4" in §7.
2. Read `settlePendingPickEmPicks` in `lib/pickem.ts`: the pending read (`order by starts_at limit 500`), the per-sport
   ±7-day score fetch in `fetchScoresForSportKey` (`now ± 7 days`), and the `if (!scoreEvent) continue;` before the college
   gate — that `continue` is what lets an unfindable college pick skip its 48-hour cancel.
3. Re-measure the stuck rows read-only (`node --env-file=.env.local` with `supabaseAdmin`-style service key, SELECT only):
   pending picks with `starts_at` older than 8 days (2026-11-01: 4 NFL picks from 2026-07-30).
4. Tests: 600 stuck + 1 fresh → the fresh one grades; college missing-event cancel at 48 h; NFL grading unchanged.
