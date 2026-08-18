import "server-only";

import { fetchBallDontLieList } from "@/lib/ballDontLieClient";

// Phase 2 of docs/prop-bingo-nfl-plan.md — NFL core squares off real market numbers.
// Phase 3 extends it with the player-prop consensus feed and the team/game/quarter probability
// model that the NFL "special" squares are priced from.
//
// Before this module, every Prop Bingo core probability was invented: NFL boards were built from a
// hardcoded `homeWinProb = 0.55`, `averageHomeSpread = -3.5` and `averageTotal = 45`, so a 45-point
// blowout and a coin-flip divisional game produced literally the same board. This module replaces
// that with a vendor consensus off balldontlie's `/nfl/v1/odds` feed (GOAT tier, confirmed live in
// docs/prop-bingo-nfl-phase0-findings.md §2, and already proven in production by NFL Pick 'Em),
// plus a normal-approximation scoring model that turns the consensus spread/total into a
// probability for every core resolver.
//
// Everything here is NFL-specific on purpose. NBA/WNBA/MLB keep their existing league-average
// paths untouched — see the `marketModel` parameter in lib/sportsBingo.ts's
// `buildGameAndCandidatesFromBallDontLie`, which is only ever non-null for NFL.

type MarketTeamSide = "home" | "away";

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const numberFromEnv = (raw: string | undefined, fallback: number): number => {
  const parsed = Number.parseFloat(raw ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Standard deviation of the home margin, in points. ~13.5 is the long-run NFL figure and matches
 * the value the plan specifies. Env-tunable so Phase 5's calibration work can move it without a
 * deploy-shaped code change.
 */
export const NFL_MARGIN_SIGMA = numberFromEnv(process.env.BINGO_NFL_MARGIN_SIGMA, 13.5);

/** Standard deviation of a single team's score, in points (plan: ~10). */
export const NFL_TEAM_TOTAL_SIGMA = numberFromEnv(process.env.BINGO_NFL_TEAM_TOTAL_SIGMA, 10);

/**
 * Game-total sigma is *derived*, not a third free parameter, so the three distributions stay
 * mutually consistent: for team scores A and B,
 *   Var(A+B) + Var(A-B) = 2(Var(A) + Var(B)) = 4 * teamSigma^2,
 * regardless of how correlated A and B are. So totalSigma = sqrt(4*teamSigma^2 - marginSigma^2).
 * With the defaults above that lands at ~14.8, implying a mild positive correlation between the
 * two teams' scores — which is exactly what shootouts and slogs look like in real games.
 *
 * Guarded with a floor in case the two env knobs are set to an impossible pair (marginSigma >
 * 2*teamSigma would make the variance negative).
 */
export const NFL_GAME_TOTAL_SIGMA = Math.sqrt(
  Math.max(1, 4 * NFL_TEAM_TOTAL_SIGMA * NFL_TEAM_TOTAL_SIGMA - NFL_MARGIN_SIGMA * NFL_MARGIN_SIGMA)
);

// League-average fallbacks, used only to sanity-bound a consensus that comes back absurd.
const NFL_MIN_TOTAL = 24;
const NFL_MAX_TOTAL = 80;
const NFL_MAX_ABS_SPREAD = 30;

// Real sportsbooks, best-first. Lifted from NFL_SPREAD_VENDOR_PRIORITY in lib/nflPickEm.ts so the
// two NFL surfaces agree on which books count. Used here as an *allowlist* rather than a
// priority pick: we take a median across every ranked vendor that quoted a market, and only fall
// back to unranked vendors if no ranked one did.
//
// The exclusion matters: Phase 0 observed `kalshi` and `polymarket` in every NFL odds response.
// Those are prediction markets, not sportsbooks — their moneylines come back symmetric
// (e.g. -182/+182), i.e. synthesized from a probability with no two-sided vig, so de-vigging them
// is a no-op and blending them into a book consensus quietly drags it toward an un-juiced price.
const NFL_ODDS_VENDOR_ALLOWLIST = new Set([
  "fanduel",
  "draftkings",
  "betmgm",
  "caesars",
  "bet365",
  "fanatics",
  "betrivers",
  "betparx",
  "ballybet",
  "betway",
]);

// The odds feed returns one row per game per sportsbook. A full NFL slate is ~16 games and BDL
// fans out to 20+ books, so a slate can run well past 320 rows; at per_page 100 this covers ~800
// rows with headroom while still capping the walk. Same arithmetic as
// NFL_SPREAD_LINES_MAX_PAGES in lib/nflPickEm.ts.
const NFL_ODDS_MAX_PAGES = 8;

export type SportsBingoMarketConsensus = {
  /** Consensus home spread. Negative = home favored (matches balldontlie's convention). */
  homeSpread: number;
  /** Consensus game total. */
  total: number;
  /** De-vigged consensus home win probability, or null when no vendor quoted a two-way moneyline. */
  homeWinProb: number | null;
  /** How many distinct vendors contributed at least one market to this consensus. */
  vendorCount: number;
};

export type BallDontLieNFLOddsRow = {
  game_id?: number | string | null;
  vendor?: string | null;
  spread_home_value?: number | string | null;
  spread_away_value?: number | string | null;
  moneyline_home_odds?: number | string | null;
  moneyline_away_odds?: number | string | null;
  total_value?: number | string | null;
};

export function impliedProbabilityFromAmericanOdds(odds: unknown): number | null {
  const value = Number.parseFloat(String(odds ?? ""));
  if (!Number.isFinite(value) || value === 0) {
    return null;
  }
  if (value > 0) {
    return clamp(100 / (value + 100), 0.02, 0.98);
  }
  return clamp(-value / (-value + 100), 0.02, 0.98);
}

/**
 * Remove the bookmaker's hold from a two-way market by normalizing the two implied probabilities
 * to sum to 1. Returns null unless BOTH sides are quoted — a one-sided price still carries the
 * full vig and would systematically overstate that side.
 */
export function deVigTwoWay(homeOdds: unknown, awayOdds: unknown): number | null {
  const rawHome = impliedProbabilityFromAmericanOdds(homeOdds);
  const rawAway = impliedProbabilityFromAmericanOdds(awayOdds);
  if (rawHome === null || rawAway === null) {
    return null;
  }
  const overround = rawHome + rawAway;
  if (!Number.isFinite(overround) || overround <= 0) {
    return null;
  }
  return clamp(rawHome / overround, 0.02, 0.98);
}

export function median(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return null;
  }
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const parseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

type VendorQuote = {
  vendor: string;
  ranked: boolean;
  homeSpread: number | null;
  total: number | null;
  homeWinProb: number | null;
};

function normalizeOddsRow(row: BallDontLieNFLOddsRow): { gameId: string; quote: VendorQuote } | null {
  const gameId = String(row.game_id ?? "").trim();
  if (!gameId) {
    return null;
  }

  const vendor = (String(row.vendor ?? "").trim() || "unknown").toLowerCase();

  // balldontlie sometimes quotes only one side of the spread; the other is its negation.
  const rawHomeSpread = parseNumber(row.spread_home_value);
  const rawAwaySpread = parseNumber(row.spread_away_value);
  let homeSpread = rawHomeSpread ?? (rawAwaySpread === null ? null : -rawAwaySpread);
  if (homeSpread !== null && Math.abs(homeSpread) > NFL_MAX_ABS_SPREAD) {
    homeSpread = null;
  }

  let total = parseNumber(row.total_value);
  if (total !== null && (total < NFL_MIN_TOTAL || total > NFL_MAX_TOTAL)) {
    total = null;
  }

  return {
    gameId,
    quote: {
      vendor,
      ranked: NFL_ODDS_VENDOR_ALLOWLIST.has(vendor),
      homeSpread,
      total,
      homeWinProb: deVigTwoWay(row.moneyline_home_odds, row.moneyline_away_odds),
    },
  };
}

/**
 * Median across ranked (real sportsbook) vendors, falling back to unranked ones only when no
 * ranked vendor quoted this market at all. Median rather than mean so a single stale or fat-
 * fingered book can't drag the consensus.
 */
function consensusOf(quotes: VendorQuote[], pick: (quote: VendorQuote) => number | null): number | null {
  const ranked = quotes.filter((quote) => quote.ranked).map(pick).filter((v): v is number => v !== null);
  if (ranked.length > 0) {
    return median(ranked);
  }
  const unranked = quotes.filter((quote) => !quote.ranked).map(pick).filter((v): v is number => v !== null);
  return unranked.length > 0 ? median(unranked) : null;
}

/**
 * Pure consensus math over raw `/nfl/v1/odds` rows. A game only makes it into the result if the
 * books gave us BOTH a spread and a total — those two are what the scoring model in
 * `buildNFLMarketModel` is anchored on, and half a market is worse than none (it would silently
 * mix a real spread with the fictional 45-point league-average total this phase exists to delete).
 * The moneyline is optional: it refines the moneyline square only.
 */
export function computeNFLOddsConsensus(rows: BallDontLieNFLOddsRow[]): Map<string, SportsBingoMarketConsensus> {
  const quotesByGame = new Map<string, VendorQuote[]>();
  for (const row of rows) {
    const normalized = normalizeOddsRow(row);
    if (!normalized) continue;
    const existing = quotesByGame.get(normalized.gameId);
    if (existing) {
      existing.push(normalized.quote);
    } else {
      quotesByGame.set(normalized.gameId, [normalized.quote]);
    }
  }

  const consensusByGame = new Map<string, SportsBingoMarketConsensus>();
  for (const [gameId, quotes] of quotesByGame) {
    const homeSpread = consensusOf(quotes, (quote) => quote.homeSpread);
    const total = consensusOf(quotes, (quote) => quote.total);
    if (homeSpread === null || total === null) {
      continue;
    }
    const contributing = quotes.filter(
      (quote) => quote.homeSpread !== null || quote.total !== null || quote.homeWinProb !== null
    );
    consensusByGame.set(gameId, {
      homeSpread,
      total,
      homeWinProb: consensusOf(quotes, (quote) => quote.homeWinProb),
      vendorCount: new Set(contributing.map((quote) => quote.vendor)).size,
    });
  }

  return consensusByGame;
}

/**
 * One odds call for the whole slate (not one per game), joined back onto games by id.
 *
 * Never throws and never rejects: a provider outage returns an empty map, which drops NFL boards
 * back to the league-average fallback path rather than blanking the game list.
 */
export async function fetchNFLOddsConsensus(gameIds: string[]): Promise<Map<string, SportsBingoMarketConsensus>> {
  const requested = [...new Set(gameIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (requested.length === 0) {
    return new Map();
  }
  // Whether the provider is usable at all is fetchBallDontLieJson's call, not ours — it throws
  // when the key is missing outside tests, and the catch below turns that into an empty map (no
  // odds -> league-average fallback), which is the same outcome a short-circuit here would give
  // without introducing a second, subtly different configured-ness rule.

  const query = new URLSearchParams({ per_page: "100" });
  for (const gameId of requested) {
    query.append("game_ids[]", gameId);
  }

  const truncation = { truncated: false };
  let rows: BallDontLieNFLOddsRow[] = [];
  try {
    rows = await fetchBallDontLieList<BallDontLieNFLOddsRow>("/nfl/v1/odds", query, {
      maxPages: NFL_ODDS_MAX_PAGES,
      truncation,
    });
  } catch (error) {
    console.error("[sportsBingoOdds] Failed to fetch NFL odds consensus:", error);
    return new Map();
  }

  if (truncation.truncated) {
    console.warn(
      `[sportsBingoOdds] NFL odds fetch hit the ${NFL_ODDS_MAX_PAGES}-page cap for ` +
        `${requested.length} game id(s) — some games may fall back to league averages.`
    );
  }

  const requestedIds = new Set(requested);
  const consensus = computeNFLOddsConsensus(rows.filter((row) => requestedIds.has(String(row.game_id ?? "").trim())));
  return consensus;
}

/** Abramowitz & Stegun 7.1.26 — max absolute error ~1.5e-7, far tighter than the model itself. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * absX);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-absX * absX);
  return sign * y;
}

export function normalCdf(value: number, mean: number, sigma: number): number {
  const safeSigma = Math.max(1e-6, sigma);
  return 0.5 * (1 + erf((value - mean) / (safeSigma * Math.SQRT2)));
}

export type NFLMarketModel = {
  homeSpread: number;
  total: number;
  /** Expected home margin, i.e. `-homeSpread`. */
  expectedHomeMargin: number;
  impliedHomeTotal: number;
  impliedAwayTotal: number;
  /** The team the market makes the favorite (home on a pick'em). */
  favorite: MarketTeamSide;
  /** P(`team` wins outright). Uses the de-vigged moneyline when the books quoted one. */
  winProbability: (team: MarketTeamSide) => number;
  /** P(`team` wins by more than `line`). `line` is always a half-point (see `roundLine`). */
  marginMoreThan: (team: MarketTeamSide, line: number) => number;
  /** P(combined score > `line`). */
  gameTotalOver: (line: number) => number;
  /** P(`team`'s score > `line`). */
  teamTotalOver: (team: MarketTeamSide, line: number) => number;

  // --- Phase 3: team / game / quarter squares -------------------------------------------------
  // Everything below prices a square that grades purely off `/nfl/v1/games` (final score plus the
  // per-quarter `home_team_q1..q4` / `visitor_team_q1..q4` / `_ot` fields), so these squares exist
  // for every priced game regardless of what the books posted for individual players.

  /** P(final winning margin, either direction, is at most `line` points). */
  marginAbsAtMost: (line: number) => number;
  /** P(final winning margin, either direction, is at least `line` points). */
  marginAbsAtLeast: (line: number) => number;
  /** P(`team` leads at halftime — not tied, not trailing). */
  leadsAtHalftime: (team: MarketTeamSide) => number;
  /** P(the game goes to overtime). */
  overtime: () => number;
  /** P(both teams score at least `line` points). */
  bothTeamsScoreAtLeast: (line: number) => number;
  /** P(`team` puts points on the board in all four quarters). */
  scoresEveryQuarter: (team: MarketTeamSide) => number;
  /** P(`team` scores at least `threshold` points in at least one quarter). */
  quarterPointsAtLeast: (team: MarketTeamSide, threshold: number) => number;
  /** P(at least one quarter ends with neither team scoring). */
  anyQuarterScoreless: () => number;
};

// ---------------------------------------------------------------------------------------------
// Phase 3 calibration constants.
//
// These are hand-set league approximations, NOT market-derived like the spread/total above. Each
// one is documented with the base rate it targets so Phase 5b's backtest can check it against
// realized outcomes rather than re-deriving it from scratch. **Every constant in this block is a
// Phase 5 recalibration candidate** — that is the phase that grades generated boards against real
// settled games and can therefore falsify any of them.
// ---------------------------------------------------------------------------------------------

/**
 * Halftime is decided by a margin drawn over half the game, so its spread is `marginSigma / sqrt(2)`
 * (variance scales with elapsed game, standard deviation with its square root).
 */
const NFL_HALFTIME_MARGIN_SIGMA_SCALE = Math.SQRT1_2;

/**
 * Halftime scores tie far more often than a continuous model implies (both teams on 0, 3, 7, 10…).
 * Treating |half margin| < 1.2 as a tie lands the tie mass near the real ~10% rate instead of the
 * ~0% a continuous normal gives.
 */
const NFL_HALFTIME_TIE_BAND = 1.2;

/**
 * Real NFL overtime rate is ~6.5% of games. A continuous normal puts only ~3% inside ±0.5 points
 * because it spreads mass that really piles up on the exact-tie spike, so the normal estimate is
 * scaled up to match the observed rate.
 */
const NFL_OVERTIME_KEY_NUMBER_MULTIPLIER = 2.2;

/**
 * Same idea for the 3-point key number: the continuous model understates near-exact margins, so
 * "decided by a field goal or less" gets a modest boost toward the observed ~22% rate.
 */
const NFL_CLOSE_MARGIN_KEY_NUMBER_MULTIPLIER = 1.25;

/** Both teams' scores move together (pace, weather, game script), so the joint event beats independence. */
const NFL_BOTH_TEAMS_CORRELATION_BOOST = 1.1;

/** A single quarter's points, as a fraction of the team-score sigma. Four quarters, so ~half. */
const NFL_QUARTER_SIGMA_SCALE = 0.5;

/**
 * P(a team scores at all in a given quarter), as an affine function of its implied team total.
 *
 * **Phase 8c: measured, no longer an anchor pair.** Weighted least squares over the 2025 regular
 * season (1,664 team-quarters, `npm run bingo:measure:nfl-quarters`) fits `0.2025 + 0.0230x`, which
 * ratifies the intercept Phase 2 guessed and moves the slope. The measurement is conditioned on a
 * *pre-game* implied team total, not the realized score: the realized score is the outcome being
 * predicted, and it ranges far outside where an implied total ever sits, so a curve fitted against
 * it is applied outside its own support. The script emits both bases side by side.
 */
const NFL_QUARTER_SCORE_BASE = 0.2;
const NFL_QUARTER_SCORE_SLOPE = 0.023;

/**
 * Scoring in all four quarters is positively dependent (good offense, good field position) — but
 * only barely. **Phase 8c: 1.3 → 1.05.** Against the corrected per-quarter rate, the measured
 * ratio of P(all four) to `p^4` is 1.13 / 0.96 / 0.98 / 1.08 across the four implied-total buckets,
 * so most of what the old 1.3 was carrying was the shallow slope above, not real dependence.
 */
const NFL_EVERY_QUARTER_DEPENDENCE_BOOST = 1.05;

/**
 * "At least one quarter does X" is not four independent trials — quarters within one game are
 * positively correlated, so the effective number of independent chances is below four. Two separate
 * constants because the dependence is stronger for scoreless quarters (a defensive slog stays a
 * defensive slog) than for explosion quarters.
 *
 * **Phase 8c: the scoreless constant is now solved, not guessed** — 3.13 is the value that
 * reproduces the measured **0.2316** rate of "some quarter ends 0–0" (all 272 games of the 2025
 * regular season) at a league-average game. It rose from 2.6 only because the per-quarter scoring
 * rate above rose; the product of the two is what was ever observable.
 * `NFL_BIG_QUARTER_EFFECTIVE_TRIALS` now applies only to a threshold with no measured row in
 * `NFL_QUARTER_POINTS_MEASURED`, which today is none of them.
 */
const NFL_SCORELESS_QUARTER_EFFECTIVE_TRIALS = 3.13;
const NFL_BIG_QUARTER_EFFECTIVE_TRIALS = 3.4;

/**
 * P(a team puts N+ points on the board in a single quarter), measured rather than modelled.
 *
 * Phase 2 read this off a normal tail on quarter points. NFL quarter scoring is discrete and hard
 * right-skewed — a pile at 0, 3, 7, 10, 14 — so a normal understates every threshold, and worst at
 * the only one the board actually emits: **14+ priced at 0.183 against a measured 0.363**, the
 * largest single mispricing the Phase 8c calibration replay found (n=447, gap +0.182). No fiddling
 * with `NFL_BIG_QUARTER_EFFECTIVE_TRIALS` can fix it — reproducing 0.363 from that normal needs 7.5
 * effective trials in a four-quarter game, which is the model telling you it is the wrong shape.
 *
 * Each row is `{rate at NFL_QUARTER_POINTS_ANCHOR_TEAM_TOTAL, slope per implied point}`, fitted by
 * weighted least squares over the 2025 regular season on a pre-game implied team total. Only 14 is
 * emitted onto boards today; the rest are measured so a future rung is a data lookup rather than a
 * new measurement. Re-measure with `npm run bingo:measure:nfl-quarters`.
 */
const NFL_QUARTER_POINTS_ANCHOR_TEAM_TOTAL = 23;
const NFL_QUARTER_POINTS_MEASURED: ReadonlyArray<{ threshold: number; rate: number; slope: number }> = [
  { threshold: 7, rate: 0.9204, slope: 0.0124 },
  { threshold: 10, rate: 0.6309, slope: 0.0532 },
  { threshold: 14, rate: 0.3617, slope: 0.0523 },
  { threshold: 17, rate: 0.1051, slope: 0.0262 },
  { threshold: 21, rate: 0.0359, slope: 0.0067 },
];

/** P(the halftime leader does not win). League base rate is ~21%, shrinking as the game gets more lopsided. */
export const NFL_HALFTIME_LEADER_LOSES_BASE = 0.21;
const NFL_HALFTIME_LEADER_LOSES_SPREAD_DAMPENER = 0.012;

/**
 * P(the second half outscores the first). **Phase 8c: 0.51 → 0.4853, measured.** Regulation halves
 * only, matching the grader, which excludes overtime on purpose; an exact tie is a miss, and 4.4%
 * of 2025 games tied, which is most of why this sits below a coin flip rather than just above one.
 */
export const NFL_SECOND_HALF_HIGHER_BASE = 0.4853;

/**
 * Play-by-play (Optional 3b) base rates. These grade off `/nfl/v1/plays`, which Phase 0 §2
 * confirmed is available on our tier.
 *
 * Phase 8c replayed all 272 games of the 2025 regular season through the shipped graders
 * (`npm run bingo:calibrate:nfl`) and checked each of these against what the graders realized. Four
 * of the five are inside 0.04 of their realized rate and are left alone; the fourth-down constant
 * was not, and is now measured.
 */
export const NFL_FIRST_SCORE_IS_FIELD_GOAL_BASE = 0.38;
/** The team that opens the scoring wins roughly two games in three. Replay: 0.661 against 0.650. */
export const NFL_FIRST_SCORER_WINS_BASE = 0.65;
export const NFL_NON_OFFENSIVE_TD_BASE = 0.26;
/**
 * **Phase 8c: 0.75 → 0.83, measured.** Either team converting at least one fourth down happened in
 * **0.8272** of 2025 regular-season games, counted off `team_stats.fourth_down_conversions` — an
 * independently published number rather than the plays walk this square grades from, which is the
 * point of using it. The replay through the walk itself agrees at 0.861. Fourth-down aggression has
 * risen every year this decade, so this is the constant on this page most likely to drift.
 */
export const NFL_FOURTH_DOWN_CONVERSION_BASE = 0.83;
export const NFL_LONG_TOUCHDOWN_BASE = 0.34;

/** How strongly the market total shades a play-by-play base rate, per point away from a 45-point game. */
const NFL_TOTAL_SHADE_PER_POINT = 0.004;
const NFL_TOTAL_SHADE_ANCHOR = 45;

/**
 * Shade a flat play-by-play base rate by the market total. `direction: 1` means the event gets more
 * likely in higher-scoring games (a 50+ yard touchdown); `-1` means the opposite (the first score
 * being a field goal, which is a low-total signature).
 */
export function shadeByTotal(base: number, total: number, direction: 1 | -1): number {
  const shade = 1 + direction * (total - NFL_TOTAL_SHADE_ANCHOR) * NFL_TOTAL_SHADE_PER_POINT;
  return clamp(base * shade, 0.05, 0.95);
}

/**
 * `1 - (1 - perQuarter)^trials`, with a fractional `trials` standing in for the fact that the four
 * quarters of one football game are positively correlated rather than independent.
 */
function atLeastOnceAcrossQuarters(perQuarter: number, effectiveTrials: number): number {
  const safe = clamp(perQuarter, 0, 1);
  return clamp(1 - Math.pow(1 - safe, effectiveTrials), 0.02, 0.98);
}

/**
 * Turn a market consensus into per-resolver probabilities via a normal approximation of NFL
 * scoring — the plan's Phase 2 core.
 *
 * Margin ~ Normal(-homeSpread, NFL_MARGIN_SIGMA); each team's score ~ Normal(implied team total,
 * NFL_TEAM_TOTAL_SIGMA); combined score ~ Normal(total, NFL_GAME_TOTAL_SIGMA). Every board line
 * produced by `roundLine` is a half-point, so there is no push mass to correct for and a
 * "more than L" square is exactly the complement of the opposite team's "keep it within L".
 *
 * The one deliberate inconsistency: `winProbability` returns the **de-vigged moneyline price**
 * when the books quoted one, rather than `P(margin > 0)` from the normal model. Books price the
 * moneyline directly and NFL margins clump hard on the key numbers 3 and 7, so the market price
 * beats a continuous approximation at the one line where that clumping matters most. Spread and
 * total squares stay anchored on the spread/total, which are the sharper markets for those.
 */
export function buildNFLMarketModel(consensus: SportsBingoMarketConsensus): NFLMarketModel {
  const homeSpread = consensus.homeSpread;
  const total = clamp(consensus.total, NFL_MIN_TOTAL, NFL_MAX_TOTAL);
  const expectedHomeMargin = -homeSpread;
  const impliedHomeTotal = total / 2 + expectedHomeMargin / 2;
  const impliedAwayTotal = total - impliedHomeTotal;

  const marginAbove = (threshold: number): number => 1 - normalCdf(threshold, expectedHomeMargin, NFL_MARGIN_SIGMA);
  const marginBetween = (low: number, high: number): number =>
    normalCdf(high, expectedHomeMargin, NFL_MARGIN_SIGMA) - normalCdf(low, expectedHomeMargin, NFL_MARGIN_SIGMA);

  const modelHomeWinProb = marginAbove(0);
  const homeWinProb = consensus.homeWinProb ?? modelHomeWinProb;

  const impliedTotalFor = (team: MarketTeamSide): number => (team === "home" ? impliedHomeTotal : impliedAwayTotal);
  const teamTotalOver = (team: MarketTeamSide, line: number): number =>
    1 - normalCdf(line, impliedTotalFor(team), NFL_TEAM_TOTAL_SIGMA);

  /** P(this team puts points on the board in any given quarter), from its implied team total. */
  const quarterScoreRate = (team: MarketTeamSide): number =>
    clamp(NFL_QUARTER_SCORE_BASE + NFL_QUARTER_SCORE_SLOPE * impliedTotalFor(team), 0.3, 0.85);

  return {
    homeSpread,
    total,
    expectedHomeMargin,
    impliedHomeTotal,
    impliedAwayTotal,
    favorite: homeSpread <= 0 ? "home" : "away",
    winProbability: (team) => (team === "home" ? homeWinProb : 1 - homeWinProb),
    marginMoreThan: (team, line) =>
      team === "home"
        ? marginAbove(line)
        : // Away wins by more than `line` <=> home margin < -line.
          normalCdf(-line, expectedHomeMargin, NFL_MARGIN_SIGMA),
    gameTotalOver: (line) => 1 - normalCdf(line, total, NFL_GAME_TOTAL_SIGMA),
    teamTotalOver,

    marginAbsAtMost: (line) =>
      clamp(NFL_CLOSE_MARGIN_KEY_NUMBER_MULTIPLIER * marginBetween(-line, line), 0.05, 0.95),
    // |margin| >= line is a union of two tails, so it is the complement of the interval — and it
    // deliberately does NOT take the key-number boost, which exists for near-zero margins only.
    marginAbsAtLeast: (line) => clamp(1 - marginBetween(-line, line), 0.05, 0.95),

    leadsAtHalftime: (team) => {
      const halfSigma = NFL_MARGIN_SIGMA * NFL_HALFTIME_MARGIN_SIGMA_SCALE;
      const halfMargin = expectedHomeMargin / 2;
      const homeLeads = 1 - normalCdf(NFL_HALFTIME_TIE_BAND, halfMargin, halfSigma);
      const awayLeads = normalCdf(-NFL_HALFTIME_TIE_BAND, halfMargin, halfSigma);
      return clamp(team === "home" ? homeLeads : awayLeads, 0.05, 0.95);
    },

    overtime: () =>
      clamp(NFL_OVERTIME_KEY_NUMBER_MULTIPLIER * marginBetween(-0.5, 0.5), 0.02, 0.14),

    bothTeamsScoreAtLeast: (line) =>
      clamp(
        teamTotalOver("home", line) * teamTotalOver("away", line) * NFL_BOTH_TEAMS_CORRELATION_BOOST,
        0.05,
        0.95
      ),

    scoresEveryQuarter: (team) => {
      const perQuarter = quarterScoreRate(team);
      return clamp(Math.pow(perQuarter, 4) * NFL_EVERY_QUARTER_DEPENDENCE_BOOST, 0.05, 0.95);
    },

    quarterPointsAtLeast: (team, threshold) => {
      const measured = NFL_QUARTER_POINTS_MEASURED.find((row) => row.threshold === threshold);
      if (measured) {
        const implied = impliedTotalFor(team);
        return clamp(
          measured.rate + measured.slope * (implied - NFL_QUARTER_POINTS_ANCHOR_TEAM_TOTAL),
          0.05,
          0.95
        );
      }
      // No measured row for this threshold — fall back to Phase 2's normal tail, which is known to
      // understate (see NFL_QUARTER_POINTS_MEASURED). Reaching this branch means someone emitted a
      // rung the season measurement does not cover; measure it rather than trusting this number.
      const quarterMean = impliedTotalFor(team) / 4;
      const quarterSigma = NFL_TEAM_TOTAL_SIGMA * NFL_QUARTER_SIGMA_SCALE;
      // The threshold is a whole number of points ("14+"), so shift a half point to keep the
      // continuous approximation from eating the boundary.
      const perQuarter = 1 - normalCdf(threshold - 0.5, quarterMean, quarterSigma);
      return atLeastOnceAcrossQuarters(perQuarter, NFL_BIG_QUARTER_EFFECTIVE_TRIALS);
    },

    anyQuarterScoreless: () => {
      const bothScoreless =
        (1 - quarterScoreRate("home")) * (1 - quarterScoreRate("away")) * NFL_BOTH_TEAMS_CORRELATION_BOOST;
      return atLeastOnceAcrossQuarters(bothScoreless, NFL_SCORELESS_QUARTER_EFFECTIVE_TRIALS);
    },
  };
}

/** P(the halftime leader goes on to lose or draw), shaded down as the game gets more lopsided. */
export function nflHalftimeLeaderLosesProbability(homeSpread: number): number {
  const dampener = 1 - NFL_HALFTIME_LEADER_LOSES_SPREAD_DAMPENER * Math.abs(homeSpread);
  return clamp(NFL_HALFTIME_LEADER_LOSES_BASE * dampener, 0.08, 0.3);
}

// =============================================================================================
// Phase 3 — NFL player props off `/nfl/v1/odds/player_props`.
//
// Shape (Phase 0 §3 + the BDL NFL docs):
//   { id, game_id, player_id, vendor, prop_type, line_value, market: {...}, updated_at }
// with two market shapes:
//   over_under -> { type: "over_under", over_odds, under_odds }
//   milestone  -> { type: "milestone",  odds }
//
// Two things about this feed drive the design:
//   1. **It is live-only.** balldontlie stores no history and books do not post props until a game
//      is close, so an empty response is normal, not an error. Every function here degrades to an
//      empty list rather than throwing.
//   2. **Vendors disagree about the line, not just the price.** Two books quoting 85.5 and one
//      quoting 89.5 rushing yards are not one market. We pick the *modal* line first and only then
//      take a median price among the books actually quoting it — averaging across different lines
//      would produce a probability that belongs to no line anyone posted.
// =============================================================================================

/**
 * Core allowlist: every prop type here is gradable from a `/nfl/v1/stats` box score alone.
 * Confirmed field-by-field in docs/prop-bingo-nfl-phase0-findings.md §3, which also removed two
 * entries from the original plan: `longest_pass` (no such field exists) and `first_td` (the box
 * score has no notion of order — it moved to the play-by-play set below).
 */
export const NFL_CORE_OVER_UNDER_PROP_TYPES = new Set([
  "passing_yards",
  "passing_tds",
  "passing_attempts",
  "passing_completions",
  "interceptions",
  "rushing_yards",
  "rushing_attempts",
  "receptions",
  "receiving_yards",
  "rushing_receiving_yards",
  "longest_rush",
  "longest_reception",
  "fg_made",
  "kicking_points",
]);

/** Milestone (single-price) markets that the box score can still grade. */
export const NFL_CORE_MILESTONE_PROP_TYPES = new Set(["anytime_td"]);

/**
 * Optional 3b: needs `/nfl/v1/plays` for chronological ordering, so it is opt-in and grouped with
 * the other play-by-play squares rather than the box-score core.
 */
export const NFL_PLAY_BY_PLAY_MILESTONE_PROP_TYPES = new Set(["first_td"]);

/**
 * A milestone market quotes one side only, so there is no complement to normalize against and the
 * price still carries the book's hold. Anytime-TD fields are typically priced with a ~15% overround
 * spread across ~30 players, i.e. each individual price overstates by roughly 8%.
 *
 * Field normalization (scaling every price so the field sums to the expected number of touchdown
 * scorers) is the textbook fix, but it silently inflates every price when the book has posted only
 * part of the field — which is exactly what a thin, early, or partially-pulled slate looks like.
 * A flat factor cannot be wrong in that direction. **Phase 5 should validate this against realized
 * anytime-TD hit rates**; it is the least-evidenced number in this module.
 */
export const NFL_MILESTONE_DEVIG_FACTOR = clamp(
  numberFromEnv(process.env.BINGO_NFL_MILESTONE_DEVIG_FACTOR, 0.92),
  0.7,
  1
);

/**
 * Player props are one call per game (the endpoint requires `game_id` and does not paginate), so
 * they get their own short cache rather than riding the slate-wide odds fetch inside
 * `loadGameCatalog`'s 90s catalog cache.
 */
const NFL_PLAYER_PROPS_CACHE_MS = Math.max(
  15_000,
  Math.min(300_000, numberFromEnv(process.env.BINGO_NFL_PLAYER_PROPS_CACHE_MS, 60_000))
);

export type BallDontLieNFLPlayerPropRow = {
  game_id?: number | string | null;
  player_id?: number | string | null;
  vendor?: string | null;
  prop_type?: string | null;
  line_value?: number | string | null;
  market?: {
    type?: string | null;
    over_odds?: number | string | null;
    under_odds?: number | string | null;
    odds?: number | string | null;
  } | null;
};

export type NFLPlayerPropMarket = {
  propType: string;
  marketType: "over_under" | "milestone";
  playerId: number;
  /** Filled in by the `/nfl/v1/players` join; empty until then. */
  playerName: string;
  /**
   * The player's team as balldontlie renders it, from the same join. Empty when the provider had no
   * team on the row. Phase 5b maps it onto a board side for the correlated estimator; a square is
   * never dropped for lacking it.
   */
  teamName: string;
  /** The modal line across books. For a milestone market this is the book's own (usually 0.5). */
  line: number;
  /** De-vigged P(over) for an over/under market, or P(it happens) for a milestone. */
  probability: number;
  /** How many books quoted this player/prop at the modal line. */
  vendorCount: number;
};

type PropQuote = {
  vendor: string;
  ranked: boolean;
  line: number;
  overProbability: number | null;
  milestoneProbability: number | null;
};

/** Median of the values quoted by real sportsbooks, falling back to unranked vendors only if none did. */
function rankedMedian(quotes: PropQuote[], pick: (quote: PropQuote) => number | null): number | null {
  const ranked = quotes.filter((q) => q.ranked).map(pick).filter((v): v is number => v !== null);
  if (ranked.length > 0) {
    return median(ranked);
  }
  const unranked = quotes.filter((q) => !q.ranked).map(pick).filter((v): v is number => v !== null);
  return unranked.length > 0 ? median(unranked) : null;
}

/**
 * Pure consensus math over raw player-prop rows. Grouped by (player, prop type); within a group the
 * modal line wins and only the books quoting that line contribute a price.
 *
 * Sport-agnostic by construction — balldontlie's `/{sport}/v1/odds/player_props` payload has the
 * identical shape for NFL and MLB (`prop_type` / `line_value` / `market.{type,odds|over_odds,
 * under_odds}` / `vendor` / `player_id`), and the vendor allowlist is a list of sportsbooks, not of
 * football sportsbooks. Phase 9d extracted this from `computeNFLPlayerPropMarkets` so the MLB
 * repair below reuses the de-vigging rather than re-deriving it; the NFL wrapper is byte-equivalent
 * to what it called before.
 */
function computePlayerPropMarkets(
  rows: BallDontLieNFLPlayerPropRow[],
  allowedPropTypes: Set<string>,
  milestoneDevigFactor: number
): NFLPlayerPropMarket[] {
  const quotesByKey = new Map<string, { playerId: number; propType: string; quotes: PropQuote[] }>();

  for (const row of rows) {
    const propType = String(row.prop_type ?? "").trim().toLowerCase();
    if (!propType || !allowedPropTypes.has(propType)) {
      continue;
    }
    const playerId = Number.parseInt(String(row.player_id ?? ""), 10);
    if (!Number.isFinite(playerId) || playerId <= 0) {
      continue;
    }
    const line = parseNumber(row.line_value);
    if (line === null || line < 0 || line > 1000) {
      continue;
    }

    const marketType = String(row.market?.type ?? "").trim().toLowerCase();
    const overProbability =
      marketType === "over_under" ? deVigTwoWay(row.market?.over_odds, row.market?.under_odds) : null;
    const rawMilestone = marketType === "milestone" ? impliedProbabilityFromAmericanOdds(row.market?.odds) : null;
    const milestoneProbability = rawMilestone === null ? null : clamp(rawMilestone * milestoneDevigFactor, 0.02, 0.98);
    if (overProbability === null && milestoneProbability === null) {
      continue;
    }

    const vendor = (String(row.vendor ?? "").trim() || "unknown").toLowerCase();
    const key = `${playerId}|${propType}`;
    const bucket = quotesByKey.get(key) ?? { playerId, propType, quotes: [] };
    bucket.quotes.push({
      vendor,
      ranked: NFL_ODDS_VENDOR_ALLOWLIST.has(vendor),
      line,
      overProbability,
      milestoneProbability,
    });
    quotesByKey.set(key, bucket);
  }

  const markets: NFLPlayerPropMarket[] = [];
  for (const { playerId, propType, quotes } of quotesByKey.values()) {
    // Modal line first: books that quote a different number are quoting a different market.
    const lineCounts = new Map<number, number>();
    for (const quote of quotes) {
      // Only ranked books get a vote on where the line is, so one off-market outlier can't move it.
      if (!quote.ranked && quotes.some((other) => other.ranked)) continue;
      lineCounts.set(quote.line, (lineCounts.get(quote.line) ?? 0) + 1);
    }
    if (lineCounts.size === 0) continue;
    const modalLine = [...lineCounts.entries()].sort((left, right) =>
      right[1] === left[1] ? left[0] - right[0] : right[1] - left[1]
    )[0][0];

    const atLine = quotes.filter((quote) => quote.line === modalLine);
    const overProbability = rankedMedian(atLine, (quote) => quote.overProbability);
    const milestoneProbability = rankedMedian(atLine, (quote) => quote.milestoneProbability);
    const probability = overProbability ?? milestoneProbability;
    if (probability === null) continue;

    markets.push({
      propType,
      marketType: overProbability !== null ? "over_under" : "milestone",
      playerId,
      playerName: "",
      teamName: "",
      line: modalLine,
      probability: clamp(probability, 0.02, 0.98),
      vendorCount: new Set(atLine.map((quote) => quote.vendor)).size,
    });
  }

  return markets.sort((left, right) =>
    left.playerId === right.playerId ? left.propType.localeCompare(right.propType) : left.playerId - right.playerId
  );
}

/** NFL view of {@link computePlayerPropMarkets}. Unchanged behavior; see that function's docs. */
export function computeNFLPlayerPropMarkets(
  rows: BallDontLieNFLPlayerPropRow[],
  allowedPropTypes: Set<string>
): NFLPlayerPropMarket[] {
  return computePlayerPropMarkets(rows, allowedPropTypes, NFL_MILESTONE_DEVIG_FACTOR);
}

type BallDontLieNFLPlayerRow = {
  id?: number | string | null;
  first_name?: string | null;
  last_name?: string | null;
  // `/nfl/v1/players` renders the team as `full_name`; `/mlb/v1/players` renders the same thing as
  // `display_name` ("Los Angeles Dodgers") and has no `full_name` at all. Both are read below.
  team?: {
    full_name?: string | null;
    display_name?: string | null;
    name?: string | null;
    location?: string | null;
  } | null;
};

/** What one `/nfl/v1/players` row is worth to us: who they are and who they play for. */
export type NFLPlayerProfile = {
  name: string;
  /** Team full name as balldontlie renders it ("Philadelphia Eagles"), or "" when absent. */
  teamName: string;
};

// Player names change essentially never, so this is a process-lifetime memo rather than a TTL
// cache. It is bounded by the size of the league's player pool.
const nflPlayerProfileCache = new Map<number, NFLPlayerProfile>();

/**
 * Resolve `player_id` -> display name + team. Props carry only ids, so without this every NFL player
 * square would read "Player 490". Batched by `player_ids[]` (supported by `/nfl/v1/players`) and
 * memoized, so a full slate costs one call the first time and nothing after.
 *
 * The team comes along free of charge — `/nfl/v1/players` already returns it on the same row — and
 * Phase 5b's correlated estimator needs it to tie a prop to its own team's scoring rather than to
 * the game's overall pace.
 */
export async function resolveNFLPlayerProfiles(playerIds: number[]): Promise<Map<number, NFLPlayerProfile>> {
  return resolvePlayerProfiles("/nfl/v1/players", nflPlayerProfileCache, playerIds, "NFL");
}

/**
 * The sport-agnostic half of {@link resolveNFLPlayerProfiles}, extracted by Phase 9d so MLB's
 * repaired prop path gets the same batching, memoization and failure behavior instead of a second
 * copy. Each sport passes its own cache map — ids are only unique within a sport, so a shared cache
 * would collide.
 */
async function resolvePlayerProfiles(
  path: string,
  cache: Map<number, NFLPlayerProfile>,
  playerIds: number[],
  label: string
): Promise<Map<number, NFLPlayerProfile>> {
  const wanted = [...new Set(playerIds.filter((id) => Number.isFinite(id) && id > 0))];
  const resolved = new Map<number, NFLPlayerProfile>();
  const missing: number[] = [];
  for (const id of wanted) {
    const cached = cache.get(id);
    if (cached) {
      resolved.set(id, cached);
    } else {
      missing.push(id);
    }
  }
  if (missing.length === 0) {
    return resolved;
  }

  // per_page maxes out at 100, and a single game's prop field never approaches that, but chunk
  // anyway so a future caller batching a whole slate can't silently lose the tail.
  for (let start = 0; start < missing.length; start += 100) {
    const chunk = missing.slice(start, start + 100);
    const query = new URLSearchParams({ per_page: "100" });
    for (const id of chunk) {
      query.append("player_ids[]", String(id));
    }
    let rows: BallDontLieNFLPlayerRow[] = [];
    try {
      rows = await fetchBallDontLieList<BallDontLieNFLPlayerRow>(path, query, { maxPages: 3 });
    } catch (error) {
      console.error(`[sportsBingoOdds] Failed to resolve ${label} player names:`, error);
      continue;
    }
    for (const row of rows) {
      const id = Number.parseInt(String(row.id ?? ""), 10);
      const name = `${String(row.first_name ?? "").trim()} ${String(row.last_name ?? "").trim()}`.trim();
      if (!Number.isFinite(id) || id <= 0 || !name) continue;
      const teamName = String(row.team?.full_name ?? row.team?.display_name ?? "").trim();
      const profile: NFLPlayerProfile = { name, teamName };
      cache.set(id, profile);
      resolved.set(id, profile);
    }
  }

  return resolved;
}

/** Name-only view of {@link resolveNFLPlayerProfiles}, kept for callers that don't need the team. */
export async function resolveNFLPlayerNames(playerIds: number[]): Promise<Map<number, string>> {
  const profiles = await resolveNFLPlayerProfiles(playerIds);
  return new Map([...profiles].map(([id, profile]) => [id, profile.name]));
}

type PlayerPropsCacheEntry = { markets: NFLPlayerPropMarket[]; expiresAt: number };
const nflPlayerPropsCache = new Map<string, PlayerPropsCacheEntry>();

/**
 * One `/nfl/v1/odds/player_props` call per game, named and cached for
 * `BINGO_NFL_PLAYER_PROPS_CACHE_MS` (default 60s).
 *
 * `includePlayByPlay` adds the Optional 3b markets (`first_td`) that need `/nfl/v1/plays` to grade;
 * callers that only want box-score-gradable squares leave it off.
 */
export async function fetchNFLPlayerPropMarkets(
  gameId: string,
  options: { includePlayByPlay?: boolean } = {}
): Promise<NFLPlayerPropMarket[]> {
  const normalizedGameId = String(gameId ?? "").trim();
  if (!normalizedGameId) {
    return [];
  }
  const includePlayByPlay = options.includePlayByPlay === true;
  const cacheKey = `${normalizedGameId}:${includePlayByPlay ? "with_pbp" : "core"}`;
  const cached = nflPlayerPropsCache.get(cacheKey);
  const now = Date.now();
  if (cached && now < cached.expiresAt) {
    return cached.markets.map((market) => ({ ...market }));
  }

  const allowed = new Set([...NFL_CORE_OVER_UNDER_PROP_TYPES, ...NFL_CORE_MILESTONE_PROP_TYPES]);
  if (includePlayByPlay) {
    for (const propType of NFL_PLAY_BY_PLAY_MILESTONE_PROP_TYPES) {
      allowed.add(propType);
    }
  }

  const query = new URLSearchParams({ per_page: "100", game_id: normalizedGameId });
  let rows: BallDontLieNFLPlayerPropRow[] = [];
  try {
    // The docs say this endpoint returns every prop for the game in one response and does not
    // paginate; the 2-page cap is belt-and-braces in case that ever changes.
    rows = await fetchBallDontLieList<BallDontLieNFLPlayerPropRow>("/nfl/v1/odds/player_props", query, {
      maxPages: 2,
    });
  } catch (error) {
    console.error("[sportsBingoOdds] Failed to fetch NFL player props:", error);
    return [];
  }

  const markets = computeNFLPlayerPropMarkets(rows, allowed);
  const profiles = await resolveNFLPlayerProfiles(markets.map((market) => market.playerId));
  // A prop we cannot name is a square that reads "Player 490" — drop it rather than ship it. A
  // missing *team* is not disqualifying: it only costs the correlated estimator some precision.
  const named = markets
    .map((market) => {
      const profile = profiles.get(market.playerId);
      return { ...market, playerName: profile?.name ?? "", teamName: profile?.teamName ?? "" };
    })
    .filter((market) => market.playerName.length > 0);

  nflPlayerPropsCache.set(cacheKey, { markets: named, expiresAt: Date.now() + NFL_PLAYER_PROPS_CACHE_MS });
  return named.map((market) => ({ ...market }));
}

// =============================================================================================
// Phase 9d — the MLB player-prop repair.
//
// Phase 7's handoff note 4 recorded that MLB named-player squares were absent from every
// production board (`named_candidate_pool_size: 0`) and attributed it to "`/mlb/v1/player_props`
// 404s". That was the symptom. Probed live on 2026-08-17, the cause is four separate bugs stacked
// on top of each other in `buildMLBPlayerPropCandidates`:
//
//   1. The route does not exist. `/mlb/v1/player_props` is a hard 404 ("Route not found"); the
//      real one is `/mlb/v1/odds/player_props`, exactly mirroring NFL's `/nfl/v1/odds/player_props`.
//   2. The parameter is wrong. That route takes a scalar `game_id` and rejects `game_ids[]` with
//      `400 game_id must be an integer`.
//   3. The row schema is wrong. The old parser read `market_key` / `line` / `over_odds`; the real
//      payload is NFL-shaped — `prop_type` / `line_value` / `market.{type, odds | over_odds,
//      under_odds}` — and the prop-type vocabulary is `hits` / `home_runs` / `rbis`, not the
//      `player_hits` / `player_home_runs` internal keys it was matching against.
//   4. There is no player object on the row, only `player_id`, so even a parsed row had no name.
//
// Because all four had to be wrong simultaneously for the pool to be empty, no partial fix would
// have surfaced it — hence the "somebody should find out why that pool is empty" note surviving
// two phases. A live game returns 700-1,600 prop rows across six sportsbooks, so this is a
// genuinely rich surface that Prop Bingo has simply never read.
//
// Fixed here rather than in lib/sportsBingo.ts because that also retires the raw-implied-odds vig
// bug flagged in Phase 2's handoff note 2 and re-flagged in Phase 5: routing MLB through the same
// `computePlayerPropMarkets` consensus the NFL path already uses de-vigs every two-way price
// instead of shipping the book's hold onto a board.
// =============================================================================================

/**
 * balldontlie MLB `prop_type` -> the internal `player_prop` market key Prop Bingo grades against.
 *
 * Deliberately a *whitelist keyed by what settlement can actually do*: every value here is a case
 * in `getMLBPlayerPropValue` (lib/sportsBingo.ts), so a square offered from this table can always
 * be graded off an MLB box score. The books post far more than this (`total_bases`,
 * `hits_runs_rbis`, `singles`, `first_home_run`, ~28 prop types on a live game) — those are dropped
 * at parse time rather than offered and voided later, which is the same "what we offer == what we
 * can settle" discipline `NFL_SETTLABLE_PLAYER_PROP_MARKETS` enforces for NFL.
 */
export const MLB_PROP_TYPE_TO_MARKET_KEY: ReadonlyMap<string, string> = new Map([
  ["hits", "player_hits"],
  ["home_runs", "player_home_runs"],
  ["rbis", "player_rbis"],
  ["runs_scored", "player_runs"],
  ["stolen_bases", "player_stolen_bases"],
  ["pitcher_strikeouts", "player_strikeouts_pitcher"],
  ["pitcher_earned_runs", "player_earned_runs"],
  ["pitcher_outs", "player_pitcher_outs"],
]);

/** The `prop_type` values above, as the set `computePlayerPropMarkets` filters on. */
export const MLB_CORE_PROP_TYPES = new Set(MLB_PROP_TYPE_TO_MARKET_KEY.keys());

/** The internal market keys the table above can produce — the "what we can settle" half. */
export const MLB_CORE_PLAYER_PROP_MARKET_KEYS = new Set(MLB_PROP_TYPE_TO_MARKET_KEY.values());

/**
 * Milestone de-vig factor for MLB, the analogue of {@link NFL_MILESTONE_DEVIG_FACTOR}.
 *
 * Deliberately *less* aggressive than NFL's 0.92. An anytime-TD market is a ~30-runner field priced
 * with a single large overround spread across it, so each individual price overstates badly. An MLB
 * milestone row is almost always one side of a genuine two-way market (`hits 0.5` comes back as
 * `milestone` from FanDuel and as `over_under` from Fanatics on the same game), where the two-way
 * hold is typically 8-12% and one side therefore overstates by roughly half of that.
 *
 * This only ever applies to a player/prop whose modal line no ranked book quoted two-way — when any
 * ranked book did, `computePlayerPropMarkets` prefers the real `deVigTwoWay` price and this constant
 * is never consulted. Like NFL's, it is the least-evidenced number here and wants validating
 * against realized hit rates once MLB boards have carried real props for a while.
 */
export const MLB_MILESTONE_DEVIG_FACTOR = clamp(
  numberFromEnv(process.env.BINGO_MLB_MILESTONE_DEVIG_FACTOR, 0.95),
  0.7,
  1
);

/** Same one-call-per-game shape and cache window as NFL's; see `NFL_PLAYER_PROPS_CACHE_MS`. */
const MLB_PLAYER_PROPS_CACHE_MS = Math.max(
  15_000,
  Math.min(300_000, numberFromEnv(process.env.BINGO_MLB_PLAYER_PROPS_CACHE_MS, 60_000))
);

/**
 * One MLB player-prop market, already de-vigged and named. Structurally identical to
 * {@link NFLPlayerPropMarket} — same feed shape, same consensus math — with `propType` swapped for
 * the internal `marketKey` the resolver actually uses, so no caller has to carry the BDL
 * vocabulary any further than this module.
 */
export type MLBPlayerPropMarket = {
  /** Internal `player_prop` market key, e.g. `player_home_runs`. */
  marketKey: string;
  /** The raw balldontlie `prop_type` it came from, kept for logging and the star signal's breadth. */
  propType: string;
  marketType: "over_under" | "milestone";
  playerId: number;
  playerName: string;
  /** Team display name from the `/mlb/v1/players` join, or "" when the provider had none. */
  teamName: string;
  line: number;
  /** De-vigged P(over) for an over/under market, or P(it happens) for a milestone. */
  probability: number;
  vendorCount: number;
};

// Ids are only unique within a sport, so MLB gets its own memo rather than sharing NFL's.
const mlbPlayerProfileCache = new Map<number, NFLPlayerProfile>();

/** MLB view of the shared `/{sport}/v1/players` name+team join. See {@link resolveNFLPlayerProfiles}. */
export async function resolveMLBPlayerProfiles(playerIds: number[]): Promise<Map<number, NFLPlayerProfile>> {
  return resolvePlayerProfiles("/mlb/v1/players", mlbPlayerProfileCache, playerIds, "MLB");
}

const mlbPlayerPropsCache = new Map<string, { markets: MLBPlayerPropMarket[]; expiresAt: number }>();

/**
 * One `/mlb/v1/odds/player_props?game_id=` call per game, cached for
 * `BINGO_MLB_PLAYER_PROPS_CACHE_MS` (default 60s) — the MLB counterpart of
 * {@link fetchNFLPlayerPropMarkets}, and the function Phase 7 note 4 was missing.
 *
 * Never throws: a provider failure returns `[]`, which leaves `buildMLBPlayerPropCandidates` on its
 * existing historical-stats fallback exactly as it behaves today.
 */
export async function fetchMLBPlayerPropMarkets(gameId: string): Promise<MLBPlayerPropMarket[]> {
  const normalizedGameId = String(gameId ?? "").trim();
  if (!normalizedGameId) {
    return [];
  }
  const cached = mlbPlayerPropsCache.get(normalizedGameId);
  const now = Date.now();
  if (cached && now < cached.expiresAt) {
    return cached.markets.map((market) => ({ ...market }));
  }

  const query = new URLSearchParams({ per_page: "100", game_id: normalizedGameId });
  let rows: BallDontLieNFLPlayerPropRow[] = [];
  try {
    // A live MLB game returns well past 1,000 rows (6 books x ~28 prop types x ~20 players), so
    // unlike NFL this one genuinely paginates. 20 pages at per_page 100 covers a full slate's
    // worth of rows for one game with headroom.
    rows = await fetchBallDontLieList<BallDontLieNFLPlayerPropRow>("/mlb/v1/odds/player_props", query, {
      maxPages: 20,
    });
  } catch (error) {
    console.error("[sportsBingoOdds] Failed to fetch MLB player props:", error);
    return [];
  }

  const consensus = computePlayerPropMarkets(rows, MLB_CORE_PROP_TYPES, MLB_MILESTONE_DEVIG_FACTOR);
  const profiles = await resolveMLBPlayerProfiles(consensus.map((market) => market.playerId));
  const named: MLBPlayerPropMarket[] = [];
  for (const market of consensus) {
    const marketKey = MLB_PROP_TYPE_TO_MARKET_KEY.get(market.propType);
    const profile = profiles.get(market.playerId);
    // Same rule as NFL: a prop we cannot name is a square that reads "Player 490" — drop it. A
    // missing team costs the correlated estimator precision and nothing else.
    if (!marketKey || !profile?.name) {
      continue;
    }
    named.push({
      marketKey,
      propType: market.propType,
      marketType: market.marketType,
      playerId: market.playerId,
      playerName: profile.name,
      teamName: profile.teamName,
      line: market.line,
      probability: market.probability,
      vendorCount: market.vendorCount,
    });
  }

  mlbPlayerPropsCache.set(normalizedGameId, { markets: named, expiresAt: Date.now() + MLB_PLAYER_PROPS_CACHE_MS });
  return named.map((market) => ({ ...market }));
}
