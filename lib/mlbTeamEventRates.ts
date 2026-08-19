/**
 * Phase 7 of docs/prop-bingo-nfl-plan.md — measured base rates for the MLB team-event bingo squares.
 *
 * Before this module, the fourteen `mlb_webhook_team_event_at_least` squares carried seven
 * hardcoded probabilities that were identical for every game, every team, every night, and had
 * never been checked against a box score. Every one of them was wrong in the same direction:
 *
 *   square              priced   measured
 *   5+ hits              0.78      0.865
 *   4+ groundouts        0.74      0.969
 *   5+ strikeouts        0.67      0.917
 *   2+ walks             0.62      0.812
 *   4+ flyouts           0.74      0.764
 *   1+ hit by pitch      0.38      0.338   <- the only honest one
 *
 * The numbers below come from `scripts/measure-mlb-event-rates.cjs` over 1,138 team-games
 * (2026-07-03 .. 2026-08-16), archived at `docs/phase0-artifacts/mlb-event-rates-2026-08-17.json`.
 * **Re-run that script and update this table** rather than hand-adjusting a constant — the point of
 * Phase 7 is that these stopped being opinions.
 *
 * ## Why the opponent, and not the team
 *
 * The plan's 7b assumed a team's threshold should scale with its own implied run total. Two things
 * ruled that out, both measured rather than argued:
 *
 *   1. **MLB has no market model.** `buildGameAndCandidatesFromBallDontLie` only builds one for NFL;
 *      for MLB `impliedHomeTotal`/`impliedAwayTotal` derive from the hardcoded league constants
 *      (total 8, home spread -3.5), so they are *the same 5.75 / 2.25 for every MLB game ever
 *      played*. Scaling on them would be decoration over a constant.
 *   2. **A team's own trailing form barely predicts its own counts** (|r| = 0.02..0.10; for hits it
 *      is actually negative). What predicts them is the *opponent's* trailing rate allowed —
 *      r = 0.15..0.29 across all six events, and the tercile spread is large enough to move a
 *      threshold: facing a top-third strikeout staff moves P(8+ Ks) from 0.46 to 0.73.
 *
 * So the per-game input here is the opposing pitching staff's trailing rate allowed, which is free:
 * it comes out of the same `/mlb/v1/stats` pull the candidate builder already makes.
 *
 * ## Phase 1 of docs/bingo-correctness-and-wnba-repair-plan.md — the home/away split
 *
 * The home team doesn't bat in the bottom of the 9th when it is already ahead — about half of all
 * games — so its event totals run structurally below the away team's. Before this phase every
 * square priced off one pooled `leagueMean` regardless of side, which overprices home squares and
 * underprices away ones by roughly the same amount (every aggregate metric — the pooled family
 * rate, the board win rate, `bingo:simulate --backtest` — averages the error to zero; only a
 * side-split view shows it, which is why it went unnoticed until `bingo:calibrate:mlb`'s
 * `byTeamEventSide` was added).
 *
 * Re-measured 2026-08-18 over 3,102 team-games (`scripts/measure-mlb-event-rates.cjs --days 120`,
 * archived at `docs/phase0-artifacts/mlb-event-rates-side-split-2026-08-18.json`), every home team
 * matched to its game's `home_team_name` via the same fuzzy `teamsMatch` the rest of this path uses
 * (0 of 3,102 team-games had an unresolved side). All six events run home mean < away mean, largest
 * on strikeouts (home 8.006 vs away 8.635):
 *
 *   event           home mean   away mean
 *   hit                 8.152       8.305
 *   walk                3.285       3.311
 *   hit_by_pitch        0.419       0.437
 *   strikeout           8.006       8.635
 *   groundout           7.976       8.394
 *   flyout              5.021       5.255
 *
 * **Variance was measured per side and left pooled.** Every event's home/away variance sits within
 * ~5% of the pooled `variance` below (the widest gap, hit and walk, is right at that boundary) — an
 * unjustified per-side variance constant is worse than none for a second-order negative-binomial
 * input, so `variance` stays one number shared by both sides. Only the mean split.
 *
 * `leagueMean` stays as the `teamSide: null` fallback — **today's exact pooled behavior**, unchanged
 * — for any caller that doesn't know its side yet.
 */

/** The six team events measurable from `/mlb/v1/stats`. `quick_out_under_3_pitches` is not one. */
export type MeasuredMlbTeamEvent = "hit" | "walk" | "hit_by_pitch" | "strikeout" | "groundout" | "flyout";

