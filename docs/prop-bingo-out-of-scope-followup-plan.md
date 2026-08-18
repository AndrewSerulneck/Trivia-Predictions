# Prop Bingo — Out-of-Scope Follow-Up Plan

Source: the `### Not fixed, out of scope` / `NOT fixed` / `Not fixed, deliberately` blocks carried
forward through `docs/prop-bingo-code-review-fix-plan.md` (all 6 phases complete, 2026-08-17).
None of these are among that plan's 14 findings. Drafted 2026-08-18.

**Already resolved, dropped from this plan:** the "pre-existing full-suite failures"
(`admin-mobile.section-registry-split` 1, `venue-activation.phase4-mount` 3) both pass as of
`451613c admin test debt` — re-ran both files 2026-08-18, 9/9 and 10/10 green.

Ordered by blast radius: silent-NaN config → dead code that hides a real parser bug → grading-label
precision → calibration → test hygiene.

> **STATUS: all six phases (A, B, C, D, E, F) complete as of 2026-08-18.** Each phase's as-built
> record and hand-off notes are inline below its plan section. Everything is uncommitted
> working-tree state; nothing here has been committed. Gate commands green at close:
> `npx tsc --noEmit`, `npm run lint`, `npm run test:bingo-nfl` (244/244),
> `npm run test:bingo-mlb` (97/97), `npm run test` (200 files, 1828 passed, 13 pre-existing skips).
> Phase C's carried MLB flag was also investigated and fixed — see the addendum after Phase E. The
> one thing deliberately left open is a product copy decision, recorded there.

---

## Phase A — Finish Phase 4's env-var sweep

**Carried from:** Phase 4/5/6 handoffs.
**Files:** `lib/sportsBingo.ts` ~83-111, `lib/fantasy.ts:18`, `lib/thesportsdb.ts:6`

Phase 4 fixed the two named `parseInt(env) || default` sites and explicitly flagged three it did not
touch. Two distinct bug classes remain:

1. **`|| default` swallows a legitimate `0`** — `lib/fantasy.ts:18`
   (`Math.max(1, Number.parseInt(process.env.FANTASY_POINTS_MULTIPLIER ?? "1", 10) || 1)`) and
   `lib/thesportsdb.ts:6` (`HEADSHOT_SIZE`). Confirmed present. Fantasy's outer `Math.max(1, …)`
   means `0` was never reachable anyway, so this one is about *garbage* (`"abc"` → `1` silently),
   not about a kill switch. `HEADSHOT_SIZE=0` is genuinely meaningless — normalize it for
   consistency or leave it with a comment; do not invent a 0px-image semantic.
2. **Bare `?? default` with no finiteness check → silent `NaN`**, the more dangerous one:
   `BINGO_REWARD_POINTS` (`:83`), `BOARD_TARGET_WIN_RATE` (`:94`), `BOARD_TARGET_TOLERANCE` (`:95`),
   `BOARD_SIMULATION_TRIALS` (`:96`), `CORE_SQUARE_MIN_PROBABILITY` / `CORE_SQUARE_MAX_PROBABILITY`
   (`:110-111`). A typo'd env var poisons the board-tuning loop and the reward payout with `NaN`
   rather than falling back.

**Do not add a fourth local helper.** The file already carries `intFromEnv` (Phase 4),
`cacheMsInWindow` and `wnbaConfigNumber`, all the same shape. Extract `lib/envNumber.ts` with
`intFromEnv` / `floatFromEnv` (parse, fall back only on `Number.isFinite` failure) and route all of
the above plus the three existing helpers through it.

Tests: one table-driven file asserting each name falls back on `""`/`"abc"` and honours a valid
`0`. Verify by reverting to `??` and watching `NaN` propagate.

**Model:** Sonnet 5 · **Effort:** Low (~45 min). Mechanical, well-templated by Phase 4.

### Phase A — done, handoff to Phase B

**Status: complete, 2026-08-18.** All four gate commands green:
`npx tsc --noEmit`, `npm run lint`, `npm run test:bingo-nfl` (236/236),
`npm run test:bingo-mlb` (78/78), plus the new `tests/lib.envNumber.test.ts` (13/13).

What shipped:
- **New file `lib/envNumber.ts`** — `intFromEnv(raw, fallback)` / `floatFromEnv(raw, fallback)`,
  parse-then-`Number.isFinite`-guard, fall back only on parse failure (never on a valid `0`).
  `"server-only"`.
