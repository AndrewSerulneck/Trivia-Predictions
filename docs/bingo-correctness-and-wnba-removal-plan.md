# Sports Bingo — Two Correctness Fixes and the WNBA Removal

Drafted 2026-08-18, out of the findings recorded in `docs/mlb-prop-bingo-validation-plan.md`
(Phases 5, 7 and 8). **Read that plan's Phase 5, Phase 7 and Phase 8 "done" write-ups first** — they
are the evidence base and are not repeated in full here.

Three independent pieces of work, each executable cold in its own session:

| phase | what | model | effort |
|---|---|---|---|
| **1** | MLB team-event base rates get a home/away split | Sonnet 5 | Medium (~2h) + API calls |
| **2** | Stats-derived squares void on missing data instead of missing | Sonnet 5 | Medium (~2h) |
| **3** | Remove WNBA from Sports Bingo | Sonnet 5 | Low-Medium (~1.5h) |

---

## ⚠️ READ THIS BEFORE PHASE 3 — Phase 7's Finding 3 was wrong

`docs/mlb-prop-bingo-validation-plan.md` Phase 7 Finding 3 says balldontlie does not offer WNBA
player or team stats at all, and that WNBA squares are therefore unfixable. **That is not correct,
and it was the main reason removal looked like the only option.** Re-probed live 2026-08-18 against
a real completed WNBA game (Aces/Tempo era rosters, game `24996`, 2026-08-11):

| what the code asks for | result | what actually works |
|---|---|---|
| `/wnba/v1/stats` | **404 Route not found** | **`/wnba/v1/player_stats` → 200, 25 rows** with `pts, reb, ast, stl, blk, turnover, fgm/fga, ftm/fta, min, plus_minus` |
| `/wnba/v1/lineups` | **404 Route not found** | nothing — no starter/bench data exists for WNBA |
| `/wnba/v1/plays?game_ids[]=` | **400** (`game_id must be a valid integer`) | **`/wnba/v1/plays?game_id=` (singular) → 200, 423 rows** |
| plays scoring flag `is_scoring_play` | absent | field is named **`scoring_play`** |
| `/wnba/v1/player_stats?period=N` | 200 but **the `period` param is ignored** — periods 0, 1 and 2 return identical numbers | no per-quarter split from stats; the `plays` walk is the only quarter source |
| — | — | `/wnba/v1/team_stats` → 200, 2 rows, full team aggregates |

So this is a **fifth instance of exactly the bug class this whole plan family exists for**: WNBA is a
differently-shaped API being driven as "NBA with a different prefix". The snapshot builder fetches
all three endpoints inside one `try { … } catch { return null }`
(`lib/sportsBingo.ts:2446-2560`), so the `/lineups` 404 alone nulls the entire snapshot even
though the box score was sitting there available the whole time.

**What that means for the decision:**

- Most WNBA squares are **repairable**, not impossible. Player and team stat squares need an
  endpoint rename and a param fix. Quarter/halftime/first-scorer squares need the `plays` call fixed
  (`game_id` singular) and the `scoring_play` field name.
- Exactly one family is genuinely impossible: **`nba_player_bench_scores`**, which needs a starter
  flag that has no WNBA source.
- Repair is roughly the size of Phase 3 below (call it a day, plus a live verification pass).

**Phase 3 as written still removes WNBA, because that is what was asked for** — and there are good
non-technical reasons to (a small seasonal league, thin venue demand, one less surface to keep
correct). But it is now a product choice, not a forced one. **Andrew should confirm before Phase 3
is executed**, and Phase 3 is deliberately designed so the decision is cheap to reverse. If the
answer changes to "repair it", that work is a separate plan and Phase 3 should simply not run;
Phases 1 and 2 are unaffected either way.

---

## Verified facts this plan is built on

All probed live 2026-08-18. Per this area's standing rule, **re-probe anything you are about to
write code against, in the same session** — do not trust these colder than that.