/** Structurally identical to `TeamSide` in lib/sportsBingo.ts — kept local to avoid a circular import. */
export type TeamSide = "home" | "away";

export type MlbTeamEventRateModel = {
  /** League mean count per team per game, pooled across both sides. Kept as the `teamSide: null` fallback. */
  readonly leagueMean: number;
  /** Home-side mean count per team per game. See the module comment's "Phase 1" section. */
  readonly homeMean: number;
  /** Away-side mean count per team per game. */
  readonly awayMean: number;
  /** Sample variance of that count. Above the mean for most events, hence negative binomial. */
  readonly variance: number;
  /** OLS slope of a team's count on its opponent's trailing rate allowed. */
  readonly opponentSlope: number;
  /** League mean of that predictor, so the adjustment is zero at an average opponent. */
  readonly opponentMean: number;
  /** SD of the predictor, used to bound the adjustment at +/- 2 SD. */
  readonly opponentSd: number;
  /** Correlation of the predictor with the outcome. Recorded for auditability, not used in maths. */
  readonly opponentCorrelation: number;
};

/**
 * Measured 2026-08-18 over 3,102 team-games (`docs/phase0-artifacts/mlb-event-rates-side-split-2026-08-18.json`).
 * Supersedes the 2026-08-17 pooled-only measurement — re-run wholesale, not patched: mixing a
 * newer side ratio onto an older pooled mean would introduce a second error while fixing the
 * first (the module comment above explains why). See the module comment before editing by hand.
 */
export const MLB_TEAM_EVENT_RATES: Readonly<Record<MeasuredMlbTeamEvent, MlbTeamEventRateModel>> = {
  hit: { leagueMean: 8.229, homeMean: 8.152, awayMean: 8.305, variance: 11.633, opponentSlope: 0.693, opponentMean: 8.243, opponentSd: 0.798, opponentCorrelation: 0.163 },
  walk: { leagueMean: 3.298, homeMean: 3.285, awayMean: 3.311, variance: 4.222, opponentSlope: 0.671, opponentMean: 3.355, opponentSd: 0.547, opponentCorrelation: 0.179 },
  hit_by_pitch: { leagueMean: 0.428, homeMean: 0.419, awayMean: 0.437, variance: 0.46, opponentSlope: 0.584, opponentMean: 0.42, opponentSd: 0.133, opponentCorrelation: 0.114 },
  strikeout: { leagueMean: 8.321, homeMean: 8.006, awayMean: 8.635, variance: 8.493, opponentSlope: 0.932, opponentMean: 8.261, opponentSd: 0.806, opponentCorrelation: 0.259 },
  groundout: { leagueMean: 8.185, homeMean: 7.976, awayMean: 8.394, variance: 6.742, opponentSlope: 0.764, opponentMean: 8.265, opponentSd: 0.631, opponentCorrelation: 0.186 },
  flyout: { leagueMean: 5.138, homeMean: 5.021, awayMean: 5.255, variance: 4.889, opponentSlope: 0.819, opponentMean: 5.103, opponentSd: 0.435, opponentCorrelation: 0.161 },
};

/**
 * Target difficulties for the rungs emitted per event per team, per Phase 7's decision to land the
 * block in 0.35-0.55 (centred near 0.45) — just below the core markets rather than well above them.
 * Three rungs so `orderByDifficulty` has something to choose between.
 */
export const MLB_TEAM_EVENT_RUNG_TARGETS: readonly number[] = [0.55, 0.45, 0.35];

/** Games of opponent history required before the per-game adjustment is trusted at full weight. */
const OPPONENT_SHRINKAGE_GAMES = 6;

/**
 * `P(X >= k)` under a negative binomial fitted to `mean` and `variance` by method of moments.
 *
 * Fitted against the measured distribution it reproduces every rung to within 0.014 for five of the
 * six events (0.042 for groundouts, which are under-dispersed and take the Poisson branch). Poisson
 * alone was rejected: variance runs ~1.4x the mean for hits and ~1.25x for walks.
 */
