# Prop Bingo — Code Review Fix Plan

Source: `/code-review` of the working-tree diff (Prop Bingo NFL/MLB phase set), 2026-08-17.
14 findings. Typecheck passed and `npm run test:bingo-nfl` was green (200 tests) against **all
14 of these bugs** — so each phase below needs new tests or it isn't done.

Ordered by blast radius: gating correctness → grading substrate → grading precision → cost/hygiene.

---

## Phase 1 — Input normalization + season-gate hygiene
**Findings:** untrimmed `sportKey` bypasses the league gate; raw sportKey reflected into a
player-facing error; `mlb-star-index 2.json` duplicate.
**Files:** `app/api/bingo/cards/route.ts` (~92, ~119), `lib/leagueSeasonStatus.ts` (~48), `data/sports-bingo/`

- Normalize `sportKey` once at the route boundary (trim + lowercase); pass the normalized value
  to both `resolveLeagueBlockReason` and the board builders, for both `generate` and `play`.
  Today `/api/bingo/games` trims but the cards route does not, so ` americanfootball_nfl`
  defeats the NFL activation flag and season gating.
- Add a display-name lookup keyed off the same table as `LEAGUE_SEASON_WINDOWS` so the rejection
  message never echoes caller-supplied input (`SportsBingoSelectBoard` renders `payload.error` verbatim).
- Delete the 589 KB byte-identical duplicate `data/sports-bingo/mlb-star-index 2.json` (mode 600, unreferenced).

**Model:** Sonnet 5 · **Effort:** Low (~30 min). Mechanical, tightly scoped, high-value security fix.
Regression test: `" americanfootball_nfl"` is blocked when `NEXT_PUBLIC_BINGO_NFL_ENABLED` is off.

---

## Phase 2 — The `start_date`/`end_date` grading substrate
**Findings:** `getNFLGameStatsSnapshot` and `getScoresBySportKey` still send `start_date`/`end_date`
to `/nfl/v1/games` and `/mlb/v1/games` — the exact params this same diff documents as silently
ignored (returns oldest archive rows, 2002 for NFL).
**Files:** `lib/sportsBingo.ts:3059`, `lib/sportsBingo.ts:9943`

This phase decides whether NFL Prop Bingo functions at all. With the snapshot null for every card,
every NFL square stays pending and voids at `BINGO_FORCE_FINALIZE_AFTER_START_MS`; NFL also has no
fallback score source, since `toNFLLiveScoreSnapshot` depends on the same broken snapshot.

- Convert both call sites to `buildBallDontLieDatesQuery`'s `dates[]` form, matching the MLB
  conversion already done at `lib/sportsBingo.ts:2464`.
- `getScoresBySportKey` is shared across leagues — verify the MLB path still resolves after the change.

**Before coding:** confirm empirically against live balldontlie that `dates[]` returns the intended
games for both endpoints. No test proves this either way today (the suite emits 401s). Needs a working API key.

**Model:** Opus 5 · **Effort:** Medium-high. Little code, but load-bearing, and needs live-endpoint
verification plus a fixture-backed test that would have caught it.

**Risk gate:** if `dates[]` does *not* fix the NFL snapshot, the whole Phase 4 grading substrate needs
a different data source — a materially larger project than this plan covers. Verify before committing
to the rest of the sequence.

---

## Phase 3 — Truncation and settlement-confidence bugs
**Findings:** plays walk drops the truncation flag; partial quarter breakdown → phantom shutout +
phantom overtime; safety inferred from a bare +2 delta; perfect-red-zone grades on a signal its
own complement documents as unreliable mid-game.
**Files:** `lib/sportsBingo.ts` — plays fetch ~3082, `buildNFLPlayDerivedFacts` ~2968,
quarter guard ~2591, red-zone squares ~9143

All four are one class of bug: a confident `hit`/`miss` settled on data that is absent, partial, or
ambiguous — and **settled squares are never reopened by the regrade path.** Rule to apply uniformly:
*when the source signal is incomplete, `void`, never grade.*

- Wire `{ truncation }` through the plays fetch (`fetchBallDontLieList` already supports it — used by
  the odds fetch). If truncated, mark play-derived facts `available: false` so Tier-3 / Optional-3b
  void rather than miss. The 4-page/400-row cap is reachable in OT or penalty-heavy games.
- Change the quarter guard from "all eight columns null" to per-quarter presence. A null quarter at
  Final voids that quarter's squares and **must not feed `regulationSum`** — that shortfall is what
  manufactures the false `wentToOvertime` hit.
- Stop inferring safety from a +2 delta; require a play-type signal, or void both `sawSafety` and
  `sawTwoPointConversion` when only deltas are available. A TD row (+6) followed by a separate
  2pt row (+2) currently grades as a safety.
- Make `nfl_team_perfect_red_zone` wait for Final, matching its declared complement
  `nfl_team_red_zone_trip_without_touchdown`. The two are mutually exclusive yet grade on opposite
  reliability assumptions.

**Model:** Opus 5 · **Effort:** High. Four interacting grading paths, each needing a fixture test
(partial breakdown, truncated plays, TD-then-2pt sequence, mid-drive red zone). Highest reasoning
density in the set — correct behavior is a judgment call per square.

---

## Phase 4 — Env-var kill switches
**Finding:** `parseInt(env) || 3` makes the documented kill value `0` falsily become `3`.
**Files:** `lib/sportsBingo.ts:3928` (`NFL_TIER1_MAX_SQUARES_PER_BOARD`) and sibling
`NFL_TIER1_MAX_SQUARES_PER_TEAM`

`BINGO_NFL_TIER1_MAX_PER_BOARD=0` silently stays at 3; the `Math.max(0, …)` wrapper shows 0 was
meant to be reachable. Replace with a parse helper that falls back only on `NaN`.

**Model:** Sonnet 5 · **Effort:** Low. Grep the file for the same `|| default` shape on other numeric
env reads first — the sweep is the actual work.

---

## Phase 5 — Request-volume and caching
**Findings:** `hasUpcomingGamesInWindow` issues 15 sequential day requests (→ up to 60 per picker
load across 4 leagues); MLB prop fallback runs twice per game; star tiers recomputed on all 180 board
attempts; failed fetches cached as successful empty results.
**Files:** `lib/sportsBingo.ts` 1099 / 3857 / 6288 / 6597, `lib/sportsBingoNflStars.ts:508`

- Collapse `hasUpcomingGamesInWindow` onto one `dates[]` request (`buildBallDontLieDatesQuery`, ~1323).
- Drop the duplicate `buildMLBPlayerPropCandidatesFromRecentStats` call at 3857 — the fallback at
  3851 already returns it. Each run is ~10–20 uncached requests.
- Hoist the star-tier maps (`buildMLBStarTiers` / `buildNFLStarTiers`, both O(n²) via
  `assignNFLStarTiers`/`assignMLBStarTiers`) into `generateBoardForGame`; thread through `options`.
  Pure refactor — output must be identical, so lock it in with a before/after board-generation snapshot test.
- **Cache-failure semantics is correctness, not perf:** `fetchNFLSeasonStats` swallows errors and
  returns `[]`, which `resolveNFLStarIndex` stores for 24h; `hasUpcomingGamesInWindow` caches a
  failure-derived `false` for 6h. Distinguish "provider said empty" from "provider failed," cache only
  the former at full TTL, and give failures a short negative TTL (~5 min).