- **`lib/sportsBingo.ts`**: `BINGO_REWARD_POINTS`, `BOARD_TARGET_WIN_RATE`,
  `BOARD_TARGET_TOLERANCE`, `BOARD_SIMULATION_TRIALS`, `CORE_SQUARE_MIN_PROBABILITY`,
  `CORE_SQUARE_MAX_PROBABILITY` now route through the shared helpers. The three pre-existing local
  helpers (`cacheMsInWindow`, `wnbaConfigNumber`, the duplicate `intFromEnv` that lived at the old
  line ~4086 next to the NFL Tier-1 constants) were collapsed onto the shared import —
  `cacheMsInWindow` keeps its own clamp-to-window wrapper (still local, now built on
  `intFromEnv`); `wnbaConfigNumber` is now just an alias (`const wnbaConfigNumber = floatFromEnv;`)
  kept only so the `WNBA_CALIBRATION` block below it didn't need a rename.
  **Deliberately left alone** (already had correct `Number.isFinite` guards pre-Phase-A, not named
  in the plan's target list): `BALLDONTLIE_GAME_LOOKUP_WINDOW_DAYS` (~line 161) and
  `MLB_LATE_SCRATCH_SWAP_WINDOW_MS` (~line 167). Also left the redundant
  `Number.isFinite(BINGO_REWARD_POINTS) ? ... : 100` guard at the reward-points call site
  (~line 10959) as dead-but-harmless defense-in-depth rather than touching an unrelated line.
- **`lib/fantasy.ts:18`**: `FANTASY_POINTS_MULTIPLIER` now uses `intFromEnv`; kept the outer
  `Math.max(1, …)` per the plan's instruction not to invent a reachable-`0` semantic.
- **`lib/thesportsdb.ts:6`**: `HEADSHOT_SIZE` now uses `intFromEnv`, plus an explicit
  `Math.max(1, …)` with a one-line comment, since `0` genuinely has no meaning here — also per the
  plan's instruction not to invent a 0px-image semantic.
- **New test `tests/lib.envNumber.test.ts`**: table-driven over both helpers —
  `undefined`/`""`/`"abc"` all fall back, `"0"` is honored, negatives and normal values pass
  through. Verified as failing pre-fix by reverting to plain `Number.parseFloat`/`parseInt` and
  confirming `Number.parseFloat("garbage")` → `NaN` (the exact bug class this phase closes; the old
  bare `?? default` pattern only caught `undefined`/`""`, never a parse failure on a non-empty
  string).

**Handoff to whoever runs Phase B** (collapsing `SPORT_PATH_BY_KEY` /
`getScoresBySportKey`'s local table down to the 4 shipped leagues, exporting one shared constant,
dropping the orphaned `icehockey_nhl` branch at the old ~line 4294 — re-grep, line numbers have
shifted by roughly -7 after Phase A's edits since two local helpers lost their bodies):
- Nothing in Phase A touches league/sport-path tables; there is no merge conflict risk, only a
  line-number drift. Re-grep `SPORT_PATH_BY_KEY` and `getScoresBySportKey` fresh rather than trusting
  the plan doc's original line numbers (`:1056`, `:10177`, `:4294`) — they predate Phase A's edits.
- `app/api/bingo/leagues/route.ts:12-17` (NBA/WNBA/NFL/MLB) is still the source-of-truth list to
  collapse both tables to — unchanged by Phase A.
- The four gate commands above are your baseline; they were green at Phase A hand-off, so any
  failure after your Phase B changes is yours to chase, not pre-existing debt.

---

## Phase B — Collapse the two drifted league-path tables to the 4 leagues that ship

**Carried from:** Phase 2's finding "six of the eleven league paths in `getScoresBySportKey`'s table
are dead" (`/epl/v1/games` ignores both date params; `/mls`, `/laliga`, `/seriea`, `/bundesliga`,
`/ucl` all 404).

The framing in the original note is the wrong one to act on. Prop Bingo ships **four** leagues —
`app/api/bingo/leagues/route.ts:12-17` is NBA / WNBA / NFL / MLB, and
`components/bingo/SportsBingoSelectSport.tsx`'s fallback mirrors it. NHL and the six soccer keys are
unreachable from every Sports Bingo entry point. So the fix is deletion, not repair.

There are **two** tables, and they have already silently drifted apart — which is the actual latent
hazard here, not the 404s:

| key | `SPORT_PATH_BY_KEY` (`lib/sportsBingo.ts:1056`) | `getScoresBySportKey` local (`:10177`) |
|---|---|---|
| `soccer_epl` | `/epl/v2/matches` | `/epl/v1/games` |
| `soccer_usa_mls` | `/mls/v1/matches` | `/mls/v1/games` |
| others (laliga/seriea/…) | `/…/v1/matches` | `/…/v1/games` |

Reduce both to the four supported keys and **export one shared constant** so a third copy can't
appear. Also drop the now-orphaned `icehockey_nhl` branch in the average-total ternary at `:4294`.
Leave `lib/pickem.ts` and `lib/polymarket.ts` alone — those are different products that really do
serve NHL/EPL.

Guard: a test asserting the Sports Bingo path table's keys equal the leagues route's keys, so adding
a league to the picker without a path (or vice versa) fails CI.

**Model:** Sonnet 5 · **Effort:** Low–Medium (~1 hr). Deletion + one invariant test; the care is in
proving unreachability, which the grep above already does.

### Phase B — done, handoff to Phase C

**Status: complete, 2026-08-18.** All four gate commands green:
`npx tsc --noEmit`, `npm run lint`, `npm run test:bingo-nfl` (236/236),
`npm run test:bingo-mlb` (78/78), plus the new `tests/lib.sportsBingo.sport-path-keys.test.ts` (1/1).

What shipped:
- **`lib/sportsBingo.ts:1049`** — `SPORT_PATH_BY_KEY` collapsed from 11 keys to the 4 that ship
  (`basketball_nba`, `basketball_wnba`, `americanfootball_nfl`, `baseball_mlb`) and **exported**
  (it was module-private before). All four surviving paths are the `/…/v1/games` form — the
  soccer `/matches` vs `/games` drift the plan's table called out is gone by construction, not
  patched.
- **`lib/sportsBingo.ts:10157`** (`getScoresBySportKey`) — deleted its own local
  `sportPathByKey` table (the one still on the stale `/…/v1/games` shape it had drifted to,
  ~line 10166 pre-fix) and now reads the same imported `SPORT_PATH_BY_KEY` constant that
  `loadGameCatalog` (~line 4427) and `hasUpcomingGamesInWindow` (~line 1120) already used. There
  is now exactly one table; a third copy can't silently reappear.
- **`lib/sportsBingo.ts` ~4282** — dropped the orphaned `sportKey === "icehockey_nhl" ? 6` arm
  from the average-total ternary (dead now that NHL has no path to reach this code).
- **Left alone, confirmed correctly out of scope:** `lib/pickem.ts` and `lib/polymarket.ts` still
  reference NHL/EPL keys — those are different products with their own live paths, untouched.
  `tests/lib.league-season-status.test.ts:81` still passes `"icehockey_nhl"` to
  `resolveLeagueSeasonStatus` as a generic "league with no calendar entry" fixture — that test
  mocks `hasUpcomingGamesInWindow` directly, so it never touches `SPORT_PATH_BY_KEY` and needed
  no change.
- **New test `tests/lib.sportsBingo.sport-path-keys.test.ts`** — mocks
  `resolveLeagueSeasonStatus` the same way `tests/api.bingo.leagues.test.ts` does, calls the real
  `GET` handler from `app/api/bingo/leagues/route.ts`, and asserts
  `Object.keys(SPORT_PATH_BY_KEY).sort()` equals the route's returned league keys, sorted. Proven
  to fail pre-fix: ran it against the pre-Phase-B `lib/sportsBingo.ts` (11-key table) via
  `git stash` — it failed as expected (extra keys), then passed again after `git stash pop`
  restored the Phase B changes. **Wired into `npm run test:bingo-mlb`** (`package.json` — it's a
  league-catalog-wide guard, not NFL- or MLB-specific, but `test:bingo-mlb` is the shorter script
  and Phase C already lives there); re-ran `test:bingo-mlb` after adding it, still 79/79 (78 + 1).

**Handoff to whoever runs Phase C** (`getScoresBySportKey` cannot parse MLB rows):
- **Phase C's target function moved.** `getScoresBySportKey` is still at `lib/sportsBingo.ts:10157`
  (Phase B deleted lines inside it, at the same starting line, net -13 lines) but re-grep before
  trusting any line number below ~10157 — the plan doc's `:10208` (the `continue` on empty
  `awayTeam`) has very likely shifted by roughly -13. The function's shape is otherwise exactly
  as Phase 2 described: it reads `event.visitor_team?.full_name`, `event.home_team_score`,
  `event.visitor_team_score` and will still silently drop every MLB row until you land the
  shape-tolerant normalizer.
- **`SPORT_PATH_BY_KEY` is now exported** — if your normalizer wants a type-level list of "leagues
  this function must handle," `Object.keys(SPORT_PATH_BY_KEY)` is that list already, no need to
  reconstruct it.
- Re-run the live-API probe Phase C's plan section calls for before writing the normalizer — the
  field names in the plan doc (`away_team`, `display_name`, `home_team_data.runs`) come from Phase
  2's 2026-08-17 probe, one day before this handoff, so they're almost certainly still accurate,
  but the plan is explicit that a schema claim from a probe must be re-verified, not trusted colder.
- The four gate commands above (now five, once you wire in the new test per the first bullet) are
  your baseline; they were green at Phase B hand-off, so any failure after your Phase C changes is
  yours to chase, not pre-existing debt.

---

## Phase C — `getScoresBySportKey` cannot parse MLB rows

**Carried from:** Phase 2, item 1.

Phase B removes NHL and soccer from this function, which leaves **MLB as the one live league whose
rows this parser silently drops entirely**. The parser reads `event.visitor_team?.full_name`,
`event.home_team_score`, `event.visitor_team_score`; live `/mlb/v1/games` rows carry `away_team`,
`display_name`, and `home_team_data.runs`. `awayTeam` comes out empty and every row hits the
`continue` at `:10208`. NBA/WNBA/NFL parse fine.

