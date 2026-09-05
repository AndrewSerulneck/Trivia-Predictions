# Prop Bingo — Making NFL Boards Actually Playable

**Created:** 2026-09-05. **Owner doc for the activation half of `docs/prop-bingo-nfl-plan.md`.**

That plan (Phases 0–9, all complete 2026-08-17) built the NFL board: market-derived core squares,
an eight-slot star-tilted prop mix, 44 flavor squares, NFL grading/settlement, and a 0.2561 realized
win rate backtested over the full 2025 regular season (1,140 boards, 272 games). It deliberately did
**not** turn NFL on — `NEXT_PUBLIC_BINGO_NFL_ENABLED=false` — because at the time no NFL game existed
inside the lookahead window, so nobody had ever watched a real NFL board render or resolve.

That window opens this week. This plan is the remaining work: prove the board on real Week 1 data,
close the three parity gaps that make an NFL board feel worse than an NBA/MLB board, flip the flag,
and re-earn the win rate on 2026 numbers.

---

## What is verified true today (probed live 2026-09-05, not assumed)

| Check | Result |
|---|---|
| `npm run bingo:probe:nfl` | **15 Week 1 games** in the next 10 days; tier verdict **GOAT** (games/odds/props/stats/plays all 200) |
| `/nfl/v1/odds` | **8 vendors** per game (DK, FD, Fanatics, Caesars, BetRivers, BetMGM, Kalshi, Polymarket); spread + total + moneyline on every probed game |
| `/nfl/v1/odds/player_props` | **562–1,450 rows per game**, 20–32 distinct players, 17–18 prop types — including `anytime_td_1q…4q` — posted **5 days before kickoff** |
| `npm run bingo:simulate` (forward) | NFL `games: 0` — correct: the board catalog uses a **36h** lookahead (`BINGO_LOOKAHEAD_HOURS`), and the opener is 2026-09-09 |
| `npm run test:bingo-nfl` | **255/257.** The 2 failures are both the star-index freshness tripwire firing on a stale committed snapshot (generated 2026-08-17) — one root cause, Phase 0 below |
| `npm run bingo:stars:mlb` tripwire | Also red, same cause |
| BDL webhooks | The webhook route (`app/api/webhooks/balldontlie/route.ts`) handles **NBA/WNBA/MLB only**; the NFL API doc lists **no webhook surface** |
| `/nfl/v1/player_injuries` | Exists in the feed, **referenced nowhere in the codebase** |

**Week 1 calendar (from the live feed):** Wed **9/9 8:20pm ET** NE @ SEA · Thu **9/10 8:35pm ET**
SF @ LAR · Sun **9/13** 13-game slate. With the 36h lookahead, the first NFL row becomes selectable
around **Tue 9/8, ~8:20am ET**.

---

## The parity bar — what "comports with the other boards" means, concretely

Every item below is something an NBA/WNBA/MLB board already does. NFL must match all nine before it
ships. Three of them are **not** met today.

| # | Requirement | NFL status |
|---|---|---|
| 1 | 25 squares: 1 free + 24 live (NFL: 10 core ladder / 6 special / 8 player prop) | ✅ built |
| 2 | Board win rate inside the 20–30% band | ✅ 0.2561 backtest — **re-prove on 2026 data (Phase 6)** |
| 3 | Prices de-vigged off a real market consensus, not a hand sigmoid | ✅ built (8 vendors) |
| 4 | Star-tilted props so the board carries recognisable names | ✅ built — **snapshot is stale (Phase 0)** |
| 5 | Squares resolve *through* the game, not all at the whistle | ⚠️ **unmeasured — `team_stats` mid-game population is still 8a's open unknown (Phase 5)** |
| 6 | Live stat pops / ActionPop celebrations while the game runs | ❌ **NFL is silent — no webhook, no `live-stats:` broadcast (Phase 3)** |
| 7 | A prop is never assigned to a player who won't play | ❌ **no inactives handling; MLB has late-scratch swap, NFL has nothing (Phase 4)** |
| 8 | Missing data voids, never mis-settles as a miss | ✅ built (`missing-data-voids` coverage) |
| 9 | Board renders correctly portrait **and** in landscape/PWA | ⚠️ **never observed on an NFL board (Phase 2)** |

---

