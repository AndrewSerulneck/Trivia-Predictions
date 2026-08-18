/**
 * Phase 5b of docs/prop-bingo-nfl-plan.md — the correlated board-win-rate estimator.
 *
 * ## Why this exists
 *
 * The estimator this replaces flipped each of a board's 24 squares **independently**. Real bingo
 * squares are nothing like independent: "Eagles ML", "Eagles team total over 24.5" and "game total
 * over 47.5" all resolve off one game state, so a five-square line built from them is a conjunction
 * of positively-correlated events — far likelier than the independent product says. A board the old
 * estimator called 42% could realize well north of that, and the direction of the error is always
 * the same: **independence understates the win rate**, so every board it approved was easier than
 * intended.
 *
 * ## The model
 *
 * A **Gaussian copula**, not a literal box-score simulator. Per trial we draw a small number of
 * latent factors, project each square onto them, and hit the square when its latent value clears
 * `Φ⁻¹(1 − p)`. That construction preserves each square's marginal probability **exactly** — the
 * de-vigged market numbers Phase 2/3 worked so hard for are not re-derived or perturbed — while
 * inducing a realistic joint distribution.
 *
 * Copula rather than the plan's literal "draw a margin and a total, then derive every square":
 * that literal version only works for NFL, because NFL is the only league with a market model
 * (`NFLMarketModel`, Phase 2). Decision 1 in the plan applies the win-rate target to **all**
 * leagues, so NBA/WNBA/MLB boards need the same correction, and they have no simulator to derive
 * squares from. A copula gets there from the resolver alone.
 *
 * The factors, all standard normal and mutually uncorrelated:
 *
 * | Factor | Meaning |
 * | --- | --- |
 * | `zHome` | how much the home team scores relative to its implied total |
 * | `zAway` | the same for the away team |
 * | `zClose` | how close the final margin is (monotone decreasing in `|margin|`) |
 * | `zPlayer[k]` | one per named player — everything about that player's night the game state doesn't explain |
 *
 * `zHome`/`zAway` are the primitives on purpose: margin `= (zHome − zAway)/√2` and total
 * `= (zHome + zAway)/√2` then fall out, and they are automatically uncorrelated with each other,
 * which is the standard and correct assumption for a spread/total pair. Every core-market square is
 * an **exact** function of those two, so it gets `systematic: 1` — a moneyline and a spread on the
 * same team come out perfectly rank-correlated, i.e. properly nested, with no tuning.
 *
 * `zClose` is derived from the margin rather than drawn (`zClose = Φ⁻¹(2Φ(−|margin|))`), which
 * makes it exactly standard normal *and* exactly monotone in closeness — so `nfl_margin_at_most`
 * keeps an exact marginal too, which a raw `−|margin|` loading would not. It is uncorrelated with
 * both `zHome` and `zAway` by symmetry, and independent of the total.
 *
 * ## Calibrating this file
 *
 * Every number in the constants block below is a judgement call about how tightly a square tracks
 * the game state. They are deliberately all in one place, each with the correlation it targets
 * written next to it. `npm run bingo:simulate` is the tool for moving them: forward mode reports
 * what this estimator predicts, backtest mode reports what actually happened.
 */

import type { SportsBingoResolver } from "@/lib/sportsBingo";
import type { NFLPlayerStatField, NFLTeamStatField } from "@/lib/sportsBingoNflFlavor";
import { normalCdf } from "@/lib/sportsBingoOdds";

