#!/usr/bin/env node

/**
 * Phase 5 of docs/mlb-prop-bingo-validation-plan.md — per-resolver-family calibration for MLB.
 * The MLB counterpart of scripts/calibrate-nfl-square-families.cjs (Phase 8c of the NFL plan).
 *
 * `npm run bingo:simulate -- --backtest --sports baseball_mlb` answers "does a board win about a
 * quarter of the time?" and nothing else, and `npm run bingo:validate:mlb` can only flag a badly
 * wrong price on a few dozen games. This is the instrument that can actually *set* one: over a
 * whole season it records, per resolver kind and per square key, the probability the generator
 * ASSIGNED against the rate the shipped graders REALIZED, so the mispriced families fall out of
 * the top and bottom of the table.
 *
 * Like the NFL script, it imports the **shipped** generator and grader
 * (`buildSportsBingoBoardFromBallDontLieGame`, `gradeResolversAgainstCompletedMLBGame`,
 * `boardStatusesMakeALine`, `buildMlbTeamEventCandidateTemplatesForBacktest`) rather than
 * mirroring either half — a mirrored implementation would calibrate the mirror, not the shipped
 * price.
 *
 * ## What this instrument can and cannot price — read before quoting a number
 *
 * A backtest replays a *historical* game, and the MLB board a real player is dealt is assembled
 * asynchronously from `/mlb/v1/stats` for an *upcoming* game. That asymmetry decides the coverage:
 *
 * - **Covered:** the core markets (`moneyline`, `spread_*`, `game_total_*`, `team_total_*`) and the
 *   six measured `mlb_webhook_team_event_at_least` events (hit, walk, hit_by_pitch, strikeout,
 *   groundout, flyout), each settled against the real box score.
 * - **NOT covered — team-event prices here are LEAGUE-MEAN, not opponent-adjusted.** The live path
 *   prices those six through `buildMlbTeamAllowedRates` (opponent history); the backtest seam
 *   R4 built, `buildMlbTeamEventCandidateTemplatesForBacktest`, deliberately reads
 *   `predictMlbTeamEventRate(event, null, 0)` — the league mean. So a team-event gap here is a
 *   verdict on the **league-mean model**, which is the base the opponent adjustment is applied to,
 *   and not on the per-game price a real player sees. Treat it as "is the base right on average",
 *   which is exactly the question a base rate should answer, and not as "is the shipped square
 *   mispriced for the Rockies at Coors."
 * - **NOT covered at all — every player-level family.** `player_prop`,
 *   `mlb_webhook_player_event_at_least` and `mlb_webhook_player_event_at_most` come out of
 *   `buildMLBPlayerPropCandidatesFromRecentStats`, which needs an upcoming game's lineups and
 *   trailing player stats. They are structurally invisible to this path and appear with `n: 0`.
 *   `npm run bingo:validate:mlb`'s realized column is the only instrument that touches them today.
 * - **NOT calibratable by any box-score method — `quick_out_under_3_pitches`.** It is derived from
 *   our own webhook stream and has no `/mlb/v1/stats` column, so the grader sees `currentCount: 0`
 *   for it on every backtested game and settles it `miss` every time. Its realized rate here is a
 *   hard 0.000 against an assigned 0.580, and that gap is 100% an artifact of the missing column,
 *   not evidence of anything. It is therefore **excluded from every table** and reported once under
 *   `notCalibratable`. Do not read a number for it out of this script; there isn't one to read.
 *
 * ## Reading the output without fooling yourself
 *
 * - **Only the team-event families carry a SHIPPED price. The core markets do not.** A
 *   `moneyline` / `spread_*` / `*_total_*` square is priced in production off a real vendor market
 *   model; here it is priced off this script's *retrodictive* one (`buildMlbMarketModel` below,
 *   a normal approximation over shrunk run differentials). So a gap in one of those rows is a
 *   verdict on **this harness's market model**, not on anything shipped — useful as a sanity check
 *   that the replay is sane, useless as a reason to change a price. The six
 *   `mlb_webhook_team_event_at_least` events are the opposite: their probabilities come straight
 *   out of the shipped `predictMlbTeamEventRate` + `buildMlbTeamEventRungs`, so `byTeamEvent`,
 *   `byTeamEventSide` and the team-event half of `bySquare` are the rows that can actually move a
 *   shipped number.
 * - **Read `byTeamEventSide` before `byTeamEvent`.** A home/away-blind base rate can sit dead on
 *   the pooled mean while being wrong on both sides in opposite directions, and the pooled row
 *   will never show it — the home team bats one fewer inning whenever it is ahead after the top of
 *   the 9th, which is about half of all games, so its event totals run structurally below the away
 *   team's. `byTeamEventSide` splits every family by `resolver.team` for exactly that reason.
 * - **`realized` counts an ungraded square as a non-hit**, same as the NFL script. Compare
 *   `realizedExcludingUngraded` when a family has a meaningful `ungraded` share.
 * - **Boards for one game share that game's outcome.** The honest sample size is the distinct game
 *   count (`games`), never the square count (`n`) — six boards off one game are one observation of
 *   that game's box score, not six. `stdErr` and `z` are computed against `games` for that reason.
 *   `|z| < 2` is noise; do not move a shipped price on it.
 * - **Board selection is difficulty-biased.** A flat, market-independent base rate (all six
 *   team-event families are flat) lands disproportionately in the games where the generator needed
 *   that particular difficulty. If a family's true rate moves with the total, the games it lands
 *   in are not average games, and it can show a gap it does not deserve. Cross-check against
 *   `npm run bingo:measure:mlb`, which reads the box-score columns directly with no board
 *   selection at all, before treating a gap here as a price error.
 * - **`bingo:measure:mlb` and this script disagreeing is the interesting result**, and is the
 *   reason Phase 5 was sequenced last: every shipped MLB base rate was set by that direct
 *   measurement, never through the graders. A disagreement means the price and the grading path
 *   read the same event differently — check the grader before the price.
 *
 * ## Slate
 *
 * Priors are built from **every** regular-season final strictly before each sampled game's date
 * (leak-free, same discipline as the NFL loop's `week < current week` filter), but the expensive
 * per-game `/mlb/v1/stats` call is made only for the sampled games. So `--games` trades API cost
 * for precision without ever weakening the retrodictive market.
 *
 * Usage:
 *   npm run bingo:calibrate:mlb                          # 2025, 400 games evenly spaced, 6 boards each
 *   npm run bingo:calibrate:mlb -- --games 0             # every 2025 regular-season final (~2400)
 *   npm run bingo:calibrate:mlb -- --seasons 2025 --games 800 --boards 4
 *
 * The default slate is ~400 `/mlb/v1/stats` calls plus ~30 pages of `/mlb/v1/games` and runs in
 * roughly 5-10 minutes. `--games 0` is ~2400 calls; budget for it before running it.
 */