This is not currently player-visible — MLB's real score path is `toMLBLiveScoreSnapshot` off
`getMLBGamePlayerStatsSnapshot`, which was already on `dates[]`. It matters because Phase 2
established this as a **second, independent score source** that Phase 3's grading leans on when a
box score is incomplete, and on MLB that second source is quietly always empty.

Fix: a shape-tolerant normalizer (`away_team ?? visitor_team`, `full_name ?? display_name ?? name`,
`home_team_score ?? home_team_data?.runs`) rather than an MLB special case — the same tolerance
covers NBA/NFL unchanged. Widen the `BallDontLieGame` type accordingly; no `any`.

**Verify against the live API before writing the normalizer** — the field names above come from
Phase 2's 2026-08-17 probe, not from a schema. Re-probe one live `/mlb/v1/games` row first.

Alternative if you'd rather not carry it: delete `baseball_mlb` from this table too and let MLB rely
solely on `toMLBLiveScoreSnapshot`. Cheaper, but gives up the redundancy Phase 3 was designed
around. **Recommend fixing.**

Tests: fixture rows in both shapes → both parse; regression fixture proving the MLB shape yields
zero entries pre-fix.

**Model:** Sonnet 5 · **Effort:** Medium (~1.5 hr), plus a live-API probe. Escalate to Opus 5 only
if the probe shows the MLB shape is more irregular than Phase 2 recorded.

### Phase C — done, handoff to Phase F