## Phases

Ordering is calendar-driven: Phase 0 now, Phase 1 from Tue 9/8, Phase 2 is the go/no-go, Phases 3–4
are the parity gaps (both can be done before or after the flip — see "Sequencing decision"), Phase 5
needs a live game, Phase 6 needs three weeks of results.

### Phase 0 — Green the tripwires and refresh the star indexes
**Model: Sonnet 5 · Effort: low (~45 min). Do this today.**

Both committed star snapshots went stale (2026-08-17) and both freshness tripwires are red right
now. This is exactly the failure they exist to catch, and NFL boards would ship Week 1 tilted by an
index nobody re-pulled.

- `npm run bingo:stars:nfl` and `npm run bingo:stars:mlb`; review the diff report, commit both
  snapshots (`data/sports-bingo/nfl-star-index.json`, `mlb-star-index.json`).
- Re-run `npm run test:bingo-nfl` (expect **257/257**) and `npm run test:bingo-mlb`.
- Baseline `npx tsc --noEmit`, `npm run lint`, `npm run test` and record the result — every later
  phase compares against it.

**Done when:** both tripwire suites are fully green with no bound widened.

#### Phase 0 — AS BUILT (2026-09-05, Sonnet 5)

**Status: DONE.** Commit: see `git log` for "Phase 0: refresh NFL + MLB star index snapshots".

What was done:
- Ran `npm run bingo:stars:nfl:dry-run` first, then `npm run bingo:stars:nfl` and
  `npm run bingo:stars:mlb`. Both snapshots rewritten:
  - `data/sports-bingo/nfl-star-index.json` — **timestamp-only change**
    (`generatedAt` 2026-08-17 → 2026-09-05T23:57:10Z). The 2026 NFL season has not started, so
    `current.players` is still `[]` and the `prior` (2025) block is byte-identical — the script
    reported `0 entrants / 0 drop-offs / 0 movers`. Expected: the freshness tripwire keys on
    `generatedAt` age, not content, so bumping the timestamp is the whole fix until Week 1 stats
    land. **The next real NFL refresh (with actual 2026 data) should happen after Week 1 games
    settle** — fold it into Phase 1 or Phase 5.
  - `data/sports-bingo/mlb-star-index.json` — **large real diff** (~7.4k lines each way). MLB 2026
    is mid-season so `current` percentiles genuinely moved; 1454 current players scored. Spot-checked
    top names (Pete Crow-Armstrong, Caminero, Yordan Alvarez, Matt Olson, Misiorowski, Cease) — all
    plausible 2026 stars. No schema change, no bound touched.
- `npm run test:bingo-nfl` → **257/257** (was 255/257; the 2 star-index-freshness failures are gone).
- `npm run test:bingo-mlb` → **142/142** green.

**Baseline gate results (record these — every later phase compares against this):**
| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **exit 0** (clean). Emits one noise line `.next/types/routes.d 2.ts(240,8): Duplicate identifier 'LayoutProps'` from a stale duplicated file in `.next/` — not a source error, exit code is 0. `rm -rf .next` clears it if it bothers you. |
| `npm run lint` | **exit 0**, clean. |
| `npm run test` | **1 pre-existing failure**, everything else green: 1920 passed / 1 failed / 13 skipped. |

**The one pre-existing test failure — NOT introduced by Phase 0, do not chase it in a bingo phase:**
`tests/lib.billingDiscounts.test.ts > applyDiscountToSubscription … > "pushes current_period_end
forward for free months"`. It asserts `current_period_end === "2026-11-30T00:00:00.000Z"` but the
code now returns a `now()`-relative date (~2026-12-05). It's a time-bomb test (hardcoded expected
date that expired), in the **billing** surface, unrelated to sports bingo. Confirmed it fails on a
clean `git stash` of the Phase 0 changes too. Flag to Andrew separately; it should not block the
NFL activation phases.

**Handoff to Phase 1 (earliest Tue 9/8, when NFL enters the 36h lookahead window):**
- Working tree is clean after the Phase 0 commit. Nothing half-done.
- Start Phase 1 by re-running `npm run bingo:probe:nfl` and `npm run bingo:simulate` — the plan's
  "verified true today" table was probed 2026-09-05; re-confirm game counts before auditing boards.