| source | fact |
|---|---|
| `/mlb/v1/games` | `seasons[]` **is** honoured (contrary to the "dates[] is the only param" note at `scripts/simulate-bingo-boards.cjs:165`). `season_type` is `"regular"` / `"spring_training"` / `"postseason"` — **not** `"regular_season"` |
| MLB box scores, 300 games of 2025 | home teams bat **8.62** innings vs away **9.12**; home batted fewer in **149/300** games. All six measured events run home < away. Artifact: `docs/phase0-artifacts/phase5-mlb-home-away-split-2026-08-18.json` |
| `evaluateResolver` | **21 non-NFL resolver kinds** return `miss` when their stats snapshot is absent. Every NFL kind returns `void` for the identical condition |
| production DB | 14 bingo cards total, 350 squares. 228 void, 108 miss, 14 free hits. **Zero `player_prop` squares of any sport.** All 14 cards are `status = 'lost'`; **no active cards exist** |
| `/wnba/v1/*` | see the table above |

---

## Phase 1 — Give the MLB team-event base rates a home/away split

**Model:** Sonnet 5 · **Effort:** Medium (~2 hrs), plus ~300 API calls.
**Files:** `scripts/measure-mlb-event-rates.cjs`, `lib/mlbTeamEventRates.ts`, `lib/sportsBingo.ts`
(two call sites), `tests/lib.sportsBingo.mlb-event-rebalance.test.ts`.

### The problem

`predictMlbTeamEventRate` (`lib/mlbTeamEventRates.ts:122`) returns one `leagueMean` per event,
pooled across both teams. But the home team does not bat in the bottom of the 9th when it is
already ahead — about half of all games — so its event totals run structurally below the away
team's. Home squares are priced too high and away squares too low, by roughly the same amount, so
**every aggregate in this codebase averages the error to zero**: the pooled family rate, the board
win rate, and `bingo:simulate --backtest` all look correct. Only `byTeamEventSide` in
`bingo:calibrate:mlb` shows it.

Measured effect: ~2-5 points of probability on affected squares, largest on strikeouts
(home 8.04 per game vs away 8.73).

### Do this

**1a — teach the measurement script about sides.** `scripts/measure-mlb-event-rates.cjs` builds one
row per team per game (`teamGames`, ~line 170-215) but never records which side that team was. The
two rows come out of `byGameTeam.values()` filtered by game id, in arbitrary order, and are only
cross-linked for `allowed` rates.

Tag each row: the game object carries top-level `home_team_name` / `away_team_name`, and each stat
row carries `team_name`, so `side = entry.teamName === game.home_team_name ? "home" : "away"`.
Match on the same fuzzy comparison the rest of the path uses (`teamsMatch`) rather than `===`, or
the two expansion clubs whose `full_name` is a bare mascot will fall through — see the WNBA table
above for what that looks like, it is not hypothetical.

Then emit a **third view** alongside the existing marginal and conditional ones: per event, the
mean, variance and `P(X >= n)` table **split by side**. Keep the existing two views byte-identical
in shape — Phase 1 must not invalidate the archived
`docs/phase0-artifacts/mlb-event-rates-2026-08-17.json` comparison.

**1b — re-run it and record the numbers.**

```
npm run bingo:measure:mlb -- --days 120 --json > docs/phase0-artifacts/mlb-event-rates-side-split-<date>.json
```

**Do not hand-copy the 2025 numbers out of Phase 5's artifact into the rate table.** The shipped
`MLB_TEAM_EVENT_RATES` was measured over the 2026 season and the two differ by up to 5% per event
(e.g. walk 3.275 shipped vs 3.120 in the 2025 split). Mixing a 2026 pooled mean with a 2025 side
ratio would introduce a second error while fixing the first. `lib/mlbTeamEventRates.ts`'s own module
comment already states this rule — "Re-run that script and update this table rather than
hand-adjusting a constant" — and it is the rule here too. Phase 5's artifact is the **corroboration**
that the effect is real; the new run is the **source** of the shipped numbers.

**1c — widen the model.** Add per-side means to `MlbTeamEventRateModel`. Prefer storing them
explicitly over storing a ratio:

```ts
export type MlbTeamEventRateModel = {
  readonly leagueMean: number;      // keep — pooled, still the fallback
  readonly homeMean: number;        // new
  readonly awayMean: number;        // new
  readonly variance: number;
  // … opponent fields unchanged
};
```

**On variance:** measure it per side in 1b and look at the result before deciding. If the two sides'
variances are within ~5% of the pooled figure, keep one pooled `variance` and say so in the module
comment — the negative-binomial fit is second-order here and an unjustified extra constant is worse
than none. If they genuinely diverge, split it too. **Do not split it reflexively.**

