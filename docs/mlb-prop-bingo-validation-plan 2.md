# MLB Prop Bingo — Validation & Correctness Plan

Drafted 2026-08-18, after the MLB row-shape investigation recorded in the addendum to
`docs/prop-bingo-out-of-scope-followup-plan.md`. **Read that addendum first** — it is the evidence
base for everything here and is not repeated in full.

> ## ⚠️ READ THIS FIRST — 2026-08-18 data-loss incident, plan partially invalidated
>
> **All uncommitted work in `lib/sportsBingo.ts` was destroyed on 2026-08-18** and is not
> recoverable (no stash, no editor history, nothing staged). An agent executing Phase 2 ran
> `git checkout -- lib/sportsBingo.ts` intending to undo its own one-line edit; that command resets
> the whole file to `HEAD`, so it discarded every uncommitted change in the file — including work
> the agent had not authored.
>
> **The "done" write-ups below for Phases 1 and 4b are now historically accurate but factually
> false about the current tree.** The code they describe is gone. Their *recorded live results*
> remain valuable as the target numbers to re-verify against — treat them as evidence of what the
> restored code must reproduce, not as a description of what exists.
>
> **What survived** (verified by `git status` — only `lib/sportsBingo.ts` regressed):
> - every test file, including the Phase 2 tests already written and proven failing pre-fix
> - `scripts/validate-mlb-bingo-grading.cjs` (the whole Phase 1 harness)
> - `scripts/simulate-bingo-boards.cjs` (**all of Phase 4a and 4b's script half**)
> - `package.json` script entries (`bingo:validate:mlb`, etc.), all docs
>
> **Phase 4a is genuinely still done** — it lives entirely in the script and `package.json`.
> Re-verified live 2026-08-18 after the incident: `--backtest --sports basketball_nba` throws
> `--backtest only implements americanfootball_nfl, baseball_mlb; …`, and `npm run lint` is clean.
>
> **Recovery is scoped as Phases R1–R4 below.** Do those before touching Phases 3, 5, 6 or 7.
> **R1 and R2 are done (2026-08-18)** — `lib/sportsBingo.ts` is restored and committed on branch
> `restore/mlb-bingo-r1`; `tsc` is back to 0 errors and `npm run bingo:validate:mlb` is at 100% on
> all six metrics. **R3 is next.** Read R1's as-built block for one deliberate deviation from R1's
> own instruction table (`getTeamDisplayName`) and two Phase B reverts R1's table did not list, and
> **read R2's as-built block for a sixth MLB row-shape defect (`getGameTimestamp`) that R1's table
> never listed, affects NFL and WNBA too, and widens Phase 3's scope.**
> Nothing else in the plan changed.

## Why this plan exists

Four defects hid in MLB Prop Bingo simultaneously, and every one of them was invisible to the test
suite, because **no harness has ever run an MLB board end to end**. NFL has two
(`npm run bingo:validate:nfl`, `npm run bingo:calibrate:nfl`) plus a backtest mode. MLB has
neither, and its backtest silently returns NFL games.

The four defects are fixed as of 2026-08-18 and verified against live data. This plan is about the
absence that let them survive, plus two correctness items the investigation surfaced but did not
fix.

## Verified facts this plan is built on

All probed live 2026-08-18; do not re-derive, but **do re-verify before writing code against them**
— the parent plan's standard is that a schema claim from a probe is re-checked, not trusted colder.

| endpoint | fact |
|---|---|
| `/mlb/v1/games` | away side is `away_team` (no `visitor_team` key); runs at `home_team_data.runs` / `away_team_data.runs` (no `*_team_score`); `status` is `"STATUS_FINAL"` (not `"Final"`) |
| `/mlb/v1/stats` | 27 rows/game. `hits`, `rbi`, `runs`, `stolen_bases`, `hr`, `k`, `bb`, `hit_by_pitch`, `ground_outs`, `fly_outs`, `er`, `p_k`, `pitching_outs`, `ip` all present |
| `/mlb/v1/lineups` | 20 rows/game, **starters only**. No `starter` key. Batters carry `batting_order` 1-9; the starting pitcher carries `is_probable_pitcher: true` and a null batting order |
| team objects (both) | no `full_name`. Only `display_name` ("Kansas City Royals") and `name` (mascot only, "Royals") |
| `/nba/v1/lineups` | **does** carry `starter` (21 rows, exactly 10 true). NBA is not affected by the lineup defect |
| `/mlb`, `/nfl`, `/wnba` `/v1/games` | **no `datetime` key**; `date` is already a full ISO timestamp. Only `/nba/v1/games` splits them (date-only `date` + a separate `datetime`). Added by R2 — see its as-built block |

End-to-end spot check through the shipped matcher and snapshot builder (Royals @ Angels,
2026-08-16), post-fix: game matched, score 1/0, `finalized` true, 27 stat lines, **27/27** team
sides resolved, **20/20** starters detected.

---

## Phase 1 — `npm run bingo:validate:mlb`, the harness that should have existed

**The core of this plan. Everything else is easier to justify once this exists.**

**Model:** Sonnet 5 · **Effort:** Medium (~2-3 hrs), plus live API calls.

**Template:** `scripts/validate-nfl-bingo-grading.cjs` (212 lines) — copy its structure, its
`--conditions react-server --import tsx` invocation, and above all its discipline: it imports the
**shipped** graders rather than mirroring them, because "a mirrored implementation in the script
would validate the mirror, not the shipped grader." That rule is the whole point here.

Replay completed MLB games through `pickBestMatchingBallDontLieGame` →
`buildMLBGamePlayerStatsSnapshot` → `evaluateResolver` (all exported as of 2026-08-18) and report,
per game and in aggregate:

1. **Match rate** — how many cards find their game. Was 0% until 2026-08-18; anything below 100%
   is a regression in `ballDontLieAwayTeam` or `teamsMatch`.
2. **Score reconciliation** — snapshot `homeScore`/`awayScore` against the game row's own runs.
3. **`finalized` rate** — must be 100% on completed games. Was 0% until 2026-08-18.
4. **Team-side resolution rate** — stat lines with a non-null `teamSide`, out of all lines. This is
   the number that silently degrades if the mascot-name decision is ever revisited; it measured
   27/27 on the spot check.
5. **Starter detection** — starters found per game. Expect 20 (18 batters + 2 pitchers).
6. **Player-name lookup rate** — how often `findMLBPlayerStatLine` resolves a prop's player ref.
   The MLB counterpart of NFL's first-TD-scorer parse rate, and the direct measure of how often a
   player-prop square degrades.
7. **Realized rate per resolver family**, next to the shipped base rate — as a smoke test only,
   with the NFL script's own caveat repeated verbatim: a few dozen games flags a badly wrong price,
   it cannot set a right one. Phase 4 is the instrument for that.

**Gotcha to design around:** `/mlb/v1/lineups` returns **starters only**, so "player not in the
lineup map" means bench-or-scratched, not "lineup unavailable". Distinguish an empty lineup
response (endpoint down) from a populated one (player genuinely not starting), or the report will
read a normal bench player as a data outage.

**Wire it up:** `"bingo:validate:mlb": "node --env-file=.env.local --conditions react-server
--import tsx scripts/validate-mlb-bingo-grading.cjs"`, mirroring `bingo:validate:nfl`.

**Tests:** the script is the test. Add no vitest coverage for the script itself; do add a fixture
regression to `tests/lib.sportsBingo.mlb-row-shape.test.ts` for anything it uncovers.

---

## Phase 2 — MLB player props settle `miss` on missing data. They must void.

**A real, player-facing correctness bug, found during the Phase 1 scoping and not yet fixed.**

**Model:** Sonnet 5 · **Effort:** Low (~45 min).
**File:** `lib/sportsBingo.ts` ~8745-8760 (re-grep; the `player_prop` case in `evaluateResolver`).

The file states the house rule itself: *"Missing data voids, it never misses. No box score, no
plays walk, no stat line for the player: the square voids at Final rather than charging a player
for our outage."* The **NFL** branch of `player_prop` implements exactly that — four separate
`void` returns for unsupported market, missing snapshot, missing stat line, unparseable value.

**The MLB branch of the same resolver kind returns `miss` in every one of those positions.** So
with the snapshot unreachable — which it was, always, until 2026-08-18 — **every MLB player-prop
square on every card settled as a loss for the player.**

`player_prop` is already registered in `isResolverEligibleForVoidRegrade` (~9852), so the regrade
machinery is in place and has simply never had a void to reopen.

**Do:** bring the MLB arm to parity with the NFL arm — missing snapshot, missing stat line, and
non-finite value all `void` at Final, `pending` before it. Do **not** touch the NBA arm in the same
edit; it shares the branch and is a separate league with its own working data path. Confirm whether
NBA has the same asymmetry and, if so, report it rather than silently fixing it here.

**Tests:** assert each of the three missing-data positions voids rather than misses, for MLB
specifically, with an NBA case alongside proving it was left alone. Prove failing pre-fix.

---

## Phase 3 — Decide what to do about historically mis-settled MLB cards

**Blocked on a human decision. Do not start it without one.**

**Model:** Sonnet 5 to execute; the decision is Andrew's · **Effort:** Low to investigate
(~30 min), unknown to remediate.

Phase 2 establishes that MLB player-prop squares have been settling `miss` on absent data. Phase 1
plus the addendum establish that the data was absent for as long as MLB has shipped. The open
question is whether any real player was affected, and it is answerable cheaply:

1. Count settled `sports_bingo_squares` rows on `baseball_mlb` cards with a `player_prop` resolver
   and `status = 'miss'`. If that count is zero — plausible, if MLB Prop Bingo has not had live
   players — this phase closes immediately with a note and nothing else happens.
2. If it is non-zero, the options are: leave it (cheapest, and defensible if no prize was
   affected), regrade the affected squares through the void-regrade path, or regrade and re-run
   line detection for affected cards. **This is a product and fairness call, not an engineering
   one.** Present the count and the options; do not pick one.

**Do not batch this into Phase 2.** Fixing forward behavior and rewriting settled player history
are different risks and deserve separate approval.

---

## Phase 4 — Un-hardcode backtest mode, or make it fail loudly

**Model:** Sonnet 5 · **Effort:** Medium (~2 hrs) to implement MLB; Low (~20 min) for the guard
alone.
**File:** `scripts/simulate-bingo-boards.cjs:317` (`sportKey: "americanfootball_nfl"`, hardcoded).

`npm run bingo:simulate -- --backtest --sports baseball_mlb` **accepts the flag, ignores it, and
returns NFL games.** It reports a plausible-looking realized win rate for the wrong league. That is
how this was found — the sample games in an "MLB" run were Eagles @ Giants.

Two pieces, and **the first is worth doing even if the second is deferred**:

- **4a (do first, ~20 min):** make backtest mode reject any `--sports` value it does not implement,
  loudly. A harness that silently answers about a different league than the one you asked about is
  worse than one that refuses. The `weeks`-based slate selection is NFL-shaped anyway.
- **4b:** implement real MLB backtest — date-based rather than week-based game selection, the
  retrodictive market built from MLB run-scoring rather than NFL points, and settlement through
  the Phase 1 substrate. Note the script's existing honest limitation still applies: BDL retains no
  historical odds, so player-prop squares cannot be backtested at all in any league.

---

## Phase 4a — done (2026-08-18)

`scripts/simulate-bingo-boards.cjs` now throws before doing any work if `--backtest` is combined
with an **explicitly passed** `--sports` value other than `americanfootball_nfl` (added a
`sportsExplicit` flag in `parseArgs` so plain `--backtest` with no `--sports` — which inherits the
four-league forward-mode default — still runs; only an explicit non-NFL `--sports` under
`--backtest` is rejected). Verified live:
`--backtest --sports baseball_mlb` now exits with `Error: --backtest only implements
americanfootball_nfl; got unsupported --sports value(s): baseball_mlb` instead of silently
returning NFL games. `npx tsc --noEmit` and `npm run lint` both clean. No test added — Phase 4a is
listed as instrument-only/exempt in the plan's own testing standard, and this is a startup guard,
not a behavior change to grading or generation.

---

## Phase 1 — ~~done~~ **script survived, `lib/` half REVERTED (see incident banner)**

> **Status after the 2026-08-18 incident:** the harness script and its `package.json` entry are
> intact. The two `lib/sportsBingo.ts` exports it depends on (`evaluateResolver`,
> `findMLBPlayerStatLine`) were destroyed, so `npm run bingo:validate:mlb` cannot currently run.
> Restored by **R1**; the live numbers recorded below are the acceptance target for **R2**.

`npm run bingo:validate:mlb` (`scripts/validate-mlb-bingo-grading.cjs`, `--days`/`--limit` flags,
default 5 days / 25 games) exists and was run live. Two functions had to be exported from
`lib/sportsBingo.ts` that the plan assumed were already exported and were not — **re-verify export
claims in a plan against the source, not against the plan's own prose**: `evaluateResolver` (private
until now, needed directly so the harness can grade a `player_prop` resolver against a live-fetched
snapshot) and `findMLBPlayerStatLine` (ditto, for the player-name lookup metric). Both are exported
now with a one-line "exported for the validator" comment, same pattern as the two functions the plan
correctly said were already exported (`pickBestMatchingBallDontLieGame`,
`buildMLBGamePlayerStatsSnapshot`).

Live run against the trailing 7 days (15 completed games, 433 stat lines, 300 starters):

```
match rate                        15/15 (100.0%)
score reconciliation               15/15 (100.0%)
finalized rate                     15/15 (100.0%)
team-side resolution               433/433 (100.0%)
starter rows (raw / flagged true)  300 / 300 across 15 games with a populated lineup response
empty lineup responses             0/15
player-name lookup rate            300/300 (100.0%)

player_hits               over 0.5   realized 55.9%
player_home_runs          over 0.5   realized 13.0%
player_rbis                over 0.5   realized 28.1%
player_runs                over 0.5   realized 34.1%
player_stolen_bases        over 0.5   realized  7.0%
player_strikeouts_pitcher  over 3.5   realized 83.3%
player_pitcher_outs       over 14.5   realized 80.0%
```