**Model:** Opus 5 for the tier hoist and the cache-failure semantics; Sonnet 5 suffices for the two
request-count fixes · **Effort:** Medium.

---

## Phase 6 — Picker copy correctness
**Finding:** a not-yet-activated NFL is reported as `out_of_season` with `resumesLabel: "Coming soon"`,
which the picker renders as "Out of season · Coming soon".
**Files:** `app/api/bingo/leagues/route.ts:27`, `components/bingo/SportsBingoSelectSport.tsx`

Contradicts `.env.example` ("Off = NFL reads 'Coming soon' in the picker") and misstates the reason —
NFL is in season in September; it's the flag that's off. Add a distinct `coming_soon` status, or a
`note` field the client renders verbatim, so the two stay in sync.

**Model:** Sonnet 5 · **Effort:** Low.

---

## Sequencing

- Phases **1, 4, 6** are independent — reasonable to batch into one commit.
- **Phase 2 must land before Phase 3 is verifiable.** With the snapshot null for every card, no
  grading test exercises real data.
- **Phase 5 after Phase 3** — the tier hoist touches `pickCandidateSet`, in the same region of
  `lib/sportsBingo.ts` as the grading edits.

Gate each phase on `npx tsc --noEmit`, `npm run lint`, `npm run test:bingo-nfl`.
Phases 2 and 3 need balldontlie fixtures under `tests/fixtures/` reproducing the failing shapes.

---

## Phase 1 — done (2026-08-17)

All three findings fixed, gates green (`tsc --noEmit`, `npm run lint`, `npm run test:bingo-nfl` — 201
tests, was 200; new tests are net additions, nothing removed):

- **`sportKey` normalization:** [app/api/bingo/cards/route.ts](../app/api/bingo/cards/route.ts) now
  does `.trim().toLowerCase()` on `sportKey` in both the `generate` and `play` branches, before it
  reaches `rejectIfLeagueUnavailable` / `generateSportsBingoBoard` / `createSportsBingoCard`.
  [app/api/bingo/games/route.ts](../app/api/bingo/games/route.ts) already trimmed; added
  `.toLowerCase()` there too so all three entry points normalize identically.
- **Display-name lookup:** [lib/leagueSeasonStatus.ts](../lib/leagueSeasonStatus.ts) gained a
  `LEAGUE_DISPLAY_NAMES` map (same keys as `LEAGUE_SEASON_WINDOWS`) and `displayNameForLeague()`.
  `resolveLeagueBlockReason`'s out-of-season message now reads `"NBA is out of season..."` etc.
  instead of echoing the raw `sportKey`. Unknown keys fall back to `"This league"` (fails safe,
  never reachable in practice since callers only ever pass keys from `LEAGUE_SEASON_WINDOWS`).
- **Duplicate file:** `data/sports-bingo/mlb-star-index 2.json` deleted (was mode 600,
  byte-identical, unreferenced).
- **New regression tests:**
  [tests/api.bingo.cards.test.ts](../tests/api.bingo.cards.test.ts) — two new tests confirming
  `" AmericanFootball_NFL "` (leading space + mixed case) is blocked by the NFL flag on both
  `generate` and `play`, and that the mocked board/card builders are never called.
  [tests/lib.league-availability.test.ts](../tests/lib.league-availability.test.ts) — one new test
  confirming the out-of-season message for `baseball_mlb` contains `"MLB is out of season"` and
  never contains the raw string `"baseball_mlb"`.
- **Not touched:** `resolveLeagueSeasonStatus` (lib/leagueSeasonStatus.ts) itself — it receives the
  already-normalized `sportKey` from `resolveLeagueBlockReason`'s caller, so no change was needed
  there. `LEAGUE_SEASON_WINDOWS` keys were already lowercase, so normalization doesn't change any
  existing lookup behavior for basketball_nba / basketball_wnba / baseball_mlb / americanfootball_nfl.

### Handoff to Phase 2

Phase 2 is the load-bearing one: **it decides whether NFL Prop Bingo functions at all.** Nothing in
Phase 1 touches `lib/sportsBingo.ts`'s grading/snapshot code, so Phase 2 starts clean against
current `main`-plus-this-diff.

