import "server-only";

import { fetchBallDontLieList, type BallDontLieFailureBox } from "@/lib/ballDontLieClient";
import type { MLBPlayerPropMarket } from "@/lib/sportsBingoOdds";

// Phase 9d of docs/prop-bingo-nfl-plan.md — the MLB half of the self-updating star index.
//
// This module exists to retire `MLB_STAR_BRANDED_PLAYER_KEYS` (lib/sportsBingo.ts) as a *selection*
// signal. That set was eleven hardcoded lowercase names carrying a flat 1.45x draw boost, with no
// owner, no expiry, no test, and no mechanism by which a rookie who breaks out in June ever entered
// it — the exact rot problem Phase 9 was written to solve, and the one design the plan said this
// phase must not reproduce. Everything here mirrors lib/sportsBingoNflStars.ts one-for-one, with
// four deliberate differences called out at their definitions:
//
//   1. `resolveCurrentMLBSeasonYear` — MLB seasons are named for the calendar year they run in, so
//      the NFL "season starts in the previous year" offset does not apply.
//   2. `MLB_STAR_PRIOR_SHRINKAGE_K` — 162 games, not 17, so a season's own signal stabilises over a
//      much larger number of games.
//   3. Star *groups* are batter/pitcher rather than five positions — MLB props are overwhelmingly
//      batting props, and `/mlb/v1/season_stats` reports batting and pitching volume in units
//      (plate appearances vs. innings pitched) that only make sense compared within their own kind.
//   4. The market signal's milestone analogue is the home-run price, not anytime-TD.
//
// The hand-maintained brand list survives here, but demoted from "sets the tier" to "adds at most
// +0.10" and dated for review — same contract as NFL_BRAND_NAME_BONUS. It is also now the single
// source for the `mlb_star_hr:` branded-square feature in lib/sportsBingo.ts, so there is one list
// rather than two that can drift.
//
// Kept in its own module (not folded into lib/sportsBingoOdds.ts or lib/sportsBingo.ts) for the
// same cycle-avoidance reason lib/sportsBingoNflStars.ts is: the snapshot script imports this file
// directly and must not pull in lib/sportsBingo.ts's 9,000-line surface.

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const numberFromEnv = (raw: string | undefined, fallback: number): number => {
  const parsed = Number.parseFloat(raw ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
};

// ---------------------------------------------------------------------------------------------
// Blend weights — same three-signal split and the same defaults as NFL, independently tunable so a
// live audit can nudge one without silently renormalizing the others.
// ---------------------------------------------------------------------------------------------

/** Primary signal: this game's own book-posted prop coverage. Zero new requests. */
export const MLB_STAR_WEIGHT_MARKET = numberFromEnv(process.env.BINGO_MLB_STAR_WEIGHT_MARKET, 0.45);
/** Secondary signal: season usage volume, percentiled within batter/pitcher. */
export const MLB_STAR_WEIGHT_USAGE = numberFromEnv(process.env.BINGO_MLB_STAR_WEIGHT_USAGE, 0.35);
/** Tertiary signal: season production rate, percentiled within batter/pitcher. */
export const MLB_STAR_WEIGHT_PRODUCTION = numberFromEnv(process.env.BINGO_MLB_STAR_WEIGHT_PRODUCTION, 0.2);

/**
 * Number of distinct gradeable markets a fully-covered player carries, **per group**.
 *
 * Both are lower than NFL's 8 because breadth is counted over `MLB_PROP_TYPE_TO_MARKET_KEY`, which
 * admits only the 8 prop types an MLB box score can settle. Those 8 do not divide evenly: five are
 * batting markets (hits / home runs / RBIs / runs / stolen bases) and three are pitching ones
 * (strikeouts / earned runs / outs), so one shared norm would cap a pitcher's market score at 3/5
 * by construction and no ace could ever out-score a bench outfielder. Measured live on 2026-08-17
 * (ATL @ MIN): every starting position player carried exactly 5, both starting pitchers exactly 3.
 *
 * This is the same "percentile within the player's own group" discipline the usage and production
 * halves already use, applied to the market half — batting and pitching prop coverage are simply
 * not the same scale.
 *
 * The books post ~28 prop types on a live game, but the other 20 are combos and derivatives Prop
 * Bingo drops at parse time; counting them would need a second unfiltered fetch for no real gain,
 * since tiers are percentiles inside this game's own pool and a uniform rescale changes nobody's
 * tier.
 */
export const MLB_STAR_MARKET_BREADTH_NORM_BATTER = numberFromEnv(
  process.env.BINGO_MLB_STAR_MARKET_BREADTH_NORM_BATTER,
  5
);
export const MLB_STAR_MARKET_BREADTH_NORM_PITCHER = numberFromEnv(
  process.env.BINGO_MLB_STAR_MARKET_BREADTH_NORM_PITCHER,
  3
);

/**
 * Shrinkage constant for blending this season's index toward last season's: `w = gamesPlayed /
 * (gamesPlayed + K)`.
 *
 * 15, against NFL's 3, because an MLB season is 162 games long. NFL's K of 3 says "trust this
 * season outright by about week 6 of 17"; 15 is the same fraction of a baseball season's stabilising
 * point — roughly a month in — and is where per-game counting rates stop being dominated by a hot
 * or cold week. Env-tunable for the same reason NFL's is.
 */
export const MLB_STAR_PRIOR_SHRINKAGE_K = numberFromEnv(process.env.BINGO_MLB_STAR_PRIOR_SHRINKAGE_K, 15);

/** Hard cap on the hand-maintained brand bonus below — it may nudge a score, never carry one. */
export const MLB_STAR_BRAND_BONUS_MAX = 0.1;

/**
 * Batting and pitching volume are different units, so a percentile is only meaningful inside one of
 * them. Two groups rather than NFL's five positions: MLB's gradeable prop surface is 5 batting
 * markets and 3 pitching ones, and a shortstop's plate appearances and a left fielder's are the
 * same measurement.
 */
export type MLBStarGroup = "batter" | "pitcher";

/**
 * balldontlie returns `player.position` in two vocabularies on the same endpoint — abbreviated
 * ("RP", "SP", "SS", "DH") for most rows and spelled out ("Relief Pitcher", "Shortstop") for a few
 * hundred. Confirmed live on 2026-08-17: a 2025 pull carries `RP:428 SP:242 Relief Pitcher:179 …
 * Starting Pitcher:96 … Left Fielder:27`. Anything that is not recognisably a pitcher is treated as
 * a batter, which is the safe default — a two-way player like Ohtani carries batting props, and an
 * unrecognised position on a position player would otherwise drop him from the index entirely.
 */
export function resolveMLBStarGroup(rawPosition: string): MLBStarGroup {
  const position = String(rawPosition ?? "").trim().toUpperCase();
  if (!position) {
    return "batter";
  }
  if (position === "P" || position === "SP" || position === "RP") {
    return "pitcher";
  }
  return position.includes("PITCHER") ? "pitcher" : "batter";
}

// Local copy of lib/sportsBingo.ts's `normalizeNameKey`, for the same reason
// lib/sportsBingoNflStars.ts keeps one: that module imports this one, so the reverse import would
// cycle. Ten lines of pure string handling, kept in sync by hand.
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
// The hand-maintained brand list. These are exactly the eleven names that were
// `MLB_STAR_BRANDED_PLAYER_KEYS` — kept, because they are genuinely famous beyond their production,
// but demoted from "flat 1.45x draw boost, forever, unreviewed" to "at most +0.10 on a score the
// live feed otherwise decides", with a review date and a size assertion in
// tests/lib.sportsBingo.mlb-star-index.test.ts. If this list is doing the work, the signal is
// broken — fix the signal instead of growing this table.
// ---------------------------------------------------------------------------------------------
export const MLB_BRAND_NAME_BONUS: ReadonlyMap<string, { bonus: number; reviewBy: string }> = new Map([
  ["shohei ohtani", { bonus: 0.1, reviewBy: "2027-04-01" }],
  ["aaron judge", { bonus: 0.1, reviewBy: "2027-04-01" }],
  ["juan soto", { bonus: 0.08, reviewBy: "2027-04-01" }],
  ["mookie betts", { bonus: 0.08, reviewBy: "2027-04-01" }],
  ["bryce harper", { bonus: 0.08, reviewBy: "2027-04-01" }],
  ["yordan alvarez", { bonus: 0.06, reviewBy: "2027-04-01" }],
  ["pete alonso", { bonus: 0.06, reviewBy: "2027-04-01" }],
  // NB: keys are post-`normalizeNameKey`, which **strips** generational suffixes — so these two are
  // "fernando tatis" and "vladimir guerrero", not "… jr". The list this replaces stored them with
  // the suffix, which meant `MLB_STAR_BRANDED_PLAYER_KEYS.has(normalizeNameKey(name))` could never
  // match either of them and both were silently inert. A test below pins this.
  ["fernando tatis", { bonus: 0.06, reviewBy: "2027-04-01" }],
  ["kyle schwarber", { bonus: 0.06, reviewBy: "2027-04-01" }],
  ["manny machado", { bonus: 0.06, reviewBy: "2027-04-01" }],
  ["vladimir guerrero", { bonus: 0.06, reviewBy: "2027-04-01" }],
]);

/**
 * The name keys in {@link MLB_BRAND_NAME_BONUS}, as the set the `mlb_star_hr:` branded-square
 * feature in lib/sportsBingo.ts reads. That feature (a "Aaron Judge HR" square with its own label
 * and its own late-scratch handling) is a product decision about *labeling* and is unchanged by
 * this phase — but it now reads the same reviewed, dated list as the star score does, so the two
 * cannot drift apart the way a second hardcoded copy would.
 */
export const MLB_BRAND_NAME_KEYS: ReadonlySet<string> = new Set(MLB_BRAND_NAME_BONUS.keys());

/** `starScore` bump for a hand-maintained brand name, clamped to `MLB_STAR_BRAND_BONUS_MAX`. */
export function mlbBrandBonus(playerName: string): number {
  const entry = MLB_BRAND_NAME_BONUS.get(normalizeNameKey(playerName));
  return entry ? clamp(entry.bonus, 0, MLB_STAR_BRAND_BONUS_MAX) : 0;
}

// ---------------------------------------------------------------------------------------------
// 1. Market attention — reads the player-prop markets `fetchMLBPlayerPropMarkets` already fetched
// for this game. Zero new requests, and it is what makes the signal self-update: the week a rookie
// becomes famous is the week the books post five markets on him.
// ---------------------------------------------------------------------------------------------

/** The pitching half of `MLB_PROP_TYPE_TO_MARKET_KEY`'s values — used to infer a player's group. */
const MLB_PITCHER_MARKET_KEYS = new Set([
  "player_strikeouts_pitcher",
  "player_earned_runs",
  "player_pitcher_outs",
]);

export type MLBStarMarketSignal = {
  /** Distinct gradeable prop types this player has a posted market for, in this game. */
  breadth: number;
  /**
   * Which group's markets these are, inferred from the market keys themselves rather than from the
   * season index — a rookie call-up the stats feed has never seen still needs the right breadth
   * norm, and the books posting `pitcher_outs` on someone is proof enough that he is pitching.
   */
  group: MLBStarGroup;
  /** De-vigged P(hits a home run), or null when no book posted one. */
  homeRunProbability: number | null;
};

/**
 * Reduce a player's raw prop markets for one game into the numbers the market score needs.
 *
 * The home-run price is MLB's anytime-TD: the one market whose *price* (rather than its existence)
 * says "this is a guy the room is watching". It is read at the modal line the consensus settled on,
 * which for home runs is essentially always 0.5.
 */
export function summarizeMLBStarMarketSignal(markets: MLBPlayerPropMarket[]): MLBStarMarketSignal {
  const marketKeys = new Set(markets.map((market) => market.marketKey));
  const homeRun = markets.find((market) => market.marketKey === "player_home_runs");
  const isPitcher = [...marketKeys].some((key) => MLB_PITCHER_MARKET_KEYS.has(key));
  return {
    breadth: marketKeys.size,
    group: isPitcher ? "pitcher" : "batter",
    homeRunProbability: homeRun ? homeRun.probability : null,
  };
}

/**
 * Market attention component of `starScore`, 0-1.
 *
 * **Batters** blend breadth with the home-run price, weighted 0.6/0.4 — breadth carries more for
 * the same reason it does in NFL (a contact-hitting leadoff man can be the market's focal point
 * with no realistic home-run price at all), and the home-run term is scaled against a 0.25
 * reference because even an elite power hitter prices around 20-25% to go deep on a given night;
 * using the raw probability would make the term nearly inert.
 *
 * **Pitchers** score on breadth alone. They have no home-run market to read, and folding in a
 * missing term as a zero would hand every pitcher a flat 0.4 penalty rather than measuring
 * anything about him.
 */
export function mlbMarketAttentionScore(signal: MLBStarMarketSignal): number {
  const norm =
    signal.group === "pitcher" ? MLB_STAR_MARKET_BREADTH_NORM_PITCHER : MLB_STAR_MARKET_BREADTH_NORM_BATTER;
  const breadthScore = clamp(signal.breadth / Math.max(1, norm), 0, 1);
  if (signal.group === "pitcher") {
    return breadthScore;
  }
  const homeRunScore = signal.homeRunProbability === null ? 0 : clamp(signal.homeRunProbability / 0.25, 0, 1);
  return clamp(0.6 * breadthScore + 0.4 * homeRunScore, 0, 1);
}

// ---------------------------------------------------------------------------------------------
// 2 & 3. Season usage and production — `/mlb/v1/season_stats`, one league-wide paginated pull per
// season. Both scored as a percentile within the player's own group, never pooled across batters
// and pitchers (innings pitched and plate appearances are not the same unit).
// ---------------------------------------------------------------------------------------------

export type BallDontLieMLBSeasonStatsRow = {
  player?: {
    id?: number | string | null;
    position?: string | null;
  } | null;
  season?: number | null;
  postseason?: boolean | null;
  batting_gp?: number | null;
  batting_ab?: number | null;
  batting_bb?: number | null;
  batting_r?: number | null;
  batting_hr?: number | null;
  batting_rbi?: number | null;
  batting_tb?: number | null;
  batting_sb?: number | null;
  pitching_gp?: number | null;
  pitching_ip?: number | null;
  pitching_k?: number | null;
  pitching_k_per_9?: number | null;
};

type MLBSeasonUsageRow = {
  playerId: number;
  group: MLBStarGroup;
  gamesPlayed: number;
  usageVolume: number;
  productionPerGame: number;
  productionRate: number;
};

const num = (value: number | null | undefined): number => (Number.isFinite(value as number) ? (value as number) : 0);

/**
 * Group-normalised volume and production.
 *
 * **Batters** — usage is `at-bats + walks`, a plate-appearance proxy, which is the cleanest measure
 * of "how much of this lineup runs through him" that the feed exposes directly. Production is
 * total bases per game (the slugging half) and home runs + RBIs + runs per game (the counting half
 * the props themselves are written on), averaged as two separate percentiles so a high-average
 * doubles hitter and a three-true-outcomes slugger both register.
 *
 * **Pitchers** — usage is innings pitched, the direct analogue of a batter's plate appearances.
 * Production is strikeouts per game and K/9: the first is what `pitcher_strikeouts` props are
 * written on, the second normalises a reliever's short outings against a starter's long ones so a
 * dominant closer is not buried by a back-end starter's bulk.
 *
 * A row with no games played in either discipline is dropped — an injured-list season carries no
 * signal and would otherwise sit at the bottom of every percentile and compress the live scale.
 */
function buildMLBSeasonUsageRows(rows: BallDontLieMLBSeasonStatsRow[]): MLBSeasonUsageRow[] {
  const out: MLBSeasonUsageRow[] = [];
  for (const row of rows) {
    const playerId = Number.parseInt(String(row.player?.id ?? ""), 10);
    if (!Number.isFinite(playerId) || playerId <= 0) {
      continue;
    }
    const group = resolveMLBStarGroup(String(row.player?.position ?? ""));
    const gamesPlayed = Math.max(0, num(group === "pitcher" ? row.pitching_gp : row.batting_gp));
    if (gamesPlayed <= 0) {
      continue;
    }
    const usageVolume =
      group === "pitcher" ? num(row.pitching_ip) : num(row.batting_ab) + num(row.batting_bb);
    const productionPerGame =
      group === "pitcher"
        ? num(row.pitching_k) / gamesPlayed
        : (num(row.batting_hr) + num(row.batting_rbi) + num(row.batting_r)) / gamesPlayed;
    const productionRate =
      group === "pitcher" ? num(row.pitching_k_per_9) : num(row.batting_tb) / gamesPlayed;
    out.push({ playerId, group, gamesPlayed, usageVolume, productionPerGame, productionRate });
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

export type MLBSeasonStarIndexEntry = {
  playerId: number;
  group: MLBStarGroup;
  gamesPlayed: number;
  /** Percentile (0-1) within this player's own group. */
  usagePercentile: number;
  /** Mean of the two production percentiles within group. */
  productionPercentile: number;
};

/**
 * Rank every player in a `/mlb/v1/season_stats` pull against their group peers. Pure function —
 * the network fetch is `fetchMLBSeasonStats` below, kept separate so this half is trivially
 * unit-testable against a hand-built fixture.
 */
export function computeMLBSeasonStarIndex(
  rows: BallDontLieMLBSeasonStatsRow[]
): Map<number, MLBSeasonStarIndexEntry> {
  const usageRows = buildMLBSeasonUsageRows(rows);
  const byGroup = new Map<MLBStarGroup, MLBSeasonUsageRow[]>();
  for (const row of usageRows) {
    const bucket = byGroup.get(row.group);
    if (bucket) {
      bucket.push(row);
    } else {
      byGroup.set(row.group, [row]);
    }
  }

  const index = new Map<number, MLBSeasonStarIndexEntry>();
  for (const [group, entries] of byGroup) {
    const usageSorted = entries.map((row) => row.usageVolume).sort((a, b) => a - b);
    const perGameSorted = entries.map((row) => row.productionPerGame).sort((a, b) => a - b);
    const rateSorted = entries.map((row) => row.productionRate).sort((a, b) => a - b);
    for (const row of entries) {
      index.set(row.playerId, {
        playerId: row.playerId,
        group,
        gamesPlayed: row.gamesPlayed,
        usagePercentile: percentileRank(usageSorted, row.usageVolume),
        productionPercentile:
          (percentileRank(perGameSorted, row.productionPerGame) + percentileRank(rateSorted, row.productionRate)) / 2,
      });
    }
  }
  return index;
}

/**
 * One league-wide paginated `/mlb/v1/season_stats` pull for a season. Never throws: a provider
 * outage returns an empty array, which degrades the star tilt to "no signal" rather than breaking
 * board generation.
 */
export async function fetchMLBSeasonStats(
  season: number,
  options: { postseason?: boolean; failure?: BallDontLieFailureBox } = {}
): Promise<BallDontLieMLBSeasonStatsRow[]> {
  const query = new URLSearchParams({ season: String(season), per_page: "100" });
  if (options.postseason) {
    query.set("postseason", "true");
  }
  try {
    // A full MLB season pull is ~1,800 rows across every 40-man roster spot; at per_page 100 that
    // is ~18 pages, so 40 leaves headroom without risking an unbounded walk. Measured live on
    // 2026-08-17: 1,792 rows for season 2025.
    return await fetchBallDontLieList<BallDontLieMLBSeasonStatsRow>("/mlb/v1/season_stats", query, {
      maxPages: 40,
      failure: options.failure,
    });
  } catch (error) {
    console.error("[sportsBingoMlbStars] Failed to fetch MLB season stats:", error);
    if (options.failure) {
      options.failure.failed = true;
    }
    return [];
  }
}

/**
 * MLB seasons are named for the calendar year they are played in and finish in early November, so
 * — unlike NFL, whose 2025 season runs into February 2026 — the season year is simply the current
 * year for all but the dead months. January and February are attributed to the season that just
 * ended, so an off-season board (or an off-season snapshot refresh) reads the last real season
 * rather than an empty one.
 */
export function resolveCurrentMLBSeasonYear(now: Date = new Date()): number {
  const month = now.getUTCMonth() + 1; // 1-12
  const year = now.getUTCFullYear();
  return month <= 2 ? year - 1 : year;
}

export function resolvePriorMLBSeasonYear(now: Date = new Date()): number {
  return resolveCurrentMLBSeasonYear(now) - 1;
}

// ---------------------------------------------------------------------------------------------
// The blend, including early-season shrinkage toward the prior season's index.
// ---------------------------------------------------------------------------------------------

export type MLBStarScoreInputs = {
  playerName: string;
  market: MLBStarMarketSignal;
  /** This player's row in the current season's index, or null (no stats yet, or a true rookie). */
  current: MLBSeasonStarIndexEntry | null;
  /** This player's row in the prior season's index, or null (rookie / no BDL history). */
  prior: MLBSeasonStarIndexEntry | null;
};

export type MLBStarScoreResult = {
  starScore: number;
  marketScore: number;
  usagePercentile: number;
  productionPercentile: number;
  brandBonus: number;
};

/**
 * `w = gamesPlayed / (gamesPlayed + K)`: as the current season accumulates games, its own index
 * value is trusted more and the prior season's fades out. With no prior season at all, the current
 * value is used outright rather than shrunk toward nothing — a rookie's April usage is real signal,
 * it just has no season to blend against.
 */
function blendSeasonComponent(
  currentPercentile: number | null,
  priorPercentile: number | null,
  gamesPlayed: number
): number {
  if (currentPercentile === null && priorPercentile === null) return 0;
  if (priorPercentile === null) return currentPercentile ?? 0;
  if (currentPercentile === null) return priorPercentile;
  const weight = gamesPlayed / (gamesPlayed + MLB_STAR_PRIOR_SHRINKAGE_K);
  return clamp(weight * currentPercentile + (1 - weight) * priorPercentile, 0, 1);
}

/**
 * `starScore = 0.45*market + 0.35*usage + 0.20*production + brandBonus`.
 *
 * **Selection only.** Nothing here touches a square's priced probability — a star square is not
 * made easier or harder, only likelier to be chosen. That is the same line Phase 5 drew for
 * `orderByDifficulty` and Phase 9b held for NFL, and it is what keeps the win-rate calibration
 * work valid across this change.
 *
 * A feed failure (both `current` and `prior` null) degrades to market-plus-brand, which is also the
 * correct answer for a genuine rookie the season-stats feed has nothing on yet.
 */
export function computeMLBStarScore(inputs: MLBStarScoreInputs): MLBStarScoreResult {
  const marketScore = mlbMarketAttentionScore(inputs.market);
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
  const brandBonus = mlbBrandBonus(inputs.playerName);
  const starScore = clamp(
    MLB_STAR_WEIGHT_MARKET * marketScore +
      MLB_STAR_WEIGHT_USAGE * usagePercentile +
      MLB_STAR_WEIGHT_PRODUCTION * productionPercentile +
      brandBonus,
    0,
    1 + MLB_STAR_BRAND_BONUS_MAX
  );
  return { starScore, marketScore, usagePercentile, productionPercentile, brandBonus };
}

// ---------------------------------------------------------------------------------------------
// Tiering and the draw tunables. The selection rule itself (the weighted draw, the slot
// reservation, the diversity caps it pushes against) lives in `pickCandidateSet` in
// lib/sportsBingo.ts, because that is the function that decides what a board is.
// ---------------------------------------------------------------------------------------------

export type MLBStarTier = "star" | "known" | "deep";

/** A player at or above this percentile of the game's own prop pool reads as its `star` tier. */
export const MLB_STAR_TIER_STAR_PERCENTILE = clamp(
  numberFromEnv(process.env.BINGO_MLB_STAR_TIER_STAR_PERCENTILE, 0.75),
  0.5,
  0.95
);
/** …and at or above this one as `known`. Below it is `deep`. */
export const MLB_STAR_TIER_KNOWN_PERCENTILE = clamp(
  numberFromEnv(process.env.BINGO_MLB_STAR_TIER_KNOWN_PERCENTILE, 0.4),
  0.05,
  MLB_STAR_TIER_STAR_PERCENTILE - 0.05
);

/**
 * Draw-weight multiplier per tier, replacing the flat 1.45x that
 * `MLB_STAR_BRANDED_PLAYER_KEYS` used to apply to eleven hardcoded names.
 *
 * `deep` sits at 1.0 on purpose: a lesser-known player is weighted **down relative to a star**,
 * never removed from the pool. Zero unknowns and zero stars are both failure states, and drawing
 * rather than filtering is what rules the second one out.
 */
export const MLB_STAR_TIER_BOOST: Readonly<Record<MLBStarTier, number>> = {
  star: Math.max(1, numberFromEnv(process.env.BINGO_MLB_STAR_TIER_BOOST_STAR, 2.6)),
  known: Math.max(1, numberFromEnv(process.env.BINGO_MLB_STAR_TIER_BOOST_KNOWN, 1.4)),
  deep: 1,
};

/** Of MLB's player-prop slots, at most this many may go to `star`-tier players. */
export const MLB_STAR_MAX_STAR_SLOTS = Math.max(
  1,
  Math.round(numberFromEnv(process.env.BINGO_MLB_STAR_MAX_STAR_SLOTS, 5))
);
/**
 * …and at least this many are reserved for `known`/`deep`. A hard reservation on what is *offered*
 * to the draw, not a soft weight: soft weights drift under Phase 5's escalating `difficultyBias`,
 * a reservation does not.
 */
export const MLB_STAR_MIN_NON_STAR_SLOTS = Math.max(
  0,
  Math.round(numberFromEnv(process.env.BINGO_MLB_MIN_NON_STAR_SLOTS, 2))
);

// ---------------------------------------------------------------------------------------------
// The check-in mechanism, all four layers, exactly as Phase 9c built them for NFL.
// ---------------------------------------------------------------------------------------------

/** The two season indexes `computeMLBStarScore` blends against, threaded as one value. */
export type MLBSeasonStarIndexPair = {
  current: ReadonlyMap<number, MLBSeasonStarIndexEntry>;
  prior: ReadonlyMap<number, MLBSeasonStarIndexEntry>;
};

const cacheMsInWindow = (raw: string | undefined, fallback: number, min: number, max: number): number => {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
};

const MLB_STAR_INDEX_CACHE_MS = cacheMsInWindow(
  process.env.BINGO_MLB_STAR_INDEX_CACHE_MS,
  24 * 60 * 60_000,
  60 * 60_000,
  48 * 60 * 60_000
);

// Its own module-level cache rather than one shared with NFL: different season-year math, different
// pull sizes, and a shared entry would be invalidated by whichever sport asked last.
let mlbStarIndexCache: { expiresAt: number; season: number; pair: MLBSeasonStarIndexPair } | null = null;

/**
 * The negative TTL for an index built out of a *failed* `/mlb/v1/season_stats` pull. Distinguishing
 * "the feed answered with no rows" from "the feed was down" is the point: the first is a real
 * answer and earns the full 24-hour TTL, the second used to pin every board in the next 24 hours to
 * market-attention-only tilt on the strength of one bad provider minute.
 */
const MLB_STAR_INDEX_FAILURE_CACHE_MS = 5 * 60_000;

/**
 * The live, automatic check-in layer: a player who breaks out this week is in the star tier within
 * a day, with no deploy and no human, because this re-pulls `/mlb/v1/season_stats` once the 24h
 * cache expires. Cached by `season` (not by `now`) so a 15-game slate shares one league-wide pull
 * instead of issuing 15.
 *
 * `fetchSeasonStats` is injectable purely for tests; it defaults to the real `fetchMLBSeasonStats`,
 * which already degrades a feed failure to `[]` rather than throwing. **A feed failure therefore
 * yields empty maps and no tilt — it does not fall back to the committed snapshot.** That was
 * decided once, for both sports, when Phase 9c surfaced the question: the plan's "what must not
 * break" list says "no index -> no tilt -> `orderByDifficulty` as it works now", and serving a
 * possibly-weeks-old star list during an outage is a richer behavior than that contract describes.
 * The snapshot below is a human-readable diff artifact, not a runtime input.
 */
export async function resolveMLBStarIndex(
  now: Date = new Date(),
  fetchSeasonStats: (
    season: number,
    options?: { failure?: BallDontLieFailureBox }
  ) => Promise<BallDontLieMLBSeasonStatsRow[]> = fetchMLBSeasonStats
): Promise<MLBSeasonStarIndexPair> {
  const season = resolveCurrentMLBSeasonYear(now);
  const nowMs = now.getTime();
  if (mlbStarIndexCache && mlbStarIndexCache.season === season && mlbStarIndexCache.expiresAt > nowMs) {
    return mlbStarIndexCache.pair;
  }

  const priorSeason = resolvePriorMLBSeasonYear(now);
  // Phase 5 of docs/prop-bingo-code-review-fix-plan.md — a provider outage resolves to `[]` here,
  // same as it always has, but it must not be *cached* as though the feed had answered "no players"
  // for the next 24 hours. A failed pull gets a short negative TTL so the next board re-asks.
  const failure: BallDontLieFailureBox = { failed: false };
  const [currentRows, priorRows] = await Promise.all([
    fetchSeasonStats(season, { failure }),
    fetchSeasonStats(priorSeason, { failure }),
  ]);
  const pair: MLBSeasonStarIndexPair = {
    current: computeMLBSeasonStarIndex(currentRows),
    prior: computeMLBSeasonStarIndex(priorRows),
  };
  mlbStarIndexCache = {
    expiresAt: nowMs + (failure.failed ? MLB_STAR_INDEX_FAILURE_CACHE_MS : MLB_STAR_INDEX_CACHE_MS),
    season,
    pair,
  };
  return pair;
}

export const MLB_STAR_INDEX_SNAPSHOT_MAX_AGE_DAYS = 14;

export type MLBStarIndexSnapshotPlayer = {
  playerId: number;
  name: string | null;
  group: MLBStarGroup;
  gamesPlayed: number;
  usagePercentile: number;
  productionPercentile: number;
};

export type MLBStarIndexSnapshot = {
  generatedAt: string;
  season: number;
  priorSeason: number;
  current: { players: MLBStarIndexSnapshotPlayer[] };
  prior: { players: MLBStarIndexSnapshotPlayer[] };
};

/** True when `generatedAt` is unparsable or older than `MLB_STAR_INDEX_SNAPSHOT_MAX_AGE_DAYS`. */
export function isMLBStarIndexSnapshotStale(generatedAt: string, now: Date = new Date()): boolean {
  const generatedMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedMs)) {
    return true;
  }
  const ageDays = (now.getTime() - generatedMs) / (24 * 60 * 60 * 1000);
  return ageDays > MLB_STAR_INDEX_SNAPSHOT_MAX_AGE_DAYS;
}

/**
 * Tier a set of per-player star scores by percentile **within that set** — this game's own prop
 * pool, never a league-wide distribution, so on a thin slate the best available player still reads
 * as the star of that board.
 *
 * Keyed by player rather than by square: a starting pitcher with three posted markets would
 * otherwise drag the percentile scale around by himself, and the question is about people.
 *
 * Returns `null` when nothing in the pool carries a finite score — a provider outage, a game with
 * no props, or any pool built before this phase existed. That null is the fallback the plan
 * requires: no index, no tilt, selection exactly as it worked before.
 */
export function assignMLBStarTiers(entries: ReadonlyMap<string, number>): Map<string, MLBStarTier> | null {
  const scored = [...entries.entries()].filter(([, score]) => Number.isFinite(score));
  if (scored.length === 0) {
    return null;
  }
  const sortedAsc = scored.map(([, score]) => score).sort((a, b) => a - b);
  const tiers = new Map<string, MLBStarTier>();
  for (const [playerKey, score] of scored) {
    let below = 0;
    for (const entry of sortedAsc) {
      if (entry < score) below += 1;
    }
    const percentile = below / sortedAsc.length;
    tiers.set(
      playerKey,
      percentile >= MLB_STAR_TIER_STAR_PERCENTILE
        ? "star"
        : percentile >= MLB_STAR_TIER_KNOWN_PERCENTILE
          ? "known"
          : "deep"
    );
  }
  return tiers;
}