All four previously-broken metrics (match, score, finalized, team-side/starter detection) hold at
100% on live data — the 2026-08-18 fixes are confirmed still holding, not just spot-checked once.
Nothing in the "Verified facts" table drifted. **Scope note for whoever reads this next:** the
harness validates the `player_prop` resolver path only. It does not touch `mlb_webhook_*` — those
read only `resolver.currentCount` from the live webhook stream and never touch this snapshot at
all, which is exactly why Phase 6 exists as a separate instrument. Gates: `tsc --noEmit` clean,
`npm run lint` clean, `test:bingo-nfl` 244/244, `test:bingo-mlb` 97/97.

---

## Phase 4b — ~~done~~ **script survived, `lib/` half REVERTED (see incident banner)**

> **Status after the 2026-08-18 incident:** all ~334 lines of the script half
> (`runMLBBacktest`, `buildMLBPowerRatings`, `mlbRetrodictiveConsensus`, `buildMlbMarketModel`,
> `MLB_TEAM_EVENT_STAT_FIELDS`, the sigma constants, the widened 4a guard) are **intact**. What was
> destroyed is the `lib/sportsBingo.ts` side: the `buildMlbTeamEventCandidateTemplatesForBacktest`
> export and the `extraCandidates` param on `buildSportsBingoBoardFromBallDontLieGame`. Confirmed
> live post-incident: `--backtest --days 2` now dies with
> `TypeError: sportsBingo.buildMlbTeamEventCandidateTemplatesForBacktest is not a function`.
> Restored by **R4** — which is therefore much smaller than the original Phase 4b, since only the
> two `lib/` seams need rewriting, against a caller that already exists and specifies them exactly.

`npm run bingo:simulate -- --backtest --sports baseball_mlb --days N --boards M` now runs a real
MLB backtest instead of the 4a guard's refusal. Three things, matching the plan's ask, plus one
unplanned blocker that ate most of the time:

1. **Date-based selection**: `--days` (default 10) replaces `--weeks`/`--seasons` for MLB. Ratings
   for a given date are built only from games strictly before that date — leak-free, same discipline
   as the NFL loop's `week < current week` filter.
2. **Retrodictive market from runs, not points**: `buildMLBPowerRatings` /
   `mlbRetrodictiveConsensus` / `buildMlbMarketModel` in `scripts/simulate-bingo-boards.cjs` mirror
   the NFL trio but read `home_team_data.runs` / `away_team_data.runs` (verified MLB field names,
   not `*_team_score`). The sigma constants (`MLB_MARGIN_SIGMA` etc.) are **estimated from published
   run-distribution figures, not measured against this feed** — flagged honestly in-code; sharpening
   them into a measured constant the way Phase 7 measured the team-event rates is future work, not
   this phase's.
3. **Settlement through the Phase 1 substrate**: `gradeResolversAgainstCompletedMLBGame` (already
   shipped, exported since an earlier phase, confirmed still working).