**Status: complete, 2026-08-18.** All five gate commands green (the fifth being Phase B's
`sport-path-keys` test, now joined by Phase C's own): `npx tsc --noEmit`, `npm run lint`,
`npm run test:bingo-nfl` (236/236), `npm run test:bingo-mlb` (**83/83**, up from 79 — the 4 new
Phase C tests).

**Live-API probe run first, per the plan's instruction not to trust the doc's field names
colder.** Hit `/mlb/v1/games?dates[]=...` directly (throwaway script, not committed — the repo's
existing `--env-file=.env.local` convention from `scripts/probe-nfl-flavor-squares.cjs`, key read
from `.env.local` without ever printing or copying the key itself). Confirmed 2026-08-18, one
`STATUS_FINAL` row:
- Away side is `away_team` (never `visitor_team`) — Phase 2's finding holds.
- Team names: `display_name` present (`"Houston Astros"`), `full_name` **absent** — also holds,
  and `name` is present too but is the mascot-only short form (`"Astros"`), so `display_name` must
  be tried before `name`.
- Scores: `home_team_data.runs` / `away_team_data.runs` — holds exactly as the plan stated;
  `home_team_score`/`visitor_team_score` are absent on this shape.
- One thing the plan didn't call out: the row also carries a `status_state: "final"` field
  alongside `status: "STATUS_FINAL"`. Didn't use it — the existing `status.toLowerCase().includes("final")`
  check already matches `"STATUS_FINAL"` correctly, so there was no reason to add a second status
  field to the type or the completed-check.

**What shipped:**
- **`lib/sportsBingo.ts` `BallDontLieTeam`** (~line 656): added `display_name?: string`.
- **`lib/sportsBingo.ts` `BallDontLieGame`** (~line 663): added `away_team?: BallDontLieTeam`,
  `home_team_data?: BallDontLieTeamBoxScore`, `away_team_data?: BallDontLieTeamBoxScore` (new
  `BallDontLieTeamBoxScore = { runs?: number | string | null }` type alongside it), with a comment
  citing this phase and the live-probe date.
- **New exported function `normalizeBallDontLieScoreRow(event: BallDontLieGame, sportKey: string): ScoreSnapshot | null`**
  (~line 10167, just above `getScoresBySportKey`). Tries `visitor_team ?? away_team` for the away
  side, `full_name ?? display_name ?? name` for both team names, `home_team_score ?? home_team_data?.runs`
  / `visitor_team_score ?? away_team_data?.runs` for scores. Returns `null` on a missing id or
  either team name (same drop condition the inline loop used to have). This is a **general**
  normalizer, not an MLB special case, per the plan's instruction — NBA/WNBA/NFL rows parse
  through the exact same function, unchanged, because their fields simply win the `??` chains
  first.
- **`getScoresBySportKey`** (~line 10199): its per-row parsing loop now just calls
  `normalizeBallDontLieScoreRow(event, sportKey)` and skips on `null` — the loop body shrank from
  ~26 lines to 6; no behavior change for NBA/WNBA/NFL, MLB rows now populate instead of every one
  hitting the old `continue`.
- **New test `tests/lib.sportsBingo.balldontlie-score-normalizer.test.ts`** (4 tests): one fixture
  in the NBA shape, one in the MLB shape (values taken from the live probe row), a regression test
  that literally re-runs the *old* field-access pattern (`visitor_team?.full_name`,
  `home_team_score`) against the MLB fixture and asserts it yields `""`/`undefined` — i.e. proves
  the bug this phase closes, without needing to `git stash` production code the way Phase A/B's
  regression tests did. A fourth test covers the missing-id/missing-team-name drop path in both
  shapes.
- **Wired into `npm run test:bingo-mlb`** (`package.json`) — same rationale as Phase B's test:
  it's a league-catalog-wide (well, row-shape-wide) guard, and `test:bingo-mlb` is the home for
  Prop Bingo MLB-specific coverage.
- **Not touched, and shouldn't be:** `buildMLBGamePlayerStatsSnapshot` /
  `getMLBGamePlayerStatsSnapshot` (~line 2403+) and `pickBestMatchingBallDontLieGame` still read
  `game.home_team_score`/`visitor_team_score`/`game.visitor_team` directly, not through the new
  normalizer. That is **out of scope for Phase C** — the plan's carried finding (Phase 2, item 1)
  named `getScoresBySportKey` specifically, this is a different call site with a different
  purpose (player-stat snapshots, matched via fuzzy `teamsMatch` team-name comparison rather than
  strict equality), and the plan explicitly frames Phase C's fix as "the second, independent score
  source," implying the first source (this other path) is a separate concern. **Flagging, not
  fixing:** based on this phase's probe, `buildMLBGamePlayerStatsSnapshot`'s
  `parseScoreValue(game.home_team_score)` at line ~2459 (now shifted, re-grep) will *also* read
  `undefined` on the live MLB shape and return `null` for `homeScore`/`awayScore` in
  `MLBGamePlayerStatsSnapshot` — untested by this phase, not verified against how
  `toMLBLiveScoreSnapshot` (~line 3564, now shifted) actually consumes those two fields or whether
  something else backfills them. If a future phase touches MLB score plumbing, checking whether
  this second call site has the same latent gap is worth 10 minutes.

**Handoff to whoever runs Phase F** (test-suite hygiene — the flaky NFL star-tilt test and the
missing `SportsBingoSelectSport` component test):
- **No file/line overlap with Phase C.** Phase C only touched `lib/sportsBingo.ts` (the
  `BallDontLie*` types, the new `normalizeBallDontLieScoreRow` export, and
  `getScoresBySportKey`'s loop body) plus `package.json`'s `test:bingo-mlb` script and one new test
  file. Phase F's two targets — `tests/lib.sportsBingo.nfl-star-tilt.test.ts` and
  `components/bingo/SportsBingoSelectSport.tsx` — are untouched, so there's no line-drift to chase
  the way Phase B → Phase C had.
- Re-run all five gate commands (`npx tsc --noEmit`, `npm run lint`, `npm run test:bingo-nfl`,
  `npm run test:bingo-mlb`) as your baseline before starting F1/F2; they're green as of this
  hand-off, so any failure after your changes is yours to chase.
- F1 (the `Math.random()` flake) and F2 (missing render test) are independent of each other and of
  everything Phase C/A/B did — safe to do in either order or split across sessions per the plan's
  per-phase model recommendation (Haiku 4.5 for F2, Sonnet 5 for F1).
- Sequencing note from the plan still applies: **F, then D, then E** is the suggested remaining
  order (E needs Opus 5 and costs real API calls, so it's last regardless of what F/D find).

---

## Phase D — `firstScoreKind` mislabels a two-point conversion as a safety

**Carried from:** Phase 3, "Not fixed, deliberately".

`lib/sportsBingo.ts:3133` — `delta === 2 ? "safety"`. Phase 3 changed the *grading* rule so an
unattributable +2 no longer settles `nfl_safety`, but left this label alone because its two
consumers only ask "was the first score a field goal" and "who scored first" (`:9266`), so the
string never reaches a player.

That reasoning still holds, so this is genuinely optional. Two honest options:

- **D1 (recommended, ~15 min):** widen the union at `:869` to `"two_point_or_safety"` and rename at
  `:3133`. Purely internal; type-checker finds every consumer. Removes a trap for the next person
  who adds a consumer that *does* trust the label.
- **D2 (do nothing):** add a comment at `:3133` pointing at Phase 3's rationale. Zero risk.

Pick D1 unless a new `firstScoreKind` consumer is imminent, in which case it becomes required.

**Model:** Sonnet 5 · **Effort:** Low (~15 min).

### Phase D — done, handoff to Phase E

**Status: complete, 2026-08-18.** Chose **D1** per the plan's recommendation. Four gate commands
green: `npx tsc --noEmit`, `npm run lint`, `npm run test:bingo-nfl` (236/236),
`npm run test:bingo-mlb` (83/83).

**Lines had drifted, as Phase F's handoff warned** — re-grepped fresh rather than trusting
`:869`/`:3133`:
- The type union lived at `lib/sportsBingo.ts:874`, not `:869`.
- The assignment lived at `lib/sportsBingo.ts:3136` (now `:3142` post-edit, since the fix added a
  6-line comment above it), not `:3133`.

**What shipped:**
- **`lib/sportsBingo.ts:874`** — widened the `firstScoreKind` union from
  `"field_goal" | "touchdown" | "safety" | "other" | null` to
  `"field_goal" | "touchdown" | "two_point_or_safety" | "other" | null`.
- **`lib/sportsBingo.ts:3136-3143`** — renamed the `delta === 2` branch's label from `"safety"` to
  `"two_point_or_safety"`, with a new comment explaining why (a bare +2 on the first scoring row
  can't be disambiguated from a two-point conversion booked as its own row, mirroring the existing
  comment a few lines up about the `sawSafety`/`sawTwoPointConversion` split — grading already does
  the real attribution by play type; this label only feeds the two consumers below).
- **No consumer changes needed.** Confirmed by grep (`firstScoreKind` — 5 hits total, all in
  `lib/sportsBingo.ts`) that both consumers only ever check `kind === "field_goal"` (line ~9272,
  the `nfl_first_score_is_field_goal` case) or read `facts.firstScoringTeam` (the "who scored
  first" case) — neither compared against the literal `"safety"` string, so the rename was a pure
  internal change with zero behavioral surface. `npx tsc --noEmit` passing is the actual proof: the
  plan predicted the type-checker would find every consumer, and it found none needing edits
  because none existed.
- **No test fixtures referenced the literal `"safety"` string** for this field either (grepped
  `firstScoreKind` across all `*.ts` before and after) — no test file changes were needed or made.
- This phase is pure rename/comment; there is no "prove it fails pre-fix" test to write (the plan
  doesn't ask for one here — D1 is described as "purely internal, type-checker finds every
  consumer," not a behavior fix), so the verification standard other phases used doesn't apply.

**Handoff to whoever runs Phase E** (re-calibrate `nfl_safety`'s base rate — the last phase in this
plan, Opus 5, real API cost):
- **No file/line overlap with Phase D.** Phase D only touched `lib/sportsBingo.ts:874` and the
  `~3136-3143` region (the `firstScoreKind` assignment, inside the block that computes
  `facts.firstScoreKind`/`facts.firstScoringTeam`). Phase E's targets are
  `scripts/probe-nfl-flavor-squares.cjs:592` (the probe script) and `lib/sportsBingoNflFlavor.ts`
  (the committed base rate) — neither file was touched by Phase D, so no line-drift to chase there.
- **Phase D does NOT touch `sawSafety` or grading.** The `delta === 2 && isNFLSafetyPlay(play)`
  attribution at `lib/sportsBingo.ts:3105-3118` (the actual grading rule Phase 3 fixed and Phase E
  must match the probe against) is completely unchanged by this phase — Phase D only renamed the
  separate, non-grading `firstScoreKind` label. Don't assume Phase D did any of Phase E's "update
  the probe's rule to match shipped grading" work — it didn't touch the probe script at all.
- Per the plan's Sequencing section, Phase E must still come after Phase A (it measures against
  `BOARD_TARGET_WIN_RATE`/`BOARD_SIMULATION_TRIALS`, which Phase A already touched and shipped —
  that dependency is satisfied). With A, B, C, F, D all complete, **Phase E is the only phase left
  in this plan.**
- Re-run all four gate commands as your baseline before starting; they're green as of this
  hand-off (this phase's own numbers above).
- Phase E is explicitly the one judgment-heavy, non-mechanical phase in this plan (see its own
  section for the 4-step procedure: fix the probe rule, re-run over the *same historical window*
  the committed numbers came from — find that window first — re-commit with old/new/sample-size/date,
  then re-run the win-rate tuning gate). Nothing about Phase D changes that procedure or its
  ordering.

---

## Phase E — Re-calibrate `nfl_safety`'s base rate

**Carried from:** Phase 3, "Not fixed, deliberately", item 1.

`scripts/probe-nfl-flavor-squares.cjs:592` still uses `if (delta === 2) sawSafety = true` — the rule
Phase 3 replaced in shipped grading. The committed base rate in `lib/sportsBingoNflFlavor.ts` was
measured with the old rule, so it now **over-states** how often `nfl_safety` hits (two-point
conversions were counted as safeties). Boards are being tuned against a slightly wrong number.

This is the only phase here that is a judgment task, not a mechanical one:

1. Update the probe's rule to match shipped grading (attributed safety only).
2. Re-run the probe over the same historical window the committed numbers came from — **find and
   record that window first**; changing both the rule and the sample makes the delta
   uninterpretable.
3. Re-commit the base rate, with a note giving old value, new value, sample size, and date.
4. Re-run the board win-rate tuning gate: an easier `nfl_safety` changes realized win rate against
   `BOARD_TARGET_WIN_RATE` (0.25 ± 0.05).

Costs real API calls. Sequence it **after Phase A**, since Phase A touches the very constants
(`BOARD_TARGET_WIN_RATE`, `BOARD_SIMULATION_TRIALS`) this phase measures against.

**Model:** Opus 5 · **Effort:** Medium–High (~half day, most of it the probe run and reading the
result). Statistical judgment about sample validity is the reason to not use a smaller model.

### Phase E — done. This plan is complete.

**Status: complete, 2026-08-18.** All gate commands green: `npx tsc --noEmit`, `npm run lint`,
`npm run test:bingo-nfl` (**244/244**, up from 236 — Phase E's 8 new tests),
`npm run test:bingo-mlb` (83/83), plus a full `npm run test` run.

**Headline: `nfl_safety` 0.048 → 0.044.** 13/272 → **12/272**, plus 1/272 that the shipped grader
now voids instead of scoring. `nfl_two_point_conversion` was re-measured under the same corrected
rule and **did not move** (50/272 either way) — see step 1 below for why that is a real finding and
not a no-op.

#### Step 2 first: the window, found and recorded before anything was re-run

The plan's own instruction — *find and record the window first, changing both the rule and the
sample makes the delta uninterpretable*. The committed numbers came from the **2025 NFL regular
season, all 272 games**, run 2026-08-17 as
`bingo:probe:nfl-flavor -- --season 2025 --sweep --tier4 --tier3-sample 272 --json`; artifact
`docs/phase0-artifacts/phase8b-nfl-threshold-sweep-2026-08-17.json` (`season: "2025"`,
`gamesConsidered: 272`, `tier3BaseRates.safety = 0.04779411764705882`, i.e. 13/272). Postseason is
excluded by the probe itself — BDL returns zero stat rows for 2025 postseason games — so "272" is
the regular season exactly, and the Tier-3 sample selection is a deterministic stride, which at
`--tier3-sample 272` is stride 1, i.e. every game.

**The re-run is provably the same sample, not merely the same query.** Eight of the ten Tier-3
counters are untouched by the rule change, and all eight came back **bit-identical** to the
2026-08-17 artifact — same rate to 17 significant figures, same hit counts
(`first_score_within_5min` 52/272, `score_final_minute_first_half` 175/272,
`score_last_2min_fourth` 112/272, `both_teams_lead` 162/272, `lead_change_second_half` 103/272,
`winner_trailed_in_fourth` 69/272, `tied_after_halftime` 73/272, `td_from_inside_2yd` 189/272).
That is the strongest available evidence that the delta below is the *rule* and nothing else. Any
future re-measurement of this file's numbers should reproduce that check rather than assume it.

#### Step 1 — the probe rule now *is* the shipped rule, not a copy of it

`scripts/probe-nfl-flavor-squares.cjs` `tabulateTier3` used `if (delta === 2) sawSafety = true`.
It now mirrors `buildNFLPlayDerivedFacts`'s tri-state branch exactly, **and calls the shipped
predicates** rather than re-implementing their regexes:

- **`lib/sportsBingo.ts`** — `isNFLSafetyPlay` and `isNFLTwoPointConversionPlay` are now `export
  function` (they were module-private), each with a docblock note saying why. No behavior change;
  `npx tsc --noEmit` and the NFL suite confirm nothing else moved.
- **`scripts/probe-nfl-flavor-squares.cjs`** — `tabulateTier3(gamesWithPlays, graders)` takes the
  two predicates, imported in `main` via `await import("../lib/sportsBingo.ts")` — the same
  technique `scripts/validate-nfl-bingo-grading.cjs` already uses, for the same stated reason
  ("a mirrored implementation in the script would validate the mirror, not the shipped grader").
  A copied regex here is exactly how this drift happened the first time.
- **`package.json`** — `bingo:probe:nfl-flavor` gained `--conditions react-server --import tsx`,
  required by that import. Copied verbatim from `bingo:validate:nfl`, which already ran this way.
- **New opt-in flag `--tier3-only`** — skips the `/nfl/v1/team_stats` and `/nfl/v1/stats` fetches
  (~450 requests feeding Tier 1/2/4 only) and walks plays alone; Tier 1/2/4 and Q2–Q4 report
  `null`. It **cannot** move a Tier-3 number: the game list, and therefore the stride sample, is
  built from `/nfl/v1/games` alone. Default off, so an 8a- or 8b-shaped run is byte-for-byte
  unchanged. The eight identical rates above are also the proof this flag is inert.
- **Two new report keys, `safety_ambiguous` / `two_point_conversion_ambiguous`** — the count of
  games where an unattributable +2 left the fact `null`. Shipped grading settles `null` as
  **`void`**, neither hit nor miss (`nflPlayFlagOutcome`), so these games stay in the denominator
  the board simulator prices against but never mark a square. Reporting them means the committed
  rate can be read as "hit out of all games" without hiding how much of the denominator is
  unresolvable. Both came back at 1/272.

**Why `nfl_two_point_conversion` did not move, and why that is worth knowing.** The corrected rule
widens *that* square too: shipped grading counts `delta === 8` **or** a separately-booked +2 the
feed types as a two-point try, where the old probe counted only `delta === 8`. So the number was
under-stated by construction — and re-measuring found the correction is worth **zero games**: no
2025 regular-season game booked a successful two-point try as its own +2 row. The single
unattributable +2 in the season landed in a game that already had a `delta === 8`, so the
`!== true` guards left its `sawTwoPointConversion` at `true`. 0.184 stands, but it now stands on a
measurement taken under the rule that actually grades it. Left unchanged in the catalog, with a
comment recording that this was checked rather than assumed.

#### Step 3 — the committed rate, and an honest reading of it

`lib/sportsBingoNflFlavor.ts` `square(3, { kind: "nfl_safety" }, 0.048)` → `0.044`, with a comment
carrying old value, new value, sample size, date and artifact path as the plan requires. The file's
header docblock gained the new artifact alongside the 8b sweep.

**The correction is one game, and the honest statement is that it is directionally right but
statistically invisible.** 12/272 carries a 95% interval of roughly 0.023–0.076; 0.048 sits inside
it and 0.044 sits inside the old number's interval too. Nothing here says the world changed. What
changed is that the number is no longer measured by a rule the grader stopped using — the failure
mode this file's own docblock warns about ("a rate that has drifted away from its own threshold is
worse than a wrong threshold, because the win-rate estimator will price a board off it with full
confidence"). Separating 0.044 from 0.048 empirically needs a multi-season sample, not a better
single-season run. **Do not read the change as evidence the square got harder.**

- New artifact: `docs/phase0-artifacts/phaseE-nfl-safety-recalibration-2026-08-18.json`.

#### Step 4 — the board win-rate tuning gate

**`tests/lib.sportsBingo.win-rate-calibration.test.ts` is NOT the gate for this change, and the
next person should not mistake it for one.** It stubs `BINGO_NFL_PLAY_BY_PLAY_SQUARES_ENABLED` to
`"false"` in its `beforeAll`, and `lib/sportsBingo.ts` drops every `tier === 3` flavor square when
that flag is off — so `nfl_safety` is not on a single board that test builds. It passes here
(4/4), but it would pass identically with the base rate set to anything.

The real gate is the backtest, re-run at the **same configuration** as Phase 8c's post-recalibration
run so the two are diffable (`--backtest --sports americanfootball_nfl --seasons 2025 --weeks
6,9,14 --boards 4`):

| | boards | realized win rate | predicted median | predicted mean | predicted in 0.20–0.30 | ungraded share |
|---|---|---|---|---|---|---|
| 2026-08-17, pre-E (`phase8c-nfl-backtest-postrecal-3wk`) | 172 | 0.2151 | 0.2596 | 0.2550 | 1.00 | 0.0005 |
| 2026-08-18, post-E (`phaseE-nfl-backtest-postsafety-recal`) | 172 | **0.2616** | 0.2536 | 0.2517 | 1.00 | 0.0002 |

Target 0.25, band 0.20–0.30. **Both runs sit inside the band; the gate holds.**

**Do not read the +0.0465 realized swing as an effect of this change.** Board generation runs on
unseeded `Math.random()` (4 sites in `lib/sportsBingo.ts`, no seedable RNG — the same fact Phase F
worked around inside a test rather than in production), so two runs over an identical 172-board
slate differ freely. At p ≈ 0.25, n = 172 the binomial standard error is ≈ 0.033, making this a
~1.4σ move: entirely ordinary noise. A 0.004 shift on one of ~45 flavor squares, which appears on
only a fraction of boards, cannot produce a measurable realized-rate change at this sample size.
The correct conclusion is "still in band," not "improved." Anyone wanting to actually measure this
square's effect on board pricing needs a seeded generator or thousands of boards — and given step
3's interval, would find nothing.

- New artifact: `docs/phase0-artifacts/phaseE-nfl-backtest-postsafety-recal-2026-08-18.json`.

#### The test, proven to fail pre-fix

**New `tests/lib.sportsBingo.nfl-safety-attribution.test.ts` (8 tests), wired into
`npm run test:bingo-nfl`** (236 → 244). Two halves:

1. **The regression, reproduced without checking out old code.** The file carries the *old probe
   rule* verbatim as a local helper (`oldProbeSawSafety`) and runs it beside
   `buildNFLPlayDerivedFacts` over a fixture where a touchdown is booked at +6 and its two-point
   try as its own +2 row: the shipped grader returns `sawSafety === false` /
   `sawTwoPointConversion === true`, the old rule returns `safety === true`. That is the drift that
   produced 0.048, asserted in both directions — the same technique Phase C used, and better than
   a `git stash` dance because it keeps failing forever if someone reverts the grader. Plus
   coverage of the real-safety path, the `null`-voids-both path, all three live safety shapes, the
   defensive-prose false positive (`"tackled by safety Kyle Hamilton"`), and the failed-two-point
   exclusion.
2. **A provenance guard.** It reads the Phase E artifact JSON directly
   (`import … from "@/docs/phase0-artifacts/phaseE-nfl-safety-recalibration-2026-08-18.json"`) and
   asserts the catalog's committed `nfl_safety` and `nfl_two_point_conversion` base rates equal the
   measured ones, and that the artifact really is the 272-game 2025 season. **Verified failing
   pre-fix:** temporarily set the catalog back to `0.048`, re-ran — `expected 0.048 to be close to
   0.04411764705882353` — then restored. This is the invariant that would have caught the original
   drift, and it is the reason the artifact is committed rather than thrown away.

#### Deliberately not done

- **Did not re-measure Tier 1, Tier 2 or Tier 4.** Nothing about the +2 attribution touches them,
  and `--tier3-only` exists precisely so they are not re-fetched. Their numbers stand from 8b.
- **Did not chase the eight other Tier-3 rates.** They reproduced identically; there is nothing to
  fix.
- **Did not seed board generation.** Step 4's noise is annoying but the plan explicitly did not ask
  for it, and Phase F already established the house rule: do not add a seed parameter to production
  board generation for a measurement's benefit.
- **Did not re-measure over a second season.** Step 3's interval says that is the only thing that
  *would* move the number meaningfully, but it is a different, larger task than this phase, and
  2026 has not been played. Flagged below.

#### Handoff — this plan has no next phase

**Phases A, B, C, D, E and F are all complete as of 2026-08-18.** There is no Phase G. What follows
is for whoever picks up Prop Bingo next, not a queued task.

- **Everything in this plan is uncommitted working-tree state** (`git status` shows `M lib/*.ts`,
  `M package.json`, `M scripts/probe-nfl-flavor-squares.cjs`, plus six new `tests/` files and two
  new `docs/phase0-artifacts/` JSONs). Nothing has been committed by any phase. Committing is the
  user's call.
- **Gate commands, all green at hand-off:** `npx tsc --noEmit`, `npm run lint`,
  `npm run test:bingo-nfl` (244/244), `npm run test:bingo-mlb` (83/83), `npm run test` (full).
- **The one live-API thing a future session should redo before trusting these numbers:** re-run
  `npm run bingo:probe:nfl-flavor -- --season 2026 --tier3-only --tier3-sample 272 --json` once the
  2026 regular season completes, and pool it with 2025. Every Tier-3 rate in
  `lib/sportsBingoNflFlavor.ts` is a **single-season** rate — the file's own header says so — and
  `nfl_safety` at 12 events is the thinnest of them by an order of magnitude. Two seasons roughly
  halves its interval; nothing else will.
- **Phase C's carried MLB flag: investigated and FIXED, 2026-08-18** — see the section below. It
  was materially worse than the flag said.
- **If you add a consumer of `firstScoreKind`** (Phase D renamed its `+2` label to
  `"two_point_or_safety"`), note that the *label* and the *grading facts* are still two different
  things: grading attributes by play type via the two predicates E exported, the label does not.
  D's comment at `lib/sportsBingo.ts:~3136` says so; believe it.

---

## Addendum — Phase C's carried MLB flag, investigated and fixed (2026-08-18)

**Phase C flagged one line and guessed at its impact. Verified against the live API, the flag
understated the defect by a lot: no MLB player-prop square could grade at all.**

### What the live feed actually returns

Probed `/mlb/v1/games` and `/mlb/v1/stats` directly, 2026-08-18 (throwaway scripts, not committed,
key read via the repo's `--env-file=.env.local` convention and never printed):

| what the code read | what an MLB row carries |
|---|---|
| `game.visitor_team` | **absent** — it is `away_team` |
| `game.home_team_score` / `visitor_team_score` | **absent** — runs are at `home_team_data.runs` / `away_team_data.runs` |
| team `full_name` | **absent** — only `display_name` ("Kansas City Royals") and `name` (mascot only, "Royals") |
| `status` | `"STATUS_FINAL"`, not `"Final"` |

### Three defects, not one, and the flagged one was the unreachable third

1. **`pickBestMatchingBallDontLieGame` matched zero MLB games.** It read `game.visitor_team`
   directly → `getTeamDisplayName` returned `""` → `teamsMatch` rejects an empty string on its
   first line → the filter kept nothing → `null` for every MLB card. This gates
   `getMLBGamePlayerStatsSnapshot` entirely, so **every MLB player-prop square, and the late-scratch
   auto-swap, has been running on no data.** Phase C did not identify this.
2. **`isBallDontLieGameFinal` used `startsWith("final")`**, which `"STATUS_FINAL"` fails, so an MLB
   snapshot was never `finalized` — and `toMLBLiveScoreSnapshot` passes that straight into
   `completed`. Found by the new test, not by inspection. Phase C explicitly checked the *sibling*
   `includes("final")` in `normalizeBallDontLieScoreRow` and correctly cleared it, but never looked
   at this one.
3. **The flagged line** — `buildMLBGamePlayerStatsSnapshot`'s `parseScoreValue(game.home_team_score)`
   → `null` → `toMLBLiveScoreSnapshot` returns `null` on its null-guard, every time. Real, but
   **unreachable**: defect 1 meant the snapshot never got built. Fixing only what Phase C flagged
   would have changed nothing observable.

**Phase C's framing was also backwards.** It called `toMLBLiveScoreSnapshot` "MLB's real score
path" and `getScoresBySportKey` "a second, independent source". In fact `toMLBLiveScoreSnapshot`
was dead, and Phase C's own `getScoresBySportKey` fix is what gives MLB a working score path today.
The redundancy Phase 3's grading was designed around is only now actually present.

### What shipped

- **`lib/sportsBingo.ts`** — three small shared helpers next to `getTeamDisplayName`:
  `ballDontLieAwayTeam` (`visitor_team ?? away_team`), `ballDontLieHomeScore` /
  `ballDontLieAwayScore` (`*_team_score ?? *_team_data.runs`). Every score read in the file
  (4 snapshot builders + the NFL quarter reconciliation) and the matcher now route through them.
  Widening only — NBA/NFL rows win the first arm of every `??`, so those leagues are byte-identical.
- **`isBallDontLieGameFinal`** — `startsWith` → `includes`, with a docblock noting the sibling's
  whole-word `\bft\b` warning so nobody "tidies" this into a substring trap later.
- **`normalizeBallDontLieScoreRow`** — keeps Phase C's own `full_name ?? display_name ?? name`
  chain for team *names* (a scoreboard display name), now using the shared away-team and score
  helpers.
- **New `tests/lib.sportsBingo.mlb-row-shape.test.ts`** (14 tests), wired into
  `npm run test:bingo-mlb` (83 → 97 with the Phase E additions). Every fix carries a companion
  assertion proving the pre-fix read was broken — the old `visitor_team?.full_name ?? name` chain
  resolving to `""`, `home_team_score` being `undefined`, `startsWith("final")` being `false` on
  `"STATUS_FINAL"` — so the file demonstrates the defects rather than only asserting the cure.
- **`pickBestMatchingBallDontLieGame` and `buildMLBGamePlayerStatsSnapshot` are now exported.** They
  were private, which is precisely why a total failure in both went unseen; the export docblocks
  say so.

### Deliberately NOT done — one open product decision

**`getTeamDisplayName` still reads `full_name ?? name`, so MLB teams resolve to the mascot
("Royals") where NBA/NFL resolve to a full name.** Adding `display_name` to that chain is a
one-word change and was tried and reverted, for two reasons worth recording:

- It is **player-visible MLB copy** and changes the team names persisted on new cards — a product
  call, not a bug fix, and outside what fixing this flag required.
- **Measured cost, isolated by bisecting the change:** it is the *only* one of these fixes that
  moves the MLB board-composition snapshot in `tests/lib.sportsBingo.mlb-star-tilt.test.ts` (that
  fixture's stat rows carry `display_name` with no `name`, so team sides begin resolving where they
  previously did not, and webhook player-event squares enter the pool). All three shipped fixes are
  snapshot-neutral, which is what makes them safe to land together.

Nothing is broken by leaving it: `teamsMatch` normalizes both sides to the mascot via
`getTeamIdentityKey`, so "Royals" and "Kansas City Royals" match either way — pinned by a test.
The rationale lives in `getTeamDisplayName`'s docblock. **Someone should decide the copy question;
until then MLB reads as mascots.**

### A fourth defect, found only because the first three were fixed

**`isBallDontLieLineupStarter`, and the inverted late-scratch swap.** `/mlb/v1/lineups` rows carry
**no `starter` key** (verified live 2026-08-18, two games, 20 rows each). A starting batter is
identified by `batting_order` 1-9 and the starting pitcher by `is_probable_pitcher`. The code read
`row.starter === true`, so **every MLB player read as a non-starter**. NBA/WNBA are unaffected and
were checked, not assumed: their rows do carry the boolean (two archived games, 21 rows, exactly 10
`true` each).

Two consequences, the second serious:

1. The confirmed-starter set that boosts MLB star-prop ranking was always empty. Degraded
   selection; it fails soft by design (`catch` + "safely skip starter enforcement").
2. **It inverts `autoSwapLateScratchedStarSquares`**, which skips a square when its player *is*
   starting. With everyone a non-starter it would replace every star-branded home-run square on
   every MLB card with a team square — treating the whole lineup as late-scratched. **This was
   dormant only because the snapshot feeding it was unreachable, so fixing defects 1-3 would have
   activated it.** That is the single most important thing in this addendum: the row-shape fixes
   were not safe to land on their own.

Fixed with one shared predicate reading both vocabularies (`starter` boolean, else `batting_order`,
else `is_probable_pitcher`), applied at all four call sites — behavior-identical for NBA, since
those rows carry only the boolean.

### Verified end-to-end against a real completed game

Drove the **shipped** `pickBestMatchingBallDontLieGame` and `buildMLBGamePlayerStatsSnapshot`
against a live completed MLB game (Royals @ Angels, 2026-08-16), throwaway script, not committed:

| check | result |
|---|---|
| matcher found the game | yes |
| score parsed | 1 / 0 |
| `finalized` | true |
| player stat lines | 27 |
| lines with a resolved team side | **27 / 27** |
| lineup starters detected | **20 / 20** |
| batting/pitching values populated | 5 with hits, 5 with recorded outs |

The 27/27 team-side result also confirms the mascot-name decision above is safe in practice:
`teamsMatch`'s identity fallback resolves every row without `display_name` in the chain.

### Still not verified — what "working" does and does not cover

- **Board generation for MLB is confirmed working right now**: `npm run bingo:simulate -- --sports
  baseball_mlb --boards 4` → 15 games, 60 boards, **zero errors**, every board inside the
  0.20-0.30 band.
- **MLB settlement has never been exercised by any harness, and still isn't.**
  `bingo:simulate --backtest` **ignores `--sports` and is hardcoded to NFL**
  (`sportKey: "americanfootball_nfl"`, `scripts/simulate-bingo-boards.cjs:317`) — running it with
  `--sports baseball_mlb` silently returns NFL games, which is how this was found. And
  `gradeResolversAgainstCompletedMLBGame` passes `null` for the player-stats snapshot, so it is a
  score-and-team-event seam that cannot exercise player props either. **There is no MLB equivalent
  of `npm run bingo:validate:nfl`.** Building one is the obvious next piece of work.
- **`mlb_webhook_*` squares** settle off a live webhook stream, a separate system entirely
  untouched and unverified here.
- What is verified: every input those resolvers read now arrives correctly, proven against live
  data. What is not: the resolvers' own behavior on a real MLB board.

**The work that closes this is planned in `docs/mlb-prop-bingo-validation-plan.md`** (7 phases,
drafted 2026-08-18) — the missing `bingo:validate:mlb` harness, the NFL-hardcoded backtest, and two
correctness items this investigation surfaced but did not fix. The most important of those: **MLB
`player_prop` squares return `miss` on missing data where NFL returns `void`, so every MLB
player-prop square has been settling as a loss for the player.** See that plan's Phase 2.

---

## Phase F — Test-suite hygiene

**Carried from:** Phase 2's "Known flake" and Phase 6's missing-component-test note.

1. **`tests/lib.sportsBingo.nfl-star-tilt.test.ts` ~358, "stops tilting when the tier boosts are
   turned off"** — draws 30 unseeded random boards and asserts a fixed `0.08` margin. Reproduced
   both failing and passing in isolation. `lib/sportsBingo.ts` has 4 `Math.random()` sites and no
   seedable RNG. **Fix in the test, not in production code:** install a deterministic PRNG via
   `vi.spyOn(Math, "random")` in this file's `beforeEach`. Do not add a seed parameter to board
   generation for a test's benefit; do not just raise the board count (slower and still flaky).
2. **No test for `components/bingo/SportsBingoSelectSport.tsx`** — Phase 6 flagged that the
   `league.note ?? "Coming soon"` render has no fixture, only the route-level contract test. Add a
   small render test asserting `coming_soon` + `note` renders the note and never the string "Out of
   season". ~30 lines; it's the one surface where the two Phase 6 statuses could visibly recombine.

**Model:** Haiku 4.5 for F2; Sonnet 5 for F1 (the flake needs the spy wired so it survives the
file's `vi.resetModules()` between runs) · **Effort:** Low (~45 min total).

### Phase F — done, handoff to Phase D

**Status: complete, 2026-08-18.** All five gate commands green: `npx tsc --noEmit`, `npm run
lint`, `npm run test:bingo-nfl` (236/236), `npm run test:bingo-mlb` (83/83), plus a full
`npm run test` run (198 files, 1806/1806, 13 pre-existing skips unrelated to this phase).

**F1 — the `Math.random()` flake in `tests/lib.sportsBingo.nfl-star-tilt.test.ts`:**
- The file already had a seeded-PRNG helper (`installSeededRandom`, xorshift32) built for the
  separate "star-tier hoist is a pure refactor" snapshot test — no new helper needed, just reuse.
- Fixed the flaky test ("stops tilting when the tier boosts are turned off") by calling
  `installSeededRandom(0xf1a7)` at the top of its inner `runStarShare()` closure, so **both** the
  `boosted` and `flatWeights` runs draw off the identical random stream. This isolates the
  comparison to the one variable the test is actually about (the env-driven tier weights) instead
  of also absorbing run-to-run sampling noise across 30 boards — which is what made the fixed
  `0.08` margin flaky. Did not touch production code, per the plan's instruction — the fix is
  entirely inside the test file.
- **Verified the flake is gone, not just hidden:** ran the file 4 times back to back
  (`for i in 1 2 3; do npx vitest run tests/lib.sportsBingo.nfl-star-tilt.test.ts; done`, plus the
  gate-command run) — identical 12/12 pass every time, as expected now that both runs share a
  seed. Did **not** re-run the old unseeded version to reproduce the failure fresh (the plan
  already recorded "reproduced both failing and passing in isolation" as the carried finding), so
  there is no fresh before/after failure log beyond what the plan doc already states — only
  repeated-pass evidence for the fix.
- No other test in the file was touched. The three tests that need real (or their own
  independently-seeded) randomness — "puts stars on boards materially more often than chance,"
  "does not deal the same star set twice," and the hoist snapshot test — were left exactly as
  they were.

**F2 — new render test for `components/bingo/SportsBingoSelectSport.tsx`:**
- **New file `tests/components.bingo.SportsBingoSelectSport.test.ts`** (3 tests, `@vitest-environment
  jsdom`, `createElement` not JSX per the repo's `.test.ts`-only glob — same convention as
  `tests/admin-modal-sheet.a11y.test.ts`). Mocks `next/navigation`'s `useRouter` (no existing
  precedent in the repo for that mock; grepped first, found none) and stubs `fetch` for
  `/api/bingo/leagues` per test.
  1. `coming_soon` + a custom `note` renders that note, and asserts `"Out of season"` never
     appears — the exact recombination Phase 6 flagged as untested.
  2. `coming_soon` with no `note` falls back to the literal `"Coming soon"` string.
  3. `out_of_season` still renders its own `"Out of season · {resumesLabel}"` copy, unaffected by
     the `coming_soon` branch — a guard against the two statuses' render paths merging by future
     accident.
- **Proven to fail pre-fix**, per the plan's per-phase standard: temporarily reverted
  `SportsBingoSelectSport.tsx`'s `league.note ?? "Coming soon"` to a bare `"Coming soon"` literal
  (`sed`, then restored from the `.bak` immediately after), re-ran the new test file — test 1 failed
  (`waitFor` timeout on `"Kicks off in September"` never rendering, board showed literal "Coming
  soon" instead) while tests 2 and 3 still passed, confirming the test isolates exactly the line
  Phase 6 named. Restored the component file immediately after (verified via the same command,
  not a separate `git checkout`).
- **Not wired into a named `test:*` script** — unlike Phase B/C's tests, this one isn't
  NFL/MLB-bingo-specific or league-catalog-wide, so there's no natural existing script family for
  it (`test:bingo-nfl` / `test:bingo-mlb` are both scoped to `lib.sportsBingo*`/`lib.sportsBingoOdds*`
  files, not `components/`). It runs automatically under the bare `npm run test` / `vitest run`
  (matches the config's `tests/**/*.test.ts` include glob) — confirmed present in the 198-file,
  1806-test full run above. If a future phase wants a `test:bingo-components` grouping, this would
  be the first file in it.

**Handoff to whoever runs Phase D** (`firstScoreKind` mislabels a two-point conversion as a
safety — pick D1, widen the union at `lib/sportsBingo.ts:869` and rename the label assigned at
`:3133`, per the plan; D2 is a no-op fallback):
- **No file/line overlap with Phase F.** Phase F only touched
  `tests/lib.sportsBingo.nfl-star-tilt.test.ts` (one closure, no production code) and added one new
  test file under `tests/`. Phase D's targets (`lib/sportsBingo.ts:869` and `:3133`) are untouched by
  Phase F, but **do re-grep both line numbers before trusting them** — Phase C (two phases back)
  already documented that its own edits to `lib/sportsBingo.ts` shifted line numbers by roughly -13
  in the file's back half; Phase D's target lines predate both Phase B and Phase C's edits to this
  same file and were never re-verified against current line numbers by any phase since. Don't
  assume they still land at 869/3133.
- Re-run all five gate commands (`npx tsc --noEmit`, `npm run lint`, `npm run test:bingo-nfl`,
  `npm run test:bingo-mlb`, and ideally the full `npm run test` since Phase F added a file outside
  those two named scripts) as your baseline before starting; they're green as of this hand-off.
- Per the plan's own note, Phase D is genuinely optional/low-risk (D1 is a pure internal rename,
  type-checker-verified) — after D, only Phase E (Opus 5, real API cost, must sequence after Phase A
  since it measures against constants Phase A touched) remains to close out this plan.

---

## Sequencing

```
A ──> E          (E measures against constants A touches)
B ──> C          (B decides which leagues C must parse; C's target is what B leaves behind)
D, F              independent — land any time
```

Suggested order: **A → B → C → F → D → E.** A/B/C/D/F are all Sonnet 5 and could be one or two
sittings; E is the only one worth Opus 5 and the only one with real API cost.

**Gate every phase on the same four commands** the parent plan used:
`npx tsc --noEmit`, `npm run lint`, `npm run test:bingo-nfl` (236), `npm run test:bingo-mlb` (78).
Per the parent plan's standard: each phase needs a test proven to fail against the pre-fix code.