const BASE_URL = process.env.BALLDONTLIE_API_BASE_URL ?? "https://api.balldontlie.io";
const API_KEY = process.env.BALLDONTLIE_API_KEY;

/**
 * MLB run-scoring priors for the retrodictive market. Copied verbatim from
 * scripts/simulate-bingo-boards.cjs's Phase 4b block so the two harnesses price the same historical
 * game identically — a calibration run that disagreed with the backtest only because its market
 * model drifted would be unreadable. Estimated from published single-game MLB run-distribution
 * figures (team runs/game mean ~4.3, SD ~3), not measured against our own feed.
 */
const MLB_LEAGUE_AVG_TEAM_RUNS = 4.3;
const MLB_SHRINKAGE_GAMES = 12;
const MLB_HOME_FIELD_RUNS = 0.15;
const MLB_TEAM_TOTAL_SIGMA = 3.0;
const MLB_MARGIN_SIGMA = 4.2;
const MLB_GAME_TOTAL_SIGMA = Math.sqrt(
  Math.max(1, 4 * MLB_TEAM_TOTAL_SIGMA * MLB_TEAM_TOTAL_SIGMA - MLB_MARGIN_SIGMA * MLB_MARGIN_SIGMA)
);
const MLB_MIN_TOTAL = 4;
const MLB_MAX_TOTAL = 16;

/**
 * Same mapping scripts/simulate-bingo-boards.cjs backtests against and
 * scripts/measure-mlb-event-rates.cjs measured the shipped base rates against — kept identical on
 * purpose so a gap in this script's table cannot be an artifact of a third reading of the columns.
 */
const MLB_TEAM_EVENT_STAT_FIELDS = {
  hit: "hits",
  walk: "bb",
  hit_by_pitch: "hit_by_pitch",
  strikeout: "k",
  groundout: "ground_outs",
  flyout: "fly_outs",
};