What Phase 2 needs to do, concretely:
- Two call sites in `lib/sportsBingo.ts` — `getNFLGameStatsSnapshot` (~line 3059, may have shifted
  slightly since Phase 1 didn't touch this file) and `getScoresBySportKey` (~line 9943) — still
  build `start_date`/`end_date` query params for `/nfl/v1/games` and `/mlb/v1/games`. Convert both
  to `buildBallDontLieDatesQuery`'s `dates[]` form, the same conversion already applied at
  `lib/sportsBingo.ts:2464` for the MLB path. Read that existing call site first — it's the pattern
  to replicate exactly, not reinvent.
- `getScoresBySportKey` is shared across leagues (NBA/WNBA/MLB/NFL) — after converting, verify with
  a fixture test that the non-NFL paths (especially MLB, which may already partially rely on
  `dates[]` elsewhere) still resolve correctly. Don't let an NFL-focused fix silently regress MLB.
- **Before writing any fix code:** the plan calls for confirming empirically against the live
  balldontlie API that `dates[]` actually returns the intended games for both `/nfl/v1/games` and
  `/mlb/v1/games`. This needs a working API key (today's test suite hits 401s — see the
  `[BallDontLie] Request failed (401)` noise in the `nfl-star-index-freshness` test during this
  session's `test:bingo-nfl` run, which is expected/pre-existing, not something Phase 1 caused).
  If a key isn't available, flag that explicitly rather than guessing at the fix and shipping it
  unverified — the plan's own risk gate says if `dates[]` doesn't fix the NFL snapshot, Phase 4's
  grading substrate needs a materially different, larger redesign than this plan covers.
- Add a fixture-backed test under `tests/fixtures/` reproducing the current failing shape (params
  silently ignored → oldest archive rows, e.g. 2002 for NFL) so the bug is provable before/after.
- Model guidance from the plan: Opus 5, medium-high effort — small diff, but every downstream
  Phase 3 grading fixture depends on this snapshot actually returning real games.

---

## Phase 2 — done (2026-08-17)

Both call sites converted to `dates[]`. Gates green: `npx tsc --noEmit`, `npm run lint`,
`npm run test:bingo-nfl` (**209 tests**, was 201 — the 8 new ones are net additions),
`npm run test:bingo-mlb` (76), plus `api.cron.bingo-progress` / `api.bingo.*` (28).

### Empirical verification (the plan's risk gate) — `dates[]` DOES fix it

Probed the live balldontlie API with the real key via the repo's `node --env-file=.env.local`
convention (same as `scripts/probe-nfl-bingo.cjs`; the key was never read or printed). Every
`/games` endpoint `getScoresBySportKey` touches, one 5-day window, both param forms:

| endpoint | `start_date`/`end_date` | `dates[]` |
| --- | --- | --- |
| `/nfl/v1/games` (2025-11-06..10) | 100 rows, **all 2002**, 0 in window | 13 rows, **all in window**, season 2025 |
| `/mlb/v1/games` (2026-08-13..17) | 100 rows, **all 2000 spring training**, 0 in window | 64 rows, **all in window** |
| `/nba/v1/games` | 38 rows, all in window | 38 rows, all in window — **identical** |
| `/wnba/v1/games` | 14 rows, all in window | 14 rows — **identical** |
| `/nhl/v1/games` | 100 rows, season 2024 (archive) | 42 rows, correct `game_date` — **only `dates[]` works** |
| `/epl/v1/games` | 100 rows, season 1992 | 100 rows, season **1992** — *neither* form works |
| `/mls`,`/laliga`,`/seriea`,`/bundesliga`,`/ucl` | HTTP 404 | HTTP 404 |

**Risk gate cleared:** `dates[]` returns the intended NFL games. Phase 3's grading substrate is
sound; no alternate data source is needed.

### Changes

- **`lib/sportsBingo.ts` `getNFLGameStatsSnapshot` (~3055):** the hand-rolled
  `{ per_page, start_date, end_date }` query is now
  `buildBallDontLieDatesQuery(startsAt - lookbackMs, startsAt + lookbackMs)` — byte-for-byte the
  pattern already used by `getMLBGamePlayerStatsSnapshot` at ~2464. Same UTC day-window semantics
  (`dayKeysForWindow` truncates with `getUTC*` exactly as the old `.toISOString().slice(0,10)` did),
  so the requested window is unchanged; only the param name is.
- **`lib/sportsBingo.ts` `getScoresBySportKey` (~9940):** same conversion over its
  `now-3d .. now+1d` window. Both sites carry a comment naming the failure mode so the next reader
  doesn't "simplify" it back.
- **`toIsoDate` is still used** (the basketball snapshot at ~2223 and the basketball
  `/stats` historical query at ~4492) — not dead, left alone.

### New test: `tests/lib.sportsBingo.balldontlie-date-params.test.ts` (8 tests, added to `test:bingo-nfl`)

The reason 200 green tests never caught this: **every other balldontlie test stubs `fetch` with a
URL-*substring* match and ignores the query string entirely** (see `installFetchMock` in
`tests/lib.sportsBingo.nfl-settlement.test.ts:190`). Sending the wrong params is invisible to them.

The new double is **param-faithful** — it reproduces the live filtering semantics per endpoint:
`/nfl/v1/games` and `/mlb/v1/games` honour `dates[]` and, given only the range form, hand back
`tests/fixtures/balldontlie-date-range-ignored.json`; `/nba/v1/games` honours both. That fixture is
**real captured output** — the actual 2002 NFL / 2000 MLB rows the live API returned for a
2025/2026 window on 2026-08-17.

Coverage: the archive fixture reproduces the failing shape and matches no card · `/nfl/v1/games` is
queried with `dates[]` and never `start_date`/`end_date` · the NFL snapshot resolves so squares
settle hit/miss instead of hanging pending · the legacy form provably returns nothing a card can
match · basketball still settles · `/mlb/v1/games` uses `dates[]` from **both** its call sites ·
replaying the emitted MLB query selects today's game, not the 2000 archive.

**Verified the tests fail without the fix:** reverted both call sites, re-ran — **5 of 8 failed**,
including "NFL squares settle instead of hanging pending." Then restored.

### Two things found while verifying — NOT fixed, NOT in the 14 findings

1. **`getScoresBySportKey` cannot parse MLB, NHL, or soccer rows at all.** It reads
   `event.visitor_team?.full_name ?? event.visitor_team?.name` and `event.home_team_score`. Live
   `/mlb/v1/games` rows have **`away_team`** (no `visitor_team`), **`display_name`** (no
   `full_name`), and **`home_team_data.runs`** (no `home_team_score`) — so `awayTeam` is empty and
   every row hits the `continue`. NHL is the same shape (`away_team`, `home_score`). This is
   **pre-existing and unchanged by Phase 2** — those rows were dropped before the conversion and are
   dropped after it. MLB is unaffected in practice because its real score path is
   `toMLBLiveScoreSnapshot` off `getMLBGamePlayerStatsSnapshot`, which already used `dates[]`.
   **NFL rows parse fine** (`visitor_team` + `full_name` + `home_team_score` + `status: "Final"`),
   so this phase gives NFL a *second*, working score source independent of
   `getNFLGameStatsSnapshot` — which matters for Phase 3, where a square can now be graded off the
   score even when the box score is incomplete.
2. **`/epl/v1/games` honours neither param** (returns season-1992 rows either way), and
   `/mls`, `/laliga`, `/seriea`, `/bundesliga`, `/ucl` all **404**. Six of the eleven league paths
   in `getScoresBySportKey`'s table are dead. No regression from this phase; worth its own ticket.

### Known flake (pre-existing, unrelated)

`tests/lib.sportsBingo.nfl-star-tilt.test.ts` → "stops tilting when the tier boosts are turned off"
fails intermittently. It draws 30 random boards with no seed and asserts a fixed
`flatWeights < boosted - 0.08` margin (line ~358). Reproduced failing *and* passing in isolation.
`npm run test:bingo-nfl` was run three more times end-to-end: **209/209 green each time.** Don't
chase it as a Phase 2 regression — nothing here touches board generation.

### Handoff to Phase 3

Phase 3 is the big one: four interacting truncation/settlement-confidence bugs, all instances of
*a confident `hit`/`miss` settled on data that is absent, partial, or ambiguous* — and **settled
squares are never reopened by the regrade path**, so a wrong settle is permanent. The uniform rule:
**when the source signal is incomplete, `void`, never grade.**

What Phase 3 inherits from Phase 2:
- **The snapshot now actually resolves.** Before this phase every NFL grading test was, in effect,
  testing the null-snapshot path. Re-read any Phase 3 assumption that was formed against
  pre-Phase-2 behavior.
- **A param-faithful fetch double already exists** in
  `tests/lib.sportsBingo.balldontlie-date-params.test.ts` — copy its `serveDateIgnoringGames` /
  `installProviderDouble` shape for the new fixtures rather than the substring-matching
  `installFetchMock` in the settlement test, which is what let this class of bug hide. The supabase
  in-memory double at the top of both files is the same code; if Phase 3 adds a third copy,
  extracting it to `tests/helpers/` is justified at that point (two copies was not).
- **`tests/fixtures/` now holds** `balldontlie-date-range-ignored.json` alongside the existing
  `nfl-completed-games-2025.json`, `nfl-player-stats-2025.json`, `nfl-team-stats-2025.json`,
  `mlb-completed-games-2026.json`. Phase 3 needs four more shapes: a **partial quarter breakdown**
  (some `*_q*` columns null at Final), a **truncated plays walk** (>400 rows / 4 pages), a
  **TD-then-2pt sequence** (+6 row followed by a separate +2 row, which today grades as a safety),
  and a **mid-drive red zone** state.
- **The API key works and probing is cheap.** `node --env-file=.env.local scripts/probe-nfl-bingo.cjs`
  is the established convention; write throwaway probes to the scratchpad, never print the key.
  Capture real response shapes into `tests/fixtures/` rather than hand-authoring them — the whole
  reason this bug survived 200 tests is that hand-authored doubles agreed with the code instead of
  with the provider.

The four Phase 3 edits, with current line numbers (they shifted ~+2 from the plan's estimates):
`lib/sportsBingo.ts` plays fetch ~3082 (wire `{ truncation }` — `fetchBallDontLieList` already
supports it, see the odds fetch), `buildNFLPlayDerivedFacts` ~2968 (safety vs. 2pt inference),
the quarter guard ~2591 (per-quarter presence; a null quarter must **not** feed `regulationSum`,
which is what manufactures the phantom `wentToOvertime` hit), and `nfl_team_perfect_red_zone`
~9143 (make it wait for Final, matching its declared complement
`nfl_team_red_zone_trip_without_touchdown`).

Gate on `npx tsc --noEmit`, `npm run lint`, `npm run test:bingo-nfl`, `npm run test:bingo-mlb`.

---

## Phase 3 — done (2026-08-17)

All four findings fixed. Gates green: `npx tsc --noEmit`, `npm run lint`,
`npm run test:bingo-nfl` (**224 tests**, was 209 — 15 net-new, nothing removed; see the flake note
at the end before reading a red run as a regression),
`npm run test:bingo-mlb` (76), `api.cron.bingo-progress` + `api.bingo.*` (22).

**Every one of the four new tests was verified to fail against the pre-fix code** (reverted all
four edits, re-ran: 4 failed / 11 passed, one failure per finding, each reproducing the exact
defect — phantom overtime `hit`, three play squares `miss` on a truncated walk, safety `hit` on a
+6-then-+2 sequence, red-zone `miss` mid-drive — then restored).

### The uniform rule, as implemented

*When the source signal is incomplete, `void`, never grade.* Worth knowing why that is safe here:
**every square kind Phase 3 can newly void is already in `isResolverEligibleForVoidRegrade`**
(`lib/sportsBingo.ts` ~9653). A void is re-evaluated on each later refresh and reopened to `pending`
if the feed catches up, so "void" means "not yet answerable", not "written off" — right up until
settlement or `BINGO_FORCE_FINALIZE_AFTER_START_MS`. A void does block its line (it counts as a
non-hit in `computeCardSignals`), which is the accepted cost.

### 1. Per-quarter presence, not "all eight columns null"

`buildNFLQuarterScores` (~2577) no longer asks "is the whole breakdown missing"; it asks, per side,
**does the row add up**. `NFLQuarterScores` gained `homeKnown` / `awayKnown` (4 booleans each), and
`nflQuarterPoints` returns `null` — not a zero — for an unknown quarter.

- sum(quarters) + ot **=== total** → every column including the `null`s is accounted for, so the
  nulls are real shutout quarters (this is BDL's actual encoding: **64 of 64 real 2025 games
  reconciled exactly**, so healthy data grades exactly as before);
- sum **< total** → points sit in some quarter the provider did not publish and the row does not say
  which, so that side's `null`s become unknown while its populated columns stand;
- sum **> total** → internally contradictory, trust none of that side's columns.

Every square that settled off "the game is over, so absence is evidence of absence" now also checks
`nflRegulationQuartersKnown(quarters, side | "both")`: `nfl_team_scores_every_quarter`,
`nfl_team_shutout_quarter`, `nfl_team_quarter_points_at_least`, `nfl_any_quarter_scoreless`,
`nfl_second_half_higher_scoring`. `nflHalftimeScore` propagates `null` instead of `?? 0`-ing an
unknown quarter into a zero (which is what let `nfl_second_half_higher_scoring` understate the bar
the second half had to clear — a phantom *hit*, not a phantom miss).

**`wentToOvertime` is now `boolean | null`.** The old `scoredBeyondRegulation` tell — total greater
than the regulation sum — cannot distinguish "overtime whose `*_ot` column was not published" from
"a regulation quarter that was not published", and it resolved that ambiguity as a **hit**. It is
`null` now, and `nfl_overtime` voids on `null`. Genuine overtime is unaffected: an `*_ot` column or
an overtime status string still settles it `true`.

### 2. Truncated plays walk

`getNFLGameStatsSnapshot` passes `{ truncation }` into the `/nfl/v1/plays` fetch (the option
`fetchBallDontLieList` already had, used by the odds fetch) and **discards the walk entirely when it
hit the page cap** — `playFacts` stays `EMPTY_NFL_PLAY_FACTS`, i.e. `available: false`, so every
Tier-3 / Optional-3b square voids instead of missing. Each of those squares settles its miss on
"this never happened in the whole game", which a partial walk cannot assert.

Measured live: 46 real 2025 games ran **163–197 plays**, so the 4-page/400-row cap is ~2x headroom
and this fires only on the duplicated-row corruption the walk already documents. The conservative
cost is that a truncated walk voids squares whose *hit* was already visible in the pages fetched;
that trade is deliberate and matches the plan's instruction.

### 3. Safety vs. two-point conversion

A bare +2 no longer implies a safety. `buildNFLPlayDerivedFacts` now needs a **delta of 2 and a
play-type signal** (`isNFLSafetyPlay`); a +2 with a successful two-point signal
(`isNFLTwoPointConversionPlay`) credits the two-point square instead; and a +2 nothing types sets
**both** `sawSafety` and `sawTwoPointConversion` to `null` (unless already `true`), which
`nflPlayFlagOutcome` voids at Final. `+8` on one row still means a touchdown plus a successful try —
no other combination of scoring plays lands on a single row.

Both facts are `boolean | null` on `NFLPlayDerivedFacts`, and the two graders now share
`nflPlayFlagOutcome(flag, completed, snapshot)`: `true` hits immediately, `false` misses only once
the game is over, `null` voids.

**Two things the live probe changed about the intended fix:**
- A successful two-point conversion is **folded into its touchdown row** (+8, `passing-touchdown`,
  `short_text` "… for Two-Point Conversion"); a failed one reads "(Two-Point Pass Conversion
  Failed)" on a +6. So the failure wording has to be excluded explicitly or every failed try grades
  as a hit.
- **The feed types nullified safeties `"safety"` too.** Of three safety-typed rows in 46 games, one
  reads `"SAFETY NULLIFIED by Penalty"` in its `text` and moved the score by 0. So typing alone is
  not sufficient — the +2 is still required. (This killed the more permissive first cut of the fix,
  which credited a safety off the slug regardless of the delta.) The long `text` field is
  deliberately never scanned: it carries "safety" as a *position*.

### 4. `nfl_team_perfect_red_zone` waits for Final

Dropped its early `attempts > scores → miss`. Its declared complement
`nfl_team_red_zone_trip_without_touchdown` documents that `red_zone_attempts` increments on
*entering* the red zone, before the trip resolves — so mid-drive, `attempts > scores` is a drive in
progress, not a failed trip. The two squares are mutually exclusive and now grade on the same
reliability assumption.

### New tests: `tests/lib.sportsBingo.nfl-settlement-confidence.test.ts` (15 tests)

Added to `test:bingo-nfl`. Fixture: **`tests/fixtures/nfl-settlement-confidence.json`, real captured
balldontlie output** — a real Final `/nfl/v1/games` row (Bengals 24, Lions 37, 2025 week 5, whose
`home_team_q1`/`home_team_q3` are `null` for genuine shutout quarters and which adds up), plus seven
verbatim `/nfl/v1/plays` rows (the scoring safety, the penalty-typed safety, the nullified safety,
a +6 touchdown with a failed two-point try, a +8 touchdown with a successful one, a +7 touchdown,
and an ordinary rush). Only `home_score`/`away_score` are re-chained in the tests, so rows captured
from four different games can sit in one walk; every slug and every piece of prose is untouched.

The partial-breakdown test is the same real row **with `home_team_q4` dropped** — before/after on
one column, which is a far stronger statement than a hand-authored "broken" row.

The provider double here **paginates** (`meta.next_cursor`), which is the only way to exercise the
truncation flag; the substring-matching doubles elsewhere in the suite cannot.

`tests/helpers/bingoSupabaseDouble.ts` is new: the in-memory `supabaseAdmin` double had been copied
byte-identically into three test files and this phase needed a fourth, which is the point Phase 2's
handoff nominated for extraction. `nfl-settlement`, `balldontlie-date-params` and `nfl-flavor-squares`
were all rewired onto it (`vi.mock` with an async factory) and stay green.

### Not fixed, deliberately

- **`scripts/probe-nfl-flavor-squares.cjs` still mirrors the old `delta === 2 → safety` rule**
  (~line 592). It is the measurement script that produced Phase 8a's base rates, not shipped grading
  code; changing it would silently invalidate the reproducibility of numbers already committed to
  `lib/sportsBingoNflFlavor.ts`. The rule change makes `nfl_safety` hit marginally *less* often (an
  unattributable +2 no longer counts), so the committed base rate is now very slightly optimistic.
  Re-measuring is a calibration task, not a grading one.
- **`firstScoreKind` still labels a +2 first score `"safety"`** (~3115). Its only consumers ask
  "was the first score a field goal" and "who scored first", so the label never reaches a player;
  tightening it would add a third tri-state for no behavioral gain.
- **The pre-existing full-suite failures are unrelated**: `admin-mobile.section-registry-split` (1)
  and `venue-activation.phase4-mount` (3). Verified by stashing every Phase 3 file and re-running —
  they fail identically without this work. 1762 of 1779 pass; 13 skipped.

### Handoff to Phase 4

Phase 4 is small and mechanical — **`parseInt(env) || 3` makes the documented kill value `0`
falsily become `3`** — but the plan is explicit that *the sweep is the actual work*, not the two
known sites.

- The two named sites are `NFL_TIER1_MAX_SQUARES_PER_BOARD` and `NFL_TIER1_MAX_SQUARES_PER_TEAM`.
  They were around `lib/sportsBingo.ts:3928` when the plan was written and sit at
  **`lib/sportsBingo.ts:4062` and `:4067`** as of this phase (Phase 3 added ~130 lines above them);
  their two readers are at ~6490 and ~6494. Re-grep rather than trusting the line numbers. `BINGO_NFL_TIER1_MAX_PER_BOARD=0`
  silently stays at 3 today, and the `Math.max(0, …)` wrapper is the proof that 0 was meant to be
  reachable.
- Then sweep the file (and `lib/sportsBingoOdds.ts`, `lib/sportsBingoNflStars.ts`,
  `lib/sportsBingoMlbStars.ts`, `lib/leagueSeasonStatus.ts`) for the same
  `Number.parseInt(process.env.X ?? "…", 10) || default` / `parseFloat(…) || default` shape. Note
  that `?? "3"` followed by `|| 3` is the *same* bug wearing a different hat — the `??` only guards
  `undefined`, and `parseInt("0") || 3` is still 3. A `parseFloat` default of `0.0` has the same
  problem. Write the helper (fall back **only** on `NaN`) once and route the reads through it.
- Not every one of these is a bug: a fallback that is only ever a positive count and where `0` is
  meaningless can keep `||` safely. Say which ones you judged that way and why, rather than
  converting mechanically — an env read that starts accepting `0` where the code divides by it is a
  new bug, not a fix.
- Regression test: set the env var to `"0"`, re-import the module (`vi.resetModules()` — these are
  module-level `const`s, so a plain re-read will not pick up the change), assert the resolved value
  is `0` and that the behavior it gates actually turns off. `tests/lib.sportsBingo.nfl-prop-mix.test.ts`
  already manipulates `process.env` around board generation and is the closest existing pattern.
- Model guidance from the plan: Sonnet 5, low effort.

**Phase 5 note (it comes after Phase 4 and after this phase for a reason):** the tier hoist touches
`pickCandidateSet`, and Phase 3 did **not** go near board generation — every edit here is in the
grading half of `lib/sportsBingo.ts` (`buildNFLQuarterScores` ~2577, `buildNFLPlayDerivedFacts`
~2900-3100, `getNFLGameStatsSnapshot` ~3180, and the resolver switch ~8900-9350). Phase 5's
before/after board-generation snapshot test is unaffected by anything landed here.

**Known flakes, pre-existing and unrelated — but read this before treating a red run as a Phase 3
regression.** `test:bingo-nfl` was run **20 times end-to-end** during this phase. Nineteen were
224/224 green; one came back 220/224, i.e. a whole file of four randomized tests, whose only
4-test member is `lib.sportsBingo.win-rate-calibration` — an unseeded Monte-Carlo board simulation
asserting a win-rate band. It did not reproduce in six targeted re-runs or in the seventeen full
runs after it, so no failure output was captured. The `nfl-star-tilt` flake Phase 2 documented
("stops tilting when the tier boosts are turned off", 30 unseeded boards against a fixed margin) is
the same class. **Both files randomize board generation, which Phase 3 does not touch** — every
edit here is in the grading half of the file. If a run goes red, re-run before investigating, and
seeding those two suites is a worthwhile standalone ticket.

---

## Phase 4 — done (2026-08-17)

Gates green: `npx tsc --noEmit`, `npm run lint`, `npm run test:bingo-nfl` (**225 tests**, was 224 —
1 net-new), `npm run test:bingo-mlb` (76, unchanged).

### The sweep (this was the actual work, per the plan)

Grepped every `Number.parseInt(process.env...)` / `Number.parseFloat(process.env...)` site across
`lib/sportsBingo.ts`, `lib/sportsBingoOdds.ts`, `lib/sportsBingoNflStars.ts`,
`lib/sportsBingoMlbStars.ts`, `lib/leagueSeasonStatus.ts` for the `parseInt(env ?? "d") || d` shape
(the `??` only guards `undefined`; `parseInt("0") || d` is still `d`). Result: **only the two named
sites had the bug.**

- `lib/sportsBingoNflStars.ts`, `lib/sportsBingoMlbStars.ts`, `lib/sportsBingoOdds.ts` already share
  a `numberFromEnv` helper (`Number.parseFloat` + `Number.isFinite` check, no `||`) for every env
  read in those files — the safe pattern, not the buggy one. Nothing to change.
- `lib/sportsBingo.ts` itself already had two more instances of the *safe* pattern
  (`cacheMsInWindow` ~135, `wnbaConfigNumber` ~177, `BALLDONTLIE_GAME_LOOKUP_WINDOW_DAYS` /
  `MLB_LATE_SCRATCH_SWAP_WINDOW_MS` ~164-176) — those were the template the fix followed.
  `BINGO_REWARD_POINTS`, `BOARD_TARGET_WIN_RATE/TOLERANCE`, `BOARD_SIMULATION_TRIALS`,
  `CORE_SQUARE_MIN/MAX_PROBABILITY` (~82-110) use bare `?? default` with **no** `||` — a garbage
  value silently becomes `NaN` there, which is a real but *different* bug (not in the 14 findings,
  not touched, not blocking `0`) and is out of this phase's scope.
- `lib/leagueSeasonStatus.ts` has no numeric env reads, only boolean `truthy()` flags — not
  affected by this bug class at all.
- Two more `|| default` sites exist **outside** the plan's named files:
  `lib/fantasy.ts:18` (`FANTASY_POINTS_MULTIPLIER`) and `lib/thesportsdb.ts:6` (`HEADSHOT_SIZE`).
  Not fixed — out of scope for this Prop Bingo plan. `HEADSHOT_SIZE=0` is genuinely meaningless (no
  such thing as a 0px image), so `||` is arguably fine to keep there; `FANTASY_POINTS_MULTIPLIER=0`
  is more plausibly a real kill-switch case worth revisiting in a Fantasy-scoped pass — flagging,
  not fixing.

### The fix

`lib/sportsBingo.ts` ~4062-4068: added `intFromEnv(raw, fallback)` (parses, falls back only on
`Number.isFinite` failure — same shape as the file's existing `cacheMsInWindow`/`wnbaConfigNumber`
helpers) and routed both `NFL_TIER1_MAX_SQUARES_PER_BOARD` and `NFL_TIER1_MAX_SQUARES_PER_TEAM`
through it. `Math.max(0, …)` / `Math.max(1, …)` wrappers kept as-is:
- Per-board floor is `0` — `BINGO_NFL_TIER1_MAX_PER_BOARD=0` now actually reaches `0`, the
  documented kill value.
- Per-team floor is `1`, unchanged and **deliberately not lowered to 0** — the plan's finding is
  specifically about the per-board kill switch; the per-team cap only matters when Tier-1 is active
  at all, so `0` there isn't a meaningful independent state (killing Tier-1 entirely is what the
  per-board `0` is for). Documented in the sweep in case a future reviewer wants to revisit.

### New test

`tests/lib.sportsBingo.nfl-flavor-squares.test.ts`, `board composition` describe block, right after
the existing "caps the Tier-1 block per board and per team" test: `"BINGO_NFL_TIER1_MAX_PER_BOARD=0
actually zeroes the Tier-1 block (kill switch)"`. Uses `vi.stubEnv` (the file's `afterEach` already
calls `vi.unstubAllEnvs()`) + dynamic import after `vi.resetModules()` in `beforeEach` — module-level
`const`s only pick up the stubbed env on a fresh import, per the plan's own regression-test
instruction. Builds 40 boards off the real `buildSportsBingoBoardFromBallDontLieGame`, asserts zero
Tier-1 squares on every one.

**Verified against pre-fix code:** temporarily reverted the `intFromEnv` helper back to
`Number.parseInt(...) || 3` / `|| 2`, re-ran just this test — failed (`0` boards, `3` tier1 squares,
expected `0`). Restored the fix, reran the full `test:bingo-nfl` + `test:bingo-mlb` suites — both
green.

### Handoff to Phase 5

Phase 5 is request-volume/caching work: collapsing `hasUpcomingGamesInWindow` onto one `dates[]`
call, dropping a duplicate MLB prop-candidate fetch, hoisting the O(n²) star-tier maps out of the
180-board-attempt loop, and fixing cache-failure semantics (don't cache a provider failure as a
successful empty result at full TTL).

What Phase 5 inherits from Phase 4:
- **Nothing in `lib/sportsBingo.ts`'s board-generation or caching code changed.** Phase 4 touched
  only the two Tier-1 cap constants (~4062-4068) and added one local helper — no other line moved,
  so line numbers Phase 5 was given elsewhere in the plan should still be close, but re-grep rather
  than trust them (Phase 3 already shifted things ~130 lines; Phase 4 added ~4 net lines at 4062).
- **The plan's own sequencing note still holds:** Phase 5's star-tier hoist touches
  `pickCandidateSet`, in the same region of the file as Phase 3's grading edits, not Phase 4's — no
  interaction expected, but worth re-reading `pickCandidateSet` fresh since Phase 4 didn't touch it.
- **The `intFromEnv` helper Phase 4 added (~4062) is a fine pattern to reuse** if Phase 5 needs a
  new int-typed env read (e.g., a tunable cache TTL) — same shape as the file's pre-existing
  `cacheMsInWindow`/`wnbaConfigNumber`, just not clamped to a min/max window.
- **Two out-of-scope findings flagged above, not fixed:** `lib/fantasy.ts:18`
  `FANTASY_POINTS_MULTIPLIER` has the same `|| default` bug pattern outside this plan's named files.
  Not Phase 5's job either (Phase 5's files are `lib/sportsBingo.ts` 1099/3857/6288/6597 and
  `lib/sportsBingoNflStars.ts:508`) — noting it here so it isn't rediscovered and re-investigated
  from scratch, and doesn't get silently folded into Phase 5's diff.