**1d — thread the side through.** `predictMlbTeamEventRate` takes a new `teamSide: TeamSide | null`
parameter and selects `homeMean` / `awayMean` / `leagueMean` accordingly, applying the existing
opponent adjustment on top unchanged. A `null` side must return the pooled `leagueMean`, i.e. exactly
today's behavior — that is the compatibility escape hatch and it needs its own test.

Two call sites, both already know the side:
- `lib/sportsBingo.ts:5309` — inside `buildMlbTeamEventCandidateTemplatesForBacktest`, in the
  `for (const teamSide of ["home", "away"] as const)` loop. Pass `teamSide`.
- `lib/sportsBingo.ts:5769` — the live path in `buildMLBPlayerPropCandidatesFromRecentStats`.
  Re-grep; confirm which variable holds the side there before editing.

`buildMlbTeamEventRungs` needs no signature change — it already takes `expectedRate` as an argument,
which is the whole reason this fix is small.

### Tests — must be proven failing first

Extend `tests/lib.sportsBingo.mlb-event-rebalance.test.ts`:

1. `predictMlbTeamEventRate(event, null, 0, "home")` < `(…, "away")` for every event where the
   measurement says so. **Assert the direction, not a hardcoded number** — a future re-measurement
   should not have to rewrite the test.
2. `predictMlbTeamEventRate(event, null, 0, null)` **exactly equals** `leagueMean` for all six
   events — the no-side path is unchanged.
3. The existing opponent-adjustment tests still pass with a side supplied, i.e. the two adjustments
   compose rather than one clobbering the other.
4. A generated MLB board's home and away rungs for the same event can now differ in threshold.

**Proving them fail:** invert your own edit by hand (make the side selector return `leagueMean`
unconditionally), run, then re-apply. **Never `git checkout -- lib/mlbTeamEventRates.ts`** — see the
standing rule at the bottom.

### Verification

```
npm run bingo:calibrate:mlb -- --games 600 --boards 6
```

Compare `byTeamEventSide` against
`docs/phase0-artifacts/phase5-mlb-calibration-2026-08-18.json`. **Success is `team_event:ALL:home`
and `team_event:ALL:away` both moving toward zero gap**, and `byTeamEvent` (pooled) staying where it
already is — it is correct today and must not be broken by the fix. Board generation is random per
trial, so compare signs and magnitudes, not third decimals; two runs over the same slate differ by a
point or two per row.

### Gate

```
npx tsc --noEmit
npm run lint
npm run test:bingo-nfl     # 244 at time of writing
npm run test:bingo-mlb     # 123 at time of writing
npm run test               # 1859 passing / 13 skipped
```

---

## Phase 2 — Stats-derived squares must void on missing data, not miss

**Model:** Sonnet 5 · **Effort:** Medium (~2 hrs).
**File:** `lib/sportsBingo.ts`, `evaluateResolver` (~8744-9300 — **re-grep, these numbers move**).

### The problem

The file states the house rule for itself: *missing data voids, it never misses.* The NFL arm obeys
it everywhere. The NBA/WNBA arm does not, at **21 separate positions**, and the shape is identical
each time:

```ts
if (!nbaStatsSnapshot) {
  if (!completed) return { status: "pending", resolved: false };
  return { status: "miss", resolved: true };   // <- should be void
}
```