/** See the module header — no box-score column exists, so it cannot be calibrated here at all. */
const UNCALIBRATABLE_TEAM_EVENTS = new Set(["quick_out_under_3_pitches"]);

/**
 * Player-level MLB families the shipped async generator produces and this instrument structurally
 * cannot reach. Listed literally so the report can name them as uncovered rather than letting their
 * absence read as "no such squares exist".
 */
const PLAYER_LEVEL_MLB_KINDS = [
  "player_prop",
  "mlb_webhook_player_event_at_least",
  "mlb_webhook_player_event_at_most",
];

function parseArgs(argv) {
  const args = { seasons: ["2025"], games: 400, boards: 6, warmupDays: 21 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--seasons") {
      args.seasons = String(argv[i + 1] ?? "").split(",").filter(Boolean);
      i += 1;
    } else if (argv[i] === "--games") {
      const parsed = Number.parseInt(argv[i + 1], 10);
      if (Number.isFinite(parsed)) args.games = parsed;
      i += 1;
    } else if (argv[i] === "--boards") {
      args.boards = Number.parseInt(argv[i + 1], 10) || args.boards;
      i += 1;
    } else if (argv[i] === "--warmup-days") {
      const parsed = Number.parseInt(argv[i + 1], 10);
      if (Number.isFinite(parsed)) args.warmupDays = parsed;
      i += 1;
    }
  }
  return args;
}

async function fetchAll(path, params, maxPages = 40) {
  const rows = [];
  let cursor = null;
  for (let page = 0; page < maxPages; page += 1) {
    const query = new URLSearchParams(params);
    if (cursor !== null) query.set("cursor", String(cursor));
    const response = await fetch(`${BASE_URL}${path}?${query}`, { headers: { Authorization: API_KEY } });
    if (!response.ok) throw new Error(`${path} ${response.status}`);
    const payload = await response.json();
    rows.push(...(payload.data ?? []));
    if (typeof payload.meta?.next_cursor !== "number") return rows;
    cursor = payload.meta.next_cursor;
  }
  throw new Error(`truncated at ${maxPages} pages: ${path}`);
}

/**
 * Both teams' **runs** scored/allowed, shrunk toward the league mean. `home_team_data.runs` /
 * `away_team_data.runs` are the verified MLB run fields — `/mlb/v1/games` has no `*_team_score`
 * keys at all (the plan's "Verified facts" table; re-probed live 2026-08-18 for this phase), so
 * reading `home_team_score` the way the NFL script does would silently zero every game.
 */
function buildMLBPowerRatings(priorGames) {
  const scored = new Map();
  const allowed = new Map();
  const played = new Map();
  const add = (map, teamId, value) => map.set(teamId, (map.get(teamId) ?? 0) + value);

  for (const game of priorGames) {
    const homeId = game.home_team?.id;
    const awayId = game.away_team?.id;
    const homeRuns = Number(game.home_team_data?.runs);
    const awayRuns = Number(game.away_team_data?.runs);
    if (!homeId || !awayId || !Number.isFinite(homeRuns) || !Number.isFinite(awayRuns)) continue;
    add(scored, homeId, homeRuns);
    add(allowed, homeId, awayRuns);
    add(played, homeId, 1);
    add(scored, awayId, awayRuns);
    add(allowed, awayId, homeRuns);
    add(played, awayId, 1);
  }

  const shrink = (total, count) =>
    (total + MLB_SHRINKAGE_GAMES * MLB_LEAGUE_AVG_TEAM_RUNS) / (count + MLB_SHRINKAGE_GAMES);

  return {
    scoredAvg: (teamId) => shrink(scored.get(teamId) ?? 0, played.get(teamId) ?? 0),
    allowedAvg: (teamId) => shrink(allowed.get(teamId) ?? 0, played.get(teamId) ?? 0),
  };
}

function mlbRetrodictiveConsensus(game, ratings) {
  const homeId = game.home_team?.id;
  const awayId = game.away_team?.id;
  if (!homeId || !awayId) return null;
  const homeExpected = (ratings.scoredAvg(homeId) + ratings.allowedAvg(awayId)) / 2 + MLB_HOME_FIELD_RUNS / 2;
  const awayExpected = (ratings.scoredAvg(awayId) + ratings.allowedAvg(homeId)) / 2 - MLB_HOME_FIELD_RUNS / 2;
  return { homeSpread: -(homeExpected - awayExpected), total: homeExpected + awayExpected };
}