type TeamSide = "home" | "away";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function numberFromEnv(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(raw ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

// --- Inverse normal CDF ------------------------------------------------------------------------
// Acklam's rational approximation (relative error < 1.15e-9). Needed in two places: turning a
// square's probability into a latent threshold once per board, and turning the folded margin back
// into a normal score once per trial.

const PROBIT_A = [
  -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1,
  2.506628277459239,
];
const PROBIT_B = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
const PROBIT_C = [
  -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968,
  2.938163982698783,
];
const PROBIT_D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
const PROBIT_TAIL_BREAK = 0.02425;

/** Φ⁻¹(p). Clamped away from the asymptotes so a 0 or 1 probability yields a finite threshold. */
export function probit(p: number): number {
  const q = clamp(p, 1e-12, 1 - 1e-12);

  if (q < PROBIT_TAIL_BREAK) {
    const r = Math.sqrt(-2 * Math.log(q));
    return (
      (((((PROBIT_C[0] * r + PROBIT_C[1]) * r + PROBIT_C[2]) * r + PROBIT_C[3]) * r + PROBIT_C[4]) * r + PROBIT_C[5]) /
      ((((PROBIT_D[0] * r + PROBIT_D[1]) * r + PROBIT_D[2]) * r + PROBIT_D[3]) * r + 1)
    );
  }

  if (q > 1 - PROBIT_TAIL_BREAK) {
    const r = Math.sqrt(-2 * Math.log(1 - q));
    return -(
      (((((PROBIT_C[0] * r + PROBIT_C[1]) * r + PROBIT_C[2]) * r + PROBIT_C[3]) * r + PROBIT_C[4]) * r + PROBIT_C[5]) /
      ((((PROBIT_D[0] * r + PROBIT_D[1]) * r + PROBIT_D[2]) * r + PROBIT_D[3]) * r + 1)
    );
  }

  const r = q - 0.5;
  const s = r * r;
  return (
    ((((((PROBIT_A[0] * s + PROBIT_A[1]) * s + PROBIT_A[2]) * s + PROBIT_A[3]) * s + PROBIT_A[4]) * s + PROBIT_A[5]) * r) /
    (((((PROBIT_B[0] * s + PROBIT_B[1]) * s + PROBIT_B[2]) * s + PROBIT_B[3]) * s + PROBIT_B[4]) * s + 1)
  );
}

/**
 * A standard-normal deviate pool, built once as the exact stratified quantiles of N(0,1).
 *
 * Drawing a normal costs one `Math.random()` and one array read — the same price as the old
 * estimator's coin flip — which is what keeps a 180-attempt board generation inside its old time
 * budget while drawing ~2x as many variates per trial. Because the pool *is* the quantile grid its
 * moments are exact rather than sampled, so it introduces no bias of its own; the only cost is
 * discretisation at 1/16384 of the distribution, far below the Monte Carlo noise floor at
 * 2,500 trials.
 */
const NORMAL_POOL_SIZE = 16_384;
const NORMAL_POOL = (() => {
  const pool = new Float64Array(NORMAL_POOL_SIZE);
  for (let index = 0; index < NORMAL_POOL_SIZE; index += 1) {
    pool[index] = probit((index + 0.5) / NORMAL_POOL_SIZE);
  }
  return pool;
})();

// --- Calibration constants ---------------------------------------------------------------------
// `systematic` is the share of a square's outcome the game state explains: 1 means the square is a
// deterministic function of the factors, 0 means the factors say nothing about it. The correlation
// this model produces between two squares is
// `systematic_a × systematic_b × (unit exposure_a · unit exposure_b)`, so the comment on each line
// below states the pairing it was chosen to reproduce.

/**
 * Moneyline / spread / game total / team total are exact functions of the two team-score factors —
 * that is what those markets *are* under a normal scoring model. Consequences worth knowing: home
 * ML and home −3.5 come out perfectly rank-correlated (correctly nested), home ML and game-total
 * over come out uncorrelated, and home team-total over sits at 0.71 with home ML.
 */
const CORE_MARKET_SYSTEMATIC = 1;
/** Leading at the half vs. winning: ~0.7 empirically, and variance scales with elapsed game time. */
const HALFTIME_SYSTEMATIC = numberFromEnv(process.env.BINGO_CORR_HALFTIME_SYSTEMATIC, 0.7);
/** One quarter's scoring is a noisy quarter of a team's night. */
const QUARTER_SYSTEMATIC = numberFromEnv(process.env.BINGO_CORR_QUARTER_SYSTEMATIC, 0.5);
/** "At least one quarter did X" pools four quarters, so game state explains more of it than one. */
const MULTI_QUARTER_SYSTEMATIC = numberFromEnv(process.env.BINGO_CORR_MULTI_QUARTER_SYSTEMATIC, 0.55);
/**
 * A player's over/under vs. their own team total lands near 0.53 with these numbers, and two props
 * on the same player near 0.49 — both in the empirical range for NFL skill-position props.
 */
const PLAYER_PROP_SYSTEMATIC = numberFromEnv(process.env.BINGO_CORR_PLAYER_PROP_SYSTEMATIC, 0.7);
/** Split of a player square's systematic part between "his team scored" and "he had a night". */
const PLAYER_TEAM_LOAD = numberFromEnv(process.env.BINGO_CORR_PLAYER_TEAM_LOAD, 0.75);
const PLAYER_SELF_LOAD = numberFromEnv(process.env.BINGO_CORR_PLAYER_SELF_LOAD, 0.66);
/** Scoring *a* touchdown is chunkier and more random than clearing a yardage line. */
const TOUCHDOWN_SYSTEMATIC = numberFromEnv(process.env.BINGO_CORR_TOUCHDOWN_SYSTEMATIC, 0.55);
/** Being the game's *first* scorer is mostly a coin flip among the field. */
const FIRST_TOUCHDOWN_SYSTEMATIC = numberFromEnv(process.env.BINGO_CORR_FIRST_TD_SYSTEMATIC, 0.4);
/** Milestone/achievement squares (NBA double-doubles, MLB events) sit between props and noise. */
const ACHIEVEMENT_SYSTEMATIC = numberFromEnv(process.env.BINGO_CORR_ACHIEVEMENT_SYSTEMATIC, 0.5);
/** Team-level achievement counts (rebounds, 3pt scorers, players who scored) track team output. */
const TEAM_ACHIEVEMENT_SYSTEMATIC = numberFromEnv(process.env.BINGO_CORR_TEAM_ACHIEVEMENT_SYSTEMATIC, 0.6);
/** Play-shape squares (a defensive TD, a fourth-down conversion) are nearly pure noise. */
const PLAY_EVENT_SYSTEMATIC = numberFromEnv(process.env.BINGO_CORR_PLAY_EVENT_SYSTEMATIC, 0.25);

/**
 * A square counts toward the per-line directional cap only when the game state explains at least
 * this much of it. The default admits the (near-)deterministic squares — every core market, the
 * margin bands, overtime, both-teams-score — and deliberately leaves out player props and halftime
 * leaders at 0.7.
 *
 * That exclusion is the point, not an oversight. Two props on the same directional bet correlate at
 * ~0.28 under this model, which the estimator already prices correctly; counting them would make
 * the cap bind on almost every arrangement and push generation onto its fallback, which would leave
 * the cap doing nothing for the core-market stacks it exists to catch.
 */
const DIRECTION_MIN_SYSTEMATIC = numberFromEnv(process.env.BINGO_CORR_DIRECTION_MIN_SYSTEMATIC, 0.8);

/**
 * The correlation cap the plan calls for: how many squares on one five-square line may share a
 * single directional bet. Four aligned squares plus the free centre is how a "25%" board silently
 * becomes a 45% board, so the default admits at most three.
 */
export const LINE_MAX_SAME_DIRECTION = Math.max(
  1,
  Math.round(numberFromEnv(process.env.BINGO_LINE_MAX_SAME_DIRECTION, 3))
);

// --- Exposures ---------------------------------------------------------------------------------

export type SquareExposure = {
  /** Loading on the home team's scoring factor. Negative means the square wants the home team quiet. */
  home: number;
  away: number;
  /** Loading on the closeness factor. Positive means the square wants a tight game. */
  close: number;
  /** Loading on this square's own player factor. */
  player: number;
  /** Identity of that player factor; `null` for squares with no single owner. */
  playerKey: string | null;
  /** 0..1 — how much of the square the factors above explain. */
  systematic: number;
};

const NO_EXPOSURE: SquareExposure = { home: 0, away: 0, close: 0, player: 0, playerKey: null, systematic: 0 };

type ExposureInput = {
  home?: number;
  away?: number;
  close?: number;
  player?: number;
  playerKey?: string | null;
  systematic: number;
};

function exposure(input: ExposureInput): SquareExposure {
  return {
    home: input.home ?? 0,
    away: input.away ?? 0,
    close: input.close ?? 0,
    player: input.player ?? 0,
    playerKey: input.playerKey ?? null,
    systematic: clamp(input.systematic, 0, 1),
  };
}

/** A bet on `team` outscoring its opponent: the margin direction. */
function marginLoad(team: TeamSide, weight = 1): { home: number; away: number } {
  return team === "home" ? { home: weight, away: -weight } : { home: -weight, away: weight };
}

/** A bet on `team`'s own scoring, indifferent to the opponent. */
function teamLoad(team: TeamSide, weight = 1): { home: number; away: number } {
  return team === "home" ? { home: weight, away: 0 } : { home: 0, away: weight };
}

/**
 * A player square's team loading. When the builder could not tell us which side the player is on,
 * the load is split evenly across both teams — the same total magnitude, pointed at "this game is
 * an offensive one" instead of "his team is". That understates the prop-vs-team-total correlation
 * and is the one place this model knowingly leaves realism on the table; see the module docstring's
 * calibration note and the plan's Phase 5 handoff.
 */
function playerTeamLoad(team: TeamSide | null | undefined): { home: number; away: number } {
  if (team === "home" || team === "away") {
    return teamLoad(team, PLAYER_TEAM_LOAD);
  }
  const split = PLAYER_TEAM_LOAD * Math.SQRT1_2;
  return { home: split, away: split };
}

function playerKeyOf(player: string): string {
  return player.trim().toLowerCase();
}

// --- Phase 8b: how a flavor square is wired into the game state ----------------------------------
//
// A team-stat field is not automatically a scoring bet. `total_yards` is one (yards become points);
// `penalties` is not (a well-behaved team can still lose 38-3). Rather than give every Tier-1 kind
// its own case, each *field* declares how much of the team's scoring factor it loads onto and how
// much of the square the game state explains at all. That keeps a 21st field a data-only edit here
// and in `lib/sportsBingoNflFlavor.ts`, which is the whole point of the parameterised kinds.
//
// `load` is signed relative to the field going **up**: negative means a high value on this field
// goes with a *quieter* team. `systematic` is the usual 0..1 share.
const NFL_TEAM_STAT_WIRING: Record<NFLTeamStatField, { load: number; systematic: number }> = {
  // Offensive production: these are what a team total is made of.
  total_yards: { load: 1, systematic: 0.7 },
  net_passing_yards: { load: 0.85, systematic: 0.6 },
  rushing_yards: { load: 0.5, systematic: 0.4 },
  first_downs: { load: 0.9, systematic: 0.65 },
  yards_per_play: { load: 0.9, systematic: 0.6 },
  red_zone_attempts: { load: 0.9, systematic: 0.65 },
  red_zone_scores: { load: 1, systematic: 0.7 },
  third_down_conversions: { load: 0.8, systematic: 0.55 },
  // Volume without efficiency: more snaps is weakly more scoring, and strongly more clock.
  total_offensive_plays: { load: 0.4, systematic: 0.35 },
  possession_time_seconds: { load: 0.35, systematic: 0.35 },
  // Negative-for-the-offense events. A team that turns it over and gets sacked scores less.
  turnovers: { load: -0.55, systematic: 0.4 },
  sacks: { load: -0.5, systematic: 0.35 },
  // Discipline and defensive scoring: the game state says almost nothing about either.
  penalties: { load: 0, systematic: 0.1 },
  penalty_yards: { load: 0, systematic: 0.1 },
  fourth_down_conversions: { load: 0.3, systematic: 0.25 },
  defensive_touchdowns: { load: -0.3, systematic: 0.15 },
};

/**
 * A Tier-1 team square's loading. `direction` is `-1` for an at-most square. The wiring table is
 * total over `NFLTeamStatField`, so adding a field to the allowlist without wiring it here is a
 * type error rather than a silent fall-through to noise.
 */
function nflTeamStatLoad(field: NFLTeamStatField, team: TeamSide, direction: 1 | -1): ExposureInput {
  const wiring = NFL_TEAM_STAT_WIRING[field];
  const signed = wiring.load * direction;
  if (signed === 0) {
    // No scoring loading at all, but the square still exists: give it a token loading so the
    // estimator treats it as very slightly game-linked rather than as literally free noise.
    return { ...teamLoad(team, 0.15), systematic: wiring.systematic };
  }
  return { ...teamLoad(team, signed), systematic: wiring.systematic };
}

/** The game-level twin: both teams' values summed, so it loads on the total rather than one side. */
function nflCombinedTeamStatLoad(field: NFLTeamStatField, direction: 1 | -1): ExposureInput {
  const wiring = NFL_TEAM_STAT_WIRING[field];
  const signed = wiring.load * direction;
  const magnitude = signed === 0 ? 0.15 : signed;
  return { home: magnitude, away: magnitude, systematic: wiring.systematic };
}

/**
 * Tier 2 — how a "any player in this game did X" square relates to the game total.
 *
 * Positive means a high-scoring game makes it likelier. `total_tackles` and `defensive_sacks` are
 * negative on purpose: a defender piles up tackles when the *other* team runs a lot of plays and
 * does not score on them, which is a grind, not a shootout.
 */
const NFL_GAME_STAT_DIRECTION: Record<NFLPlayerStatField, number> = {
  rushing_yards: 0.5,
  receiving_yards: 0.8,
  passing_yards: 0.8,
  receptions: 0.5,
  touchdowns: 1,
  field_goals_made: 0.3,
  long_field_goal_made: 0.2,
  total_tackles: -0.4,
  defensive_sacks: -0.3,
  defensive_interceptions: -0.3,
  punts_inside_20: -0.6,
};

/**
 * How a square is wired into the game state. Pure and total: every resolver kind gets an answer, so
 * a new kind added without touching this file falls to the `default` and is treated as independent
 * noise — degraded, never wrong.
 */
export function exposureForResolver(
  resolver: SportsBingoResolver,
  teamHint: TeamSide | null = null
): SquareExposure {
  switch (resolver.kind) {
    case "free":
    case "replacement_auto":
      return NO_EXPOSURE;

    // --- Core markets: exact functions of the two team-score factors ----------------------------
    case "moneyline":
      return exposure({ ...marginLoad(resolver.team), systematic: CORE_MARKET_SYSTEMATIC });
    case "spread_more_than":
      return exposure({ ...marginLoad(resolver.team), systematic: CORE_MARKET_SYSTEMATIC });
    case "spread_keep_close":
      // "Stays within L" is satisfied by this team doing better, exactly like covering — the line
      // differs, the direction does not. (`marginBoundsForResolver` encodes the same sign.)
      return exposure({ ...marginLoad(resolver.team), systematic: CORE_MARKET_SYSTEMATIC });
    case "game_total_over":
      return exposure({ home: 1, away: 1, systematic: CORE_MARKET_SYSTEMATIC });
    case "game_total_under":
      return exposure({ home: -1, away: -1, systematic: CORE_MARKET_SYSTEMATIC });
    case "team_total_over":
      return exposure({ ...teamLoad(resolver.team), systematic: CORE_MARKET_SYSTEMATIC });
    case "team_total_under":
      return exposure({ ...teamLoad(resolver.team, -1), systematic: CORE_MARKET_SYSTEMATIC });

    // --- Player over/unders (NFL props, NBA props, MLB props) -----------------------------------
    case "player_prop": {
      const sign = resolver.direction === "under" ? -1 : 1;
      const team = playerTeamLoad(teamHint);
      return exposure({
        home: team.home * sign,
        away: team.away * sign,
        player: PLAYER_SELF_LOAD * sign,
        playerKey: playerKeyOf(resolver.player),
        systematic: PLAYER_PROP_SYSTEMATIC,
      });
    }

    // --- NFL: player milestones ------------------------------------------------------------------
    case "nfl_player_anytime_td": {
      const team = playerTeamLoad(teamHint);
      return exposure({
        home: team.home,
        away: team.away,
        player: PLAYER_SELF_LOAD,
        playerKey: playerKeyOf(resolver.player),
        systematic: TOUCHDOWN_SYSTEMATIC,
      });
    }
    case "nfl_player_first_td": {
      const team = playerTeamLoad(teamHint);
      return exposure({
        home: team.home,
        away: team.away,
        player: PLAYER_SELF_LOAD,
        playerKey: playerKeyOf(resolver.player),
        systematic: FIRST_TOUCHDOWN_SYSTEMATIC,
      });
    }

    // --- NFL: team, quarter and shape squares ---------------------------------------------------
    case "nfl_team_scores_every_quarter":
      return exposure({ ...teamLoad(resolver.team), systematic: MULTI_QUARTER_SYSTEMATIC });
    case "nfl_team_shutout_quarter":
      // The exact complement of the square above, and wired as such.
      return exposure({ ...teamLoad(resolver.team, -1), systematic: MULTI_QUARTER_SYSTEMATIC });
    case "nfl_team_quarter_points_at_least":
      return exposure({ ...teamLoad(resolver.team), systematic: QUARTER_SYSTEMATIC });
    case "nfl_any_quarter_scoreless":
      return exposure({ home: -1, away: -1, systematic: QUARTER_SYSTEMATIC });
    case "nfl_team_leads_at_halftime":
      return exposure({ ...marginLoad(resolver.team), systematic: HALFTIME_SYSTEMATIC });
    case "nfl_halftime_leader_loses":
      // A blown halftime lead is a close-game event; nothing about who scores more says it happens.
      return exposure({ close: 1, systematic: 0.45 });
    case "nfl_overtime":
      return exposure({ close: 1, systematic: 0.8 });
    case "nfl_both_teams_score_at_least":
      // `min(home, away) ≥ N` wants a high total *and* a game that stayed competitive.
      return exposure({ home: 0.7, away: 0.7, close: 0.5, systematic: 0.85 });
    case "nfl_margin_at_most":
      return exposure({ close: 1, systematic: CORE_MARKET_SYSTEMATIC });
    case "nfl_margin_at_least":
      return exposure({ close: -1, systematic: CORE_MARKET_SYSTEMATIC });
    case "nfl_second_half_higher_scoring":
      return exposure({ home: 0.3, away: 0.3, systematic: 0.3 });

    // --- NFL Optional 3b: play-by-play squares --------------------------------------------------
    case "nfl_first_score_is_field_goal":
      // Low-scoring games stall in the red zone more often, so a field goal opens the scoring more.
      return exposure({ home: -1, away: -1, systematic: PLAY_EVENT_SYSTEMATIC });
    case "nfl_first_scorer_wins":
      return exposure({ close: -1, systematic: 0.4 });
    case "nfl_non_offensive_touchdown":
      return exposure({ home: 0.5, away: 0.5, systematic: 0.15 });
    case "nfl_fourth_down_conversion":
      return exposure({ close: 0.4, systematic: PLAY_EVENT_SYSTEMATIC });
    case "nfl_long_touchdown":
      return exposure({ home: 1, away: 1, systematic: 0.35 });

    // --- NFL Phase 8b: the flavor slate ----------------------------------------------------------
    // Every kind added by Phase 8b gets an entry here, in the same commit, because this switch's
    // `default` treats an unknown kind as independent noise — which would silently re-create the
    // exact defect Phase 5b exists to fix, for the new squares only, with the estimator still
    // reporting a confident number. `tests/lib.sportsBingoCorrelation.test.ts` asserts that no NFL
    // resolver kind falls through to the default.
    case "nfl_team_stat_at_least":
      return exposure({ ...nflTeamStatLoad(resolver.field, resolver.team, 1) });
    case "nfl_team_stat_at_most":
      return exposure({ ...nflTeamStatLoad(resolver.field, resolver.team, -1) });
    case "nfl_combined_team_stat_at_least":
      return exposure({ ...nflCombinedTeamStatLoad(resolver.field, 1) });
    case "nfl_combined_team_stat_at_most":
      return exposure({ ...nflCombinedTeamStatLoad(resolver.field, -1) });
    case "nfl_team_perfect_red_zone":
      // Converting every red-zone trip is the sharpest scoring-efficiency signal on the board for
      // one team, and it says nothing about the opponent.
      return exposure({ ...teamLoad(resolver.team), systematic: TEAM_ACHIEVEMENT_SYSTEMATIC });
    case "nfl_team_red_zone_trip_without_touchdown":
      // Its complement, and wired as such — but weaker, because a team that reaches the red zone a
      // lot has more chances to leave one empty. That partly cancels the "quiet offense" direction.
      return exposure({ ...teamLoad(resolver.team, -0.5), systematic: 0.35 });
    case "nfl_team_possession_advantage":
      // Holding the ball longer than the opponent tracks the margin (leading teams run clock) more
      // than it tracks either team's raw scoring.
      return exposure({ ...marginLoad(resolver.team, 0.6), systematic: 0.4 });

    // Tier 2 — "any player in the game did X". These load on the *total*, never on one team,
    // because the resolver genuinely does not name a side. A rate-stat square (tackles, sacks
    // taken) runs the other way: those pile up in long, grinding, low-efficiency games.
    case "nfl_game_max_stat_at_least":
    case "nfl_game_total_stat_at_least": {
      const load = NFL_GAME_STAT_DIRECTION[resolver.field];
      // `both_teams` needs each side to clear the bar, so it wants a high total *and* a game that
      // stayed competitive — the same shape as `nfl_both_teams_score_at_least`.
      const bothTeams = resolver.kind === "nfl_game_max_stat_at_least" && resolver.scope === "both_teams";
      return exposure({
        home: load,
        away: load,
        close: bothTeams ? 0.5 : 0,
        systematic: load === 0 ? 0.15 : ACHIEVEMENT_SYSTEMATIC,
      });
    }
    case "nfl_game_missed_field_goal":
      // A missed field goal needs a field goal to have been attempted, which needs drives that
      // stall — mildly a low-scoring signature, mostly noise.
      return exposure({ home: -0.4, away: -0.4, systematic: PLAY_EVENT_SYSTEMATIC });
    case "nfl_non_quarterback_pass_attempt":
      // A trick play or an emergency passer. Nothing about the game state predicts it.
      return exposure({ home: 0.2, away: 0.2, systematic: 0.1 });

    // Tier 3 — clock-and-score shape.
    case "nfl_first_score_within_minutes":
      return exposure({ home: 1, away: 1, systematic: 0.3 });
    case "nfl_score_in_final_minutes":
      // Two-minute-drill scoring is mostly about pace; the fourth-quarter version leans a little on
      // the game still mattering, which is a closeness bet.
      return exposure({
        home: 0.8,
        away: 0.8,
        close: resolver.segment === "fourth_quarter" ? 0.5 : 0,
        systematic: 0.35,
      });
    case "nfl_both_teams_lead":
      return exposure({ close: 1, systematic: 0.6 });
    case "nfl_lead_change_second_half":
      return exposure({ close: 1, systematic: 0.55 });
    case "nfl_tied_after_halftime":
      return exposure({ close: 1, systematic: 0.5 });
    case "nfl_winner_trailed_in_fourth":
      // A comeback is the closeness bet, and it is the one square on the board that is *more*
      // likely the tighter the finish — the same shape as `nfl_halftime_leader_loses`.
      return exposure({ close: 1, systematic: 0.5 });
    case "nfl_two_point_conversion":
      // Teams go for two when the score chart tells them to, which is a close-game artifact.
      return exposure({ close: 0.5, home: 0.4, away: 0.4, systematic: 0.25 });
    case "nfl_safety":
      return exposure({ home: -0.3, away: -0.3, systematic: 0.1 });
    case "nfl_goal_line_touchdown":
      return exposure({ home: 1, away: 1, systematic: 0.4 });

    // --- NBA / WNBA ------------------------------------------------------------------------------
    case "nba_player_stat_at_least": {
      const team = playerTeamLoad(teamHint);
      return exposure({
        home: team.home,
        away: team.away,
        player: PLAYER_SELF_LOAD,
        playerKey: playerKeyOf(resolver.player),
        systematic: PLAYER_PROP_SYSTEMATIC,
      });
    }
    case "nba_player_double_double":
    case "nba_player_triple_double":
    case "nba_player_triple_threat":
    case "nba_player_points_first_half_at_least":
    case "nba_player_assists_in_any_quarter_at_least":
    case "nba_player_steals_first_half_at_least":
    case "nba_player_bench_scores": {
      const team = playerTeamLoad(teamHint);
      return exposure({
        home: team.home * 0.6,
        away: team.away * 0.6,
        player: PLAYER_SELF_LOAD,
        playerKey: playerKeyOf(resolver.player),
        systematic: ACHIEVEMENT_SYSTEMATIC,
      });
    }
    case "nba_player_perfect_ft":
    case "nba_player_perfect_fg":
    case "nba_player_zero_turnovers":
      // Efficiency/absence squares run *against* volume, so a big night makes them less likely.
      return exposure({
        player: -PLAYER_SELF_LOAD,
        playerKey: playerKeyOf(resolver.player),
        systematic: 0.25,
      });
    case "nba_player_plus_minus_at_least":
      // Plus-minus is a margin bet wearing a player's name; the team is unknown here, so it leans
      // on the player factor and on the game staying uneven.
      return exposure({
        close: -0.5,
        player: PLAYER_SELF_LOAD,
        playerKey: playerKeyOf(resolver.player),
        systematic: 0.4,
      });
    case "team_triple_double":
    case "any_triple_double":
      return exposure({ home: 1, away: 1, systematic: 0.4 });
    case "nba_team_stat_at_least":
    case "nba_team_players_scored_at_least":
    case "nba_team_three_pt_scorers":
    case "nba_team_has_double_double":
      return exposure({ ...teamLoad(resolver.team), systematic: TEAM_ACHIEVEMENT_SYSTEMATIC });
    case "nba_team_turnovers_at_most":
      return exposure({ ...teamLoad(resolver.team, 0.6), systematic: 0.25 });
    case "nba_team_outrebounds":
      return exposure({ ...marginLoad(resolver.team, 0.6), systematic: 0.35 });
    case "nba_team_scores_first":
      return exposure({ ...marginLoad(resolver.team), systematic: 0.2 });
    case "nba_team_leads_at_halftime":
      return exposure({ ...marginLoad(resolver.team), systematic: HALFTIME_SYSTEMATIC });
    case "nba_team_points_in_any_quarter_at_least":
      return exposure({ ...teamLoad(resolver.team), systematic: QUARTER_SYSTEMATIC });

    // --- MLB --------------------------------------------------------------------------------------
    case "mlb_webhook_player_event_at_least": {
      const team = playerTeamLoad(teamHint);
      // A pitcher recording outs is not an offensive event; everything else on this list is.
      const sign = resolver.event === "pitcher_out" ? 0 : 1;
      return exposure({
        home: team.home * sign,
        away: team.away * sign,
        player: PLAYER_SELF_LOAD,
        playerKey: playerKeyOf(resolver.player),
        systematic: ACHIEVEMENT_SYSTEMATIC,
      });
    }
    case "mlb_webhook_player_event_at_most":
      // Pitcher-suppression squares (few earned runs, few hits allowed) want a quiet game. The
      // opposing side is unknown from the resolver, so this loads on the total, not on one team.
      return exposure({
        home: -0.5,
        away: -0.5,
        player: -PLAYER_SELF_LOAD,
        playerKey: playerKeyOf(resolver.player),
        systematic: ACHIEVEMENT_SYSTEMATIC,
      });
    case "mlb_webhook_team_event_at_least": {
      // Batting outs go the other way from batting production, on the same team.
      const isOut =
        resolver.event === "strikeout" ||
        resolver.event === "groundout" ||
        resolver.event === "flyout" ||
        resolver.event === "quick_out_under_3_pitches";
      return exposure({
        ...teamLoad(resolver.team, isOut ? -0.6 : 1),
        systematic: isOut ? 0.3 : TEAM_ACHIEVEMENT_SYSTEMATIC,
      });
    }

    default:
      return NO_EXPOSURE;
  }
}

/**
 * The directional bets a square represents, for the per-line correlation cap.
 *
 * Derived from the exposure rather than hand-listed, so the cap can never drift out of sync with
 * the model. A square that is equally a margin bet and a total bet — a team total is exactly that —
 * emits **both** signatures and counts against both caps.
 */
export function directionalSignatures(
  resolver: SportsBingoResolver,
  teamHint: TeamSide | null = null
): string[] {
  const e = exposureForResolver(resolver, teamHint);
  if (e.systematic < DIRECTION_MIN_SYSTEMATIC) {
    return [];
  }

  const margin = e.home - e.away;
  const total = e.home + e.away;
  const close = e.close;
  const scale = Math.max(Math.abs(margin), Math.abs(total), Math.abs(close));
  if (scale < 0.4) {
    return [];
  }

  const signatures: string[] = [];
  const epsilon = 1e-9;
  if (Math.abs(margin) >= scale - epsilon) {
    signatures.push(margin > 0 ? "margin+" : "margin-");
  }
  if (Math.abs(total) >= scale - epsilon) {
    signatures.push(total > 0 ? "total+" : "total-");
  }
  if (Math.abs(close) >= scale - epsilon) {
    signatures.push(close > 0 ? "close+" : "close-");
  }
  return signatures;
}

/**
 * Does every line on this board stay under the directional cap? A line whose non-free squares pile
 * `LINE_MAX_SAME_DIRECTION + 1` or more onto one directional bet is the "silently a 45% board"
 * failure mode, and is rejected.
 */
export function boardRespectsDirectionalCap(
  squares: Array<{ index: number; resolver: SportsBingoResolver; isFree: boolean; teamHint?: TeamSide | null }>,
  linePatterns: number[][]
): boolean {
  const byIndex = new Map<number, string[]>();
  for (const square of squares) {
    byIndex.set(square.index, square.isFree ? [] : directionalSignatures(square.resolver, square.teamHint ?? null));
  }

  for (const line of linePatterns) {
    const counts = new Map<string, number>();
    for (const index of line) {
      for (const signature of byIndex.get(index) ?? []) {
        const next = (counts.get(signature) ?? 0) + 1;
        if (next > LINE_MAX_SAME_DIRECTION) {
          return false;
        }
        counts.set(signature, next);
      }
    }
  }

  return true;
}

// --- The estimator -------------------------------------------------------------------------------

export type CorrelatedBoardSquare = {
  index: number;
  probability: number;
  isFree: boolean;
  resolver: SportsBingoResolver;
  teamHint?: TeamSide | null;
};

type CompiledSquare = {
  index: number;
  threshold: number;
  home: number;
  away: number;
  close: number;
  player: number;
  playerSlot: number;
  residual: number;
};

/**
 * Precompute everything that does not change across trials: the latent threshold that reproduces
 * each square's marginal probability, and its unit-normalised, systematic-scaled loadings.
 */
function compileSquares(squares: CorrelatedBoardSquare[]): {
  compiled: CompiledSquare[];
  freeIndices: number[];
  playerCount: number;
} {
  const compiled: CompiledSquare[] = [];
  const freeIndices: number[] = [];
  const playerSlots = new Map<string, number>();

  for (const square of squares) {
    if (square.isFree) {
      freeIndices.push(square.index);
      continue;
    }

    const probability = clamp(square.probability, 0, 1);
    const raw = exposureForResolver(square.resolver, square.teamHint ?? null);
    const norm = Math.hypot(raw.home, raw.away, raw.close, raw.player);
    const systematic = norm > 0 ? clamp(raw.systematic, 0, 1) : 0;
    const scale = norm > 0 ? systematic / norm : 0;

    let playerSlot = -1;
    if (raw.playerKey && raw.player !== 0) {
      const existing = playerSlots.get(raw.playerKey);
      if (existing === undefined) {
        playerSlot = playerSlots.size;
        playerSlots.set(raw.playerKey, playerSlot);
      } else {
        playerSlot = existing;
      }
    }

    compiled.push({
      index: square.index,
      // hit ⟺ z > Φ⁻¹(1 − p), which fires with probability exactly p and is increasing in z.
      threshold: probit(1 - probability),
      home: raw.home * scale,
      away: raw.away * scale,
      close: raw.close * scale,
      player: raw.player * scale,
      playerSlot,
      residual: Math.sqrt(Math.max(0, 1 - systematic * systematic)),
    });
  }

  return { compiled, freeIndices, playerCount: playerSlots.size };
}

/**
 * P(the board makes at least one line), with squares correlated through the shared game state.
 *
 * `random` is injectable so tests and the simulation harness can pin a seed; production passes
 * `Math.random`.
 */
export function estimateCorrelatedBoardWinProbability(
  squares: CorrelatedBoardSquare[],
  linePatterns: number[][],
  requestedTrials: number,
  random: () => number = Math.random
): number {
  const trials = Math.max(500, Math.min(12_000, Math.floor(requestedTrials)));
  const { compiled, freeIndices, playerCount } = compileSquares(squares);

  const boardSize = 25;
  const hits = new Uint8Array(boardSize);
  const playerFactors = new Float64Array(Math.max(1, playerCount));
  const normal = (): number => NORMAL_POOL[(random() * NORMAL_POOL_SIZE) | 0];

  let wins = 0;

  for (let trial = 0; trial < trials; trial += 1) {
    hits.fill(0);
    for (const index of freeIndices) {
      hits[index] = 1;
    }

    const zHome = normal();
    const zAway = normal();
    // The margin factor, and its closeness twin. Mapping |margin| back through the normal quantile
    // function keeps `zClose` exactly standard normal — which is what lets a margin-band square
    // keep its exact marginal — while staying monotone in how tight the game is.
    const margin = (zHome - zAway) * Math.SQRT1_2;
    const zClose = probit(clamp(2 * normalCdf(-Math.abs(margin), 0, 1), 1e-9, 1 - 1e-9));

    for (let slot = 0; slot < playerCount; slot += 1) {
      playerFactors[slot] = normal();
    }

    for (const square of compiled) {
      const systematicPart =
        square.home * zHome +
        square.away * zAway +
        square.close * zClose +
        (square.playerSlot >= 0 ? square.player * playerFactors[square.playerSlot] : 0);
      const z = systematicPart + square.residual * normal();
      if (z > square.threshold) {
        hits[square.index] = 1;
      }
    }

    for (const line of linePatterns) {
      let complete = true;
      for (const index of line) {
        if (hits[index] === 0) {
          complete = false;
          break;
        }
      }
      if (complete) {
        wins += 1;
        break;
      }
    }
  }

  return wins / trials;
}