export const mlbTeamEventTailProbability = (threshold: number, mean: number, variance: number): number => {
  if (threshold <= 0) {
    return 1;
  }
  if (mean <= 0) {
    return 0;
  }
  if (variance <= mean) {
    let term = Math.exp(-mean);
    let cdf = term;
    for (let index = 1; index < threshold; index += 1) {
      term = (term * mean) / index;
      cdf += term;
    }
    return Math.max(0, Math.min(1, 1 - cdf));
  }
  const r = (mean * mean) / (variance - mean);
  const p = r / (r + mean);
  let term = Math.exp(r * Math.log(p));
  let cdf = term;
  for (let index = 1; index < threshold; index += 1) {
    term = (term * (r + index - 1) * (1 - p)) / index;
    cdf += term;
  }
  return Math.max(0, Math.min(1, 1 - cdf));
};

/**
 * The count this team is expected to put up, given how much of that event the *opponent* has
 * allowed lately and which side of the plate this team is on.
 *
 * `opponentAllowedRate` is null when the opponent has no usable history — a rainout stretch, an
 * early-season game, a feed gap — in which case this returns the (side-selected) base rate and the
 * square prices exactly as it would have without the per-game input. That degradation is
 * deliberate: an unsupported adjustment is worse than none.
 *
 * `teamSide` selects the base rate the opponent adjustment is applied on top of — `homeMean` or
 * `awayMean` instead of the pooled `leagueMean` — because the home team doesn't bat in the bottom
 * of the 9th when already ahead (roughly half of all games), so its totals run structurally below
 * the away team's. **`teamSide: null` must return exactly what this function returned before that
 * split existed** — the pooled `leagueMean` path — so every existing caller that doesn't know its
 * side yet keeps today's behavior verbatim.
 */
export const predictMlbTeamEventRate = (
  event: MeasuredMlbTeamEvent,
  opponentAllowedRate: number | null,
  opponentGames: number,
  teamSide: TeamSide | null = null
): number => {
  const model = MLB_TEAM_EVENT_RATES[event];
  const baseMean = teamSide === "home" ? model.homeMean : teamSide === "away" ? model.awayMean : model.leagueMean;
  if (opponentAllowedRate === null || !Number.isFinite(opponentAllowedRate) || opponentGames <= 0) {
    return baseMean;
  }
  // Bound the predictor at +/- 2 SD before it is scaled: a six-game sample throws up rates the
  // full season never would, and an unbounded slope turns one of those into an absurd threshold.
  const bounded = Math.max(
    model.opponentMean - 2 * model.opponentSd,
    Math.min(model.opponentMean + 2 * model.opponentSd, opponentAllowedRate)
  );
  const shrinkage = opponentGames / (opponentGames + OPPONENT_SHRINKAGE_GAMES);
  const adjustment = model.opponentSlope * (bounded - model.opponentMean) * shrinkage;
  return Math.max(0.05, baseMean + adjustment);
};

export type MlbTeamEventRung = {
  readonly threshold: number;
  readonly probability: number;
};

/**
 * The rungs to emit for one event and one team, priced at that team's predicted rate.
 *
 * The threshold is what moves with the matchup, not the difficulty: a lineup facing a
 * strikeout-heavy staff gets "10+ strikeouts" where another gets "8+", both priced near the same
 * target. That is the whole point — the square stays as hard as it claims to be while the number on
 * it reflects the game actually being played.
 *
 * Rungs are deduplicated by threshold (low-count events like hit-by-pitch legitimately collapse to
 * a single rung), and any rung whose honest price falls outside 0.10-0.90 is dropped rather than
 * shipped as filler.
 */
export const buildMlbTeamEventRungs = (event: MeasuredMlbTeamEvent, expectedRate: number): MlbTeamEventRung[] => {
  const model = MLB_TEAM_EVENT_RATES[event];
  const rungs: MlbTeamEventRung[] = [];
  const seen = new Set<number>();

  for (const target of MLB_TEAM_EVENT_RUNG_TARGETS) {
    let best: MlbTeamEventRung | null = null;
    // 1..24 covers every plausible per-team count for all six events with room to spare.
    for (let threshold = 1; threshold <= 24; threshold += 1) {
      const probability = mlbTeamEventTailProbability(threshold, expectedRate, model.variance);
      if (best === null || Math.abs(probability - target) < Math.abs(best.probability - target)) {
        best = { threshold, probability };
      }
      if (probability < target && best !== null) {
        break;
      }
    }
    if (best && !seen.has(best.threshold) && best.probability >= 0.1 && best.probability <= 0.9) {
      seen.add(best.threshold);
      rungs.push(best);
    }
  }

  return rungs;
};