- **Gate on the same four commands:** `npx tsc --noEmit`, `npm run lint`, `npm run test:bingo-nfl`,
  `npm run test:bingo-mlb`. The plan calls for a before/after board-generation snapshot test locking
  in the star-tier hoist's "output must be identical" requirement — write that first, confirm it's
  green against the pre-hoist code, then do the refactor and confirm it's still green.

---

## Phase 5 — done (2026-08-17)

Gates green: `npx tsc --noEmit`, `npm run lint`, `npm run test:bingo-nfl` (**236 tests**, was 225 —
11 net-new), `npm run test:bingo-mlb` (**78**, was 76 — 2 net-new).

All four findings fixed. Two of them are pure cost, one is a refactor that had to prove it changed
nothing, and one is correctness wearing a perf costume.

### 1. `hasUpcomingGamesInWindow` — 15 requests to 1

[lib/sportsBingo.ts](../lib/sportsBingo.ts) ~1101. The per-day loop is gone; it now builds one
`buildBallDontLieDatesQuery(now, now + days, "1")` (the same repeated-`dates[]` form Phase 2
established as the only param shape these endpoints honour) and issues a single
`fetchBallDontLieList(path, query, { maxPages: 1, failure })`.

- `maxPages: 1` is deliberate: the question is pure existence, so there is nothing to gain from
  walking the cursor past the first page of a `per_page: 1` request.
