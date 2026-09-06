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
| 6 | Live stat pops / ActionPop celebrations while the game runs | ⚠️ **built 2026-09-05 (Phase 3) — sweep-driven `live-stats:` broadcast, never seen on a live NFL game (confirm in Phase 5)** |
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

#### Phase 1 — AS BUILT (2026-09-05, Sonnet 5)

**Status: DONE for the games whose props are posted; one item deferred to a Tue 9/8 re-run.**
Full write-up: **`docs/prop-bingo-nfl-week1-audit.md`**. Raw 24-board data:
`docs/phase0-artifacts/nfl-week1-board-audit-2026-09-05.json`. New tool:
`scripts/audit-nfl-week1-boards.cjs`.

**Timing caveat that shaped everything:** this was run **2026-09-05, i.e. 4–8 days before
kickoff**, not on Tue 9/8. Consequence: the Sunday-slate yardage over/under prop markets are **not
posted yet**, so 2 of the 4 audited games had a TD-only prop pool. The opener (NE @ SEA), whose
props *are* fully posted, is the clean read and passes every offline parity item.

**How it was run** (the forward `bingo:simulate` path is blocked two ways for pre-game-day NFL):
- `BINGO_LOOKAHEAD_HOURS` is a **hardcoded `const = 36`** in `lib/sportsBingo.ts`, not
  env-configurable. It was temporarily set to `240`, the audit run, then **reverted** — working
  tree is clean except the new untracked `.cjs` script (verified via `git status`).
- `listSportsBingoGames` *also* filters to games whose local date == today, so
  `npm run bingo:simulate` still reports NFL `games: 0` even with a wide lookahead. Its
  `inTargetBand` metric is unavailable until an actual NFL game day. The audit script calls
  `generateSportsBingoBoard({ gameId })` directly (explicit id bypasses the today-filter) with ids
  from `npm run bingo:probe:nfl`, and computes the win-rate distribution over 24 boards instead.

**Parity-bar result (offline items 1, 2, 3, 4, 8):**
| Item | NE @ SEA (pool 59) | TB @ CIN (pool 30) | NO @ DET (pool 18, TD-only) | BAL @ IND (pool 16, TD-only) |
|---|---|---|---|---|
| 1 mix 2/3/3/2/6/8 | ✅ exact ×6 | ✅ exact ×6 | ❌ 4 prop / 8–10 special | ❌ 4 prop / 8–10 special |
| 2 win rate 20–30% | ✅ 0.218–0.293 | ✅ 0.214–0.292 | ✅ 0.223–0.268 | ✅ 0.226–0.300 |
| 3 de-vigged consensus | ✅ | ✅ | ✅ | ✅ |
| 4 star tilt, ≥2 non-star | ✅ | ✅ | ⚠️ fewer stars (thin pool) | ⚠️ fewer stars (thin pool) |
| 8 voids | n/a offline | | | |

All 24 boards' predicted win rate landed 0.214–0.300, median ≈ 0.25. Phase 1's "three boards"
bar is met by the 12 NE @ SEA + TB @ CIN boards.

**Findings (ranked; full detail in the audit doc):**
1. **Thin prop pool → prop bucket underfilled, specials backfill to 8–10 per board** on games
   whose yardage props aren't posted yet. NE @ SEA (full pool) hits 8/8 props exactly, so this is
   *expected* to self-resolve during kickoff week — **must be re-verified Tue 9/8.** If it
   persists, the uncapped special-backfill is a real bug (a board with 10 correlated game-script
   specials). Fix deferred pending the re-run.
2. **No roster/team gate on prop candidates.** The per-game feed 4–8 days out lists players on
   neither team — **A.J. Brown, Romeo Doubs, Rashid Shaheed landed on NE @ SEA boards.**
   `teamName` is resolved but never used as a filter. **Fold into Phase 4:** drop a prop whose
   `teamName` matches neither side (only when `teamName` is present). May self-clean by Tue 9/8.
3. **`anytime_td_1q…4q` markets are posted but never become squares** (allowlist has only
   full-game `anytime_td` + `first_td`). Early board movement rides on ~2 first-TD squares/board.
   **Decision for Andrew / Phase 3 owner:** accept, or add quarter-scoped TD squares.
4. **≤2 prop squares per player is by design** (shared `pickCandidateSet` cap) but the Phase 1
   checklist says "no player on two squares." Saw Chase Brown on `first_td` + `anytime_td` at
   once (near-perfectly correlated). Reconcile the doc or schedule a shared-function change —
   Andrew's call (touching `pickCandidateSet` is out of scope for Phases 1/2/4).
5. **Label length 61–63 chars** on `special` / first-TD templates — longest of any league, never
   seen in a real 5×5 cell. **Phase 2's device pass must check these in-cell** and shorten
   templates if they wrap/truncate.

