import "server-only";

import { fetchBallDontLieList, type BallDontLieFailureBox } from "@/lib/ballDontLieClient";
import type { NFLPlayerPropMarket } from "@/lib/sportsBingoOdds";

// Phase 9a of docs/prop-bingo-nfl-plan.md — the star signal.
//
// The ask: names people recognise should be more likely to appear on a board, and the signal that
// decides "recognisable" must update itself during the season rather than decaying into a
// hardcoded list, which is exactly what `MLB_STAR_BRANDED_PLAYER_KEYS` (lib/sportsBingo.ts:163)
// never did. This module computes a `starScore` per player from three blended inputs and exposes
// the pure math as testable functions (9a); Phase 9b wires the tier/reservation rule into
// `pickCandidateSet`'s player-prop draw in lib/sportsBingo.ts. Phase 9c (below) adds the 24h-cached
// live fetch (`resolveNFLStarIndex`), the generated snapshot file, the `npm run bingo:stars:nfl`
// diff script and the staleness tripwire. See the Phase 9a/9b/9c handoff notes at the bottom of
// docs/prop-bingo-nfl-plan.md for exactly where each hands off.
//
// Kept in its own module rather than folded into lib/sportsBingoOdds.ts (which already carries the
// player-prop consensus this module's market signal reads from) because Phase 9c's snapshot script
// needs to import this file without pulling in lib/sportsBingo.ts's 7,000+ line surface — the same
// cycle-avoidance reasoning documented at the top of lib/ballDontLieClient.ts.

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const numberFromEnv = (raw: string | undefined, fallback: number): number => {
  const parsed = Number.parseFloat(raw ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
};

// ---------------------------------------------------------------------------------------------
// Blend weights. `starScore = market*W_MARKET + usage*W_USAGE + production*W_PRODUCTION + brand`,
// every weight env-tunable and documented, exactly as lib/sportsBingoOdds.ts and
// lib/sportsBingoCorrelation.ts already do it. The three base weights are expected to sum to 1;
// they are left independently tunable (rather than derived) so Phase 9c's live audits can nudge
// one without silently renormalizing the others.
// ---------------------------------------------------------------------------------------------

/** Primary signal: this game's own book-posted prop coverage. Zero new requests — see below. */
export const NFL_STAR_WEIGHT_MARKET = numberFromEnv(process.env.BINGO_NFL_STAR_WEIGHT_MARKET, 0.45);
/** Secondary signal: position-normalised season usage volume. */
export const NFL_STAR_WEIGHT_USAGE = numberFromEnv(process.env.BINGO_NFL_STAR_WEIGHT_USAGE, 0.35);
/** Tertiary signal: position-normalised touchdown rate and yards per game. */
export const NFL_STAR_WEIGHT_PRODUCTION = numberFromEnv(process.env.BINGO_NFL_STAR_WEIGHT_PRODUCTION, 0.2);

/**
 * Typical number of distinct book-posted markets on a genuine star in a single game (the plan's
 * own "books post eight prop types for a star" line). Used only to scale prop-type breadth into a
 * 0-1 score, not as a cap on how many props a player can actually have.
 */
export const NFL_STAR_MARKET_BREADTH_NORM = numberFromEnv(process.env.BINGO_NFL_STAR_MARKET_BREADTH_NORM, 8);

/**
 * Shrinkage constant for blending this season's index toward last season's: `w = gamesPlayed /
 * (gamesPlayed + K)`. Same estimator shape Phase 7 uses for opponent event rates
 * (`games / (games + 6)`); NFL gets a smaller K than Phase 7's 6 because an NFL season is 17 games
 * long, not 162, so a player's role is legible far earlier relative to the season.
 */
export const NFL_STAR_PRIOR_SHRINKAGE_K = numberFromEnv(process.env.BINGO_NFL_STAR_PRIOR_SHRINKAGE_K, 3);

/** Hard cap on the hand-maintained brand bonus below — it may nudge a score, never carry one. */
export const NFL_STAR_BRAND_BONUS_MAX = 0.1;

export type NFLStarPosition = "QB" | "RB" | "WR" | "TE" | "K";
const NFL_STAR_POSITIONS = new Set<string>(["QB", "RB", "WR", "TE", "K"]);

// Local copy of lib/sportsBingo.ts's `normalizeNameKey` (not exported there, and importing that
// module from here would cycle back through lib/sportsBingoOdds.ts). Kept in sync by hand; it's a
// ten-line pure function, not a maintenance burden.
function normalizeNameKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------------------------
// A hand-maintained brand list still earns its place (some players are famous well beyond their
// production) — but only as a capped, reviewed bonus, never a tier-setter on its own. Every entry
// carries a `reviewBy` date; `tests/lib.sportsBingo.nfl-star-index.test.ts` asserts the list stays
// under ~25 entries. If the list is doing the work, the signal is broken — fix the signal instead
// of growing this table.
// ---------------------------------------------------------------------------------------------
export const NFL_BRAND_NAME_BONUS: ReadonlyMap<string, { bonus: number; reviewBy: string }> = new Map([
  ["patrick mahomes", { bonus: 0.1, reviewBy: "2027-02-01" }],
  ["josh allen", { bonus: 0.1, reviewBy: "2027-02-01" }],
  ["travis kelce", { bonus: 0.1, reviewBy: "2027-02-01" }],
  ["christian mccaffrey", { bonus: 0.08, reviewBy: "2027-02-01" }],
  ["justin jefferson", { bonus: 0.08, reviewBy: "2027-02-01" }],
  ["ja'marr chase", { bonus: 0.08, reviewBy: "2027-02-01" }],
  ["tyreek hill", { bonus: 0.08, reviewBy: "2027-02-01" }],
  ["saquon barkley", { bonus: 0.08, reviewBy: "2027-02-01" }],
  ["lamar jackson", { bonus: 0.08, reviewBy: "2027-02-01" }],
  ["jalen hurts", { bonus: 0.06, reviewBy: "2027-02-01" }],
  ["joe burrow", { bonus: 0.06, reviewBy: "2027-02-01" }],
  ["cooper kupp", { bonus: 0.06, reviewBy: "2027-02-01" }],
  ["derrick henry", { bonus: 0.06, reviewBy: "2027-02-01" }],
  ["aaron rodgers", { bonus: 0.06, reviewBy: "2027-02-01" }],
]);

/** `starScore` bump for a hand-maintained brand name, clamped to `NFL_STAR_BRAND_BONUS_MAX`. */
export function nflBrandBonus(playerName: string): number {
  const entry = NFL_BRAND_NAME_BONUS.get(normalizeNameKey(playerName));
  return entry ? clamp(entry.bonus, 0, NFL_STAR_BRAND_BONUS_MAX) : 0;
}

// ---------------------------------------------------------------------------------------------
// 1. Market attention — reads Phase 3's already-fetched player-prop markets. Zero new requests,
// and this is what makes the signal self-update: the week a rookie becomes famous is the week the
// books post six markets on him, no deploy required.
// ---------------------------------------------------------------------------------------------

export type NFLStarMarketSignal = {
  /** Distinct prop types this player has a posted market for, in this game. */
  breadth: number;
  /** De-vigged anytime-TD probability, or null when no book posted one. */
  anytimeTdProbability: number | null;
};

/** Reduce a player's raw prop markets for one game into the two numbers the market score needs. */
export function summarizeNFLStarMarketSignal(markets: NFLPlayerPropMarket[]): NFLStarMarketSignal {
  const propTypes = new Set(markets.map((market) => market.propType));
  const anytimeTd = markets.find((market) => market.propType === "anytime_td" && market.marketType === "milestone");
  return {
    breadth: propTypes.size,
    anytimeTdProbability: anytimeTd ? anytimeTd.probability : null,
  };
}

/**
 * Market attention component of `starScore`, 0-1. Breadth (how many distinct markets the books
 * posted) carries more weight than the anytime-TD price alone, since a kicker or a pass-catching
 * back can be a genuine market focal point with no realistic anytime-TD price at all.
 */
export function nflMarketAttentionScore(signal: NFLStarMarketSignal): number {
  const breadthScore = clamp(signal.breadth / Math.max(1, NFL_STAR_MARKET_BREADTH_NORM), 0, 1);
  const tdScore = signal.anytimeTdProbability === null ? 0 : clamp(signal.anytimeTdProbability, 0, 1);
  return clamp(0.6 * breadthScore + 0.4 * tdScore, 0, 1);
}

// ---------------------------------------------------------------------------------------------
// 2 & 3. Season usage and production — `/nfl/v1/season_stats`, one league-wide paginated pull.
// Both are scored as a percentile **within position**: a QB's pass-attempt count and a WR's target
// count are not the same unit, so pooling league-wide would just re-derive "quarterbacks are the
// stars," which is not the point (plan 9a, bullet 2).
// ---------------------------------------------------------------------------------------------

export type BallDontLieNFLSeasonStatsRow = {
  player?: {
    id?: number | string | null;
    position_abbreviation?: string | null;
  } | null;
  games_played?: number | null;
  season?: number | null;
  postseason?: boolean | null;
  passing_attempts?: number | null;
  rushing_attempts?: number | null;
  receiving_targets?: number | null;
  field_goal_attempts?: number | null;
  passing_touchdowns?: number | null;
  rushing_touchdowns?: number | null;
  receiving_touchdowns?: number | null;
  passing_yards_per_game?: number | null;
  rushing_yards_per_game?: number | null;
  receiving_yards_per_game?: number | null;
};

type NFLSeasonUsageRow = {
  playerId: number;
  position: NFLStarPosition;
  gamesPlayed: number;
  usageVolume: number;
  touchdownsPerGame: number;
  yardsPerGame: number;
};

const num = (value: number | null | undefined): number => (Number.isFinite(value as number) ? (value as number) : 0);

/**
 * Position-normalised volume: QB -> pass + rush attempts; RB -> carries + targets; WR/TE ->
 * targets; K -> field-goal attempts. Rows at any other position (defense, special teams) are
 * dropped — Prop Bingo's player props never cover them, so they have no star tilt to feed.
 */
function buildNFLSeasonUsageRows(rows: BallDontLieNFLSeasonStatsRow[]): NFLSeasonUsageRow[] {
  const out: NFLSeasonUsageRow[] = [];
  for (const row of rows) {
    const playerId = Number.parseInt(String(row.player?.id ?? ""), 10);
    const position = String(row.player?.position_abbreviation ?? "").trim().toUpperCase();
    if (!Number.isFinite(playerId) || playerId <= 0 || !NFL_STAR_POSITIONS.has(position)) {
      continue;
    }
    const gamesPlayed = Math.max(0, num(row.games_played));
    const usageVolume =
      position === "QB"
        ? num(row.passing_attempts) + num(row.rushing_attempts)
        : position === "RB"
          ? num(row.rushing_attempts) + num(row.receiving_targets)
          : position === "K"
            ? num(row.field_goal_attempts)
            : num(row.receiving_targets); // WR / TE
    const touchdownsPerGame =
      gamesPlayed > 0
        ? (num(row.passing_touchdowns) + num(row.rushing_touchdowns) + num(row.receiving_touchdowns)) / gamesPlayed
        : 0;
    const yardsPerGame = num(row.passing_yards_per_game) + num(row.rushing_yards_per_game) + num(row.receiving_yards_per_game);
    out.push({
      playerId,
      position: position as NFLStarPosition,
      gamesPlayed,
      usageVolume,
      touchdownsPerGame,
      yardsPerGame,
    });
  }
  return out;
}

/** Fraction of `sortedAsc` at or below `value` — a standard percentile rank, ties included at their own rank. */
function percentileRank(sortedAsc: number[], value: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return value >= sortedAsc[0] ? 1 : 0;
  let atOrBelow = 0;
  for (const entry of sortedAsc) {
    if (entry <= value) atOrBelow += 1;
  }
  return clamp(atOrBelow / sortedAsc.length, 0, 1);
}

export type NFLSeasonStarIndexEntry = {
  playerId: number;
  position: NFLStarPosition;
  gamesPlayed: number;
  /** Percentile (0-1) within this player's own position. */
  usagePercentile: number;
  /** Mean of the touchdown-rate and yards-per-game percentiles within position. */
  productionPercentile: number;
};

/**
 * Rank every player in a `/nfl/v1/season_stats` pull against their positional peers. Pure
 * function — the network fetch is `fetchNFLSeasonStats` below, kept separate so this half is
 * trivially unit-testable against a hand-built fixture.
 */
export function computeNFLSeasonStarIndex(rows: BallDontLieNFLSeasonStatsRow[]): Map<number, NFLSeasonStarIndexEntry> {
  const usageRows = buildNFLSeasonUsageRows(rows);
  const byPosition = new Map<NFLStarPosition, NFLSeasonUsageRow[]>();
  for (const row of usageRows) {
    const bucket = byPosition.get(row.position);
    if (bucket) {
      bucket.push(row);
    } else {
      byPosition.set(row.position, [row]);
    }
  }

  const index = new Map<number, NFLSeasonStarIndexEntry>();
  for (const [position, group] of byPosition) {
    const usageSorted = group.map((row) => row.usageVolume).sort((a, b) => a - b);
    const tdSorted = group.map((row) => row.touchdownsPerGame).sort((a, b) => a - b);
    const yardsSorted = group.map((row) => row.yardsPerGame).sort((a, b) => a - b);
    for (const row of group) {
      const usagePercentile = percentileRank(usageSorted, row.usageVolume);
      const productionPercentile =
        (percentileRank(tdSorted, row.touchdownsPerGame) + percentileRank(yardsSorted, row.yardsPerGame)) / 2;
      index.set(row.playerId, {
        playerId: row.playerId,
        position,
        gamesPlayed: row.gamesPlayed,
        usagePercentile,
        productionPercentile,
      });
    }
  }
  return index;
}

/**
 * One league-wide paginated `/nfl/v1/season_stats` pull for a season. Never throws: a provider
 * outage returns an empty array, which — same as everywhere else in this codebase — degrades the
 * star tilt to "no signal" rather than breaking board generation. Caching this behind a 24h TTL is
 * Phase 9c's job (`resolveNFLStarIndex`), not this function's.
 */
export async function fetchNFLSeasonStats(
  season: number,
  options: { postseason?: boolean; failure?: BallDontLieFailureBox } = {}
): Promise<BallDontLieNFLSeasonStatsRow[]> {
  const query = new URLSearchParams({ season: String(season), per_page: "100" });
  if (options.postseason) {
    query.set("postseason", "true");
  }
  try {
    // A full NFL player pool is on the order of two thousand rows across every roster spot; at
    // per_page 100 that's ~20 pages, so 40 leaves headroom without risking an unbounded walk.
    return await fetchBallDontLieList<BallDontLieNFLSeasonStatsRow>("/nfl/v1/season_stats", query, {
      maxPages: 40,
      failure: options.failure,
    });
  } catch (error) {
    console.error("[sportsBingoNflStars] Failed to fetch NFL season stats:", error);
    if (options.failure) {
      options.failure.failed = true;
    }
    return [];
  }
}

/**
 * BDL's `season` param is the year the season started (the 2025 season runs Sept 2025 - Feb 2026),
 * the same convention `lib/nflWeekUtils.ts` uses. Phase 1's calendar window runs
 * September-mid-February, so January/February still belong to the season that started the
 * previous calendar year.
 */
export function resolveCurrentNFLSeasonYear(now: Date = new Date()): number {
  const month = now.getUTCMonth() + 1; // 1-12
  const year = now.getUTCFullYear();
  return month <= 2 ? year - 1 : year;
}

export function resolvePriorNFLSeasonYear(now: Date = new Date()): number {
  return resolveCurrentNFLSeasonYear(now) - 1;
}

// ---------------------------------------------------------------------------------------------
// The blend, including early-season shrinkage toward the prior season's index. See the module
// doc comment for what still has to happen (9b: wiring; 9c: caching/snapshot/tripwire) before this
// changes what a real board looks like.
// ---------------------------------------------------------------------------------------------

export type NFLStarScoreInputs = {
  playerName: string;
  market: NFLStarMarketSignal;
  /** This player's row in the current season's index, or null if absent (no stats yet, or a true rookie). */
  current: NFLSeasonStarIndexEntry | null;
  /** This player's row in the prior season's index, or null (rookie / no BDL history). */
  prior: NFLSeasonStarIndexEntry | null;
};

export type NFLStarScoreResult = {
  starScore: number;
  marketScore: number;
  usagePercentile: number;
  productionPercentile: number;
  brandBonus: number;
};

/**
 * `w = gamesPlayed / (gamesPlayed + K)`: as the current season accumulates games, its own index
 * value is trusted more and the prior season's fades out. With no prior season at all, the current
 * value (even from very few games) is used outright rather than shrunk toward nothing — a rookie's
 * early usage is real signal, it just has no season to blend against.
 */
function blendSeasonComponent(currentPercentile: number | null, priorPercentile: number | null, gamesPlayed: number): number {
  if (currentPercentile === null && priorPercentile === null) return 0;
  if (priorPercentile === null) return currentPercentile ?? 0;
  if (currentPercentile === null) return priorPercentile;
  const weight = gamesPlayed / (gamesPlayed + NFL_STAR_PRIOR_SHRINKAGE_K);
  return clamp(weight * currentPercentile + (1 - weight) * priorPercentile, 0, 1);
}

/**
 * `starScore = 0.45*market + 0.35*usage + 0.20*production + brandBonus`, per Phase 9a. Selection
 * only — nothing here touches a square's priced probability (Phase 9b's line to hold, inherited
 * from Phase 5's `orderByDifficulty`).
 *
 * A feed failure (both `current` and `prior` null) degrades to market-only, which is the correct
 * behavior for a true rookie the season-stats feed has nothing on yet, not a special case.
 */
export function computeNFLStarScore(inputs: NFLStarScoreInputs): NFLStarScoreResult {
  const marketScore = nflMarketAttentionScore(inputs.market);
  const usagePercentile = blendSeasonComponent(
    inputs.current?.usagePercentile ?? null,
    inputs.prior?.usagePercentile ?? null,
    inputs.current?.gamesPlayed ?? 0
  );
  const productionPercentile = blendSeasonComponent(
    inputs.current?.productionPercentile ?? null,
    inputs.prior?.productionPercentile ?? null,
    inputs.current?.gamesPlayed ?? 0
  );
  const brandBonus = nflBrandBonus(inputs.playerName);
  const starScore = clamp(
    NFL_STAR_WEIGHT_MARKET * marketScore + NFL_STAR_WEIGHT_USAGE * usagePercentile + NFL_STAR_WEIGHT_PRODUCTION * productionPercentile + brandBonus,
    0,
    1 + NFL_STAR_BRAND_BONUS_MAX
  );
  return { starScore, marketScore, usagePercentile, productionPercentile, brandBonus };
}

// ---------------------------------------------------------------------------------------------
// Phase 9b — tiering. The selection rule itself (the weighted draw, the slot reservation, the
// diversity caps it pushes against) lives in `pickCandidateSet` in lib/sportsBingo.ts, because
// that is the function that decides what a board is. What lives here is the part that is purely
// about the star signal: turning a set of per-player scores into `star` / `known` / `deep`, and
// the tunables that govern it, so all of Phase 9's knobs sit in one documented block.
// ---------------------------------------------------------------------------------------------

export type NFLStarTier = "star" | "known" | "deep";

/** A player at or above this percentile of the game's own prop pool reads as its `star` tier. */
export const NFL_STAR_TIER_STAR_PERCENTILE = clamp(
  numberFromEnv(process.env.BINGO_NFL_STAR_TIER_STAR_PERCENTILE, 0.75),
  0.5,
  0.95
);
/** …and at or above this one as `known`. Below it is `deep`. */
export const NFL_STAR_TIER_KNOWN_PERCENTILE = clamp(
  numberFromEnv(process.env.BINGO_NFL_STAR_TIER_KNOWN_PERCENTILE, 0.4),
  0.05,
  NFL_STAR_TIER_STAR_PERCENTILE - 0.05
);

/**
 * Draw-weight multiplier per tier. Deliberately tier-based rather than a direct function of the
 * raw `starScore`: until Phase 9c's season index is wired in, scores compress into a narrow band
 * (market attention alone), and a multiplier read straight off a compressed score would quietly
 * stop tilting. A percentile tier is invariant to that compression, and it asks the question the
 * plan actually asks — *who is the star of this game* — which is also the right answer on a thin
 * Thursday slate where the best available player should still read as a star.
 *
 * `deep` sits at 1.0 on purpose: a lesser-known player is weighted **down relative to a star**,
 * never removed from the pool. Zero unknowns and zero stars are both failure states, and drawing
 * rather than filtering is what rules the second one out.
 */
export const NFL_STAR_TIER_BOOST: Readonly<Record<NFLStarTier, number>> = {
  star: Math.max(1, numberFromEnv(process.env.BINGO_NFL_STAR_TIER_BOOST_STAR, 2.6)),
  known: Math.max(1, numberFromEnv(process.env.BINGO_NFL_STAR_TIER_BOOST_KNOWN, 1.4)),
  deep: 1,
};

/** Of the eight NFL prop slots, at most this many may go to `star`-tier players. */
export const NFL_STAR_MAX_STAR_SLOTS = Math.max(
  1,
  Math.round(numberFromEnv(process.env.BINGO_NFL_STAR_MAX_STAR_SLOTS, 5))
);
/**
 * …and at least this many are reserved for `known`/`deep`. A hard reservation on what is *offered*
 * to the draw, not a soft weight: soft weights drift under Phase 5's escalating `difficultyBias`,
 * a reservation does not.
 */
export const NFL_STAR_MIN_NON_STAR_SLOTS = Math.max(
  0,
  Math.round(numberFromEnv(process.env.BINGO_NFL_MIN_NON_STAR_SLOTS, 2))
);

// ---------------------------------------------------------------------------------------------
// Phase 9c — the check-in mechanism. `resolveNFLStarIndex` is the live, automatic layer (24h
// cache over the two `fetchNFLSeasonStats` pulls Phase 9b's caller needs); the generated snapshot,
// its diff script and the staleness tripwire live in scripts/refresh-nfl-star-index.cjs and
// data/sports-bingo/nfl-star-index.json. See the plan's 9c section for why all four layers exist.
// ---------------------------------------------------------------------------------------------

/**
 * The two season indexes `computeNFLStarScore` blends against. Kept as one object so a caller
 * threads one value rather than two — mirrors the shape `lib/sportsBingo.ts` already declared for
 * this pairing before 9c existed to produce a real one.
 */
export type NFLSeasonStarIndexPair = {
  current: ReadonlyMap<number, NFLSeasonStarIndexEntry>;
  prior: ReadonlyMap<number, NFLSeasonStarIndexEntry>;
};

/**
 * 24h cache TTL for `resolveNFLStarIndex`, same `cacheMsInWindow` shape lib/sportsBingo.ts uses
 * for `SEASON_STATUS_CACHE_MS` / `GAME_CATALOG_CACHE_MS` (duplicated here rather than imported —
 * lib/sportsBingo.ts imports this module, so the reverse import would cycle; it's four lines).
 */
const cacheMsInWindow = (raw: string | undefined, fallback: number, min: number, max: number): number => {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
};

const NFL_STAR_INDEX_CACHE_MS = cacheMsInWindow(
  process.env.BINGO_NFL_STAR_INDEX_CACHE_MS,
  24 * 60 * 60_000,
  60 * 60_000,
  48 * 60 * 60_000
);

let nflStarIndexCache: { expiresAt: number; season: number; pair: NFLSeasonStarIndexPair } | null = null;

/**
 * The negative TTL for an index built out of a *failed* `/nfl/v1/season_stats` pull. Distinguishing
 * "the feed answered with no rows" from "the feed was down" is the point: the first is a real
 * answer and earns the full 24-hour TTL, the second used to pin every board in the next 24 hours to
 * market-attention-only tilt on the strength of one bad provider minute.
 */
const NFL_STAR_INDEX_FAILURE_CACHE_MS = 5 * 60_000;

/**
 * The live, automatic check-in layer (plan 9c #1): a player who breaks out on Sunday is in the
 * star tier by Tuesday with no deploy and no human, because this just re-pulls
 * `/nfl/v1/season_stats` once the 24h cache expires. Cached by `season` (not by `now`) so a Sunday
 * slate of 13 games shares one league-wide pull instead of issuing 13.
 *
 * `fetchSeasonStats` is injectable purely for tests — it defaults to the real `fetchNFLSeasonStats`
 * above, which already degrades a feed failure to `[]` rather than throwing, so this function never
 * throws either: a provider outage yields empty `current`/`prior` maps, which is exactly the input
 * that makes `computeNFLStarScore` fall back to market-attention-only (the plan's documented
 * degradation path, not a special case here).
 */
export async function resolveNFLStarIndex(
  now: Date = new Date(),
  fetchSeasonStats: (
    season: number,
    options?: { failure?: BallDontLieFailureBox }
  ) => Promise<BallDontLieNFLSeasonStatsRow[]> = fetchNFLSeasonStats
): Promise<NFLSeasonStarIndexPair> {
  const season = resolveCurrentNFLSeasonYear(now);
  const nowMs = now.getTime();
  if (nflStarIndexCache && nflStarIndexCache.season === season && nflStarIndexCache.expiresAt > nowMs) {
    return nflStarIndexCache.pair;
  }

  const priorSeason = resolvePriorNFLSeasonYear(now);
  // Phase 5 of docs/prop-bingo-code-review-fix-plan.md — a provider outage resolves to `[]` here,
  // same as it always has, but it must not be *cached* as though the feed had answered "no players"
  // for the next 24 hours. A failed pull gets a short negative TTL so the next board re-asks.
  const failure: BallDontLieFailureBox = { failed: false };
  const [currentRows, priorRows] = await Promise.all([
    fetchSeasonStats(season, { failure }),
    fetchSeasonStats(priorSeason, { failure }),
  ]);
  const pair: NFLSeasonStarIndexPair = {
    current: computeNFLSeasonStarIndex(currentRows),
    prior: computeNFLSeasonStarIndex(priorRows),
  };
  nflStarIndexCache = {
    expiresAt: nowMs + (failure.failed ? NFL_STAR_INDEX_FAILURE_CACHE_MS : NFL_STAR_INDEX_CACHE_MS),
    season,
    pair,
  };
  return pair;
}

// ---------------------------------------------------------------------------------------------
// The generated snapshot's staleness tripwire (plan 9c #4). Pure and dependency-free on purpose:
// the actual CI gate (`resolveLeagueSeasonStatus("americanfootball_nfl")` reporting in-season) is
// asserted alongside this in tests/lib.sportsBingo.nfl-star-index.test.ts, which is free to import
// lib/leagueSeasonStatus.ts without this module needing to.
// ---------------------------------------------------------------------------------------------

export const NFL_STAR_INDEX_SNAPSHOT_MAX_AGE_DAYS = 14;

export type NFLStarIndexSnapshotPlayer = {
  playerId: number;
  name: string | null;
  position: NFLStarPosition;
  gamesPlayed: number;
  usagePercentile: number;
  productionPercentile: number;
};

export type NFLStarIndexSnapshot = {
  generatedAt: string;
  season: number;
  priorSeason: number;
  /** Empty pre-season / early-season by design — see scripts/refresh-nfl-star-index.cjs. */
  current: { players: NFLStarIndexSnapshotPlayer[] };
  prior: { players: NFLStarIndexSnapshotPlayer[] };
};

/** True when `generatedAt` is unparsable or older than `NFL_STAR_INDEX_SNAPSHOT_MAX_AGE_DAYS`. */
export function isNFLStarIndexSnapshotStale(generatedAt: string, now: Date = new Date()): boolean {
  const generatedMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedMs)) {
    return true;
  }
  const ageDays = (now.getTime() - generatedMs) / (24 * 60 * 60 * 1000);
  return ageDays > NFL_STAR_INDEX_SNAPSHOT_MAX_AGE_DAYS;
}

