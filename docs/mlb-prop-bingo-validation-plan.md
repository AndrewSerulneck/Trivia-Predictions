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
- **Not yet done, still open:** 6, 7, 5 (any order). 3 is closed (see R3's write-up).

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

## Phase 7 — Audit WNBA for the same class of defect

**Model:** Haiku 4.5 · **Effort:** Low (~30 min), a handful of API calls.

Every MLB defect was a field-name divergence that no test could see. WNBA shares
`basketballApiPrefix` with NBA and is therefore *probably* fine — NBA is verified fine — but
"probably" is exactly what was assumed about MLB. Probe `/wnba/v1/games`, `/wnba/v1/stats` and
`/wnba/v1/lineups` and diff the field names against what `lib/sportsBingo.ts` reads. Expected
outcome is "no findings", which is a perfectly good result to write down.

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

**Run order: R1 → R2 → R3 → R4 → 3 → 6 → 7 → 5.**

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

**Not yet scheduled — added 2026-08-18 as a reminder, not started.**

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