**Gates (vs Phase 0 baseline — all match):** `npx tsc --noEmit` exit 0 (after `rm -rf .next`);
`npm run lint` exit 0; `npm run test:bingo-nfl` **257/257**; `npm run test` 1920 pass / 1 fail / 13
skip — the 1 failure is the pre-existing `billingDiscounts` date time-bomb Phase 0 documented.

**Follow-up done same day (2026-09-05), at Andrew's request — "don't wait for live data":**
- **Historical board audit** (`scripts/audit-nfl-historical-boards.cjs`, new) over 2025 completed
  games. Historical boards have **no player-prop squares** (`/nfl/v1/odds/player_props` is
  live-only — hard limit, `lib/sportsBingo.ts:7959`), so this audits the 16 core/special squares +
  settlement. **Settlement is clean** (0.6–0.9% void, 0% pending across ~1,440 graded squares);
  prop-free boards still price into the band (0.21–0.30).
- **Full-season backtest** `npm run bingo:simulate -- --backtest --sports americanfootball_nfl
  --seasons 2025 --weeks 1..18 --boards 4`: **1,140 boards, realized win rate 0.2667**,
  `inTargetBand: 1.0`, ungraded 0.64%. Matches the original plan's 0.2561 — nothing regressed.
- **Label shortening (finding #5):** 13 `nfl_*` templates in `buildSquareLabel` shortened + an
  NFL-only short form for the shared `spread_keep_close` label (NBA/MLB byte-identical). Max
  label **63 → 48 chars**, p90 44 → 36 (measured over 60 historical boards). One family left at
  43–48 (`"<Team> are held to 300 total yards or fewer."` in `lib/sportsBingoNflFlavor.ts`) —
  deferred to a future Phase 8b flavor pass. `tests/lib.sportsBingo.nfl-prop-mix.test.ts:186`
  updated for the `first_td` label. All gates re-run green (NFL 257/257, MLB 142/142, full
  1920/1/13). Artifacts: `docs/phase0-artifacts/nfl-historical-board-audit-2025-weeks-1-10-18.json`,
  and the backtest JSON in the run output.

**Handoff to Phase 2:**
- **Re-run the audit first thing on Tue 9/8** (NFL will be naturally inside the 36h window by
  ~8:20am ET, so no lookahead edit needed):
  `node --env-file=.env.local --conditions react-server --import tsx scripts/audit-nfl-week1-boards.cjs --games <ids from bingo:probe:nfl> --boards 6 --out <scratch>.json`.
  Confirm findings #1 and #2 have cleared (full prop pools, on-roster players only). Also re-run
  `npm run bingo:simulate` **on Wed 9/9 or Sun 9/13** — it will finally score NFL that day; check
  median ∈ 20–30% and `inTargetBand` comparable to MLB's ~0.97.
- Findings #1 and #2, if still present Tue 9/8, are **Phase 2 blockers** (parity item 1 +
  correctness) — do not flip the flag with off-roster stars on boards or 10-special boards on the
  Sunday slate.
- Findings #3 and #4 are **decisions, not blockers** — surface them to Andrew as part of the
  go/no-go, don't hold the flip on them.
- Finding #5 (labels) is a **Phase 2 in-scope check** — it's exactly what the live browser/device
  pass is for.
- The audit script (`scripts/audit-nfl-week1-boards.cjs`) is new and untracked. Commit it with the
  Phase 1 docs (audit doc + raw JSON artifact) so Phase 2 can re-run it. Its star-tier column is a
  name-recognition proxy vs the 2025 index; trust the generator's own `[sportsBingo] nfl_star_mix`
  log line for the real within-game tiering.