/**
 * The minimal market-model object `buildGameAndCandidatesFromBallDontLie` reads for a non-NFL
 * sport. Identical to scripts/simulate-bingo-boards.cjs's `buildMlbMarketModel` — see the note on
 * the constants above for why the two are kept in lockstep. `normalCdf` is reused from
 * lib/sportsBingoOdds.ts rather than re-derived, since it is the one piece of this that is shipped
 * pricing logic.
 */
function buildMlbMarketModel(consensus, normalCdf) {
  const homeSpread = Math.max(-6, Math.min(6, consensus.homeSpread));
  const total = Math.max(MLB_MIN_TOTAL, Math.min(MLB_MAX_TOTAL, consensus.total));
  const expectedHomeMargin = -homeSpread;
  const impliedHomeTotal = total / 2 + expectedHomeMargin / 2;
  const impliedAwayTotal = total - impliedHomeTotal;
  const marginAbove = (threshold) => 1 - normalCdf(threshold, expectedHomeMargin, MLB_MARGIN_SIGMA);
  const impliedTotalFor = (team) => (team === "home" ? impliedHomeTotal : impliedAwayTotal);

  return {
    homeSpread,
    total,
    favorite: homeSpread <= 0 ? "home" : "away",
    winProbability: (team) => (team === "home" ? marginAbove(0) : 1 - marginAbove(0)),
    marginMoreThan: (team, line) =>
      team === "home" ? marginAbove(line) : normalCdf(-line, expectedHomeMargin, MLB_MARGIN_SIGMA),
    gameTotalOver: (line) => 1 - normalCdf(line, total, MLB_GAME_TOTAL_SIGMA),
    teamTotalOver: (team, line) => 1 - normalCdf(line, impliedTotalFor(team), MLB_TEAM_TOTAL_SIGMA),
  };
}

/** Evenly-spaced sample so the slate spans the whole season rather than one hot month. */
function evenlySpacedSample(rows, count) {
  if (count <= 0 || count >= rows.length) return rows;
  const stride = rows.length / count;
  const picked = [];
  for (let i = 0; i < count; i += 1) picked.push(rows[Math.floor(i * stride)]);
  return picked;
}