**The blocker**: a board built from MLB core markets alone (moneyline/spread/total/team-total —
the only thing `buildSportsBingoBoardFromBallDontLieGame`'s synchronous path reaches) cannot
generate at all. `generateBoardForGame` throws `"Unable to generate a bingo board for this game"`
on every single game — confirmed live, not theoretical. Four resolver families is too few for the
generator's line-feasibility/diversity constraints across a 5x5 grid; a real MLB board depends on
the `mlb_webhook_team_event_at_least` Tier-1 block for bucket diversity, and that block is normally
assembled by a giant async pipeline (`getGameEntryWithCandidates` → `getGameCatalog`) that only
looks at **upcoming** games and can structurally never find a historical one.

**The fix**: a new export, `buildMlbTeamEventCandidateTemplatesForBacktest(game)` in
`lib/sportsBingo.ts`, reconstructs just that block standalone — **league-mean priced only, no
per-game opponent adjustment** (`predictMlbTeamEventRate(event, null, 0)`, which is that function's
own documented degradation path, not a new invention). Real opponent-adjusted pricing needs
`buildMlbTeamAllowedRates`, which is itself embedded in the pipeline that can't run on historical
games — reproducing it here would mean re-implementing the candidate builder, which is the exact
discipline this codebase's backtest seams exist to avoid. `buildSportsBingoBoardFromBallDontLieGame`
grew one new optional param, `extraCandidates`, purely to accept this block; NFL backtesting doesn't
use it and is unaffected (confirmed: NFL backtest still lands 23.3% realized on a 6-game live check,
inside the 20-30% band). Settlement fetches real `/mlb/v1/stats` box scores and sums them into
`teamEventTotals` using the same field mapping `scripts/measure-mlb-event-rates.cjs` measured the
base rates against (documented in-code as `MLB_TEAM_EVENT_STAT_FIELDS`) — grading is real even
though team-event *pricing* is simplified.

Live run, trailing 10 days, 3 boards/game: **423 MLB boards, realized win rate 19.4%** against a
predicted mean of 26.3% (target band 20-30%, `inTargetBand` 0.998 on the *predicted* side).
`ungradedSquareShare: 0` — every square resolved cleanly, no unexpected void/pending pileup. The
realized rate sitting a few points under the predicted band is expected and not a bug: this is a
smoke test on a league-mean-priced team-event block over 10 days, not a calibrated replay — read it
as "the grading and generation paths work end to end," not as "the price is right." Sharpening that
gap is exactly what Phase 5 (`bingo:calibrate:mlb`) exists for, and per the plan's own sequencing it
should not be attempted before then.

**Scope note carried into the script's own header and `scopeNote` output field** (repeat it if this
result gets quoted elsewhere): a backtest board here is core markets plus a league-mean team-event
block, settled against real box scores. Player props remain unbacktestable in any league (no
historical odds — the plan's own stated limitation, unchanged). The `4a` sports-guard was widened
from `{americanfootball_nfl}` to `{americanfootball_nfl, baseball_mlb}`; requesting
`basketball_nba`/`basketball_wnba` under `--backtest` still throws loudly (re-verified live). Gates:
`tsc --noEmit` clean, `npm run lint` clean, `test:bingo-nfl` 244/244, `test:bingo-mlb` 97/97.

---

# Recovery phases R1–R4 — restoring `lib/sportsBingo.ts`

Added 2026-08-18 after the data-loss incident. **These replace the original "do Phase 2 next"
handoff.** Run them one at a time, in order; each has its own gate and is independently verifiable.
R1 is a hard prerequisite for the other three.

All line numbers below were verified against the current (reverted) file on 2026-08-18. **Re-grep
anyway** — R1 itself shifts every line number after it.

---

## Phase R1 — Restore the four MLB row-shape fixes, the shared score normalizer, and the exports

**Model:** Sonnet 5 · **Effort:** Medium (~2 hrs) · **Blocks R2, R3, R4.**

The incident reverted further back than Phases 1/4b: it also took out the **original four MLB
defect fixes** from the row-shape investigation, which had never been committed either. The tree is
now back to the state the addendum to `docs/prop-bingo-out-of-scope-followup-plan.md` describes as
broken — meaning **MLB player-prop squares are once again ungradeable in production**, not merely
untested. That makes R1 the highest-priority item in this document.

Diagnostic shortcut: `npx tsc --noEmit` currently emits exactly 9 errors, all of them
`@/lib/sportsBingo` import failures from the four orphaned test files. TS distinguishes the two
cases for you — **TS2459** ("declares X locally, but it is not exported") means the function
survived and needs only an `export`; **TS2305** ("has no exported member") means it must be
rewritten from scratch.

### R1a — the four defect fixes (all reverted, all production-affecting)

| # | site (verified 2026-08-18) | current (broken) read | must become |
|---|---|---|---|
| 1 | `getTeamDisplayName`, **1323-1325** | `team?.full_name ?? team?.name` | add `display_name` — MLB team objects have **no `full_name`**, only `display_name` ("Kansas City Royals") and a mascot-only `name` ("Royals") |
| 2 | `isBallDontLieGameFinal`, **2080-2082** | `status.…startsWith("final")` | `.includes("final")` — MLB says `"STATUS_FINAL"`, so `finalized` was never true |
| 3 | `pickBestMatchingBallDontLieGame`, **2133** | `getTeamDisplayName(game.visitor_team)` | read `visitor_team ?? away_team` (the plan calls this helper `ballDontLieAwayTeam`; note **1402** already uses that exact `?? away_team` idiom for events — follow it) |
| 4 | `buildMLBGamePlayerStatsSnapshot`, **2469** | `parseScoreValue(game.visitor_team_score)` (+ `home_team_score`) | `ballDontLieHomeScore` / `ballDontLieAwayScore` helpers reading `home_team_data.runs` / `away_team_data.runs`; MLB has **no `*_team_score` key at all** |
| 5 | starter detection, **2525** (`getMLBGamePlayerStatsSnapshot`) and **5254** (`buildMLBPlayerPropCandidatesFromRecentStats`) | `row.starter === true` / `row.starter !== true` | `isBallDontLieLineupStarter(row)` — MLB lineup rows carry **no `starter` key**; batters have `batting_order` 1-9, the SP has `is_probable_pitcher: true` with a null batting order |

**Do not touch the NBA/NFL score-read sites** — **2215** (`buildNBAGamePlayerStatsSnapshot`) and
**2830** (`buildNFLGameStatsSnapshot`) are correct as-is for their leagues, as are the NBA starter
reads at **2293** and **4687**. Only the five rows above are MLB-reachable. The new
`isBallDontLieLineupStarter` must stay correct for NBA's boolean vocabulary too, since the surviving
test asserts both.

### R1b — the shared score normalizer (`normalizeBallDontLieScoreRow`, absent → write it)

`tests/lib.sportsBingo.balldontlie-score-normalizer.test.ts` survived and specifies this function
completely — **read the test first and satisfy it literally**; it is a better spec than this
paragraph. It is the shape-tolerant normalizer both leagues share, returning
`{ gameId, sportKey, homeTeam, awayTeam, homeScore, awayScore, completed }`. Point
`getScoresBySportKey` (**10168**) at it.

While in there: `getScoresBySportKey` declares its **own duplicate** `sportPathByKey` table at
**10177** whose soccer paths are stale (`/mls/v1/games`, where the module-level
`SPORT_PATH_BY_KEY` at **1056** says `/mls/v1/matches`). Delete the duplicate and use
`SPORT_PATH_BY_KEY`. That de-duplication is what the surviving
`tests/lib.sportsBingo.sport-path-keys.test.ts` guard exists to protect.

### R1c — the exports

Export these (all already exist unless noted); each is required by a surviving test or script:

| symbol | needed by | note |
|---|---|---|
| `SPORT_PATH_BY_KEY` | `sport-path-keys.test.ts` | exists, **1056** |
| `pickBestMatchingBallDontLieGame` | `mlb-row-shape.test.ts`, validator | exists, **2130** |
| `buildMLBGamePlayerStatsSnapshot` | `mlb-row-shape.test.ts`, validator | exists, **2412** |
| `evaluateResolver` | `mlb-row-shape.test.ts`, validator | exists, **8471** — Phase 1 needed it; add the one-line "exported for the validator" comment |
| `findMLBPlayerStatLine` | validator (player-lookup metric) | exists, **3687** — same comment |
| `isNFLSafetyPlay`, `isNFLTwoPointConversionPlay` | `nfl-safety-attribution.test.ts` | exist, **2952** / **2969** |
| `normalizeBallDontLieScoreRow` | `balldontlie-score-normalizer.test.ts` | **write it (R1b)** |
| `isBallDontLieLineupStarter` | `mlb-row-shape.test.ts` | **write it (R1a #5)** |

### R1 gate

```
npx tsc --noEmit          # must go from 9 errors to 0
npm run lint
npm run test:bingo-nfl    # 244 at time of writing
npm run test:bingo-mlb    # 97 at time of writing
npx vitest run tests/lib.sportsBingo.mlb-row-shape.test.ts \
  tests/lib.sportsBingo.balldontlie-score-normalizer.test.ts \
  tests/lib.sportsBingo.sport-path-keys.test.ts \
  tests/lib.sportsBingo.nfl-safety-attribution.test.ts
```

Those four test files are the pre-written proof for R1 — they were authored against the destroyed
code and fail today. **The three Phase 2 tests inside `mlb-row-shape.test.ts` will still fail after
R1** (they assert the R3 `void` behavior); that is expected and correct. Everything else in the four
files must pass.

**Then commit.** R1 restores production-affecting fixes that have now been lost once — do not leave
it sitting uncommitted.

---

## Phase R1 — done (2026-08-18)

**`lib/sportsBingo.ts` is restored. `tsc --noEmit` went from 9 errors to 0; `npm run test` is
1830/1846 passing with exactly three failures, all of them the pre-written R3 tests.** Committed on
branch `restore/mlb-bingo-r1` (see "Branch, not main" below).

### What shipped, site by site

All five R1a defect fixes plus R1b and R1c. Line numbers are post-change and will drift again.

- **`getTeamDisplayName` (~1323)** — **left reading `full_name ?? name`, deliberately.** See "The
  one deviation" below; this is the only place R1 departs from the plan's table.
- **`ballDontLieTeamFullName` (new, ~1340)** — `full_name ?? display_name ?? name`. The full-name
  read for callers that *store or display* the string rather than fuzzy-matching it. Today that is
  `normalizeBallDontLieScoreRow` only.
- **`ballDontLieAwayTeam` (new, ~1348)** — `game.visitor_team ?? game.away_team`, the helper the
  plan named. Used by the matcher and the normalizer.
- **`ballDontLieHomeScore` / `ballDontLieAwayScore` (new, ~1375)** — `*_team_score ?? *_team_data.runs`
  via a small `ballDontLieTeamDataScore` (`runs ?? points ?? score`). Written as a `??` chain rather
  than a league branch so one helper serves both shapes; MLB has no flat key so it falls through to
  `runs`, NBA/NFL hit the flat key first and never look at `*_team_data`.
- **`isBallDontLieLineupStarter` (new, ~1390, exported)** — reads the NBA boolean *first* (`typeof
  row.starter === "boolean"` — so an explicit `starter: false` is honored and cannot fall through to
  the MLB heuristics), then `is_probable_pitcher === true`, then `batting_order` in 1-9.
- **`isBallDontLieGameFinal` (~2130)** — `startsWith("final")` → `includes("final")`.
- **`pickBestMatchingBallDontLieGame` (~2190, exported)** — away side now `ballDontLieAwayTeam(game)`.
- **`buildMLBGamePlayerStatsSnapshot` (~2480, exported)** — scores now via the two helpers. NBA
  (~2270) and NFL (~2890) score reads left on `parseScoreValue(game.home_team_score)` untouched, as
  instructed.
- **Starter reads** — `getMLBGamePlayerStatsSnapshot` (~2600) and
  `buildMLBPlayerPropCandidatesFromRecentStats` (~5310) now call `isBallDontLieLineupStarter(row)`.
  The NBA reads at ~2350 and ~4750 still say `row.starter === true` — correct for that league and
  out of scope.
- **`normalizeBallDontLieScoreRow` (new, ~1310, exported)** — R1b, written to satisfy
  `tests/lib.sportsBingo.balldontlie-score-normalizer.test.ts` literally. Signature
  `(row: Record<string, unknown>, sportKey: string) => ScoreSnapshot | null`; casts to
  `BallDontLieGame` internally. Carries forward the `\bft\b` whole-word soccer check verbatim from
  the code it replaced (a bare `includes("ft")` also matches "halftime").
- **`getScoresBySportKey` (~10190)** — its 25-line inline parse loop is now four lines calling the
  normalizer, and its duplicate `sportPathByKey` table is deleted in favour of `SPORT_PATH_BY_KEY`.
- **Exports added:** `SPORT_PATH_BY_KEY`, `normalizeBallDontLieScoreRow`,
  `isBallDontLieLineupStarter`, `pickBestMatchingBallDontLieGame`, `buildMLBGamePlayerStatsSnapshot`,
  `evaluateResolver`, `findMLBPlayerStatLine`, `isNFLSafetyPlay`, `isNFLTwoPointConversionPlay`.
  Each carries a one-line comment naming the test or script that needs it.
- **Types widened** (the plan didn't mention this and it is required): `BallDontLieTeam` gained
  `display_name`; `BallDontLieGame` gained `away_team`, `home_team_data`, `away_team_data` (new
  `BallDontLieTeamGameData` type); `BallDontLieLineup` gained `batting_order`,
  `is_probable_pitcher`, `position`. Under `strict` with no `any`, none of the fixes typecheck
  without these.

### Two things the plan's R1 section did not list, both required

1. **`SPORT_PATH_BY_KEY` had to be collapsed from 11 keys to 4** (`basketball_nba`,
   `basketball_wnba`, `americanfootball_nfl`, `baseball_mlb`). R1b only says "delete the duplicate
   and use `SPORT_PATH_BY_KEY`", but `tests/lib.sportsBingo.sport-path-keys.test.ts` asserts the
   table's keys **equal** `app/api/bingo/leagues/route.ts`'s `LEAGUES` keys, and that route ships
   exactly those four. The incident reverted this Phase B trim too, which R1's table did not notice.
   The as-built record in `docs/prop-bingo-out-of-scope-followup-plan.md` (Phase B — done) is what
   revealed it; **read that file's Phase B block, not just this plan, if a path-table test fails.**
2. **The orphaned NHL arm in the average-total ternary (~4294)** — `sportKey === "icehockey_nhl" ? 6`
   — was dropped with it, same reason: NHL now has no path by which it can reach that code. Also
   part of Phase B and also reverted by the incident.

### The one deviation from the plan's instructions — READ THIS BEFORE "fixing" it

**Plan R1a row #1 says `getTeamDisplayName` must gain `display_name`. It did not, and that is
intentional.** Two survivors of the incident disagree, and the plan's table is the one that loses:

- `tests/lib.sportsBingo.mlb-row-shape.test.ts` — written *against the destroyed code* — documents
  in an assertion comment that "`getTeamDisplayName` **deliberately still reads** `full_name ?? name`,
  so an MLB team resolves to its mascot here", and points at that function's docblock for "the open
  question". That is direct evidence about what the lost code actually did.
- Adding `display_name` there is not inert. Tried it: `tests/lib.sportsBingo.mlb-star-tilt.test.ts`'s
  byte-identical board snapshot (`MLB_HOIST_SNAPSHOT`) **fails**, because that fixture's synthetic
  stat rows carry `team: { display_name }` with no `full_name`/`name`. Pre-change they resolved to
  `""` and no team side, so no `mlb_webhook_player_event_at_least` candidate could be built;
  post-change they resolve and those squares enter the pool, changing all three generated boards.
  Confirmed the snapshot is green both before R1 and after R1-as-shipped (`git stash` A/B), so this
  was R1's regression, not pre-existing debt.
- Nothing is lost by not doing it: `teamsMatch`/`inferCardTeamSide` fold both spellings through
  `getTeamIdentityKey` → `toMascotDisplayName`, so live MLB rows (which do carry the mascot `name`)
  still resolve — that is exactly how Phase 1 measured 27/27 and 433/433 team sides. The full name
  is reached where it actually matters via `ballDontLieTeamFullName`.

**If you want `getTeamDisplayName` on `display_name`, it is a real improvement, but it is its own
change with its own board-snapshot re-baseline and its own review.** Do not fold it into R2/R3/R4.
It is written up in the function's docblock so the next reader hits it there too.

### R1 gate — results

```
npx tsc --noEmit                       0 errors (was 9)
npm run lint                           clean
npm run test:bingo-nfl                 244/244
npm run test:bingo-mlb                 99/102  (the 3 failures are R3's, see below)
npm run test                           1830 passed / 3 failed / 13 skipped
```

The three failures are exactly the pre-written R3 proof tests, all in
`tests/lib.sportsBingo.mlb-row-shape.test.ts > MLB player_prop voids on missing data instead of
missing (Phase 2)`: missing snapshot, missing stat line, non-finite value. Each reports
`expected { status: 'miss' } to deeply equal { status: 'void' }` — i.e. they fail for precisely the
reason R3 exists, and R3 is a three-position edit away from turning them green. **The plan predicted
this; a green run of that file after R1 would mean something went wrong, not right.**

Test counts differ from the plan's stated baselines because `package.json` (a survivor, uncommitted
until now) had already wired the four restored test files into the named scripts: `test:bingo-nfl`
244 (was 244, `nfl-safety-attribution` was already counted), `test:bingo-mlb` 102 (plan said 97 —
the delta is `sport-path-keys` 1 + `balldontlie-score-normalizer` 4 + `mlb-row-shape` 17).

### Branch, not main

Committed to **`restore/mlb-bingo-r1`**, not `main`, per this harness's default-branch rule. It is
durable in git either way — the incident's failure mode was an uncommitted working tree, and that is
closed. Andrew has not yet been asked whether to merge it to `main`; **that decision is open and R2
does not depend on it** (the branch is checked out).

The commit is deliberately scoped: `lib/sportsBingo.ts`, the four restored test files, `package.json`
(the test-script wiring + `bingo:validate:mlb`, which R2 needs), `scripts/validate-mlb-bingo-grading.cjs`
(the Phase 1 survivor, previously untracked and therefore one stray command from being lost too),
and the two plan docs. **It deliberately leaves these other uncommitted survivors alone** — they
belong to other phases and mixing them into a restore commit would obscure it:
`lib/fantasy.ts`, `lib/sportsBingoNflFlavor.ts`, `lib/thesportsdb.ts`, `lib/envNumber.ts`,
`scripts/probe-nfl-flavor-squares.cjs`, `scripts/simulate-bingo-boards.cjs` (**all of Phase 4a/4b's
script half — still untracked-modified and still the single most valuable unbacked-up thing in this
tree**), `tests/lib.sportsBingo.nfl-star-tilt.test.ts`, `tests/lib.envNumber.test.ts`,
`tests/components.bingo.SportsBingoSelectSport.test.ts`, and the two `docs/phase0-artifacts/*.json`.
Getting those committed is worth doing before anything else risky runs in this tree.

### Handoff to whoever runs R2

- **R2 needs no code.** Run `npm run bingo:validate:mlb` (wired, and the script is committed now).
  Acceptance is all six metrics at 100%, against the numbers in the Phase 1 write-up above.
- **The script has never run against *this* restoration.** It ran against the destroyed code. If it
  throws on a missing export, the export list in R1c above is what shipped — check it against
  `grep -n "^export function" lib/sportsBingo.ts` before assuming a deeper problem.
- **The realized-rate table in the Phase 1 write-up is a smoke test, not an acceptance gate.** Those
  seven percentages moving a few points on a fresh 7-day window is normal; the six 100% metrics are
  the gate.
- **The `ballDontLieHomeScore` `??` chain is the one thing worth a skeptical eye on live data.** If
  a live MLB row ever *does* carry `home_team_score: 0` alongside `home_team_data.runs`, `??` takes
  the flat `0`. The probe found no flat key at all on MLB, so this is theoretical — but R2 is the
  cheapest place it would surface, as a score-reconciliation miss on a shutout.
- **Do not re-derive R3 from scratch.** The three failing tests specify it exactly, the NFL arm of
  the same `case "player_prop"` in `evaluateResolver` (now exported, ~8540) is the shape to copy,
  and the NBA arm must be left alone — the fifth test in that block proves it.

## Phase R2 — Re-verify Phase 1 live

**Model:** Sonnet 5 · **Effort:** Low (~20 min) · **No code.** Needs R1.

Run `npm run bingo:validate:mlb` and confirm it reproduces the Phase 1 write-up's numbers. The
script needs no changes. Acceptance — all six must be **100%**, since that is what live data gave
before the loss:

```
match rate · score reconciliation · finalized rate
team-side resolution · starter detection · player-name lookup rate
```

Anything below 100% means R1 missed one of the five defect sites; the write-up's per-metric mapping
(§Phase 1) tells you which. Also confirm nothing in the **Verified facts** table drifted — per this
plan's standing rule, re-probe rather than trust. Record the run in this doc.

---

## Phase R2 — done (2026-08-18)

**PASS, but only after a code fix R2 was not supposed to need.** The first run came back
**23/25 (92.0%)** on match rate, and R2 turned up a **sixth MLB row-shape defect** that R1's table
never listed and Phase 1's original run never exposed. All six metrics are at 100% now.

### The run that failed

```
match rate                        23/25 (92.0%)
score reconciliation              23/25 (92.0%)
finalized rate                    23/25 (92.0%)
team-side resolution             676/676 (100.0%)
starter rows (raw / flagged true) 460 / 460 across 25 games with a populated lineup response
player-name lookup rate          460/460 (100.0%)

match miss game 5059601: matcher returned 5059593
match miss game 5059615: matcher returned 5059602
```

The score and finalized misses are **not independent** — the harness `continue`s past a match miss,
so one root cause dented three metrics. Read that shape as one failure, not three.

### Root cause — `getGameTimestamp`, a sixth MLB row-shape defect

Probed live: both pairs are **consecutive nights of the same series**, not doubleheaders (Rangers @
Angels 8/13 and 8/14; Brewers @ Dodgers 8/14 and 8/15). In each case the matcher returned the
*previous night's* game.

`pickBestMatchingBallDontLieGame` filters by team pair, then sorts by `|kickoff - card.starts_at|`
via `getGameTimestamp`. That helper read `game.datetime` first and otherwise parsed `date` as
`` `${date}T00:00:00.000Z` ``. **MLB `/games` rows carry no `datetime` key at all, and their `date`
is already a full ISO timestamp** (`"2026-08-14T02:07:00.000Z"`) — so the fallback built
`"2026-08-14T02:07:00.000ZT00:00:00.000Z"`, which is unparseable, and every MLB game scored
`POSITIVE_INFINITY`. `Infinity - Infinity` is `NaN`, V8 treats a `NaN` comparator as `0`, the sort
stayed stable, and `matching[0]` was simply whichever game the feed listed first. **The
kickoff-proximity tiebreak was completely inert on MLB** — every multi-game series graded its later
games against the earlier game's box score. Production-affecting, and invisible to a card whose
matchup happens to appear once in the candidate window (which is why Phase 1's smaller 15-game
window scored 15/15).

**This is not an R1 miss.** `getGameTimestamp` was never one of R1's five sites; `git show
f4873eb -- lib/sportsBingo.ts` does not touch it and neither did the pre-incident code. It predates
the whole recovery arc.

**Fix (`lib/sportsBingo.ts`, `getGameTimestamp` ~2186):** try `+new Date(date)` directly before the
midnight-suffix append. Date-only strings (NBA's `"2025-10-21"`) parse to the same UTC midnight the
suffix produced, so NBA is bit-identical; only the previously-`Infinity` rows change. Docblock
records the whole failure mode in place.

**Blast radius is wider than MLB.** Probed live: `/nfl/v1/games` and `/wnba/v1/games` have the same
shape (full-ISO `date`, no `datetime`); only `/nba/v1/games` carries both (date-only `date` +
`datetime`). So the tiebreak was inert for three of the four supported leagues and this fix repairs
all three. NFL is the least exposed in practice (one game per matchup per week), WNBA is not, and
**Phase 7's WNBA audit should treat this as a confirmed hit, not a hypothesis.**

### The passing run — acceptance met

```
[validate] 25 completed MLB games (last 5 days, capped at 25)
match rate                        25/25 (100.0%)
score reconciliation              25/25 (100.0%)
finalized rate                    25/25 (100.0%)
team-side resolution             735/735 (100.0%)
starter rows (raw / flagged true) 500 / 500 across 25 games with a populated lineup response
empty lineup responses              0/25
player-name lookup rate          500/500 (100.0%)
PASS — MLB grading substrate matches the archived feed.
```

Realized rates (smoke test only, per the Phase 1 write-up's own caveat — these moved a few points
against Phase 1's 7-day window and that is expected):

```
player_hits               over  0.5  58.9%   (Phase 1: 55.9%)
player_home_runs          over  0.5  10.7%   (13.0%)
player_rbis               over  0.5  25.6%   (28.1%)
player_runs               over  0.5  34.9%   (34.1%)
player_stolen_bases       over  0.5   6.9%   ( 7.0%)
player_strikeouts_pitcher over  3.5  68.0%   (83.3%)
player_pitcher_outs       over 14.5  70.0%   (80.0%)
```

The two pitcher markets are the only ones that moved materially, on ~50 samples apiece. Worth a
skeptical eye at **Phase 5** (calibration), which is the phase those numbers actually feed; nothing
in R2's gate turns on them.

### The `??` chain the R1 handoff flagged — checked, still theoretical

R1 asked R2 to watch for a live MLB row carrying `home_team_score: 0` alongside
`home_team_data.runs`, which `??` would resolve to the flat `0`. **It would have surfaced as a
score-reconciliation miss on a shutout, and score reconciliation is 25/25 across a window
containing shutouts.** Still theoretical; leave the chain as R1 shipped it.

### Verified facts — re-probed, no drift

Re-probed `/mlb/v1/games` live: keys are `id, home_team_name, away_team_name, home_team, away_team,
season, postseason, season_type, date, home_team_data, away_team_data, venue, attendance,
conference_play, status, status_state, period, clock, display_clock, scoring_summary`. No
`visitor_team`, no `*_team_score`, `status: "STATUS_FINAL"` — table row confirmed. The stats and
lineup rows are confirmed transitively by the harness (735/735 team sides, 500/500 name lookups,
500 starter rows across 25 games, 0 empty lineup responses). **One row to add to that table:**
`/mlb/v1/games` (and `/nfl`, `/wnba`) carry **no `datetime` key**; `date` is a full ISO timestamp.
Only `/nba/v1/games` splits the two.

### Regression test

`tests/lib.sportsBingo.mlb-row-shape.test.ts` gained a fourth `describe` — *"MLB series
disambiguation — the kickoff-proximity tiebreak"* — with four tests: the second night's card picks
the second night's game, the first night's still picks the first, a verbatim pre-fix
`toBeNaN()` proof, and an NBA `date` + `datetime` non-regression. Same file, same fixtures as the
five R1 defects, so the sixth lives next to its siblings.

### R2 gate — results

```
npx tsc --noEmit                       0 errors
npm run lint                           clean
npm run test:bingo-nfl                 244/244
npm run test:bingo-mlb                 103/106  (the 3 failures are R3's, unchanged)
npm run test (full suite)              1834/1850 passing, 13 skipped, 3 failing — all R3's
tests/lib.sportsBingo.mlb-star-tilt     green (board snapshots unmoved by the fix)
tests/lib.sportsBingo.nfl-star-tilt     green
```

The three failures are still exactly the pre-written R3 proof tests in
`tests/lib.sportsBingo.mlb-row-shape.test.ts` (`miss` where `void` is expected). Unchanged from R1;
R2 did not touch that path.

### Handoff to whoever runs R3 (or R4)

- **R3's spec is unchanged and R2 did nothing to it.** The three failing tests still specify it
  exactly; copy the NFL arm of `case "player_prop"` in `evaluateResolver`, leave the NBA arm alone.
- **Re-grep line numbers before editing.** R2 added ~13 lines to `getGameTimestamp`'s docblock and
  body at ~2186, so everything below it in `lib/sportsBingo.ts` shifted down. Every line number in
  this document is now stale by that much.
- **Phase 3 (historical mis-settlement) just got bigger and R3 is not the only input.** It was
  scoped around the `miss`/`void` bug. It must now also cover cards whose *matchup repeated inside
  the candidate window* — those were graded against the wrong game's box score entirely, which is a
  worse failure than a wrong void. Any MLB series (i.e. most of the season) is in scope, and so are
  WNBA cards. Whoever runs Phase 3 should read this R2 block before scoping the query.
- **Phase 7 (WNBA audit) has one confirmed defect waiting**, per the blast-radius note above.
- **Phase 5 (calibration) should not trust the two pitcher markets' realized rates** until it has a
  window larger than ~50 samples each.
- **Still on branch `restore/mlb-bingo-r1`, not `main`.** R1 raised the merge question and it is
  still open — R2 adds a second production-affecting fix to the same branch, which strengthens the
  case for merging sooner rather than later. Andrew has not been asked.

---

## Phase R3 — Phase 2, the `miss`-instead-of-`void` fix

**Model:** Sonnet 5 · **Effort:** Low (~30 min). Needs R1 (R2 recommended first).

**Read the original Phase 2 section above in full** — it is unchanged and still correct about the
bug and the house rule. The fix was written and verified once before the loss; this is a redo, and
its tests already exist and were already proven failing pre-fix.

The MLB arm of `case "player_prop"` (**8586**) in `evaluateResolver` (**8471**) returns `miss` in
three missing-data positions where the NFL arm returns `void`. As of the reverted tree those are at
**8642** (`if (isMlb && !mlbStatsSnapshot)`), **8652** (`if (!nbaLine && !mlbLine)`), and the
non-finite-value read a few lines below it. Re-grep — R1 will have shifted all of these. **Read the
whole `case` before editing; do not pattern-match on the first `miss` you see.**

The shape of the fix that was verified working:

- missing snapshot → `void` at Final, `pending` before it
- missing stat line → `status: isMlb ? "void" : "miss"`
- non-finite value → `status: isMlb ? "void" : "miss"`

The `isMlb ? … : "miss"` ternary is deliberate: it is what leaves the **NBA** arm untouched while it
shares the branch. `player_prop` is already registered in `isResolverEligibleForVoidRegrade`, so the
regrade path is in place.

**Tests: already written**, in the `"MLB player_prop voids on missing data instead of missing
(Phase 2)"` describe block of `tests/lib.sportsBingo.mlb-row-shape.test.ts`. Five cases: the three
void positions, a pending-before-Final case, and an NBA case proving the other arm still misses.
Confirmed 2026-08-18 to fail 3/3 pre-fix and pass post-fix. Do not rewrite them; just make them
pass. Gate: the four commands from R1.

**Still owed to Phase 3** (the original handoff asked for these; neither was produced before the
loss):

1. **The NBA-asymmetry finding.** Check whether NBA's arm has the same `miss`-on-missing-data
   asymmetry and **report it — do not fix it here.** From the reverted source it plainly does
   (identical `miss` returns at the NBA positions), but confirm against the post-R1 tree and say so
   explicitly, since Phase 3 and any future NBA plan both depend on the answer.
2. **The historical mis-settle count** Phase 3 needs: settled `sports_bingo_squares` rows on
   `baseball_mlb` cards with a `player_prop` resolver and `status = 'miss'`. Hand it over as an
   actual number if you can reach the DB.

---

## Phase R3 — done (2026-08-18)

**All three `miss`-instead-of-`void` positions fixed, exactly as specified.** No line-number
surprises this time — R2 shifted everything below `getGameTimestamp` but the `case "player_prop"`
block in `evaluateResolver` was still easy to re-grep (landed at **8736** in the post-R2 tree).

### What shipped

Three one-word edits inside the shared (non-NFL) arm of `case "player_prop"`:

- **8792-8797** (`if (isMlb && !mlbStatsSnapshot)`, missing snapshot at Final) — `"miss"` →
  `"void"`. This position has no NBA counterpart to preserve (it's MLB-gated already), so it's a
  flat change, not a ternary.
- **8802-8807** (`if (!nbaLine && !mlbLine)`, missing stat line at Final) — `"miss"` →
  `status: isMlb ? "void" : "miss"`. NBA arm unchanged.
- **8813-8818** (non-finite value at Final) — same `isMlb ? "void" : "miss"` ternary.

**Left untouched, deliberately:** the `line === resolver.line` push/tie block a few lines below
(~8821-8826, still flat `"miss"` for both leagues) — that's a resolved value that happens to equal
the line exactly, not missing data, so it's out of the house rule's scope and the tests don't touch
it either.

### NBA-asymmetry finding — confirmed, not fixed

**NBA has the identical `miss`-on-missing-data asymmetry**, verified against the current
post-R1/R3 tree, not just the reverted source. `case "player_prop"`, **8786-8791**
(`if (isNba && !nbaStatsSnapshot)`), still returns flat `{ status: "miss", resolved: true }` at
Final with no snapshot — same shape as MLB had before this phase. Left alone per the plan's
explicit instruction; this is a report, not a fix. If NBA Prop Bingo ever ships player props for
real, this is the same bug waiting.

### Historical mis-settle count — zero, Phase 3 closes immediately

Queried `sports_bingo_squares` live via `SUPABASE_SERVICE_ROLE_KEY` (throwaway script, deleted
after use, no secrets echoed). **Total MLB (`sport_key = 'baseball_mlb'`) cards in production: 6.**
Of those 6 cards, **zero `sports_bingo_squares` rows have a `player_prop` resolver at all, in any
status** — not just zero at `status = 'miss'`. MLB Prop Bingo has essentially not been played with
real players yet; the bug was live but nothing was there for it to hit.

**Phase 3 is answered, not merely investigated: the count is 0, so per the plan's own branch
("If that count is zero — plausible... this phase closes immediately with a note and nothing else
happens") — Phase 3 needs no further work, no product decision, no regrade. Note this in Phase 3's
own section if anyone re-opens it.** The series-disambiguation defect R2 found (wrong-game
mis-grading) is a separate risk from this one and is *not* covered by this zero — but with only 6
MLB cards ever created, it's worth a five-minute follow-up check (not scoped here) on whether any
of those 6 spanned a repeated-matchup window.

### R3 gate — results

```
npx tsc --noEmit                       0 errors
npm run lint                           clean
npm run test:bingo-nfl                 244/244
npm run test:bingo-mlb                 106/106  (was 103/106 — the 3 R3 tests now pass)
npm run test (full suite)              1837/1850 passing, 13 skipped, 0 failing
```

### Handoff to whoever runs R4 (or Phase 3/5/6/7)

- **R3 needed no line-number archaeology and no surprises.** The fix was exactly the three
  positions the plan's tests already specified — copy this write-up's confidence, not a warning.
- **Phase 3 is closed, not just unblocked.** Zero MLB `player_prop` squares exist in production of
  any status. Do not re-run the historical-miss query expecting a different answer unless MLB Prop
  Bingo has shipped meaningfully more volume since 2026-08-18.
- **R4 is untouched by R3** — it's the backtest-seam work (`buildMlbTeamEventCandidateTemplatesForBacktest`,
  `extraCandidates`), independent of the grading path R3 touched. Still needed, still Medium effort.
- **Phase 5 (calibration) is now actually unblocked** per the plan's own sequencing — R3 was the
  last gate item ("Running this before Phase 2 would measure the miss-instead-of-void bug and bake
  it into a price"). With only 6 MLB cards total and zero player-prop volume, though, whoever runs
  Phase 5 should sanity-check there's enough real settlement history to calibrate against before
  spending the Opus 5 budget — the plan's `bingo:calibrate:mlb` measures against live box scores via
  the harness, not against these near-empty production tables, so this may be moot; worth a two-
  minute gut check before running it anyway.
- **Still on branch `restore/mlb-bingo-r1`, not `main`.** Three production-affecting fixes now sit
  on this branch (R1's five row-shape defects, R2's `getGameTimestamp` sixth defect, R3's void
  fix). The case for merging keeps getting stronger; Andrew still has not been asked.
- **Not yet done, still open per the plan's run order:** R4, then 3 (closed above, no work needed),
  6, 7, 5.

---

## Phase R4 — Re-implement Phase 4b's two `lib/` seams

**Model:** Sonnet 5 · **Effort:** Medium (~1.5 hrs) · Needs R1. Independent of R2/R3.

Much smaller than the original Phase 4b: **the entire script half survived**, so the caller already
exists and pins both signatures exactly. Read `runMLBBacktest` in
`scripts/simulate-bingo-boards.cjs` (**~579-700**) first — it is the spec.

Two things to rebuild in `lib/sportsBingo.ts`:

1. **`buildMlbTeamEventCandidateTemplatesForBacktest(game)`** — called at script line **618** with a
   synthetic game `{ id, sportKey, homeTeam, awayTeam, startsAt, gameLabel, isLocked }` (built at
   **617**), returning candidate templates for the `mlb_webhook_team_event_at_least` Tier-1 block.
   It reconstructs standalone what `getGameEntryWithCandidates` → `getGameCatalog` normally
   assembles — that pipeline only looks at **upcoming** games and can structurally never find a
   historical one, which is why this seam has to exist.

   **League-mean priced only, no per-game opponent adjustment**: `predictMlbTeamEventRate(event,
   null, 0)`, which is that function's own documented degradation path — not a new invention. Real
   opponent-adjusted pricing needs `buildMlbTeamAllowedRates`, itself embedded in the un-runnable
   pipeline; reproducing it here would mean re-implementing the candidate builder, which is exactly
   the discipline these backtest seams exist to avoid. Say so in-code.

2. **The `extraCandidates` optional param** on `buildSportsBingoBoardFromBallDontLieGame`
   (**7555**), passed at script line **622**. Purely additive — NFL backtesting does not use it.

**Why the seam is needed at all** (do not re-derive this the hard way): a board from MLB core
markets alone — moneyline/spread/total/team-total, all the synchronous path reaches — **cannot
generate**. `generateBoardForGame` throws `"Unable to generate a bingo board for this game"` on
every game; four resolver families is too few for the generator's line-feasibility/diversity
constraints on a 5x5 grid. Confirmed live before the loss, not theoretical.

### R4 gate

R1's four commands, plus live:

```
npm run bingo:simulate -- --backtest --sports baseball_mlb --days 10 --boards 3
npm run bingo:simulate -- --backtest --sports basketball_nba   # must still throw (4a guard)
```

Acceptance from the pre-loss run: ~423 boards over 10 days, **realized ~19.4%** against a predicted
mean of 26.3%, `ungradedSquareShare: 0`. The realized rate sitting under the predicted band is
**expected, not a bug** — league-mean team-event pricing over 10 days is a smoke test that grading
and generation work end to end, not a calibrated replay. Closing that gap is Phase 5's job. Also
re-confirm NFL backtest is unaffected (~23.3% on a 6-game check, inside the 20-30% band).

---

## Phase R4 — done (2026-08-18)

**Both `lib/` seams rebuilt exactly as specified. No surprises, no deviations from the plan.**
`scripts/simulate-bingo-boards.cjs` (the surviving script half) needed zero changes — it already
pinned both signatures, as the plan predicted.

### What shipped, in `lib/sportsBingo.ts`

1. **`buildMlbTeamEventCandidateTemplatesForBacktest(game: SportsBingoGame)`** (new, exported,
   placed right after `findMlbTeamAllowedRate`, ~5254) — mirrors the team-event block inside
   `buildMLBPlayerPropCandidatesFromRecentStats` (both team sides, the fixed `quick_out_under_3_pitches`
   constant at 0.58, then the six `MeasuredMlbTeamEvent`s through `buildMlbTeamEventRungs`) but reads
   `predictMlbTeamEventRate(eventKind, null, 0)` instead of building `buildMlbTeamAllowedRates` from
   fetched opponent history — exactly the plan's specified degradation path, confirmed by reading
   `lib/mlbTeamEventRates.ts:122-139`: `opponentGames <= 0` short-circuits to `model.leagueMean`
   before any of the opponent-adjustment math runs. No network call, no async, synchronous and pure —
   it does not need to be, since the script calls it once per historical game outside any generation
   loop.
2. **`extraCandidates` param** — added to both `buildGameAndCandidatesFromBallDontLie` (new fourth
   parameter, `extraCandidates: SportsBingoSquareTemplate[] = []`, spread into `rawCandidates` right
   before `aggregateCandidates` runs, ~4571) and the exported
   `buildSportsBingoBoardFromBallDontLieGame` (new optional `extraCandidates?:
   SportsBingoSquareTemplate[]` field, defaulted to `[]` and threaded straight through). Purely
   additive — `loadGameCatalog`'s only call site doesn't pass it, so live forward-mode board
   generation (NFL, NBA, WNBA, and MLB's normal async path) is provably unaffected, not just assumed
   so: `test:bingo-nfl` held at 244/244 and `test:bingo-mlb` held at 106/106, unchanged from R3.

Both were exactly the two seams R4's own spec named — no third seam turned up, unlike R2's surprise
sixth defect.

### Live gate — results

```
npx tsc --noEmit                                          0 errors
npm run lint                                               clean
npm run test:bingo-nfl                                     244/244 (unchanged from R3)
npm run test:bingo-mlb                                     106/106 (unchanged from R3)
npm run test (full suite)                                  1837/1850 passing, 13 skipped, 0 failing

npm run bingo:simulate -- --backtest --sports baseball_mlb --days 10 --boards 3
  boards: 423, realizedWinRate: 0.260, predicted.mean: 0.2612, predicted.inTargetBand: 0.9905,
  ungradedSquareShare: 0

npm run bingo:simulate -- --backtest --sports basketball_nba
  Error: --backtest only implements americanfootball_nfl, baseball_mlb; got unsupported
  --sports value(s): basketball_nba          (4a guard still live, unaffected)

npm run bingo:simulate -- --backtest --sports americanfootball_nfl --weeks 6 --boards 3
  boards: 45, realizedWinRate: 0.200, predicted.mean: 0.252, predicted.inTargetBand: 1
  (NFL backtest unaffected by the new optional param)
```

**423 boards, same count as the pre-loss run** (same `--days 10` window definition, though not the
same calendar days — today is 2026-08-18, the pre-loss run was some hours earlier the same day, so
the 10-day windows mostly overlap but aren't byte-identical). **Realized win rate landed at 26.0%,
inside the 20-30% target band and closer to the predicted mean (26.12%) than the pre-loss run's
19.4%/26.3%** — read that as this run's particular 10-day slate having less variance against its own
league-mean pricing, not as a fix to anything; the pre-loss write-up's own caveat still applies
verbatim: league-mean team-event pricing over a ~10-day window is a smoke test that the path runs
end to end, not a calibration-grade replay, and a few points of movement run to run is expected, not
a signal. `ungradedSquareShare: 0` again — every square resolved cleanly.

### Nothing else changed

`lib/sportsBingo.ts`'s diff is exactly 77 insertions / 2 deletions, isolated to the two seams above —
verified with `git diff --stat` before committing. No other function was touched, no types were
widened beyond the two new parameters, and no NBA/NFL/WNBA code path runs through either new symbol
unless a caller explicitly opts in.

### Handoff to whoever runs 3, 6, 7, or 5 next

- **R4 is the last item in the R1-R4 recovery arc.** Per the plan's own sequencing
  (`R1 → R2 → R3 → R4 → 3 → 6 → 7 → 5`), Phase 3 is already closed (R3's write-up: zero MLB
  `player_prop` squares in production of any status), so **the only phases actually left are 6, 7,
  and 5**, in any order among themselves — R4 does not gate any of them, it only had to land before
  them per the run order.
- **Phase 6** (verify `mlb_webhook_*` squares) is unrelated to what R4 touched — R4's new
  `mlb_webhook_team_event_at_least` candidates are backtest-only synthetic templates, never written
  through the live webhook accumulation path (`applyMlbWebhookPropEvent` /
  `applyMlbPlayerSnapshotEvent`, ~10008/~10073 pre-R4, shifted by ~77 lines now). Don't confuse the
  two — R4 proves the *resolver* shape generates and grades correctly against historical box scores;
  Phase 6 is about whether the *live* webhook stream ever populates `resolver.currentCount` for real,
  which R4's backtest path never exercises (it settles through `gradeResolversAgainstCompletedMLBGame`
  reading box scores directly, not through webhook accumulation).
- **Phase 7** (WNBA audit) is untouched by R4 and still open — nothing here changes its scope.
- **Phase 5** (calibration, Opus 5, real API cost) was already the last phase in the run order and
  still is. R3's handoff already flagged the sanity check worth doing first (only 6 MLB cards total,
  zero player-prop volume) — that's still true and R4 adds nothing to it, since `bingo:calibrate:mlb`
  would measure against live box scores via the harness, not these near-empty production tables, per
  R3's own note.
- **Re-grep before editing `lib/sportsBingo.ts` again.** This phase added 77 lines starting at
  ~5254 (the new exported function) plus a handful more at ~4342 and ~7780 (the two threaded
  parameters); every line number below ~5254 in this document is now stale by that much on top of
  R1/R2/R3's prior drift. `npx tsc --noEmit` staying at 0 errors is the fast way to confirm nothing
  downstream silently broke from the shift.
- **Still on branch `restore/mlb-bingo-r1`, not `main`.** Four production/instrument-affecting
  changes now sit on this branch (R1's five row-shape defects, R2's `getGameTimestamp` sixth defect,
  R3's void fix, R4's backtest seams). Andrew still has not been asked whether to merge. Worth raising
  explicitly now that the whole R1-R4 recovery arc is complete — this is a natural checkpoint to ask,
  rather than letting more phases pile onto an unmerged branch.
- **Not yet done, still open:** 6, 7, 5 (any order). 3 is closed (see R3's write-up). **Update:** 6 is
  now also done — see its own "done" write-up below. **Update 2:** 7 is now also done (audit-only,
  three WNBA findings reported, not fixed — see its own "done" write-up). **Update 3:** 5 and 8
  are now also done (both 2026-08-18, both with their own "done" write-ups below). **Every phase
  in this plan is complete.** That is NOT the same as "the area is clean" — Phase 7's Finding 3
  and Phase 8's 108 mis-settled squares are both live and both awaiting a product decision from
  Andrew, and Phase 5 surfaced a home/away base-rate gap that is a shipped-price change nobody
  has approved. Read those three write-ups before declaring anything finished.

---

## Original Phase 2 handoff (superseded by R1–R3 above — kept for its detail)

Phases 1 and 4a/4b are done; nothing blocks Phase 2. Re-read Phase 2's section above in full before
starting — this is only the delta a fresh session needs on top of it.

1. **The exact lines moved** since the plan was drafted, because Phase 1 added an export comment
   above the function. Re-grep `case "player_prop"` inside `evaluateResolver` in
   `lib/sportsBingo.ts` rather than trusting the `~8745-8760` the plan states — as of this commit the
   MLB `miss`-instead-of-`void` branch is the `if (isMlb && !mlbStatsSnapshot)` block a few lines
   into that case, followed by the `if (!nbaLine && !mlbLine)` block a bit further down. Both need
   the fix; there is a third spot too (non-finite value read) — read the whole case before editing,
   don't pattern-match on the first `miss`.
2. **`evaluateResolver` is now exported** (Phase 1 needed it for the validator). That does not
   change how you should edit it — same function, same file, just also reachable from
   `scripts/validate-mlb-bingo-grading.cjs` now. No consequence for this phase, mentioned only so
   the next reader doesn't wonder why an internal-looking function has an external comment above it.
3. **You now have a live tripwire for this exact bug**: run `npm run bingo:validate:mlb` before your
   fix and note the market realized rates in the "realized rate per player_prop market" table — under
   the current miss-not-void bug those rates are measuring `hit / (hit + miss)` where every
   would-be-void case is silently counted as `miss` instead of being excluded, which quietly drags
   every realized rate down. Compare that table before/after your fix; the ones with player refs the
   harness marks unresolved (should be ~0% of 300 given Phase 1's live numbers) are the closest thing
   to a live repro of the bug's blast radius, though the harness's own starters all *did* resolve
   cleanly (100%), so the live repro will likely need a game where lineups arrive late or a name
   fails to match — check `failures` in the script's output for `"unresolved player ref"` lines
   across a wider `--days` window if you want a naturally-occurring one rather than only the unit
   test's synthetic missing-snapshot case.
4. **Do not touch the NBA arm** — same file, same `case "player_prop"`, shares structure with the
   MLB arm you're fixing but is explicitly out of scope. The plan asks you to check whether NBA has
   the same asymmetry and report it, not fix it inline.
5. Tests: assert MLB voids in the three missing-data positions (missing snapshot, missing stat line,
   non-finite value), proven failing pre-fix, with an NBA case alongside proving it was left alone —
   per the plan's own testing standard, this phase changes behavior so it is not exempt the way
   Phases 1/4a/4b were.
6. When Phase 2 is done, leave handoff notes here for whoever picks up Phase 3 — specifically the
   NBA-asymmetry finding (present or absent), and whether the historical-miss count Phase 3 needs
   (settled `sports_bingo_squares` rows on `baseball_mlb` cards with `player_prop` + `status='miss'`)
   is something you can hand over as an actual number from this session, since you'll have the fixed
   code fresh in context.

---

## Phase 5 — `npm run bingo:calibrate:mlb`

**Model:** Opus 5 · **Effort:** Medium-High (~half day), real API cost.
**Template:** `scripts/calibrate-nfl-square-families.cjs` (`bingo:calibrate:nfl`, Phase 8c).

Assigned-vs-realized base rate per MLB resolver family over a full season, which is the only
instrument that can actually *set* a price — Phase 1's realized column can only flag a wrong one.

**Sequence this last, and not only for cost.** Every MLB base rate currently shipping was measured
by `scripts/measure-mlb-event-rates.cjs` reading box-score columns directly, never through the
shipped graders. Now that the grading path works, the two can finally be compared — but a
disagreement is only interpretable once Phases 1 and 2 have settled what "correct grading" means.
Running this before Phase 2 would measure the miss-instead-of-void bug and bake it into a price.

**Opus 5 for the same reason Phase E of the parent plan was:** the judgment is statistical — sample
validity, whether a delta is real or noise, whether a family has enough events to price at all —
not mechanical. `quick_out_under_3_pitches` in particular is derived from our own webhook stream
and has no box-score column, so it cannot be calibrated this way at all; say so rather than
inventing a number.

---

## Phase 5 — done (2026-08-18)

**`npm run bingo:calibrate:mlb` shipped, run against the full 2025 season, and it found something
the board-level backtest and the aggregate family table both structurally cannot see: the six
`mlb_webhook_team_event_at_least` base rates are home/away-blind, and the home team bats one fewer
inning in half of all games.** The pooled rate for every event is right (worst |z| = 1.16). Split by
side, home is priced too high and away too low, in matched opposite directions, so every aggregate
in this plan's history has been averaging the error away to zero.

### What shipped

- **`scripts/calibrate-mlb-square-families.cjs`** (new, 420 lines) + `"bingo:calibrate:mlb"` in
  `package.json`, mirroring `bingo:calibrate:nfl`'s `--conditions react-server --import tsx`
  invocation. Imports the **shipped** generator and graders
  (`buildSportsBingoBoardFromBallDontLieGame`, `buildMlbTeamEventCandidateTemplatesForBacktest`,
  `gradeResolversAgainstCompletedMLBGame`, `boardStatusesMakeALine`, `normalCdf`) — no mirrored
  grading logic anywhere in it, per Phase 1's rule.
- **No `lib/` change.** This phase is an instrument only. `lib/sportsBingo.ts` was not touched.

Four outputs the NFL template does not have, each added because a first run was misreadable without
it:

| output | why it exists |
|---|---|
| `byTeamEventSide` | the whole finding below. Splits each event by `resolver.team`; the pooled `byTeamEvent` row hides it |
| `stdErr` / `z` computed against **distinct games**, not squares | six boards off one game are one observation of that box score. Squares-as-N would have called every row significant |
| `realizedWinRateOnBoardsWithoutUncalibratableSquares` | the raw win rate is biased low by the `quick_out_under_3_pitches` artifact — see below |
| `notCalibratable` block | names what this instrument cannot price, so absence never reads as "no such square exists" |

### Slate

Full 2025 regular season: 2430 finals, spring training and postseason excluded (`season_type` is
`"regular"`, not `"regular_season"` — probed live, and `seasons[]` *is* honoured on
`/mlb/v1/games`, contrary to the "dates[] is the only param" note in
`scripts/simulate-bingo-boards.cjs:165`). First 21 days dropped from the *sample* but kept in the
priors, since the shrinkage prior (12 games of league mean) dominates that window. 600 games sampled
evenly across 2025-04-08 → 2025-09-28, 6 boards each = **3600 boards, 87k graded squares**. Priors
are built from every regular-season final strictly before each sampled game's date, so `--games`
buys API cost back without ever weakening the retrodictive market.

Artifact: `docs/phase0-artifacts/phase5-mlb-calibration-2026-08-18.json`.

### The finding — `predictMlbTeamEventRate` is home/away-blind, and it shouldn't be

Pooled, every event is priced correctly:

```
team_event:walk           assigned 0.490  realized 0.466   -0.024  z -1.16
team_event:strikeout      assigned 0.441  realized 0.428   -0.013  z -0.65
team_event:hit_by_pitch   assigned 0.334  realized 0.322   -0.011  z -0.60
team_event:hit            assigned 0.414  realized 0.421   +0.007  z  0.37
team_event:groundout      assigned 0.417  realized 0.428   +0.011  z  0.54
team_event:flyout         assigned 0.487  realized 0.501   +0.013  z  0.66
```

Split by side, the same numbers separate:

```
team_event:ALL:home       assigned 0.434  realized 0.414   -0.020
team_event:ALL:away       assigned 0.434  realized 0.450   +0.016
team_event:strikeout:home assigned 0.440  realized 0.389   -0.052  z -2.54
team_event:strikeout:away assigned 0.441  realized 0.466   +0.024  z  1.20
```

**The mechanism is not inferred from the table — it is measured directly from the box scores**, in
a second pass that touches neither board generation nor the graders (300 games, evenly spaced
across 2025; `docs/phase0-artifacts/phase5-mlb-home-away-split-2026-08-18.json`):

```
home team batting innings, mean          8.62
away team batting innings, mean          9.12
games where home batted FEWER innings   149 / 300   (49.7%)

per-game team totals          home    away    home as % of away
strikeout                     8.04    8.73         92.2%
groundout                     7.88    8.53         92.4%
hit_by_pitch                  0.42    0.45         94.8%
walk                          3.09    3.15         98.1%
flyout                        5.02    5.11         98.2%
hit                           8.05    8.13         99.1%
```

The home team does not bat in the bottom of the 9th when it is already ahead, which is essentially
half of all games. `predictMlbTeamEventRate` returns one league mean pooled over both sides, so a
home "at least N" square is priced off ~9 innings of opportunity the home lineup only gets half the
time. **All six events run home < away in the direct measurement, and 5 of 6 do in the price table**
(`hit_by_pitch` is the exception in this run, at +0.001 home / −0.025 away — it is also the event
with the smallest measured gap, 94.8%, on the smallest counts). Strikeout and groundout show the
largest box-score gap and strikeout shows the largest price gap, which is the ordering the mechanism
predicts.

**Is it real or noise? Real, and modest.** The direct box-score measurement is not subject to
board-draw noise and is unambiguous. The price table's own z-scores are more restrained: in this run
only `strikeout:home` individually clears |z| ≥ 2. An earlier run over the identical slate with a
different board draw put the side aggregates at −0.031 home / +0.016 away with home negative in 12
of 14 rows — same sign, same ordering, magnitude moving a point or two. So: the *direction* is
certain, the *size* is roughly 2-5 points of probability on the affected squares, and it is largest
on strikeout.

**This is a shipped-price change and is deliberately not made here.** Same discipline as Phase 3 and
R3's NBA finding: the instrument reports, the price change gets its own review. The smallest fix
that addresses it is a side-aware term in `predictMlbTeamEventRate` — the measured per-game ratios
above are directly usable as a home-side multiplier — but whether to carry a home/away split at all
is a product call about square-label symmetry as much as an accuracy one.

### Board-level win rate

```
realizedWinRate                                          0.2425   (3600 boards)
realizedWinRateOnBoardsWithoutUncalibratableSquares      0.2686   (2018 boards)
```

**Read the second one.** 1830 of the 3600 boards drew a `quick_out_under_3_pitches` square, which
has no `/mlb/v1/stats` column, so the grader sees `currentCount: 0` and settles it `miss` every
time — a square priced 0.58 forced to 0.00 by a missing column, not by anything about the price.
Boards that happened not to draw one land at **26.9%, inside the 20-30% target band**. The raw
24.25% is a floor, and R4's `--backtest` number (26.0%) carries the same downward bias for the same
reason, which is worth knowing before the two are ever compared.

### What this instrument cannot price — stated plainly, per this phase's own instruction

1. **`quick_out_under_3_pitches` — not calibratable by any box-score method.** It is derived from
   our own webhook stream. It is excluded from every table and reported once under
   `notCalibratable`; **there is no number for it in this artifact and none should be invented.**
   Phase 6's webhook verification is the only instrument that touches it.
2. **Every player-level family — `player_prop`, `mlb_webhook_player_event_at_least`,
   `mlb_webhook_player_event_at_most` — is at `n: 0`, structurally.** They come out of
   `buildMLBPlayerPropCandidatesFromRecentStats`, which needs an *upcoming* game's lineups and
   trailing stats; a historical replay cannot produce them. `npm run bingo:validate:mlb`'s realized
   column is still the only instrument that sees them, and it is a smoke test, not a price.
3. **The core-market rows are NOT a verdict on a shipped price.** In production those squares are
   priced off a real vendor market model; here they are priced off this script's retrodictive one.
   `team_total_under` at +0.044 (z 2.16) and `team_total_over` at −0.034 are a matched pair and mean
   this harness's `MLB_TEAM_TOTAL_SIGMA` is slightly off — a note about the harness, not about the
   game. The module header says this; do not let a future reader quote those rows as a mispricing.
4. **Team-event prices here are league-mean, not opponent-adjusted** (R4's
   `buildMlbTeamEventCandidateTemplatesForBacktest` reads `predictMlbTeamEventRate(event, null, 0)`
   by design). So `byTeamEvent` judges the base the opponent adjustment is applied *to*, which is
   the right question for a base rate and the wrong one for "is this card's square mispriced."

### The comparison this phase was sequenced last to make

Every shipped MLB base rate was set by `scripts/measure-mlb-event-rates.cjs` reading box-score
columns directly, never through the graders. Now both exist. **They agree** — pooled, all six events
land within 0.024 of assigned with |z| ≤ 1.16, on 87k squares. The grading path and the pricing path
read the same event the same way; there is no third defect hiding between them. The one place they
part company is the side split, and that is not a disagreement between the two instruments — it is
something neither of them was built to see, because both pool the sides.

### Gate — results

```
npx tsc --noEmit                       0 errors
npm run lint                           clean
npm run test:bingo-nfl                 244/244
npm run test:bingo-mlb                 123/123
npm run test (full suite)              1859 passing, 13 skipped, 0 failing
```

No test was added: per this plan's own standard, an instrument's output is its evidence, and Phase 5
changes no behavior (Phases 1, 4a and 7 took the same exemption).

### Handoff

- **Phase 5 was the last numbered phase, and it does not close the area.** Phase 7's Finding 3
  (WNBA has no `/wnba/v1/stats` or `/wnba/v1/lineups` endpoint at all, so every WNBA player- and
  team-stat square is ungradeable) is still live, still unfixed, and still needs a product decision.
  Phase 8's audit below found a second live issue that is bigger than the one it was sent to check.
  **Do not read "Phase 5 done" as "sports bingo is clean."**
- **The home/away finding is the one open engineering item from this phase**, and it is a price
  change awaiting Andrew, not a bug awaiting a fix.
- **Re-running:** `npm run bingo:calibrate:mlb` defaults to 400 games; the artifact above used
  `--games 600 --boards 6` (~600 `/mlb/v1/stats` calls, ~12 minutes). `--games 0` replays all 2280
  eligible games. Board generation is random per trial, so two runs over the identical slate differ
  by a point or two per row — compare signs and orderings, not third decimals.

---

## Phase 6 — Verify the `mlb_webhook_*` squares

**Model:** Sonnet 5 · **Effort:** Medium (~2 hrs), and **may block on a live game**.

29 `mlb_webhook_*` call sites, three resolver kinds
(`mlb_webhook_player_event_at_least` / `_at_most`, `mlb_webhook_team_event_at_least`). These read
**only `resolver.currentCount`** and never touch the stats snapshot, so none of the 2026-08-18
fixes affected them — and none of the verification did either. They are the largest untested MLB
surface remaining.

`currentCount` is accumulated by a live webhook stream, an entirely separate system. What can be
checked offline: that `applyMlbWebhookPropEvent` / `applyMlbPlayerSnapshotEvent` (~10008, 10073)
increment the right squares for a synthetic event sequence. What cannot: that the stream delivers
the events at all. **State that split explicitly in whatever this phase produces** rather than
implying end-to-end coverage — the same trap `bingo:simulate --backtest` fell into.

---

## Phase 6 — done (2026-08-18)

**Offline half done: `applyMlbWebhookPropEvent` and `applyMlbPlayerSnapshotEvent` (post-R4 at
~10190/~10255) are now covered end to end against a synthetic event sequence, with the live-stream
half explicitly out of scope — see the split below.** No production code changed; this phase is
pure test coverage, same exemption class as Phases 1/4a/7 in spirit, though it wasn't listed among
them, since nothing here altered behavior.

### What shipped

`tests/lib.sportsBingo.mlb-webhook-events.test.ts` (new, 15 tests), wired into
`test:bingo-mlb` in `package.json`. Runs against the same in-memory `supabaseAdmin` double
(`tests/helpers/bingoSupabaseDouble.ts`) the NFL settlement tests already use — no new test
infrastructure needed, since the double's query surface (`select`/`update`/`eq`/`in`) already
covers everything both functions touch.

Coverage, matched to the two code paths inside `applyMlbWebhookPropEvent`:

- **The direct path** (squares pre-tagged with `player_id` + `event_type` columns at board-creation
  time via `getSquareMetadataForResolver`): `mlb_webhook_player_event_at_least` increments and hits
  at threshold; the `home_run`→`hit` alias counts; a non-matching player is ignored;
  `mlb_webhook_player_event_at_most` flips to `miss` (not `hit`) the instant the ceiling is
  exceeded, and stays `pending` under it.
- **The fallback loop** (team-event squares carry no `player_id`, so they're never reached by the
  direct query and must fall out of the per-card loop keyed on `resolveTeamSideFromEvent`):
  team-side attribution is correct and doesn't cross-credit the other side; team-name matching is
  fuzzy (`teamsMatch`), not exact-string; `quick_out_under_3_pitches` requires both an out-type
  event *and* `pitchCount < 3` — tested all three ways (non-out event, out but ≥3 pitches, qualifying
  out) since that resolver's guard is the only one with a compound condition; events for a different
  `gameId` are ignored entirely; an already-settled square is skipped and its `currentCount` is left
  untouched (proves the loop's `status !== "pending"` filter, not just the math).
- **`applyMlbPlayerSnapshotEvent`**: sets `currentCount` to the snapshot's absolute total (not an
  increment — the snapshot function and the webhook-event function have different write semantics
  and both are tested to their own contract); the batter/pitcher stat-field mapping in
  `mlbResolverCurrentCountFromPlayerSnapshot` is checked for `hit`/`home_run`/`pitcher_out`; a
  no-op update (resolved count unchanged) correctly reports `updatedSquares: 0` rather than a
  spurious write; wrong-player and malformed-event (`playerId: 0`) inputs are no-ops.

**Sensitivity-checked, not just green on first run**: before finalizing, deliberately broke the
`_at_most` ceiling check (`current > maxAllowed` → `current > maxAllowed + 999`) and reran just this
file — it failed exactly the one test targeting that branch, 14/15 still green. Confirms the suite
catches real logic regressions rather than passing vacuously off a mock-configuration accident. The
break was reverted before commit; `git diff --stat lib/sportsBingo.ts` showed zero lines changed
afterward.

### The split this phase's own instruction demanded — stated plainly

**What is verified:** the accumulation and settlement math inside `applyMlbWebhookPropEvent` /
`applyMlbPlayerSnapshotEvent` is correct for every event shape the resolver vocabulary defines,
against a synthetic sequence.

**What is NOT verified and cannot be from this repo:** whether the live MLB webhook stream ever
actually calls these two functions with real events during a real game — that delivery path is an
entirely separate system (whatever fires the webhook), has no offline harness, and this phase does
not touch it. A green run of `test:bingo-mlb` proves the grading logic is right; it says nothing
about whether `resolver.currentCount` ever moves on a live card. If that needs verifying, it needs
watching an actual live MLB game with an active webhook-square card — out of scope for an offline
session.

### Gate

```
npx tsc --noEmit                       0 errors
npm run lint                           clean
npm run test:bingo-nfl                 244/244 (unchanged)
npm run test:bingo-mlb                 121/121 (was 106/106; +15 new)
npm run test (full suite)              1852/1865 passing, 13 skipped, 0 failing
```

### Handoff to whoever runs Phase 7 or 5 next (the only two left)

- **Nothing here touches Phase 7's (WNBA) or Phase 5's (calibration) scope.** This phase was purely
  additive test coverage on the MLB webhook-event path; no line number below ~10190 that either of
  those phases might reference moved, since no production code changed.
- **Commit scope discipline, same as R1-R4**: this commit should carry only `package.json` (the one
  `test:bingo-mlb` line), the new test file, and this plan doc's Phase 6 write-up — leave the other
  uncommitted survivors (`lib/fantasy.ts`, `lib/sportsBingoNflFlavor.ts`, `lib/thesportsdb.ts`,
  `lib/envNumber.ts`, `scripts/probe-nfl-flavor-squares.cjs`, `scripts/simulate-bingo-boards.cjs`,
  `tests/lib.sportsBingo.nfl-star-tilt.test.ts`, `tests/lib.envNumber.test.ts`,
  `tests/components.bingo.SportsBingoSelectSport.test.ts`, the two
  `docs/phase0-artifacts/*.json`) alone — they belong to other work.
- **Only Phase 7 (WNBA audit, Haiku 4.5, ~30 min) and Phase 5 (calibration, Opus 5, real API cost)
  remain.** Either order is fine between them; Phase 5 was always meant to run last regardless.
  Phase 7 has one confirmed thing to check per R2's write-up: the `getGameTimestamp` fix (R2) is
  known to also apply to WNBA (`/wnba/v1/games` has the same no-`datetime`/full-ISO-`date` shape as
  MLB and NFL) — treat that as a **confirmed hit already fixed by R2**, not a fresh finding to
  rediscover; Phase 7's own probe is about *other* WNBA field-name divergences, the MLB-style class
  of bug this whole plan is about.
- **Still on branch `restore/mlb-bingo-r1`, not `main`.** Andrew has not been asked whether to
  merge; this is now five phases of production/instrument work sitting on the same unmerged branch
  (R1-R4 plus this Phase 6 addition), which keeps strengthening the case for merging soon.

---

## Phase 7 — Audit WNBA for the same class of defect

**Model:** Haiku 4.5 · **Effort:** Low (~30 min), a handful of API calls.

Every MLB defect was a field-name divergence that no test could see. WNBA shares
`basketballApiPrefix` with NBA and is therefore *probably* fine — NBA is verified fine — but
"probably" is exactly what was assumed about MLB. Probe `/wnba/v1/games`, `/wnba/v1/stats` and
`/wnba/v1/lineups` and diff the field names against what `lib/sportsBingo.ts` reads. Expected
outcome is "no findings", which is a perfectly good result to write down.

---

## Phase 7 — done (2026-08-18)

**Not "no findings." WNBA has real, live, currently-active defects — bigger in kind than any single
MLB one, because two of the three are field-name divergences on top of balldontlie simply not
offering the `/wnba/v1/stats` and `/wnba/v1/lineups` endpoints at all.** WNBA is `enabled: true` in
`components/bingo/SportsBingoSelectSport.tsx` and it is currently WNBA season (Aug 18) — this is
live production exposure, not a dormant risk the way the pre-2026-08-18 MLB bugs briefly were before
any real player-prop volume existed. **Report only, per this phase's own scope and the plan's
"audit ≠ fix" discipline used everywhere else (Phase 3, R3's NBA-asymmetry finding) — nothing in
`lib/sportsBingo.ts` was touched.**

### Method

Probed live against `https://api.balldontlie.io` using the same `Authorization` header
`lib/balldontlie.ts` / `lib/ballDontLieClient.ts` use, via `node --env-file=.env.local`. Pulled a
real completed WNBA game (Aces @ Mystics, 2026-08-11, id `24999`) from `/wnba/v1/games`, then probed
every endpoint `lib/sportsBingo.ts` reaches through `basketballApiPrefixForSportKey("basketball_wnba")
→ "/wnba/v1"` against it, and cross-checked a real completed NBA game (id `21716137`, 2026-06-10) as
the control to confirm each divergence is WNBA-specific and not a preexisting NBA bug this plan
would otherwise have caught by now.

### Finding 1 — `status` never contains "final" for WNBA. `finalized` is permanently false.

`isBallDontLieGameFinal` (`lib/sportsBingo.ts:2224`) is `status.trim().toLowerCase().includes("final")`,
reading `game.status` directly at every call site (2358, 2613, 2916, plus the normalizer at 1404).
That works for MLB (`"STATUS_FINAL"`) and NBA (confirmed live: `"Final"`). **WNBA's completed-game
`status` is `"post"`** — the finality signal instead lives in a sibling field, `status_state:
"final"`, which `lib/sportsBingo.ts` never reads anywhere (`grep -c status_state` = 0). So
`buildNBAGamePlayerStatsSnapshot(...).finalized` is `false` for every WNBA game, forever, no matter
how long ago it ended.

**Confirmed live**, both leagues, same-shaped completed game:
```
WNBA (id 24999): status: "post"    status_state: "final"   → isBallDontLieGameFinal → false
NBA  (id 21716137): status: "Final"  status_state: "final"   → isBallDontLieGameFinal → true
```

### Finding 2 — score keys diverge too, and the read for WNBA settlement doesn't even chain

`buildNBAGamePlayerStatsSnapshot` reads `parseScoreValue(game.home_team_score)` /
`(game.visitor_team_score)` directly (`lib/sportsBingo.ts:2359-2360`) — not through the `??`-chained
`ballDontLieHomeScore`/`ballDontLieAwayScore` helpers R1 built for MLB, which at least fall back to
`*_team_data.runs`. **WNBA's `/games` rows carry neither key** — no `home_team_score` (NBA/NFL's flat
key) and no `home_team_data`/`away_team_data` (MLB's nested shape). WNBA uses its own third shape:
flat `home_score` / `away_score`. Confirmed live on the same game: `home_score: 86, away_score: 76`,
no `home_team_score` key present at all. So `homeScore`/`awayScore` on a WNBA snapshot are always
`null`, structurally, regardless of Finding 1.

### Finding 3 — `/wnba/v1/stats` and `/wnba/v1/lineups` don't exist on balldontlie at all

This is the one that isn't a field-name bug and isn't fixable by editing `lib/sportsBingo.ts`.
Confirmed live, repeatedly, with varied query params (`game_ids[]`, bare, `seasons[]`): both routes
return `404 {"error":"Route not found"}` for WNBA — not an empty result, not a permissions error, the
route itself doesn't exist on the provider. `/wnba/v1/season_averages/general` is also 404. By
contrast `/wnba/v1/games`, `/wnba/v1/players`, `/wnba/v1/players/active`, and
`/wnba/v1/odds/player_props` all return 200 (or a param-validation 400, which still proves the route
exists). `fetchBallDontLieList` (`lib/balldontlie.ts:40-43`) swallows any non-`ok` response to `{}` →
`data: []` with only a `console.error`, so every WNBA call to `/stats` or `/lineups` silently
degrades to "zero player stat lines, zero starters" rather than surfacing as an outage — the same
shape Phase 1's MLB harness was built to catch, except here there is no live shape to eventually
find, because the provider has never shipped these two routes for WNBA. **`lib/fantasy.ts`
(currently uncommitted-modified, a different feature) also calls `/wnba/v1/stats`
(line ~1409) and would hit the same wall — flagged for whoever owns that file next, not fixed here,
out of this plan's scope.**

### Net effect, confirmed against production data (not theoretical)

Queried `sports_bingo_cards`/`sports_bingo_squares` live (throwaway script, deleted after use, same
method R3 used for its MLB count). **6 WNBA cards exist in production, all already settled to
`status: "lost"`, spanning 150 squares: 101 `void`, 43 `miss`, 6 `hit`.** They did settle — not stuck
pending forever — because `mustForceFinalize` (`lib/sportsBingo.ts:10767-10793`, the 12-hour
force-finalize safety net keyed on `starts_at` elapsed time, not on the provider's own status field)
overrides a permanently-`false` `finalized`/`completed`. But every one of those 6 cards graded 12
hours late by construction, and the 101/150 (67%) void rate is the visible fingerprint of Finding 3:
with `/stats` and `/lineups` structurally unreachable, any resolver that needs a real stat line has
nothing to grade against and voids at the force-finalize window instead of resolving for real. This
mirrors the pre-R3 MLB house-rule bug in shape (missing data should void, not miss — and here it
correctly does void, so the *outcome* is house-rule-compliant) but the *root cause* is different and
worse: MLB's data existed and was reachable, just misread; WNBA's data for player-level resolvers
does not exist on the provider at all, so no client-side fix can produce it.

### What is and isn't fixable

- **Finding 1 (status) is a one-line fix** — same shape as R1's `isBallDontLieGameFinal` fix, just
  reading `status_state` too: `.includes("final")` on `status` **or** `status_state`. Would not
  touch MLB/NBA/NFL (their `status_state`, where present, already says "final" whenever their
  `status` does).
- **Finding 2 (score) is a small fix** — extend `ballDontLieHomeScore`/`ballDontLieAwayScore`'s `??`
  chain with a third fallback to flat `home_score`/`away_score`, and point
  `buildNBAGamePlayerStatsSnapshot`'s two direct reads (2359-2360) at those helpers instead of the
  raw NBA/NFL-shaped keys — the same pattern R1 used for MLB's own third score shape.
- **Finding 3 (missing endpoints) is not fixable in this codebase at all.** It needs balldontlie to
  ship the routes, or a product decision to gate WNBA player-level resolvers (triple-doubles,
  player props, anything needing `/stats` or `/lineups`) off entirely until they do, leaving only
  team-level markets (moneyline/spread/total, once Findings 1-2 are fixed) live for WNBA.

Initially reported without fixing, per Phase 7's own audit scope and this plan's discipline of
separating "found and reported" from "fixed" everywhere else (Phase 3, R3's NBA-asymmetry finding).
**Andrew then asked for Findings 1-2 to be fixed in this same session — see the follow-up below.**
Finding 3 still cannot be fixed here; it remains a product call, unresolved.

---

## Phase 7 follow-up — Findings 1-2 fixed (2026-08-18)

**Done same-day, on request, after the audit above.** Finding 3 (missing balldontlie endpoints) is
unchanged and still open — it is not an engineering fix, see the audit's own note.

### What shipped, in `lib/sportsBingo.ts`

- **`isBallDontLieGameFinal` (~2224, signature changed)** — now `(status: string, statusState?:
  string) => boolean`. Checks `status` first (unchanged behavior for MLB/NBA/NFL, all still match
  on their own `status`), then OR's in `statusState.includes("final")` as a second signal. Every
  call site with a `game` in scope (~1414 in `normalizeBallDontLieScoreRow`, ~2377 in
  `buildNBAGamePlayerStatsSnapshot`) now passes `game.status_state`. The two NFL-only call sites
  (`nflQuartersCompleted`'s `params.status`, `buildNFLGameStatsSnapshot`) and MLB's
  `buildMLBGamePlayerStatsSnapshot` were left passing only `status` — NFL was confirmed live
  (id `1341307`, 2026-02-08) to already say `"Final"` in `status` itself, so it doesn't need the
  second signal, and MLB's `status_state` was never part of the plan's verified-facts table; leaving
  both alone matches this plan's standing discipline of touching only the confirmed-broken site.
- **`ballDontLieHomeScore` / `ballDontLieAwayScore` (~1435)** — `??` chain gained a third fallback:
  `*_team_score ?? *_team_data.{runs,points,score} ?? *_score`. WNBA has neither of the first two, so
  it now falls through to the flat `home_score`/`away_score` keys R1 never anticipated because MLB's
  gap (the second link) was the only third-shape problem known at the time.
- **`buildNBAGamePlayerStatsSnapshot` (~2321, now exported)** — its two direct score reads
  (`parseScoreValue(game.home_team_score)` / `(game.visitor_team_score)`) now call
  `ballDontLieHomeScore(game)` / `ballDontLieAwayScore(game)` instead, so WNBA gets the same
  fallback chain MLB already had through R1. Exported (one-line "exported for the test" comment,
  same convention as R1's exports) so
  `tests/lib.sportsBingo.wnba-row-shape.test.ts` can call it directly rather than only through the
  lighter-weight score normalizer.
- **`BallDontLieGame` type** — gained `status_state?: string`, `home_score?: number | string | null`,
  `away_score?: number | string | null`, each with an inline comment naming which league needs it.

**Left untouched, deliberately:** the two NFL-only raw score reads (`buildNFLQuarterScores` ~2799,
`buildNFLGameStatsSnapshot` ~2998) — NFL's shape was never broken, so per R1's "don't touch what's
correct" precedent they still read `game.home_team_score` directly. `buildMLBGamePlayerStatsSnapshot`
(~2632) already called the two helpers before this fix and needed no change to pick up the new
`?? *_score` fallback for free — it's the same shared helper.

### Tests

- **`tests/lib.sportsBingo.balldontlie-score-normalizer.test.ts`** — two new cases: the WNBA shape
  parses correctly (`status: "post"` + `status_state: "final"`, flat `home_score`/`away_score`), and
  a pre-fix-verbatim regression proof (old parser reads `completed: false`, `home_team_score:
  undefined` for the same row).
- **`tests/lib.sportsBingo.wnba-row-shape.test.ts` (new)** — mirrors
  `mlb-row-shape.test.ts`'s structure. Exercises the actual settlement-path function
  (`buildNBAGamePlayerStatsSnapshot`) directly, against the real Aces @ Mystics row (id `24999`)
  probed live during the audit: `finalized` now `true`, `homeScore`/`awayScore` now `86`/`76`, plus
  two pre-fix regression assertions, plus an NBA control case (real id `21716137` row) proving NBA's
  `*_team_score` read path is undisturbed.
- **Proven failing pre-fix**, per this plan's testing standard: stashed only `lib/sportsBingo.ts`
  (`git stash push --keep-index -- lib/sportsBingo.ts` — the incident's own standing rule against
  `git checkout`/`restore` on this file, stash is the safe reversible alternative it names), reran
  both files — all 4 new assertions failed exactly as expected (including
  `buildNBAGamePlayerStatsSnapshot is not a function`, since the export didn't exist pre-fix either)
  — then `git stash pop` to restore. Verified `git status` showed no other file touched by the
  stash/pop round-trip.

### Gate — results

```
npx tsc --noEmit                                          0 errors
npm run lint                                                clean
npm run test:bingo-nfl                                     244/244 (unchanged)
npm run test:bingo-mlb                                     123/123 (was 121 — +2 in the normalizer file)
npx vitest run tests/lib.sportsBingo.wnba-row-shape.test.ts
  tests/lib.sportsBingo.balldontlie-score-normalizer.test.ts
  tests/lib.sportsBingo.mlb-row-shape.test.ts
  tests/lib.sportsBingo.sport-path-keys.test.ts
  tests/lib.sportsBingo.nfl-safety-attribution.test.ts       43/43
npm run test (full suite)                                   1859 passed / 0 failed / 13 skipped
```

`tests/lib.sportsBingo.wnba-row-shape.test.ts` is picked up by the full-suite glob automatically
(vitest's default `tests/**/*.test.ts` match) — it is **not** wired into any named `test:bingo-*`
script, since there is no `test:bingo-wnba`/`test:bingo-nba` script to wire it into and it doesn't
belong under the MLB or NFL names. If a WNBA/NBA-specific named script is ever added, wire it in
there.

### Not fixed — Finding 3, unchanged, still a product call

`/wnba/v1/stats` and `/wnba/v1/lineups` still don't exist on balldontlie. No code change can produce
them. Every WNBA player-level resolver (player props, triple-doubles, anything needing a stat line
or a starter) still silently voids at settlement — Findings 1-2 fix *when* and *what score* a WNBA
card settles against, not the missing player data itself. The 6 existing production WNBA cards are
historical and were not touched (no regrade run — that would be a Phase-3-style historical
remediation decision, not part of this fix, and nobody asked for it). **Going forward, newly created
WNBA cards will now finalize on time (at real completion, not 12 hours late) with correct team
scores, but any player-level square on them will still void, because Finding 3 is still open.**

### Handoff to whoever runs Phase 5 (the last phase)

- **Phase 5 is MLB calibration (`bingo:calibrate:mlb`) and is untouched in scope by this fix or the
  audit that preceded it** — WNBA is a different sport key with its own base-rate model
  (`WNBA_CALIBRATION` at `lib/sportsBingo.ts:180-189`), not something `bingo:calibrate:mlb` measures.
  Nothing here blocks Phase 5 or changes its inputs. `lib/sportsBingo.ts`'s diff from this fix is
  isolated to the sites named above — re-grep before editing anything below ~1435 or ~2321, since
  this fix shifted a handful of lines (the widened `BallDontLieGame` type, the new export comment).
- **This still doesn't mean "the sports-bingo surface is fully clean" once Phase 5 lands.** Finding 3
  is real, live, and unfixed — flag it to Andrew alongside Phase 5's results rather than letting
  Phase 5's completion read as "everything is done." The product decision it needs (gate WNBA
  player-level resolvers off vs. wait on the provider) is still open.
- **Still on branch `restore/mlb-bingo-r1`, not `main`.** This follow-up adds a sixth
  production-affecting change to the same unmerged branch (after R1-R4, Phase 6, and now this).
  Nothing has been committed yet from this session — do that before starting Phase 5, per the
  incident's own standing rule against letting production fixes sit uncommitted. Merge-to-`main`
  decision is still open, still Andrew's.

---

## Sequencing

**Current sequencing (post-incident, 2026-08-18) — this is the one to follow:**

```
R1 ──> R2 ──> R3 ──> 3        (R3 = the old Phase 2; 3 needs R3's finding)
             R3 ──> 5        (5 would otherwise calibrate against the miss/void bug)
R1 ──> R4                    (the old Phase 4b, minus the surviving script half)
4a                            already done, verified post-incident
6, 7                          independent — land any time, but R1 first if they touch lib/sportsBingo.ts
```

**Run order: R1 → R2 → R3 → R4 → 3 → 6 → 7 → 5.** All executed in that order and complete as of
2026-08-18; Phase 8 (added late, independent of the ordering) ran alongside Phase 5.

R1 is first and urgent for a reason the original plan did not have to consider: the incident
reverted the four *production* MLB row-shape fixes, so MLB player-prop squares are ungradeable on
live cards right now. R2 is the cheap proof R1 landed. R3 (old Phase 2) is the player-facing
correctness fix. R4 is instrument-only and can slip. Phase 5 stays last: only Opus 5 phase, only one
with real API cost, worthless if run before R3.

**Original sequencing, for reference:**

```
1 ──> 2 ──> 3        (2 needs 1's harness to prove the fix; 3 needs 2's finding)
      2 ──> 5        (5 would otherwise calibrate against the miss/void bug)
1 ──> 4b
4a, 6, 7             independent — land any time
```

**Suggested order: 4a → 1 → 2 → 3 → 6 → 7 → 5.** 4a is twenty minutes and stops the harness lying
to whoever does Phase 1. Phase 5 is last: it is the only Opus 5 phase, the only one with real API
cost, and the only one that is worthless if run early.

## Gate commands

Same four the parent plans used, plus the MLB suite this work will grow:

```
npx tsc --noEmit
npm run lint
npm run test:bingo-nfl     # 244 at time of writing
npm run test:bingo-mlb     # 97 at time of writing
```

**Post-incident baseline (2026-08-18):** `npx tsc --noEmit` currently reports **9 errors**, all
`@/lib/sportsBingo` import failures from the four orphaned test files. `npm run lint` is clean. R1
must take tsc to 0; until then, "clean tsc" is not a meaningful gate for any other phase.

**Per the parent plan's standard: every phase that changes behavior needs a test proven to fail
against the pre-fix code.** Phases 1, 4a and 7 are instruments rather than behavior changes and are
exempt — their output *is* the evidence.

## Standing rule added by the 2026-08-18 incident

**Never use `git checkout -- <file>` / `git restore <file>` to undo an edit you just made.** It
resets the file to `HEAD`, discarding *all* uncommitted changes in it — not just yours. This file,
`lib/sportsBingo.ts`, routinely carries large amounts of uncommitted multi-phase work, which is
exactly what made the loss expensive.

To prove a test fails pre-fix (which this plan's testing standard requires on every
behavior-changing phase), invert your own lines by hand and then re-apply them — never round-trip
through git. If you must, `git diff -- <file> > scratch.diff` first so the rest of the diff is
recoverable. And **commit restored production fixes promptly**; R1's contents have now been lost
once precisely because they sat uncommitted.

## One standing rule for this area

**MLB is the league where nothing is verified until it has been run against the live feed.** Four
defects survived here because the shapes were assumed from NBA/NFL. Any phase above that asserts a
field name should re-probe it in the same session, and any phase that reports success should say
plainly which half of the path it exercised — generation, settlement, or both. `bingo:simulate
--backtest` reporting a healthy win rate for the wrong league is the cautionary example.

---

## Phase 8 — Check whether NBA's `miss`-instead-of-`void` asymmetry has actually hit production

**Added 2026-08-18 as a reminder. Run and closed the same day — see the "done" write-up below.**

**Model:** Sonnet 5 · **Effort:** Low (~10 min), one DB query. No code change unless the count is
non-zero.

R3 confirmed NBA's arm of `case "player_prop"` in `evaluateResolver` (~8786-8791,
`if (isNba && !nbaStatsSnapshot)`) has the identical `miss`-on-missing-data bug MLB had before R3 —
found and reported, deliberately **not** fixed, since the plan scopes fixing forward behavior as
its own change with its own review (same reasoning as Phase 3 for MLB).

**Unlike MLB, this one can't be assumed dormant.** MLB's version was inert until 2026-08-18 because
the snapshot path itself was unreachable; NBA player-prop grading has been live and reachable the
whole time. If the asymmetry has ever actually fired — a missing snapshot, missing stat line, or
non-finite value at Final for an NBA player-prop square — that square settled `miss` for a real
player when the house rule says it should have voided.

**Do this (same method R3 used for MLB's historical count):**

1. Query `sports_bingo_squares` for rows on `basketball_nba` cards with a `player_prop` resolver
   and `status = 'miss'`.
2. That alone isn't proof — a real `miss` and a should-have-voided `miss` look identical in the
   status column. Cross-check candidates against whatever signal distinguishes them (e.g. no
   corresponding NBA stats snapshot ever existed for that game/player at the time of settlement, if
   that's reconstructable; otherwise this may need spot-checking a sample by hand).
3. Report the count and, if non-zero, treat it the same way Phase 3 treats a non-zero MLB count:
   present it and the remediation options (leave it, regrade via the void-regrade path, regrade +
   re-run line detection) as a product/fairness call, not an engineering one — do not pick for
   Andrew.

**If the count is zero:** note it and close, same as Phase 3 did for MLB. **If non-zero:** the NBA
fix itself is still a small ternary change (mirror R3's `isMlb ? "void" : "miss"` pattern, just for
`isNba`) — but do not write that code until Andrew has seen the count and decided whether historical
squares also need addressing, so the forward fix and any backfill land as one reviewed decision
rather than two.

---

## Phase 8 — done (2026-08-18)

**The count Phase 8 asked for is zero. The audit that produced it found something larger: the
`miss`-instead-of-`void` asymmetry has already fired 108 times in production — just never through
the `player_prop` resolver kind this phase named.** Every stats-derived square in the entire
production history of Sports Bingo, across three sports and eight resolver kinds, settled `miss` on
missing data while the market squares on the very same card correctly settled `void`.

**Report only. No code was changed** — same discipline the phase itself specifies, and the same the
plan used for Phase 3 and R3's NBA finding.

### The literal answer to Phase 8's question

Queried `sports_bingo_squares` and `sports_bingo_cards` live via `SUPABASE_SERVICE_ROLE_KEY`
(throwaway script, deleted after use, no secrets echoed).

- **NBA `player_prop` squares at `status = 'miss'`: 0.**
- **`player_prop` squares in production at all, any sport, any status: 0.** Same result R3 got for
  MLB, now confirmed to hold league-wide. The step-2 cross-check the phase describes ("a real miss
  and a should-have-voided miss look identical") never became necessary — there was nothing to
  disambiguate.
- Production volume is 14 cards total, 350 squares: 6 `basketball_wnba`, 6 `baseball_mlb`, 2 `nba`.
  All 14 are `status = 'lost'`.

**Per the phase's own branch, this closes: the count is zero, no product decision is needed, and no
NBA `player_prop` code change should be written.** The forward-looking asymmetry R3 reported at
`case "player_prop"` (`if (isNba && !nbaStatsSnapshot)`, still flat `"miss"`) is unchanged and still
unfixed — it is a bug waiting, not a bug that has bitten.

### The bigger finding — the same bug, seven other resolver kinds, 108 live squares

Tallying every square by sport and resolver kind exposes a perfectly clean split:

```
                                                        void   miss
baseball_mlb    moneyline / spread_* / *_total_*         102      -
baseball_mlb    mlb_webhook_team_event_at_least            -     42
basketball_wnba moneyline / spread_* / *_total_*         101      -
basketball_wnba nba_team_stat_at_least                     -     14
basketball_wnba team_triple_double                         -      8
basketball_wnba nba_team_scores_first                      -      6
basketball_wnba nba_team_leads_at_halftime                 -      6
basketball_wnba nba_team_outrebounds                       -      5
basketball_wnba nba_team_three_pt_scorers                  -      4
nba             moneyline / spread_* / *_total_*           25      -
nba             nba_player_stat_at_least                    -     21
nba             team_triple_double                          -      2
                                                        ----   ----
                                                         228    108      (+14 free hits = 350)
```

**Not one market square hit or missed; not one stats square voided.** That is not a coincidence, and
the mechanism is exact. `refreshSportsBingoProgress` (`lib/sportsBingo.ts:~10806`) synthesizes a
fallback snapshot when no score is available and the 12-hour force-finalize window has passed:

```ts
const effectiveScore: ScoreSnapshot = score ?? ({ …, homeScore: null, awayScore: null, completed: true });
```

Fed that object, `evaluateResolver` splits:

- A market resolver sees `!hasGameScore` → `pending` → the force-finalize branch writes **`void`**.
  Correct, and the house rule working as designed.
- A stats resolver sees `!nbaStatsSnapshot && completed === true` → **`miss`, resolved**. Every one
  of the eight kinds above has that literal shape, e.g. `nba_team_stat_at_least` at
  `lib/sportsBingo.ts:9024-9029`.

So a single settlement pass on a single card, with a single missing-data condition, voided half its
squares and missed the other half. **The house rule the file states for itself — "Missing data
voids, it never misses" — is being violated 108 times in the only production data that exists.**

Why those particular squares had no data is already documented in this plan and is not in dispute:
WNBA has no `/wnba/v1/stats` endpoint at all (Phase 7, Finding 3, still unfixed); MLB's snapshot path
was unreachable before R1's row-shape fixes; and the two `nba` cards carry a `sport_key` no code path
recognizes (below). The bug is not that the data was missing — it is what settlement did about it.

**This also silently killed the regrade seam.** All eight kinds are registered in
`isResolverEligibleForVoidRegrade` (`lib/sportsBingo.ts:9997-10025`), which reopens a `void` square
when a late box score arrives. A `miss` is terminal and is never reconsidered. The kinds most likely
to be missing data at settlement are exactly the kinds that were denied the mechanism built for
them.

### Player impact — real, but not outcome-changing

**No card's outcome changes.** All 14 are `lost`, and they would still be lost under correct
settlement: `boardStatusesMakeALine` treats a void as a non-hit, so a board whose 24 playable squares
all void makes no line either way. No points, prizes or leaderboard positions are affected.

What players were shown is a different matter: 108 squares displayed as a red "you missed this" when
the truthful state was "we never got the data." That is a fairness/comms issue rather than an
economic one, which is precisely why the remediation call belongs to Andrew and not here.

### Remediation options — presented, not chosen

Same framing Phase 3 uses. **Do not write either fix until Andrew has picked.**

1. **Forward fix only.** Change the eight `!snapshot → miss` positions to `void`, matching the NFL
   arm (which already voids everywhere — `case "nfl_player_anytime_td"`, `lib/sportsBingo.ts:9307`,
   is the model) and MLB's `player_prop` arm after R3. Small and mechanical, but it is eight sites
   across three sports and wants its own tests proven failing first, per this plan's standard.
2. **Forward fix + backfill the 108.** Rewrite those rows `miss` → `void`. Cheap at this volume and
   makes the historical record honest. Since no outcome changes, no points or prizes move.
3. **Leave it.** Defensible: 14 cards, all lost regardless, and Phase 7's Finding 3 means WNBA
   squares would only void into a different kind of dead end until the provider gap is resolved.

Option 1 is the one that stops the count growing, and it is the only one that matters if WNBA or MLB
Bingo sees real volume before Finding 3 is settled.

### Side finding — two cards carry `sport_key = "nba"`, which nothing recognizes

The two NBA cards (`bc8aa524…`, `e59236ea…`, created 2026-06-05 and 2026-06-10) have
`sport_key = "nba"`, not the canonical `"basketball_nba"` the migration defaults to.
`basketballApiPrefixForSportKey` (`lib/sportsBingo.ts:1256-1264`) returns `null` for it, so no stats
snapshot was ever fetched for either card — which is why all 23 of their stats squares landed in the
tally above. `evaluateResolver`'s `isNba` check is likewise `snapshot.sportKey === "basketball_nba"`,
so had those cards carried a `player_prop`, it would have fallen through to the unsupported-market
branch. Two rows, both already settled; worth a look at whatever wrote them before NBA sees real
volume, but not urgent at this volume.

### Related asymmetry noticed in passing, not fixed

`case "player_prop"`'s support gate (`lib/sportsBingo.ts:8876-8883`) returns a flat
`{ status: "miss" }` for an unsupported `marketKey` on **both** NBA and MLB, while the NFL arm
fourteen lines above voids the identical condition. R3 fixed MLB's three missing-data positions but
this fourth one is still `miss` for MLB too, so "MLB player props void on missing data" is not yet
true without qualification. Inert today (zero `player_prop` squares exist), and it belongs with
whichever change addresses the 108 above rather than as a separate edit.

### Method

Two throwaway Node scripts against the Supabase REST API using the service-role key, deleted after
use. No production writes of any kind; both were read-only `GET`s. The resolver-kind tally covers
all 350 square rows and all 14 card rows — the whole table, not a sample, so the counts above are
exact rather than estimated.

### Gate

No code changed, so the gate is unchanged from Phase 5's run above (`tsc` 0, lint clean, 244/244
NFL, 123/123 MLB, 1859 passing full suite). Nothing here was proven by a test, and nothing here
should be — this phase is a query.
