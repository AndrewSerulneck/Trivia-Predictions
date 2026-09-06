#!/usr/bin/env node

/**
 * Phase 1 of docs/prop-bingo-nfl-activation-plan.md — audit real Week 1 NFL boards offline,
 * before the flag flips and before anyone can see one.
 *
 * For each requested game id it:
 *   1. lists the full candidate pool (`listSportsBingoSquareTemplates`) to recover each square's
 *      bucket / supportLevel / resolverKind, which the board preview does not carry;
 *   2. generates N boards (`generateSportsBingoBoard`, generationMode "final");
 *   3. joins the chosen 25 squares back onto the candidate pool by key and scores every board
 *      against the parity bar: bucket mix, star-tier prop count, duplicate players, probability
 *      band, label length, early-resolvability.
 *
 * Star tier here is a NAME-RECOGNITION proxy, not the generator's own percentile tiering: a prop
 * player is "star" if he sits at productionPercentile >= 0.75 in the committed 2025 prior star
 * index, "known" at >= 0.40, "deep"/"unknown" otherwise. That is exactly the question Phase 1
 * asks ("do the names read as recognisable NFL players") and needs no odds re-plumbing.
 *
 * The forward board pipeline (`getGameCatalog`) only serves games inside BINGO_LOOKAHEAD_HOURS.
 * That is a hardcoded `const = 36` in lib/sportsBingo.ts (NOT env-configurable in prod), so:
 *   - Run this ON or AFTER the day the target games enter the 36h window and it "just works".
 *   - To audit earlier (as Phase 1 did on 2026-09-05, 4-8 days out), temporarily change that const
 *     to a wide value (e.g. 240), run, then REVERT it. Do not commit that edit.
 * `generateSportsBingoBoard({ gameId })` takes an explicit id and bypasses the "today only" filter
 * in `listSportsBingoGames`, so pass --games with ids from `npm run bingo:probe:nfl`.
 *
 *   node --env-file=.env.local --conditions react-server --import tsx \
 *     scripts/audit-nfl-week1-boards.cjs --games 1392216,1392218 --boards 6 --out /tmp/audit.json
 *
 * Star tier here is a NAME-RECOGNITION proxy against the committed 2025 prior star index; the
 * generator's own within-game percentile tiering is logged separately as `[sportsBingo] nfl_star_mix`.
 */

const path = require("node:path");
const fs = require("node:fs");

const SPORT_KEY = "americanfootball_nfl";
const CORE_MIN = Number.parseFloat(process.env.BINGO_CORE_SQUARE_MIN_PROBABILITY ?? "0.18");
const CORE_MAX = Number.parseFloat(process.env.BINGO_CORE_SQUARE_MAX_PROBABILITY ?? "0.82");

const TARGET_MIX = { moneyline: 2, spread: 3, total: 3, "team-total": 2, special: 6, "player-prop": 8 };