- The NFL `current` star block is still empty (2026 season hasn't started) — star tilt runs off the
  2025 `prior` block, by design for Week 1. Consider `npm run bingo:stars:nfl` after the first
  Sunday slate settles so `current` starts populating (judgement call, owned by Phase 1/5).

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

#### Phase 2 — PARTIAL (2026-09-05, Sonnet 5) — headless browser pass done; prod flip + device pass still open

**Why partial:** the prod flag flip is a Vercel dashboard action (no CLI in this environment,
`.env.local` is a hard boundary) and there is **no NFL game inside the 36h board window until
Wed 9/9** — `BINGO_LOOKAHEAD_HOURS` is a hardcoded `const = 36` and `listSportsBingoGames` also
filters to games starting *today*, so the opener (9/9 8:20pm ET) is not pickable through the real
UI until 9/9. The headless pass below forced the flag on and temporarily widened the lookahead
(reverted immediately after — working tree clean, `= 36` restored) to seed and drive one real
NE @ SEA board.

**What was verified (local dev server, `NEXT_PUBLIC_BINGO_NFL_ENABLED=true`
`NEXT_PUBLIC_BINGO_SEASON_GATING_ENABLED=true`, Chrome via Playwright, 390×844):**
| Check | Result |
|---|---|
| `GET /api/bingo/leagues` with the flag on | NBA `out_of_season · Returns October 2026`; WNBA / MLB / **NFL `in_season`** — exactly the plan's expected output. NFL is **not** `coming_soon` (that's the flag-off state). |
| Sport picker (`/bingo/select-sport`) | NFL tile visible and enabled, no "Coming soon" note. |
| Board render (`/bingo/home?cardId=…`, seeded NE @ SEA board, `boardProbability` 0.209) | All 25 squares render in the 5×5 grid; center FREE with check; Board Progress + Legend panels render. Screenshot: `scratchpad/02-board-portrait.png` (kept for this write-up only). |
| **Label legibility (Phase 1 finding #5)** | Seeded board max label **47 chars** ("TreVeyon Henderson: at least 8 receiving yards."), p90 45, mean 34 — matches Phase 1's post-shortening measurements. In-cell: labels **wrap to ≤4 lines, no mid-word clip, zero vertical overflow** (`scrollHeight ≤ clientHeight` on all 25 cells). Finding #5 reads as **resolved** at portrait 390px. |
| `ExitBackButton` | Present top-left, 44×44, `aria-label="Back to venue"`. The board opens as a **modal overlay** on `/bingo/home`; dismiss order is ✕ Close (top-right, closes the overlay) → then the top-left Back button → navigates to `/venue/venue-pacific-street`. Confirmed working. |
| Browser landscape | Split board/panel layout renders cleanly, labels fit at the smaller font (`scratchpad/04-board-landscape.png`). **Not** the installed-PWA landscape surface — that stays device-only. |

**Findings (none blocking the flip):**
1. **Header truncation** — the board modal + the `/bingo/home` card button both show
   "New England Patriots vs. S…" (ellipsis). Cosmetic; the full matchup is in the board itself.
   Not NFL-specific (any long matchup does it). Left as-is.
2. **`?cardId=` lingers after ✕ Close** — dismissing the board overlay leaves the query param in
   the URL (modal is gone, param is inert). Pre-existing, all leagues. Not touched.
3. **Star names skew 2025** — seeded board had "Jadarian Price", "TreVeyon Henderson" (real
   Patriots rookies) but the tilt is running off the 2025 `prior` index (2026 season hasn't
   started). Exactly what Phase 1's handoff predicted; not a bug.
4. **`POST /api/venue-presence/heartbeat` 403** in the console — the Playwright user isn't
   "present" at the venue via the real join flow. Test-harness artifact, unrelated to bingo.

**Still open (Andrew):**
- Flip `NEXT_PUBLIC_BINGO_NFL_ENABLED=true` in Vercel → Production, redeploy. Rollback = same
  field to `false`. Recommend flipping `NEXT_PUBLIC_BINGO_SEASON_GATING_ENABLED=true` in the same
  trip (verified: gives the NBA `out_of_season` / others `in_season` split above).
- Real-device pass: **§7 of `docs/bingo-fullscreen-pwa-device-checklist.md`** (added by this
  phase) — installed-PWA landscape with a real NFL board, once one is openable (Wed 9/9 / Sun 9/13).
- Run-log activation + rollback line (Phase 7's still-blocked item).
- `npm run test:pwa-contract` — **not run** here; no bingo chrome / manifest / `lib/pwa.ts` /
  `.tp-bingo-landscape-*` CSS was touched by any of Phases 1/3/4, so it's not gated. Run it if
  Phase 2's device pass leads to a CSS change.

**Gates:** `npx tsc --noEmit` exit 0 after the lookahead revert; working tree clean (only the
checklist doc + this doc changed by the write-up). No code change from Phase 2 — the flip is
config-only, as the flag contract requires.

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

#### Phase 3 — AS BUILT (2026-09-05, Opus 5)

**Status: DONE, and unobservable until a live NFL game.** Everything below is built, typechecked,
linted and unit-tested, but no NFL game has been played since it shipped, so the only thing that
can still be wrong is a live-feed assumption. **Phase 5 owns the confirmation** — see the
"Verify this during the Phase 5 live window" checklist at the end of this section.

**Files:**
| File | Change |
|---|---|
| `lib/sportsBingoLiveEvents.ts` | **NEW.** Isomorphic (no `server-only`, no Supabase, no React) — imported by both the server sweep and the client board. Holds the row type, the classifier, and the snapshot-diff planner. |
| `lib/sportsBingo.ts` | Previous-sweep state map + `broadcastNFLLiveStatDeltas`, called from the NFL branch of `refreshSportsBingoProgress`. No new provider request. |
| `components/bingo/SportsBingoHome.tsx` | `classifyLiveDeltaEvent` and `LivePlayerStatRealtimeRow` **moved out** to the new lib (NBA/MLB logic byte-identical); added the stale-row guard and NFL square-anchoring guards. |
| `tests/lib.sportsBingo.nfl-live-events.test.ts` | **NEW**, 20 tests. Added to the `test:bingo-nfl` script in `package.json`. |

**How it works** (the NBA/MLB path is a BDL webhook; NFL has none, so the sweep *is* the heartbeat):

1. `refreshSportsBingoProgress` already pulls `/nfl/v1/stats` once per game per sweep for grading.
   Right after that memoized fetch, `broadcastNFLLiveStatDeltas` diffs the snapshot's `lines`
   against `nflLiveStatStateByGameId` (module-level, per game, keyed by normalized player name)
   and publishes only the **changed** players on `live-stats:americanfootball_nfl`.
   **Zero new provider requests. `vercel.json` untouched. No cron entry added.**
2. Rows go out in the existing `LivePlayerStatRealtimeRow` shape plus an optional `nfl` block
   carrying the twelve NFL counters. The client subscription (channel name, game-id filter,
   player-id filter, prev-row map) is **unchanged**.
3. `classifyLiveDeltaEvent` takes an NFL branch **first and returns early**. This is load-bearing:
   NFL rows put the player's own points in `pts`, and a 6-point touchdown falling through to the
   basketball rules would fire `"3-POINTER!"` on a football board.

**Event slate** (exactly what the plan specified, plus one fallback): `TD PASS!`, `RUSHING TD!`,
`TOUCHDOWN CATCH!`, `TOUCHDOWN!` (return/defensive), `100 RUSH YARDS!`, `100 REC YARDS!`,
`FIELD GOAL!`, `INTERCEPTION!` (caught), `PICKED OFF!` (thrown), `SACK!` — plus a
`+N YDS` fallback at `NFL_LIVE_STAT_YARDS_POP_THRESHOLD = 25` scrimmage yards in one sweep, so a
long drive still moves the board between scores. Max 2 pops per row per sweep.

**Three semantics decisions worth knowing before you touch this:**

- **Rows carry absolute totals, never deltas.** `refreshSportsBingoProgress` runs from the cron
  *and* from every user card poll *and* from the NBA/MLB webhook, on any number of warm Fluid
  instances that each hold their own previous-sweep map — so the same change **will** be broadcast
  more than once. Absolute totals make the duplicate inert: the client re-derives the delta against
  its own last-seen row, and a repeat yields all zeros. **This is the no-double-fire mechanism.**
  If you ever change these rows to carry deltas you will get duplicate ActionPops.
- **Out-of-order delivery is the one case totals don't fix**, so `isRegressedNflLiveStatRow` guards
  it client-side: an instance with a stale cached snapshot can publish *older* totals after newer
  ones, and storing that rewind as the new baseline would re-fire the same pop when the real row
  lands. The client drops rewinding rows instead of storing them. NFL-only — an NBA/MLB webhook
  correction downward is legitimate.
- **No previous snapshot → no rows.** A cold instance meeting a game mid-way seeds its baseline and
  publishes nothing, rather than replaying the whole first half as one burst.

**Cost discipline:** `NFL_LIVE_STAT_BROADCAST_MAX_PER_SWEEP = 12` rows per game per sweep, ranked
by `broadcastPriority` so the cap drops "gained 4 rushing yards", never a touchdown. One reused
channel object (each `send()` on an unsubscribed admin channel is an HTTP POST; creating a channel
per row would leak channel objects into a warm instance). Sends are collected and flushed with one
`Promise.allSettled` before the sweep returns — **not** awaited inline (that would put a realtime
round-trip between two cards' square updates) and **not** orphaned (a one-card sweep would exit
with its POSTs still in flight and silently drop every pop).

**State lifetime:** `nflLiveStatStateByGameId` is deliberately **not** cleared by
`maybeInvalidateSportsBingoCaches`. It is delta state, not a cache of provider data — clearing it
re-seeds, and a re-seed publishes nothing, so wiring it into invalidation would swallow exactly the
changes it exists to detect. It self-prunes at `NFL_LIVE_STAT_STATE_TTL_MS` (6h since last touch).

**Deliberately NOT done (do not treat these as oversights):**
- **No `live_player_stats` table write.** The NBA/MLB webhooks upsert because they are the only
  writer of that row; the NFL sweep would be writing ~40 rows per game per minute for a table
  nothing reads on the bingo path. Broadcast only.
- **No 300-yard passing milestone.** The plan listed 100-yard *rushing/receiving* crossings; adding
  a passing tier is a judgement call left to whoever tunes this after seeing a real game.
- **Quarter-scoped TD props (`anytime_td_1q…4q`)** — that is Phase 1 finding #3, still an open
  decision for Andrew, and it is a *board-generation* change, not a live-event one.

**Known limitation, by design:** a client's **first** sighting of any player is its baseline and
pops nothing. So the very first stat change a player makes after you open the board is silent; the
second one pops. This is the same rule NBA/MLB already live with (the client comment at
`SportsBingoHome.tsx`'s channel-3 effect documents it), and it is why the channel must not be torn
down on every card poll. If Phase 5 finds this too quiet in practice, the fix is a server-sent
zero baseline row per newly-seen player — **do not** fix it by making rows carry deltas.

**Gates (vs the Phase 0 baseline — all match):**
| Gate | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, clean (no `.next` noise this time) |
| `npm run lint` | exit 0, clean |
| `npm run test:bingo-nfl` | **277/277** (was 257; +20 from the new file) |
| `npm run test:bingo-mlb` | 142/142 |
| `npm run test:pwa-contract` | 20/20 |
| `npm run test` | **1940 pass / 1 fail / 13 skip** — the 1 failure is still the pre-existing `tests/lib.billingDiscounts.test.ts` date time-bomb Phase 0 documented. Not ours. |
| `npm run build` | succeeds — this is the real proof the new isomorphic module does not drag `server-only` into the client bundle. |

**Verify this during the Phase 5 live window (Wed 9/9 8:20pm ET, NE @ SEA):**
1. Grep the sweep's telemetry line for the three new fields:
   `[sportsBingo][telemetry] … nfl_live_stat_rows / nfl_live_stat_dropped_rows / nfl_live_stat_seeded_games`.
   Expected shape: `seeded_games` 1 on the first sweep that sees the game and 0 after;
   `rows` in the 3–12 range during live play, 0 between drives; `dropped_rows` usually 0. A
   persistently-capped `dropped_rows` means 12 is too low for a real slate — raise
   `NFL_LIVE_STAT_BROADCAST_MAX_PER_SWEEP`, don't remove the cap.
2. Watch an open board on a phone through a scoring drive and confirm a pop actually lands, and
   that it lands on a *sensible square* (the `findRelevantSquareForEvent` guards added here are the
   untested-in-anger part: "SACK!" must not anchor to that same player's receiving-yards square).
3. Confirm the **pace**. One sweep per minute means pops arrive in clumps, up to ~60s behind the
   TV. If that reads as broken rather than delayed, that is a real finding — record it; the fix is
   *not* a new cron (hard boundary), it is either accepting the lag or narrowing what pops.
4. Sanity-check the field mapping against a real box score: `otherTouchdowns` is the sum of
   kick-return + punt-return + interception + fumble TDs, and `defensiveSacks`/
   `defensiveInterceptions` are the defender's own columns. If BDL's live NFL rows name any of
   these differently mid-game than they do at Final, the pops for that family simply never fire —
   a silent failure, so check it explicitly rather than assuming.

**Handoff to Phase 4 (inactives and late scratches — Sonnet 5, ~half day):**
- **Nothing from Phase 3 blocks Phase 4.** They touch disjoint code: Phase 4 lives in
  `buildNFLPlayerPropCandidates` (pre-generation) and a new NFL sibling of
  `autoSwapLateScratchedStarSquares` (post-lock), neither of which Phase 3 went near.
- **One overlap to exploit:** Phase 4's post-lock swap needs "is this player actually playing?",
  and the sweep now already holds a per-game map of who has appeared in the box score
  (`nflLiveStatStateByGameId`). Do **not** repurpose that map as the inactives source — it is
  delta state with a 6h TTL and it cannot distinguish "inactive" from "hasn't touched the ball
  yet". Use `/nfl/v1/player_injuries` as the plan specifies. It is mentioned here only so you do
  not think it is already solved.
- **Also fold in Phase 1 finding #2** (the plan already assigns it to Phase 4): drop a prop
  candidate whose `teamName` matches neither side of the game, *only when `teamName` is present*.
  A.J. Brown, Romeo Doubs and Rashid Shaheed landed on NE @ SEA boards on 2026-09-05.
- **Working tree state when Phase 3 finished:** Phase 1's changes are still **uncommitted** —
  `lib/sportsBingo.ts` label shortening, `tests/lib.sportsBingo.nfl-prop-mix.test.ts`, the audit
  doc, the two `scripts/audit-nfl-*.cjs` and the three `docs/phase0-artifacts/*.json`. Phase 3's
  files sit on top of them in the same working tree. If you commit, either commit Phase 1 and
  Phase 3 as two commits or say plainly in the message that it is both.
- **Gate commands for Phase 4** are unchanged, but `npm run test:bingo-nfl` is now **277**, not
  257 — do not treat the higher number as a regression.

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

#### Phase 4 — AS BUILT (2026-09-05, Sonnet 5)

**Status: DONE. Unobservable until a real NFL game / a real injury report matters — the pieces
are typechecked, linted and unit-tested (12 new tests), but no board has been generated against a
live `/nfl/v1/player_injuries` pull and no late scratch has been swapped in anger. Phase 5 owns
the live confirmation — see the checklist at the end of this section.**

**Live feed shape (probed 2026-09-05, `node --env-file=.env.local` one-off):** `/nfl/v1/player_injuries`
returns `{ data: [{ player: { id, first_name, last_name, position, team }, status, comment, date }],
meta: { next_cursor } }`. 334 rows league-wide, ~4 pages at `per_page=100`. Distinct `status`
values seen: `Questionable` 196, `IR` 71, `PUP-P` 40, `NFI-A` 8, `Reserve-Sus` 7, `Out` 5,
`PUP-R` 4, `NFI-R` 2, `Reserve-DNR` 1. No `Doubtful` posted this far out, but it is in BDL's
vocabulary. **Both feeds are BDL, so `player.id` on an injury row joins cleanly to `playerId` on a
prop market — the match is on the integer, name-key is only the fallback.**

**Files:**
| File | Change |
|---|---|
| `lib/sportsBingoNflInjuries.ts` | **NEW.** `server-only`. Holds `fetchNFLPlayerInjuries`, `buildNFLInjuryIndex` (pure), `isNFLPlayerInactive` (pure), `isInactiveNFLInjuryStatus` (pure), `resolveNFLInjuryIndex` (24h process cache, injectable fetch, `maxStalenessMs` param), the status allow-list, and `__resetNFLInjuryIndexCacheForTests`. Mirrors `lib/sportsBingoNflStars.ts`'s cache/fallback shape line for line. |
| `lib/sportsBingo.ts` | Import block; `NFL_LATE_SCRATCH_SWAP_WINDOW_MS` (150 min, env `BINGO_NFL_LATE_SCRATCH_WINDOW_MS`); `filterNFLPropMarketsForEligibility` (pre-generation drop + safety valve) wired into `buildNFLPlayerPropCandidates` (new 4th arg `injuryIndex`); `resolveNFLInjuryIndex()` call added in `getGameEntryWithCandidates`'s NFL branch; `isNflLateScratchWindow`, `nflPropResolverPlayerRef`, exported `planNFLInactivePropSwaps` (pure) + `NFLInactivePropSwap` type, `autoSwapInactiveNFLPropSquares` (the DB applier); one `resolveNFLInjuryIndex({ maxStalenessMs: 10min })` pull per sweep + the `autoSwapInactiveNFLPropSquares` call in the NFL branch of `refreshSportsBingoProgress`; `nfl_inactive_swaps` telemetry field. |
| `tests/lib.sportsBingo.nfl-inactives.test.ts` | **NEW**, 12 tests. Added to `test:bingo-nfl` in `package.json`. |

**Pre-generation filter — what actually ships:**
- `filterNFLPropMarketsForEligibility(game, markets, injuryIndex)` runs before `buildNFLStarScoresByPlayerId`,
  so an inactive star is not even scored for tilt. It drops a market when **either**:
  1. **Phase 1 finding #2** — `market.teamName` is non-empty and `teamsMatch` says it is neither
     side of this game (A.J. Brown / Romeo Doubs / Rashid Shaheed on NE @ SEA). An **absent**
     `teamName` is not a signal and is kept — same rule the plan states.
  2. **Injury** — `isNFLPlayerInactive(injuryIndex, market.playerId, market.playerName)` is true.
- **Inactive status allow-list** (`NFL_INACTIVE_INJURY_STATUSES` in `lib/sportsBingoNflInjuries.ts`):
  `out`, `doubtful`, `ir` (+ `injured reserve` / `injured-reserve`), `pup-r`, `nfi-r`,
  `reserve-sus`, `reserve-dnr`, `reserve-ret`. **This is wider than the plan's literal "Out / IR /
  Doubtful".** Rationale: `PUP-R` / `NFI-R` are the *regular-season* reserve lists (a player on
  either cannot play for ≥4 weeks); `Reserve-Sus/DNR/Ret` are not injuries but the same board
  outcome. **`PUP-P`, `NFI-A` and `Questionable` are deliberately NOT on the list** — those
  players can and routinely do play. If Andrew wants the strict three, delete the four extra
  entries; nothing else changes. Settlement's void still backstops any status not on the list.
- **Safety valve:** if the two filters would empty a **non-empty** market pool (a team-name
  format mismatch nuking every market, or a freak fully-injured slate), the raw markets are
  returned and a `nfl_prop_eligibility_all_dropped` warning is logged. A board never ships with
  zero props because of this filter.
- **Telemetry:** `[sportsBingo] nfl_prop_eligibility { markets, eligible, dropped_off_roster, dropped_inactive }`
  is logged per game whenever anything was dropped.
- **Cost:** one `/nfl/v1/player_injuries` pull per 24h per warm instance, shared across the whole
  slate (process-cached in `resolveNFLInjuryIndex`, not per game). A feed failure → empty index
  with `failed: true` → filter is a no-op, 5-minute negative TTL. `vercel.json` untouched, no
  cron added.

**Post-lock swap — what actually ships:**
- `planNFLInactivePropSwaps({ card, squares, injuryIndex, nowMs? })` is **pure and exported** —
  the swap *decision* is unit-testable with no Supabase double. `autoSwapInactiveNFLPropSquares`
  is the thin DB applier that runs the plan's `sports_bingo_squares` updates.
- **Window:** `isNflLateScratchWindow` = MLB's exact two-clause logic (`inGameWindow` ±150 min of
  `starts_at`, `inLockWindow` 0..+150 min after `created_at`), just a wider constant because NFL
  inactives post ~90 min before kickoff vs MLB's ~30.
- **What gets swapped:** a `pending`, non-free square whose resolver is `player_prop`,
  `nfl_player_anytime_td` or `nfl_player_first_td` **and** whose player `isNFLPlayerInactive` per
  the injury index. (The swap fn is only called on `sport_key === "americanfootball_nfl"` cards,
  so touching the shared `player_prop` kind here is safe.)
- **Replacement:** a fixed `{ kind: "nfl_both_teams_score_at_least", threshold: 17 }` — a live
  whole-game square with **no box-score or roster dependency**, so it resolves through the game
  and can never re-hit the same DNP wall. The square **keeps its own priced probability**
  (clamped 0.25–0.75), unlike MLB which hardcodes 0.46 — this keeps the card's stored
  `board_probability` coherent without a re-model.
- **"Same notification path MLB uses" = none.** `autoSwapLateScratchedStarSquares` sends no
  user notification (just the row update); this mirrors that exactly. If a notification is
  wanted, it belongs on *both* leagues, in a follow-up.
- **Known limitations, by design (do not treat as bugs):**
  - Two scratched players on one board both swap to the identical "both teams score 17+"
    square. Same limitation MLB carries (all → team-HR). Rare; accepted.
  - The swap uses `Date.now()` inside the sweep. The injury index it reads is refreshed at most
    every ~10 min (`NFL_INJURY_INDEX_LIVE_STALENESS_MS`), so a scratch that posts 90 min out is
    caught within ~10 min, not instantly.
  - `resolveNFLInjuryIndex` is a **module-level** cache. In tests, `vi.resetModules()` clears it;
    `__resetNFLInjuryIndexCacheForTests()` is there if a test needs it without a full reset.

**Deliberately NOT done:**
- **No `/nfl/v1/player_injuries` probe script committed.** The probe was a throwaway one-off; the
  shape is recorded above. Add one to `scripts/` only if Phase 5/6 needs repeatable status-vocab
  monitoring.
- **No env flag.** This follows the star-index precedent (no flag) rather than the activation
  flag precedent. It is inert until `NEXT_PUBLIC_BINGO_NFL_ENABLED` is on anyway, and a feed
  failure already degrades to a no-op. `BINGO_NFL_INJURY_INDEX_CACHE_MS` and
  `BINGO_NFL_LATE_SCRATCH_WINDOW_MS` are the only new tunables.
- **No swap for NBA/WNBA.** Out of scope; the plan is NFL-only and the shared `player_prop` path
  is untouched for other leagues.

**Gates (vs the Phase 0 baseline — all match):**
| Gate | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, clean (after `rm -rf .next`) |
| `npm run lint` | exit 0, clean |
| `npm run test:bingo-nfl` | **289/289** (was 277; +12 from the new file) |
| `npm run test:bingo-mlb` | 142/142 |
| `npm run test` | **1952 pass / 1 fail / 13 skip** — the 1 failure is still the pre-existing `tests/lib.billingDiscounts.test.ts` date time-bomb Phase 0 documented. Not ours (confirmed: it fails on a clean stash of these changes). |

**Verify during the Phase 5 live window (Wed 9/9 8:20pm ET, NE @ SEA; Sun 9/13 slate):**
1. **Pre-generation, Sun 9/13 morning:** after inactives post (~90 min before the 1pm games),
   regenerate a board for a game with a known inactive skill player and confirm no square carries
   that player. Grep the generation logs for `[sportsBingo] nfl_prop_eligibility` — `dropped_inactive`
   should be non-zero on at least one Sunday game. If it is always 0, the id join is broken (check
   that `market.playerId` and the injury row's `player.id` are the same integer space).
2. **Status vocab:** re-pull `/nfl/v1/player_injuries` on game day and diff the distinct `status`
   set against the list recorded above. A **new** season-ending code (BDL adds them occasionally)
   would silently fall through to "active" — add it to `NFL_INACTIVE_INJURY_STATUSES`. `Doubtful`
   in particular has never been seen live yet; confirm it grades as inactive when it first appears.
3. **Post-lock swap:** this only fires if a player with a prop square on a live card is ruled out
   **inside 150 min of kickoff**. It may simply not happen Week 1. If it does, grep the sweep
   telemetry for `nfl_inactive_swaps` > 0 and confirm the swapped square shows "both teams score
   at least 17 points" on the board, still `pending`, and that it resolves normally through the
   game. If `nfl_inactive_swaps` is stuck > 0 every sweep for the same card, the DB update is not
   sticking (the square keeps matching the plan) — check the `sports_bingo_squares` write.
4. **Safety valve:** if any Sunday game logs `nfl_prop_eligibility_all_dropped`, the `teamsMatch`
   call is failing on that game's team-name format — the board still shipped (raw markets kept),
   but the finding #2 filter is dead for that game. Record the team-name strings involved.
5. **Windows math:** `NFL_LATE_SCRATCH_SWAP_WINDOW_MS` is 150 min. Thursday/Monday nighters and
   the Sunday 1pm/4pm/8pm waves all differ; confirm the window actually covers "inactives posted →
   first sweep after kickoff" for at least the Sunday 1pm wave.

**Handoff to Phase 6 (realized calibration, after Week 3):**
- Add an **injury-family check** to the calibration pass: how many boards had a square dropped
  pre-generation vs how many still voided at settlement for a DNP. If void rate on prop squares
  is materially down from Phase 1's 0.6–0.9%, the pre-filter is doing its job; if it is
  unchanged, the filter is not matching (see Phase 5 check #1).
- `NFL_INJURY_INDEX_LIVE_STALENESS_MS` (10 min) and `NFL_LATE_SCRATCH_SWAP_WINDOW_MS` (150 min)
  are un-evidenced guesses — Phase 5's window observations should confirm or retune them.

**Working tree when Phase 4 finished:** Phase 1's changes (`lib/sportsBingo.ts` label
shortening, `tests/lib.sportsBingo.nfl-prop-mix.test.ts`, the audit doc, the two
`scripts/audit-nfl-*.cjs`, the three `docs/phase0-artifacts/*.json`) and Phase 3's files are
**still uncommitted** and Phase 4's changes sit on top of them in the same working tree. If you
commit, either split Phase 1 / Phase 3 / Phase 4 into separate commits or say plainly in the
message that it is all three. `npm run test:bingo-nfl` is now **289**, not 277 — not a regression.

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

#### Phase 7 — PARTIAL (2026-09-05, Sonnet 5) — the calendar-independent slice

Done ahead of the flip because neither item depends on it:

- **`SYSTEM_CONTEXT.md` §Sports Bingo updated.** Now says NFL boards are built but flag-gated
  (`isNflGameplayEnabled()`), lists the NFL resolver families, and — the substantive correction —
  states that **NFL has no BallDontLie webhook**, so every NFL square (grading, settlement, the
  `live-stats:americanfootball_nfl` ActionPop broadcast, injury filtering, late-scratch swap) is
  driven by the 1-minute `/api/cron/bingo-progress` sweep, not a webhook.

**Star-index refresh cadence — proposal for Andrew (not executed; `vercel.json` is a hard boundary):**

The obligation is now `npm run bingo:stars:nfl` **and** `npm run bingo:stars:mlb`, and it has
lapsed once already (Phase 0). The 24h live cache (`resolveNFLStarIndex` / `resolveMLBStarIndex`)
means the *product* is correct without any refresh — the committed snapshot is a diff artifact and
a staleness tripwire input, never a runtime fallback. So the only thing a lapsed refresh breaks is
CI (the freshness tripwires go red at 14 days), which is exactly what caught it last time.

Three options, cheapest first:

1. **Do nothing structural; let the tripwire be the reminder.** It already works — the 14-day
   `NFL_STAR_INDEX_SNAPSHOT_MAX_AGE_DAYS` / MLB equivalent fail the build and force the refresh.
   Cost: whoever hits the red build eats a ~10-minute detour. This is the status quo.
2. **A standing weekly reminder** (calendar / Linear recurring / `/schedule` routine) to run both
   `bingo:stars:*` scripts and commit. Keeps the snapshots fresh enough that the tripwire never
   fires, no infra change. Recommended if the red-build detour is judged annoying.
3. **A cron** (`/api/cron/bingo-star-index-refresh`, weekly) that re-pulls both indexes and opens a
   PR with the regenerated snapshots. This needs a `vercel.json` cron entry — **Andrew's call
   only**, and it is more machinery than a once-a-week manual script warrants given option 1
   already prevents silent staleness.

**Recommendation:** option 2. The tripwire (option 1) is the real safety net; a weekly reminder
just avoids the annoyance of discovering it via a failed build.

**Still blocked on the flip (do after Phase 2):** the run-log activation + rollback line, and
flipping `docs/prop-bingo-nfl-plan.md`'s header off "NFL is dark".

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