const dateKeyOf = (game) => String(game.date ?? "").slice(0, 10);

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const originalInfo = console.info;
  const originalWarn = console.warn;
  console.info = () => {};
  console.warn = () => {};

  const sportsBingo = await import("../lib/sportsBingo.ts");
  const sportsBingoOdds = await import("../lib/sportsBingoOdds.ts");

  /** id -> { n, games:Set, assigned, hits, pending, voided } */
  const byKind = new Map();
  const byTeamEvent = new Map();
  const byTeamEventSide = new Map();
  const byKey = new Map();
  const bucket = (map, id) => {
    if (!map.has(id)) map.set(id, { n: 0, games: new Set(), assigned: 0, hits: 0, pending: 0, voided: 0 });
    return map.get(id);
  };

  let boardsSeen = 0;
  let boardsWon = 0;
  // A board holding a `quick_out_under_3_pitches` square is guaranteed to miss that square here
  // (no box-score column), so its win rate is biased *down* by an amount that has nothing to do
  // with pricing. Boards that happen not to draw one are the clean read of the board-level rate.
  let cleanBoardsSeen = 0;
  let cleanBoardsWon = 0;
  let sampledGames = 0;
  let excludedUncalibratableSquares = 0;
  const slate = [];

  for (const season of args.seasons) {
    const seasonGames = await fetchAll("/mlb/v1/games", { per_page: "100", "seasons[]": season });
    // `season_type` is `"regular"` (not `"regular_season"`) and the season also carries
    // `"spring_training"` and `"postseason"` rows — probed live 2026-08-18. Spring training is
    // played by rosters no real card would ever be built from, so it is excluded from the priors
    // as well as the sample.
    const finals = seasonGames
      .filter((row) => row.season_type === "regular" && String(row.status ?? "") === "STATUS_FINAL")
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (finals.length === 0) continue;

    // The first few weeks are priced almost entirely by the shrinkage prior (12 games of league
    // mean), so their retrodictive market is close to a constant. Keep them in the prior pool,
    // leave them out of the measured sample.
    const warmupCutoff = addDays(dateKeyOf(finals[0]), args.warmupDays);
    const eligible = finals.filter((row) => dateKeyOf(row) >= warmupCutoff);
    const sample = evenlySpacedSample(eligible, args.games);
    slate.push({
      season,
      regularSeasonFinals: finals.length,
      warmupCutoff,
      eligibleAfterWarmup: eligible.length,
      sampled: sample.length,
      firstSampledDate: sample.length ? dateKeyOf(sample[0]) : null,
      lastSampledDate: sample.length ? dateKeyOf(sample[sample.length - 1]) : null,
    });

    const ratingsByDate = new Map();
    for (const game of sample) {
      const gameDate = dateKeyOf(game);
      if (!ratingsByDate.has(gameDate)) {
        ratingsByDate.set(gameDate, buildMLBPowerRatings(finals.filter((row) => dateKeyOf(row) < gameDate)));
      }
      const consensus = mlbRetrodictiveConsensus(game, ratingsByDate.get(gameDate));
      if (!consensus) continue;
      const marketModel = buildMlbMarketModel(consensus, sportsBingoOdds.normalCdf);

      const homeTeam = game.home_team?.display_name ?? "";
      const awayTeam = game.away_team?.display_name ?? "";
      const homeScore = Number(game.home_team_data?.runs);
      const awayScore = Number(game.away_team_data?.runs);
      if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;

      const syntheticGame = {
        id: String(game.id),
        sportKey: "baseball_mlb",
        homeTeam,
        awayTeam,
        startsAt: game.date,
        gameLabel: "",
        isLocked: true,
      };
      const extraCandidates = sportsBingo.buildMlbTeamEventCandidateTemplatesForBacktest(syntheticGame);

      const boards = [];
      for (let trial = 0; trial < args.boards; trial += 1) {
        const built = sportsBingo.buildSportsBingoBoardFromBallDontLieGame({
          sportKey: "baseball_mlb",
          row: game,
          marketModel,
          extraCandidates,
        });
        if (built) boards.push(built);
      }
      if (boards.length === 0) continue;

      const needsTeamEventTotals = boards.some((board) =>
        board.squares.some((square) => square.resolver.kind === "mlb_webhook_team_event_at_least")
      );
      const teamEventTotals = { home: {}, away: {} };
      if (needsTeamEventTotals) {
        const statsQuery = new URLSearchParams({ per_page: "100" });
        statsQuery.append("game_ids[]", String(game.id));
        for (const row of await fetchAll("/mlb/v1/stats", statsQuery, 4)) {
          const teamName = row.team?.display_name ?? row.team_name ?? "";
          const side = teamName === homeTeam ? "home" : teamName === awayTeam ? "away" : null;
          if (!side) continue;
          for (const [event, field] of Object.entries(MLB_TEAM_EVENT_STAT_FIELDS)) {
            const value = Number(row[field]);
            if (!Number.isFinite(value)) continue;
            teamEventTotals[side][event] = (teamEventTotals[side][event] ?? 0) + value;
          }
        }
      }

      sampledGames += 1;
      for (const board of boards) {
        const playable = board.squares.filter((square) => !square.isFree);
        const graded = sportsBingo.gradeResolversAgainstCompletedMLBGame({
          gameId: String(game.id),
          homeTeam,
          awayTeam,
          homeScore,
          awayScore,
          teamEventTotals,
          resolvers: playable.map((square) => square.resolver),
        });

        boardsSeen += 1;
        let boardHasUncalibratable = false;
        const marks = playable.map((square, index) => {
          const outcome = graded[index];
          const resolver = square.resolver;
          const isUncalibratable =
            resolver.kind === "mlb_webhook_team_event_at_least" && UNCALIBRATABLE_TEAM_EVENTS.has(resolver.event);

          if (isUncalibratable) {
            // Counted only so the report can say how much of the board it occupied; deliberately
            // kept out of every table — see the module header.
            excludedUncalibratableSquares += 1;
            boardHasUncalibratable = true;
          } else {
            const targets = [bucket(byKind, resolver.kind), bucket(byKey, square.key)];
            if (resolver.kind === "mlb_webhook_team_event_at_least") {
              targets.push(bucket(byTeamEvent, `team_event:${resolver.event}`));
              targets.push(bucket(byTeamEventSide, `team_event:${resolver.event}:${resolver.team}`));
              targets.push(bucket(byTeamEventSide, `team_event:ALL:${resolver.team}`));
            }
            for (const entry of targets) {
              entry.n += 1;
              entry.games.add(String(game.id));
              entry.assigned += square.probability;
              if (outcome.status === "hit") entry.hits += 1;
              else if (outcome.status === "pending") entry.pending += 1;
              else if (outcome.status === "void") entry.voided += 1;
            }
          }

          // The board-level win rate still counts every square, including the uncalibratable one —
          // a real player's board contains it, so removing it would report a board nobody is dealt.
          return { index: square.index, hit: outcome.status === "hit" };
        });
        const won = sportsBingo.boardStatusesMakeALine(marks);
        if (won) boardsWon += 1;
        if (!boardHasUncalibratable) {
          cleanBoardsSeen += 1;
          if (won) cleanBoardsWon += 1;
        }
      }
    }
  }

  const table = (map, minN) =>
    [...map.entries()]
      .filter(([, v]) => v.n >= minN)
      .map(([id, v]) => {
        const assigned = v.assigned / v.n;
        const realized = v.hits / v.n;
        const gap = realized - assigned;
        const gradedN = v.n - v.pending - v.voided;
        // Standard error against DISTINCT GAMES, not squares: boards off one game share that
        // game's outcome, so squares are not independent draws. See the module header.
        const games = v.games.size;
        const stdErr = games > 0 ? Math.sqrt(Math.max(assigned * (1 - assigned), 1e-6) / games) : null;
        return {
          id,
          n: v.n,
          games,
          assigned: Number(assigned.toFixed(3)),
          realized: Number(realized.toFixed(3)),
          realizedExcludingUngraded: gradedN > 0 ? Number((v.hits / gradedN).toFixed(3)) : null,
          gap: Number(gap.toFixed(3)),
          stdErr: stdErr === null ? null : Number(stdErr.toFixed(3)),
          z: stdErr ? Number((gap / stdErr).toFixed(2)) : null,
          ungraded: Number(((v.pending + v.voided) / v.n).toFixed(3)),
        };
      })
      .sort((a, b) => a.gap - b.gap);

  const seenKinds = new Set(byKind.keys());

  console.info = originalInfo;
  console.warn = originalWarn;
  process.stdout.write(
    `${JSON.stringify(
      {
        ranAtUtc: new Date().toISOString(),
        seasons: args.seasons,
        boardsPerGame: args.boards,
        warmupDays: args.warmupDays,
        slate,
        sampledGames,
        boards: boardsSeen,
        // Biased LOW — every board holding a `quick_out_under_3_pitches` square is forced to miss
        // it. `realizedWinRateOnBoardsWithoutUncalibratableSquares` is the unbiased read.
        realizedWinRate: boardsSeen ? Number((boardsWon / boardsSeen).toFixed(4)) : null,
        boardsWithoutUncalibratableSquares: cleanBoardsSeen,
        realizedWinRateOnBoardsWithoutUncalibratableSquares: cleanBoardsSeen
          ? Number((cleanBoardsWon / cleanBoardsSeen).toFixed(4))
          : null,
        byKind: table(byKind, 20),
        byTeamEvent: table(byTeamEvent, 20),
        byTeamEventSide: table(byTeamEventSide, 20),
        bySquare: table(byKey, 40),
        notCalibratable: {
          quick_out_under_3_pitches: {
            squaresSeen: excludedUncalibratableSquares,
            reason:
              "Derived from our own webhook stream; no /mlb/v1/stats column exists, so the grader " +
              "sees currentCount 0 and settles it miss on every backtested game. Excluded from all " +
              "tables — its realized rate here would be a hard 0.000 artifact, not a measurement. " +
              "It is still counted in realizedWinRate because a real board contains it.",
          },
          playerLevelFamilies: {
            kinds: PLAYER_LEVEL_MLB_KINDS.filter((kind) => !seenKinds.has(kind)),
            reason:
              "Built by buildMLBPlayerPropCandidatesFromRecentStats from an upcoming game's lineups " +
              "and trailing player stats, which a historical replay structurally cannot produce. " +
              "npm run bingo:validate:mlb's realized column is the only instrument that sees them.",
          },
          teamEventPricingCaveat:
            "The six measured team-event families are priced here at predictMlbTeamEventRate(event, " +
            "null, 0) — the LEAGUE MEAN, with no opponent adjustment (see " +
            "buildMlbTeamEventCandidateTemplatesForBacktest). A gap in byTeamEvent judges the " +
            "league-mean base, not the per-game price a live card carries.",
        },
      },
      null,
      2
    )}\n`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