function parseArgs(argv) {
  const args = { games: [], boards: 6, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--games") {
      args.games = String(argv[i + 1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      i += 1;
    } else if (flag === "--boards") {
      args.boards = Number.parseInt(argv[i + 1], 10) || args.boards;
      i += 1;
    } else if (flag === "--out") {
      args.out = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function loadPriorStarIndex() {
  const p = path.join(__dirname, "..", "data", "sports-bingo", "nfl-star-index.json");
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  const prior = new Map();
  for (const row of raw.prior?.players ?? []) {
    if (row.name) prior.set(row.name.toLowerCase(), row);
  }
  const current = new Map();
  for (const row of raw.current?.players ?? []) {
    if (row.name) current.set(row.name.toLowerCase(), row);
  }
  return { prior, current, generatedAt: raw.generatedAt, season: raw.season, priorSeason: raw.priorSeason };
}

// A prop label is one of:
//   "C. McCaffrey 79+ Rush Yds"   (over/under milestone)
//   "Puka Nacua Anytime TD"
//   "J. Chase Scores First TD"
// Pull the player-name portion off the front.
function playerFromPropLabel(label) {
  let s = label
    .replace(/\s+scores the game's first touchdown\.?.*$/i, "")
    .replace(/\s+scores a touchdown\.?.*$/i, "")
    .replace(/\s+anytime td\b.*$/i, "")
    .replace(/\s+scores first td\b.*$/i, "")
    .replace(/\s+first td\b.*$/i, "")
    .replace(/:\s*at least\b.*$/i, "")
    .replace(/:\s*(over|under)\b.*$/i, "")
    .replace(/\s+\d[\d.]*\+?\s+.*$/, "") // "79+ Rush Yds", "1.5 passing touchdowns"
    .replace(/\s+(over|under)\b.*$/i, "")
    .replace(/[.:]\s*$/, "")
    .trim();
  return s;
}

// Match "C. McCaffrey" or "Christian McCaffrey" against an index keyed by full lowercased name.
function starTierForPlayer(rawName, index) {
  const name = rawName.toLowerCase().trim();
  if (!name) return { tier: "unknown", matched: null };
  let entry = index.get(name);
  if (!entry) {
    // initial-form: "c. mccaffrey" -> match any "<first> mccaffrey" whose first initial is c
    const m = name.match(/^([a-z])[.\s]+(.+)$/);
    if (m) {
      const [, initial, last] = m;
      for (const [full, row] of index) {
        const parts = full.split(/\s+/);
        if (parts.length >= 2 && parts[parts.length - 1] === last && parts[0][0] === initial) {
          entry = row;
          break;
        }
      }
    }
  }
  if (!entry) return { tier: "unknown", matched: null };
  const pct = entry.productionPercentile ?? 0;
  const tier = pct >= 0.75 ? "star" : pct >= 0.4 ? "known" : "deep";
  return { tier, matched: entry.name, productionPercentile: pct, usagePercentile: entry.usagePercentile };
}

// Squares that can flip before the 4th quarter.
function canResolveEarly(key, label, bucket) {
  const k = `${key} ${label}`.toLowerCase();
  // Definitely can be decided before Q4: first-score / first-TD, and any quarter/half-scoped square.
  if (
    /first touchdown|first td|scores first|first score|first_score|scored_first|1q|2q|3q|first quarter|second quarter|third quarter|halftime|half-time|1st half|first half|leads at halftime|halftime leader|by halftime|opening (drive|kickoff)|first field goal/.test(
      k
    )
  ) {
    return true;
  }
  // Can hit any time, frequently in the first three quarters.
  if (bucket === "player-prop" && /touchdown/.test(k)) return "mid";
  if (/every quarter|quarter ends with neither|scoreless quarter|shutout quarter|non-quarterback throws|safety is scored|defensive touchdown|special teams touchdown/.test(k)) return "mid";
  return false;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sportsBingo = await import("../lib/sportsBingo.ts");
  const starIdx = loadPriorStarIndex();

  let gameIds = args.games;
  let catalogGames = [];
  try {
    // Not filtered to "today" — reads the raw catalog for the lookahead window.
    const templatesProbe = await sportsBingo.listSportsBingoGames({ sportKey: SPORT_KEY, includeLocked: true });
    catalogGames = templatesProbe;
  } catch (e) {
    // ignore
  }

  if (gameIds.length === 0) {
    // Fall back: walk a wide date range through listSportsBingoSquareTemplates is not possible
    // without ids, so rely on the "today" list plus whatever the caller passed. Warn loudly.
    gameIds = catalogGames.map((g) => g.id);
  }

  const report = {
    ranAtUtc: new Date().toISOString(),
    lookaheadHours: process.env.BINGO_LOOKAHEAD_HOURS ?? "(default 36)",
    starIndex: {
      generatedAt: starIdx.generatedAt,
      season: starIdx.season,
      priorSeason: starIdx.priorSeason,
      priorCount: starIdx.prior.size,
      currentCount: starIdx.current.size,
    },
    coreBand: [CORE_MIN, CORE_MAX],
    targetMix: TARGET_MIX,
    games: [],
  };

  for (const gameId of gameIds) {
    let templates;
    try {
      templates = await sportsBingo.listSportsBingoSquareTemplates({
        gameId,
        sportKey: SPORT_KEY,
        includePlayerProps: true,
      });
    } catch (e) {
      report.games.push({ gameId, error: `templates: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }

    const byKey = new Map(templates.squares.map((s) => [s.key, s]));
    const gameEntry = {
      gameId,
      matchup: `${templates.game.awayTeam} @ ${templates.game.homeTeam}`,
      startsAt: templates.game.startsAt,
      candidatePool: {
        total: templates.squares.length,
        byBucket: tally(templates.squares.map((s) => s.bucket)),
        propPlayers: [
          ...new Set(
            templates.squares
              .filter((s) => s.bucket === "player-prop")
              .map((s) => playerFromPropLabel(s.label))
          ),
        ],
      },
      boards: [],
    };

    for (let trial = 0; trial < args.boards; trial += 1) {
      let board;
      try {
        board = await sportsBingo.generateSportsBingoBoard({
          gameId,
          sportKey: SPORT_KEY,
          generationMode: "final",
        });
      } catch (e) {
        gameEntry.boards.push({ trial, error: e instanceof Error ? e.message : String(e) });
        continue;
      }

      const live = board.squares.filter((sq) => !sq.isFree);
      const free = board.squares.filter((sq) => sq.isFree);
      const enriched = live.map((sq) => {
        const tpl = byKey.get(sq.key);
        const bucket = tpl?.bucket ?? "(unknown)";
        let star = null;
        let player = null;
        if (bucket === "player-prop") {
          player = playerFromPropLabel(sq.label);
          star = starTierForPlayer(player, starIdx.prior);
        }
        return {
          index: sq.index,
          key: sq.key,
          label: sq.label,
          labelLen: sq.label.length,
          probability: Number(sq.probability.toFixed(4)),
          bucket,
          resolverKind: tpl?.resolverKind ?? null,
          supportLevel: tpl?.supportLevel ?? sq.supportLevel ?? null,
          player,
          starTier: star?.tier ?? null,
          starMatched: star?.matched ?? null,
          early: canResolveEarly(sq.key, sq.label, bucket),
        };
      });

      const mix = tally(enriched.map((s) => s.bucket));
      const propRows = enriched.filter((s) => s.bucket === "player-prop");
      const starCounts = tally(propRows.map((s) => s.starTier));
      const players = propRows.map((s) => (s.player || "").toLowerCase()).filter(Boolean);
      const dupPlayers = players.filter((p, i) => players.indexOf(p) !== i);

      const coreLadder = enriched.filter((s) => ["spread", "total", "team-total"].includes(s.bucket));
      const outOfBandCore = coreLadder.filter((s) => s.probability < CORE_MIN || s.probability > CORE_MAX);
      const outOfBandAny = enriched.filter((s) => s.probability < CORE_MIN || s.probability > CORE_MAX);

      const sortedByLen = [...enriched].sort((a, b) => b.labelLen - a.labelLen);
      const earlyCount = enriched.filter((s) => s.early === true).length;
      const midCount = enriched.filter((s) => s.early === "mid").length;

      gameEntry.boards.push({
        trial,
        boardProbability: Number(board.boardProbability.toFixed(4)),
        squareCount: board.squares.length,
        freeCount: free.length,
        liveCount: live.length,
        bucketMix: mix,
        mixVsTarget: diffMix(mix, TARGET_MIX),
        propStarTierCounts: starCounts,
        propPlayers: propRows.map((s) => ({ player: s.player, tier: s.starTier, matched: s.starMatched, label: s.label })),
        duplicatePropPlayers: dupPlayers,
        anyPlayerOnTwoSquares: dupPlayers.length > 0,
        probability: {
          min: Math.min(...enriched.map((s) => s.probability)),
          max: Math.max(...enriched.map((s) => s.probability)),
        },
        outOfBandCoreLadder: outOfBandCore.map((s) => ({ label: s.label, p: s.probability, bucket: s.bucket })),
        outOfBandAnySquare: outOfBandAny.map((s) => ({ label: s.label, p: s.probability, bucket: s.bucket })),
        labelLength: {
          max: sortedByLen[0]?.labelLen ?? 0,
          longest: sortedByLen.slice(0, 8).map((s) => `[${s.labelLen}] ${s.label}`),
        },
        earlyResolvable: { definiteEarly: earlyCount, canGoEarlyMid: midCount, total: enriched.length },
        squares: enriched,
      });
    }

    report.games.push(gameEntry);
  }

  const json = JSON.stringify(report, null, 2);
  if (args.out) {
    fs.writeFileSync(args.out, json);
    console.error(`wrote ${args.out}`);
  } else {
    console.log(json);
  }
}

function tally(arr) {
  const out = {};
  for (const v of arr) out[v] = (out[v] ?? 0) + 1;
  return out;
}

function diffMix(actual, target) {
  const out = {};
  for (const k of Object.keys(target)) {
    const a = actual[k] ?? 0;
    out[k] = `${a}/${target[k]}${a === target[k] ? "" : a > target[k] ? " (+" + (a - target[k]) + ")" : " (" + (a - target[k]) + ")"}`;
  }
  for (const k of Object.keys(actual)) {
    if (!(k in target)) out[k] = `${actual[k]}/0 (UNEXPECTED BUCKET)`;
  }
  return out;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