/**
 * Tier a set of per-player star scores by percentile **within that set** — this game's own prop
 * pool, never a league-wide distribution.
 *
 * `entries` is keyed by player, not by square: a quarterback with nine posted markets would
 * otherwise drag the percentile scale around by himself, and the question is about people rather
 * than squares. Ties share a tier, so a pool where everyone scores identically produces no stars
 * by accident of ordering.
 *
 * Returns `null` when nothing in the pool carries a finite score — a provider outage, a game with
 * no props, or any pool built before Phase 9b existed. That null is the fallback the plan
 * requires: no index, no tilt, board selection exactly as it worked before.
 */
export function assignNFLStarTiers(entries: ReadonlyMap<string, number>): Map<string, NFLStarTier> | null {
  const scored = [...entries.entries()].filter(([, score]) => Number.isFinite(score));
  if (scored.length === 0) {
    return null;
  }
  const sortedAsc = scored.map(([, score]) => score).sort((a, b) => a - b);
  const tiers = new Map<string, NFLStarTier>();
  for (const [playerKey, score] of scored) {
    // Fraction of the pool scoring strictly below this player.
    let below = 0;
    for (const entry of sortedAsc) {
      if (entry < score) below += 1;
    }
    const percentile = below / sortedAsc.length;
    tiers.set(
      playerKey,
      percentile >= NFL_STAR_TIER_STAR_PERCENTILE
        ? "star"
        : percentile >= NFL_STAR_TIER_KNOWN_PERCENTILE
          ? "known"
          : "deep"
    );
  }
  return tiers;
}