This has already fired **108 times in production** (Phase 8's audit). The trigger is
`refreshSportsBingoProgress` (~`lib/sportsBingo.ts:10806`), which synthesizes a fallback snapshot
when the 12-hour force-finalize window passes with no score:

```ts
const effectiveScore: ScoreSnapshot = score ?? ({ …, homeScore: null, awayScore: null, completed: true });
```

Fed that, a market resolver reads `!hasGameScore` → `pending` → the force-finalize branch writes
`void` (correct). A stats resolver reads `completed === true` with no snapshot → `miss`. **One
settlement pass, one missing-data condition, two different answers on the same card.**

It also silently kills the regrade seam: all 21 kinds are registered in
`isResolverEligibleForVoidRegrade` (`lib/sportsBingo.ts:9997+`), which reopens a `void` when a late
box score lands. A `miss` is terminal. The kinds most likely to be missing data at settlement are
exactly the kinds denied the mechanism built for them.

### The 21 positions

Enumerated 2026-08-18 by scanning every `case` block in `evaluateResolver` for a bare
`!nbaStatsSnapshot` guard. **Re-derive this list rather than trusting it** — the same scan takes two
minutes and the line numbers will have moved:

```
nba_player_stat_at_least              nba_player_perfect_fg           nba_team_outrebounds
nba_player_double_double              nba_player_triple_threat        nba_player_bench_scores
team_triple_double / any_triple_double  nba_player_zero_turnovers     nba_team_scores_first
nba_team_stat_at_least                nba_player_plus_minus_at_least  nba_team_leads_at_halftime
nba_team_players_scored_at_least      nba_team_has_double_double      nba_team_points_in_any_quarter_at_least
nba_player_triple_double              nba_team_three_pt_scorers       nba_player_points_first_half_at_least
nba_player_perfect_ft                 nba_team_turnovers_at_most      nba_player_assists_in_any_quarter_at_least
                                                                      nba_player_steals_first_half_at_least
```

Note two shapes: most are multi-line `if (!nbaStatsSnapshot) { … }` blocks, but several
(`nba_player_bench_scores` onward, ~9195+) are single-line
`if (!nbaStatsSnapshot) return completed ? { status: "miss", … } : …`. Both need changing.

### Scope decisions — make these deliberately, do not drift

**Change only the "no snapshot at all" guard.** Leave alone:

- `if (!line)` / `if (!playerId)` — a player absent from a box score that *did* arrive. Arguably
  should void too (the NFL arm does), but it is a different condition with a different failure mode
  and it belongs to its own change with its own review. Note it, do not fix it.
- The value-comparison branches (`if (completed || snapshot.finalized) return miss`). Those are real
  misses.

**The three `mlb_webhook_*` resolvers are NOT part of this phase, and this is the important
constraint.** They look similar but are structurally different (`lib/sportsBingo.ts:9263-9296`):
they take no snapshot, they read `resolver.currentCount ?? 0`, and the count is only ever
incremented by the live webhook stream. **A team that genuinely recorded zero and a team whose
webhook never fired are the same value.** There is no observability flag to branch on, so this
cannot be fixed by changing a status word — it needs `currentCount` to become nullable (or gain a
companion `observed` flag) through the whole webhook ingestion path, plus a migration for existing
rows. That is its own project.

Worth knowing while scoping it: **42 of the 108 mis-settled squares are `mlb_webhook_team_event_at_least`
sitting at `currentCount: 0`**, and Phase 6 of the MLB plan explicitly could not verify that the live
webhook stream ever calls the ingestion functions at all. Those two facts together are decent
evidence the MLB webhook stream has **never** delivered an event on a real card. Confirm that
before building anything on top of it.

### Also note, do not fix

`case "player_prop"`'s support gate (`lib/sportsBingo.ts:~8876`) returns a flat `miss` for an
unsupported `marketKey` on **both** NBA and MLB, while the NFL arm voids the identical condition
fourteen lines above. R3 of the MLB plan fixed MLB's three missing-data positions but not this
fourth one, so "MLB player props void on missing data" is not yet true without qualification. Inert
today (zero `player_prop` squares exist anywhere in production). Mention it in the as-built; leave
the code alone.

### Historical rows — Andrew's call, presented not chosen

The 108 existing rows are `miss` where the rule says `void`. **No card outcome changes** — all 14
are `lost`, and `boardStatusesMakeALine` treats a void as a non-hit, so a fully-voided board makes
no line either. No points, prizes or leaderboard positions move.

1. **Forward fix only** (this phase). The count stops growing.
2. **Forward fix + backfill.** One `UPDATE` over 108 rows scoped to the affected kinds. Cheap, makes
   the record honest, moves nothing economic.
3. **Leave it.**

**Do not write the backfill until Andrew has picked.** If he picks 2, it is a new timestamped
migration under `supabase/migrations/` (creating one is allowed and expected; never edit an existing
one) — and it must be scoped by resolver kind AND `status = 'miss'` AND card sport, not a blanket
status rewrite.

### Tests — must be proven failing first

New file `tests/lib.sportsBingo.missing-data-voids.test.ts`, wired into **both** `test:bingo-nfl` and
`test:bingo-mlb` in `package.json` (it covers the shared arm).

1. **The regression that reproduces production.** Build the exact `effectiveScore` shape
   `refreshSportsBingoProgress` synthesizes — `homeScore: null, awayScore: null, completed: true` —
   pass it to `evaluateResolver` with `nbaStatsSnapshot: null`, and assert `void` for a
   representative sample across the 21 kinds (a player kind, a team kind, a quarter kind, a
   halftime kind). This test fails on today's code with `miss`.
2. **The consistency property, which is the real point.** For that same snapshot, assert that a
   market resolver and a stats resolver on the same card agree — neither returns `miss`. This is the
   test that would have caught the bug in the first place, and it is worth more than the 21
   individual assertions.
3. **No over-reach.** A snapshot that *is* present, with the player genuinely below the threshold at
   Final, still returns `miss`. Guards against a global find-and-replace.
4. **Regrade still reachable.** A square that voids under (1) is `isResolverEligibleForVoidRegrade`,
   so the reopen path in `refreshSportsBingoProgress` can pick it up.

**Proving them fail:** run the new file against the unmodified `lib/sportsBingo.ts` and capture the
output in the as-built. Then edit. To re-prove after the fact, invert your own lines by hand.

### Gate

Same five commands as Phase 1. `test:bingo-mlb` and `test:bingo-nfl` both grow by the new file.

---

## Phase 3 — Remove WNBA from Sports Bingo

**Model:** Sonnet 5 · **Effort:** Low-Medium (~1.5 hrs).
**Read the "Phase 7's Finding 3 was wrong" section at the top of this document before starting, and
confirm with Andrew that removal is still what he wants.**

### Two hard constraints

**1. Scope is Sports Bingo only. WNBA stays everywhere else.** `basketball_wnba` is referenced by
several unrelated features and none of them may be touched:

```
lib/fantasy.ts                       components/fantasy/FantasyHome.tsx      <- Fantasy
lib/pickem.ts                        lib/hooks/useLivePlayerStats.ts         <- Pick'em / live stats
lib/leagueSeasonStatus.ts            scripts/backfill-jersey-numbers.cjs     <- shared / ops
.github/workflows/headshots-weekly.yml                                       <- headshot sync
```

A grep-and-delete across `basketball_wnba` will break Fantasy and Pick'em. Work from the Bingo
surfaces named below, not from a global search.

**2. Removal must be one-commit reversible.** Given the finding at the top of this document, the
odds of "actually, repair it instead" are not negligible. Prefer disabling over deleting: keep the
league entries in place and mark them unsupported rather than ripping the rows out and losing the
labels, icons and season config that a repair would need back.

### Do this

**3a — the two league lists.** These are deliberately *not* shared code; the route is the source of
truth and the component holds a static fallback used when the route errors. Both must change or the
fallback will re-enable WNBA on any API blip.

- `app/api/bingo/leagues/route.ts` — `LEAGUES` (~line 12). Give WNBA a status the client already
  understands. **`coming_soon` is the wrong word for a league being withdrawn**; add a distinct
  `unsupported` status with a plain note rather than lying to the player. NFL's existing
  `coming_soon` branch a few lines below is the pattern to copy, including its comment explaining
  why it is distinct from `out_of_season`.
- `components/bingo/SportsBingoSelectSport.tsx` — `enabled: true` → `enabled: false` on line 19, with
  a `note`. Confirm the disabled-tile branch (~line 105-128) renders the note and blocks the
  `router.push`; it already does for NFL, so this should need no new UI.

**3b — refuse it server-side too.** A disabled tile is a UI gate, and `/bingo/select-game?sportKey=…`
is reachable by typing a URL. Find the card-creation and game-catalog entry points (start from
`app/api/bingo/games/route.ts` and `app/api/bingo/cards/route.ts`) and reject `basketball_wnba` with
a clear error. Do this in **one** place if the two share a resolver; do not scatter the check.

**3c — check for in-flight cards before shipping.** Query `sports_bingo_cards` for
`sport_key = 'basketball_wnba' AND status = 'active'`. **As of 2026-08-18 the answer is zero** (all 6
WNBA cards are `lost`), so there is nothing to drain — but it is WNBA season, so re-check rather than
assume. If any are active, they must be allowed to settle normally; do not cancel them and do not
remove the settlement path for an existing card. Removal is about *creation*, not *settlement*.

**3d — leave the settlement and snapshot code alone.** `basketballApiPrefixForSportKey`, the WNBA
branches in `refreshSportsBingoProgress`, `WNBA_CALIBRATION` (`lib/sportsBingo.ts:182-190`), and the
Phase 7 follow-up's `status_state` / flat-score handling all stay. Reasons: historical cards still
render; the code is shared with NBA and correct; and it is exactly what a repair would need back.
Deleting it buys nothing and costs the reversibility this phase is designed for.

**3e — the webhook route.** `app/api/webhooks/balldontlie/route.ts` and `lib/webhooks/balldontlie.ts`
branch on `basketball_wnba`. Leave them functional — they serve existing cards and other features.
Check whether they *create* anything; if so, that creation is in scope, the rest is not.

### Tests

`tests/components.bingo.SportsBingoSelectSport.test.ts` already exists (currently untracked, from a
parallel workstream — **rebase onto it rather than overwriting it**). Add:

1. WNBA renders disabled with its note, and clicking it does not navigate.
2. The static fallback list (route errored) also renders WNBA disabled — this is the one that
   actually protects you.
3. `tests/api.bingo.leagues.test.ts` — the route returns WNBA with the new status.
4. A server-side rejection test for 3b: a card-creation request with `sportKey=basketball_wnba` is
   refused.

`tests/lib.sportsBingo.wnba-row-shape.test.ts` **stays and must keep passing** — it covers the
Phase 7 follow-up's row-shape fixes, which serve historical cards and are unrelated to whether new
cards can be created.

### Gate

Same five commands, plus:

```
npm run test:pwa-contract      # the bingo board is a PWA surface; cheap insurance
```

---

## Sequencing

```
1 ──┐
2 ──┼──> all three are independent; land in any order
3 ──┘
```

They touch disjoint code. Phase 1 is `lib/mlbTeamEventRates.ts` + a script; Phase 2 is one function
in `lib/sportsBingo.ts`; Phase 3 is API routes and a component. **Suggested order: 2 → 1 → 3.**
Phase 2 is the player-facing correctness fix and the only one with a production footprint. Phase 1
needs API budget. Phase 3 needs a decision from Andrew first.

**If two of these land in the same session, commit between them.** They are separately reviewable
and `lib/sportsBingo.ts` has already lost a day's work once to a mixed uncommitted diff.

## Gate commands

```
npx tsc --noEmit
npm run lint
npm run test:bingo-nfl     # 244 at time of writing
npm run test:bingo-mlb     # 123 at time of writing
npm run test               # 1859 passing / 13 skipped / 0 failing
```

**Every phase here changes behavior, so every phase needs a test proven to fail against the pre-fix
code.** None of the three qualifies for the instrument exemption the MLB plan's Phases 1, 4a, 5 and 7
took.

## Standing rules inherited from the 2026-08-18 incident

**Never use `git checkout -- <file>` / `git restore <file>` to undo an edit you just made.** It
resets the file to `HEAD` and discards *all* uncommitted changes in it, not just yours.
`lib/sportsBingo.ts` routinely carries large amounts of uncommitted multi-phase work; that is what
made the loss expensive. To prove a test fails pre-fix, invert your own lines by hand and re-apply
them. If you must, `git diff -- <file> > scratch.diff` first.

**Commit production fixes promptly.** Do not let a finished phase sit uncommitted while you start the
next one.

**Nothing is verified until it has been run against the live feed.** This plan family exists because
five separate defects survived by having their row shapes assumed from a sibling league. Any phase
that asserts a field name re-probes it in the same session, and any phase that reports success says
plainly which half of the path it exercised — generation, settlement, or both.

## Branch state

All of this sits downstream of `restore/mlb-bingo-r1`, which as of 2026-08-18 carries **eight**
production-affecting changes and has never been merged to `main`. The merge decision is still open
and still Andrew's. Whoever picks up Phase 2 in particular should ask again — that is a player-facing
correctness fix and it does nobody any good sitting on an unmerged branch.
