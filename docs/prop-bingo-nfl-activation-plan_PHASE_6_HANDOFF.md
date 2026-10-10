# Prop Bingo NFL activation plan — Phase 6 handoff (2026-10-10)

## Summary for Andrew

- **What happened:** the plan's last data task, Phase 6 (re-check the NFL board win rate on real
  2026 results), was run over **Weeks 1–5 of 2026** (65 completed games, 260 simulated boards).
- **Bug found and fixed (local only):** in about **1 in 3 NFL games** (22 of 65), three kinds of
  square could never be graded, so they came out "void" (no result). Those squares were
  "any player gets 10+ catches", "the game has 300+ rushing yards" and "a non-quarterback throws a
  pass". The cause was one defender per game whose only stat was a fumble recovery. The grader
  didn't treat his row as "this player played", so his blank catches/yards counted as unknown
  instead of zero. After the fix, those squares void **0%** of the time, down from **30–34%**.
  Across whole boards, ungraded squares fell from **2.07% to 0.03%**.
- **Win rate:** the boards are still on target. The backtest win rate is **28.1%** with the fix
  (27.7% before); the target band is 20–30%.
- **No prices were changed.** Five weeks is too little data. Some families moved by ±0.1 between
  two runs over the *same* games, so those swings are noise, not mispricing. Nothing met the bar to
  retune.
- **Not live yet:** the fix is uncommitted and not deployed. Committing and deploying is your call.
- **Worth knowing:** production has only **one NFL Bingo card ever** (the 9/9 opener test board),
  so no real-player NFL data exists to calibrate against.

## For the next agent

### 1. Goal / scope of what remains

This plan is dated history: its header says so, and its remaining live and device checks are owned by
`docs/bingo-pickem-reliability-plan.md` (closed) and the release record
`docs/bingo-pickem-reliability-release-record-2026-09-19.md` §"Optional operational monitoring".
There is **no Phase 7+ work to start**. What is left:

- Commit and deploy this fix (Andrew's call).
- **Ongoing calibration (no deadline):** re-run the commands in §6 after the regular season ends
  (Week 18, early January 2027). Re-tune only families with a void-adjusted mean |gap| > 0.05 over
  the full season, per Phase 8c's standard.
- Out of scope: Phase 5 live observation (its Week 1 windows passed; it is optional monitoring in
  the release record), any historical board/reward repair (Andrew declined it on 2026-09-19), and
  changing env flags.

### 2. Starting state

- Branch `main`, HEAD `52c63df` (Fix production build: anchor .vercelignore to /native). Nothing
  from this session is committed, pushed or deployed.
- Uncommitted changes from this session:
  - `lib/sportsBingo.ts`: adds `NFL_POSITIVE_PARTICIPATION_FIELDS` and `nflRowHasRecordedAction`
    beside `NFL_NUMERIC_STAT_FIELDS`. `buildNFLGameStatsSnapshot`'s `hasAction` now calls it.
  - `tests/lib.sportsBingo.nfl-participation-row.test.ts`: new, 6 tests.
  - `package.json`: the new test was added to the front of `test:bingo-nfl`.
  - `docs/phase0-artifacts/nfl-2026-w1-5-calibration-{before,after}-fix-2026-10-10.json`: raw
    calibration output.
  - This handoff, plus the status line in `docs/prop-bingo-nfl-activation-plan.md`.
- `next-env.d.ts` and `.vscode/settings.json` were already modified or untracked before this
  session. They are not part of this work.
- Data: **read-only**. No database writes, no env changes. The production reads were one query
  each on `sports_bingo_cards` and `sports_bingo_squares`.

### 3. Decisions already made (don't re-ask)

- Do not repair historical boards or rewards (Andrew, 2026-09-19). The one production NFL card
  (opener NE @ SEA, `lost`, 18 void / 6 miss, graded before the reliability fix) stays as is.
- Missing data is not zero. The fix keeps that rule. A null counter becomes 0 only on a row with
  recorded action **and** when both teams' stats are complete (`completeTeams`). The fix only widens
  what counts as "recorded action". Columns Bingo never grades count only when **positive**, so a
  zero-only row is still treated as unknown. Absent (undefined) fields still void.
- No price changes on a 5-week sample (plan Phase 6: "do not chase noise").

### 4. How the fix works

`buildNFLGameStatsSnapshot` (`lib/sportsBingo.ts`, around line 3214) converts null → 0 only when
`hasAction && completeTeams`. Before the fix, `hasAction` looked only at the 25 graded columns
(`NFL_NUMERIC_STAT_FIELDS`). BallDontLie sends a row for a player whose only stat is a fumble
recovery, for example Keion White (DE, game 1392217):
`fumbles: 0, fumbles_lost: 0, fumbles_recovered: 1`, with everything else null. That row had no
"action", so its `receptions` stayed NaN. The whole-game check in `evaluateResolver` (around line
9515) requires **every** line to have a finite value, so it voided with
`required_player_stat_missing` / `passer_position_missing`. Now a positive value in a non-graded
column (`fumbles`, `fumbles_recovered`, `solo_tackles`, `kick_returns`, `punts`, …) also proves
participation. The same snapshot builder feeds the live settlement sweep, so the live product
benefits too, not just the backtest.

### 5. Facts and traps

- `scripts/calibrate-nfl-square-families.cjs` prices boards from a **retrodictive power-rating
  consensus**, not real odds. So gaps on the market families (`spread_*`, `team_total_*`,
  `game_total_*`, `moneyline`) say nothing about live pricing, which uses an 8-vendor de-vigged
  consensus. Only the hand-priced `nfl_*` families are meaningful there.
- Player-prop squares and `BINGO_NFL_MILESTONE_DEVIG_FACTOR` (0.92) **cannot be validated
  offline**: `/nfl/v1/odds/player_props` is live-only, and production has one NFL card. This part of
  Phase 6 stays unvalidated until real players generate NFL boards.
- Two calibration runs over the same 65 games gave very different family gaps, because the board
  draws are random (e.g. `nfl_any_quarter_scoreless` +0.139 → −0.033, `nfl_halftime_leader_loses`
  +0.118 → −0.046), and the calibrate script's own board win rate moved 0.246 → 0.323. Treat any
  single run as ±0.1 per family. Agreement between two runs is **not** independent evidence, since
  both use the same games.
- To watch at full season, with no action now: `nfl_combined_team_stat_at_least` (+0.09 and +0.19
  in the two runs; penalties/turnovers combined, likely underpriced) and `nfl_margin_at_least`
  (+0.18 and +0.09).
- `nfl_halftime_leader_loses` voids about 12% of the time by design (`tied_halftime`, not
  retryable). That is a property of the square, not a data gap.
- Production NFL cards are stored with `sport_key = 'nfl'`, not `americanfootball_nfl`. Query both.
- The scratch scripts need `require(process.cwd() + "/node_modules/...")` when run from the
  scratchpad. Only Bingo `.ts` imports need `--conditions react-server --import tsx`.
- `NEXT_PUBLIC_BINGO_NFL_ENABLED` exists in Vercel Preview + Production (added around
  2026-09-05). Its value was not read. Bingo creation no longer uses it as an eligibility override.
  It is read only in `lib/leagueSeasonStatus.ts`.

### 6. Build / run / test

```sh
npx tsc --noEmit                      # exit 0
npm run lint                          # exit 0
npm run test:bingo-nfl                # 294/294 (was 288; +6 new)
npm run test:bingo-mlb                # 142/142
npm run test                          # 3704 pass / 0 fail / 13 skip
npm run build                         # succeeds (199 static pages)
node --conditions react-server --import tsx scripts/replay-bingo-brunswick-incident.cjs --assert-correct   # exit 0
# Calibration (read-only provider calls, ~4 min each):
npm run bingo:calibrate:nfl -- --seasons 2026 --weeks 1,2,3,4,5 --boards 4
npm run bingo:simulate -- --backtest --sports americanfootball_nfl --seasons 2026 --weeks 1,2,3,4,5 --boards 4
```

Don't run `tsc` and `build` at the same time. The new test was confirmed to **fail without the
fix** (3 of 6; the zero-only cases pass either way) and pass with it.

| Measure (2026 W1–5, 260 boards) | Before fix | After fix |
|---|---|---|
| Backtest realized board win rate | 0.2769 | 0.2808 |
| Backtest predicted median / in-band share | 0.2624 / 0.915 | 0.2592 / 0.927 |
| Backtest ungraded square share | 0.0207 | 0.0003 |
| `nfl_game_max_stat_at_least` void share | 0.322 | 0.000 |
| `nfl_game_total_stat_at_least` void share | 0.338 | 0.000 |
| `nfl_non_quarterback_pass_attempt` void share | 0.300 | 0.000 |

Unverified: real-device rendering, live one-minute NFL delivery, and real prop-square hit rates.
The first two are optional monitoring in the release record; the third needs real NFL usage.

### 7. Open questions for Andrew

- Commit and deploy the fix? It is NFL-only, sits in grading, and is covered by the full gate set
  above.

### 8. Recommended first steps

1. If Andrew approves: commit (one commit, e.g. "Bingo NFL: count fumble-recovery-only rows as
   participants"), push, and confirm the Vercel deployment.
2. In January 2027: re-run §6's calibration with `--weeks 1,…,18`. Read the void-adjusted gap
   (`realized / (1 − ungraded)`) and re-tune only hand-priced `nfl_*` families with |gap| > 0.05.
   Model guidance from the plan: Opus-class, medium effort.