- Equivalent by construction — the old loop broke on the first day with a row, the new call asks
  every day at once and checks `rows.length > 0`.
- Picker load across four leagues drops from up to 60 sequential round trips to 4.

### 2. The duplicate MLB historical-stats build

`buildMLBPlayerPropCandidates` (~5700) now returns `MLBPlayerPropCandidateResult`
(`{ candidates, historical }`) instead of a bare array. `historical` is the recent-stats pool
**when this call already built it** (i.e. the books posted nothing, or nothing survived parsing) and
`null` when the books answered and it was never fetched.

`getGameEntryWithCandidates` (~4000) reads it: `mlbProps.historical ?? await buildMLB…FromRecentStats(…)`.

Worth being explicit about why the plan's literal instruction ("drop the duplicate call") was *not*
what shipped: the second call is not dead in the success case. When the books answer, it is the only
source of the achievement-bucket squares that get blended into every MLB board. Dropping it outright
would have changed board composition. Reusing the fallback's own return value removes the redundant
work in exactly the case where it *was* redundant and leaves the other case untouched.

Output is identical either way: `aggregateCandidates` averages duplicate keys (`sum / count`), so
folding the same template in twice produced the same probability as folding it in once.

### 3. The star-tier hoist — a refactor with a receipt

`buildNFLStarTiers` / `buildMLBStarTiers` are pure functions of a candidate list that does not
change between board attempts, yet they ran inside `pickCandidateSet`, i.e. up to 180 times per
board, each an O(n²) percentile walk.