- When you dump Week 1 boards, remember the NFL `current` star block is still empty — star tilt is
  running entirely off the 2025 `prior` block right now. That's by design for Week 1 (plan §Phase 1
  bullet: "star names should read as recognisable 2026 NFL players, not 2025 ghosts" — with no 2026
  data yet, they will be 2025 names; note it, it's not a bug to fix in Phase 1).
- Consider running `npm run bingo:stars:nfl` again after the first Sunday slate settles so the
  `current` block starts populating; that's a judgement call for whoever owns Phase 1/5.

---

### Phase 1 — Audit a real Week 1 board offline, before anyone can see one
**Model: Sonnet 5 · Effort: medium (~2h). Earliest Tue 9/8 (when NFL enters the 36h window).**

The board has only ever been measured in aggregate. This phase looks at individual Week 1 boards
against the parity bar — it is the "entertaining, competitive, interesting" check, done privately.

- `npm run bingo:simulate` → NFL must now report real games/boards; confirm median inside 20–30%
  and `inTargetBand` comparable to MLB's 0.97.
- Dump 3–4 full generated boards for real Week 1 matchups (NE @ SEA plus one Sunday game) to JSON
  in the scratchpad and audit each against the parity bar, item by item:
  - 1 free + 24 live squares; bucket mix **2 moneyline / 3 spread / 3 total / 2 team-total / 6
    special / 8 prop**;
  - **4–5 star-tier props**, ≥2 non-star (Phase 9b's reservation) — and the star names should read
    as recognisable 2026 NFL players, not 2025 ghosts;
  - no player appears on two squares; no square outside `CORE_SQUARE_MIN/MAX` (the dead 85–93%
    ladder rungs Phase 3/4 flagged);
  - **label length** — every label must be legible in a 5×5 mobile grid cell. NFL prop labels
    ("J. Jefferson 75+ Rec Yds") are the longest of any league; this has never been eyeballed.
  - a spread of squares that can resolve **early** (1Q anytime-TD props are posted — the feed
    confirms `anytime_td_1q`), not a board that can only move in the 4th.
- Record findings in a short `docs/prop-bingo-nfl-week1-audit.md`; anything failing is a bug fix
  inside this phase, not a new phase, unless it is one of Phases 3–5.

**Done when:** three real Week 1 boards pass all nine parity items that can be judged offline
(1, 2, 3, 4, 8) and the label/pacing read is written down.

---

### Phase 2 — Live browser + device pass, then the flag flip
**Model: Sonnet 5 for the pass · Effort: medium (~2–3h) · the flip itself is Andrew's call.**

This is Phase 6's carried-forward item from the original plan, and the actual go/no-go.

- Run a dev server with `NEXT_PUBLIC_BINGO_NFL_ENABLED=true`, real test user + venue, cookies set
  per `CLAUDE.md`'s auth-storage contract (`scripts/print-test-auth-cookies.cjs`).
- Playwright: picker shows NFL **enabled** → select NE @ SEA → generate a board → board renders →
  square states/labels correct → back navigation via `ExitBackButton` behaves.
- **Landscape/PWA is not headless-verifiable** (`CLAUDE.md`): add an NFL line to
  `docs/bingo-fullscreen-pwa-device-checklist.md` and have Andrew do the installed-PWA landscape
  pass on a real phone. `npm run test:pwa-contract` if any bingo chrome is touched.
- Then flip `NEXT_PUBLIC_BINGO_NFL_ENABLED=true` in Vercel (prod). One flag, reversible, no code
  change on either side.
- **Separate decision, same session:** `NEXT_PUBLIC_BINGO_SEASON_GATING_ENABLED`. With it off, NBA
  is clickable in September and dead-ends on "no upcoming games". Recommend flipping it **on** at
  the same time, but verify `GET /api/bingo/leagues` output first (expected today: NBA
  `out_of_season · Returns October 2026`, WNBA/MLB/NFL `in_season`).

**Done when:** an NFL board has been generated and played on a real device, and the flag is on in
prod with the rollback (flip it back) written into the run log.

---

### Phase 3 — Make NFL boards pop: live-event parity
**Model: Opus 5 · Effort: medium–high (~1 day).**

The biggest experience gap, and invisible in every test. NBA/WNBA/MLB squares tick *and* fire
ActionPop celebrations, driven by `live-stats:{sportKey}` broadcasts emitted from the BDL webhook.
**NFL has no webhook anywhere in BDL**, so an NFL board updates only when the 1-minute
`/api/cron/bingo-progress` sweep flips a square — no stat pops, no "Mahomes just threw a TD" moment.
Squares still move; the board feels dead between them.

- Emit the same `live-stats:americanfootball_nfl` broadcast from the NFL branch of
  `refreshSportsBingoProgress`, diffing the memoized `/nfl/v1/stats` snapshot against the previous
  sweep and publishing rows in the existing `LivePlayerStatRealtimeRow` shape — the client
  subscription is already sport-keyed and needs **no change**.
- Extend `classifyLiveDeltaEvent` with NFL stat deltas: passing/rushing/receiving TDs, 100-yard
  rushing/receiving crossings, interceptions, sacks, made FGs.
- Keep the cost discipline the NFL path already has: one `/nfl/v1/stats` call per *game* per sweep,
  memoized across cards. **Do not add a cron entry** — `vercel.json` is a hard boundary; any
  cadence change happens inside the existing 1-minute sweep.
- Tests: a new `tests/lib.sportsBingo.nfl-live-events.test.ts` covering delta classification and
  the "no previous snapshot → no event" case (the same starvation bug the client comment documents).

**Why Opus:** it threads new state (previous-snapshot deltas) through an 11.5k-line module that is
also the settlement path, with a broadcast contract shared with three other leagues. Getting the
throttling and the no-double-fire semantics right is the whole job.

---

### Phase 4 — Inactives and late scratches
**Model: Sonnet 5 · Effort: medium (~half day).**

MLB has `autoSwapLateScratchedStarSquares`; NFL has nothing. NFL inactives drop ~90 minutes before
kickoff, and a Sunday board generated Saturday can hand a player eight prop squares' worth of
attention on someone who is inactive. Today that square voids at settlement — safe, but a dead
square on a 24-square board is a quarter of a line gone.

- **Pre-generation filter:** pull `/nfl/v1/player_injuries` (24h-cached, same shape as the star
  index cache) and drop players listed Out / IR / Doubtful from `buildNFLPlayerPropCandidates`.
- **Post-lock swap:** mirror MLB's window logic — inside the kickoff window, a prop square whose
  player is inactive per the gameday stats snapshot gets swapped for an equivalently-priced
  replacement, with the same notification path MLB uses.
- Void stays the safety net for everything the swap misses; never settle a scratched player `miss`.
- Tests: mirror `tests/lib.sportsBingo.missing-data-voids.test.ts` for NFL, plus a swap test.

---

### Phase 5 — Week 1 live observation (the part no simulator can do)
**Model: Opus 5 · Effort: medium (~3–4h of live watching + analysis). Windows: Wed 9/9 8:20pm ET, Sun 9/13.**

Phase 8a's fifth unknown — *does `/nfl/v1/team_stats` populate mid-game or only at final?* — was
declared "structurally unanswerable until a real NFL game is being played." That game is Wednesday.
The answer decides whether Tier-1 flavor squares (up to `BINGO_NFL_TIER1_MAX_PER_BOARD=3` per board)
resolve live or all snap at the whistle, which is parity item 5.

- Poll `/nfl/v1/team_stats` and `/nfl/v1/stats` for the live game every ~2 minutes through the
  opener; record when each field first becomes non-null.
- Build a **square-pop timeline** for a real generated board: how many squares resolve per quarter.
  Target for the parity bar: the board is visibly moving by mid-Q2, not back-loaded.
- Watch settlement latency end to end (stat event on TV → square flips) and count resolver misfires
  and voids against `npm run bingo:validate:nfl` after the final.
- Decide, with evidence: keep/cap/re-gate Tier-1 squares; ship or drop **square 45** (the
  win-probability comeback square, deferred in 8b behind exactly this check).
- Write `docs/prop-bingo-nfl-week1-live-findings.md`.

---

### Phase 6 — Re-earn the win rate on 2026 data
**Model: Opus 5 · Effort: medium (~4h). After Week 3 (≈9/27).**

Every constant behind an NFL board is calibrated to the 2025 season. Three weeks of 2026 results is
the first real check, and the instrument already exists.

- `npm run bingo:calibrate:nfl` (per-family assigned-vs-realized replay) over Weeks 1–3 and
  `npm run bingo:simulate -- --backtest`.
- Re-tune **only** families with mean |gap| > 0.05 — Phase 8c's own standard, which took mispriced
  families 8 → 2. Do not chase noise on a three-week sample; note anything borderline instead.
- Validate `BINGO_NFL_MILESTONE_DEVIG_FACTOR` (0.92) against realized hit rates — flagged as the
  least-evidenced NFL constant in the original plan.
- Confirm the realized (not predicted) board win rate is inside 20–30%.

---

### Phase 7 — Ops durability
**Model: Sonnet 5 · Effort: low (~1h).**

- **The star-index refresh is now a two-league manual obligation and it already lapsed** — that is
  what Phase 0 is cleaning up. Propose a cron to Andrew (`vercel.json` is a hard boundary, so this
  is a proposal, not a change) or a standing weekly reminder. The 24h live cache means the product
  is correct without it; the snapshot is a diff artifact, never a runtime fallback.
- Update `SYSTEM_CONTEXT.md` §Sports Bingo — it still says "live NBA, WNBA, and MLB games" and
  describes settlement as webhook-driven, which is not true for NFL.
- Add the NFL activation + rollback line to a run log, and record the flag state in
  `docs/prop-bingo-nfl-plan.md`'s header so it stops saying NFL is dark.

---

## Sequencing decision for Andrew

Two defensible orders:

- **Ship early (recommended):** 0 → 1 → 2 (flip for Week 1) → 5 (live observation) → 3 → 4 → 6 → 7.
  NFL is live for the Week 1 slate, which is the biggest audience moment of the season, and Phase 5
  gets real observation from a real venue. The cost: Week 1 boards have no stat pops (item 6) and no
  inactives handling (item 7).
- **Ship complete:** 0 → 1 → 3 → 4 → 2 (flip for Week 2 or 3) → 5 → 6 → 7. Full parity on day one,
  at the cost of missing Week 1.

The middle path — flip for Week 1 **and** land Phase 4 first, since inactives are a correctness
issue and Phase 3 is a polish issue — is what I'd actually do if Phase 4 can be done by Tuesday.

---

## What must not break

- `vercel.json` and `lib/supabaseAdmin.ts` are untouched by every phase here.
- No new middleware; `proxy.ts` unchanged.
- The flag contract stays exactly as built: off = today's behavior, fully inert, no code change on
  either side of the switch. Rollback for the whole activation is one env var.
- NBA/WNBA/MLB board generation, pricing and settlement are not touched by any phase except 3 (which
  adds an NFL branch to a shared function) and 0 (which refreshes the MLB snapshot).
- Gate commands after every phase: `npx tsc --noEmit`, `npm run lint`, `npm run test:bingo-nfl`,
  `npm run test`. `npm run test:pwa-contract` if Phase 2 touches bingo chrome.

## Model and effort summary

| Phase | Work | Model | Effort |
|---|---|---|---|
| 0 | Refresh star indexes, green the tripwires | Sonnet 5 | Low (~45m) |
| 1 | Offline audit of real Week 1 boards | Sonnet 5 | Medium (~2h) |
| 2 | Live browser + device pass, flag flip | Sonnet 5 | Medium (~2–3h) |
| 3 | NFL live stat broadcasts + ActionPop parity | **Opus 5** | Medium–high (~1d) |
| 4 | Inactives filter + late-scratch swap | Sonnet 5 | Medium (~4h) |
| 5 | Week 1 live observation, Tier-1 + square 45 decision | **Opus 5** | Medium (~3–4h, live window) |
| 6 | Realized calibration on 2026 results | **Opus 5** | Medium (~4h) |
| 7 | Ops, docs, refresh cadence | Sonnet 5 | Low (~1h) |

**Opus for 3, 5 and 6 only.** Those three are judgment work: threading new realtime state through
the shared settlement path, reading a live feed's mid-game behavior and deciding what ships off it,
and deciding which calibration gaps are signal on a three-week sample. Everything else is mechanical
work into a codebase that already has the pattern — Sonnet 5 is the right call and Opus would be
waste.