- New `buildStarTiersForPool(candidates, sportKey)` returns a `PrecomputedStarTiers`
  (`{ nfl, mlb }`), computing the NFL half over the `player-prop` bucket and the MLB half over the
  whole list — exactly the two inputs the two blocks inside `pickCandidateSet` used to pass.
- `generateBoardForGame` builds it once, before the attempt loop, and threads it through
  `options.precomputedStarTiers`.
- `pickCandidateSet` keeps its own computation as the fallback for when the option is **absent**.
  Absent is deliberately distinct from either field being `null` (`null` still means "no candidate
  carries a `starScore`, run the no-tilt path"), so the function is still correct standalone.

**The receipt the plan asked for:** a seeded-`Math.random` board snapshot, captured against the
*pre-hoist* code and committed before the refactor was written.

- `installSeededRandom(seed)` (a 32-bit xorshift `vi.spyOn(Math, "random")`) is now in both
  [tests/lib.sportsBingo.nfl-star-tilt.test.ts](../tests/lib.sportsBingo.nfl-star-tilt.test.ts) and
  [tests/lib.sportsBingo.mlb-star-tilt.test.ts](../tests/lib.sportsBingo.mlb-star-tilt.test.ts).
  `Math.random` is the generator's only entropy source, so pinning it pins the whole pipeline —
  attempt loop, difficulty escalation, weighted draws, star reservation, line arrangement,
  Monte-Carlo preview.
- `NFL_HOIST_SNAPSHOT` / `MLB_HOIST_SNAPSHOT` hold three boards each as `key|key|…` signatures.
  Confirmed deterministic across repeated runs before being baked in, captured pre-hoist, still
  green post-hoist. **Not one square moved.**
- Both files gained `vi.restoreAllMocks()` in `afterEach` so the `Math.random` spy cannot leak.

If a future phase *deliberately* changes selection, these two tests fail by design. Re-capture the
snapshots in the same commit that makes the change and say so in the commit message — do not relax
the assertion.

### 4. Cache-failure semantics (the correctness one)

`fetchBallDontLieList` degrades a provider outage to `[]` on purpose, so "this league has no games"
and "the provider was down" reached every caching caller as the same value and were cached for the
same 6 or 24 hours. One bad provider minute could mark a league out of season for six hours, or
strip the star tilt off every board for a day.

- [lib/ballDontLieClient.ts](../lib/ballDontLieClient.ts) gained `BallDontLieFailureBox`
  (`{ failed: boolean }`), an out-param on both `fetchBallDontLieJson` and `fetchBallDontLieList`,
  modelled on the `truncation` box already there. Set on a network error and on a non-2xx. The
  returned value and the degradation are **unchanged** — this only adds a signal.
- `hasUpcomingGamesInWindow` caches a failure-derived answer for `SEASON_STATUS_FAILURE_CACHE_MS`
  (5 min) instead of `SEASON_STATUS_CACHE_MS` (6h).
- `resolveNFLStarIndex` / `resolveMLBStarIndex` do the same with
  `NFL_STAR_INDEX_FAILURE_CACHE_MS` / `MLB_STAR_INDEX_FAILURE_CACHE_MS` (5 min) against their 24h
  TTL. `fetchNFLSeasonStats` / `fetchMLBSeasonStats` gained an `options.failure` passthrough and set
  it in their own `catch` too.
- The injectable `fetchSeasonStats` test seam widened to
  `(season, options?: { failure?: BallDontLieFailureBox }) => Promise<Row[]>`. **Backward
  compatible** — an injected double that ignores the second argument never sets the box and is
  therefore treated as a success, which is what every pre-existing test does.
- 5 min is short enough that the next picker load re-asks and long enough that an outage does not
  become a request storm.

**MLB was fixed alongside NFL** even though the plan names only `lib/sportsBingoNflStars.ts:508`.
It is the identical bug in a mirrored file, and leaving it would have made the two resolvers behave
differently for no reason.

### New tests

- [tests/lib.sportsBingo.request-caching.test.ts](../tests/lib.sportsBingo.request-caching.test.ts)
  — 10 tests, new file, **added to `test:bingo-nfl` in package.json**. Covers: one request for the
  whole window with 15 `dates[]` params and no `start_date`/`end_date`; a real "no games" answer
  keeping the full TTL; a failure being re-asked after ~5 min but not after 1 min; the unsupported
  league still short-circuiting with zero requests; both star-index resolvers on both sides of the
  same distinction; and the failure box itself (set on a 503, untouched on a genuine empty payload).
- The two snapshot tests described above.
- `"builds the historical-stats pool once per game, not twice"` in the MLB tilt file — counts the
  21-day `/mlb/v1/games` history windows (1, was 2) and the batched `/mlb/v1/stats` walks
  (`MLB_HISTORICAL_STATS_CALLS_PER_BUILD` = 2, was 4).

**Verified against pre-fix code:** each fix was temporarily reverted and the relevant tests re-run.
5 of the 10 request-caching tests fail pre-fix; the MLB dedupe test fails pre-fix (1 vs 2 history
windows). The two hoist snapshots were captured *from* pre-fix code by construction.

### Handoff to Phase 6

Phase 6 is the last one: picker copy correctness. A not-yet-activated NFL is reported as
`out_of_season` with `resumesLabel: "Coming soon"`, which the picker renders as the
self-contradictory "Out of season · Coming soon" — NFL *is* in season in September; it's
`NEXT_PUBLIC_BINGO_NFL_ENABLED` that is off. Files: `app/api/bingo/leagues/route.ts:27`,
`components/bingo/SportsBingoSelectSport.tsx`. The plan offers two shapes — a distinct
`coming_soon` status, or a `note` field the client renders verbatim.

What Phase 6 inherits from Phase 5:

- **Phase 5 did not touch `lib/leagueSeasonStatus.ts`, the leagues route, or any component.** The
  one place the two phases meet is `hasUpcomingGamesInWindow`, which `lib/leagueSeasonStatus.ts`
  calls as the live-feed signal behind its calendar fallback. Its **signature and return value are
  unchanged** — same `(sportKey, days) => Promise<boolean>`. Only the request shape and the failure
  TTL changed, so Phase 6 can treat it as a black box exactly as before.
- **A real consequence worth knowing:** a provider outage no longer pins a league to
  `hasGames: false` for six hours. If Phase 6 adds a `coming_soon` status, make sure it is derived
  from the **activation flag**, not from the season signal — the flag is the actual reason NFL is
  dark, and it is the thing `.env.example` documents. Do not route the new status through
  `hasUpcomingGamesInWindow`.
- **Phase 1 already added a display-name lookup** in `lib/leagueSeasonStatus.ts` keyed off the same
  table as `LEAGUE_SEASON_WINDOWS`, specifically so a player-facing string never echoes
  caller-supplied input. Reuse it for whatever copy Phase 6 emits rather than adding a second table.
- **`tests/api.bingo.leagues.test.ts` and `tests/lib.league-season-status.test.ts` already exist**
  and are already in `test:bingo-nfl` — Phase 6's tests almost certainly belong in one of those two
  rather than in a new file.
- **Gate on the same four commands:** `npx tsc --noEmit`, `npm run lint`, `npm run test:bingo-nfl`
  (236 tests as of Phase 5), `npm run test:bingo-mlb` (78). `test:bingo-nfl` now includes
  `tests/lib.sportsBingo.request-caching.test.ts`.
- **Line numbers in this plan are now stale by roughly +90 in `lib/sportsBingo.ts`** (Phase 5 added
  the failure-TTL block, the `MLBPlayerPropCandidateResult` type, `PrecomputedStarTiers` and
  `buildStarTiersForPool`). Phase 6 does not touch that file, but re-grep rather than trust the
  numbers if it turns out to.
- **Still-open, still out of scope, still not rediscovered from scratch:** `lib/fantasy.ts:18`
  (`FANTASY_POINTS_MULTIPLIER`) carries Phase 4's `parseInt(env) || default` bug outside this plan's
  files, and `lib/sportsBingo.ts` ~82-110 (`BINGO_REWARD_POINTS`, `BOARD_TARGET_WIN_RATE` and
  siblings) use bare `?? default` with no finiteness check, so a garbage env value silently becomes
  `NaN`. Neither is one of the 14 findings. Flag them in a follow-up rather than folding them into
  Phase 6's diff.

---

## Phase 6 — done (2026-08-17)

Gates green: `npx tsc --noEmit`, `npm run lint`, `npm run test:bingo-nfl` (**236 tests**, unchanged
— Phase 6 edited two existing assertions rather than adding new ones; see below for why that still
counts as a real regression test), `npm run test:bingo-mlb` (**78**, unchanged — Phase 6 touches
neither MLB code nor MLB tests).

Went with the plan's first option — a distinct `coming_soon` status — rather than a `note`-only
overlay on `out_of_season`, because the two statuses are gated on genuinely different signals (the
activation flag vs. the season calendar/live feed) and collapsing them back into one status string
with an extra field would have re-created the exact "two independent reasons, one field" shape that
caused the bug.

### The fix

- **`app/api/bingo/leagues/route.ts`:** when `NEXT_PUBLIC_BINGO_NFL_ENABLED` is off, NFL now comes
  back as `{ status: "coming_soon", note: "Coming soon" }` instead of
  `{ status: "out_of_season", resumesLabel: "Coming soon" }`. Every other league, and NFL once the
  flag is on, is untouched — they still resolve through `resolveLeagueSeasonStatus` and land on
  `in_season` / `out_of_season` exactly as before. `coming_soon` is derived from
  **`nflGameplayEnabled` alone** — it never touches `resolveLeagueSeasonStatus` or
  `hasUpcomingGamesInWindow`, so a provider outage can never manufacture a `coming_soon` for a
  different league.
- **`components/bingo/SportsBingoSelectSport.tsx`:** `LeaguesApiLeague.status` gained the
  `"coming_soon"` member and a `note?: string` field. The picker's copy line is now three-way:
  `out_of_season` → `"Out of season · {resumesLabel}"` (unchanged), `coming_soon` → `league.note ??
  "Coming soon"` (renders the server's `note` verbatim, per the plan's second option, rather than
  hard-coding the string client-side), anything else → no note badge. `enabled` stays
  `status === "in_season"`, so `coming_soon` renders exactly like the old `out_of_season` did
  visually (a disabled row with a badge) — only the copy changed, not the interaction.
- **Did not touch `lib/leagueSeasonStatus.ts`.** Its `LeagueSeasonStatus` type
  (`"in_season" | "out_of_season"`) is unchanged — it's a true statement about the calendar/live-feed
  resolver, which still only ever returns those two. `coming_soon` is a route-level concept layered
  on top for the one case (`NFL_SPORT_KEY` + flag off) that never reaches the resolver at all, so
  widening that type would have been a fiction: nothing in `resolveLeagueSeasonStatus` can ever
  produce `coming_soon`.

### Regression test

Both plan-relevant tests are in `tests/api.bingo.leagues.test.ts` (no new file, per the Phase 5
handoff's steer):

- `"reports every league in-season and skips the resolver when season gating is off"` — now asserts
  NFL's status is `"coming_soon"`, not `"out_of_season"`.
- `"keeps NFL reported as coming-soon (not out-of-season) even mid-season until
  NEXT_PUBLIC_BINGO_NFL_ENABLED flips"` (renamed from "...as coming-soon..." to make the
  distinction explicit) — asserts `status === "coming_soon"`, `note === "Coming soon"`, and
  **`resumesLabel` is `undefined`** (it no longer carries the borrowed "Coming soon" string). The
  mock has `resolveLeagueSeasonStatus` return `{ status: "in_season" }`, so this specifically proves
  NFL's `coming_soon` does not come from the season resolver even when mid-season data says
  in-season.

**Verified against pre-fix code:** temporarily reverted `route.ts`'s NFL branch to the old
`{ status: "out_of_season", resumesLabel: "Coming soon" }`, re-ran just this file — 2 of 5 tests
failed (`expected 'out_of_season' to be 'coming_soon'`, and the note/resumesLabel assertions), the
other 3 (season-gating-on, unaffected-by-flag-when-on, 500-on-error) stayed green as expected since
they don't touch the NFL-flag-off branch. Restored the fix; full `test:bingo-nfl` back to 236/236.

No component-level test was added for `SportsBingoSelectSport.tsx` — there's no existing test file
for it (`tests/` has no `*SelectSport*` match), and the route-level test already pins the contract
the component consumes (`status`/`note`), which is what actually changed. The component's
verbatim-render logic (`league.note ?? "Coming soon"`) is 3 lines with no branching worth a
dedicated fixture; flagging here in case a future UI-testing pass wants to add one rather than
treating its absence as an oversight.

### Not fixed, out of scope

Same two items every phase since Phase 4 has carried forward, still untouched by this phase:
`lib/fantasy.ts:18` (`FANTASY_POINTS_MULTIPLIER`, the `parseInt(env) || default` bug outside this
plan's named files) and `lib/sportsBingo.ts` ~82-110 (`BINGO_REWARD_POINTS` /
`BOARD_TARGET_WIN_RATE` and siblings, bare `?? default` with no finiteness check). Neither is one of
the 14 findings this plan tracks.

### All 6 phases now complete

Every finding from the original 14-finding `/code-review` is fixed, gate-verified, and covered by a
test proven to fail pre-fix. Cumulative test count: `test:bingo-nfl` 200 → **236** (36 net-new),
`test:bingo-mlb` 76 → **78** (2 net-new). No open handoff remains in this document — the two
out-of-scope env-var findings above (`lib/fantasy.ts`, `lib/sportsBingo.ts` reward/win-rate
constants) are flagged, not planned; picking them up would be a new plan, not a continuation of this
one.
