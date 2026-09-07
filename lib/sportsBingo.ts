import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { applyChallengeCampaignPoints } from "@/lib/challengeCampaigns";
import {
  fetchBallDontLieList,
  fetchBallDontLieJson,
  isBallDontLieConfigured,
  type BallDontLieFailureBox,
} from "@/lib/ballDontLieClient";
import {
  buildNFLMarketModel,
  fetchNFLOddsConsensus,
  fetchNFLPlayerPropMarkets,
  impliedProbabilityFromAmericanOdds,
  nflHalftimeLeaderLosesProbability,
  shadeByTotal,
  NFL_CORE_MILESTONE_PROP_TYPES,
  NFL_CORE_OVER_UNDER_PROP_TYPES,
  NFL_FIRST_SCORE_IS_FIELD_GOAL_BASE,
  NFL_FIRST_SCORER_WINS_BASE,
  NFL_FOURTH_DOWN_CONVERSION_BASE,
  NFL_LONG_TOUCHDOWN_BASE,
  NFL_NON_OFFENSIVE_TD_BASE,
  NFL_PLAY_BY_PLAY_MILESTONE_PROP_TYPES,
  NFL_SECOND_HALF_HIGHER_BASE,
  fetchMLBPlayerPropMarkets,
  MLB_CORE_PLAYER_PROP_MARKET_KEYS,
  type MLBPlayerPropMarket,
  type NFLMarketModel,
  type NFLPlayerPropMarket,
} from "@/lib/sportsBingoOdds";
import {
  boardRespectsDirectionalCap,
  estimateCorrelatedBoardWinProbability,
} from "@/lib/sportsBingoCorrelation";
import {
  assignNFLStarTiers,
  computeNFLStarScore,
  resolveNFLStarIndex,
  summarizeNFLStarMarketSignal,
  NFL_STAR_MAX_STAR_SLOTS,
  NFL_STAR_MIN_NON_STAR_SLOTS,
  NFL_STAR_TIER_BOOST,
  type NFLSeasonStarIndexEntry,
  type NFLSeasonStarIndexPair,
  type NFLStarTier,
} from "@/lib/sportsBingoNflStars";
import {
  assignMLBStarTiers,
  computeMLBStarScore,
  resolveMLBStarIndex,
  summarizeMLBStarMarketSignal,
  MLB_BRAND_NAME_KEYS,
  MLB_STAR_MAX_STAR_SLOTS,
  MLB_STAR_MIN_NON_STAR_SLOTS,
  MLB_STAR_TIER_BOOST,
  type MLBSeasonStarIndexPair,
  type MLBStarTier,
} from "@/lib/sportsBingoMlbStars";
import {
  buildMlbTeamEventRungs,
  predictMlbTeamEventRate,
  type MeasuredMlbTeamEvent,
} from "@/lib/mlbTeamEventRates";
import {
  buildNFLFlavorSquares,
  describeNFLCombinedTeamStat,
  describeNFLPlayerStatMax,
  describeNFLPlayerStatTotal,
  describeNFLTeamStat,
  isNFLPlayerStatField,
  isNFLTeamStatField,
  isNFLTeamStatsResolver,
  nflFlavorTeamSide,
  NFL_MONOTONE_TEAM_STAT_FIELDS,
  NFL_TEAM_STAT_FIELDS,
  type NFLPlayerStatField,
  type NFLTeamStatField,
} from "@/lib/sportsBingoNflFlavor";
import {
  buildNflLiveStatBroadcastPlan,
  NFL_LIVE_STAT_SPORT_KEY,
  type NflLiveStatTotals,
} from "@/lib/sportsBingoLiveEvents";
import {
  isNFLPlayerInactive,
  resolveNFLInjuryIndex,
  NFL_INJURY_INDEX_LIVE_STALENESS_MS,
  type NFLInjuryIndex,
} from "@/lib/sportsBingoNflInjuries";

const DEFAULT_SPORT_KEY = "basketball_nba";
const BINGO_REWARD_POINTS = Number.parseInt(process.env.BINGO_REWARD_POINTS ?? "50", 10);
/**
 * Phase 5a of docs/prop-bingo-nfl-plan.md — the target realized win rate, 0.20-0.30 with the
 * tolerance below. It applies to **every** league (plan decision 1), so NBA/WNBA/MLB boards get
 * harder alongside NFL; cards already issued keep the boards they were dealt.
 *
 * This number only means what the estimator measuring it means. It moved from 0.42 to 0.25 in the
 * same change that replaced the independent-coin-flip estimator with the correlated one in
 * `lib/sportsBingoCorrelation.ts` — the old 0.42 was a statement about a model that assumed 24
 * independent squares, and is not comparable. Do not "restore" 0.42 by itself.
 */
const BOARD_TARGET_WIN_RATE = Number.parseFloat(process.env.BINGO_BOARD_TARGET_WIN_RATE ?? "0.25");
const BOARD_TARGET_TOLERANCE = Number.parseFloat(process.env.BINGO_BOARD_TARGET_TOLERANCE ?? "0.05");
const BOARD_SIMULATION_TRIALS = Number.parseInt(process.env.BINGO_BOARD_SIM_TRIALS ?? "2500", 10);
/**
 * Phase 5b of docs/prop-bingo-nfl-plan.md — the probability band a **core market** square (spread,
 * game total, team total) has to sit in to be worth a board slot.
 *
 * The ladders those buckets are built from step out to ±14 points, so their outer rungs land at
 * 85-93% ("Cowboys: under 35.5 points") or the mirror image at 7-15%. Both are dead weight: one is
 * a free square wearing a market's clothes, the other is a square nobody can win. The high rungs
 * are the ones that matter, because five of them on a line is a board that pays out constantly.
 *
 * This is a **preference inside `pickCandidateSet`, not a filter on the candidate list** — the
 * templates endpoint still shows the full ladder, and a bucket that cannot be filled from the band
 * falls back to the rungs outside it rather than shrinking the board.
 */
const CORE_SQUARE_MIN_PROBABILITY = Number.parseFloat(process.env.BINGO_CORE_SQUARE_MIN_PROBABILITY ?? "0.18");
const CORE_SQUARE_MAX_PROBABILITY = Number.parseFloat(process.env.BINGO_CORE_SQUARE_MAX_PROBABILITY ?? "0.82");

/**
 * Logistic scales for the **market-free** probability ladders — the path every league except NFL
 * still takes, since only NFL has a Phase 2 market model. A scale `s` corresponds to a standard
 * deviation of `s·π/√3 ≈ 1.814s` in the underlying quantity.
 *
 * The default trio (3.2 / 8.5 / 7.8) is basketball-shaped and was being applied to baseball too:
 * 7.8 on a team's runs implies a standard deviation of **14 runs**, against a real MLB figure of
 * about 3. That is not a conservative choice, it is a 4.7x error, and it is why every MLB ladder
 * rung came out between 0.38 and 0.62 — a pool with no hard squares in it, from which no 25% board
 * can be built. Phase 5 found it while chasing ask #4 across all leagues (plan decision 1).
 *
 * The MLB values below are derived from published run distributions (team runs σ ≈ 3.1, game total
 * and margin σ ≈ 4.4) rather than picked to hit a win rate. NBA/WNBA keep the old numbers, which
 * are roughly right for their sport — this is deliberately a per-sport correction, not a retune.
 *
 * **These are still hand-derived, not market-derived.** The real fix is a Phase-2-style odds
 * consensus for MLB; see the Phase 5 handoff notes.
 */
const MARKET_FREE_SPREAD_SCALE = { default: 3.2, baseball_mlb: 2.43 } as const;
const MARKET_FREE_GAME_TOTAL_SCALE = { default: 8.5, baseball_mlb: 2.43 } as const;
const MARKET_FREE_TEAM_TOTAL_SCALE = { default: 7.8, baseball_mlb: 1.71 } as const;
const MAX_ACTIVE_CARDS_PER_USER = 4;
const ACTIVE_CARD_SLOT_BUFFER_HOURS = 6;
const cacheMsInWindow = (raw: string | undefined, fallback: number, min: number, max: number): number => {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
};
// Keep catalogs warm enough to reduce repeated provider calls while still refreshing quickly.
const GAME_CATALOG_CACHE_MS = cacheMsInWindow(process.env.BINGO_GAME_CATALOG_CACHE_MS, 90_000, 60_000, 90_000);
// Score snapshots are short-lived to support near-real-time grading without thrashing.
const SCORE_CACHE_MS = cacheMsInWindow(process.env.BINGO_SCORE_CACHE_MS, 30_000, 20_000, 30_000);
// Webhook bursts are common; debounce invalidations to a bounded 10–15s window.
const CACHE_INVALIDATION_THROTTLE_MS = cacheMsInWindow(
  process.env.BINGO_CACHE_INVALIDATION_THROTTLE_MS,
  12_000,
  10_000,
  15_000
);
const BINGO_FORCE_FINALIZE_AFTER_START_MS = 12 * 60 * 60 * 1000;
const BINGO_ALLOW_POSSIBLE_SQUARES = String(process.env.BINGO_ALLOW_POSSIBLE_SQUARES ?? "")
  .trim()
  .toLowerCase() === "true";
// Exported for tests/lib.sportsBingo.nba-fetch-failure.test.ts, which proves the two TTLs are
// actually different at the cache rather than hardcoding a duplicate of either value.
export const NBA_PLAYER_STATS_CACHE_MS = 5_000;
/**
 * The negative TTL for an NBA/WNBA snapshot answer where at least one of the five
 * `getNBAGamePlayerStatsSnapshot` fetches failed (network error or non-OK response), rather than
 * legitimately returning nothing. Same reasoning as `SEASON_STATUS_FAILURE_CACHE_MS`: a failure and
 * a real answer must not share a TTL, or one bad provider blip locks a card out of grading for the
 * whole cache window. Phase 2b of docs/bingo-correctness-and-wnba-repair-plan.md.
 */
export const NBA_PLAYER_STATS_FAILURE_CACHE_MS = 1_000;
/**
 * Phase 3 of docs/prop-bingo-nfl-activation-plan.md — how long an NFL game's previous-sweep box
 * score is kept in memory after the last sweep that touched it. Long enough that a quiet stretch
 * (a long injury timeout, halftime) never loses the baseline; short enough that a finished Sunday
 * slate is not still resident when the Monday night game starts.
 */
const NFL_LIVE_STAT_STATE_TTL_MS = 6 * 60 * 60 * 1_000;
/**
 * `/nfl/v1/plays` caps `per_page` at 100 and a regulation game runs ~150-180 plays, so four pages
 * covers a long overtime game with headroom while still bounding the walk — this runs on a
 * 1-minute cron against a paid provider (plan handoff note 9).
 */
const NFL_PLAYS_MAX_PAGES = 4;
const BALLDONTLIE_GAME_LOOKUP_WINDOW_DAYS_RAW = Number.parseInt(
  process.env.BALLDONTLIE_GAME_LOOKUP_WINDOW_DAYS ?? "1",
  10
);
const BALLDONTLIE_GAME_LOOKUP_WINDOW_DAYS = Number.isFinite(BALLDONTLIE_GAME_LOOKUP_WINDOW_DAYS_RAW)
  ? Math.max(0, BALLDONTLIE_GAME_LOOKUP_WINDOW_DAYS_RAW)
  : 1;
const BINGO_LOOKAHEAD_HOURS = 36;
const BINGO_PLAYER_SPECIFIC_HARD_FLOOR = 8;
const MLB_LATE_SCRATCH_SWAP_WINDOW_MS_RAW = Number.parseInt(process.env.BINGO_MLB_LATE_SCRATCH_WINDOW_MS ?? "1800000", 10);
const MLB_LATE_SCRATCH_SWAP_WINDOW_MS = Number.isFinite(MLB_LATE_SCRATCH_SWAP_WINDOW_MS_RAW)
  ? Math.max(60_000, MLB_LATE_SCRATCH_SWAP_WINDOW_MS_RAW)
  : 1_800_000;
// NFL inactives post ~90 minutes before kickoff, so the late-scratch swap window opens wider than
// MLB's 30 minutes — default 150 minutes either side of the start (and the same span after card
// creation, mirroring MLB's `inLockWindow`).
const NFL_LATE_SCRATCH_SWAP_WINDOW_MS_RAW = Number.parseInt(process.env.BINGO_NFL_LATE_SCRATCH_WINDOW_MS ?? "9000000", 10);
const NFL_LATE_SCRATCH_SWAP_WINDOW_MS = Number.isFinite(NFL_LATE_SCRATCH_SWAP_WINDOW_MS_RAW)
  ? Math.max(60_000, NFL_LATE_SCRATCH_SWAP_WINDOW_MS_RAW)
  : 9_000_000;
const wnbaConfigNumber = (raw: string | undefined, fallback: number): number => {
  const parsed = Number.parseFloat(raw ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
};
const WNBA_CALIBRATION = {
  tripleDoubleBase: wnbaConfigNumber(process.env.BINGO_WNBA_TRIPLE_DOUBLE_BASE, 0.02),
  tripleDoubleSlope: wnbaConfigNumber(process.env.BINGO_WNBA_TRIPLE_DOUBLE_SLOPE, 0.05),
  tripleDoubleMax: wnbaConfigNumber(process.env.BINGO_WNBA_TRIPLE_DOUBLE_MAX, 0.12),
  anyTripleDoubleMax: wnbaConfigNumber(process.env.BINGO_WNBA_ANY_TRIPLE_DOUBLE_MAX, 0.18),
  averageHomeSpread: wnbaConfigNumber(process.env.BINGO_WNBA_AVERAGE_HOME_SPREAD, -2.5),
  averageTotal: wnbaConfigNumber(process.env.BINGO_WNBA_AVERAGE_TOTAL, 168),
  achievementThresholdScale: wnbaConfigNumber(process.env.BINGO_WNBA_ACHIEVEMENT_THRESHOLD_SCALE, 0.82),
};
/**
 * Phase 9d — the same eleven names, but no longer a second hardcoded copy.
 *
 * This set used to live here as a bare literal and did two jobs at once: it produced the branded
 * `mlb_star_hr:` square ("Aaron Judge HR", with its own label and late-scratch handling) *and* it
 * applied a flat 1.45x draw boost in `pickCandidateSet`. The second job is now done properly by the
 * self-updating star index (`lib/sportsBingoMlbStars.ts`), so what remains here is only the
 * labeling feature — reading `MLB_BRAND_NAME_KEYS`, which is derived from the reviewed, dated
 * `MLB_BRAND_NAME_BONUS` table, so the branded square and the star bonus can never drift apart.
 */
const MLB_STAR_BRANDED_PLAYER_KEYS = MLB_BRAND_NAME_KEYS;
const SPORTS_BINGO_MIGRATION_REQUIRED_ERROR =
  "Sports Bingo tables are not installed in this Supabase project yet. Run migration supabase/migrations/20260420113000_add_sports_bingo_tables.sql.";


const PLAYER_PROP_MARKET_LABELS: Record<string, string> = {
  // NBA
  player_points: "points",
  player_rebounds: "rebounds",
  player_assists: "assists",
  player_threes: "made 3-pointers",
  player_blocks: "blocks",
  player_steals: "steals",
  player_turnovers: "turnovers",
  // NFL — legacy Odds-API-style keys, kept only so an old stored resolver still renders a label.
  // New NFL squares use balldontlie's own `prop_type` values, listed below.
  player_pass_tds: "passing touchdowns",
  player_pass_yds: "passing yards",
  player_pass_attempts: "pass attempts",
  player_pass_completions: "completions",
  player_pass_interceptions: "interceptions",
  player_rush_yds: "rushing yards",
  player_rush_attempts: "rushing attempts",
  player_rush_tds: "rushing touchdowns",
  player_receptions: "receptions",
  player_reception_yds: "receiving yards",
  player_reception_tds: "receiving touchdowns",
  // NFL — balldontlie `/nfl/v1/odds/player_props` prop types (Phase 3). Singular, because
  // `pluralizeUnit` appends the "s" whenever the line is not exactly 1.
  passing_yards: "passing yard",
  passing_tds: "passing touchdown",
  passing_attempts: "pass attempt",
  passing_completions: "completion",
  interceptions: "interception thrown",
  rushing_yards: "rushing yard",
  rushing_attempts: "rushing attempt",
  receptions: "reception",
  receiving_yards: "receiving yard",
  rushing_receiving_yards: "rushing + receiving yard",
  // `longest_*` never reads well as "N <unit>s" — see NFL_LONGEST_PROP_PHRASES for their phrasing.
  longest_rush: "yard",
  longest_reception: "yard",
  fg_made: "field goal",
  kicking_points: "kicking point",
  // MLB
  player_hits: "hits",
  player_home_runs: "home runs",
  player_rbis: "RBIs",
  player_runs: "runs scored",
  player_stolen_bases: "stolen bases",
  player_strikeouts_pitcher: "pitcher strikeouts",
  player_earned_runs: "earned runs allowed",
  player_pitcher_outs: "pitcher outs recorded",
};

/**
 * "Longest rush / longest reception" squares read as gibberish through the generic
 * "<player>: at least N <unit>s" template ("at least 21 yard on his longest rushs"), so they get
 * their own phrasing keyed by direction.
 */
const NFL_LONGEST_PROP_PHRASES: Record<string, { over: (n: string) => string; under: (n: string) => string }> = {
  longest_rush: {
    over: (n) => `breaks off a run of ${n}+ yards.`,
    under: (n) => `is held under ${n} yards on his longest run.`,
  },
  longest_reception: {
    over: (n) => `hauls in a catch of ${n}+ yards.`,
    under: (n) => `is held under ${n} yards on his longest catch.`,
  },
};

const NBA_SETTLABLE_PLAYER_PROP_MARKETS = new Set([
  "player_points",
  "player_rebounds",
  "player_assists",
  "player_steals",
  "player_blocks",
  "player_threes",
  "player_turnovers",
  "player_points_rebounds",
  "player_points_assists",
  "player_rebounds_assists",
  "player_points_rebounds_assists",
]);

/**
 * MLB player-prop markets an MLB box score can grade.
 *
 * Phase 9d pointed this at `MLB_CORE_PLAYER_PROP_MARKET_KEYS` — the values of the
 * `prop_type -> marketKey` table the repaired feed parses through — rather than restating a list,
 * the same "what we offer and what we can settle cannot drift apart" discipline
 * `NFL_SETTLABLE_PLAYER_PROP_MARKETS` already used. That also closes a real gap: the hand-written
 * list this replaces omitted `player_stolen_bases`, `player_earned_runs` and `player_pitcher_outs`,
 * all three of which `getMLBPlayerPropValue` below has always been able to grade, so a square built
 * on one of them by the historical-stats path would have voided at settlement for no reason.
 */
const MLB_SETTLABLE_PLAYER_PROP_MARKETS = MLB_CORE_PLAYER_PROP_MARKET_KEYS;

/**
 * NFL over/under prop types that a `/nfl/v1/stats` box score can grade. This is exactly
 * `NFL_CORE_OVER_UNDER_PROP_TYPES` from lib/sportsBingoOdds.ts — imported rather than re-listed so
 * the "what we offer" and "what we can settle" sets cannot drift apart.
 */
const NFL_SETTLABLE_PLAYER_PROP_MARKETS = NFL_CORE_OVER_UNDER_PROP_TYPES;

const SUPPORT_LEVEL_LABEL: Record<SquareSupportLevel, string> = {
  supported: "SUPPORTED",
  possible: "POSSIBLE",
};

const NBA_PLAYER_MILESTONE_METRIC_LABELS: Record<NBAPlayerMilestoneMetric, string> = {
  points: "points",
  rebounds: "rebounds",
  assists: "assists",
  steals: "steals",
  blocks: "blocks",
  threes: "made 3-pointers",
  offensive_rebounds: "offensive rebounds",
  free_throws_made: "made free throws",
  defensive_rebounds: "defensive rebounds",
  two_point_fg: "made 2-point FGs",
  minutes_played: "minutes played",
};

type TeamSide = "home" | "away";
type CandidateBucket = "moneyline" | "spread" | "total" | "team-total" | "player-prop" | "special" | "achievement";
type CardStatus = "active" | "won" | "lost" | "canceled";
type SquareStatus = "pending" | "hit" | "miss" | "void" | "replaced";
type PlayerPropDirection = "over" | "under";
export type SquareSupportLevel = "supported" | "possible";
type NBAPlayerMilestoneMetric =
  | "points"
  | "rebounds"
  | "assists"
  | "steals"
  | "blocks"
  | "threes"
  | "offensive_rebounds"
  | "free_throws_made"
  | "defensive_rebounds"
  | "two_point_fg"
  | "minutes_played";
type NBATeamMilestoneMetric =
  | "points"
  | "blocks"
  | "steals"
  | "made_threes"
  | "offensive_rebounds"
  | "field_goal_pct"
  | "free_throw_pct"
  | "total_rebounds"
  | "total_assists";

// Exported as a **type only** so `lib/sportsBingoCorrelation.ts` can describe a square's exposure
// without importing this module's runtime — `import type` is erased, so there is no cycle even
// though this file imports that one for values.
export type SportsBingoResolver =
  | { kind: "free" }
  | { kind: "moneyline"; team: TeamSide }
  | { kind: "spread_more_than"; team: TeamSide; line: number }
  | { kind: "spread_keep_close"; team: TeamSide; line: number }
  | { kind: "game_total_over"; line: number }
  | { kind: "game_total_under"; line: number }
  | { kind: "team_total_over"; team: TeamSide; line: number }
  | { kind: "team_total_under"; team: TeamSide; line: number }
  | { kind: "player_prop"; marketKey: string; player: string; line: number; direction: PlayerPropDirection }
  | { kind: "nba_player_stat_at_least"; player: string; metric: NBAPlayerMilestoneMetric; threshold: number }
  | { kind: "nba_player_double_double"; player: string }
  | { kind: "team_triple_double"; team: TeamSide }
  | { kind: "any_triple_double" }
  | { kind: "nba_team_stat_at_least"; team: TeamSide; metric: NBATeamMilestoneMetric; threshold: number }
  | { kind: "nba_team_players_scored_at_least"; team: TeamSide; threshold: number }
  | { kind: "nba_player_triple_double"; player: string }
  | { kind: "nba_player_perfect_ft"; player: string }
  | { kind: "nba_player_perfect_fg"; player: string }
  | { kind: "nba_player_triple_threat"; player: string }
  | { kind: "nba_player_zero_turnovers"; player: string }
  | { kind: "nba_player_plus_minus_at_least"; player: string; threshold: number }
  | { kind: "nba_team_has_double_double"; team: TeamSide }
  | { kind: "nba_team_three_pt_scorers"; team: TeamSide; threshold: number }
  | { kind: "nba_team_turnovers_at_most"; team: TeamSide; threshold: number }
  | { kind: "nba_team_outrebounds"; team: TeamSide }
  | { kind: "nba_player_bench_scores"; player: string; threshold: number }
  | { kind: "nba_team_scores_first"; team: TeamSide }
  | { kind: "nba_team_leads_at_halftime"; team: TeamSide }
  | { kind: "nba_team_points_in_any_quarter_at_least"; team: TeamSide; threshold: number }
  | { kind: "nba_player_points_first_half_at_least"; player: string; threshold: number }
  | { kind: "nba_player_assists_in_any_quarter_at_least"; player: string; threshold: number }
  | { kind: "nba_player_steals_first_half_at_least"; player: string; threshold: number }
  | {
      kind: "mlb_webhook_player_event_at_least";
      player: string;
      event: "hit" | "home_run" | "strikeout" | "walk" | "hit_by_pitch" | "rbi" | "stolen_base" | "pitcher_out";
      threshold: number;
      currentCount?: number;
    }
  | {
      kind: "mlb_webhook_player_event_at_most";
      player: string;
      event: "strikeout" | "earned_run" | "hit_allowed";
      threshold: number;
      currentCount?: number;
    }
  | {
      kind: "mlb_webhook_team_event_at_least";
      team: TeamSide;
      event: "groundout" | "flyout" | "strikeout" | "walk" | "hit_by_pitch" | "hit" | "home_run" | "quick_out_under_3_pitches";
      threshold: number;
      currentCount?: number;
    }
  // --- Phase 3 of docs/prop-bingo-nfl-plan.md: the NFL square family ---------------------------
  // Player over/under props deliberately reuse the existing `player_prop` kind above rather than
  // adding an `nfl_player_prop` twin (see the plan's Phase 3 as-built notes): the shape is
  // identical, and reusing it inherits the over/under mutual-exclusion rule, the axis/market
  // diversity caps and the label builder for free. NFL prop types (`passing_yards`, `receptions`,
  // …) do not collide with the NBA/MLB `player_*` market keys, and `evaluateResolver` already
  // branches on `snapshot.sportKey`.
  //
  // Everything below is a shape the existing kinds cannot express.
  /** Milestone (single-price) market: did this player score a touchdown at all. */
  | { kind: "nfl_player_anytime_td"; player: string }
  /** Optional 3b: the first touchdown of the game, which needs play ordering from `/nfl/v1/plays`. */
  | { kind: "nfl_player_first_td"; player: string }
  /** Team puts points on the board in all four quarters. */
  | { kind: "nfl_team_scores_every_quarter"; team: TeamSide }
  /** Team is held scoreless in at least one quarter — the exact complement of the square above. */
  | { kind: "nfl_team_shutout_quarter"; team: TeamSide }
  /** Team scores `threshold`+ points in at least one quarter. */
  | { kind: "nfl_team_quarter_points_at_least"; team: TeamSide; threshold: number }
  /** At least one quarter ends with neither team having scored in it. */
  | { kind: "nfl_any_quarter_scoreless" }
  /** Team is ahead at the half (a tie is a miss, not a void — "leads" means leads). */
  | { kind: "nfl_team_leads_at_halftime"; team: TeamSide }
  /** Whoever led at halftime does not win. Voids when the game is tied at the half. */
  | { kind: "nfl_halftime_leader_loses" }
  | { kind: "nfl_overtime" }
  /** Both teams reach `threshold` points. */
  | { kind: "nfl_both_teams_score_at_least"; threshold: number }
  /** Final winning margin, either direction, is at most `line` (half-point line, so no push). */
  | { kind: "nfl_margin_at_most"; line: number }
  /** Final winning margin, either direction, is at least `line`. */
  | { kind: "nfl_margin_at_least"; line: number }
  /** Combined second-half points exceed combined first-half points. */
  | { kind: "nfl_second_half_higher_scoring" }
  // Optional 3b — these grade off `/nfl/v1/plays`, confirmed on our tier in Phase 0 §2.
  | { kind: "nfl_first_score_is_field_goal" }
  /** Whichever team scores first goes on to win. */
  | { kind: "nfl_first_scorer_wins" }
  | { kind: "nfl_non_offensive_touchdown" }
  | { kind: "nfl_fourth_down_conversion" }
  | { kind: "nfl_long_touchdown"; yards: number }
  // --- Phase 8b of docs/prop-bingo-nfl-plan.md: the flavor-square slate -------------------------
  // Parameterised **by source, not by square**: twenty of the Tier-1 candidates are "a team-stat
  // field cleared a threshold", so they collapse into two kinds with one `evaluateResolver` case,
  // one label template and one correlation exposure each — and a 21st square becomes a data-only
  // edit in `lib/sportsBingoNflFlavor.ts`. `field` is validated against an allowlist at parse time,
  // so a typo in a persisted resolver can never reach the grader as a silently-zero field.
  //
  // Tier 1 — `/nfl/v1/team_stats`, the one family that costs a new request per slate.
  | { kind: "nfl_team_stat_at_least"; team: TeamSide; field: NFLTeamStatField; threshold: number }
  | { kind: "nfl_team_stat_at_most"; team: TeamSide; field: NFLTeamStatField; threshold: number }
  | { kind: "nfl_combined_team_stat_at_least"; field: NFLTeamStatField; threshold: number }
  | { kind: "nfl_combined_team_stat_at_most"; field: NFLTeamStatField; threshold: number }
  /** Every red-zone trip finished as a touchdown, over at least `minTrips` trips. */
  | { kind: "nfl_team_perfect_red_zone"; team: TeamSide; minTrips: number }
  /**
   * At least one red-zone trip did not end in a touchdown. Named for what `red_zone_attempts >
   * red_zone_scores` actually measures — it also fires on a red-zone turnover or failed downs, not
   * only on a field goal (8a Q3).
   */
  | { kind: "nfl_team_red_zone_trip_without_touchdown"; team: TeamSide }
  /** This team wins time of possession by at least `seconds`. */
  | { kind: "nfl_team_possession_advantage"; team: TeamSide; seconds: number }
  // Tier 2 — `/nfl/v1/stats`, already fetched every tick. Game-level "any player" squares, which no
  // sportsbook posts, which is exactly what keeps them from colliding with the prop block.
  | {
      kind: "nfl_game_max_stat_at_least";
      field: NFLPlayerStatField;
      threshold: number;
      /** `any_player` = one player anywhere in the game; `both_teams` = each team's best clears it. */
      scope: "any_player" | "both_teams";
    }
  /** The same field summed across every player in the game, rather than one player's best. */
  | { kind: "nfl_game_total_stat_at_least"; field: NFLPlayerStatField; threshold: number }
  /**
   * A field goal was missed by either team. Deliberately *not* "or an extra point": the box score
   * cannot tell a missed XP from a successful two-point conversion, so an XP clause would fire on a
   * made play. See `lib/sportsBingoNflFlavor.ts`.
   */
  | { kind: "nfl_game_missed_field_goal" }
  /** A pass attempt from a row whose `position_abbreviation` is not QB. */
  | { kind: "nfl_non_quarterback_pass_attempt" }
  // Tier 3 — clock-and-score arithmetic over the plays walk Phase 4 already does. No new request,
  // and gated by `BINGO_NFL_PLAY_BY_PLAY_SQUARES_ENABLED` exactly as Optional 3b is.
  | { kind: "nfl_first_score_within_minutes"; minutes: number }
  | { kind: "nfl_score_in_final_minutes"; segment: "first_half" | "fourth_quarter"; minutes: number }
  | { kind: "nfl_both_teams_lead" }
  | { kind: "nfl_lead_change_second_half" }
  | { kind: "nfl_tied_after_halftime" }
  | { kind: "nfl_winner_trailed_in_fourth" }
  | { kind: "nfl_two_point_conversion" }
  | { kind: "nfl_safety" }
  | { kind: "nfl_goal_line_touchdown"; yards: number }
  | { kind: "replacement_auto" };

type SportsBingoSquareTemplate = {
  key: string;
  label: string;
  resolver: SportsBingoResolver;
  probability: number;
  bucket: CandidateBucket;
  supportLevel?: SquareSupportLevel;
  /**
   * Which side a *player* square belongs to, when the builder knows. Phase 5b's correlated
   * estimator uses it to tie a prop to its own team's scoring instead of to the game's, which is
   * what makes "Barkley over 89.5 rushing" and "Eagles team total over" move together.
   *
   * Deliberately **not** part of `resolver`: resolvers are snapshotted into
   * `sports_bingo_squares.resolver` at card creation and read back by the grader, so widening them
   * is a persisted-shape change. This is generation-time metadata only, and a missing hint costs
   * realism, never correctness.
   */
  teamHint?: TeamSide | null;
  /**
   * Phase 9b — how recognisable the player on this square is, 0-1 (plus the capped brand bonus),
   * from `computeNFLStarScore` in lib/sportsBingoNflStars.ts. NFL player props only; `undefined`
   * on every other square and on every NFL board built before a star signal was available, which
   * is the fallback `pickCandidateSet` keys off to run its original ordering unchanged.
   *
   * Like `teamHint`, this is generation-time metadata and deliberately **not** part of `resolver`:
   * it never reaches `sports_bingo_squares.resolver`, never reaches the grader, and above all
   * never touches `probability`. A star square is likelier to be *chosen*, never easier to *win*.
   */
  starScore?: number;
};

type SportsBingoSquarePreview = {
  index: number;
  key: string;
  label: string;
  probability: number;
  isFree: boolean;
  supportLevel?: SquareSupportLevel;
};

export type SportsBingoGame = {
  id: string;
  sportKey: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  gameLabel: string;
  isLocked: boolean;
};

export type SportsBingoBoardPreview = {
  game: SportsBingoGame;
  boardProbability: number;
  squares: SportsBingoSquarePreview[];
};

export type SportsBingoCardSquare = {
  id: string;
  index: number;
  key: string;
  label: string;
  probability: number;
  isFree: boolean;
  status: SquareStatus;
  resolvedAt?: string;
  propProgress?: { current: number; target: number; unit: string };
};

export type SportsBingoCard = {
  id: string;
  userId: string;
  venueId: string;
  gameId: string;
  gameLabel: string;
  sportKey: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  status: CardStatus;
  boardProbability: number;
  rewardPoints: number;
  rewardClaimedAt?: string;
  createdAt: string;
  settledAt?: string;
  squares: SportsBingoCardSquare[];
};

type SportsBingoCardRow = {
  id: string;
  user_id: string;
  venue_id: string;
  game_id: string;
  game_label: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  starts_at: string;
  status: CardStatus;
  board_probability: number;
  reward_points: number;
  reward_claimed_at: string | null;
  near_win_notified_at: string | null;
  won_notified_at: string | null;
  won_line: unknown;
  settled_at: string | null;
  created_at: string;
  updated_at: string | null;
  last_cron_processed_at: string | null;
};

type SportsBingoSquareRow = {
  id: string;
  card_id: string;
  square_index: number;
  label: string;
  resolver: unknown;
  probability: number;
  is_free: boolean;
  square_type?: string | null;
  player_id?: number | null;
  event_type?: string | null;
  status: SquareStatus;
  created_at: string;
  resolved_at: string | null;
};

type SupabaseLikeError = {
  code?: string;
  message?: string;
};

function isMissingSportsBingoTablesError(error: SupabaseLikeError | null | undefined): boolean {
  if (!error) {
    return false;
  }
  const message = String(error.message ?? "").toLowerCase();
  if (!message) {
    return false;
  }
  const referencesSportsBingoTable = message.includes("sports_bingo_cards") || message.includes("sports_bingo_squares");
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (referencesSportsBingoTable && (message.includes("schema cache") || message.includes("relation")))
  );
}

type ScoreSnapshot = {
  gameId: string;
  sportKey: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  completed: boolean;
};

type BallDontLieTeam = {
  id?: number;
  full_name?: string;
  /** MLB team objects carry no `full_name` — only `display_name` ("Kansas City Royals"). */
  display_name?: string;
  /** Mascot only on MLB ("Royals"); the full name on NBA/WNBA/NFL. */
  name?: string;
  city?: string;
};

/** `/mlb/v1/games` nests the run total here; there is no `*_team_score` key on an MLB row. */
type BallDontLieTeamGameData = {
  runs?: number | string | null;
  points?: number | string | null;
  score?: number | string | null;
};

type BallDontLieGame = {
  id?: number;
  season?: number;
  status?: string;
  /**
   * WNBA's completed-game `status` is `"post"`, never `"final"` — the finality signal instead
   * lives here (`"final"`). MLB/NBA/NFL say `"final"` in `status` itself already; `status_state`
   * is read as a second, OR'd signal so those leagues are unaffected. See Phase 7 of
   * docs/mlb-prop-bingo-validation-plan.md.
   */
  status_state?: string;
  datetime?: string;
  date?: string;
  home_team_score?: number | string | null;
  visitor_team_score?: number | string | null;
  /** WNBA's flat score keys — a third shape, distinct from NBA/NFL's `*_team_score` and MLB's `*_team_data.runs`. */
  home_score?: number | string | null;
  away_score?: number | string | null;
  home_team?: BallDontLieTeam;
  visitor_team?: BallDontLieTeam;
  /** MLB says `away_team`; NBA/WNBA/NFL say `visitor_team`. Read both via `ballDontLieAwayTeam`. */
  away_team?: BallDontLieTeam;
  home_team_data?: BallDontLieTeamGameData;
  away_team_data?: BallDontLieTeamGameData;
};

type BallDontLiePlayer = {
  id?: number;
  first_name?: string;
  last_name?: string;
};

type BallDontLieStat = {
  pts?: number;
  reb?: number;
  ast?: number;
  stl?: number;
  blk?: number;
  turnover?: number;
  fg3m?: number;
  fg3a?: number;
  fgm?: number;
  fga?: number;
  ftm?: number;
  fta?: number;
  oreb?: number;
  dreb?: number;
  min?: string;
  plus_minus?: number;
  player?: BallDontLiePlayer;
  team?: BallDontLieTeam;
  game?: BallDontLieGame;
};

type BallDontLieLineup = {
  /** NBA/WNBA only. `/mlb/v1/lineups` rows carry no `starter` key — see `isBallDontLieLineupStarter`. */
  starter?: boolean;
  /** MLB batters: 1-9 for the starting nine, null otherwise. */
  batting_order?: number | string | null;
  /** MLB starting pitcher marker (batting order is null on that row). */
  is_probable_pitcher?: boolean | null;
  position?: string | null;
  player?: BallDontLiePlayer;
  team?: BallDontLieTeam;
};

type BallDontLiePlay = {
  period?: number;
  home_score?: number;
  away_score?: number;
  /**
   * The payload field is `scoring_play`, verified live 2026-08-18 for both NBA and WNBA — our
   * code read `is_scoring_play` (which does not exist on either league's rows), so
   * `firstScoringTeam`/halftime/quarter-max reads have never populated for either league. Kept
   * `is_scoring_play` as a fallback read, not a preferred one, in case a future payload variant
   * reintroduces it.
   */
  scoring_play?: boolean;
  is_scoring_play?: boolean;
  points?: number;
  player_ids?: number[];
  team?: BallDontLieTeam;
};

type NBAPlayerStatLine = {
  playerId: number | null;
  playerName: string;
  teamSide: TeamSide | null;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  turnover: number;
  threes: number;
  fgm: number;
  fga: number;
  ftm: number;
  fta: number;
  oreb: number;
  dreb: number;
  minSeconds: number;
  plusMinus: number;
};

type NBAGamePlayerStatsSnapshot = {
  gameId: number;
  finalized: boolean;
  homeScore: number | null;
  awayScore: number | null;
  lines: NBAPlayerStatLine[];
  byPlayerKey: Map<string, NBAPlayerStatLine[]>;
  homeHasTripleDouble: boolean;
  awayHasTripleDouble: boolean;
  anyHasTripleDouble: boolean;
  lineupByPlayerId: Map<number, { starter: boolean; teamSide: TeamSide | null }>;
  /** False when the `/lineups` fetch failed (Phase 2b) — bench-scores squares stay pending/void
   * rather than reading an empty map as "not a starter" and settling a false miss. */
  lineupDataAvailable: boolean;
  firstScoringTeam: TeamSide | null;
  homeHalftimeScore: number | null;
  awayHalftimeScore: number | null;
  homeMaxQuarterPoints: number;
  awayMaxQuarterPoints: number;
  /** False when the `/plays` walk failed (Phase 2b) — mirrors `NFLPlayDerivedFacts.available`.
   * `firstScoringTeam`/halftime/quarter-max all default to their "nothing scored yet" values on an
   * empty walk, which is indistinguishable from a real 0-0 first half unless this flag is checked
   * first. team_scores_first / team_leads_at_halftime / team_points_in_any_quarter_at_least all gate
   * on it before reading those fields. */
  quarterExtrasAvailable: boolean;
  firstHalfByPlayerId: Map<number, { pts: number; ast: number; stl: number }>;
  maxQuarterAssistsByPlayerId: Map<number, number>;
  /** False when the NBA per-period stats walk failed (Phase 2b; always true for WNBA — that walk is
   * intentionally never attempted there, see Phase 3d, which is a different condition from a fetch
   * failure and stays out of this flag's scope). Gates the three player-quarter families. */
  periodStatsAvailable: boolean;
};

type MLBPlayerStatLine = {
  playerId: number | null;
  playerName: string;
  teamSide: TeamSide | null;
  hits: number;
  homeRuns: number;
  rbis: number;
  runs: number;
  stolenBases: number;
  strikeoutsPitcher: number;
  earnedRuns: number;
  pitcherOuts: number;
};

type MLBGamePlayerStatsSnapshot = {
  gameId: number;
  finalized: boolean;
  homeScore: number | null;
  awayScore: number | null;
  lines: MLBPlayerStatLine[];
  byPlayerKey: Map<string, MLBPlayerStatLine[]>;
  lineupByPlayerId: Map<number, { starter: boolean; teamSide: TeamSide | null }>;
  lineupByPlayerKey: Map<string, { starter: boolean; teamSide: TeamSide | null }>;
};

// --- Phase 4 of docs/prop-bingo-nfl-plan.md: the NFL grading substrate ------------------------
// Three sources feed one snapshot, because one cron tick should cost at most three provider calls
// per *game* (not per card): `/nfl/v1/games` for the score and the per-quarter columns,
// `/nfl/v1/stats` for the box score, and — only when a card actually holds a play-by-play square —
// `/nfl/v1/plays`.

/** Box-score fields the Phase 0 §3 allowlist actually grades against. Names mirror BDL's. */
type NFLPlayerStatLine = {
  playerId: number | null;
  playerName: string;
  teamSide: TeamSide | null;
  passingYards: number;
  passingTouchdowns: number;
  passingAttempts: number;
  passingCompletions: number;
  passingInterceptions: number;
  rushingYards: number;
  rushingAttempts: number;
  rushingTouchdowns: number;
  longRushing: number;
  receptions: number;
  receivingYards: number;
  receivingTouchdowns: number;
  longReception: number;
  fieldGoalsMade: number;
  extraPointsMade: number;
  /** Return / defensive scores. Books settle `anytime_td` on these too, so they count. */
  otherTouchdowns: number;
  // --- Phase 8b Tier 2. Every field below is already in the rows we fetch; none costs a request. --
  fieldGoalAttempts: number;
  longFieldGoalMade: number;
  totalTackles: number;
  defensiveSacks: number;
  defensiveInterceptions: number;
  puntsInside20: number;
  /**
   * `position_abbreviation` off the row, uppercased; `null` when the provider omitted it. Only the
   * non-quarterback-pass square reads it, and it treats `null` as "don't know" rather than as
   * "not a quarterback".
   */
  position: string | null;
};

/**
 * Per-quarter points. **`null` means two different things** and the difference is load-bearing
 * (plan handoff note 5): BDL writes `null` both for "this quarter has not been played" and for
 * "this team was shut out in this quarter". `quartersCompleted` is what disambiguates them — a
 * `null` at an index below `quartersCompleted` is a real zero, above it is unknown.
 */
type NFLQuarterScores = {
  /** Index 0 = Q1 … index 3 = Q4. Raw provider values, nulls preserved on purpose. */
  home: Array<number | null>;
  away: Array<number | null>;
  homeOt: number | null;
  awayOt: number | null;
  /**
   * Per-side, per-quarter: is this column trustworthy? A `false` means the row's own arithmetic
   * says points are missing from the breakdown, so this quarter's `null` cannot be read as a real
   * zero. `nflQuarterPoints` returns `null` for those, which routes their squares to `void`
   * instead of manufacturing a shutout out of a column the provider never published.
   */
  homeKnown: boolean[];
  awayKnown: boolean[];
  /** How many of Q1–Q4 are known to be over. 0 when the game has not started. */
  quartersCompleted: number;
  /**
   * `null` means **the row cannot say**: points are unaccounted for, which is either overtime with
   * an unpublished `*_ot` column or a missing regulation quarter, and nothing in the row separates
   * the two. `nfl_overtime` voids on `null` rather than claiming a hit it cannot support.
   */
  wentToOvertime: boolean | null;
};

/** Everything Optional 3b's squares need, derived once from a chronological `/nfl/v1/plays` walk. */
type NFLPlayDerivedFacts = {
  /** False when plays were not requested or the walk failed — every 3b square then stays pending. */
  available: boolean;
  firstScoreKind: "field_goal" | "touchdown" | "safety" | "other" | null;
  firstScoringTeam: TeamSide | null;
  /** Best-effort scorer of the game's first touchdown. `null` when no TD has been scored yet. */
  firstTouchdown: { team: TeamSide | null; scorerName: string | null } | null;
  sawNonOffensiveTouchdown: boolean;
  sawFourthDownConversion: boolean;
  longestTouchdownYards: number;
  // --- Phase 8b Tier 3: clock-and-score arithmetic over the same walk, no new request -----------
  // The plan's second finding: the play rows carry `period`, `clock_display` and
  // `start_yards_to_endzone`, none of which the Phase 4 walk read.
  /** Seconds elapsed in the game when the first points went up. `null` until someone scores. */
  firstScoreElapsedSeconds: number | null;
  /** Fewest seconds left in Q2 / Q4 at any scoring play. `null` when nobody has scored in it yet. */
  minSecondsRemainingFirstHalfScore: number | null;
  minSecondsRemainingFourthScore: number | null;
  /** Did each side hold a lead at any point? Both true = the "both teams lead" square. */
  homeLed: boolean;
  awayLed: boolean;
  sawLeadChangeAfterHalftime: boolean;
  sawTieAfterHalftime: boolean;
  /** Was each side ever behind during Q4? The winner is only known at Final, so both are tracked. */
  homeTrailedInFourth: boolean;
  awayTrailedInFourth: boolean;
  /**
   * `null` = **the walk saw points it could not attribute** — a bare +2 with no play-type signal,
   * which is a safety or a two-point conversion and the delta alone cannot say which. Both squares
   * void on `null` rather than settling a coin flip that no regrade pass will reopen.
   */
  sawTwoPointConversion: boolean | null;
  sawSafety: boolean | null;
  /** Fewest yards to the end zone at the start of any touchdown play. `null` until a TD is scored. */
  shortestTouchdownYardsToEndzone: number | null;
  /** Highest period seen in the walk, so "has the fourth quarter started yet" is answerable. */
  highestPeriodSeen: number;
};

/**
 * Phase 8b Tier 1 — one team's `/nfl/v1/team_stats` row, reduced to the allowlisted fields.
 *
 * `null` means **the provider did not publish this field for this team**, which is not the same as
 * zero: BDL omits `sacks` and `fourth_down_conversions` entirely for a team that has none. The
 * grader turns a null into a zero at the comparison, because that is what the field means and what
 * the base rates in `lib/sportsBingoNflFlavor.ts` were measured against — but the null is preserved
 * this far so `available` can stay an honest statement about the *row*, not about one field.
 */
type NFLTeamStatsSide = Partial<Record<NFLTeamStatField, number>>;

type NFLTeamStatsFacts = {
  /** False when team_stats was not requested, the call failed, or the game has no rows yet. */
  available: boolean;
  home: NFLTeamStatsSide | null;
  away: NFLTeamStatsSide | null;
};

type NFLGameStatsSnapshot = {
  gameId: number;
  finalized: boolean;
  homeScore: number | null;
  awayScore: number | null;
  quarters: NFLQuarterScores;
  lines: NFLPlayerStatLine[];
  byPlayerKey: Map<string, NFLPlayerStatLine[]>;
  plays: NFLPlayDerivedFacts;
  teamStats: NFLTeamStatsFacts;
};

export type MlbWebhookBingoEvent = {
  gameId: string;
  eventType:
    | "groundout"
    | "flyout"
    | "strikeout"
    | "hit"
    | "home_run"
    | "walk"
    | "hit_by_pitch"
    | "rbi"
    | "stolen_base"
    | "pitcher_out"
    | "earned_run"
    | "hit_allowed";
  playerId: number | null;
  playerName: string;
  teamName: string;
  pitchCount: number | null;
};

export type MlbPlayerSnapshotBingoEvent = {
  gameId: string;
  playerId: number;
  playerName: string;
  gameStatus?: string;
  batterStats: {
    h: number;
    homeRuns: number;
    rbi: number;
    stolenBases: number;
    strikeoutsAsBatter: number;
  };
  pitcherStats: {
    strikeouts: number;
    outs: number;
    earnedRuns: number;
    hitsAllowed: number;
  };
};

type GameCatalogEntry = {
  game: SportsBingoGame;
  candidates: SportsBingoSquareTemplate[];
  /**
   * NFL only, and only when the books priced the game (Phase 2). Carried on the entry so the async
   * player-prop pass in `getGameEntryWithCandidates` can price milestone squares against the same
   * market the core squares came from, rather than re-fetching or re-deriving the consensus.
   */
  marketModel?: NFLMarketModel | null;
};

type CatalogCacheEntry = {
  expiresAt: number;
  entries: GameCatalogEntry[];
};

type NBAPlayerProfile = {
  playerId: number;
  playerName: string;
  teamId: number;
  teamSide: TeamSide | null;
  stats: {
    pts: number;
    reb: number;
    ast: number;
    stl: number;
    blk: number;
    oreb: number;
    dreb: number;
    fg3m: number;
    ftm: number;
    fta: number;
    fgm: number;
    fga: number;
    min: number;
    plus_minus: number;
  };
  historical: {
    sampleSize: number;
    starterSampleSize: number;
    benchSampleSize: number;
    rates: {
      threes1: number;
      threes3: number;
      threes5: number;
      points10: number;
      points20: number;
      rebounds5: number;
      rebounds10: number;
      oreb3: number;
      dreb5: number;
      assists1: number;
      assists5: number;
      assists10: number;
      steals1: number;
      steals2: number;
      blocks1: number;
      blocks2: number;
      minutes30: number;
      plusMinus10: number;
      benchPoints8: number;
    };
  };
};

const LINE_PATTERNS: number[][] = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

/**
 * The **only** league-path table in this module. It holds exactly the leagues
 * `app/api/bingo/leagues/route.ts` ships (NHL and the six soccer keys were unreachable dead
 * weight); `tests/lib.sportsBingo.sport-path-keys.test.ts` fails if the two drift apart again.
 * Exported for that guard.
 */
export const SPORT_PATH_BY_KEY: Record<string, string> = {
  basketball_nba: "/nba/v1/games",
  basketball_wnba: "/wnba/v1/games",
  americanfootball_nfl: "/nfl/v1/games",
  baseball_mlb: "/mlb/v1/games",
};

function dayKeysForWindow(startMs: number, endMs: number): string[] {
  const days: string[] = [];
  for (
    let cursor = Date.UTC(
      new Date(startMs).getUTCFullYear(),
      new Date(startMs).getUTCMonth(),
      new Date(startMs).getUTCDate()
    );
    cursor <= Date.UTC(
      new Date(endMs).getUTCFullYear(),
      new Date(endMs).getUTCMonth(),
      new Date(endMs).getUTCDate()
    );
    cursor += 24 * 60 * 60 * 1000
  ) {
    days.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return days;
}

// Season status needs a much longer horizon than the live game catalog (games can appear
// weeks before kickoff), so it gets its own cache with its own, much longer, TTL.
const SEASON_STATUS_CACHE_MS = cacheMsInWindow(
  process.env.BINGO_SEASON_STATUS_CACHE_MS,
  6 * 60 * 60_000,
  60 * 60_000,
  12 * 60 * 60_000
);
let seasonStatusCache = new Map<string, { expiresAt: number; hasGames: boolean }>();

/**
 * The negative TTL for a season-status answer that came out of a *failed* fetch rather than a real
 * "this league has no games" (Phase 5 of docs/prop-bingo-code-review-fix-plan.md).
 *
 * `fetchBallDontLieList` degrades a provider outage to `[]`, so without this a single bad provider
 * minute would pin a whole league to `hasGames: false` — and therefore to "out of season" in the
 * league picker — for the full six-hour TTL. Short enough that the next picker load re-asks,
 * long enough that an outage does not turn into a request storm.
 */
const SEASON_STATUS_FAILURE_CACHE_MS = 5 * 60_000;

/** Whether a league has any game on the books within `days` days from now. Used by
 * `lib/leagueSeasonStatus.ts` as the live-feed signal behind the calendar fallback.
 *
 * Phase 5: one request for the whole window, not one per day. `dates[]` repeats (the same form
 * `buildBallDontLieDatesQuery` builds — see its comment for why `start_date`/`end_date` is not an
 * option), so a 15-day window was 15 sequential round trips and up to 60 per picker load across
 * four leagues. The answer is a pure existence check, so a single `per_page: 1` request over every
 * day in the window is exactly equivalent. */
export async function hasUpcomingGamesInWindow(sportKey: string, days: number): Promise<boolean> {
  const cacheKey = `${sportKey}:${days}`;
  const now = Date.now();
  const cached = seasonStatusCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.hasGames;
  }

  const path = SPORT_PATH_BY_KEY[sportKey];
  if (!path) {
    seasonStatusCache.set(cacheKey, { expiresAt: now + SEASON_STATUS_CACHE_MS, hasGames: false });
    return false;
  }

  // `per_page: 1` with `maxPages: 1`: one row anywhere in the window settles the question, and
  // there is nothing to gain from walking the cursor.
  const failure: BallDontLieFailureBox = { failed: false };
  const query = buildBallDontLieDatesQuery(now, now + days * 24 * 60 * 60 * 1000, "1");
  const rows = await fetchBallDontLieList(path, query, { maxPages: 1, failure });
  const hasGames = rows.length > 0;

  // A failure-derived `false` is not an answer, so it does not get an answer's TTL.
  seasonStatusCache.set(cacheKey, {
    expiresAt: now + (failure.failed ? SEASON_STATUS_FAILURE_CACHE_MS : SEASON_STATUS_CACHE_MS),
    hasGames,
  });
  return hasGames;
}

let gameCatalogCache = new Map<string, CatalogCacheEntry>();
let gameEntryWithCandidatesCache = new Map<string, { expiresAt: number; entry: { game: SportsBingoGame; candidates: SportsBingoSquareTemplate[] } }>();
let scoreCache = new Map<string, { expiresAt: number; byGameId: Map<string, ScoreSnapshot> }>();
let nbaPlayerStatsCache = new Map<string, { expiresAt: number; snapshot: NBAGamePlayerStatsSnapshot | null }>();
let mlbPlayerStatsCache = new Map<string, { expiresAt: number; snapshot: MLBGamePlayerStatsSnapshot | null }>();
// `includedPlays` is tracked alongside the snapshot because the plays walk is conditional: a card
// with no Optional-3b square never pays for it, but a later card in the same tick might need it,
// and a cached plays-free snapshot must not satisfy that card.
let nflGameStatsCache = new Map<
  string,
  { expiresAt: number; includedPlays: boolean; includedTeamStats: boolean; snapshot: NFLGameStatsSnapshot | null }
>();
let nbaPlayerProfilesCache = new Map<string, { expiresAt: number; profiles: NBAPlayerProfile[] }>();
/**
 * Phase 3 of docs/prop-bingo-nfl-activation-plan.md — the previous sweep's NFL box score, per game,
 * keyed by normalized player name. This is **not** a cache of provider data and
 * `maybeInvalidateSportsBingoCaches` deliberately does not clear it: dropping it re-seeds the
 * baseline, and a re-seed publishes nothing (see `buildNflLiveStatBroadcastPlan`), so clearing it
 * on every `bypassCache: true` call would swallow exactly the stat changes it exists to detect.
 *
 * `expiresAt` is only about memory: an entry is dropped once no sweep has touched it for
 * `NFL_LIVE_STAT_STATE_TTL_MS`, which for a finished game is a few minutes after the final whistle.
 */
let nflLiveStatStateByGameId = new Map<
  string,
  { touchedAt: number; byPlayerKey: Map<string, NflLiveStatTotals> }
>();
let cacheInvalidatedAtByScope = new Map<string, number>();
const cacheTelemetry = {
  scoreCacheHits: 0,
  scoreCacheMisses: 0,
  invalidationInvocations: 0,
  invalidationThrottledSkips: 0,
};

function maybeInvalidateSportsBingoCaches(params: {
  sportKey?: string;
  gameId?: string;
  mode?: "force" | "throttled";
}): void {
  cacheTelemetry.invalidationInvocations += 1;
  const sportKey = params.sportKey?.trim() ?? "";
  const gameId = params.gameId?.trim() ?? "";
  const mode = params.mode ?? "force";
  const scopeKey = `${sportKey || "*"}:${gameId || "*"}`;
  const now = Date.now();

  if (mode === "throttled") {
    const last = cacheInvalidatedAtByScope.get(scopeKey);
    if (typeof last === "number" && now - last < CACHE_INVALIDATION_THROTTLE_MS) {
      cacheTelemetry.invalidationThrottledSkips += 1;
      return;
    }
    cacheInvalidatedAtByScope.set(scopeKey, now);
  }

  if (sportKey) {
    scoreCache.delete(sportKey);
    gameCatalogCache.delete(sportKey);
  } else {
    scoreCache.clear();
    gameCatalogCache.clear();
  }

  if (gameId) {
    nbaPlayerStatsCache.delete(gameId);
    mlbPlayerStatsCache.delete(gameId);
    nflGameStatsCache.delete(gameId);
    nbaPlayerProfilesCache.delete(gameId);
  } else {
    nbaPlayerStatsCache.clear();
    mlbPlayerStatsCache.clear();
    nflGameStatsCache.clear();
    nbaPlayerProfilesCache.clear();
  }

  gameEntryWithCandidatesCache.clear();
}

function assertSupabaseConfigured(): void {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }
}

function isBasketballSportKey(sportKey: string): boolean {
  return sportKey === "basketball_nba" || sportKey === "basketball_wnba";
}

function isWnbaSportKey(sportKey: string): boolean {
  return sportKey === "basketball_wnba";
}

function basketballApiPrefixForSportKey(sportKey: string): string | null {
  if (sportKey === "basketball_nba") {
    return "/nba/v1";
  }
  if (sportKey === "basketball_wnba") {
    return "/wnba/v1";
  }
  return null;
}

/**
 * balldontlie's box-score path is genuinely inverted between leagues, not a case of one name
 * serving both: NBA's box score is `/stats` (`/player_stats` 404s), WNBA's is `/player_stats`
 * (`/stats` 404s). Verified live 2026-08-18 against real completed games in both leagues — see
 * Phase 3 of docs/bingo-correctness-and-wnba-repair-plan.md.
 */
export function basketballStatsPathForSportKey(sportKey: string): string {
  return isWnbaSportKey(sportKey) ? "player_stats" : "stats";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeNoPushLine(line: number): number {
  const rounded = Math.round(line * 2) / 2;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
    return rounded + 0.5;
  }
  return rounded;
}

function roundLine(line: number): number {
  return Number(normalizeNoPushLine(line).toFixed(1));
}

function formatLine(line: number): string {
  if (Math.abs(line - Math.round(line)) < 1e-9) {
    return `${Math.round(line)}`;
  }
  return line.toFixed(1);
}

function supportTaggedLabel(label: string, supportLevel: SquareSupportLevel): string {
  return label;
}

function formatQuantity(value: number): string {
  if (Math.abs(value - Math.round(value)) < 1e-9) {
    return `${Math.round(value)}`;
  }
  return value.toFixed(1);
}

function pluralizeUnit(base: string, quantity: number): string {
  if (Math.abs(quantity - 1) < 1e-9) {
    return base;
  }
  return `${base}s`;
}

function playerPropUnitLabel(marketKey: string): string {
  switch (marketKey) {
    case "player_points":
      return "point";
    case "player_rebounds":
      return "rebound";
    case "player_assists":
      return "assist";
    case "player_threes":
      return "made 3-pointer";
    case "player_blocks":
      return "block";
    case "player_steals":
      return "steal";
    case "player_turnovers":
      return "turnover";
    default:
      return PLAYER_PROP_MARKET_LABELS[marketKey] ?? "stat";
  }
}

function isHalfLine(value: number): boolean {
  return Math.abs(value * 2 - Math.round(value * 2)) < 1e-9 && Math.abs(value % 1) > 1e-9;
}

function normalizeTeamKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function normalizeNameKey(value: string): string {
  const noDiacritics = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return noDiacritics;
}

function tokenizeName(value: string): string[] {
  return normalizeNameKey(value).split(" ").filter(Boolean);
}

/**
 * BDL's team-name key is not the same across leagues: NBA/WNBA/NFL carry `full_name`
 * ("Denver Nuggets"); MLB carries **no `full_name` at all** — only `display_name`
 * ("Kansas City Royals") plus a mascot-only `name` ("Royals"). Verified live 2026-08-18.
 *
 * **Open question, deliberately left open:** this reads `full_name ?? name`, so an MLB team
 * resolves to its *mascot* here. Every consumer on this path (`teamsMatch`, `inferCardTeamSide`)
 * folds both forms through `getTeamIdentityKey`, so "Royals" still matches a card holding
 * "Kansas City Royals" — measured at 27/27 team sides resolved on live data. Reaching for
 * `display_name` here instead would be *more* faithful, but it also widens the pool the MLB
 * candidate builder can see (fixture team objects carrying only `display_name` start resolving a
 * team side), which changes generated boards. That belongs in its own change with its own
 * board-snapshot re-baseline, not in a restore. Callers that need the full name — anything that
 * *stores* or *displays* the string rather than matching it — use `ballDontLieTeamFullName`.
 */
function getTeamDisplayName(team: BallDontLieTeam | null | undefined): string {
  return String(team?.full_name ?? team?.name ?? "").trim();
}

/**
 * The full team name across every league's spelling, preferring `display_name` over the
 * mascot-only `name` so MLB yields "Kansas City Royals" rather than "Royals". Used where the
 * string is stored or shown (`normalizeBallDontLieScoreRow`), not where it is fuzzy-matched.
 */
function ballDontLieTeamFullName(team: BallDontLieTeam | null | undefined): string {
  return String(team?.full_name ?? team?.display_name ?? team?.name ?? "").trim();
}

/**
 * The shape-tolerant `/…/v1/games` row parser both leagues share. `getScoresBySportKey` used to
 * read `visitor_team.full_name` / `home_team_score` / `visitor_team_score` inline, which resolved
 * to nothing on every MLB row (MLB says `away_team`, `display_name`, `home_team_data.runs`) so
 * every MLB row was dropped. Returns `null` for a row missing an id or either team name.
 *
 * Exported for `tests/lib.sportsBingo.balldontlie-score-normalizer.test.ts`.
 */
export function normalizeBallDontLieScoreRow(
  row: Record<string, unknown>,
  sportKey: string
): ScoreSnapshot | null {
  const game = row as BallDontLieGame;
  const gameId = String(game.id ?? "").trim();
  const homeTeam = ballDontLieTeamFullName(game.home_team);
  const awayTeam = ballDontLieTeamFullName(ballDontLieAwayTeam(game));
  if (!gameId || !homeTeam || !awayTeam) {
    return null;
  }

  const status = String(game.status ?? "").toLowerCase();

  return {
    gameId,
    sportKey,
    homeTeam,
    awayTeam,
    homeScore: ballDontLieHomeScore(game),
    awayScore: ballDontLieAwayScore(game),
    // `ft` is soccer's full-time marker and MUST be matched as a whole word: a bare
    // `includes("ft")` also matches **"halftime"**, which declared every NFL game complete at
    // the half — every square on the board settling on a two-quarter score. Found while building
    // Phase 4's halftime squares (docs/prop-bingo-nfl-plan.md); it was latent before NFL had
    // any square that could notice.
    completed: isBallDontLieGameFinal(status, game.status_state) || /\bft\b/.test(status),
  };
}

/** MLB says `away_team`; every other BDL league says `visitor_team`. */
function ballDontLieAwayTeam(game: BallDontLieGame): BallDontLieTeam | undefined {
  return game.visitor_team ?? game.away_team;
}

function ballDontLieTeamDataScore(data: BallDontLieTeamGameData | undefined): unknown {
  if (!data) {
    return undefined;
  }
  return data.runs ?? data.points ?? data.score;
}

/**
 * MLB has **no `home_team_score` key at all** — runs live at `home_team_data.runs`. Reading only
 * the flat key made every MLB snapshot score `null`, which made `toMLBLiveScoreSnapshot` return
 * `null` for every card.
 *
 * WNBA has a *third* shape: no `home_team_score`, no `home_team_data`, just flat `home_score` /
 * `away_score`. Without this fallback every WNBA snapshot score was `null` too (confirmed live
 * 2026-08-18, Phase 7 of docs/mlb-prop-bingo-validation-plan.md).
 */
function ballDontLieHomeScore(game: BallDontLieGame): number | null {
  return parseScoreValue(game.home_team_score ?? ballDontLieTeamDataScore(game.home_team_data) ?? game.home_score);
}

function ballDontLieAwayScore(game: BallDontLieGame): number | null {
  return parseScoreValue(game.visitor_team_score ?? ballDontLieTeamDataScore(game.away_team_data) ?? game.away_score);
}

/**
 * `/mlb/v1/lineups` rows carry no `starter` key: the starting nine carry `batting_order` 1-9 and
 * the starting pitcher carries `is_probable_pitcher: true` with a null batting order. NBA/WNBA rows
 * do carry the boolean. Both vocabularies are read here so no caller has to know which league it
 * is holding. Verified live 2026-08-18 (MLB: 20 starter rows/game; NBA: 21 rows, 10 `starter: true`).
 */
export function isBallDontLieLineupStarter(row: BallDontLieLineup | null | undefined): boolean {
  if (!row) {
    return false;
  }
  if (typeof row.starter === "boolean") {
    return row.starter;
  }
  if (row.is_probable_pitcher === true) {
    return true;
  }
  const battingOrder = Number.parseInt(String(row.batting_order ?? ""), 10);
  return Number.isFinite(battingOrder) && battingOrder >= 1 && battingOrder <= 9;
}

function getTeamIdentityKey(name: string): string {
  return normalizeTeamKey(toMascotDisplayName(name));
}

function teamsMatch(left: string, right: string): boolean {
  if (!left || !right) {
    return false;
  }
  const normalizedLeft = normalizeTeamKey(left);
  const normalizedRight = normalizeTeamKey(right);
  if (normalizedLeft === normalizedRight) {
    return true;
  }
  return getTeamIdentityKey(left) === getTeamIdentityKey(right);
}

function toIsoDate(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

/**
 * A day-window query for a balldontlie `/games` endpoint, as repeated `dates[]` params.
 *
 * **`start_date`/`end_date` are silently ignored by `/mlb/v1/games` and `/nfl/v1/games`** — they
 * do not error, they return the *oldest* rows in the archive (year-2000 spring training for MLB,
 * 2002 for NFL) as though no filter had been applied. Verified against the live API 2026-08-17;
 * see docs/prop-bingo-nfl-plan.md's Phase 7 notes. `dates[]` is the parameter those endpoints
 * actually honour, and NBA/WNBA honour it too, so it is the safe form everywhere.
 *
 * Callers pass epoch milliseconds; the window is inclusive of both end days.
 */
function buildBallDontLieDatesQuery(fromMs: number, toMs: number, perPage = "100"): URLSearchParams {
  const query = new URLSearchParams({ per_page: perPage });
  for (const day of dayKeysForWindow(fromMs, toMs)) {
    query.append("dates[]", day);
  }
  return query;
}

function normalizeBallDontLieGameStartIso(rawValue: string): string | null {
  const raw = String(rawValue ?? "").trim();
  if (!raw) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const ts = Date.parse(`${raw}T12:00:00.000Z`);
    return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
  }
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

function extractEventStartIso(event: Record<string, unknown>): string | null {
  const rawCandidates = [
    event.starts_at,
    event.datetime,
    event.date,
    event.game_date,
    event.commence_time,
    event.start_time,
    event.start_time_utc,
    event.main_card_start_time,
    event.scheduled_at,
  ];
  for (const candidate of rawCandidates) {
    const normalized = normalizeBallDontLieGameStartIso(String(candidate ?? "").trim());
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function extractTeamName(event: Record<string, unknown>, side: "home" | "away"): string {
  const sideKey = side === "home" ? "home" : "away";
  const directTeam = side === "home" ? event.home_team : event.visitor_team ?? event.away_team;
  const dataTeam = side === "home" ? event.home_team_data : event.away_team_data;
  const namedTeam = event[`${sideKey}_team_name`];

  const candidates: unknown[] = [directTeam, dataTeam, namedTeam];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === "string") {
      const value = candidate.trim();
      if (value) return value;
      continue;
    }
    const record = asRecord(candidate);
    const value = String(record.full_name ?? record.name ?? "").trim();
    if (value) return value;
    const city = String(record.city ?? "").trim();
    if (city) return city;
  }
  return "";
}

function parseScoreValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function logit(value: number): number {
  const safe = clamp(value, 0.01, 0.99);
  return Math.log(safe / (1 - safe));
}

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

function shuffle<T>(input: T[]): T[] {
  const items = [...input];
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    const current = items[index];
    items[index] = items[swapIndex] as T;
    items[swapIndex] = current as T;
  }
  return items;
}

function average(values: number[], fallback = 0): number {
  if (values.length === 0) {
    return fallback;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function toGameLabel(homeTeam: string, awayTeam: string): string {
  return `${awayTeam} vs. ${homeTeam}`;
}

function toMascotDisplayName(team: string): string {
  const trimmed = team.trim();
  if (!trimmed) {
    return trimmed;
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return trimmed;
  }

  const lastTwo = parts.slice(-2).join(" ");
  const keepLastTwo = new Set([
    "Red Sox",
    "White Sox",
    "Blue Jays",
    "Trail Blazers",
    "Golden Knights",
    "Maple Leafs",
  ]);

  if (keepLastTwo.has(lastTwo)) {
    return lastTwo;
  }

  return parts[parts.length - 1] ?? trimmed;
}

function toResolverPlayerRef(playerName: string, playerId: number | null | undefined): string {
  const name = String(playerName ?? "").trim();
  const id = Number(playerId ?? 0);
  if (!name) {
    return "";
  }
  if (Number.isFinite(id) && id > 0) {
    return `${name}::${Math.trunc(id)}`;
  }
  return name;
}

function parseResolverPlayerRef(value: string): { displayName: string; playerId: number | null } {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return { displayName: "", playerId: null };
  }
  const match = raw.match(/^(.*)::(\d+)$/);
  if (!match) {
    return { displayName: raw, playerId: null };
  }
  const displayName = String(match[1] ?? "").trim();
  const parsedId = Number.parseInt(String(match[2] ?? ""), 10);
  return {
    displayName: displayName || raw,
    playerId: Number.isFinite(parsedId) && parsedId > 0 ? parsedId : null,
  };
}

function mlbWebhookEventUnitLabel(event: string): string {
  switch (event) {
    case "home_run":
      return "home runs";
    case "rbi":
      return "RBIs";
    case "stolen_base":
      return "stolen bases";
    case "pitcher_out":
      return "pitching outs";
    case "earned_run":
      return "earned runs";
    case "hit_allowed":
      return "hits allowed";
    case "hit_by_pitch":
      return "HBPs";
    case "quick_out_under_3_pitches":
      return "quick outs";
    default:
      return `${event.replaceAll("_", " ")}s`;
  }
}

function mlbWebhookEventDisplayLabel(event: string): string {
  switch (event) {
    case "home_run":
      return "home run";
    case "rbi":
      return "RBI";
    case "stolen_base":
      return "stolen base";
    case "pitcher_out":
      return "pitching out";
    case "earned_run":
      return "earned run";
    case "hit_allowed":
      return "hit allowed";
    case "hit_by_pitch":
      return "hit-by-pitch";
    case "quick_out_under_3_pitches":
      return "out in under 3 pitches";
    default:
      return event.replaceAll("_", " ");
  }
}

function toMlbSquareEventType(event: string): string | null {
  switch (event) {
    case "home_run":
      return "mlb.batter.home_run";
    case "strikeout":
      return "mlb.batter.strikeout";
    case "hit":
      return "mlb.batter.hit";
    case "rbi":
      return "mlb.player.rbi";
    case "stolen_base":
      return "mlb.player.stolen_base";
    case "pitcher_out":
      return "mlb.player.pitcher_out";
    case "earned_run":
      return "mlb.player.earned_run";
    case "hit_allowed":
      return "mlb.player.hit_allowed";
    default:
      return null;
  }
}

function getSquareMetadataForResolver(
  resolver: SportsBingoResolver
): { squareType: "generic" | "player_stat"; playerId: number | null; eventType: string | null } {
  if (resolver.kind !== "mlb_webhook_player_event_at_least" && resolver.kind !== "mlb_webhook_player_event_at_most") {
    return { squareType: "generic", playerId: null, eventType: null };
  }
  const parsedPlayer = parseResolverPlayerRef(resolver.player);
  if (!parsedPlayer.playerId) {
    return { squareType: "generic", playerId: null, eventType: null };
  }
  const eventType = toMlbSquareEventType(resolver.event);
  if (!eventType) {
    return { squareType: "generic", playerId: null, eventType: null };
  }
  return {
    squareType: "player_stat",
    playerId: parsedPlayer.playerId,
    eventType,
  };
}

function resolverProgressPayload(resolver: SportsBingoResolver): { current: number; target: number; unit: string } | null {
  switch (resolver.kind) {
    case "mlb_webhook_player_event_at_least":
      return {
        current: Math.max(0, Math.floor(Number(resolver.currentCount ?? 0))),
        target: Math.max(1, Math.floor(Number(resolver.threshold ?? 1))),
        unit: mlbWebhookEventUnitLabel(resolver.event),
      };
    case "mlb_webhook_player_event_at_most":
      return null;
    case "mlb_webhook_team_event_at_least":
      return {
        current: Math.max(0, Math.floor(Number(resolver.currentCount ?? 0))),
        target: Math.max(1, Math.floor(Number(resolver.threshold ?? 1))),
        unit: mlbWebhookEventUnitLabel(resolver.event),
      };
    default:
      return null;
  }
}

function resolverKey(resolver: SportsBingoResolver): string {
  switch (resolver.kind) {
    case "free":
      return "free";
    case "replacement_auto":
      return "replacement_auto";
    case "moneyline":
      return `moneyline:${resolver.team}`;
    case "spread_more_than":
      return `spread_more_than:${resolver.team}:${resolver.line.toFixed(1)}`;
    case "spread_keep_close":
      return `spread_keep_close:${resolver.team}:${resolver.line.toFixed(1)}`;
    case "game_total_over":
      return `game_total_over:${resolver.line.toFixed(1)}`;
    case "game_total_under":
      return `game_total_under:${resolver.line.toFixed(1)}`;
    case "team_total_over":
      return `team_total_over:${resolver.team}:${resolver.line.toFixed(1)}`;
    case "team_total_under":
      return `team_total_under:${resolver.team}:${resolver.line.toFixed(1)}`;
    case "player_prop":
      return `player_prop:${resolver.marketKey}:${resolver.player.toLowerCase()}:${resolver.direction}:${resolver.line.toFixed(1)}`;
    case "nba_player_stat_at_least":
      return `nba_player_stat_at_least:${resolver.player.toLowerCase()}:${resolver.metric}:${resolver.threshold.toFixed(1)}`;
    case "nba_player_double_double":
      return `nba_player_double_double:${resolver.player.toLowerCase()}`;
    case "team_triple_double":
      return `team_triple_double:${resolver.team}`;
    case "any_triple_double":
      return "any_triple_double";
    case "nba_team_stat_at_least":
      return `nba_team_stat_at_least:${resolver.team}:${resolver.metric}:${resolver.threshold.toFixed(1)}`;
    case "nba_team_players_scored_at_least":
      return `nba_team_players_scored_at_least:${resolver.team}:${resolver.threshold.toFixed(1)}`;
    case "nba_player_triple_double":
      return `nba_player_triple_double:${resolver.player.toLowerCase()}`;
    case "nba_player_perfect_ft":
      return `nba_player_perfect_ft:${resolver.player.toLowerCase()}`;
    case "nba_player_perfect_fg":
      return `nba_player_perfect_fg:${resolver.player.toLowerCase()}`;
    case "nba_player_triple_threat":
      return `nba_player_triple_threat:${resolver.player.toLowerCase()}`;
    case "nba_player_zero_turnovers":
      return `nba_player_zero_turnovers:${resolver.player.toLowerCase()}`;
    case "nba_player_plus_minus_at_least":
      return `nba_player_plus_minus_at_least:${resolver.player.toLowerCase()}:${resolver.threshold.toFixed(1)}`;
    case "nba_team_has_double_double":
      return `nba_team_has_double_double:${resolver.team}`;
    case "nba_team_three_pt_scorers":
      return `nba_team_three_pt_scorers:${resolver.team}:${resolver.threshold.toFixed(1)}`;
    case "nba_team_turnovers_at_most":
      return `nba_team_turnovers_at_most:${resolver.team}:${resolver.threshold.toFixed(1)}`;
    case "nba_team_outrebounds":
      return `nba_team_outrebounds:${resolver.team}`;
    case "nba_player_bench_scores":
      return `nba_player_bench_scores:${resolver.player.toLowerCase()}:${resolver.threshold.toFixed(1)}`;
    case "nba_team_scores_first":
      return `nba_team_scores_first:${resolver.team}`;
    case "nba_team_leads_at_halftime":
      return `nba_team_leads_at_halftime:${resolver.team}`;
    case "nba_team_points_in_any_quarter_at_least":
      return `nba_team_points_in_any_quarter_at_least:${resolver.team}:${resolver.threshold.toFixed(1)}`;
    case "nba_player_points_first_half_at_least":
      return `nba_player_points_first_half_at_least:${resolver.player.toLowerCase()}:${resolver.threshold.toFixed(1)}`;
    case "nba_player_assists_in_any_quarter_at_least":
      return `nba_player_assists_in_any_quarter_at_least:${resolver.player.toLowerCase()}:${resolver.threshold.toFixed(1)}`;
    case "nba_player_steals_first_half_at_least":
      return `nba_player_steals_first_half_at_least:${resolver.player.toLowerCase()}:${resolver.threshold.toFixed(1)}`;
    case "mlb_webhook_player_event_at_least":
      return `mlb_webhook_player_event_at_least:${resolver.player.toLowerCase()}:${resolver.event}:${resolver.threshold.toFixed(1)}`;
    case "mlb_webhook_player_event_at_most":
      return `mlb_webhook_player_event_at_most:${resolver.player.toLowerCase()}:${resolver.event}:${resolver.threshold.toFixed(1)}`;
    case "mlb_webhook_team_event_at_least":
      return `mlb_webhook_team_event_at_least:${resolver.team}:${resolver.event}:${resolver.threshold.toFixed(1)}`;
    case "nfl_player_anytime_td":
      return `nfl_player_anytime_td:${resolver.player.toLowerCase()}`;
    case "nfl_player_first_td":
      return `nfl_player_first_td:${resolver.player.toLowerCase()}`;
    case "nfl_team_scores_every_quarter":
      return `nfl_team_scores_every_quarter:${resolver.team}`;
    case "nfl_team_shutout_quarter":
      return `nfl_team_shutout_quarter:${resolver.team}`;
    case "nfl_team_quarter_points_at_least":
      return `nfl_team_quarter_points_at_least:${resolver.team}:${resolver.threshold.toFixed(1)}`;
    case "nfl_any_quarter_scoreless":
      return "nfl_any_quarter_scoreless";
    case "nfl_team_leads_at_halftime":
      return `nfl_team_leads_at_halftime:${resolver.team}`;
    case "nfl_halftime_leader_loses":
      return "nfl_halftime_leader_loses";
    case "nfl_overtime":
      return "nfl_overtime";
    case "nfl_both_teams_score_at_least":
      return `nfl_both_teams_score_at_least:${resolver.threshold.toFixed(1)}`;
    case "nfl_margin_at_most":
      return `nfl_margin_at_most:${resolver.line.toFixed(1)}`;
    case "nfl_margin_at_least":
      return `nfl_margin_at_least:${resolver.line.toFixed(1)}`;
    case "nfl_second_half_higher_scoring":
      return "nfl_second_half_higher_scoring";
    case "nfl_first_score_is_field_goal":
      return "nfl_first_score_is_field_goal";
    case "nfl_first_scorer_wins":
      return "nfl_first_scorer_wins";
    case "nfl_non_offensive_touchdown":
      return "nfl_non_offensive_touchdown";
    case "nfl_fourth_down_conversion":
      return "nfl_fourth_down_conversion";
    case "nfl_long_touchdown":
      return `nfl_long_touchdown:${resolver.yards.toFixed(0)}`;
    // --- Phase 8b: the flavor slate ------------------------------------------------------------
    case "nfl_team_stat_at_least":
      return `nfl_team_stat_at_least:${resolver.team}:${resolver.field}:${resolver.threshold.toFixed(1)}`;
    case "nfl_team_stat_at_most":
      return `nfl_team_stat_at_most:${resolver.team}:${resolver.field}:${resolver.threshold.toFixed(1)}`;
    case "nfl_combined_team_stat_at_least":
      return `nfl_combined_team_stat_at_least:${resolver.field}:${resolver.threshold.toFixed(1)}`;
    case "nfl_combined_team_stat_at_most":
      return `nfl_combined_team_stat_at_most:${resolver.field}:${resolver.threshold.toFixed(1)}`;
    case "nfl_team_perfect_red_zone":
      return `nfl_team_perfect_red_zone:${resolver.team}:${resolver.minTrips.toFixed(0)}`;
    case "nfl_team_red_zone_trip_without_touchdown":
      return `nfl_team_red_zone_trip_without_touchdown:${resolver.team}`;
    case "nfl_team_possession_advantage":
      return `nfl_team_possession_advantage:${resolver.team}:${resolver.seconds.toFixed(0)}`;
    case "nfl_game_max_stat_at_least":
      return `nfl_game_max_stat_at_least:${resolver.scope}:${resolver.field}:${resolver.threshold.toFixed(1)}`;
    case "nfl_game_total_stat_at_least":
      return `nfl_game_total_stat_at_least:${resolver.field}:${resolver.threshold.toFixed(1)}`;
    case "nfl_game_missed_field_goal":
      return "nfl_game_missed_field_goal";
    case "nfl_non_quarterback_pass_attempt":
      return "nfl_non_quarterback_pass_attempt";
    case "nfl_first_score_within_minutes":
      return `nfl_first_score_within_minutes:${resolver.minutes.toFixed(1)}`;
    case "nfl_score_in_final_minutes":
      return `nfl_score_in_final_minutes:${resolver.segment}:${resolver.minutes.toFixed(1)}`;
    case "nfl_both_teams_lead":
      return "nfl_both_teams_lead";
    case "nfl_lead_change_second_half":
      return "nfl_lead_change_second_half";
    case "nfl_tied_after_halftime":
      return "nfl_tied_after_halftime";
    case "nfl_winner_trailed_in_fourth":
      return "nfl_winner_trailed_in_fourth";
    case "nfl_two_point_conversion":
      return "nfl_two_point_conversion";
    case "nfl_safety":
      return "nfl_safety";
    case "nfl_goal_line_touchdown":
      return `nfl_goal_line_touchdown:${resolver.yards.toFixed(0)}`;
    default:
      return "unknown";
  }
}

function buildSquareLabel(game: SportsBingoGame, resolver: SportsBingoResolver): string {
  const homeTeam = toMascotDisplayName(game.homeTeam);
  const awayTeam = toMascotDisplayName(game.awayTeam);
  const teamForSide = (team: TeamSide) => (team === "home" ? homeTeam : awayTeam);
  const opponentForSide = (team: TeamSide) => (team === "home" ? awayTeam : homeTeam);

  switch (resolver.kind) {
    case "free":
      return "FREE";
    case "replacement_auto":
      return "Replacement square (house rules).";
    case "moneyline": {
      const team = teamForSide(resolver.team);
      const opponent = opponentForSide(resolver.team);
      return `${team} to beat ${opponent}.`;
    }
    case "spread_more_than": {
      const team = teamForSide(resolver.team);
      const unit = game.sportKey === "baseball_mlb" ? "runs" : "points";
      return `${team} win by ${formatLine(resolver.line)}+ ${unit}.`;
    }
    case "spread_keep_close": {
      // The predicate (final margin < line) is symmetric, so the team name is noise. NFL keeps the
      // short form for the 5×5 mobile grid; NBA/MLB stay byte-identical to their shipped label.
      if (game.sportKey === "americanfootball_nfl") {
        return `Final margin under ${formatLine(resolver.line)} points.`;
      }
      const team = teamForSide(resolver.team);
      const unit = game.sportKey === "baseball_mlb" ? "runs" : "points";
      return `${team} win or lose by less than ${formatLine(resolver.line)} ${unit}.`;
    }
    case "game_total_over": {
      const unit = game.sportKey === "baseball_mlb" ? "runs" : "points";
      return `Total ${unit}: over ${formatLine(resolver.line)}.`;
    }
    case "game_total_under": {
      const unit = game.sportKey === "baseball_mlb" ? "runs" : "points";
      return `Total ${unit}: under ${formatLine(resolver.line)}.`;
    }
    case "team_total_over": {
      const team = teamForSide(resolver.team);
      const unit = game.sportKey === "baseball_mlb" ? "runs" : "points";
      return `${team}: over ${formatLine(resolver.line)} ${unit}.`;
    }
    case "team_total_under": {
      const team = teamForSide(resolver.team);
      const unit = game.sportKey === "baseball_mlb" ? "runs" : "points";
      return `${team}: under ${formatLine(resolver.line)} ${unit}.`;
    }
    case "player_prop": {
      const playerLabel = parseResolverPlayerRef(resolver.player).displayName || resolver.player;
      const unit = playerPropUnitLabel(resolver.marketKey);
      const longestPhrase = NFL_LONGEST_PROP_PHRASES[resolver.marketKey];
      if (longestPhrase) {
        const threshold = resolver.direction === "over" && isHalfLine(resolver.line) ? Math.floor(resolver.line) + 1 : resolver.line;
        return `${playerLabel} ${
          resolver.direction === "over"
            ? longestPhrase.over(formatQuantity(threshold))
            : longestPhrase.under(formatLine(resolver.line))
        }`;
      }
      if (resolver.direction === "under" && Math.abs(resolver.line - 0.5) < 1e-9) {
        return `${playerLabel}: 0 ${pluralizeUnit(unit, 0)}.`;
      }
      if (resolver.direction === "over" && isHalfLine(resolver.line)) {
        const threshold = Math.floor(resolver.line) + 1;
        return `${playerLabel}: at least ${formatQuantity(threshold)} ${pluralizeUnit(unit, threshold)}.`;
      }
      const directionText = resolver.direction === "over" ? "over" : "under";
      return `${playerLabel}: ${directionText} ${formatLine(resolver.line)} ${pluralizeUnit(unit, resolver.line)}.`;
    }
    case "nba_player_stat_at_least": {
      const playerLabel = parseResolverPlayerRef(resolver.player).displayName || resolver.player;
      const statLabel = NBA_PLAYER_MILESTONE_METRIC_LABELS[resolver.metric] ?? "stat";
      const singularStatLabel = statLabel.endsWith("s") ? statLabel.slice(0, -1) : statLabel;
      return `${playerLabel}: at least ${formatQuantity(resolver.threshold)} ${pluralizeUnit(singularStatLabel, resolver.threshold)}.`;
    }
    case "nba_player_double_double":
      return `${parseResolverPlayerRef(resolver.player).displayName || resolver.player} records a double-double.`;
    case "team_triple_double": {
      const team = teamForSide(resolver.team);
      return `Any ${team} player records a triple-double.`;
    }
    case "any_triple_double":
      return "Any player records a triple-double.";
    case "nba_team_stat_at_least": {
      const team = teamForSide(resolver.team);
      switch (resolver.metric) {
        case "points":
          return `${team}: at least ${formatLine(resolver.threshold)} points.`;
        case "blocks":
          return `${team}: at least ${formatLine(resolver.threshold)} blocks.`;
        case "steals":
          return `${team}: at least ${formatLine(resolver.threshold)} steals.`;
        case "made_threes":
          return `${team}: at least ${formatLine(resolver.threshold)} made 3-pointers.`;
        case "offensive_rebounds":
          return `${team}: at least ${formatLine(resolver.threshold)} offensive rebounds.`;
        case "field_goal_pct":
          return `${team}: at least ${formatLine(resolver.threshold)}% field-goal shooting.`;
        case "free_throw_pct":
          return `${team}: at least ${formatLine(resolver.threshold)}% free-throw shooting.`;
        case "total_assists":
          return `${team}: at least ${formatLine(resolver.threshold)} assists.`;
        case "total_rebounds":
          return `${team}: at least ${formatLine(resolver.threshold)} rebounds.`;
        default:
          return `${team} team stat milestone.`;
      }
    }
    case "nba_team_players_scored_at_least": {
      const team = teamForSide(resolver.team);
      return `${team}: at least ${formatLine(resolver.threshold)} different players score.`;
    }
    case "nba_player_triple_double":
      return `${parseResolverPlayerRef(resolver.player).displayName || resolver.player} records a triple-double.`;
    case "nba_player_perfect_ft":
      return `${parseResolverPlayerRef(resolver.player).displayName || resolver.player}: perfect free throws (3+ att).`;
    case "nba_player_perfect_fg":
      return `${parseResolverPlayerRef(resolver.player).displayName || resolver.player}: perfect FG% (4+ att).`;
    case "nba_player_triple_threat":
      return `${parseResolverPlayerRef(resolver.player).displayName || resolver.player}: 5+ pts, 5+ reb, 5+ ast.`;
    case "nba_player_zero_turnovers":
      return `${parseResolverPlayerRef(resolver.player).displayName || resolver.player}: 0 turnovers.`;
    case "nba_player_plus_minus_at_least":
      return `${parseResolverPlayerRef(resolver.player).displayName || resolver.player}: plus/minus ${formatLine(resolver.threshold)} or higher.`;
    case "nba_team_has_double_double": {
      const team = teamForSide(resolver.team);
      return `${team}: a player records a double-double.`;
    }
    case "nba_team_three_pt_scorers": {
      const team = teamForSide(resolver.team);
      return `${team}: ${formatLine(resolver.threshold)}+ different 3-pt scorers.`;
    }
    case "nba_team_turnovers_at_most": {
      const team = teamForSide(resolver.team);
      return `${team}: under ${formatLine(resolver.threshold + 1)} total turnovers.`;
    }
    case "nba_team_outrebounds": {
      const team = teamForSide(resolver.team);
      const opp = opponentForSide(resolver.team);
      return `${team} out-rebounds ${opp}.`;
    }
    case "nba_player_bench_scores":
      return `${parseResolverPlayerRef(resolver.player).displayName || resolver.player}: ${formatLine(resolver.threshold)}+ points off the bench.`;
    case "nba_team_scores_first":
      return `${teamForSide(resolver.team)} scores the first basket.`;
    case "nba_team_leads_at_halftime":
      return `${teamForSide(resolver.team)} leads at halftime.`;
    case "nba_team_points_in_any_quarter_at_least":
      return `${teamForSide(resolver.team)} score ${formatLine(resolver.threshold)}+ in any quarter.`;
    case "nba_player_points_first_half_at_least":
      return `${parseResolverPlayerRef(resolver.player).displayName || resolver.player}: ${formatLine(resolver.threshold)}+ points in the first half.`;
    case "nba_player_assists_in_any_quarter_at_least":
      return `${parseResolverPlayerRef(resolver.player).displayName || resolver.player}: ${formatLine(resolver.threshold)}+ assists in a quarter.`;
    case "nba_player_steals_first_half_at_least":
      return `${parseResolverPlayerRef(resolver.player).displayName || resolver.player}: ${formatLine(resolver.threshold)}+ steals in the first half.`;
    case "mlb_webhook_player_event_at_least": {
      const player = parseResolverPlayerRef(resolver.player).displayName || resolver.player;
      if (resolver.event === "home_run") {
        return `${player} hits ${formatLine(resolver.threshold)}+ home runs.`;
      }
      return `${player}: ${formatLine(resolver.threshold)}+ ${mlbWebhookEventUnitLabel(resolver.event)}.`;
    }
    case "mlb_webhook_player_event_at_most": {
      const player = parseResolverPlayerRef(resolver.player).displayName || resolver.player;
      return `${player}: ${formatLine(resolver.threshold)} or fewer ${mlbWebhookEventUnitLabel(resolver.event)}.`;
    }
    case "mlb_webhook_team_event_at_least": {
      const team = teamForSide(resolver.team);
      if (resolver.event === "quick_out_under_3_pitches") {
        return `${team}: record ${formatLine(resolver.threshold)}+ outs in under 3 pitches.`;
      }
      return `${team}: ${formatLine(resolver.threshold)}+ ${mlbWebhookEventUnitLabel(resolver.event)}.`;
    }
    case "nfl_player_anytime_td":
      return `${parseResolverPlayerRef(resolver.player).displayName || resolver.player} scores a touchdown.`;
    case "nfl_player_first_td":
      return `${parseResolverPlayerRef(resolver.player).displayName || resolver.player} scores the game's first TD.`;
    case "nfl_team_scores_every_quarter":
      return `${teamForSide(resolver.team)} score in all four quarters.`;
    case "nfl_team_shutout_quarter":
      return `${teamForSide(resolver.team)} are held scoreless in a quarter.`;
    case "nfl_team_quarter_points_at_least":
      return `${teamForSide(resolver.team)} score ${formatLine(resolver.threshold)}+ in a single quarter.`;
    case "nfl_any_quarter_scoreless":
      return "A quarter ends with neither team scoring.";
    case "nfl_team_leads_at_halftime":
      return `${teamForSide(resolver.team)} lead at halftime.`;
    case "nfl_halftime_leader_loses":
      return "The halftime leader does not win.";
    case "nfl_overtime":
      return "The game goes to overtime.";
    case "nfl_both_teams_score_at_least":
      return `Both teams score ${formatLine(resolver.threshold)}+ points.`;
    case "nfl_margin_at_most":
      return `Final margin: ${formatLine(resolver.line)} points or less.`;
    case "nfl_margin_at_least":
      return `Final margin: ${formatLine(resolver.line)} points or more.`;
    case "nfl_second_half_higher_scoring":
      return "The 2nd half outscores the 1st.";
    case "nfl_first_score_is_field_goal":
      return "The first score is a field goal.";
    case "nfl_first_scorer_wins":
      return "The first team to score wins.";
    case "nfl_non_offensive_touchdown":
      return "A defensive or special-teams TD.";
    case "nfl_fourth_down_conversion":
      return "Either team converts a fourth down.";
    case "nfl_long_touchdown":
      return `A touchdown of ${formatLine(resolver.yards)}+ yards is scored.`;
    // --- Phase 8b: the flavor slate ------------------------------------------------------------
    // The predicate half of every Tier-1 label lives in `lib/sportsBingoNflFlavor.ts` so adding a
    // field is one edit there; only the subject is composed here, because only this function knows
    // the team's display name.
    case "nfl_team_stat_at_least":
      return `${teamForSide(resolver.team)} ${describeNFLTeamStat(resolver.field, resolver.threshold, "at_least")}.`;
    case "nfl_team_stat_at_most":
      return `${teamForSide(resolver.team)} ${describeNFLTeamStat(resolver.field, resolver.threshold, "at_most")}.`;
    case "nfl_combined_team_stat_at_least":
      return describeNFLCombinedTeamStat(resolver.field, resolver.threshold, "at_least");
    case "nfl_combined_team_stat_at_most":
      return describeNFLCombinedTeamStat(resolver.field, resolver.threshold, "at_most");
    case "nfl_team_perfect_red_zone":
      return `${teamForSide(resolver.team)}: a TD on every red-zone trip.`;
    case "nfl_team_red_zone_trip_without_touchdown":
      return `${teamForSide(resolver.team)}: a red-zone trip with no TD.`;
    case "nfl_team_possession_advantage":
      return `${teamForSide(resolver.team)}: ${Math.round(resolver.seconds / 60)}+ min possession edge.`;
    case "nfl_game_max_stat_at_least":
      return describeNFLPlayerStatMax(resolver.field, resolver.threshold, resolver.scope);
    case "nfl_game_total_stat_at_least":
      return describeNFLPlayerStatTotal(resolver.field, resolver.threshold);
    case "nfl_game_missed_field_goal":
      return "A field goal is missed.";
    case "nfl_non_quarterback_pass_attempt":
      return "A non-quarterback throws a pass.";
    case "nfl_first_score_within_minutes":
      return `First score inside the opening ${formatLine(resolver.minutes)} min.`;
    case "nfl_score_in_final_minutes":
      return resolver.segment === "first_half"
        ? `A score in the last ${formatLine(resolver.minutes)} min of the half.`
        : `A score in the last ${formatLine(resolver.minutes)} min of Q4.`;
    case "nfl_both_teams_lead":
      return "Both teams lead at some point.";
    case "nfl_lead_change_second_half":
      return "A lead change in the second half.";
    case "nfl_tied_after_halftime":
      return "The game is tied after halftime.";
    case "nfl_winner_trailed_in_fourth":
      return "The winner trailed in the 4th quarter.";
    case "nfl_two_point_conversion":
      return "A two-point conversion is good.";
    case "nfl_safety":
      return "A safety is scored.";
    case "nfl_goal_line_touchdown":
      return `A touchdown from the ${formatLine(resolver.yards)}-yard line.`;
    default:
      return "Sports Bingo square";
  }
}


/**
 * MLB, NFL and WNBA game rows carry **no `datetime` key at all**, and their `date` is already a
 * full ISO timestamp (`"2026-08-14T02:07:00.000Z"`). Appending `T00:00:00.000Z` to that produces
 * an unparseable string, so every such game used to return `POSITIVE_INFINITY` and
 * `pickBestMatchingBallDontLieGame`'s kickoff-proximity tiebreak went completely inert — a team
 * pair that appears twice in the candidate window (any multi-game series) always matched the
 * first-listed game. Parse `date` as-is first; only date-only strings (NBA's `"2025-10-21"`) get
 * the midnight suffix.
 */
function getGameTimestamp(game: BallDontLieGame): number {
  const primary = String(game.datetime ?? "").trim();
  if (primary) {
    const parsed = +new Date(primary);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  const fallback = String(game.date ?? "").trim();
  if (fallback) {
    const direct = +new Date(fallback);
    if (Number.isFinite(direct)) {
      return direct;
    }
    const parsed = +new Date(`${fallback}T00:00:00.000Z`);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return Number.POSITIVE_INFINITY;
}

/**
 * `includes`, not `startsWith`: MLB reports `"STATUS_FINAL"`, so a `startsWith("final")` check
 * meant an MLB game was **never** `finalized` and its squares could only ever settle through the
 * force-finalize window. NFL/NBA say `"Final"` / `"Final/OT"`, still matched.
 *
 * `statusState`, if passed, is OR'd in as a second signal: WNBA's completed-game `status` is
 * `"post"`, never `"final"`, so `status` alone left every WNBA game permanently un-finalized and
 * every square settling 12 hours late through the force-finalize window instead of on completion
 * (confirmed live 2026-08-18, Phase 7 of docs/mlb-prop-bingo-validation-plan.md). MLB/NBA/NFL
 * already say "final" in `status` itself, so passing their `status_state` too is a no-op.
 */
function isBallDontLieGameFinal(status: string, statusState?: string): boolean {
  if (status.trim().toLowerCase().includes("final")) {
    return true;
  }
  return Boolean(statusState?.trim().toLowerCase().includes("final"));
}

function inferCardTeamSide(card: SportsBingoCardRow, maybeTeamName: string): TeamSide | null {
  const name = maybeTeamName.trim();
  if (!name) {
    return null;
  }
  if (teamsMatch(name, card.home_team)) {
    return "home";
  }
  if (teamsMatch(name, card.away_team)) {
    return "away";
  }
  return null;
}

function hasTripleDouble(line: NBAPlayerStatLine): boolean {
  const categories = [line.pts, line.reb, line.ast, line.stl, line.blk];
  return categories.filter((value) => Number.isFinite(value) && value >= 10).length >= 3;
}

function parseMinutesString(min: string | undefined): number {
  if (!min) return 0;
  const trimmed = min.trim();
  if (!trimmed || trimmed === "0" || trimmed === "00:00") return 0;
  const colonIndex = trimmed.indexOf(":");
  if (colonIndex >= 0) {
    const minutes = Number.parseFloat(trimmed.slice(0, colonIndex));
    const seconds = Number.parseFloat(trimmed.slice(colonIndex + 1));
    return (Number.isFinite(minutes) ? minutes : 0) + (Number.isFinite(seconds) ? seconds / 60 : 0);
  }
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseStatNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

/** Exported for the MLB validator (`scripts/validate-mlb-bingo-grading.cjs`) and its tests. */
export function pickBestMatchingBallDontLieGame(card: SportsBingoCardRow, games: BallDontLieGame[]): BallDontLieGame | null {
  const matching = games.filter((game) => {
    const home = getTeamDisplayName(game.home_team);
    const away = getTeamDisplayName(ballDontLieAwayTeam(game));
    return teamsMatch(home, card.home_team) && teamsMatch(away, card.away_team);
  });
  if (matching.length === 0) {
    return null;
  }

  const targetStart = +new Date(card.starts_at);
  matching.sort((left, right) => {
    const leftDelta = Math.abs(getGameTimestamp(left) - targetStart);
    const rightDelta = Math.abs(getGameTimestamp(right) - targetStart);
    return leftDelta - rightDelta;
  });

  return matching[0] ?? null;
}


// Exported for tests/lib.sportsBingo.wnba-row-shape.test.ts — WNBA shares this function with NBA
// via basketballApiPrefixForSportKey, and its `finalized`/score reads were the Phase 7 defect site.
export function buildNBAGamePlayerStatsSnapshot(
  card: SportsBingoCardRow,
  game: BallDontLieGame,
  stats: BallDontLieStat[],
  extras?: {
    lineupByPlayerId?: Map<number, { starter: boolean; teamSide: TeamSide | null }>;
    lineupDataAvailable?: boolean;
    firstScoringTeam?: TeamSide | null;
    homeHalftimeScore?: number | null;
    awayHalftimeScore?: number | null;
    homeMaxQuarterPoints?: number;
    awayMaxQuarterPoints?: number;
    quarterExtrasAvailable?: boolean;
    firstHalfByPlayerId?: Map<number, { pts: number; ast: number; stl: number }>;
    maxQuarterAssistsByPlayerId?: Map<number, number>;
    periodStatsAvailable?: boolean;
  }
): NBAGamePlayerStatsSnapshot {
  const lines: NBAPlayerStatLine[] = [];
  const byPlayerKey = new Map<string, NBAPlayerStatLine[]>();

  for (const row of stats) {
    const firstName = String(row.player?.first_name ?? "").trim();
    const lastName = String(row.player?.last_name ?? "").trim();
    const playerName = `${firstName} ${lastName}`.trim();
    if (!playerName) {
      continue;
    }

    const statLine: NBAPlayerStatLine = {
      playerId: Number.parseInt(String(row.player?.id ?? ""), 10) || null,
      playerName,
      teamSide: inferCardTeamSide(card, getTeamDisplayName(row.team)),
      pts: parseStatNumber(row.pts),
      reb: parseStatNumber(row.reb),
      ast: parseStatNumber(row.ast),
      stl: parseStatNumber(row.stl),
      blk: parseStatNumber(row.blk),
      turnover: parseStatNumber(row.turnover),
      threes: parseStatNumber(row.fg3m),
      fgm: parseStatNumber(row.fgm),
      fga: parseStatNumber(row.fga),
      ftm: parseStatNumber(row.ftm),
      fta: parseStatNumber(row.fta),
      oreb: parseStatNumber(row.oreb),
      dreb: parseStatNumber(row.dreb),
      minSeconds: parseMinutesString(row.min),
      plusMinus: parseStatNumber(row.plus_minus),
    };

    lines.push(statLine);
    const key = normalizeNameKey(playerName);
    if (!key) {
      continue;
    }
    const existing = byPlayerKey.get(key) ?? [];
    existing.push(statLine);
    byPlayerKey.set(key, existing);
  }

  const homeHasTripleDouble = lines.some((line) => line.teamSide === "home" && hasTripleDouble(line));
  const awayHasTripleDouble = lines.some((line) => line.teamSide === "away" && hasTripleDouble(line));

  return {
    gameId: Number(game.id ?? 0),
    finalized: isBallDontLieGameFinal(String(game.status ?? ""), game.status_state),
    homeScore: ballDontLieHomeScore(game),
    awayScore: ballDontLieAwayScore(game),
    lines,
    byPlayerKey,
    homeHasTripleDouble,
    awayHasTripleDouble,
    anyHasTripleDouble: homeHasTripleDouble || awayHasTripleDouble,
    lineupByPlayerId: extras?.lineupByPlayerId ?? new Map(),
    lineupDataAvailable: extras?.lineupDataAvailable ?? true,
    firstScoringTeam: extras?.firstScoringTeam ?? null,
    homeHalftimeScore: extras?.homeHalftimeScore ?? null,
    awayHalftimeScore: extras?.awayHalftimeScore ?? null,
    homeMaxQuarterPoints: extras?.homeMaxQuarterPoints ?? 0,
    awayMaxQuarterPoints: extras?.awayMaxQuarterPoints ?? 0,
    quarterExtrasAvailable: extras?.quarterExtrasAvailable ?? true,
    firstHalfByPlayerId: extras?.firstHalfByPlayerId ?? new Map(),
    maxQuarterAssistsByPlayerId: extras?.maxQuarterAssistsByPlayerId ?? new Map(),
    periodStatsAvailable: extras?.periodStatsAvailable ?? true,
  };
}

/**
 * Exported for tests/lib.sportsBingo.nba-plays-fix.test.ts — pulled out of
 * getNBAGamePlayerStatsSnapshot so 3b's two live fixes (the scalar `game_id` param and the real
 * `scoring_play` field name, verified live 2026-08-18 for both NBA and WNBA) are directly testable
 * without mocking network. Behavior is unchanged from the inline version.
 */
export function buildBasketballPlayWalkExtras(
  plays: readonly BallDontLiePlay[],
  card: SportsBingoCardRow
): {
  firstScoringTeam: TeamSide | null;
  homeHalftimeScore: number | null;
  awayHalftimeScore: number | null;
  homeMaxQuarterPoints: number;
  awayMaxQuarterPoints: number;
} {
  let firstScoringTeam: TeamSide | null = null;
  let homeHalftimeScore: number | null = null;
  let awayHalftimeScore: number | null = null;
  const quarterStarts = new Map<number, { home: number; away: number }>();
  const quarterMax = new Map<number, { home: number; away: number }>();
  const orderedPlays = [...plays].sort((a, b) => {
    const pa = Number(a.period ?? 0);
    const pb = Number(b.period ?? 0);
    if (pa !== pb) return pa - pb;
    const sa = Number(a.home_score ?? 0) + Number(a.away_score ?? 0);
    const sb = Number(b.home_score ?? 0) + Number(b.away_score ?? 0);
    return sa - sb;
  });
  for (const play of orderedPlays) {
    const period = Number(play.period ?? 0);
    const homeScore = parseScoreValue(play.home_score) ?? 0;
    const awayScore = parseScoreValue(play.away_score) ?? 0;
    if (period >= 1 && period <= 4) {
      if (!quarterStarts.has(period)) {
        const previous = quarterMax.get(period - 1) ?? { home: 0, away: 0 };
        quarterStarts.set(period, { home: previous.home, away: previous.away });
      }
      const currentMax = quarterMax.get(period) ?? { home: 0, away: 0 };
      quarterMax.set(period, { home: Math.max(currentMax.home, homeScore), away: Math.max(currentMax.away, awayScore) });
    }
    const scoringFlag = play.scoring_play ?? play.is_scoring_play;
    if (firstScoringTeam === null && scoringFlag === true) {
      const playSide = inferCardTeamSide(card, getTeamDisplayName(play.team));
      if (playSide) {
        firstScoringTeam = playSide;
      } else if ((parseScoreValue(play.home_score) ?? 0) > 0 || (parseScoreValue(play.away_score) ?? 0) > 0) {
        firstScoringTeam = (parseScoreValue(play.home_score) ?? 0) > (parseScoreValue(play.away_score) ?? 0) ? "home" : "away";
      }
    }
    if (period <= 2) {
      homeHalftimeScore = homeScore;
      awayHalftimeScore = awayScore;
    }
  }

  let homeMaxQuarterPoints = 0;
  let awayMaxQuarterPoints = 0;
  for (let period = 1; period <= 4; period += 1) {
    const start = quarterStarts.get(period) ?? { home: 0, away: 0 };
    const end = quarterMax.get(period) ?? { home: 0, away: 0 };
    homeMaxQuarterPoints = Math.max(homeMaxQuarterPoints, Math.max(0, end.home - start.home));
    awayMaxQuarterPoints = Math.max(awayMaxQuarterPoints, Math.max(0, end.away - start.away));
  }

  return { firstScoringTeam, homeHalftimeScore, awayHalftimeScore, homeMaxQuarterPoints, awayMaxQuarterPoints };
}

// Exported for tests/lib.sportsBingo.nba-fetch-failure.test.ts (Phase 2b) — the fetch-failure
// handling and cache-TTL split live entirely inside this function's orchestration of its five
// fetches, so a direct call under a mocked ballDontLieClient is the only way to test it without
// reimplementing it.
export async function getNBAGamePlayerStatsSnapshot(card: SportsBingoCardRow): Promise<NBAGamePlayerStatsSnapshot | null> {
  if (!isBasketballSportKey(card.sport_key)) {
    return null;
  }
  const basketballApiPrefix = basketballApiPrefixForSportKey(card.sport_key);
  if (!basketballApiPrefix) {
    return null;
  }
  const statsPath = basketballStatsPathForSportKey(card.sport_key);
  const wnbaMode = isWnbaSportKey(card.sport_key);

  const now = Date.now();
  const cached = nbaPlayerStatsCache.get(card.game_id);
  if (cached && now < cached.expiresAt) {
    return cached.snapshot;
  }

  // Phase 2b: a fetch that failed (network error or non-OK response — `fetchBallDontLieList`
  // degrades both to `[]`, never throws) must not be cached for as long as a real answer. Tracked
  // across all five fetches below so any cache write in this call picks the right TTL.
  let anyFetchFailed = false;
  const rememberNull = (): null => {
    nbaPlayerStatsCache.set(card.game_id, {
      snapshot: null,
      expiresAt: now + (anyFetchFailed ? NBA_PLAYER_STATS_FAILURE_CACHE_MS : NBA_PLAYER_STATS_CACHE_MS),
    });
    return null;
  };

  try {
    if (!isBallDontLieConfigured()) {
      return rememberNull();
    }

    const startsAt = +new Date(card.starts_at);
    const lookbackMs = BALLDONTLIE_GAME_LOOKUP_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const startDate = toIsoDate(new Date(startsAt - lookbackMs).toISOString());
    const endDate = toIsoDate(new Date(startsAt + lookbackMs).toISOString());

    const gameQuery = new URLSearchParams({
      per_page: "100",
      start_date: startDate,
      end_date: endDate,
    });
    const gamesFailure: BallDontLieFailureBox = { failed: false };
    const games = await fetchBallDontLieList<BallDontLieGame>(`${basketballApiPrefix}/games`, gameQuery, {
      failure: gamesFailure,
    });
    if (gamesFailure.failed) anyFetchFailed = true;
    const matchedGame = pickBestMatchingBallDontLieGame(card, games);
    if (!matchedGame || typeof matchedGame.id !== "number") {
      return rememberNull();
    }

    const statsQuery = new URLSearchParams({ per_page: "100" });
    if (!wnbaMode) {
      // WNBA's /player_stats silently ignores `period` (verified live 2026-08-18); omit it there
      // so the request says what it means instead of implying a filter that does nothing.
      statsQuery.set("period", "0");
    }
    statsQuery.append("game_ids[]", String(matchedGame.id));
    const statsFailure: BallDontLieFailureBox = { failed: false };
    const stats = await fetchBallDontLieList<BallDontLieStat>(`${basketballApiPrefix}/${statsPath}`, statsQuery, {
      failure: statsFailure,
    });
    if (statsFailure.failed) {
      // The box score is not optional: without it there is no snapshot, not an empty one — a
      // zero-filled snapshot reads to every resolver as "this event definitively did not happen"
      // (see docs/bingo-correctness-and-wnba-repair-plan.md, Phase 2b). Bail before spending the
      // remaining four fetches; a null snapshot needs none of their output.
      anyFetchFailed = true;
      return rememberNull();
    }

    // `/wnba/v1/lineups` 404s on every WNBA game — no starter data exists for the league at all
    // (verified live 2026-08-18). That is structural, not a fetch failure: skip the request rather
    // than making a guaranteed-dead call, and say so directly via `lineupDataAvailable: false`
    // instead of discovering it by 404 accident. Must not set `anyFetchFailed` — a skipped fetch is
    // not a failed one, and WNBA snapshots must keep the full cache TTL, not the failure TTL.
    const lineupByPlayerId = new Map<number, { starter: boolean; teamSide: TeamSide | null }>();
    let lineupDataAvailable = true;
    if (wnbaMode) {
      lineupDataAvailable = false;
    } else {
      const lineupsQuery = new URLSearchParams({ per_page: "100" });
      lineupsQuery.append("game_ids[]", String(matchedGame.id));
      const lineupsFailure: BallDontLieFailureBox = { failed: false };
      const lineups = await fetchBallDontLieList<BallDontLieLineup>(`${basketballApiPrefix}/lineups`, lineupsQuery, {
        failure: lineupsFailure,
      });
      if (lineupsFailure.failed) anyFetchFailed = true;
      lineupDataAvailable = !lineupsFailure.failed;
      for (const row of lineups) {
        const playerId = Number(row.player?.id ?? 0);
        if (!Number.isFinite(playerId) || playerId <= 0) {
          continue;
        }
        const teamSide = inferCardTeamSide(card, getTeamDisplayName(row.team));
        lineupByPlayerId.set(playerId, { starter: row.starter === true, teamSide });
      }
    }

    // `/plays` takes a scalar `game_id`, not `game_ids[]` — the latter 400s for both leagues
    // (verified live 2026-08-18). Confirmed this is not a truncated walk: neither league's plays
    // response carries a `meta.next_cursor`, so `fetchBallDontLieList` returns after one page.
    const playsQuery = new URLSearchParams({ per_page: "100", game_id: String(matchedGame.id) });
    const playsFailure: BallDontLieFailureBox = { failed: false };
    const plays = await fetchBallDontLieList<BallDontLiePlay>(`${basketballApiPrefix}/plays`, playsQuery, {
      failure: playsFailure,
    });
    if (playsFailure.failed) anyFetchFailed = true;
    // A failed walk and a walk that legitimately found nothing yet (0-0, first half in progress)
    // both leave `plays` empty, but only the failure should stop the box-score squares' siblings
    // from settling — hence gating on the failure box, not on `plays.length`.
    const playWalk = playsFailure.failed
      ? { firstScoringTeam: null, homeHalftimeScore: null, awayHalftimeScore: null, homeMaxQuarterPoints: 0, awayMaxQuarterPoints: 0 }
      : buildBasketballPlayWalkExtras(plays, card);
    const { firstScoringTeam, homeHalftimeScore, awayHalftimeScore, homeMaxQuarterPoints, awayMaxQuarterPoints } = playWalk;

    const firstHalfByPlayerId = new Map<number, { pts: number; ast: number; stl: number }>();
    const maxQuarterAssistsByPlayerId = new Map<number, number>();
    // WNBA's box-score endpoint ignores `period` entirely (verified live 2026-08-18: period=1 and
    // period=0 return identical rows), so this per-period player walk would silently write
    // full-game totals into every quarter. There's no substitute source, so these two maps stay
    // empty for WNBA and `periodStatsAvailable` is `false` — no gradeable per-period data exists
    // for this league, structurally, not because a fetch failed. The three families that read
    // these maps (`nba_player_points_first_half_at_least`, `nba_player_assists_in_any_quarter_at_least`,
    // `nba_player_steals_first_half_at_least`) gate on this flag and settle `void`, not `miss`, as a
    // result. `buildNBAAchievementCandidates` (Phase 3d) also never generates these families onto a
    // WNBA board — this is the belt-and-braces settlement-side half of that same defense.
    let periodStatsAvailable = !wnbaMode;
    if (!wnbaMode) {
      for (const period of [1, 2, 3, 4]) {
        const periodQuery = new URLSearchParams({ per_page: "100", period: String(period) });
        periodQuery.append("game_ids[]", String(matchedGame.id));
        const periodFailure: BallDontLieFailureBox = { failed: false };
        const periodStats = await fetchBallDontLieList<BallDontLieStat>(`${basketballApiPrefix}/${statsPath}`, periodQuery, {
          failure: periodFailure,
        });
        if (periodFailure.failed) {
          anyFetchFailed = true;
          periodStatsAvailable = false;
          continue;
        }
        for (const line of periodStats) {
          const playerId = Number(line.player?.id ?? 0);
          if (!Number.isFinite(playerId) || playerId <= 0) continue;
          const ast = parseStatNumber(line.ast);
          if (period <= 2) {
            addFirstHalfAccumulator(firstHalfByPlayerId, playerId, parseStatNumber(line.pts), ast, parseStatNumber(line.stl));
          }
          const currentAstMax = maxQuarterAssistsByPlayerId.get(playerId) ?? 0;
          if (ast > currentAstMax) {
            maxQuarterAssistsByPlayerId.set(playerId, ast);
          }
        }
      }
    }

    const snapshot = buildNBAGamePlayerStatsSnapshot(card, matchedGame, stats, {
      lineupByPlayerId,
      lineupDataAvailable,
      firstScoringTeam,
      homeHalftimeScore,
      awayHalftimeScore,
      homeMaxQuarterPoints,
      awayMaxQuarterPoints,
      quarterExtrasAvailable: !playsFailure.failed,
      firstHalfByPlayerId,
      maxQuarterAssistsByPlayerId,
      periodStatsAvailable,
    });

    nbaPlayerStatsCache.set(card.game_id, {
      snapshot,
      expiresAt: now + (anyFetchFailed ? NBA_PLAYER_STATS_FAILURE_CACHE_MS : NBA_PLAYER_STATS_CACHE_MS),
    });
    return snapshot;
  } catch {
    anyFetchFailed = true;
    return rememberNull();
  }
}

function parseMlbPitcherOutsFromIp(value: unknown): number {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return 0;
  }
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  const whole = Math.floor(parsed);
  const fractionalDigit = Math.round((parsed - whole) * 10);
  if (fractionalDigit <= 0) {
    return whole * 3;
  }
  if (fractionalDigit === 1 || fractionalDigit === 2) {
    return whole * 3 + fractionalDigit;
  }
  return whole * 3;
}

/** Exported for the MLB validator (`scripts/validate-mlb-bingo-grading.cjs`) and its tests. */
export function buildMLBGamePlayerStatsSnapshot(
  card: SportsBingoCardRow,
  game: BallDontLieGame,
  stats: Array<Record<string, unknown>>,
  extras?: {
    lineupByPlayerId?: Map<number, { starter: boolean; teamSide: TeamSide | null }>;
    lineupByPlayerKey?: Map<string, { starter: boolean; teamSide: TeamSide | null }>;
  }
): MLBGamePlayerStatsSnapshot {
  const lines: MLBPlayerStatLine[] = [];
  const byPlayerKey = new Map<string, MLBPlayerStatLine[]>();

  for (const row of stats) {
    const playerObj = asRecord(row.player);
    const firstName = String(playerObj.first_name ?? "").trim();
    const lastName = String(playerObj.last_name ?? "").trim();
    const playerName = `${firstName} ${lastName}`.trim() || String(playerObj.name ?? "").trim();
    if (!playerName) {
      continue;
    }

    const teamObj = asRecord(row.team);
    const teamSide = inferCardTeamSide(card, getTeamDisplayName(teamObj as unknown as BallDontLieTeam));
    const pitcherOutsDirect = parseStatNumber(
      row.pitcher_outs ?? row.p_outs ?? row.outs_recorded ?? row.pitching_outs
    );
    const statLine: MLBPlayerStatLine = {
      playerId: Number.parseInt(String(playerObj.id ?? ""), 10) || null,
      playerName,
      teamSide,
      hits: parseStatNumber(row.hits ?? row.h),
      homeRuns: parseStatNumber(row.home_runs ?? row.hr),
      rbis: parseStatNumber(row.runs_batted_in ?? row.rbi),
      runs: parseStatNumber(row.runs ?? row.r),
      stolenBases: parseStatNumber(row.stolen_bases ?? row.sb),
      // `p_k` is the field `/mlb/v1/stats` actually returns for a pitcher's strikeouts; none of the
      // other spellings below exist on the live payload (verified 2026-08-17), so without it this
      // read 0 for every pitcher and `player_strikeouts_pitcher` squares could never settle true.
      strikeoutsPitcher: parseStatNumber(row.p_k ?? row.pitcher_strikeouts ?? row.p_strikeouts ?? row.so_pitcher),
      earnedRuns: parseStatNumber(row.earned_runs ?? row.er),
      pitcherOuts: pitcherOutsDirect > 0 ? pitcherOutsDirect : parseMlbPitcherOutsFromIp(row.ip),
    };

    lines.push(statLine);
    const key = normalizeNameKey(playerName);
    if (!key) {
      continue;
    }
    const existing = byPlayerKey.get(key) ?? [];
    existing.push(statLine);
    byPlayerKey.set(key, existing);
  }

  return {
    gameId: Number(game.id ?? 0),
    finalized: isBallDontLieGameFinal(String(game.status ?? "")),
    homeScore: ballDontLieHomeScore(game),
    awayScore: ballDontLieAwayScore(game),
    lines,
    byPlayerKey,
    lineupByPlayerId: extras?.lineupByPlayerId ?? new Map(),
    lineupByPlayerKey: extras?.lineupByPlayerKey ?? new Map(),
  };
}

async function getMLBGamePlayerStatsSnapshot(card: SportsBingoCardRow): Promise<MLBGamePlayerStatsSnapshot | null> {
  if (card.sport_key !== "baseball_mlb") {
    return null;
  }

  const now = Date.now();
  const cached = mlbPlayerStatsCache.get(card.game_id);
  if (cached && now < cached.expiresAt) {
    return cached.snapshot;
  }

  try {
    if (!isBallDontLieConfigured()) {
      mlbPlayerStatsCache.set(card.game_id, {
        snapshot: null,
        expiresAt: now + NBA_PLAYER_STATS_CACHE_MS,
      });
      return null;
    }

    const startsAt = +new Date(card.starts_at);
    const lookbackMs = BALLDONTLIE_GAME_LOOKUP_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const gameQuery = buildBallDontLieDatesQuery(startsAt - lookbackMs, startsAt + lookbackMs);
    const games = await fetchBallDontLieList<BallDontLieGame>("/mlb/v1/games", gameQuery);
    const matchedGame = pickBestMatchingBallDontLieGame(card, games);
    if (!matchedGame || typeof matchedGame.id !== "number") {
      mlbPlayerStatsCache.set(card.game_id, {
        snapshot: null,
        expiresAt: now + NBA_PLAYER_STATS_CACHE_MS,
      });
      return null;
    }

    const statsQuery = new URLSearchParams({
      per_page: "100",
    });
    statsQuery.append("game_ids[]", String(matchedGame.id));
    const stats = await fetchBallDontLieList<Record<string, unknown>>("/mlb/v1/stats", statsQuery);
    const lineupByPlayerId = new Map<number, { starter: boolean; teamSide: TeamSide | null }>();
    const lineupByPlayerKey = new Map<string, { starter: boolean; teamSide: TeamSide | null }>();
    try {
      const lineupQuery = new URLSearchParams({ per_page: "100" });
      lineupQuery.append("game_ids[]", String(matchedGame.id));
      const lineups = await fetchBallDontLieList<BallDontLieLineup>("/mlb/v1/lineups", lineupQuery);
      for (const row of lineups) {
        const playerId = Number(row.player?.id ?? 0);
        const playerName = `${String(row.player?.first_name ?? "").trim()} ${String(row.player?.last_name ?? "").trim()}`.trim();
        const teamSide = inferCardTeamSide(card, getTeamDisplayName(row.team));
        const payload = { starter: isBallDontLieLineupStarter(row), teamSide };
        if (Number.isFinite(playerId) && playerId > 0) {
          lineupByPlayerId.set(playerId, payload);
        }
        const playerKey = normalizeNameKey(playerName);
        if (playerKey) {
          lineupByPlayerKey.set(playerKey, payload);
        }
      }
    } catch {
      // Lineups can arrive late for MLB; fall back to stat-only grading when unavailable.
    }

    const snapshot = buildMLBGamePlayerStatsSnapshot(card, matchedGame, stats, {
      lineupByPlayerId,
      lineupByPlayerKey,
    });
    mlbPlayerStatsCache.set(card.game_id, {
      snapshot,
      expiresAt: now + NBA_PLAYER_STATS_CACHE_MS,
    });
    return snapshot;
  } catch {
    mlbPlayerStatsCache.set(card.game_id, {
      snapshot: null,
      expiresAt: now + NBA_PLAYER_STATS_CACHE_MS,
    });
    return null;
  }
}

// =============================================================================================
// NFL grading substrate — Phase 4 of docs/prop-bingo-nfl-plan.md
// =============================================================================================

/** BDL writes `null`, `""` and `0` interchangeably for "no stat"; keep `null` distinguishable. */
function parseNullableStatNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * How many of Q1–Q4 are *over*, which is the only thing that lets a `null` quarter column be read
 * as a real zero (plan handoff note 5). Deliberately conservative: when the status string is not
 * one we recognise, fall back to "every quarter strictly before the last one carrying data",
 * because guessing high would settle a scoreless-quarter square on a quarter still being played.
 */
function nflQuartersCompleted(params: {
  status: string;
  completed: boolean;
  home: Array<number | null>;
  away: Array<number | null>;
}): number {
  if (params.completed || isBallDontLieGameFinal(params.status)) {
    return 4;
  }

  const status = params.status.trim().toLowerCase();
  if (status) {
    if (/(overtime|\bot\b)/.test(status)) {
      return 4;
    }
    if (/half\s*time|halftime|end of (the )?(2nd|second)/.test(status)) {
      return 2;
    }
    const endOf = status.match(/end of (?:the )?(\d)(?:st|nd|rd|th)/);
    if (endOf?.[1]) {
      return Math.min(4, Math.max(0, Number.parseInt(endOf[1], 10)));
    }
    const inQuarter = status.match(/(\d)(?:st|nd|rd|th)\s*(?:quarter|qtr|q\b)/);
    if (inQuarter?.[1]) {
      return Math.min(4, Math.max(0, Number.parseInt(inQuarter[1], 10) - 1));
    }
  }

  let lastWithData = 0;
  for (let index = 0; index < 4; index += 1) {
    if (params.home[index] !== null || params.away[index] !== null) {
      lastWithData = index + 1;
    }
  }
  return Math.max(0, lastWithData - 1);
}

export function buildNFLQuarterScores(game: BallDontLieGame, completed: boolean): NFLQuarterScores {
  const raw = game as unknown as Record<string, unknown>;
  const home = [1, 2, 3, 4].map((q) => parseNullableStatNumber(raw[`home_team_q${q}`]));
  const away = [1, 2, 3, 4].map((q) => parseNullableStatNumber(raw[`visitor_team_q${q}`]));
  const homeOt = parseNullableStatNumber(raw.home_team_ot);
  const awayOt = parseNullableStatNumber(raw.visitor_team_ot);
  const status = String(game.status ?? "");
  const quartersCompleted = nflQuartersCompleted({ status, completed, home, away });

  // **Per-quarter presence, decided by the row's own arithmetic.** BDL writes `null` for a quarter
  // a team was shut out in — verified against 64 real 2025 games, where every one of them
  // reconciled exactly — so a bare `null` is not evidence of a hole. What *is* evidence is the
  // breakdown failing to add up to the published final score: those missing points sit in some
  // quarter the provider did not publish, and there is nothing in the row saying which. Reading
  // those nulls as zeros manufactures a phantom shutout, and the same shortfall read as
  // "points beyond regulation" manufactures a phantom overtime. So a side that does not reconcile
  // keeps only its *populated* columns; its nulls become unknown and grade `void`, which the
  // regrade path can reopen when the columns show up.
  const homeTotal = parseScoreValue(game.home_team_score);
  const awayTotal = parseScoreValue(game.visitor_team_score);
  const columnSum = (side: Array<number | null>, ot: number | null): number =>
    side.reduce<number>((sum, value) => sum + (value ?? 0), 0) + (ot ?? 0);
  const sideKnown = (side: Array<number | null>, ot: number | null, total: number | null): boolean[] => {
    if (total === null) {
      return side.map((value) => value !== null);
    }
    const sum = columnSum(side, ot);
    if (sum === total) {
      // Every column, `null` included, is accounted for: the nulls are real zeros.
      return [true, true, true, true];
    }
    if (sum > total) {
      // Internally contradictory — the breakdown claims more points than the game has. Trust none
      // of it rather than picking which half of the row to believe.
      return [false, false, false, false];
    }
    return side.map((value) => value !== null);
  };
  const homeKnown = sideKnown(home, homeOt, homeTotal);
  const awayKnown = sideKnown(away, awayOt, awayTotal);
  const breakdownReconciles =
    homeTotal !== null &&
    awayTotal !== null &&
    columnSum(home, homeOt) === homeTotal &&
    columnSum(away, awayOt) === awayTotal;

  // Two positive tells and one honest "cannot say". An `*_ot` column is `null` for a team that did
  // not score in overtime, and the status string is only useful while the game is live — so a
  // reconciling breakdown with neither tell is a definitive *no* overtime, and a breakdown that
  // does **not** reconcile is unanswerable: the unaccounted points are either an unpublished
  // overtime column or an unpublished regulation quarter. That ambiguity used to be resolved as a
  // hit; it is now `null`.
  const wentToOvertime: boolean | null =
    homeOt !== null || awayOt !== null || /overtime|\bot\b/i.test(status)
      ? true
      : breakdownReconciles
        ? false
        : null;

  return {
    home,
    away,
    homeOt,
    awayOt,
    homeKnown,
    awayKnown,
    quartersCompleted,
    wentToOvertime,
  };
}

/**
 * Points a team scored in quarter `index` (0-based), or `null` when that quarter is unfinished
 * **or when the row's arithmetic says the breakdown is missing points** (see `homeKnown`).
 */
function nflQuarterPoints(quarters: NFLQuarterScores, side: TeamSide, index: number): number | null {
  const column = side === "home" ? quarters.home : quarters.away;
  const value = column[index] ?? null;
  if (value !== null) {
    return value;
  }
  if (!(side === "home" ? quarters.homeKnown : quarters.awayKnown)[index]) {
    return null;
  }
  // `null` on a finished quarter is a shutout quarter; on an unplayed one it is simply unknown.
  return index < quarters.quartersCompleted ? 0 : null;
}

/**
 * Are all four regulation quarters trustworthy for this side (or for both)? Every square that
 * settles off "the game is over, so absence of evidence is evidence of absence" has to ask this
 * first — otherwise a hole in the breakdown reads as a miss the regrade path can never reopen.
 */
function nflRegulationQuartersKnown(quarters: NFLQuarterScores, side: TeamSide | "both"): boolean {
  const sides: readonly TeamSide[] = side === "both" ? (["home", "away"] as const) : [side];
  return sides.every((entry) =>
    (entry === "home" ? quarters.homeKnown : quarters.awayKnown).every((known) => known)
  );
}

function nflHalftimeScore(quarters: NFLQuarterScores, side: TeamSide): number | null {
  if (quarters.quartersCompleted < 2) {
    return null;
  }
  const first = nflQuarterPoints(quarters, side, 0);
  const second = nflQuarterPoints(quarters, side, 1);
  if (first === null || second === null) {
    return null;
  }
  return first + second;
}

const EMPTY_NFL_TEAM_STATS: NFLTeamStatsFacts = { available: false, home: null, away: null };

/**
 * Phase 8b — fold `/nfl/v1/team_stats` rows onto the snapshot.
 *
 * BDL returns one row per team per game. Rows whose team cannot be matched to either side of the
 * card are dropped rather than guessed at: a Tier-1 square graded against the wrong team is worse
 * than one that voids. A game with fewer than two matched rows leaves `available: false`, which is
 * what makes every Tier-1 square void instead of miss when the feed is empty — the postseason case
 * 8a found (BDL returns zero team_stats rows for every 2025 playoff game).
 */
export function buildNFLTeamStatsFacts(
  card: SportsBingoCardRow,
  rows: Array<Record<string, unknown>>
): NFLTeamStatsFacts {
  const facts: NFLTeamStatsFacts = { available: false, home: null, away: null };

  for (const row of rows) {
    const teamObj = asRecord(row.team);
    const side = inferCardTeamSide(card, getTeamDisplayName(teamObj as unknown as BallDontLieTeam));
    if (side === null) {
      continue;
    }
    const values: NFLTeamStatsSide = {};
    for (const field of NFL_TEAM_STAT_FIELDS) {
      const parsed = parseNullableStatNumber(row[field]);
      if (parsed !== null) {
        values[field] = parsed;
      }
    }
    facts[side] = values;
  }

  facts.available = facts.home !== null && facts.away !== null;
  return facts;
}

function buildNFLGameStatsSnapshot(
  card: SportsBingoCardRow,
  game: BallDontLieGame,
  stats: Array<Record<string, unknown>>,
  plays: NFLPlayDerivedFacts,
  teamStats: NFLTeamStatsFacts = EMPTY_NFL_TEAM_STATS
): NFLGameStatsSnapshot {
  const lines: NFLPlayerStatLine[] = [];
  const byPlayerKey = new Map<string, NFLPlayerStatLine[]>();
  const finalized = isBallDontLieGameFinal(String(game.status ?? ""));

  for (const row of stats) {
    const playerObj = asRecord(row.player);
    const playerName = `${String(playerObj.first_name ?? "").trim()} ${String(playerObj.last_name ?? "").trim()}`.trim();
    if (!playerName) {
      continue;
    }

    const teamObj = asRecord(row.team);
    const statLine: NFLPlayerStatLine = {
      playerId: Number.parseInt(String(playerObj.id ?? ""), 10) || null,
      playerName,
      teamSide: inferCardTeamSide(card, getTeamDisplayName(teamObj as unknown as BallDontLieTeam)),
      passingYards: parseStatNumber(row.passing_yards),
      passingTouchdowns: parseStatNumber(row.passing_touchdowns),
      passingAttempts: parseStatNumber(row.passing_attempts),
      passingCompletions: parseStatNumber(row.passing_completions),
      passingInterceptions: parseStatNumber(row.passing_interceptions),
      rushingYards: parseStatNumber(row.rushing_yards),
      rushingAttempts: parseStatNumber(row.rushing_attempts),
      rushingTouchdowns: parseStatNumber(row.rushing_touchdowns),
      longRushing: parseStatNumber(row.long_rushing),
      receptions: parseStatNumber(row.receptions),
      receivingYards: parseStatNumber(row.receiving_yards),
      receivingTouchdowns: parseStatNumber(row.receiving_touchdowns),
      longReception: parseStatNumber(row.long_reception),
      fieldGoalsMade: parseStatNumber(row.field_goals_made),
      extraPointsMade: parseStatNumber(row.extra_points_made),
      otherTouchdowns:
        parseStatNumber(row.kick_return_touchdowns) +
        parseStatNumber(row.punt_return_touchdowns) +
        parseStatNumber(row.interception_touchdowns) +
        parseStatNumber(row.fumbles_touchdowns),
      fieldGoalAttempts: parseStatNumber(row.field_goal_attempts),
      longFieldGoalMade: parseStatNumber(row.long_field_goal_made),
      totalTackles: parseStatNumber(row.total_tackles),
      defensiveSacks: parseStatNumber(row.defensive_sacks),
      defensiveInterceptions: parseStatNumber(row.defensive_interceptions),
      puntsInside20: parseStatNumber(row.punts_inside_20),
      position: (() => {
        const raw = String(playerObj.position_abbreviation ?? "").trim().toUpperCase();
        return raw ? raw : null;
      })(),
    };

    lines.push(statLine);
    const key = normalizeNameKey(playerName);
    if (!key) {
      continue;
    }
    const existing = byPlayerKey.get(key) ?? [];
    existing.push(statLine);
    byPlayerKey.set(key, existing);
  }

  return {
    gameId: Number(game.id ?? 0),
    finalized,
    homeScore: parseScoreValue(game.home_team_score),
    awayScore: parseScoreValue(game.visitor_team_score),
    quarters: buildNFLQuarterScores(game, finalized),
    lines,
    byPlayerKey,
    plays,
    teamStats,
  };
}

const EMPTY_NFL_PLAY_FACTS: NFLPlayDerivedFacts = {
  available: false,
  firstScoreKind: null,
  firstScoringTeam: null,
  firstTouchdown: null,
  sawNonOffensiveTouchdown: false,
  sawFourthDownConversion: false,
  longestTouchdownYards: 0,
  firstScoreElapsedSeconds: null,
  minSecondsRemainingFirstHalfScore: null,
  minSecondsRemainingFourthScore: null,
  homeLed: false,
  awayLed: false,
  sawLeadChangeAfterHalftime: false,
  sawTieAfterHalftime: false,
  homeTrailedInFourth: false,
  awayTrailedInFourth: false,
  sawTwoPointConversion: false,
  sawSafety: false,
  shortestTouchdownYardsToEndzone: null,
  highestPeriodSeen: 0,
};

/**
 * `"2:07"` → `127` seconds left in the period. Returns `null` for a malformed or absent clock, and
 * every Tier-3 square that needs one treats `null` as "this play tells me nothing" rather than as
 * zero — a clockless play must never read as a last-second score.
 */
function parseNFLPlayClockSeconds(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }
  const parts = raw.split(":");
  if (parts.length !== 2) {
    return null;
  }
  const minutes = Number.parseInt(parts[0] ?? "", 10);
  const seconds = Number.parseInt(parts[1] ?? "", 10);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }
  return minutes * 60 + seconds;
}

/** Regulation quarters are 15 minutes; a period beyond 4 is overtime and has no fixed length. */
const NFL_PERIOD_SECONDS = 15 * 60;

type BallDontLieNFLPlay = {
  id?: string | number;
  type_slug?: string;
  type_text?: string;
  text?: string;
  short_text?: string;
  home_score?: number | string | null;
  away_score?: number | string | null;
  scoring_play?: boolean;
  period?: number | string | null;
  team?: BallDontLieTeam;
  start_down?: number | string | null;
  start_distance?: number | string | null;
  start_yards_to_endzone?: number | string | null;
  clock_display?: string | null;
  stat_yardage?: number | string | null;
  wallclock?: string;
};

/**
 * Who scored a touchdown, read off the play's prose. BDL carries **no `player_id` on plays**, so
 * this is the only route to a first-TD scorer.
 *
 * **Verified against the live feed (2026-08-16, 2025 Week 9, 6 games, 35 touchdowns):** a scoring
 * play's `short_text` always *leads* with the scorer and follows with the yardage —
 * `"Mark Andrews 20 Yd pass from Lamar Jackson (Tyler Loop Kick)"`,
 * `"David Montgomery 2 Yd Rush (Jake Bates Kick)"`,
 * `"Chimere Dike 67 Yd Punt Return (Joey Slye Kick)"`. Note the passing template names the
 * **receiver first** and the passer after `from`, which is the opposite of the *non-scoring*
 * reception template in BDL's own docs (`"Tua Tagovailoa Pass Complete for 20 Yds to Jaylen
 * Waddle"`) — reading a scoring play the way the docs' sample reads would credit the quarterback
 * on every passing touchdown. Only the leading-name form is parsed here; anything else returns
 * `null`, which grades as void rather than as a wrong miss.
 */
function extractNFLTouchdownScorerName(play: BallDontLieNFLPlay): string | null {
  const shortText = String(play.short_text ?? "").trim();
  if (!shortText) {
    return null;
  }
  // Up to four capitalised tokens ("J.J. McCarthy", "DJ Moore") followed by the yardage figure.
  const scorer = shortText.match(/^([A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,3}?)(?=\s+-?\d)/);
  return scorer?.[1]?.trim() || null;
}

function isNFLNonOffensiveTouchdownPlay(play: BallDontLieNFLPlay): boolean {
  const haystack = `${String(play.type_slug ?? "")} ${String(play.type_text ?? "")}`.toLowerCase();
  return /(interception|fumble|kickoff|punt|kick|blocked|safety|return)/.test(haystack);
}

/**
 * Does the provider *type* this play as a safety? Used only to attribute a **+2 that already
 * happened** — never on its own, because typing alone is not proof the points were scored.
 *
 * **Verified live (2025 regular season, 46 games, 3 safety-typed rows —
 * `tests/fixtures/nfl-settlement-confidence.json` holds all three verbatim):** a safety arrives
 * either as `type_slug: "safety"` / `type_text: "Safety"` (`"Derrick Barnes Safety"`) or, when the
 * two points come from a penalty, as `type_slug: "penalty"` with `short_text` reading
 * `"Offensive Holding enforced in end zone for a Safety"`. The third was typed `"safety"` and
 * scored nothing — its `text` reads `"SAFETY NULLIFIED by Penalty"` — which is exactly why the
 * caller pairs this with a real +2 delta instead of trusting the slug by itself.
 *
 * The long `text` field is deliberately not scanned: it carries defensive prose where "safety" is
 * a *position* ("tackled by safety …"), which would read every tackle as a scoring play — and it
 * is where the nullification wording lives.
 */
/** Exported for `tests/lib.sportsBingo.nfl-safety-attribution.test.ts`. */
export function isNFLSafetyPlay(play: BallDontLieNFLPlay): boolean {
  if (String(play.type_slug ?? "").trim().toLowerCase() === "safety") {
    return true;
  }
  if (/\bsafety\b/i.test(String(play.type_text ?? ""))) {
    return true;
  }
  const shortText = String(play.short_text ?? "");
  return /\bfor (?:a |an )?safety\b/i.test(shortText) || /\bsafety\s*$/i.test(shortText);
}

/**
 * Does the provider type this play as a *successful* two-point conversion? Live, a successful try
 * is folded into its touchdown row (`"… (Tua Tagovailoa Pass to Julian Hill for Two-Point
 * Conversion)"`, a delta of 8) and a failed one reads `"(Two-Point Pass Conversion Failed)"` on a
 * delta of 6 — so the failure wording has to be excluded or every failed try grades as a hit.
 */
/** Exported for `tests/lib.sportsBingo.nfl-safety-attribution.test.ts`. */
export function isNFLTwoPointConversionPlay(play: BallDontLieNFLPlay): boolean {
  const haystack = `${String(play.type_slug ?? "")} ${String(play.type_text ?? "")} ${String(play.short_text ?? "")}`;
  if (!/two[-\s]?point|\b2[-\s]?pt\b/i.test(haystack)) {
    return false;
  }
  return !/(failed|no good|unsuccessful|missed|intercepted)/i.test(haystack);
}

/**
 * Exported for `scripts/validate-nfl-bingo-grading.cjs` (`npm run bingo:validate:nfl`), which
 * replays real archived games through **this** function rather than a copy of it — a mirrored
 * implementation in the script would validate the mirror, not the shipped grader.
 *
 * Chronological walk over one game's plays. Scoring is derived from the **score deltas** rather
 * than from BDL's `type_slug` vocabulary wherever possible: a +3 swing is a field goal, +2 is a
 * safety, and +6/+7/+8 is a touchdown (the extra point or two-point try is folded into the
 * touchdown row, verified live — a touchdown play usually reads as a delta of 7, not 6). That
 * arithmetic cannot drift the way a provider's slug list can. Slugs answer only what arithmetic
 * cannot: was this a *return* touchdown, was this a fourth-down conversion.
 *
 * **The feed contains corrupt rows and the guard below is not optional.** Sampling six real 2025
 * games turned up two distinct defects: a mid-game play carrying `home_score: 0, away_score: 0` in
 * a 21-14 game (which then makes the *next*, ordinary play look like a 21-point score), and stray
 * duplicated rows appended after `end-of-game` carrying a first-quarter score. So a play's scores
 * are accepted only when they move the running total **forwards by at most 8** — the most points
 * one play can produce. Anything else is discarded and the running total is left alone, which made
 * all four sampled anomalies disappear while reproducing every real final score exactly.
 */
export function buildNFLPlayDerivedFacts(plays: BallDontLieNFLPlay[]): NFLPlayDerivedFacts {
  const facts: NFLPlayDerivedFacts = { ...EMPTY_NFL_PLAY_FACTS, available: true };
  const MAX_POINTS_PER_PLAY = 8;
  let runningHome = 0;
  let runningAway = 0;
  /** Sign of the last non-tied score state, for the second-half lead-change square. */
  let lastNonZeroLeadSign = 0;

  for (const play of plays) {
    const startDown = parseNullableStatNumber(play.start_down);
    const startDistance = parseNullableStatNumber(play.start_distance);
    const yardage = parseNullableStatNumber(play.stat_yardage) ?? 0;
    const slug = String(play.type_slug ?? "").toLowerCase();

    const home = parseScoreValue(play.home_score);
    const away = parseScoreValue(play.away_score);
    const homeDelta = home === null ? 0 : home - runningHome;
    const awayDelta = away === null ? 0 : away - runningAway;
    const plausible =
      home !== null &&
      away !== null &&
      homeDelta >= 0 &&
      awayDelta >= 0 &&
      homeDelta + awayDelta <= MAX_POINTS_PER_PLAY;
    if (plausible) {
      runningHome = home;
      runningAway = away;
    }

    const delta = plausible ? Math.max(homeDelta, awayDelta) : 0;
    const scoringSide: TeamSide | null = homeDelta > 0 ? "home" : awayDelta > 0 ? "away" : null;
    const scored = plausible && delta > 0 && scoringSide !== null;
    const isTouchdown = scored && delta >= 6;

    // --- Phase 8b Tier 3 -----------------------------------------------------------------------
    // Everything below reads the *running* score, so it must sit after the corrupt-play guard has
    // decided whether to accept this row: a rejected row leaves the running total alone, and a
    // lead-change or tie derived from a corrupt score is exactly the defect the guard exists for.
    const period = parseNullableStatNumber(play.period);
    if (period !== null && period > facts.highestPeriodSeen) {
      facts.highestPeriodSeen = period;
    }
    if (plausible) {
      if (runningHome > runningAway) {
        facts.homeLed = true;
      }
      if (runningAway > runningHome) {
        facts.awayLed = true;
      }
      if (period !== null && period >= 3) {
        if (runningHome === runningAway) {
          facts.sawTieAfterHalftime = true;
        }
        // "Both led at some point" already implies a lead change somewhere; restricting it to the
        // second half means asking whether *this* half saw one, which is the running sign flipping
        // while the period is 3 or later.
        const sign = Math.sign(runningHome - runningAway);
        if (sign !== 0 && lastNonZeroLeadSign !== 0 && sign !== lastNonZeroLeadSign) {
          facts.sawLeadChangeAfterHalftime = true;
        }
      }
      const sign = Math.sign(runningHome - runningAway);
      if (sign !== 0) {
        lastNonZeroLeadSign = sign;
      }
      if (period === 4) {
        if (runningHome < runningAway) {
          facts.homeTrailedInFourth = true;
        }
        if (runningAway < runningHome) {
          facts.awayTrailedInFourth = true;
        }
      }
    }

    if (scored) {
      const remaining = parseNFLPlayClockSeconds(play.clock_display);
      if (facts.firstScoreElapsedSeconds === null && period !== null && remaining !== null) {
        facts.firstScoreElapsedSeconds = (period - 1) * NFL_PERIOD_SECONDS + (NFL_PERIOD_SECONDS - remaining);
      }
      if (period === 2 && remaining !== null) {
        facts.minSecondsRemainingFirstHalfScore = Math.min(
          facts.minSecondsRemainingFirstHalfScore ?? Number.POSITIVE_INFINITY,
          remaining
        );
      }
      if (period === 4 && remaining !== null) {
        facts.minSecondsRemainingFourthScore = Math.min(
          facts.minSecondsRemainingFourthScore ?? Number.POSITIVE_INFINITY,
          remaining
        );
      }
      // A single row moving the score by exactly 8 is a touchdown plus a successful two-point try —
      // no other combination of scoring plays lands on one row — so the arithmetic stands alone
      // there, and 8 is *specifically* the boundary the corrupt-play guard permits: do not tighten
      // `MAX_POINTS_PER_PLAY` to 7 to "tidy" this.
      //
      // **A bare +2 does not stand alone.** It is a safety, a two-point try booked as its own row,
      // or a defensive conversion, and the delta cannot separate them — a touchdown row of +6
      // followed by a separate +2 used to grade as a safety. So a +2 is attributed by play type,
      // and a +2 nothing types makes *both* facts unknown rather than picking one; `null` voids,
      // which is the only honest answer to "which of these two squares just happened".
      if (delta === 8) {
        facts.sawTwoPointConversion = true;
      }
      if (delta === 2 && isNFLSafetyPlay(play)) {
        facts.sawSafety = true;
      } else if (delta === 2) {
        if (isNFLTwoPointConversionPlay(play)) {
          facts.sawTwoPointConversion = true;
        } else {
          if (facts.sawSafety !== true) {
            facts.sawSafety = null;
          }
          if (facts.sawTwoPointConversion !== true) {
            facts.sawTwoPointConversion = null;
          }
        }
      }
    }

    // A fourth-down conversion is the one fact with no score signal at all: it is a fourth down
    // that was not kicked away and that gained the distance (or scored).
    if (
      startDown === 4 &&
      !/punt|field-goal|field_goal|kick/.test(slug) &&
      (isTouchdown || (startDistance !== null && yardage >= startDistance))
    ) {
      facts.sawFourthDownConversion = true;
    }

    if (!scored) {
      continue;
    }

    if (facts.firstScoreKind === null) {
      facts.firstScoreKind = delta === 3 ? "field_goal" : delta === 2 ? "safety" : delta >= 6 ? "touchdown" : "other";
      facts.firstScoringTeam = scoringSide;
    }

    if (!isTouchdown) {
      continue;
    }

    if (yardage > facts.longestTouchdownYards) {
      facts.longestTouchdownYards = yardage;
    }
    const yardsToEndzone = parseNullableStatNumber(play.start_yards_to_endzone);
    if (yardsToEndzone !== null) {
      facts.shortestTouchdownYardsToEndzone = Math.min(
        facts.shortestTouchdownYardsToEndzone ?? Number.POSITIVE_INFINITY,
        yardsToEndzone
      );
    }
    if (isNFLNonOffensiveTouchdownPlay(play)) {
      facts.sawNonOffensiveTouchdown = true;
    }
    if (!facts.firstTouchdown) {
      facts.firstTouchdown = { team: scoringSide, scorerName: extractNFLTouchdownScorerName(play) };
    }
  }

  return facts;
}

/**
 * One `/nfl/v1/games` + `/nfl/v1/stats` (+ optional `/nfl/v1/plays`) pull per game, memoized in
 * `nflGameStatsCache` exactly as the NBA and MLB paths are. `includePlays` is per-card: a board
 * with no Optional-3b square never pays for the plays walk.
 */
async function getNFLGameStatsSnapshot(
  card: SportsBingoCardRow,
  options: { includePlays: boolean; includeTeamStats?: boolean }
): Promise<NFLGameStatsSnapshot | null> {
  if (card.sport_key !== "americanfootball_nfl") {
    return null;
  }

  const includeTeamStats = options.includeTeamStats === true;
  const now = Date.now();
  const cached = nflGameStatsCache.get(card.game_id);
  if (
    cached &&
    now < cached.expiresAt &&
    (cached.includedPlays || !options.includePlays) &&
    (cached.includedTeamStats || !includeTeamStats)
  ) {
    return cached.snapshot;
  }

  const remember = (snapshot: NFLGameStatsSnapshot | null): NFLGameStatsSnapshot | null => {
    nflGameStatsCache.set(card.game_id, {
      snapshot,
      includedPlays: options.includePlays,
      includedTeamStats: includeTeamStats,
      expiresAt: now + NBA_PLAYER_STATS_CACHE_MS,
    });
    return snapshot;
  };

  try {
    if (!isBallDontLieConfigured()) {
      return remember(null);
    }

    const startsAt = +new Date(card.starts_at);
    const lookbackMs = BALLDONTLIE_GAME_LOOKUP_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    // `dates[]`, never `start_date`/`end_date`: `/nfl/v1/games` silently ignores the latter and
    // returns 2002 archive rows, which match no card — leaving every NFL square pending until it
    // voids at BINGO_FORCE_FINALIZE_AFTER_START_MS. See buildBallDontLieDatesQuery's comment.
    const gameQuery = buildBallDontLieDatesQuery(startsAt - lookbackMs, startsAt + lookbackMs);
    const games = await fetchBallDontLieList<BallDontLieGame>("/nfl/v1/games", gameQuery);
    const matchedGame = pickBestMatchingBallDontLieGame(card, games);
    if (!matchedGame || typeof matchedGame.id !== "number") {
      return remember(null);
    }

    const statsQuery = new URLSearchParams({ per_page: "100" });
    statsQuery.append("game_ids[]", String(matchedGame.id));
    const stats = await fetchBallDontLieList<Record<string, unknown>>("/nfl/v1/stats", statsQuery);

    let playFacts = EMPTY_NFL_PLAY_FACTS;
    if (options.includePlays) {
      try {
        // A regulation game runs ~150-180 plays and the endpoint caps `per_page` at 100, so the
        // walk is capped at 4 pages: enough for a long overtime game, bounded against a runaway
        // cursor on a paid provider inside a 1-minute cron.
        const playsQuery = new URLSearchParams({ per_page: "100", game_id: String(matchedGame.id) });
        const truncation = { truncated: false };
        const plays = await fetchBallDontLieList<BallDontLieNFLPlay>("/nfl/v1/plays", playsQuery, {
          maxPages: NFL_PLAYS_MAX_PAGES,
          truncation,
        });
        // A truncated walk is a walk missing its tail, and every play-derived square settles its
        // *miss* on "this never happened in the whole game" — a claim a partial walk cannot make,
        // and one no regrade pass reopens. So a truncated walk is treated exactly like a failed
        // one: the facts stay unavailable and the 3b squares void instead of missing. The cap is
        // 400 rows against a ~197-play live maximum (measured over 46 real 2025 games), so this
        // fires only on the duplicate-row corruption the walk already documents.
        if (plays.length > 0 && !truncation.truncated) {
          playFacts = buildNFLPlayDerivedFacts(plays);
        }
      } catch {
        // Plays are the only optional leg: losing them holds the 3b squares pending rather than
        // taking down the box-score grading the rest of the board depends on.
      }
    }

    // Phase 8b: `/nfl/v1/team_stats` joins the existing snapshot rather than getting its own fetch
    // path, and only when the card actually holds a Tier-1 square — the same conditional the plays
    // walk already uses. `game_ids[]` accepts a list, so this is one call per game, not per team.
    let teamStatsFacts = EMPTY_NFL_TEAM_STATS;
    if (includeTeamStats) {
      try {
        const teamStatsQuery = new URLSearchParams({ per_page: "100" });
        teamStatsQuery.append("game_ids[]", String(matchedGame.id));
        const teamStatsRows = await fetchBallDontLieList<Record<string, unknown>>(
          "/nfl/v1/team_stats",
          teamStatsQuery
        );
        teamStatsFacts = buildNFLTeamStatsFacts(card, teamStatsRows);
      } catch {
        // Same posture as the plays leg: losing team_stats holds the Tier-1 squares pending rather
        // than taking down the box-score grading the rest of the board depends on.
      }
    }

    return remember(buildNFLGameStatsSnapshot(card, matchedGame, stats, playFacts, teamStatsFacts));
  } catch {
    return remember(null);
  }
}

/**
 * Phase 3 of docs/prop-bingo-nfl-activation-plan.md — the `live-stats:americanfootball_nfl` channel.
 *
 * Reused across sends rather than created per send. `supabaseAdmin.channel(name)` registers a new
 * channel object on the client every time it is called, and a `send()` on an unsubscribed channel
 * is an HTTP POST to the realtime broadcast endpoint — so creating one per row would leak channel
 * objects into a warm Fluid instance for no gain.
 */
let nflLiveStatsChannel: RealtimeChannel | null = null;

function getNFLLiveStatsChannel(): RealtimeChannel | null {
  if (!supabaseAdmin) {
    return null;
  }
  if (!nflLiveStatsChannel) {
    nflLiveStatsChannel = supabaseAdmin.channel(`live-stats:${NFL_LIVE_STAT_SPORT_KEY}`);
  }
  return nflLiveStatsChannel;
}

/**
 * `game_status` for a broadcast row. The client only ever displays it, so this stays coarse and
 * derives entirely from the snapshot we already hold — it must not cost a request.
 */
function nflLiveGameStatusLabel(snapshot: NFLGameStatsSnapshot): string {
  if (snapshot.finalized) {
    return "Final";
  }
  if (snapshot.quarters.quartersCompleted > 0 || snapshot.lines.length > 0) {
    return "In Progress";
  }
  return "Scheduled";
}

/**
 * Publish this game's changed player lines onto `live-stats:americanfootball_nfl`.
 *
 * This is the whole of NFL's live-event parity: BDL ships no NFL webhook, so the 1-minute sweep's
 * own `/nfl/v1/stats` pull is the heartbeat. **No new request is made here** — the snapshot is the
 * one the sweep already fetched and memoized for grading. Call it at most once per game per sweep.
 *
 * Sends are never awaited inline — that would put a realtime round-trip between two cards' square
 * updates — but they are *not* orphaned either: the promises are handed back so the sweep can
 * settle them all once before returning. A serverless invocation that returns with fetches still
 * in flight can have them cut off, which on a one-card sweep would silently drop every pop.
 * Failures are swallowed on purpose: the sweep's job is to settle squares, and a lost broadcast
 * costs one celebration while the next sweep re-diffs from the same stored baseline.
 */
function broadcastNFLLiveStatDeltas(
  card: SportsBingoCardRow,
  snapshot: NFLGameStatsSnapshot
): { broadcastRows: number; droppedRows: number; seeded: boolean; sends: Array<Promise<unknown>> } {
  const now = Date.now();
  for (const [gameId, state] of nflLiveStatStateByGameId) {
    if (now - state.touchedAt > NFL_LIVE_STAT_STATE_TTL_MS) {
      nflLiveStatStateByGameId.delete(gameId);
    }
  }

  const existing = nflLiveStatStateByGameId.get(card.game_id) ?? null;
  const plan = buildNflLiveStatBroadcastPlan({
    gameId: card.game_id,
    gameStatus: nflLiveGameStatusLabel(snapshot),
    lines: snapshot.lines,
    previousByPlayerKey: existing?.byPlayerKey ?? null,
  });
  nflLiveStatStateByGameId.set(card.game_id, { touchedAt: now, byPlayerKey: plan.nextByPlayerKey });

  const sends: Array<Promise<unknown>> = [];
  if (plan.rows.length > 0) {
    const channel = getNFLLiveStatsChannel();
    if (channel) {
      for (const row of plan.rows) {
        sends.push(
          channel.send({ type: "broadcast", event: "stat_update", payload: row }).catch(() => {
            // See the doc comment: a lost broadcast costs a celebration, never a settlement.
          })
        );
      }
    }
  }

  return { broadcastRows: plan.rows.length, droppedRows: plan.droppedRows, seeded: !existing, sends };
}

/**
 * Last-resort fuzzy name match: same last name, and a first name that matches or shares an initial
 * (so the gamebook's "A.Brown" still finds "A.J. Brown"). Factored out here rather than reusing the
 * NBA/MLB copies of this block, which are entangled with their own `pickLikeliest*` reducers.
 */
function matchPlayerLinesByName<T extends { playerName: string }>(lines: T[], playerName: string): T[] {
  const targetTokens = tokenizeName(playerName);
  if (targetTokens.length === 0) {
    return [];
  }
  const targetFirst = targetTokens[0] ?? "";
  const targetLast = targetTokens[targetTokens.length - 1] ?? "";
  const targetFirstInitial = targetFirst[0] ?? "";

  return lines.filter((line) => {
    const tokens = tokenizeName(line.playerName);
    if (tokens.length === 0) {
      return false;
    }
    const candidateFirst = tokens[0] ?? "";
    const candidateLast = tokens[tokens.length - 1] ?? "";
    if (!targetLast || candidateLast !== targetLast) {
      return false;
    }
    return candidateFirst === targetFirst || candidateFirst.startsWith(targetFirstInitial);
  });
}

function pickLikeliestNFLPlayerStatLine(lines: NFLPlayerStatLine[]): NFLPlayerStatLine | null {
  if (lines.length === 0) {
    return null;
  }
  const volume = (line: NFLPlayerStatLine): number =>
    line.passingAttempts + line.rushingAttempts + line.receptions + line.fieldGoalsMade + line.extraPointsMade;
  return lines.reduce((best, current) => (volume(current) > volume(best) ? current : best));
}

function findNFLPlayerStatLine(snapshot: NFLGameStatsSnapshot, playerRef: string): NFLPlayerStatLine | null {
  const ref = parseResolverPlayerRef(playerRef);
  if (ref.playerId) {
    const byId = snapshot.lines.filter((line) => line.playerId === ref.playerId);
    if (byId.length > 0) {
      return pickLikeliestNFLPlayerStatLine(byId);
    }
  }

  const exact = snapshot.byPlayerKey.get(normalizeNameKey(ref.displayName || playerRef));
  if (exact && exact.length > 0) {
    return pickLikeliestNFLPlayerStatLine(exact);
  }

  return pickLikeliestNFLPlayerStatLine(matchPlayerLinesByName(snapshot.lines, ref.displayName || playerRef));
}

/**
 * Box-score value for a Phase 0 §3 allowlist prop type. `kicking_points` is the one **derived**
 * entry — BDL exposes no such field and its `total_points` column is dead (populated in 0/60 rows
 * sampled in Phase 0), so it is computed as `3 × FGM + XPM`. That formula assumes every field goal
 * is worth three, which is true in every scoring rulebook the NFL has ever used, but it is still
 * the one number in this function that has never been checked against a settled book line —
 * validate it the first time a real `kicking_points` square settles.
 */
function getNFLPlayerPropValue(line: NFLPlayerStatLine, marketKey: string): number | null {
  switch (marketKey) {
    case "passing_yards":
      return line.passingYards;
    case "passing_tds":
      return line.passingTouchdowns;
    case "passing_attempts":
      return line.passingAttempts;
    case "passing_completions":
      return line.passingCompletions;
    case "interceptions":
      return line.passingInterceptions;
    case "rushing_yards":
      return line.rushingYards;
    case "rushing_attempts":
      return line.rushingAttempts;
    case "receptions":
      return line.receptions;
    case "receiving_yards":
      return line.receivingYards;
    case "rushing_receiving_yards":
      return line.rushingYards + line.receivingYards;
    case "longest_rush":
      return line.longRushing;
    case "longest_reception":
      return line.longReception;
    case "fg_made":
      return line.fieldGoalsMade;
    case "kicking_points":
      return 3 * line.fieldGoalsMade + line.extraPointsMade;
    default:
      return null;
  }
}

/**
 * Does a stored resolver player ref ("A.J. Brown::13") name the same person as a play-by-play
 * scorer string? Exact normalized match first, then the same last-name + first-initial rule the
 * box-score lookup uses, because the two feeds render names differently.
 */
function nflPlayerRefMatchesName(playerRef: string, scorerName: string): boolean {
  const ref = parseResolverPlayerRef(playerRef);
  const target = ref.displayName || playerRef;
  if (!target || !scorerName) {
    return false;
  }
  if (normalizeNameKey(target) === normalizeNameKey(scorerName)) {
    return true;
  }
  return matchPlayerLinesByName([{ playerName: scorerName }], target).length > 0;
}

/** Any touchdown the books settle `anytime_td` on — rushing, receiving, return and recovery. */
function nflPlayerTouchdowns(line: NFLPlayerStatLine): number {
  return line.rushingTouchdowns + line.receivingTouchdowns + line.otherTouchdowns;
}

/**
 * Phase 5c of docs/prop-bingo-nfl-plan.md — grade a set of resolvers against a **completed**
 * balldontlie NFL game, for the backtest mode of `npm run bingo:simulate`.
 *
 * This exists so the harness can drive the **shipped** graders (`buildNFLGameStatsSnapshot`,
 * `buildNFLPlayDerivedFacts`, `evaluateResolver`) over archived games instead of mirroring them in
 * a script — the same discipline `scripts/validate-nfl-bingo-grading.cjs` follows, for the same
 * reason: a mirrored copy validates the mirror, not the grader.
 *
 * It takes raw provider rows rather than a card, because a backtest has no card: the synthetic card
 * row below exists only to give the snapshot builders the home/away names they resolve team sides
 * against. Nothing here touches Supabase, the cache, or the network.
 */
export function gradeResolversAgainstCompletedNFLGame(params: {
  game: Record<string, unknown>;
  homeTeam: string;
  awayTeam: string;
  statRows: Array<Record<string, unknown>>;
  plays?: Array<Record<string, unknown>>;
  /**
   * Phase 8b — `/nfl/v1/team_stats` rows for this game. Optional, and omitting them is not the same
   * as passing none: with no rows every Tier-1 square grades `void`, which a backtest counts as an
   * ungraded square rather than a miss. `npm run bingo:simulate --backtest` passes them.
   */
  teamStatRows?: Array<Record<string, unknown>>;
  resolvers: SportsBingoResolver[];
}): Array<{ status: "pending" | "hit" | "miss" | "void"; resolved: boolean }> {
  const game = params.game as BallDontLieGame;
  const card = {
    game_id: String(game.id ?? ""),
    sport_key: "americanfootball_nfl",
    home_team: params.homeTeam,
    away_team: params.awayTeam,
    starts_at: String(game.datetime ?? game.date ?? new Date().toISOString()),
  } as SportsBingoCardRow;

  const playRows = params.plays ?? [];
  const playFacts =
    playRows.length > 0 ? buildNFLPlayDerivedFacts(playRows as unknown as BallDontLieNFLPlay[]) : EMPTY_NFL_PLAY_FACTS;
  const teamStatsFacts = buildNFLTeamStatsFacts(card, params.teamStatRows ?? []);
  const nflSnapshot = buildNFLGameStatsSnapshot(card, game, params.statRows, playFacts, teamStatsFacts);

  const scoreSnapshot: ScoreSnapshot = {
    gameId: card.game_id,
    sportKey: "americanfootball_nfl",
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    homeScore: nflSnapshot.homeScore,
    awayScore: nflSnapshot.awayScore,
    completed: nflSnapshot.finalized,
  };

  return params.resolvers.map((resolver) => evaluateResolver(resolver, scoreSnapshot, null, null, nflSnapshot));
}

/**
 * Phase 7 of docs/prop-bingo-nfl-plan.md — settle an MLB board against a completed game.
 *
 * The MLB counterpart to `gradeResolversAgainstCompletedNFLGame`, and the seam the Phase 7
 * calibration slate grades through, so that test measures the shipped `evaluateResolver` rather
 * than a reimplementation of it.
 *
 * The one thing worth stating: `mlb_webhook_team_event_at_least` normally settles by counting live
 * webhook events, so a completed game has no natural `currentCount`. But the count the webhook
 * would have accumulated *is* the team's box-score total for that event, so `teamEventTotals` seeds
 * it directly. Events outside the measured six (notably `quick_out_under_3_pitches`, which is
 * derived from our own stream and has no box-score column) are left unseeded and evaluate as a
 * miss on a completed game — which is the conservative reading, the same one `boardStatusesMakeALine`
 * takes for voids.
 */
export function gradeResolversAgainstCompletedMLBGame(params: {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  teamEventTotals: { home: Record<string, number>; away: Record<string, number> };
  resolvers: SportsBingoResolver[];
}): Array<{ status: "pending" | "hit" | "miss" | "void"; resolved: boolean }> {
  const scoreSnapshot: ScoreSnapshot = {
    gameId: params.gameId,
    sportKey: "baseball_mlb",
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    homeScore: params.homeScore,
    awayScore: params.awayScore,
    completed: true,
  };

  return params.resolvers.map((resolver) => {
    if (resolver.kind === "mlb_webhook_team_event_at_least") {
      const totals = resolver.team === "home" ? params.teamEventTotals.home : params.teamEventTotals.away;
      const currentCount = Number(totals[resolver.event] ?? 0);
      return evaluateResolver({ ...resolver, currentCount }, scoreSnapshot);
    }
    return evaluateResolver(resolver, scoreSnapshot);
  });
}

/**
 * Phase 5c — does a settled board make a line? The generator's own `LINE_PATTERNS`, exposed so the
 * backtest counts a win exactly the way `refreshSportsBingoProgress` does.
 *
 * A `void` square is treated as a miss here, which is the conservative reading: in production a
 * void is replaced or regraded, so a backtest counting it as a hit would overstate the win rate.
 */
export function boardStatusesMakeALine(statusByIndex: Array<{ index: number; hit: boolean }>): boolean {
  const hits = new Set(statusByIndex.filter((entry) => entry.hit).map((entry) => entry.index));
  hits.add(12);
  return LINE_PATTERNS.some((line) => line.every((index) => hits.has(index)));
}

function toNFLLiveScoreSnapshot(card: SportsBingoCardRow, snapshot: NFLGameStatsSnapshot | null): ScoreSnapshot | null {
  if (card.sport_key !== "americanfootball_nfl" || !snapshot) {
    return null;
  }
  if (snapshot.homeScore === null || snapshot.awayScore === null) {
    return null;
  }
  return {
    gameId: card.game_id,
    sportKey: card.sport_key,
    homeTeam: card.home_team,
    awayTeam: card.away_team,
    homeScore: snapshot.homeScore,
    awayScore: snapshot.awayScore,
    completed: snapshot.finalized,
  };
}

/** Does this resolver need the `/nfl/v1/plays` walk, or is the box score enough? */
function nflResolverNeedsPlays(resolver: SportsBingoResolver): boolean {
  switch (resolver.kind) {
    case "nfl_first_score_is_field_goal":
    case "nfl_first_scorer_wins":
    case "nfl_non_offensive_touchdown":
    case "nfl_fourth_down_conversion":
    case "nfl_long_touchdown":
    case "nfl_player_first_td":
    // Phase 8b Tier 3 rides the same walk, so it rides the same conditional — and the same
    // `BINGO_NFL_PLAY_BY_PLAY_SQUARES_ENABLED` kill switch, which now covers twice the surface.
    case "nfl_first_score_within_minutes":
    case "nfl_score_in_final_minutes":
    case "nfl_both_teams_lead":
    case "nfl_lead_change_second_half":
    case "nfl_tied_after_halftime":
    case "nfl_winner_trailed_in_fourth":
    case "nfl_two_point_conversion":
    case "nfl_safety":
    case "nfl_goal_line_touchdown":
      return true;
    default:
      return false;
  }
}

/**
 * Phase 8b — does this resolver need `/nfl/v1/team_stats`? Delegated to the flavor catalog so the
 * answer cannot drift from the list of kinds that actually read it.
 */
function nflResolverNeedsTeamStats(resolver: SportsBingoResolver): boolean {
  return isNFLTeamStatsResolver(resolver);
}

function toNBALiveScoreSnapshot(card: SportsBingoCardRow, snapshot: NBAGamePlayerStatsSnapshot | null): ScoreSnapshot | null {
  if (!isBasketballSportKey(card.sport_key) || !snapshot) {
    return null;
  }

  if (snapshot.homeScore === null || snapshot.awayScore === null) {
    return null;
  }

  return {
    gameId: card.game_id,
    sportKey: card.sport_key,
    homeTeam: card.home_team,
    awayTeam: card.away_team,
    homeScore: snapshot.homeScore,
    awayScore: snapshot.awayScore,
    completed: snapshot.finalized,
  };
}

function toMLBLiveScoreSnapshot(card: SportsBingoCardRow, snapshot: MLBGamePlayerStatsSnapshot | null): ScoreSnapshot | null {
  if (card.sport_key !== "baseball_mlb" || !snapshot) {
    return null;
  }

  if (snapshot.homeScore === null || snapshot.awayScore === null) {
    return null;
  }

  return {
    gameId: card.game_id,
    sportKey: card.sport_key,
    homeTeam: card.home_team,
    awayTeam: card.away_team,
    homeScore: snapshot.homeScore,
    awayScore: snapshot.awayScore,
    completed: snapshot.finalized,
  };
}

function addFirstHalfAccumulator(
  map: Map<number, { pts: number; ast: number; stl: number }>,
  playerId: number,
  pts: number,
  ast: number,
  stl: number
): void {
  const existing = map.get(playerId) ?? { pts: 0, ast: 0, stl: 0 };
  existing.pts += pts;
  existing.ast += ast;
  existing.stl += stl;
  map.set(playerId, existing);
}

function mergeLiveScores(
  primary: ScoreSnapshot | null | undefined,
  fallback: ScoreSnapshot | null | undefined
): ScoreSnapshot | null {
  if (!primary) {
    return fallback ?? null;
  }
  if (!fallback) {
    return primary;
  }

  return {
    ...primary,
    homeScore: primary.homeScore ?? fallback.homeScore,
    awayScore: primary.awayScore ?? fallback.awayScore,
    completed: primary.completed || fallback.completed,
  };
}

function pickLikeliestPlayerStatLine(lines: NBAPlayerStatLine[]): NBAPlayerStatLine | null {
  if (lines.length === 0) {
    return null;
  }
  return lines.reduce((best, current) => {
    const bestVolume = best.pts + best.reb + best.ast + best.stl + best.blk;
    const currentVolume = current.pts + current.reb + current.ast + current.stl + current.blk;
    return currentVolume > bestVolume ? current : best;
  });
}

function findNBAPlayerStatLine(snapshot: NBAGamePlayerStatsSnapshot, playerName: string): NBAPlayerStatLine | null {
  const ref = parseResolverPlayerRef(playerName);
  if (ref.playerId) {
    const byId = snapshot.lines.filter((line) => line.playerId === ref.playerId);
    if (byId.length > 0) {
      return pickLikeliestPlayerStatLine(byId);
    }
  }

  const exact = snapshot.byPlayerKey.get(normalizeNameKey(ref.displayName || playerName));
  if (exact && exact.length > 0) {
    return pickLikeliestPlayerStatLine(exact);
  }

  const targetTokens = tokenizeName(ref.displayName || playerName);
  if (targetTokens.length === 0) {
    return null;
  }
  const targetFirst = targetTokens[0] ?? "";
  const targetLast = targetTokens[targetTokens.length - 1] ?? "";
  const targetFirstInitial = targetFirst[0] ?? "";

  const candidates = snapshot.lines.filter((line) => {
    const tokens = tokenizeName(line.playerName);
    if (tokens.length === 0) {
      return false;
    }
    const candidateFirst = tokens[0] ?? "";
    const candidateLast = tokens[tokens.length - 1] ?? "";
    if (!targetLast || candidateLast !== targetLast) {
      return false;
    }
    return candidateFirst === targetFirst || candidateFirst.startsWith(targetFirstInitial);
  });

  return pickLikeliestPlayerStatLine(candidates);
}

function pickLikeliestMLBPlayerStatLine(lines: MLBPlayerStatLine[]): MLBPlayerStatLine | null {
  if (lines.length === 0) {
    return null;
  }
  return lines.reduce((best, current) => {
    const bestVolume = best.hits + best.runs + best.rbis + best.homeRuns + best.stolenBases + best.strikeoutsPitcher;
    const currentVolume =
      current.hits + current.runs + current.rbis + current.homeRuns + current.stolenBases + current.strikeoutsPitcher;
    return currentVolume > bestVolume ? current : best;
  });
}

/** Exported for the validator's player-name lookup metric. */
export function findMLBPlayerStatLine(snapshot: MLBGamePlayerStatsSnapshot, playerName: string): MLBPlayerStatLine | null {
  const ref = parseResolverPlayerRef(playerName);
  if (ref.playerId) {
    const byId = snapshot.lines.filter((line) => line.playerId === ref.playerId);
    if (byId.length > 0) {
      return pickLikeliestMLBPlayerStatLine(byId);
    }
  }

  const exact = snapshot.byPlayerKey.get(normalizeNameKey(ref.displayName || playerName));
  if (exact && exact.length > 0) {
    return pickLikeliestMLBPlayerStatLine(exact);
  }

  const targetTokens = tokenizeName(ref.displayName || playerName);
  if (targetTokens.length === 0) {
    return null;
  }
  const targetFirst = targetTokens[0] ?? "";
  const targetLast = targetTokens[targetTokens.length - 1] ?? "";
  const targetFirstInitial = targetFirst[0] ?? "";

  const candidates = snapshot.lines.filter((line) => {
    const tokens = tokenizeName(line.playerName);
    if (tokens.length === 0) {
      return false;
    }
    const candidateFirst = tokens[0] ?? "";
    const candidateLast = tokens[tokens.length - 1] ?? "";
    if (!targetLast || candidateLast !== targetLast) {
      return false;
    }
    return candidateFirst === targetFirst || candidateFirst.startsWith(targetFirstInitial);
  });

  return pickLikeliestMLBPlayerStatLine(candidates);
}

function resolveSnapshotPlayerId(snapshot: NBAGamePlayerStatsSnapshot, playerName: string): number | null {
  const parsed = parseResolverPlayerRef(playerName);
  if (parsed.playerId) {
    return parsed.playerId;
  }
  const line = findNBAPlayerStatLine(snapshot, playerName);
  return line?.playerId ?? null;
}

function getNBAPlayerPropValue(line: NBAPlayerStatLine, marketKey: string): number | null {
  switch (marketKey) {
    case "player_points":
      return line.pts;
    case "player_rebounds":
      return line.reb;
    case "player_assists":
      return line.ast;
    case "player_steals":
      return line.stl;
    case "player_blocks":
      return line.blk;
    case "player_threes":
      return line.threes;
    case "player_turnovers":
      return line.turnover;
    case "player_points_rebounds":
      return line.pts + line.reb;
    case "player_points_assists":
      return line.pts + line.ast;
    case "player_rebounds_assists":
      return line.reb + line.ast;
    case "player_points_rebounds_assists":
      return line.pts + line.reb + line.ast;
    default:
      return null;
  }
}

function getMLBPlayerPropValue(line: MLBPlayerStatLine, marketKey: string): number | null {
  switch (marketKey) {
    case "player_hits":
      return line.hits;
    case "player_home_runs":
      return line.homeRuns;
    case "player_rbis":
      return line.rbis;
    case "player_runs":
      return line.runs;
    case "player_stolen_bases":
      return line.stolenBases;
    case "player_strikeouts_pitcher":
      return line.strikeoutsPitcher;
    case "player_earned_runs":
      return line.earnedRuns;
    case "player_pitcher_outs":
      return line.pitcherOuts;
    default:
      return null;
  }
}

function getNBAPlayerMilestoneValue(line: NBAPlayerStatLine, metric: NBAPlayerMilestoneMetric): number | null {
  switch (metric) {
    case "points":
      return line.pts;
    case "rebounds":
      return line.reb;
    case "assists":
      return line.ast;
    case "steals":
      return line.stl;
    case "blocks":
      return line.blk;
    case "threes":
      return line.threes;
    case "offensive_rebounds":
      return line.oreb;
    case "free_throws_made":
      return line.ftm;
    case "defensive_rebounds":
      return line.dreb;
    case "two_point_fg":
      return Math.max(0, line.fgm - line.threes);
    case "minutes_played":
      return line.minSeconds / 60;
    default:
      return null;
  }
}

function hasDoubleDouble(line: NBAPlayerStatLine): boolean {
  const categories = [line.pts, line.reb, line.ast, line.stl, line.blk];
  return categories.filter((value) => Number.isFinite(value) && value >= 10).length >= 2;
}

type NBATeamAggregates = {
  points: number;
  blocks: number;
  steals: number;
  madeThrees: number;
  offensiveRebounds: number;
  totalRebounds: number;
  totalAssists: number;
  totalTurnovers: number;
  fgm: number;
  fga: number;
  ftm: number;
  fta: number;
  scorers: number;
  doubleDoubleCount: number;
  threePtScorerCount: number;
};

function buildNBATeamAggregates(snapshot: NBAGamePlayerStatsSnapshot, team: TeamSide): NBATeamAggregates {
  const players = snapshot.lines.filter((line) => line.teamSide === team);
  const base: NBATeamAggregates = {
    points: 0,
    blocks: 0,
    steals: 0,
    madeThrees: 0,
    offensiveRebounds: 0,
    totalRebounds: 0,
    totalAssists: 0,
    totalTurnovers: 0,
    fgm: 0,
    fga: 0,
    ftm: 0,
    fta: 0,
    scorers: 0,
    doubleDoubleCount: 0,
    threePtScorerCount: 0,
  };

  for (const player of players) {
    base.points += player.pts;
    base.blocks += player.blk;
    base.steals += player.stl;
    base.madeThrees += player.threes;
    base.offensiveRebounds += player.oreb;
    base.totalRebounds += player.reb;
    base.totalAssists += player.ast;
    base.totalTurnovers += player.turnover;
    base.fgm += player.fgm;
    base.fga += player.fga;
    base.ftm += player.ftm;
    base.fta += player.fta;
    if (player.pts > 0) {
      base.scorers += 1;
    }
    if (hasDoubleDouble(player)) {
      base.doubleDoubleCount += 1;
    }
    if (player.threes > 0) {
      base.threePtScorerCount += 1;
    }
  }

  return base;
}

function getNBATeamMilestoneValue(aggregates: NBATeamAggregates, metric: NBATeamMilestoneMetric): number | null {
  switch (metric) {
    case "points":
      return aggregates.points;
    case "blocks":
      return aggregates.blocks;
    case "steals":
      return aggregates.steals;
    case "made_threes":
      return aggregates.madeThrees;
    case "offensive_rebounds":
      return aggregates.offensiveRebounds;
    case "total_rebounds":
      return aggregates.totalRebounds;
    case "total_assists":
      return aggregates.totalAssists;
    case "field_goal_pct":
      if (aggregates.fga <= 0) {
        return null;
      }
      return (aggregates.fgm / aggregates.fga) * 100;
    case "free_throw_pct":
      if (aggregates.fta <= 0) {
        return null;
      }
      return (aggregates.ftm / aggregates.fta) * 100;
    default:
      return null;
  }
}

function isNBAPlayerPropMarketSupported(marketKey: string): boolean {
  return NBA_SETTLABLE_PLAYER_PROP_MARKETS.has(marketKey);
}

function isMLBPlayerPropMarketSupported(marketKey: string): boolean {
  return MLB_SETTLABLE_PLAYER_PROP_MARKETS.has(marketKey);
}

function isNFLPlayerPropMarketSupported(marketKey: string): boolean {
  return NFL_SETTLABLE_PLAYER_PROP_MARKETS.has(marketKey);
}

/**
 * How many of these candidates can actually reach a board, i.e. how many survive the same
 * `supportLevel` filter `getGameEntryWithCandidates` applies. Player-prop and achievement squares
 * are added later and only ever add to this count, so a game below 24 here can never produce a
 * board.
 */
function boardableCandidateCount(candidates: SportsBingoSquareTemplate[]): number {
  if (BINGO_ALLOW_POSSIBLE_SQUARES) {
    return candidates.length;
  }
  return candidates.filter((item) => (item.supportLevel ?? "supported") === "supported").length;
}

function aggregateCandidates(raw: SportsBingoSquareTemplate[]): SportsBingoSquareTemplate[] {
  const byKey = new Map<string, { template: SportsBingoSquareTemplate; sum: number; count: number }>();

  for (const item of raw) {
    const key = item.key;
    const existing = byKey.get(key);
    if (existing) {
      existing.sum += item.probability;
      existing.count += 1;
      continue;
    }
    byKey.set(key, {
      template: item,
      sum: item.probability,
      count: 1,
    });
  }

  return [...byKey.values()].map((entry) => ({
    ...entry.template,
    probability: clamp(entry.sum / entry.count, 0.03, 0.97),
    supportLevel: entry.template.supportLevel ?? "supported",
  }));
}

async function getGameEntryWithCandidates(params: {
  sportKey: string;
  gameId: string;
  includePlayerProps?: boolean;
}): Promise<{ game: SportsBingoGame; candidates: SportsBingoSquareTemplate[] } | null> {
  const includePlayerProps = params.includePlayerProps !== false;
  const cacheKey = `${params.sportKey}:${params.gameId}:${includePlayerProps ? "with_props" : "without_props"}`;
  const cached = gameEntryWithCandidatesCache.get(cacheKey);
  const now = Date.now();
  if (cached && now < cached.expiresAt) {
    return {
      game: { ...cached.entry.game },
      candidates: cached.entry.candidates.map((candidate) => ({ ...candidate })),
    };
  }

  const catalog = await getGameCatalog(params.sportKey);
  const entry = catalog.find((item) => item.game.id === params.gameId);
  if (!entry) {
    return null;
  }

  let candidates = [...entry.candidates];
  let merged = [...candidates];

  if (isBasketballSportKey(entry.game.sportKey)) {
    const achievementCandidates = await buildNBAAchievementCandidates(entry.game, merged);
    if (achievementCandidates.length > 0) {
      merged = aggregateCandidates([...merged, ...achievementCandidates]);
    }
  }
  if (includePlayerProps && entry.game.sportKey === "baseball_mlb") {
    // Phase 9d: the season usage/production half of MLB's star signal. `resolveMLBStarIndex` caches
    // the underlying `/mlb/v1/season_stats` pull for 24h (see lib/sportsBingoMlbStars.ts), so a
    // 15-game slate shares one league-wide pull instead of issuing one per game. A feed failure
    // degrades to empty maps — market-attention-only tilt, never a broken board.
    const mlbStarIndex = await resolveMLBStarIndex();
    const mlbProps = await buildMLBPlayerPropCandidates(entry.game, mlbStarIndex);
    if (mlbProps.candidates.length > 0) {
      merged = aggregateCandidates([...merged, ...mlbProps.candidates]);
    }
    // Always blend in player-specific achievements derived from historical MLB stat trends
    // so boards stay realistic even when external player-prop feeds are sparse/noisy.
    //
    // Phase 5 (code-review fix plan): reuse the pool the call above already built when it fell back
    // to the historical path, rather than fetching it twice. Aggregation is unchanged either way —
    // `aggregateCandidates` averages duplicate keys, so folding the same template in twice produced
    // the identical probability it produces once.
    const mlbHistoricalCandidates =
      mlbProps.historical ?? (await buildMLBPlayerPropCandidatesFromRecentStats(entry.game));
    if (mlbHistoricalCandidates.length > 0) {
      const historicalAchievements = mlbHistoricalCandidates.filter((item) => item.bucket === "achievement");
      if (historicalAchievements.length > 0) {
        merged = aggregateCandidates([...merged, ...historicalAchievements]);
      }
    }
  }
  // Phase 3: NFL player props. Skipped for a game the books never priced — that game already has no
  // supported core squares, so there is no board to hang props on, and it saves a live-feed call.
  if (includePlayerProps && entry.game.sportKey === "americanfootball_nfl" && entry.marketModel) {
    const nflPropMarkets = await fetchNFLPlayerPropMarkets(entry.game.id, {
      includePlayByPlay: NFL_PLAY_BY_PLAY_SQUARES_ENABLED,
    });
    // Phase 9c: the season usage/production half of the star signal. `resolveNFLStarIndex` caches
    // the underlying `/nfl/v1/season_stats` pull for 24h (see lib/sportsBingoNflStars.ts), so a
    // 13-game Sunday slate shares one league-wide pull instead of issuing one per game. A feed
    // failure degrades to empty maps, which is the same market-attention-only fallback Phase 9b
    // shipped when this argument was still `null`.
    const nflStarIndex = await resolveNFLStarIndex();
    // Phase 4: drop props for players the injury feed lists as not playing this week, before the
    // board is assembled. 24h-cached process-wide (see lib/sportsBingoNflInjuries.ts), so a full
    // Sunday slate shares one `/nfl/v1/player_injuries` pull; a feed failure degrades to "no
    // signal" and settlement's void still covers a scratch that slips through.
    const nflInjuryIndex = await resolveNFLInjuryIndex();
    const nflPropCandidates = buildNFLPlayerPropCandidates(
      entry.game,
      nflPropMarkets,
      nflStarIndex,
      nflInjuryIndex
    );
    if (nflPropCandidates.length > 0) {
      merged = aggregateCandidates([...merged, ...nflPropCandidates]);
    }
  }

  if (!BINGO_ALLOW_POSSIBLE_SQUARES) {
    merged = merged.filter((item) => (item.supportLevel ?? "supported") === "supported");
  }

  candidates = merged
    .map((item) => ({ ...item, probability: clamp(item.probability, 0.05, 0.95) }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const output = {
    game: entry.game,
    candidates,
  };
  gameEntryWithCandidatesCache.set(cacheKey, {
    entry: {
      game: { ...output.game },
      candidates: output.candidates.map((candidate) => ({ ...candidate })),
    },
    expiresAt: Date.now() + 60_000,
  });

  return output;
}

/**
 * Optional 3b (play-by-play squares) is ON by default: Phase 0 §2 confirmed `/nfl/v1/plays` returns
 * 200 on our tier for both upcoming and completed games. The flag exists as a one-env kill switch
 * for the whole family, because these are the squares whose settlement (Phase 4) is the most
 * involved — if plays-derived grading turns out unreliable on a live slate, this removes them from
 * new boards without touching code.
 */
const NFL_PLAY_BY_PLAY_SQUARES_ENABLED =
  String(process.env.BINGO_NFL_PLAY_BY_PLAY_SQUARES_ENABLED ?? "true").trim().toLowerCase() !== "false";

/** The yardage threshold for the "long touchdown" play-by-play square. */
const NFL_LONG_TOUCHDOWN_YARDS = 50;

/**
 * Phase 8b — how much of a board the Tier-1 (`/nfl/v1/team_stats`) flavor block may own.
 *
 * The board cap is 3 by default because 8a's Q1 is still open: nobody has been able to observe
 * whether BDL populates `team_stats` mid-game or only at the whistle, and it cannot be observed
 * until a real NFL game is being played. Final-only is the conservative reading, and the plan's
 * instruction for it is a cap of ~3 so a card still lights up during the game. Env-tunable so the
 * Week-1 live check can raise it without a deploy.
 */
const intFromEnv = (raw: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const NFL_TIER1_MAX_SQUARES_PER_BOARD = Math.max(0, intFromEnv(process.env.BINGO_NFL_TIER1_MAX_PER_BOARD, 3));
/** And no more than this many from either single team's box score. */
const NFL_TIER1_MAX_SQUARES_PER_TEAM = Math.max(1, intFromEnv(process.env.BINGO_NFL_TIER1_MAX_PER_TEAM, 2));

/**
 * Phase 3 of docs/prop-bingo-nfl-plan.md — the team / game / quarter squares.
 *
 * These are the backbone of an NFL board: they need no player props and no roster join, so they
 * exist for every game the books have priced, and they are what makes a board read like a bar
 * argument instead of a spread ladder. Each one grades purely off `/nfl/v1/games` (final score plus
 * `home_team_q1..q4` / `visitor_team_q1..q4` / `_ot`) or, for the 3b block, `/nfl/v1/plays`.
 *
 * Probabilities come from `NFLMarketModel`, so a 51-point shootout and a 38-point slog get
 * genuinely different quarter/margin numbers rather than one shared league constant.
 */
function buildNFLTeamGameCandidates(
  game: SportsBingoGame,
  marketModel: NFLMarketModel,
  supportLevel: SquareSupportLevel
): SportsBingoSquareTemplate[] {
  const candidates: SportsBingoSquareTemplate[] = [];
  const push = (resolver: SportsBingoResolver, probability: number) => {
    candidates.push({
      key: resolverKey(resolver),
      label: buildSquareLabel(game, resolver),
      resolver,
      probability: clamp(probability, 0.05, 0.95),
      bucket: "special",
      supportLevel,
    });
  };

  for (const team of ["home", "away"] as const) {
    const everyQuarter = marketModel.scoresEveryQuarter(team);
    push({ kind: "nfl_team_scores_every_quarter", team }, everyQuarter);
    // Exactly complementary by construction, and marked mutually exclusive so the two never share
    // a line. Kept because a board wants a couple of likely squares to make lines reachable at all.
    push({ kind: "nfl_team_shutout_quarter", team }, 1 - everyQuarter);
    push({ kind: "nfl_team_leads_at_halftime", team }, marketModel.leadsAtHalftime(team));
    push(
      { kind: "nfl_team_quarter_points_at_least", team, threshold: 14 },
      marketModel.quarterPointsAtLeast(team, 14)
    );
  }

  push({ kind: "nfl_any_quarter_scoreless" }, marketModel.anyQuarterScoreless());
  push({ kind: "nfl_halftime_leader_loses" }, nflHalftimeLeaderLosesProbability(marketModel.homeSpread));
  push({ kind: "nfl_overtime" }, marketModel.overtime());
  push({ kind: "nfl_both_teams_score_at_least", threshold: 20 }, marketModel.bothTeamsScoreAtLeast(19.5));
  push({ kind: "nfl_margin_at_most", line: 3.5 }, marketModel.marginAbsAtMost(3.5));
  push({ kind: "nfl_margin_at_most", line: 7.5 }, marketModel.marginAbsAtMost(7.5));
  push({ kind: "nfl_margin_at_least", line: 16.5 }, marketModel.marginAbsAtLeast(16.5));
  // Halves are close to symmetric, so this one is deliberately market-independent: it is the
  // closest thing on the board to a pure coin flip, and every board wants one.
  push({ kind: "nfl_second_half_higher_scoring" }, NFL_SECOND_HALF_HIGHER_BASE);

  if (NFL_PLAY_BY_PLAY_SQUARES_ENABLED) {
    push(
      { kind: "nfl_first_score_is_field_goal" },
      shadeByTotal(NFL_FIRST_SCORE_IS_FIELD_GOAL_BASE, marketModel.total, -1)
    );
    push({ kind: "nfl_first_scorer_wins" }, NFL_FIRST_SCORER_WINS_BASE);
    push({ kind: "nfl_non_offensive_touchdown" }, NFL_NON_OFFENSIVE_TD_BASE);
    push({ kind: "nfl_fourth_down_conversion" }, NFL_FOURTH_DOWN_CONVERSION_BASE);
    push(
      { kind: "nfl_long_touchdown", yards: NFL_LONG_TOUCHDOWN_YARDS },
      shadeByTotal(NFL_LONG_TOUCHDOWN_BASE, marketModel.total, 1)
    );
  }

  // --- Phase 8b: the flavor slate --------------------------------------------------------------
  // ~45 measured squares from `lib/sportsBingoNflFlavor.ts`. Tier 3 rides the plays walk, so it
  // sits behind the same kill switch as Optional 3b; Tier 1 and 2 do not.
  for (const flavor of buildNFLFlavorSquares()) {
    if (flavor.tier === 3 && !NFL_PLAY_BY_PLAY_SQUARES_ENABLED) {
      continue;
    }
    const probability =
      flavor.totalShade === 0 ? flavor.baseRate : shadeByTotal(flavor.baseRate, marketModel.total, flavor.totalShade);
    candidates.push({
      key: resolverKey(flavor.resolver),
      label: buildSquareLabel(game, flavor.resolver),
      resolver: flavor.resolver,
      probability: clamp(probability, 0.05, 0.95),
      bucket: "special",
      supportLevel,
      teamHint: nflFlavorTeamSide(flavor.resolver),
    });
  }

  return candidates;
}

/**
 * `marketModel` (Phase 2 of docs/prop-bingo-nfl-plan.md) is only ever non-null for NFL games whose
 * slate odds came back from balldontlie. When present, every core probability below is derived
 * from the real market consensus instead of the league-average constants. NBA/WNBA/MLB always
 * pass null and take the untouched legacy path.
 */
function buildGameAndCandidatesFromBallDontLie(
  sportKey: string,
  gameData: BallDontLieGame,
  marketModel: NFLMarketModel | null = null,
  extraCandidates: SportsBingoSquareTemplate[] = []
): GameCatalogEntry | null {
  const gameId = String(gameData.id ?? "").trim();
  const eventRecord = gameData as unknown as Record<string, unknown>;
  const homeTeam = extractTeamName(eventRecord, "home");
  const awayTeam = extractTeamName(eventRecord, "away");
  const startsAt = extractEventStartIso(gameData as unknown as Record<string, unknown>);
  if (!gameId || !homeTeam || !awayTeam || !startsAt) {
    return null;
  }

  const startsAtDate = new Date(startsAt);
  if (Number.isNaN(startsAtDate.getTime())) {
    return null;
  }

  const game: SportsBingoGame = {
    id: gameId,
    sportKey,
    homeTeam,
    awayTeam,
    startsAt: startsAtDate.toISOString(),
    gameLabel: toGameLabel(homeTeam, awayTeam),
    isLocked: startsAtDate.getTime() <= Date.now(),
  };

  const rawCandidates: SportsBingoSquareTemplate[] = [];
  const homeWinProb = marketModel ? marketModel.winProbability("home") : 0.55;
  const awayWinProb = 1 - homeWinProb;

  // An NFL game the books haven't priced falls back to the league-average path below, but its core
  // squares are demoted to `possible` so they're filtered out unless BINGO_ALLOW_POSSIBLE_SQUARES
  // is on — we'd rather show no NFL board than one built on invented numbers.
  const coreSupportLevel: SquareSupportLevel =
    sportKey === "americanfootball_nfl" && !marketModel ? "possible" : "supported";

  const homeMoneylineResolver: SportsBingoResolver = { kind: "moneyline", team: "home" };
  const awayMoneylineResolver: SportsBingoResolver = { kind: "moneyline", team: "away" };
  rawCandidates.push({
    key: resolverKey(homeMoneylineResolver),
    label: buildSquareLabel(game, homeMoneylineResolver),
    resolver: homeMoneylineResolver,
    probability: homeWinProb,
    bucket: "moneyline",
    supportLevel: coreSupportLevel,
  });
  rawCandidates.push({
    key: resolverKey(awayMoneylineResolver),
    label: buildSquareLabel(game, awayMoneylineResolver),
    resolver: awayMoneylineResolver,
    probability: awayWinProb,
    bucket: "moneyline",
    supportLevel: coreSupportLevel,
  });

  if (isBasketballSportKey(sportKey)) {
    const tripleDoubleBase = isWnbaSportKey(sportKey) ? WNBA_CALIBRATION.tripleDoubleBase : 0.03;
    const tripleDoubleSlope = isWnbaSportKey(sportKey) ? WNBA_CALIBRATION.tripleDoubleSlope : 0.07;
    const tripleDoubleMax = isWnbaSportKey(sportKey) ? WNBA_CALIBRATION.tripleDoubleMax : 0.16;
    const homeTripleDoubleProbability = clamp(tripleDoubleBase + homeWinProb * tripleDoubleSlope, tripleDoubleBase, tripleDoubleMax);
    const awayTripleDoubleProbability = clamp(tripleDoubleBase + awayWinProb * tripleDoubleSlope, tripleDoubleBase, tripleDoubleMax);
    const anyTripleDoubleProbability = clamp(
      homeTripleDoubleProbability + awayTripleDoubleProbability - (homeTripleDoubleProbability * awayTripleDoubleProbability),
      0.05,
      isWnbaSportKey(sportKey) ? WNBA_CALIBRATION.anyTripleDoubleMax : 0.24
    );

    const homeTripleDoubleResolver: SportsBingoResolver = { kind: "team_triple_double", team: "home" };
    rawCandidates.push({
      key: resolverKey(homeTripleDoubleResolver),
      label: buildSquareLabel(game, homeTripleDoubleResolver),
      resolver: homeTripleDoubleResolver,
      probability: homeTripleDoubleProbability,
      bucket: "special",
    });

    const awayTripleDoubleResolver: SportsBingoResolver = { kind: "team_triple_double", team: "away" };
    rawCandidates.push({
      key: resolverKey(awayTripleDoubleResolver),
      label: buildSquareLabel(game, awayTripleDoubleResolver),
      resolver: awayTripleDoubleResolver,
      probability: awayTripleDoubleProbability,
      bucket: "special",
    });

    const anyTripleDoubleResolver: SportsBingoResolver = { kind: "any_triple_double" };
    rawCandidates.push({
      key: resolverKey(anyTripleDoubleResolver),
      label: buildSquareLabel(game, anyTripleDoubleResolver),
      resolver: anyTripleDoubleResolver,
      probability: anyTripleDoubleProbability,
      bucket: "special",
    });
  }

  const averageHomeSpread = marketModel
    ? marketModel.homeSpread
    : isWnbaSportKey(sportKey)
    ? WNBA_CALIBRATION.averageHomeSpread
    : -3.5;
  const averageTotal = marketModel
    ? marketModel.total
    : sportKey === "americanfootball_nfl" ? 45 : sportKey === "baseball_mlb" ? 8 : isWnbaSportKey(sportKey) ? WNBA_CALIBRATION.averageTotal : 226;
  const baseOverProbability = 0.5;

  // With a market model the spread is the authority on which side is favored; the de-vigged
  // moneyline can disagree by a hair on a near-pick'em and would otherwise center the spread
  // ladder on the wrong team.
  const favorite: TeamSide = marketModel ? marketModel.favorite : homeWinProb >= awayWinProb ? "home" : "away";
  const underdog: TeamSide = favorite === "home" ? "away" : "home";
  // Per-sport dispersion for the market-free ladders (see MARKET_FREE_*_SCALE above). NFL never
  // reaches these — it has a market model — and NBA/WNBA take the `default` entries unchanged.
  const marketFreeSpreadScale = sportKey === "baseball_mlb" ? MARKET_FREE_SPREAD_SCALE.baseball_mlb : MARKET_FREE_SPREAD_SCALE.default;
  const marketFreeGameTotalScale =
    sportKey === "baseball_mlb" ? MARKET_FREE_GAME_TOTAL_SCALE.baseball_mlb : MARKET_FREE_GAME_TOTAL_SCALE.default;
  const marketFreeTeamTotalScale =
    sportKey === "baseball_mlb" ? MARKET_FREE_TEAM_TOTAL_SCALE.baseball_mlb : MARKET_FREE_TEAM_TOTAL_SCALE.default;
  const favoriteBaseLine = Math.max(0.5, Math.abs(averageHomeSpread));
  const spreadOffsets = sportKey === "baseball_mlb" ? [-0.5, 0, 0.5, 1, 1.5, 2] : isWnbaSportKey(sportKey) ? [-3, -1, 0, 1, 3, 5] : [-4, -2, 0, 2, 4, 6, 8];
  const spreadLevels = Array.from(new Set(spreadOffsets.map((offset) => roundLine(favoriteBaseLine + offset)))).filter(
    (line) => line >= 0.5
  );

  for (const line of spreadLevels) {
    // Every `line` here is a half-point (`roundLine` -> `normalizeNoPushLine`), so "favorite wins
    // by more than L" and "underdog stays within L" partition the outcome space exactly — no push
    // mass to account for, and `1 - p` is the correct complement.
    const favoriteProbability = marketModel
      ? clamp(marketModel.marginMoreThan(favorite, line), 0.08, 0.92)
      : clamp(sigmoid(logit(0.5) + (favoriteBaseLine - line) / marketFreeSpreadScale), 0.08, 0.92);
    const underdogProbability = clamp(1 - favoriteProbability, 0.08, 0.92);

    const favoriteResolver: SportsBingoResolver = { kind: "spread_more_than", team: favorite, line };
    rawCandidates.push({
      key: resolverKey(favoriteResolver),
      label: buildSquareLabel(game, favoriteResolver),
      resolver: favoriteResolver,
      probability: favoriteProbability,
      bucket: "spread",
      supportLevel: coreSupportLevel,
    });

    const underdogResolver: SportsBingoResolver = { kind: "spread_keep_close", team: underdog, line };
    rawCandidates.push({
      key: resolverKey(underdogResolver),
      label: buildSquareLabel(game, underdogResolver),
      resolver: underdogResolver,
      probability: underdogProbability,
      bucket: "spread",
      supportLevel: coreSupportLevel,
    });
  }

  const totalOffsets = sportKey === "baseball_mlb" ? [-3, -2, -1, 0, 1, 2, 3] : isWnbaSportKey(sportKey) ? [-12, -8, -5, -3, 0, 3, 5, 8, 12] : [-15, -10, -6, -3, 0, 3, 6, 10, 15];
  const totalLevels = Array.from(new Set(totalOffsets.map((offset) => roundLine(averageTotal + offset))));
  for (const line of totalLevels) {
    const overProbability = marketModel
      ? clamp(marketModel.gameTotalOver(line), 0.08, 0.92)
      : clamp(sigmoid(logit(baseOverProbability) + (averageTotal - line) / marketFreeGameTotalScale), 0.08, 0.92);
    const underProbability = clamp(1 - overProbability, 0.08, 0.92);

    const overResolver: SportsBingoResolver = { kind: "game_total_over", line };
    rawCandidates.push({
      key: resolverKey(overResolver),
      label: buildSquareLabel(game, overResolver),
      resolver: overResolver,
      probability: overProbability,
      bucket: "total",
      supportLevel: coreSupportLevel,
    });

    const underResolver: SportsBingoResolver = { kind: "game_total_under", line };
    rawCandidates.push({
      key: resolverKey(underResolver),
      label: buildSquareLabel(game, underResolver),
      resolver: underResolver,
      probability: underProbability,
      bucket: "total",
      supportLevel: coreSupportLevel,
    });
  }

  const impliedMargin = -averageHomeSpread;
  const impliedHomeTotal = averageTotal / 2 + impliedMargin / 2;
  const impliedAwayTotal = averageTotal - impliedHomeTotal;

  const buildTeamTotalCandidates = (team: TeamSide, impliedTotal: number) => {
    const offsets = sportKey === "baseball_mlb" ? [-2, -1, 0, 1, 2, 3] : isWnbaSportKey(sportKey) ? [-9, -6, -3, 0, 3, 6, 9] : [-14, -10, -6, -3, 0, 3, 6, 10, 14];
    const levels = Array.from(new Set(offsets.map((offset) => roundLine(impliedTotal + offset))));
    for (const line of levels) {
      if (sportKey === "baseball_mlb" && (line < 0.5 || line > 11.5)) {
        continue;
      }
      const overProbability = marketModel
        ? clamp(marketModel.teamTotalOver(team, line), 0.05, 0.95)
        : clamp(sigmoid((impliedTotal - line) / marketFreeTeamTotalScale), 0.05, 0.95);
      const underProbability = clamp(1 - overProbability, 0.05, 0.95);

      const overResolver: SportsBingoResolver = { kind: "team_total_over", team, line };
      rawCandidates.push({
        key: resolverKey(overResolver),
        label: buildSquareLabel(game, overResolver),
        resolver: overResolver,
        probability: overProbability,
        bucket: "team-total",
        supportLevel: coreSupportLevel,
      });

      const underResolver: SportsBingoResolver = { kind: "team_total_under", team, line };
      rawCandidates.push({
        key: resolverKey(underResolver),
        label: buildSquareLabel(game, underResolver),
        resolver: underResolver,
        probability: underProbability,
        bucket: "team-total",
        supportLevel: coreSupportLevel,
      });
    }
  };

  buildTeamTotalCandidates("home", impliedHomeTotal);
  buildTeamTotalCandidates("away", impliedAwayTotal);

  // Phase 3: NFL team/game/quarter squares. Only built when the books priced the game — without a
  // market model their probabilities would be the same invented numbers Phase 2 deleted, and the
  // game is filtered out of the catalog anyway (every core square is `possible`).
  if (sportKey === "americanfootball_nfl" && marketModel) {
    rawCandidates.push(...buildNFLTeamGameCandidates(game, marketModel, coreSupportLevel));
  }

  // R4 of docs/mlb-prop-bingo-validation-plan.md: the backtest seam for candidates the async
  // pipeline normally supplies (currently just the MLB team-event block). Empty for every caller
  // that doesn't pass it, so forward generation via `loadGameCatalog` is unaffected.
  rawCandidates.push(...extraCandidates);

  const candidates = aggregateCandidates(rawCandidates)
    .map((item) => ({ ...item, probability: clamp(item.probability, 0.05, 0.95) }))
    .sort((a, b) => a.key.localeCompare(b.key));

  if (candidates.length < 24) {
    return null;
  }

  return {
    game,
    candidates,
    marketModel,
  };
}

async function loadGameCatalog(sportKey: string): Promise<GameCatalogEntry[]> {
  const path = SPORT_PATH_BY_KEY[sportKey];
  if (!path) {
    return [];
  }

  const startMs = Date.now();
  const endMs = startMs + BINGO_LOOKAHEAD_HOURS * 60 * 60 * 1000;

  const payloadById = new Map<string, BallDontLieGame>();
  for (const day of dayKeysForWindow(startMs, endMs)) {
    const query = new URLSearchParams({ per_page: "100" });
    query.append("dates[]", day);
    const rows = await fetchBallDontLieList<BallDontLieGame>(path, query);
    for (const row of rows) {
      const id = String(row.id ?? "").trim();
      if (!id || payloadById.has(id)) continue;
      payloadById.set(id, row);
    }
  }
  const payload = [...payloadById.values()];

  // Slate-aware odds: one /nfl/v1/odds call for the whole catalog refresh (not one per game),
  // joined back onto the games below. A game the books haven't priced simply gets a null model and
  // falls back to the league-average path, with its core squares marked `possible`.
  const marketModelsByGameId = new Map<string, NFLMarketModel>();
  if (sportKey === "americanfootball_nfl" && payload.length > 0) {
    const consensusByGameId = await fetchNFLOddsConsensus([...payloadById.keys()]);
    for (const [gameId, consensus] of consensusByGameId) {
      marketModelsByGameId.set(gameId, buildNFLMarketModel(consensus));
    }
  }

  const entries: GameCatalogEntry[] = [];
  for (const item of payload) {
    const marketModel = marketModelsByGameId.get(String(item.id ?? "").trim()) ?? null;
    const entry = buildGameAndCandidatesFromBallDontLie(sportKey, item, marketModel);
    if (entry) {
      entries.push(entry);
    }
  }

  entries.sort((a, b) => +new Date(a.game.startsAt) - +new Date(b.game.startsAt));
  return entries;
}

async function getGameCatalog(sportKey: string): Promise<GameCatalogEntry[]> {
  const cache = gameCatalogCache.get(sportKey);
  const now = Date.now();
  if (cache && now < cache.expiresAt) {
    return cache.entries;
  }

  const entries = await loadGameCatalog(sportKey);
  gameCatalogCache.set(sportKey, {
    entries,
    expiresAt: now + GAME_CATALOG_CACHE_MS,
  });
  return entries;
}

function probabilityAtLeast(avg: number, threshold: number, spread = 0.35): number {
  const safeAvg = Math.max(0, Number(avg || 0));
  const safeThreshold = Math.max(0.01, Number(threshold || 0));
  const scale = Math.max(0.7, safeThreshold * spread);
  return clamp(sigmoid((safeAvg - safeThreshold) / scale), 0.01, 0.99);
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  const safeSize = Math.max(1, Math.floor(size));
  for (let i = 0; i < items.length; i += safeSize) {
    out.push(items.slice(i, i + safeSize));
  }
  return out;
}

function smoothedRate(hits: number, attempts: number, alpha = 1, beta = 1): number {
  const safeHits = Math.max(0, Math.floor(hits));
  const safeAttempts = Math.max(0, Math.floor(attempts));
  return (safeHits + alpha) / (safeAttempts + alpha + beta);
}

async function getNBAPlayerProfilesForGame(game: SportsBingoGame): Promise<NBAPlayerProfile[]> {
  const cache = nbaPlayerProfilesCache.get(game.id);
  const now = Date.now();
  if (cache && now < cache.expiresAt) {
    return cache.profiles;
  }
  const basketballApiPrefix = basketballApiPrefixForSportKey(game.sportKey);
  if (!basketballApiPrefix) {
    nbaPlayerProfilesCache.set(game.id, { profiles: [], expiresAt: now + 60_000 });
    return [];
  }
  const statsPath = basketballStatsPathForSportKey(game.sportKey);
  const wnbaMode = isWnbaSportKey(game.sportKey);

  try {
    const gameStartMs = Date.parse(game.startsAt);
    const dayOffsets = [-1, 0, 1];
    const gamesById = new Map<string, BallDontLieGame>();
    for (const offset of dayOffsets) {
      const dayIso = new Date(gameStartMs + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const gameQuery = new URLSearchParams({ "dates[]": dayIso, per_page: "100" });
      const rows = await fetchBallDontLieList<BallDontLieGame>(`${basketballApiPrefix}/games`, gameQuery);
      for (const row of rows) {
        const rowId = String(row.id ?? "").trim();
        if (!rowId || gamesById.has(rowId)) continue;
        gamesById.set(rowId, row);
      }
    }
    const games = [...gamesById.values()];
    let matched = games.find((row) => String(row.id ?? "") === game.id);
    if (!matched && games.length > 0) {
      const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const targetHome = normalize(game.homeTeam);
      const targetAway = normalize(game.awayTeam);
      const teamMatches = games.filter((row) => {
        const home = normalize(String(row.home_team?.full_name ?? row.home_team?.name ?? ""));
        const away = normalize(String(row.visitor_team?.full_name ?? row.visitor_team?.name ?? ""));
        return home === targetHome && away === targetAway;
      });
      const ranked = (teamMatches.length > 0 ? teamMatches : games).slice().sort((a, b) => {
        const aTs = Date.parse(String(a.datetime ?? a.date ?? ""));
        const bTs = Date.parse(String(b.datetime ?? b.date ?? ""));
        const aDelta = Number.isFinite(aTs) ? Math.abs(aTs - gameStartMs) : Number.POSITIVE_INFINITY;
        const bDelta = Number.isFinite(bTs) ? Math.abs(bTs - gameStartMs) : Number.POSITIVE_INFINITY;
        return aDelta - bDelta;
      });
      matched = ranked[0];
    }
    if (!matched) {
      nbaPlayerProfilesCache.set(game.id, { profiles: [], expiresAt: now + 60_000 });
      return [];
    }

    const homeId = Number(matched.home_team?.id ?? 0);
    const awayId = Number(matched.visitor_team?.id ?? 0);
    const season = Number(matched.season ?? new Date(game.startsAt).getUTCFullYear());
    const teamIds = [homeId, awayId].filter((id) => Number.isFinite(id) && id > 0);
    if (teamIds.length === 0) {
      nbaPlayerProfilesCache.set(game.id, { profiles: [], expiresAt: now + 60_000 });
      return [];
    }

    const playersQuery = new URLSearchParams({ per_page: "100" });
    for (const id of teamIds) {
      playersQuery.append("team_ids[]", String(id));
    }
    const activePlayersRaw = await fetchBallDontLieList<Record<string, unknown>>(`${basketballApiPrefix}/players/active`, playersQuery);
    let activePlayers = activePlayersRaw.filter((raw) => {
      const row = asRecord(raw);
      const team = asRecord(row.team);
      const teamId = Number(team.id ?? 0);
      return Number.isFinite(teamId) && teamId > 0 && teamIds.includes(teamId);
    });
    if (activePlayers.length === 0) {
      const fallbackQuery = new URLSearchParams({ per_page: "100" });
      for (const id of teamIds) {
        fallbackQuery.append("team_ids[]", String(id));
      }
      const fallbackPlayers = await fetchBallDontLieList<Record<string, unknown>>(`${basketballApiPrefix}/players`, fallbackQuery);
      activePlayers = fallbackPlayers.filter((raw) => {
        const row = asRecord(raw);
        const team = asRecord(row.team);
        const teamId = Number(team.id ?? 0);
        return Number.isFinite(teamId) && teamId > 0 && teamIds.includes(teamId);
      });
    }
    const playerIds = activePlayers
      .map((row) => Number(asRecord(row).id ?? 0))
      .filter((id) => Number.isFinite(id) && id > 0)
      .slice(0, 40);
    if (playerIds.length === 0) {
      nbaPlayerProfilesCache.set(game.id, { profiles: [], expiresAt: now + 60_000 });
      return [];
    }
    
    // balldontlie serves no WNBA season-averages endpoint at any path (re-probed 2026-08-18,
    // all three season_type candidates 404) — skip rather than spend three guaranteed-dead requests.
    let seasonRows: Record<string, unknown>[] = [];
    if (!wnbaMode) {
      const seasonTypeCandidates: Array<"regular" | "playoffs" | ""> = ["regular", "playoffs", ""];
      for (const seasonType of seasonTypeCandidates) {
        const seasonQuery = new URLSearchParams({
          season: String(season),
          type: "base",
          per_page: "100",
        });
        if (seasonType) {
          seasonQuery.set("season_type", seasonType);
        }
        for (const id of playerIds) {
          seasonQuery.append("player_ids[]", String(id));
        }
        const rows = await fetchBallDontLieList<Record<string, unknown>>(`${basketballApiPrefix}/season_averages/general`, seasonQuery);
        if (rows.length > 0) {
          seasonRows = rows;
          break;
        }
      }
    }
    const byPlayerId = new Map<number, Record<string, unknown>>();
    for (const row of seasonRows) {
      const player = asRecord(row.player);
      const playerId = Number(player.id ?? row.player_id ?? 0);
      if (Number.isFinite(playerId) && playerId > 0) {
        byPlayerId.set(playerId, row);
      }
    }

    const historicalEnd = game.startsAt.slice(0, 10);
    const historicalStart = new Date(Date.parse(`${historicalEnd}T00:00:00.000Z`) - 45 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const historicalStatsByPlayerId = new Map<number, Array<Record<string, unknown>>>();
    for (const playerChunk of chunkArray(playerIds, 12)) {
      const historicalQuery = new URLSearchParams({
        start_date: historicalStart,
        end_date: historicalEnd,
        per_page: "100",
      });
      if (!wnbaMode) {
        historicalQuery.set("period", "0");
      }
      for (const id of playerChunk) {
        historicalQuery.append("player_ids[]", String(id));
      }
      const rows = await fetchBallDontLieList<Record<string, unknown>>(`${basketballApiPrefix}/${statsPath}`, historicalQuery);
      for (const raw of rows) {
        const player = asRecord(asRecord(raw).player);
        const playerId = Number(player.id ?? asRecord(raw).player_id ?? 0);
        if (!Number.isFinite(playerId) || playerId <= 0) continue;
        const existing = historicalStatsByPlayerId.get(playerId) ?? [];
        existing.push(raw);
        historicalStatsByPlayerId.set(playerId, existing);
      }
    }

    const historicalGameIds = new Set<number>();
    for (const rows of historicalStatsByPlayerId.values()) {
      for (const raw of rows) {
        const gameObj = asRecord(asRecord(raw).game);
        const gameId = Number(gameObj.id ?? asRecord(raw).game_id ?? 0);
        if (Number.isFinite(gameId) && gameId > 0) historicalGameIds.add(gameId);
      }
    }
    const lineupStarterByGameAndPlayer = new Map<string, boolean>();
    for (const gameChunk of chunkArray(Array.from(historicalGameIds), 25)) {
      const lineupQuery = new URLSearchParams({ per_page: "100" });
      for (const gameId of gameChunk) {
        lineupQuery.append("game_ids[]", String(gameId));
      }
      const lineupRows = await fetchBallDontLieList<BallDontLieLineup>(`${basketballApiPrefix}/lineups`, lineupQuery);
      for (const row of lineupRows) {
        const gameId = Number((row as unknown as Record<string, unknown>).game_id ?? 0);
        const playerId = Number(row.player?.id ?? 0);
        if (!Number.isFinite(gameId) || gameId <= 0 || !Number.isFinite(playerId) || playerId <= 0) continue;
        lineupStarterByGameAndPlayer.set(`${gameId}:${playerId}`, row.starter === true);
      }
    }

    const profiles: NBAPlayerProfile[] = activePlayers
      .map((raw) => {
        const row = asRecord(raw);
        const team = asRecord(row.team);
        const playerId = Number(row.id ?? 0);
        if (!Number.isFinite(playerId) || playerId <= 0) {
          return null;
        }
        const playerName = `${String(row.first_name ?? "").trim()} ${String(row.last_name ?? "").trim()}`.trim();
        const statsRow = asRecord(byPlayerId.get(playerId));
        const stats = asRecord(statsRow.stats);
        const teamId = Number(team.id ?? 0);
        const historicalRows = historicalStatsByPlayerId.get(playerId) ?? [];
        let sampleSize = 0;
        let starterSampleSize = 0;
        let benchSampleSize = 0;
        let threes1 = 0;
        let threes3 = 0;
        let threes5 = 0;
        let points10 = 0;
        let points20 = 0;
        let rebounds5 = 0;
        let rebounds10 = 0;
        let oreb3 = 0;
        let dreb5 = 0;
        let assists1 = 0;
        let assists5 = 0;
        let assists10 = 0;
        let steals1 = 0;
        let steals2 = 0;
        let blocks1 = 0;
        let blocks2 = 0;
        let minutes30 = 0;
        let plusMinus10 = 0;
        let benchPoints8 = 0;

        for (const rawLine of historicalRows) {
          const line = asRecord(rawLine);
          const gameObj = asRecord(line.game);
          const gameId = Number(gameObj.id ?? line.game_id ?? 0);
          const pts = Number(line.pts ?? 0);
          const reb = Number(line.reb ?? 0);
          const ast = Number(line.ast ?? 0);
          const stl = Number(line.stl ?? 0);
          const blk = Number(line.blk ?? 0);
          const fg3m = Number(line.fg3m ?? 0);
          const oreb = Number(line.oreb ?? 0);
          const dreb = Number(line.dreb ?? 0);
          const plusMinus = Number(line.plus_minus ?? 0);
          const minutes = parseMinutesString(String(line.min ?? "")) / 60;
          sampleSize += 1;
          if (fg3m >= 1) threes1 += 1;
          if (fg3m >= 3) threes3 += 1;
          if (fg3m >= 5) threes5 += 1;
          if (pts >= 10) points10 += 1;
          if (pts >= 20) points20 += 1;
          if (reb >= 5) rebounds5 += 1;
          if (reb >= 10) rebounds10 += 1;
          if (oreb >= 3) oreb3 += 1;
          if (dreb >= 5) dreb5 += 1;
          if (ast >= 1) assists1 += 1;
          if (ast >= 5) assists5 += 1;
          if (ast >= 10) assists10 += 1;
          if (stl >= 1) steals1 += 1;
          if (stl >= 2) steals2 += 1;
          if (blk >= 1) blocks1 += 1;
          if (blk >= 2) blocks2 += 1;
          if (minutes >= 30) minutes30 += 1;
          if (plusMinus >= 10) plusMinus10 += 1;
          const started = Number.isFinite(gameId) && gameId > 0 ? lineupStarterByGameAndPlayer.get(`${gameId}:${playerId}`) : undefined;
          if (started === true) {
            starterSampleSize += 1;
          } else if (started === false) {
            benchSampleSize += 1;
            if (pts >= 8) benchPoints8 += 1;
          }
        }

        return {
          playerId,
          playerName,
          teamId,
          teamSide: teamId === homeId ? "home" : teamId === awayId ? "away" : null,
          stats: {
            pts: Number(stats.pts ?? 0),
            reb: Number(stats.reb ?? 0),
            ast: Number(stats.ast ?? 0),
            stl: Number(stats.stl ?? 0),
            blk: Number(stats.blk ?? 0),
            oreb: Number(stats.oreb ?? 0),
            dreb: Number(stats.dreb ?? 0),
            fg3m: Number(stats.fg3m ?? 0),
            ftm: Number(stats.ftm ?? 0),
            fta: Number(stats.fta ?? 0),
            fgm: Number(stats.fgm ?? 0),
            fga: Number(stats.fga ?? 0),
            min: Number(stats.min ?? 0),
            plus_minus: Number(stats.plus_minus ?? 0),
          },
          historical: {
            sampleSize,
            starterSampleSize,
            benchSampleSize,
            rates: {
              threes1: smoothedRate(threes1, sampleSize),
              threes3: smoothedRate(threes3, sampleSize),
              threes5: smoothedRate(threes5, sampleSize),
              points10: smoothedRate(points10, sampleSize),
              points20: smoothedRate(points20, sampleSize),
              rebounds5: smoothedRate(rebounds5, sampleSize),
              rebounds10: smoothedRate(rebounds10, sampleSize),
              oreb3: smoothedRate(oreb3, sampleSize),
              dreb5: smoothedRate(dreb5, sampleSize),
              assists1: smoothedRate(assists1, sampleSize),
              assists5: smoothedRate(assists5, sampleSize),
              assists10: smoothedRate(assists10, sampleSize),
              steals1: smoothedRate(steals1, sampleSize),
              steals2: smoothedRate(steals2, sampleSize),
              blocks1: smoothedRate(blocks1, sampleSize),
              blocks2: smoothedRate(blocks2, sampleSize),
              minutes30: smoothedRate(minutes30, sampleSize),
              plusMinus10: smoothedRate(plusMinus10, sampleSize),
              benchPoints8: smoothedRate(benchPoints8, benchSampleSize),
            },
          },
        } as NBAPlayerProfile;
      })
      .filter((row): row is NBAPlayerProfile => Boolean(row && row.playerName && row.teamSide));

    nbaPlayerProfilesCache.set(game.id, { profiles, expiresAt: now + 5 * 60 * 1000 });
    return profiles;
  }
  catch {
    nbaPlayerProfilesCache.set(game.id, { profiles: [], expiresAt: now + 60_000 });
    return [];
  }
}

/** Exported for tests/lib.sportsBingo.wnba-row-shape.test.ts — Phase 3d's WNBA generation gate
 * (the four families needing starter/per-period data WNBA doesn't have) lives here. */
export async function buildNBAAchievementCandidates(game: SportsBingoGame, _candidates: SportsBingoSquareTemplate[]): Promise<SportsBingoSquareTemplate[]> {
  const profiles = await getNBAPlayerProfilesForGame(game);
  const wnbaMode = isWnbaSportKey(game.sportKey);
  const scaleCountThreshold = (base: number, min = 1): number =>
    Math.max(min, Math.round(base * (wnbaMode ? WNBA_CALIBRATION.achievementThresholdScale : 1)));
  const addTemplatesForThreshold = (minProbability: number): SportsBingoSquareTemplate[] => {
    const templates: SportsBingoSquareTemplate[] = [];
    const push = (resolver: SportsBingoResolver, probability: number, supportLevel: SquareSupportLevel) => {
      if (probability < minProbability) {
        return;
      }
      templates.push({
        key: resolverKey(resolver),
        label: supportTaggedLabel(buildSquareLabel(game, resolver), supportLevel),
        resolver,
        probability: clamp(probability, 0.05, 0.95),
        bucket: "achievement",
        supportLevel,
      });
    };

    for (const p of profiles) {
      const ref = toResolverPlayerRef(p.playerName, p.playerId);
      const pm = p.stats.plus_minus;
      const rate = p.historical.rates;
      const hasSample = p.historical.sampleSize >= 6;
      push({ kind: "nba_player_stat_at_least", player: ref, metric: "threes", threshold: 1 }, hasSample ? rate.threes1 : probabilityAtLeast(p.stats.fg3m, 1), "supported");
      push({ kind: "nba_player_stat_at_least", player: ref, metric: "threes", threshold: scaleCountThreshold(3, 2) }, hasSample ? rate.threes3 : probabilityAtLeast(p.stats.fg3m, scaleCountThreshold(3, 2)), "supported");
      push({ kind: "nba_player_stat_at_least", player: ref, metric: "threes", threshold: scaleCountThreshold(5, 3) }, hasSample ? rate.threes5 : probabilityAtLeast(p.stats.fg3m, scaleCountThreshold(5, 3)), "possible");
      push({ kind: "nba_player_stat_at_least", player: ref, metric: "points", threshold: scaleCountThreshold(10, 8) }, hasSample ? rate.points10 : probabilityAtLeast(p.stats.pts, scaleCountThreshold(10, 8)), "supported");
      push({ kind: "nba_player_stat_at_least", player: ref, metric: "points", threshold: scaleCountThreshold(20, 14) }, hasSample ? rate.points20 : probabilityAtLeast(p.stats.pts, scaleCountThreshold(20, 14)), "supported");
      push({ kind: "nba_player_stat_at_least", player: ref, metric: "rebounds", threshold: scaleCountThreshold(5, 4) }, hasSample ? rate.rebounds5 : probabilityAtLeast(p.stats.reb, scaleCountThreshold(5, 4)), "supported");
      push({ kind: "nba_player_stat_at_least", player: ref, metric: "rebounds", threshold: scaleCountThreshold(10, 7) }, hasSample ? rate.rebounds10 : probabilityAtLeast(p.stats.reb, scaleCountThreshold(10, 7)), "possible");
      push({ kind: "nba_player_stat_at_least", player: ref, metric: "offensive_rebounds", threshold: 3 }, hasSample ? rate.oreb3 : probabilityAtLeast(p.stats.oreb, 3), "possible");
      push({ kind: "nba_player_stat_at_least", player: ref, metric: "defensive_rebounds", threshold: 5 }, hasSample ? rate.dreb5 : probabilityAtLeast(p.stats.dreb, 5), "possible");
      push({ kind: "nba_player_stat_at_least", player: ref, metric: "assists", threshold: 1 }, hasSample ? rate.assists1 : probabilityAtLeast(p.stats.ast, 1), "supported");
      push({ kind: "nba_player_stat_at_least", player: ref, metric: "assists", threshold: scaleCountThreshold(5, 3) }, hasSample ? rate.assists5 : probabilityAtLeast(p.stats.ast, scaleCountThreshold(5, 3)), "supported");
      push({ kind: "nba_player_stat_at_least", player: ref, metric: "assists", threshold: scaleCountThreshold(10, 7) }, hasSample ? rate.assists10 : probabilityAtLeast(p.stats.ast, scaleCountThreshold(10, 7)), "possible");
      push({ kind: "nba_player_stat_at_least", player: ref, metric: "steals", threshold: 1 }, hasSample ? rate.steals1 : probabilityAtLeast(p.stats.stl, 1), "supported");
      push({ kind: "nba_player_stat_at_least", player: ref, metric: "steals", threshold: 2 }, hasSample ? rate.steals2 : probabilityAtLeast(p.stats.stl, 2), "possible");
      push({ kind: "nba_player_stat_at_least", player: ref, metric: "blocks", threshold: 1 }, hasSample ? rate.blocks1 : probabilityAtLeast(p.stats.blk, 1), "supported");
      push({ kind: "nba_player_stat_at_least", player: ref, metric: "blocks", threshold: 2 }, hasSample ? rate.blocks2 : probabilityAtLeast(p.stats.blk, 2), "possible");
      push({ kind: "nba_player_double_double", player: ref }, probabilityAtLeast((p.stats.pts >= 10 ? 1 : 0) + (p.stats.reb >= 10 ? 1 : 0) + (p.stats.ast >= 10 ? 1 : 0), 2, 0.6), "possible");
      push({ kind: "nba_player_triple_double", player: ref }, probabilityAtLeast((p.stats.pts >= 10 ? 1 : 0) + (p.stats.reb >= 10 ? 1 : 0) + (p.stats.ast >= 10 ? 1 : 0), 3, 0.5), "possible");
      push({ kind: "nba_player_perfect_ft", player: ref }, p.stats.fta >= 3 ? 0.24 : 0.08, "possible");
      push({ kind: "nba_player_perfect_fg", player: ref }, p.stats.fga >= 4 ? 0.22 : 0.06, "possible");
      push({ kind: "nba_player_triple_threat", player: ref }, Math.min(probabilityAtLeast(p.stats.pts, 5) * probabilityAtLeast(p.stats.reb, 5) * probabilityAtLeast(p.stats.ast, 5) * 2.4, 0.95), "possible");
      push({ kind: "nba_player_stat_at_least", player: ref, metric: "minutes_played", threshold: scaleCountThreshold(30, 24) }, hasSample ? rate.minutes30 : probabilityAtLeast(p.stats.min, scaleCountThreshold(30, 24)), "supported");
      push({ kind: "nba_player_plus_minus_at_least", player: ref, threshold: 10 }, hasSample ? rate.plusMinus10 : probabilityAtLeast(pm + 10, 10), "possible");
      // These four need data WNBA genuinely does not have: a starter flag (/wnba/v1/lineups
      // 404s, no substitute) or a per-period player split (the `period` param is silently
      // ignored on /wnba/v1/player_stats — verified live 2026-08-18). Gate generation, not
      // settlement — evaluateResolver's guards for all four already void safely on a missing
      // snapshot/map entry (Phase 2a), so leaving one on an old board is safe; the fix here is to
      // stop putting new ones on a board at all.
      if (!wnbaMode) {
        push(
          { kind: "nba_player_bench_scores", player: ref, threshold: scaleCountThreshold(8, 6) },
          p.historical.benchSampleSize >= 3 ? rate.benchPoints8 : p.stats.pts >= 10 ? 0.32 : p.stats.pts >= 7 ? 0.24 : 0.12,
          "possible"
        );
        push(
          { kind: "nba_player_points_first_half_at_least", player: ref, threshold: scaleCountThreshold(10, 7) },
          probabilityAtLeast(p.stats.pts * 0.52, scaleCountThreshold(10, 7)),
          "possible"
        );
        push(
          { kind: "nba_player_assists_in_any_quarter_at_least", player: ref, threshold: scaleCountThreshold(3, 2) },
          probabilityAtLeast(p.stats.ast * 0.34, scaleCountThreshold(3, 2)),
          "possible"
        );
        push(
          { kind: "nba_player_steals_first_half_at_least", player: ref, threshold: scaleCountThreshold(2, 1) },
          probabilityAtLeast(p.stats.stl * 0.58, scaleCountThreshold(2, 1)),
          "possible"
        );
      }
    }

    const hasPlayerSpecific = templates.some((item) => {
      switch (item.resolver.kind) {
        case "nba_player_stat_at_least":
        case "nba_player_double_double":
        case "nba_player_triple_double":
        case "nba_player_perfect_ft":
        case "nba_player_perfect_fg":
        case "nba_player_triple_threat":
        case "nba_player_zero_turnovers":
        case "nba_player_plus_minus_at_least":
        case "nba_player_bench_scores":
        case "nba_player_points_first_half_at_least":
        case "nba_player_assists_in_any_quarter_at_least":
        case "nba_player_steals_first_half_at_least":
          return true;
        default:
          return false;
      }
    });
    if (!hasPlayerSpecific) {
      for (const p of profiles.slice(0, 8)) {
        const ref = toResolverPlayerRef(p.playerName, p.playerId);
        push({ kind: "nba_player_stat_at_least", player: ref, metric: "points", threshold: scaleCountThreshold(10, 8) }, 0.36, "supported");
        push({ kind: "nba_player_stat_at_least", player: ref, metric: "assists", threshold: 1 }, 0.62, "supported");
      }
    }

    for (const team of ["home", "away"] as const) {
      push({ kind: "nba_team_stat_at_least", team, metric: "made_threes", threshold: scaleCountThreshold(10, 7) }, 0.55, "supported");
      push({ kind: "nba_team_three_pt_scorers", team, threshold: scaleCountThreshold(5, 4) }, 0.42, "supported");
      push({ kind: "nba_team_stat_at_least", team, metric: "total_assists", threshold: scaleCountThreshold(25, 18) }, 0.46, "supported");
      push({ kind: "nba_team_stat_at_least", team, metric: "total_rebounds", threshold: scaleCountThreshold(40, 30) }, 0.52, "supported");
      push({ kind: "nba_team_outrebounds", team }, 0.48, "supported");
      push({ kind: "nba_team_turnovers_at_most", team, threshold: 10 }, 0.28, "possible");
      push({ kind: "nba_team_scores_first", team }, 0.5, "supported");
      push({ kind: "nba_team_leads_at_halftime", team }, 0.5, "supported");
      push({ kind: "nba_team_points_in_any_quarter_at_least", team, threshold: scaleCountThreshold(30, 22) }, 0.34, "possible");
    }

    return aggregateCandidates(templates).sort((a, b) => a.key.localeCompare(b.key));
  };

  let appliedThreshold = 0.3;
  let candidates = addTemplatesForThreshold(appliedThreshold);
  for (const threshold of [0.26, 0.22, 0.18, 0.14]) {
    const playerSpecificCount = candidates.filter((item) => isPlayerSpecificAchievementResolver(item.resolver)).length;
    if (playerSpecificCount >= BINGO_PLAYER_SPECIFIC_HARD_FLOOR) {
      break;
    }
    appliedThreshold = threshold;
    candidates = addTemplatesForThreshold(appliedThreshold);
  }

  console.info("[sportsBingo] candidate_threshold", {
    gameId: game.id,
    min_probability: appliedThreshold,
    player_candidate_pool_size: candidates.filter((item) => isPlayerSpecificAchievementResolver(item.resolver)).length,
  });
  return candidates;
}

function defaultMlbOverProbability(marketKey: string, line: number): number {
  switch (marketKey) {
    case "player_hits":
      return clamp(probabilityAtLeast(0.9, line, 0.5), 0.12, 0.82);
    case "player_home_runs":
      return clamp(probabilityAtLeast(0.22, line, 0.6), 0.06, 0.56);
    case "player_rbis":
      return clamp(probabilityAtLeast(0.7, line, 0.55), 0.1, 0.72);
    case "player_runs":
      return clamp(probabilityAtLeast(0.7, line, 0.55), 0.1, 0.72);
    case "player_stolen_bases":
      return clamp(probabilityAtLeast(0.14, line, 0.6), 0.04, 0.4);
    case "player_strikeouts_pitcher":
      return clamp(probabilityAtLeast(5.4, line, 0.33), 0.12, 0.86);
    case "player_earned_runs":
      return clamp(probabilityAtLeast(2.4, line, 0.35), 0.08, 0.78);
    case "player_pitcher_outs":
      return clamp(probabilityAtLeast(16.5, line, 0.22), 0.08, 0.9);
    default:
      return 0.5;
  }
}

function toMlbPlayerAchievementLabel(playerRef: string, marketKey: string, line: number): string | null {
  const playerName = parseResolverPlayerRef(playerRef).displayName || playerRef;
  if (!playerName) {
    return null;
  }
  const roundedLine = Math.max(0, Number(line.toFixed(1)));
  switch (marketKey) {
    case "player_hits":
      return roundedLine <= 0.5 ? `${playerName} records a hit` : `${playerName} records ${Math.ceil(roundedLine)}+ hits`;
    case "player_home_runs":
      return `${playerName} hits a home run`;
    case "player_rbis":
      return roundedLine <= 0.5 ? `${playerName} records an RBI` : `${playerName} records ${Math.ceil(roundedLine)}+ RBIs`;
    case "player_runs":
      return roundedLine <= 0.5 ? `${playerName} scores a run` : `${playerName} scores ${Math.ceil(roundedLine)}+ runs`;
    case "player_strikeouts_pitcher":
      return `${playerName} records ${Math.max(3, Math.ceil(roundedLine))}+ strikeouts`;
    default:
      return null;
  }
}

function toMlbPlayerAchievementCandidate(
  game: SportsBingoGame,
  resolver: Extract<SportsBingoResolver, { kind: "player_prop" }>,
  probability: number
): SportsBingoSquareTemplate | null {
  if (resolver.direction !== "over") {
    return null;
  }
  const label = toMlbPlayerAchievementLabel(resolver.player, resolver.marketKey, resolver.line);
  if (!label) {
    return null;
  }
  return {
    key: `mlb_achievement:${resolver.marketKey}:${normalizeNameKey(resolver.player)}:${resolver.line.toFixed(1)}`,
    label,
    resolver,
    probability: clamp(probability, 0.05, 0.95),
    bucket: "achievement",
    supportLevel: "supported",
  };
}

type MlbTeamAllowedRate = {
  teamName: string;
  /** Games in the window this team appeared in, used to shrink a thin sample toward the league. */
  games: number;
  /** Mean per-game count this team *allowed* for each measured event. */
  allowed: Record<MeasuredMlbTeamEvent, number>;
};

/**
 * Phase 7: turn `gameId -> teamName -> event totals` into each team's mean rate *allowed*.
 *
 * A team's rate allowed for an event is, by definition, the mean of what the other side put up
 * against it. Only games with exactly two sides present contribute — a partial stat payload would
 * otherwise credit a team with allowing nothing.
 */
function buildMlbTeamAllowedRates(
  teamEventTotalsByGame: Map<string, Map<string, Record<MeasuredMlbTeamEvent, number>>>
): MlbTeamAllowedRate[] {
  const accumulator = new Map<string, { games: number; allowed: Record<MeasuredMlbTeamEvent, number> }>();

  for (const gameTotals of teamEventTotalsByGame.values()) {
    const sides = [...gameTotals.entries()];
    if (sides.length !== 2) {
      continue;
    }
    for (let index = 0; index < 2; index += 1) {
      const [teamName] = sides[index]!;
      const [, opposingTotals] = sides[1 - index]!;
      const current =
        accumulator.get(teamName) ??
        { games: 0, allowed: { hit: 0, walk: 0, hit_by_pitch: 0, strikeout: 0, groundout: 0, flyout: 0 } };
      current.games += 1;
      for (const event of Object.keys(current.allowed) as MeasuredMlbTeamEvent[]) {
        current.allowed[event] += opposingTotals[event];
      }
      accumulator.set(teamName, current);
    }
  }

  return [...accumulator.entries()].map(([teamName, entry]) => ({
    teamName,
    games: entry.games,
    allowed: {
      hit: entry.allowed.hit / entry.games,
      walk: entry.allowed.walk / entry.games,
      hit_by_pitch: entry.allowed.hit_by_pitch / entry.games,
      strikeout: entry.allowed.strikeout / entry.games,
      groundout: entry.allowed.groundout / entry.games,
      flyout: entry.allowed.flyout / entry.games,
    },
  }));
}

/** Locate a team's rates by the same fuzzy name match the rest of the MLB path uses. */
function findMlbTeamAllowedRate(rates: MlbTeamAllowedRate[], teamName: string): MlbTeamAllowedRate | null {
  return rates.find((entry) => teamsMatch(entry.teamName, teamName)) ?? null;
}

/**
 * R4 of docs/mlb-prop-bingo-validation-plan.md — the `mlb_webhook_team_event_at_least` block,
 * standalone and **league-mean priced only**.
 *
 * `buildMLBPlayerPropCandidatesFromRecentStats` builds the same resolver kind but needs an
 * *upcoming* game — it fetches `/mlb/v1/games` for the weeks before `game.startsAt` to compute
 * opponent-adjusted rates via `buildMlbTeamAllowedRates`. A backtest replays a *historical* game,
 * so that pipeline structurally cannot run against it. This reconstructs the same six-event,
 * two-rung shape at `predictMlbTeamEventRate(event, null, 0)` — that function's own documented
 * no-opponent-data degradation path (it returns the league mean), not a new invention — so
 * `scripts/simulate-bingo-boards.cjs` has enough resolver families for `generateBoardForGame` to
 * find a feasible 24-square board for a completed game, which core markets alone cannot do.
 */
export function buildMlbTeamEventCandidateTemplatesForBacktest(game: SportsBingoGame): SportsBingoSquareTemplate[] {
  const templates: SportsBingoSquareTemplate[] = [];
  const measuredTeamEvents: readonly MeasuredMlbTeamEvent[] = [
    "hit",
    "walk",
    "hit_by_pitch",
    "strikeout",
    "groundout",
    "flyout",
  ];

  for (const teamSide of ["home", "away"] as const) {
    // Same fixed constant the live path uses — `quick_out_under_3_pitches` is derived from our own
    // webhook stream, not a balldontlie field, so there is no measured model to fall back to here.
    const quickOutResolver: SportsBingoResolver = {
      kind: "mlb_webhook_team_event_at_least",
      team: teamSide,
      event: "quick_out_under_3_pitches",
      threshold: 1,
    };
    templates.push({
      key: resolverKey(quickOutResolver),
      label: buildSquareLabel(game, quickOutResolver),
      resolver: quickOutResolver,
      probability: 0.58,
      bucket: "achievement",
      supportLevel: "supported",
    });

    for (const eventKind of measuredTeamEvents) {
      const expectedRate = predictMlbTeamEventRate(eventKind, null, 0, teamSide);
      for (const rung of buildMlbTeamEventRungs(eventKind, expectedRate)) {
        const resolver: SportsBingoResolver = {
          kind: "mlb_webhook_team_event_at_least",
          team: teamSide,
          event: eventKind,
          threshold: rung.threshold,
        };
        templates.push({
          key: resolverKey(resolver),
          label: buildSquareLabel(game, resolver),
          resolver,
          probability: rung.probability,
          bucket: "achievement",
          supportLevel: "supported",
        });
      }
    }
  }

  return templates;
}

async function buildMLBPlayerPropCandidatesFromRecentStats(game: SportsBingoGame): Promise<SportsBingoSquareTemplate[]> {
  if (!isBallDontLieConfigured()) {
    return [];
  }

  try {
    const gameStartMs = Date.parse(game.startsAt);
    const referenceMs = Number.isFinite(gameStartMs) ? gameStartMs : Date.now();
    const gameQuery = buildBallDontLieDatesQuery(
      referenceMs - 21 * 24 * 60 * 60 * 1000,
      referenceMs - 6 * 60 * 60 * 1000
    );
    const recentGames = await fetchBallDontLieList<BallDontLieGame>("/mlb/v1/games", gameQuery);
    const relatedGameIds = Array.from(
      new Set(
        recentGames
          .filter((row) => {
            const record = row as unknown as Record<string, unknown>;
            const home = extractTeamName(record, "home");
            const away = extractTeamName(record, "away");
            return (
              teamsMatch(home, game.homeTeam) ||
              teamsMatch(home, game.awayTeam) ||
              teamsMatch(away, game.homeTeam) ||
              teamsMatch(away, game.awayTeam)
            );
          })
          .map((row) => String(row.id ?? "").trim())
          .filter(Boolean)
      )
    ).slice(0, 40);

    if (relatedGameIds.length === 0) {
      return [];
    }

    type MlbPlayerAggregate = {
      playerId: number | null;
      playerName: string;
      teamName: string;
      games: Set<string>;
      hits: number;
      homeRuns: number;
      rbis: number;
      runs: number;
      batterStrikeouts: number;
      walks: number;
      hitByPitch: number;
      plateAppearances: number;
      strikeoutsPitcher: number;
      pitcherOuts: number;
      stolenBases: number;
      earnedRunsAllowedPitcher: number;
      hitsAllowedPitcher: number;
    };
    const byPlayer = new Map<string, MlbPlayerAggregate>();
    /** gameId -> teamName -> that team's totals for the six measured events. See Phase 7 below. */
    const teamEventTotalsByGame = new Map<string, Map<string, Record<MeasuredMlbTeamEvent, number>>>();

    for (const gameIdChunk of chunkArray(relatedGameIds, 8)) {
      const statsQuery = new URLSearchParams({ per_page: "100" });
      for (const gameId of gameIdChunk) {
        statsQuery.append("game_ids[]", gameId);
      }
      const rows = await fetchBallDontLieList<Record<string, unknown>>("/mlb/v1/stats", statsQuery);

      for (const row of rows) {
        const playerObj = asRecord(row.player);
        const firstName = String(playerObj.first_name ?? "").trim();
        const lastName = String(playerObj.last_name ?? "").trim();
        const playerName = `${firstName} ${lastName}`.trim() || String(playerObj.name ?? "").trim();
        if (!playerName) {
          continue;
        }
        const teamName = getTeamDisplayName(asRecord(row.team) as unknown as BallDontLieTeam);

        // Phase 7: accumulate every team's per-game event totals, *including the opponents of the
        // two teams in this matchup*, before the filter below drops them. A team's rate allowed is
        // by definition the other side's counts, so this is the only place it can be collected —
        // and it costs no extra request.
        const rowGameId = String(row.game_id ?? asRecord(row.game).id ?? "").trim();
        if (teamName && rowGameId) {
          const gameTotals = teamEventTotalsByGame.get(rowGameId) ?? new Map<string, Record<MeasuredMlbTeamEvent, number>>();
          const teamTotals =
            gameTotals.get(teamName) ??
            ({ hit: 0, walk: 0, hit_by_pitch: 0, strikeout: 0, groundout: 0, flyout: 0 } satisfies Record<
              MeasuredMlbTeamEvent,
              number
            >);
          teamTotals.hit += parseStatNumber(row.hits ?? row.h);
          teamTotals.walk += parseStatNumber(row.bb ?? row.walks);
          teamTotals.hit_by_pitch += parseStatNumber(row.hit_by_pitch ?? row.hbp);
          teamTotals.strikeout += parseStatNumber(row.k ?? row.strikeouts ?? row.so);
          teamTotals.groundout += parseStatNumber(row.ground_outs ?? row.groundouts);
          teamTotals.flyout += parseStatNumber(row.fly_outs ?? row.flyouts);
          gameTotals.set(teamName, teamTotals);
          teamEventTotalsByGame.set(rowGameId, gameTotals);
        }

        if (!teamName || (!teamsMatch(teamName, game.homeTeam) && !teamsMatch(teamName, game.awayTeam))) {
          continue;
        }

        const playerId = Number.parseInt(String(playerObj.id ?? row.player_id ?? ""), 10);
        const playerKey = `${normalizeNameKey(playerName)}:${Number.isFinite(playerId) && playerId > 0 ? playerId : "na"}`;
        if (!playerKey) {
          continue;
        }
        const current = byPlayer.get(playerKey) ?? {
          playerId: Number.isFinite(playerId) && playerId > 0 ? playerId : null,
          playerName,
          teamName,
          games: new Set<string>(),
          hits: 0,
          homeRuns: 0,
          rbis: 0,
          runs: 0,
          batterStrikeouts: 0,
          walks: 0,
          hitByPitch: 0,
          plateAppearances: 0,
          strikeoutsPitcher: 0,
          pitcherOuts: 0,
          stolenBases: 0,
          earnedRunsAllowedPitcher: 0,
          hitsAllowedPitcher: 0,
        };

        current.games.add(String(row.game_id ?? asRecord(row.game).id ?? "").trim());
        current.hits += parseStatNumber(row.hits ?? row.h);
        current.homeRuns += parseStatNumber(row.home_runs ?? row.hr);
        current.rbis += parseStatNumber(row.runs_batted_in ?? row.rbi);
        current.runs += parseStatNumber(row.runs ?? row.r);
        // Field names verified against the live `/mlb/v1/stats` payload 2026-08-17. The API uses
        // terse keys (`k`, `p_k`, `p_hits`); the longer spellings kept as fallbacks below do not
        // appear on it, so before `k`/`p_k`/`p_hits` were added here every batter strikeout,
        // pitcher strikeout and hit-allowed aggregated to exactly zero.
        const rowStrikeouts = parseStatNumber(row.k ?? row.strikeouts ?? row.so);
        const rowWalks = parseStatNumber(row.bb ?? row.walks);
        const rowHitByPitch = parseStatNumber(row.hit_by_pitch ?? row.hbp);
        const rowPlateAppearances = parseStatNumber(row.plate_appearances ?? row.pa);
        current.batterStrikeouts += rowStrikeouts;
        current.walks += rowWalks;
        current.hitByPitch += rowHitByPitch;
        // `plate_appearances` already counts walks and hit-by-pitches; only the `at_bats` fallback
        // needs them added back.
        current.plateAppearances +=
          rowPlateAppearances > 0
            ? rowPlateAppearances
            : parseStatNumber(row.at_bats ?? row.ab) + rowWalks + rowHitByPitch;
        current.strikeoutsPitcher += parseStatNumber(row.p_k ?? row.pitcher_strikeouts ?? row.p_strikeouts ?? row.so_pitcher);
        current.pitcherOuts += parseStatNumber(row.pitching_outs ?? row.pitcher_outs ?? row.p_outs ?? row.outs_recorded);
        current.stolenBases += parseStatNumber(row.stolen_bases ?? row.sb);
        current.earnedRunsAllowedPitcher += parseStatNumber(row.er ?? row.earned_runs);
        current.hitsAllowedPitcher += parseStatNumber(row.p_hits ?? row.hits_allowed ?? row.ha);
        byPlayer.set(playerKey, current);
      }
    }

    const templates: SportsBingoSquareTemplate[] = [];
    const achievementTemplates: SportsBingoSquareTemplate[] = [];
    const players = [...byPlayer.values()].filter((player) => player.games.size > 0);
    const confirmedStarterByPlayerKey = new Set<string>();
    try {
      const lineupQuery = new URLSearchParams({ per_page: "100" });
      lineupQuery.append("game_ids[]", game.id);
      const lineupRows = await fetchBallDontLieList<BallDontLieLineup>("/mlb/v1/lineups", lineupQuery);
      for (const row of lineupRows) {
        if (!isBallDontLieLineupStarter(row)) {
          continue;
        }
        const playerId = Number(row.player?.id ?? 0);
        const playerName = `${String(row.player?.first_name ?? "").trim()} ${String(row.player?.last_name ?? "").trim()}`.trim();
        if (!playerName) {
          continue;
        }
        const key = `${normalizeNameKey(playerName)}:${Number.isFinite(playerId) && playerId > 0 ? playerId : "na"}`;
        confirmedStarterByPlayerKey.add(key);
      }
    } catch {
      // If lineup endpoints are delayed/unavailable, safely skip starter enforcement.
    }

    const hitters = players
      .map((player) => ({
        player,
        playerKey: `${normalizeNameKey(player.playerName)}:${player.playerId ?? "na"}`,
        games: player.games.size,
        avgHits: player.hits / player.games.size,
        avgRbis: player.rbis / player.games.size,
        avgRuns: player.runs / player.games.size,
        avgHomeRuns: player.homeRuns / player.games.size,
        avgStrikeouts: player.batterStrikeouts / player.games.size,
        avgWalks: player.walks / player.games.size,
        avgHitByPitch: player.hitByPitch / player.games.size,
        score: (player.hits + player.rbis + player.runs + player.homeRuns * 2) / player.games.size,
      }))
      .filter((entry) => entry.games >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    for (const hitter of hitters) {
      const playerRef = toResolverPlayerRef(hitter.player.playerName, hitter.player.playerId);
      if (hitter.avgHits >= 0.55) {
        const line = hitter.avgHits >= 1.35 ? 1.5 : 0.5;
        const resolver: SportsBingoResolver = { kind: "player_prop", marketKey: "player_hits", player: playerRef, line, direction: "over" };
        const candidate: SportsBingoSquareTemplate = {
          key: resolverKey(resolver),
          label: buildSquareLabel(game, resolver),
          resolver,
          probability: clamp(probabilityAtLeast(hitter.avgHits, line, 0.42), 0.12, 0.84),
          bucket: "player-prop",
          supportLevel: "supported",
        };
        templates.push(candidate);
        const achievement = toMlbPlayerAchievementCandidate(game, resolver, candidate.probability);
        if (achievement) {
          achievementTemplates.push(achievement);
        }
      }
      const playerHitResolver: SportsBingoResolver = {
        kind: "mlb_webhook_player_event_at_least",
        player: playerRef,
        event: "hit",
        threshold: 1,
      };
      templates.push({
        key: resolverKey(playerHitResolver),
        label: buildSquareLabel(game, playerHitResolver),
        resolver: playerHitResolver,
        probability: clamp(probabilityAtLeast(hitter.avgHits, 1, 0.45), 0.12, 0.9),
        bucket: "achievement",
        supportLevel: "supported",
      });

      const hrResolver: SportsBingoResolver = {
        kind: "mlb_webhook_player_event_at_least",
        player: playerRef,
        event: "home_run",
        threshold: 1,
      };
      const hrProbability = clamp(probabilityAtLeast(hitter.avgHomeRuns, 1, 0.7), 0.02, 0.6);
      if (hitter.avgHomeRuns > 0 && hrProbability >= 0.25) {
        templates.push({
          key: resolverKey(hrResolver),
          label: buildSquareLabel(game, hrResolver),
          resolver: hrResolver,
          probability: hrProbability,
          bucket: "achievement",
          supportLevel: "supported",
        });
      }
      const normalizedPlayerName = normalizeNameKey(hitter.player.playerName);
      const isStarHrPlayer = MLB_STAR_BRANDED_PLAYER_KEYS.has(normalizedPlayerName);
      const isConfirmedStarter = confirmedStarterByPlayerKey.has(hitter.playerKey);
      if (isStarHrPlayer && isConfirmedStarter && hrProbability >= 0.33) {
        templates.push({
          key: `mlb_star_hr:${normalizeNameKey(playerRef)}:${game.id}`,
          label: `${hitter.player.playerName} HR`,
          resolver: hrResolver,
          probability: clamp(hrProbability, 0.2, 0.75),
          bucket: "achievement",
          supportLevel: "supported",
        });
      }

      const strikeoutResolver: SportsBingoResolver = {
        kind: "mlb_webhook_player_event_at_least",
        player: playerRef,
        event: "strikeout",
        threshold: 1,
      };
      templates.push({
        key: resolverKey(strikeoutResolver),
        label: buildSquareLabel(game, strikeoutResolver),
        resolver: strikeoutResolver,
        probability: clamp(probabilityAtLeast(hitter.avgStrikeouts, 1, 0.62), 0.1, 0.9),
        bucket: "achievement",
        supportLevel: "supported",
      });

      const walkResolver: SportsBingoResolver = {
        kind: "mlb_webhook_player_event_at_least",
        player: playerRef,
        event: "walk",
        threshold: 1,
      };
      templates.push({
        key: resolverKey(walkResolver),
        label: buildSquareLabel(game, walkResolver),
        resolver: walkResolver,
        probability: clamp(probabilityAtLeast(hitter.avgWalks, 1, 0.6), 0.08, 0.85),
        bucket: "achievement",
        supportLevel: "supported",
      });

      const hbpResolver: SportsBingoResolver = {
        kind: "mlb_webhook_player_event_at_least",
        player: playerRef,
        event: "hit_by_pitch",
        threshold: 1,
      };
      templates.push({
        key: resolverKey(hbpResolver),
        label: buildSquareLabel(game, hbpResolver),
        resolver: hbpResolver,
        probability: clamp(probabilityAtLeast(hitter.avgHitByPitch, 1, 0.75), 0.04, 0.55),
        bucket: "achievement",
        supportLevel: "supported",
      });
      if (hitter.avgRbis >= 0.45) {
        const resolver: SportsBingoResolver = { kind: "player_prop", marketKey: "player_rbis", player: playerRef, line: 0.5, direction: "over" };
        const candidate: SportsBingoSquareTemplate = {
          key: resolverKey(resolver),
          label: buildSquareLabel(game, resolver),
          resolver,
          probability: clamp(probabilityAtLeast(hitter.avgRbis, 0.5, 0.52), 0.08, 0.74),
          bucket: "player-prop",
          supportLevel: "supported",
        };
        templates.push(candidate);
        const achievement = toMlbPlayerAchievementCandidate(game, resolver, candidate.probability);
        if (achievement) {
          achievementTemplates.push(achievement);
        }
      }
      const rbiTwoProbability = clamp(probabilityAtLeast(hitter.avgRbis, 2, 0.72), 0.03, 0.58);
      if (hitter.avgRbis >= 0.55 && rbiTwoProbability >= 0.24) {
        const rbiTwoResolver: SportsBingoResolver = {
          kind: "mlb_webhook_player_event_at_least",
          player: playerRef,
          event: "rbi",
          threshold: 2,
        };
        templates.push({
          key: resolverKey(rbiTwoResolver),
          label: buildSquareLabel(game, rbiTwoResolver),
          resolver: rbiTwoResolver,
          probability: rbiTwoProbability,
          bucket: "achievement",
          supportLevel: "supported",
        });
      }
      const stolenBaseProbability = clamp(probabilityAtLeast(hitter.player.stolenBases / hitter.games, 1, 0.82), 0.03, 0.55);
      if (hitter.player.stolenBases / hitter.games >= 0.12 && stolenBaseProbability >= 0.22) {
        const stolenBaseResolver: SportsBingoResolver = {
          kind: "mlb_webhook_player_event_at_least",
          player: playerRef,
          event: "stolen_base",
          threshold: 1,
        };
        templates.push({
          key: resolverKey(stolenBaseResolver),
          label: buildSquareLabel(game, stolenBaseResolver),
          resolver: stolenBaseResolver,
          probability: stolenBaseProbability,
          bucket: "achievement",
          supportLevel: "supported",
        });
      }
      if (hitter.avgRuns >= 0.45) {
        const resolver: SportsBingoResolver = { kind: "player_prop", marketKey: "player_runs", player: playerRef, line: 0.5, direction: "over" };
        const candidate: SportsBingoSquareTemplate = {
          key: resolverKey(resolver),
          label: buildSquareLabel(game, resolver),
          resolver,
          probability: clamp(probabilityAtLeast(hitter.avgRuns, 0.5, 0.52), 0.08, 0.74),
          bucket: "player-prop",
          supportLevel: "supported",
        };
        templates.push(candidate);
        const achievement = toMlbPlayerAchievementCandidate(game, resolver, candidate.probability);
        if (achievement) {
          achievementTemplates.push(achievement);
        }
      }
      if (hitter.avgHomeRuns > 0) {
        const resolver: SportsBingoResolver = { kind: "player_prop", marketKey: "player_home_runs", player: playerRef, line: 0.5, direction: "over" };
        const candidate: SportsBingoSquareTemplate = {
          key: resolverKey(resolver),
          label: buildSquareLabel(game, resolver),
          resolver,
          probability: clamp(probabilityAtLeast(hitter.avgHomeRuns, 0.5, 0.72), 0.04, 0.45),
          bucket: "player-prop",
          supportLevel: "supported",
        };
        templates.push(candidate);
        const achievement = toMlbPlayerAchievementCandidate(game, resolver, candidate.probability);
        if (achievement) {
          achievementTemplates.push(achievement);
        }
      }
    }

    // --- Phase 7 of docs/prop-bingo-nfl-plan.md: the MLB team-event block -----------------------
    //
    // These were seven hardcoded thresholds carrying seven hardcoded probabilities, identical for
    // every game and measurably wrong in the same direction every time ("4+ groundouts" was priced
    // 0.74 and settles 0.97). They are now priced from measured league distributions
    // (lib/mlbTeamEventRates.ts) at a rate adjusted for the *opposing* staff's trailing rate
    // allowed — the only per-game input that measurably predicts these counts.
    //
    // Multiple rungs per event, deliberately: `orderByDifficulty` needs something to choose between,
    // and `mlbResolverFamilyKey`'s 2-per-family cap still stops one event owning the board.
    const teamAllowedRates = buildMlbTeamAllowedRates(teamEventTotalsByGame);
    const measuredTeamEvents: readonly MeasuredMlbTeamEvent[] = [
      "hit",
      "walk",
      "hit_by_pitch",
      "strikeout",
      "groundout",
      "flyout",
    ];

    for (const teamSide of ["home", "away"] as const) {
      // `quick_out_under_3_pitches` is derived from our own MLB webhook stream, not from any
      // balldontlie field, so Phase 7a could not measure it and Phase 7b deliberately leaves it
      // exactly as it was rather than guessing a new number for it. See the plan's 7a note.
      const quickOutResolver: SportsBingoResolver = {
        kind: "mlb_webhook_team_event_at_least",
        team: teamSide,
        event: "quick_out_under_3_pitches",
        threshold: 1,
      };
      templates.push({
        key: resolverKey(quickOutResolver),
        label: buildSquareLabel(game, quickOutResolver),
        resolver: quickOutResolver,
        probability: 0.58,
        bucket: "achievement",
        supportLevel: "supported",
      });

      const opponentName = teamSide === "home" ? game.awayTeam : game.homeTeam;
      const opponentAllowed = findMlbTeamAllowedRate(teamAllowedRates, opponentName);

      for (const eventKind of measuredTeamEvents) {
        const expectedRate = predictMlbTeamEventRate(
          eventKind,
          opponentAllowed ? opponentAllowed.allowed[eventKind] : null,
          opponentAllowed ? opponentAllowed.games : 0,
          teamSide
        );
        for (const rung of buildMlbTeamEventRungs(eventKind, expectedRate)) {
          const resolver: SportsBingoResolver = {
            kind: "mlb_webhook_team_event_at_least",
            team: teamSide,
            event: eventKind,
            threshold: rung.threshold,
          };
          templates.push({
            key: resolverKey(resolver),
            label: buildSquareLabel(game, resolver),
            resolver,
            probability: rung.probability,
            bucket: "achievement",
            supportLevel: "supported",
          });
        }
      }
    }

    const pitchers = players
      .map((player) => ({
        player,
        playerKey: `${normalizeNameKey(player.playerName)}:${player.playerId ?? "na"}`,
        games: player.games.size,
        avgKs: player.strikeoutsPitcher / player.games.size,
        avgOuts: player.pitcherOuts / player.games.size,
        avgEarnedRunsAllowed: player.earnedRunsAllowedPitcher / player.games.size,
        avgHitsAllowed: player.hitsAllowedPitcher / player.games.size,
        starterBoost: confirmedStarterByPlayerKey.has(`${normalizeNameKey(player.playerName)}:${player.playerId ?? "na"}`) ? 1 : 0,
      }))
      .filter((entry) => entry.games >= 2 && (entry.avgKs >= 2.5 || entry.avgOuts >= 8))
      .sort((a, b) => {
        if (b.starterBoost !== a.starterBoost) {
          return b.starterBoost - a.starterBoost;
        }
        const scoreA = a.avgKs * 1.15 + a.avgOuts * 0.42;
        const scoreB = b.avgKs * 1.15 + b.avgOuts * 0.42;
        return scoreB - scoreA;
      })
      .slice(0, 8);

    for (const pitcher of pitchers) {
      const playerRef = toResolverPlayerRef(pitcher.player.playerName, pitcher.player.playerId);
      const line = pitcher.avgKs >= 7 ? 6.5 : pitcher.avgKs >= 6 ? 5.5 : pitcher.avgKs >= 5 ? 4.5 : 3.5;
      const resolver: SportsBingoResolver = {
        kind: "player_prop",
        marketKey: "player_strikeouts_pitcher",
        player: playerRef,
        line,
        direction: "over",
      };
      const candidate: SportsBingoSquareTemplate = {
        key: resolverKey(resolver),
        label: buildSquareLabel(game, resolver),
        resolver,
        probability: clamp(probabilityAtLeast(pitcher.avgKs, line, 0.35), 0.1, 0.86),
        bucket: "player-prop",
        supportLevel: "supported",
      };
      templates.push(candidate);
      const achievement = toMlbPlayerAchievementCandidate(game, resolver, candidate.probability);
      if (achievement) {
        achievementTemplates.push(achievement);
      }

      const pitcherOutsResolver: SportsBingoResolver = {
        kind: "mlb_webhook_player_event_at_least",
        player: playerRef,
        event: "pitcher_out",
        threshold: 6,
      };
      templates.push({
        key: resolverKey(pitcherOutsResolver),
        label: buildSquareLabel(game, pitcherOutsResolver),
        resolver: pitcherOutsResolver,
        probability: clamp(probabilityAtLeast(pitcher.avgOuts, 6, 0.42), 0.14, 0.9),
        bucket: "achievement",
        supportLevel: "supported",
      });

      const earnedRunsAtMostResolver: SportsBingoResolver = {
        kind: "mlb_webhook_player_event_at_most",
        player: playerRef,
        event: "earned_run",
        threshold: 2,
      };
      templates.push({
        key: resolverKey(earnedRunsAtMostResolver),
        label: buildSquareLabel(game, earnedRunsAtMostResolver),
        resolver: earnedRunsAtMostResolver,
        probability: clamp(sigmoid((2.4 - pitcher.avgEarnedRunsAllowed) / 0.95), 0.08, 0.9),
        bucket: "achievement",
        supportLevel: "supported",
      });

      const hitsAllowedAtMostResolver: SportsBingoResolver = {
        kind: "mlb_webhook_player_event_at_most",
        player: playerRef,
        event: "hit_allowed",
        threshold: 5,
      };
      templates.push({
        key: resolverKey(hitsAllowedAtMostResolver),
        label: buildSquareLabel(game, hitsAllowedAtMostResolver),
        resolver: hitsAllowedAtMostResolver,
        probability: clamp(sigmoid((5.4 - pitcher.avgHitsAllowed) / 1.15), 0.08, 0.88),
        bucket: "achievement",
        supportLevel: "supported",
      });
    }

    const merged = aggregateCandidates([...templates, ...achievementTemplates]).filter((candidate) => {
      if (candidate.resolver.kind === "player_prop") {
        return candidate.probability >= 0.25;
      }
      if (
        candidate.resolver.kind === "mlb_webhook_player_event_at_least" ||
        candidate.resolver.kind === "mlb_webhook_player_event_at_most"
      ) {
        return candidate.probability >= 0.25;
      }
      return true;
    });
    return merged.sort((a, b) => a.key.localeCompare(b.key));
  } catch {
    return [];
  }
}

/**
 * Phase 9d — score every MLB player the books posted a market on in this game, once.
 *
 * Mirrors `buildNFLStarScoresByPlayerId` below: the market-attention signal is a property of the
 * *player in this game*, not of a single square, so it is summarised over that player's whole
 * market list before any per-square filtering happens.
 */
function buildMLBStarScoresByPlayerId(
  markets: MLBPlayerPropMarket[],
  starIndex: MLBSeasonStarIndexPair | null
): Map<number, number> {
  const marketsByPlayer = new Map<number, MLBPlayerPropMarket[]>();
  for (const market of markets) {
    const bucket = marketsByPlayer.get(market.playerId);
    if (bucket) {
      bucket.push(market);
    } else {
      marketsByPlayer.set(market.playerId, [market]);
    }
  }

  const scores = new Map<number, number>();
  for (const [playerId, playerMarkets] of marketsByPlayer) {
    const playerName = playerMarkets.find((market) => market.playerName.length > 0)?.playerName ?? "";
    const { starScore } = computeMLBStarScore({
      playerName,
      market: summarizeMLBStarMarketSignal(playerMarkets),
      current: starIndex?.current.get(playerId) ?? null,
      prior: starIndex?.prior.get(playerId) ?? null,
    });
    scores.set(playerId, starScore);
  }
  return scores;
}

/**
 * What `buildMLBPlayerPropCandidates` resolved to, plus whether it had to run the historical-stats
 * fallback to get there.
 *
 * Phase 5 of docs/prop-bingo-code-review-fix-plan.md: `getGameEntryWithCandidates` needs the
 * historical list too (it blends the achievement-bucket half of it into every MLB board, not only
 * the fallback case), and used to get it by calling `buildMLBPlayerPropCandidatesFromRecentStats` a
 * second time — 10-20 uncached provider requests per game, thrown away in the one case they were
 * already in hand. `historical` is non-null exactly when the fallback ran, so the caller can reuse
 * it instead of re-fetching, and null when the books answered and it was never built.
 */
type MLBPlayerPropCandidateResult = {
  candidates: SportsBingoSquareTemplate[];
  /** The recent-stats pool, when this call already built it. Null means "not fetched". */
  historical: SportsBingoSquareTemplate[] | null;
};

/**
 * MLB player props off the book-posted consensus — repaired in Phase 9d.
 *
 * Before this phase the whole function was dead: it called `/mlb/v1/player_props` (a 404 route),
 * with `game_ids[]` (the real route takes a scalar `game_id`), parsing `market_key` / `line` /
 * `over_odds` (the real payload is `prop_type` / `line_value` / `market.{…}`) against internal
 * market keys the feed never uses, off rows that carry no player object at all. It therefore fell
 * through to `buildMLBPlayerPropCandidatesFromRecentStats` on every single call — which is the
 * `named_candidate_pool_size: 0` that Phase 7's handoff note 4 recorded and could not explain.
 *
 * All four are fixed in `fetchMLBPlayerPropMarkets` (lib/sportsBingoOdds.ts), which also routes MLB
 * through the same vendor-consensus, modal-line and **de-vigging** math the NFL path uses. That
 * last part retires the raw-implied-odds bug flagged in Phase 2's handoff note 2: MLB squares are
 * no longer priced with the book's hold baked in.
 *
 * Structure now follows `buildNFLPlayerPropCandidates`: both sides of an over/under are emitted and
 * share an axis key, so `pickCandidateSet`'s duplicate-axis guard stops both landing on one board
 * while the generator still gets to pick whichever side moves the board toward the win-rate target.
 * Milestone markets emit the "over" side only — there is no complement price to de-vig against.
 *
 * The historical-stats path remains the fallback, unchanged, for a game the books have not posted
 * (or a provider outage): a feed failure degrades to today's behavior, never to a broken board.
 */
async function buildMLBPlayerPropCandidates(
  game: SportsBingoGame,
  starIndex: MLBSeasonStarIndexPair | null = null
): Promise<MLBPlayerPropCandidateResult> {
  if (!isBallDontLieConfigured()) {
    return { candidates: [], historical: null };
  }
  const markets = await fetchMLBPlayerPropMarkets(game.id);
  if (markets.length === 0) {
    const historical = await buildMLBPlayerPropCandidatesFromRecentStats(game);
    return { candidates: historical, historical };
  }

  const starScores = buildMLBStarScoresByPlayerId(markets, starIndex);
  const selected: SportsBingoSquareTemplate[] = [];

  for (const market of markets) {
    const line = roundLine(market.line);
    if (!Number.isFinite(line) || line <= 0) {
      continue;
    }
    const playerRef = toResolverPlayerRef(market.playerName, market.playerId);
    const starScore = starScores.get(market.playerId);
    const overResolver: SportsBingoResolver = {
      kind: "player_prop",
      marketKey: market.marketKey,
      player: playerRef,
      line,
      direction: "over",
    };
    const overProbability = clamp(market.probability, 0.05, 0.95);
    selected.push({
      key: resolverKey(overResolver),
      // The achievement phrasing ("Ozzie Albies records a hit") where one exists, falling back to
      // the betting-line phrasing. Deliberately a *label swap* rather than a second square:
      // `toMlbPlayerAchievementCandidate` builds a template carrying the identical resolver under a
      // different key, so emitting both would put two squares on one board that win and lose
      // together — invisible to the duplicate-key guard, invisible to the correlation estimator,
      // and outside the star draw's bucket besides.
      label: toMlbPlayerAchievementLabel(playerRef, market.marketKey, line) ?? buildSquareLabel(game, overResolver),
      resolver: overResolver,
      probability: overProbability,
      bucket: "player-prop",
      supportLevel: "supported",
      starScore,
    });

    // A milestone row is a one-sided price; its complement is not a market anybody quoted, so
    // inventing an "under" from `1 - p` would ship a square priced off our own arithmetic rather
    // than off a book. Same rule the NFL path applies.
    if (market.marketType === "over_under") {
      const underResolver: SportsBingoResolver = {
        kind: "player_prop",
        marketKey: market.marketKey,
        player: playerRef,
        line,
        direction: "under",
      };
      selected.push({
        key: resolverKey(underResolver),
        label: buildSquareLabel(game, underResolver),
        resolver: underResolver,
        probability: clamp(1 - overProbability, 0.05, 0.95),
        bucket: "player-prop",
        supportLevel: "supported",
        starScore,
      });
    }

  }

  const parsed = aggregateCandidates(selected)
    .filter((candidate) => {
      if (
        candidate.resolver.kind === "player_prop" ||
        candidate.resolver.kind === "mlb_webhook_player_event_at_least" ||
        candidate.resolver.kind === "mlb_webhook_player_event_at_most"
      ) {
        return candidate.probability >= 0.25;
      }
      return true;
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  if (parsed.length === 0) {
    const historical = await buildMLBPlayerPropCandidatesFromRecentStats(game);
    return { candidates: historical, historical };
  }
  console.info("[sportsBingo] mlb_player_prop_markets", {
    gameId: game.id,
    market_rows: markets.length,
    distinct_players: starScores.size,
    candidates: parsed.length,
    star_index_available: Boolean(starIndex),
  });
  return { candidates: parsed, historical: null };
}

/**
 * Phase 9b — score every player the books posted a market on in this game, once.
 *
 * The market-attention signal is a property of the *player in this game*, not of a single square,
 * so it has to be summarised over that player's whole market list before any per-square filtering
 * happens — a running back with eight posted markets is a star even if six of those markets are
 * prop types Prop Bingo cannot grade.
 *
 * Two honest limitations, both accepted:
 *  - Breadth is counted over the markets `fetchNFLPlayerPropMarkets` already returned, which are
 *    pre-filtered to the gradeable allowlist (14 over/under types + `anytime_td`, plus first-TD
 *    when 3b is on). A wider count would need a second, unfiltered fetch for no real gain: the
 *    allowlist still separates a six-market star from a one-market role player, and tiers are
 *    percentiles inside this game's own pool, so a uniform compression of the scale changes
 *    nothing about who lands in which tier.
 *  - With `starIndex` null (today — see the Phase 9b handoff notes) the season usage/production
 *    components are absent and `computeNFLStarScore` degrades to market attention plus the capped
 *    brand bonus. That is the plan's own documented degradation path, not a special case.
 */
function buildNFLStarScoresByPlayerId(
  markets: NFLPlayerPropMarket[],
  starIndex: NFLSeasonStarIndexPair | null
): Map<number, number> {
  const marketsByPlayer = new Map<number, NFLPlayerPropMarket[]>();
  for (const market of markets) {
    const bucket = marketsByPlayer.get(market.playerId);
    if (bucket) {
      bucket.push(market);
    } else {
      marketsByPlayer.set(market.playerId, [market]);
    }
  }

  const scores = new Map<number, number>();
  for (const [playerId, playerMarkets] of marketsByPlayer) {
    const playerName = playerMarkets.find((market) => market.playerName.length > 0)?.playerName ?? "";
    const { starScore } = computeNFLStarScore({
      playerName,
      market: summarizeNFLStarMarketSignal(playerMarkets),
      current: starIndex?.current.get(playerId) ?? null,
      prior: starIndex?.prior.get(playerId) ?? null,
    });
    scores.set(playerId, starScore);
  }
  return scores;
}

/**
 * Phase 3 of docs/prop-bingo-nfl-plan.md — turn the book-posted player-prop consensus into board
 * squares.
 *
 * The market math (vendor consensus, modal line, de-vigging, the `player_id` -> name join) lives in
 * lib/sportsBingoOdds.ts; this function only maps a resolved market onto resolvers, labels and
 * probabilities. The split is forced: sportsBingo.ts imports sportsBingoOdds.ts, so the odds module
 * cannot reach back for `resolverKey` / `buildSquareLabel` without creating a cycle.
 *
 * Unlike `buildMLBPlayerPropCandidates`, both sides of an over/under are emitted. They share an
 * axis key (`marketKey|player|line`), so `pickCandidateSet`'s duplicate-axis guard already stops
 * both landing on one board — emitting both simply lets the board generator pick whichever side
 * moves that board toward the win-rate target, instead of pre-committing to the coin-flippiest one.
 *
 * Also unlike the MLB path, probabilities are de-vigged (`deVigTwoWay`) rather than raw implied
 * odds. MLB's raw-implied path carries the book's hold and therefore overstates every square; that
 * is a real pre-existing calibration bug, deliberately not copied here.
 */
/**
 * Phase 4 (docs/prop-bingo-nfl-activation-plan.md) + Phase 1 finding #2 — drop a posted market
 * before it can become a square when either:
 *   - the provider's `teamName` is present and matches neither side of this game (the player is on
 *     some other roster — A.J. Brown, Romeo Doubs and Rashid Shaheed all landed on NE @ SEA boards
 *     on 2026-09-05 for exactly this). An absent `teamName` is not a signal, so it is kept.
 *   - the injury feed lists the player Out / Doubtful / IR / season-reserve (`isNFLPlayerInactive`).
 *
 * Both are pre-board hygiene. Settlement still voids anything that slips past this, never misses.
 * Safety valve: if the filters would empty a non-empty pool (a team-name format mismatch, or a
 * freak fully-injured slate), the raw markets are returned rather than shipping a propless board.
 */
function filterNFLPropMarketsForEligibility(
  game: SportsBingoGame,
  markets: NFLPlayerPropMarket[],
  injuryIndex: NFLInjuryIndex | null
): NFLPlayerPropMarket[] {
  const eligible: NFLPlayerPropMarket[] = [];
  let droppedOffRoster = 0;
  let droppedInactive = 0;
  for (const market of markets) {
    if (
      market.teamName &&
      !teamsMatch(market.teamName, game.homeTeam) &&
      !teamsMatch(market.teamName, game.awayTeam)
    ) {
      droppedOffRoster += 1;
      continue;
    }
    if (injuryIndex && isNFLPlayerInactive(injuryIndex, market.playerId, market.playerName)) {
      droppedInactive += 1;
      continue;
    }
    eligible.push(market);
  }

  if (eligible.length === 0 && markets.length > 0) {
    console.warn("[sportsBingo] nfl_prop_eligibility_all_dropped", {
      gameId: game.id,
      markets: markets.length,
      dropped_off_roster: droppedOffRoster,
      dropped_inactive: droppedInactive,
    });
    return markets;
  }
  if (droppedOffRoster > 0 || droppedInactive > 0) {
    console.info("[sportsBingo] nfl_prop_eligibility", {
      gameId: game.id,
      markets: markets.length,
      eligible: eligible.length,
      dropped_off_roster: droppedOffRoster,
      dropped_inactive: droppedInactive,
    });
  }
  return eligible;
}

function buildNFLPlayerPropCandidates(
  game: SportsBingoGame,
  markets: NFLPlayerPropMarket[],
  starIndex: NFLSeasonStarIndexPair | null = null,
  injuryIndex: NFLInjuryIndex | null = null
): SportsBingoSquareTemplate[] {
  const candidates: SportsBingoSquareTemplate[] = [];
  const eligibleMarkets = filterNFLPropMarketsForEligibility(game, markets, injuryIndex);
  const starScores = buildNFLStarScoresByPlayerId(eligibleMarkets, starIndex);

  for (const market of eligibleMarkets) {
    const playerRef = toResolverPlayerRef(market.playerName, market.playerId);
    // Generation-time only, never persisted onto the resolver — Phase 5b's correlated estimator
    // reads it to tie this player's night to his own team's scoring. `null` when the provider gave
    // no team or the name doesn't match either side, which costs precision and nothing else.
    const teamHint: TeamSide | null = market.teamName
      ? teamsMatch(market.teamName, game.homeTeam)
        ? "home"
        : teamsMatch(market.teamName, game.awayTeam)
        ? "away"
        : null
      : null;

    if (market.marketType === "milestone") {
      const isFirstTd = NFL_PLAY_BY_PLAY_MILESTONE_PROP_TYPES.has(market.propType);
      if (!isFirstTd && !NFL_CORE_MILESTONE_PROP_TYPES.has(market.propType)) {
        continue;
      }
      if (isFirstTd && !NFL_PLAY_BY_PLAY_SQUARES_ENABLED) {
        continue;
      }
      // A first-TD price is a genuine long shot (~10-15% even for a lead back); below that the
      // square is dead weight on a board.
      const floor = isFirstTd ? 0.1 : 0.12;
      if (market.probability < floor) {
        continue;
      }
      const resolver: SportsBingoResolver = isFirstTd
        ? { kind: "nfl_player_first_td", player: playerRef }
        : { kind: "nfl_player_anytime_td", player: playerRef };
      candidates.push({
        key: resolverKey(resolver),
        label: buildSquareLabel(game, resolver),
        resolver,
        probability: clamp(market.probability, 0.05, 0.95),
        bucket: "player-prop",
        supportLevel: "supported",
        teamHint,
        starScore: starScores.get(market.playerId),
      });
      continue;
    }

    if (!NFL_CORE_OVER_UNDER_PROP_TYPES.has(market.propType)) {
      continue;
    }
    // A whole-number line carries push mass, and the board's grading has no push outcome. Rounding
    // it to a half-point (as `roundLine` would) silently re-prices the square: "more than 2 TDs,
    // push at 2" is not "at least 3 TDs". Skip rather than misrepresent the line the book posted.
    if (!isHalfLine(market.line)) {
      continue;
    }
    const line = Number(market.line.toFixed(1));

    const overProbability = clamp(market.probability, 0.05, 0.95);
    const underProbability = clamp(1 - market.probability, 0.05, 0.95);
    for (const [direction, probability] of [
      ["over", overProbability],
      ["under", underProbability],
    ] as const) {
      // Keep both sides only while each is a live question. A 6% square is a dead line.
      if (probability < 0.15 || probability > 0.9) {
        continue;
      }
      const resolver: SportsBingoResolver = {
        kind: "player_prop",
        marketKey: market.propType,
        player: playerRef,
        line,
        direction,
      };
      candidates.push({
        key: resolverKey(resolver),
        label: buildSquareLabel(game, resolver),
        resolver,
        probability,
        bucket: "player-prop",
        supportLevel: "supported",
        teamHint,
        starScore: starScores.get(market.playerId),
      });
    }
  }

  return aggregateCandidates(candidates).sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Phase 5b of docs/prop-bingo-nfl-plan.md — the board's probability of making at least one line.
 *
 * Both the generator (through `buildBoardPreview`) and card creation route here, so the number a
 * player is shown, the number the generator optimises against, and the number persisted to
 * `sports_bingo_cards.board_probability` are all the same quantity.
 *
 * The simulation itself lives in `lib/sportsBingoCorrelation.ts`: squares are correlated through a
 * shared game state rather than flipped independently, which is the whole point of the phase. The
 * resolver is required here — an estimate cannot be made from a bare probability any more, because
 * the resolver is what says how the square is wired into the game.
 */
function estimateBoardWinProbabilityWithTrials(
  squares: Array<{
    index: number;
    probability: number;
    isFree: boolean;
    resolver: SportsBingoResolver;
    teamHint?: TeamSide | null;
  }>,
  requestedTrials: number
): number {
  return estimateCorrelatedBoardWinProbability(squares, LINE_PATTERNS, requestedTrials);
}

function resolvePreviewSimulationTrials(candidateCount: number): number {
  const normalized = clamp((candidateCount - 24) / 36, 0, 1);
  const previewTarget = Math.round(800 + normalized * 400);
  return Math.max(800, Math.min(1200, previewTarget));
}

type InternalBoardSquare = {
  index: number;
  key: string;
  label: string;
  probability: number;
  isFree: boolean;
  resolver: SportsBingoResolver;
  supportLevel?: SquareSupportLevel;
  teamHint?: TeamSide | null;
};

function getPlayerPropMarketKey(candidate: SportsBingoSquareTemplate): string {
  switch (candidate.resolver.kind) {
    case "player_prop":
      return candidate.resolver.marketKey;
    case "nba_player_stat_at_least":
      return `milestone:${candidate.resolver.metric}`;
    case "nba_player_double_double":
      return "milestone:double_double";
    case "nba_player_triple_double":
      return "milestone:triple_double";
    case "nba_player_perfect_ft":
      return "milestone:perfect_ft";
    case "nba_player_perfect_fg":
      return "milestone:perfect_fg";
    case "nba_player_triple_threat":
      return "milestone:triple_threat";
    case "nba_player_zero_turnovers":
      return "milestone:zero_turnovers";
    case "nba_player_plus_minus_at_least":
      return "milestone:plus_minus";
    case "nba_player_bench_scores":
      return "milestone:bench_points";
    case "nba_player_points_first_half_at_least":
      return "milestone:points_first_half";
    case "nba_player_assists_in_any_quarter_at_least":
      return "milestone:assists_quarter";
    case "nba_player_steals_first_half_at_least":
      return "milestone:steals_first_half";
    case "mlb_webhook_player_event_at_least":
      return `mlb_event:${candidate.resolver.event}`;
    case "mlb_webhook_player_event_at_most":
      return `mlb_event:${candidate.resolver.event}`;
    case "nfl_player_anytime_td":
      return "nfl_milestone:anytime_td";
    case "nfl_player_first_td":
      return "nfl_milestone:first_td";
    default:
      return "";
  }
}

function getPlayerPropAxisKey(candidate: SportsBingoSquareTemplate): string {
  switch (candidate.resolver.kind) {
    case "player_prop":
      return `${candidate.resolver.marketKey}|${candidate.resolver.player.toLowerCase()}|${candidate.resolver.line.toFixed(1)}`;
    case "nba_player_stat_at_least":
      return `milestone|${candidate.resolver.metric}|${candidate.resolver.player.toLowerCase()}|${candidate.resolver.threshold.toFixed(1)}`;
    case "nba_player_double_double":
      return `milestone|double_double|${candidate.resolver.player.toLowerCase()}`;
    case "nba_player_triple_double":
      return `milestone|triple_double|${candidate.resolver.player.toLowerCase()}`;
    case "nba_player_perfect_ft":
      return `milestone|perfect_ft|${candidate.resolver.player.toLowerCase()}`;
    case "nba_player_perfect_fg":
      return `milestone|perfect_fg|${candidate.resolver.player.toLowerCase()}`;
    case "nba_player_triple_threat":
      return `milestone|triple_threat|${candidate.resolver.player.toLowerCase()}`;
    case "nba_player_zero_turnovers":
      return `milestone|zero_turnovers|${candidate.resolver.player.toLowerCase()}`;
    case "nba_player_plus_minus_at_least":
      return `milestone|plus_minus|${candidate.resolver.player.toLowerCase()}|${candidate.resolver.threshold.toFixed(1)}`;
    case "nba_player_bench_scores":
      return `milestone|bench_points|${candidate.resolver.player.toLowerCase()}|${candidate.resolver.threshold.toFixed(1)}`;
    case "nba_player_points_first_half_at_least":
      return `milestone|points_first_half|${candidate.resolver.player.toLowerCase()}|${candidate.resolver.threshold.toFixed(1)}`;
    case "nba_player_assists_in_any_quarter_at_least":
      return `milestone|assists_quarter|${candidate.resolver.player.toLowerCase()}|${candidate.resolver.threshold.toFixed(1)}`;
    case "nba_player_steals_first_half_at_least":
      return `milestone|steals_first_half|${candidate.resolver.player.toLowerCase()}|${candidate.resolver.threshold.toFixed(1)}`;
    case "mlb_webhook_player_event_at_least":
      return `mlb_event_at_least|${candidate.resolver.event}|${candidate.resolver.player.toLowerCase()}|${candidate.resolver.threshold.toFixed(1)}`;
    case "mlb_webhook_player_event_at_most":
      return `mlb_event_at_most|${candidate.resolver.event}|${candidate.resolver.player.toLowerCase()}|${candidate.resolver.threshold.toFixed(1)}`;
    case "nfl_player_anytime_td":
      return `nfl_milestone|anytime_td|${candidate.resolver.player.toLowerCase()}`;
    case "nfl_player_first_td":
      return `nfl_milestone|first_td|${candidate.resolver.player.toLowerCase()}`;
    default:
      return "";
  }
}

/**
 * The player a candidate is about, for NFL's per-player board cap. Returns null for team and game
 * squares, which have no player to concentrate on.
 */
function nflCandidatePlayerKey(candidate: SportsBingoSquareTemplate): string | null {
  const resolver = candidate.resolver;
  switch (resolver.kind) {
    case "player_prop":
    case "nfl_player_anytime_td":
    case "nfl_player_first_td":
      return normalizeNameKey(parseResolverPlayerRef(resolver.player).displayName || resolver.player);
    default:
      return null;
  }
}

function isPlayerSpecificAchievementResolver(resolver: SportsBingoResolver): boolean {
  switch (resolver.kind) {
    case "nba_player_stat_at_least":
    case "nba_player_double_double":
    case "nba_player_triple_double":
    case "nba_player_perfect_ft":
    case "nba_player_perfect_fg":
    case "nba_player_triple_threat":
    case "nba_player_zero_turnovers":
    case "nba_player_plus_minus_at_least":
    case "nba_player_bench_scores":
    case "nba_player_points_first_half_at_least":
    case "nba_player_assists_in_any_quarter_at_least":
    case "nba_player_steals_first_half_at_least":
    case "mlb_webhook_player_event_at_least":
    case "mlb_webhook_player_event_at_most":
      return true;
    default:
      return false;
  }
}

function mlbResolverFamilyKey(candidate: SportsBingoSquareTemplate): string | null {
  const resolver = candidate.resolver;
  if (resolver.kind === "player_prop") {
    switch (resolver.marketKey) {
      case "player_strikeouts_pitcher":
        return "strikeout";
      case "player_home_runs":
        return "home_run";
      case "player_hits":
        return "hit";
      case "player_rbis":
        return "rbi";
      case "player_runs":
        return "runs";
      case "player_stolen_bases":
        return "stolen_base";
      case "player_earned_runs":
        return "earned_run";
      case "player_pitcher_outs":
        return "pitcher_out";
      default:
        return `player_prop:${resolver.marketKey}`;
    }
  }
  if (resolver.kind === "mlb_webhook_player_event_at_least" || resolver.kind === "mlb_webhook_player_event_at_most") {
    if (resolver.event === "strikeout") {
      return "strikeout";
    }
    return `event:${resolver.event}`;
  }
  if (resolver.kind === "mlb_webhook_team_event_at_least") {
    if (resolver.event === "strikeout") {
      return "strikeout";
    }
    return `event:${resolver.event}`;
  }
  return null;
}

function candidateResolverFamilyKey(candidate: SportsBingoSquareTemplate): string {
  const resolver = candidate.resolver;
  const base = `${candidate.bucket}:${resolver.kind}`;
  switch (resolver.kind) {
    case "player_prop":
      return `${base}:${resolver.marketKey}`;
    case "nba_player_stat_at_least":
      return `${base}:${resolver.metric}`;
    case "nba_team_stat_at_least":
      return `${base}:${resolver.metric}`;
    case "mlb_webhook_player_event_at_least":
    case "mlb_webhook_player_event_at_most":
    case "mlb_webhook_team_event_at_least":
      return `${base}:${resolver.event}`;
    default:
      return base;
  }
}

function countCandidateResolverFamilies(items: SportsBingoSquareTemplate[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const family = candidateResolverFamilyKey(item);
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }
  return counts;
}

function sortedCountObject(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...map.entries()].sort((left, right) => left[0].localeCompare(right[0])));
}

function isSituationalPivotCandidate(candidate: SportsBingoSquareTemplate): boolean {
  if (candidate.bucket === "player-prop") {
    return false;
  }
  if (isPlayerSpecificAchievementResolver(candidate.resolver)) {
    return false;
  }
  return true;
}

function isMlbNamedPlayerSquare(candidate: SportsBingoSquareTemplate): boolean {
  const resolver = candidate.resolver;
  if (resolver.kind === "player_prop") {
    return true;
  }
  if (resolver.kind === "mlb_webhook_player_event_at_least" || resolver.kind === "mlb_webhook_player_event_at_most") {
    return true;
  }
  return false;
}

function isMlbFallbackEventSquare(candidate: SportsBingoSquareTemplate): boolean {
  const resolver = candidate.resolver;
  if (resolver.kind === "mlb_webhook_team_event_at_least") {
    return true;
  }
  if (resolver.kind === "team_total_over" || resolver.kind === "team_total_under") {
    return true;
  }
  if (resolver.kind === "game_total_over" || resolver.kind === "game_total_under") {
    return true;
  }
  return false;
}

function takeWeightedCandidate<T>(
  pool: T[],
  weightOf: (item: T) => number
): T | null {
  if (pool.length === 0) {
    return null;
  }
  let totalWeight = 0;
  const weights: number[] = [];
  for (const item of pool) {
    const weight = Math.max(0, weightOf(item));
    weights.push(weight);
    totalWeight += weight;
  }
  if (totalWeight <= 0) {
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
  }
  let threshold = Math.random() * totalWeight;
  for (let index = 0; index < pool.length; index += 1) {
    threshold -= weights[index] ?? 0;
    if (threshold <= 0) {
      return pool[index] ?? null;
    }
  }
  return pool[pool.length - 1] ?? null;
}

/**
 * Phase 5b of docs/prop-bingo-nfl-plan.md — which honestly-priced square to reach for when the
 * board is coming out at the wrong difficulty.
 *
 * `difficultyBias` runs from -1 to +1 and is a *selection* knob, never a pricing one: at `0` the
 * pool is shuffled exactly as it always was, at `+1` the hardest squares are offered first, at `-1`
 * the easiest. Nothing about a square's probability changes; only the order in which the buckets
 * are asked.
 *
 * This is what lets the target actually bind on a league whose candidate pool is centred well above
 * it. MLB is the case in point: with props unavailable its board fills with six-plus team-event
 * achievement squares priced around 0.61, and no amount of re-sampling a uniformly-shuffled pool
 * finds a 25% board. Raising the bias asks for the same squares' harder siblings instead.
 */
function orderByDifficulty(pool: SportsBingoSquareTemplate[], difficultyBias: number): SportsBingoSquareTemplate[] {
  const bias = clamp(difficultyBias, -1, 1);
  if (bias === 0) {
    return shuffle(pool);
  }
  const magnitude = Math.abs(bias);
  // A convex blend of "random" and "sorted by difficulty": both terms are on [0,1], so at bias 0
  // this is exactly a shuffle and at ±1 it is a strict sort, with a smooth path between.
  return [...pool]
    .map((candidate) => {
      const difficulty = bias > 0 ? clamp(candidate.probability, 0, 1) : 1 - clamp(candidate.probability, 0, 1);
      return { candidate, key: Math.random() * (1 - magnitude) + difficulty * magnitude };
    })
    .sort((left, right) => left.key - right.key)
    .map((entry) => entry.candidate);
}

// -----------------------------------------------------------------------------------------------
// Phase 9b of docs/prop-bingo-nfl-plan.md — star-tilted prop selection.
//
// The ask: names people recognise should be likelier to appear on a board, but a board of six
// famous names and no unknowns is as much of a failure as a board of six unknowns. The rule is
// therefore **tier, then draw, against a hard reservation**, and it is a *selection* change only —
// nothing below reads or writes `probability`, so every price the win-rate work calibrated in
// Phases 5, 7 and 8c is untouched. See `lib/sportsBingoNflStars.ts` for where `starScore` is
// computed and what feeds it.
// -----------------------------------------------------------------------------------------------

/**
 * Tier one game's player-prop pool by `starScore`. The percentile math and its tunables live in
 * `assignNFLStarTiers` (lib/sportsBingoNflStars.ts, with the rest of Phase 9's knobs); this is the
 * adapter that reduces candidate squares to the one score per *player* that function ranks.
 *
 * Returns `null` when no candidate carries a `starScore` — a provider outage, a league other than
 * NFL, or any pool built before this phase existed. That null is the fallback the plan requires:
 * no index, no tilt, `orderByDifficulty` exactly as it worked before.
 */
function buildNFLStarTiers(pool: SportsBingoSquareTemplate[]): Map<string, NFLStarTier> | null {
  const scoreByPlayer = new Map<string, number>();
  for (const candidate of pool) {
    if (typeof candidate.starScore !== "number" || !Number.isFinite(candidate.starScore)) {
      continue;
    }
    const playerKey = nflCandidatePlayerKey(candidate);
    if (!playerKey) {
      continue;
    }
    // Every square for one player carries that player's single score, so `max` is only a defensive
    // pick against an aggregation that averaged two different values together.
    scoreByPlayer.set(playerKey, Math.max(scoreByPlayer.get(playerKey) ?? 0, candidate.starScore));
  }
  return assignNFLStarTiers(scoreByPlayer);
}

/**
 * The player a candidate is about, for MLB's star tiering. Wider than
 * {@link nflCandidatePlayerKey} because MLB names the same player through three resolver families:
 * the prop itself, the achievement phrasing of that prop, and the webhook event squares the
 * historical-stats path builds. All three have to resolve to one key or a hitter's tier would
 * apply to his prop square and not to "Aaron Judge hits a home run".
 */
function mlbCandidatePlayerKey(candidate: SportsBingoSquareTemplate): string | null {
  const resolver = candidate.resolver;
  switch (resolver.kind) {
    case "player_prop":
    case "mlb_webhook_player_event_at_least":
    case "mlb_webhook_player_event_at_most":
      return normalizeNameKey(parseResolverPlayerRef(resolver.player).displayName || resolver.player);
    default:
      return null;
  }
}

/**
 * Phase 9d — tier one MLB game's player pool by `starScore`, the counterpart of
 * {@link buildNFLStarTiers}.
 *
 * Scores are attached by `buildMLBPlayerPropCandidates` and only exist when the repaired
 * `/mlb/v1/odds/player_props` feed answered for this game. Every other case — a provider outage, a
 * game the books never posted, the historical-stats fallback path on its own — leaves every
 * candidate unscored, this returns `null`, and selection runs exactly as it did before this phase.
 */
function buildMLBStarTiers(pool: SportsBingoSquareTemplate[]): Map<string, MLBStarTier> | null {
  const scoreByPlayer = new Map<string, number>();
  for (const candidate of pool) {
    if (typeof candidate.starScore !== "number" || !Number.isFinite(candidate.starScore)) {
      continue;
    }
    const playerKey = mlbCandidatePlayerKey(candidate);
    if (!playerKey) {
      continue;
    }
    scoreByPlayer.set(playerKey, Math.max(scoreByPlayer.get(playerKey) ?? 0, candidate.starScore));
  }
  return assignMLBStarTiers(scoreByPlayer);
}

/**
 * The difficulty half of the draw weight, carrying over `orderByDifficulty`'s meaning into a
 * weighted draw: at bias 0 every candidate weighs the same (a plain shuffle), at bias > 0 the
 * harder squares are favoured, at bias < 0 the easier ones. The star boost **multiplies** this
 * rather than replacing it — exactly as MLB's `starBoost` does — so Phase 5's escalation still
 * reaches its target on a board that is stuck above band.
 */
function difficultyDrawWeight(candidate: SportsBingoSquareTemplate, difficultyBias: number): number {
  const magnitude = Math.abs(clamp(difficultyBias, -1, 1));
  const probability = clamp(candidate.probability, 0.05, 0.95);
  const difficultyPreference = difficultyBias > 0 ? 1 - probability : probability;
  return (1 - magnitude) * 0.5 + magnitude * difficultyPreference;
}

/**
 * The realised star mix of one attempted board. Reported through a callback rather than logged
 * from inside `pickCandidateSet` because that function runs up to 180 times per board and only one
 * of those attempts survives — `generateBoardForGame` logs the mix of the board it actually kept,
 * so a production log line describes a board a player was really dealt.
 */
type StarMixTelemetry = {
  /** Which league's block produced this mix — decides the log line's name. */
  sport: "nfl" | "mlb";
  star: number;
  known: number;
  deep: number;
  pool: number;
  starPlayersInPool: number;
  desiredSlots: number;
  maxStarSlots: number;
  reservationDegraded: number;
};

/**
 * The star tiers for one candidate pool, computed once and reused across every board attempt.
 *
 * Phase 5 of docs/prop-bingo-code-review-fix-plan.md: `buildNFLStarTiers` / `buildMLBStarTiers` are
 * pure functions of the candidate list, which does not change between attempts, but they used to
 * run *inside* `pickCandidateSet` — so an O(n^2) percentile walk over every player in the pool ran
 * up to 180 times per board. `generateBoardForGame` now builds this once and threads it through.
 *
 * Both fields keep their original meaning, including the `null` that means "nothing in this pool
 * carries a `starScore`" and turns the star block off entirely. `precomputedStarTiers` being
 * *absent* is different from either field being null: absent means "no caller hoisted it", and
 * `pickCandidateSet` falls back to computing it itself, which is what keeps this function usable
 * standalone (and identical to its pre-hoist behavior) for any future caller.
 */
type PrecomputedStarTiers = {
  nfl: Map<string, NFLStarTier> | null;
  mlb: Map<string, MLBStarTier> | null;
};

/**
 * Tier a candidate pool for whichever league it belongs to, once. The NFL half tiers only the
 * player-prop bucket and the MLB half tiers the whole list — exactly the two inputs the two blocks
 * inside `pickCandidateSet` used to pass, so the maps are identical to the ones it built per attempt.
 */
function buildStarTiersForPool(candidates: SportsBingoSquareTemplate[], sportKey: string): PrecomputedStarTiers {
  return {
    nfl:
      sportKey === "americanfootball_nfl"
        ? buildNFLStarTiers(candidates.filter((candidate) => candidate.bucket === "player-prop"))
        : null,
    mlb: sportKey === "baseball_mlb" ? buildMLBStarTiers(candidates) : null,
  };
}

function pickCandidateSet(
  candidates: SportsBingoSquareTemplate[],
  sportKey: string,
  options: {
    difficultyBias?: number;
    onStarMix?: (mix: StarMixTelemetry) => void;
    /** Hoisted out of the attempt loop by `generateBoardForGame`. See {@link PrecomputedStarTiers}. */
    precomputedStarTiers?: PrecomputedStarTiers;
  } = {}
): SportsBingoSquareTemplate[] {
  const difficultyBias = clamp(options.difficultyBias ?? 0, -1, 1);
  const grouped: Record<CandidateBucket, SportsBingoSquareTemplate[]> = {
    moneyline: [],
    spread: [],
    total: [],
    "team-total": [],
    "player-prop": [],
    special: [],
    achievement: [],
  };

  for (const candidate of candidates) {
    grouped[candidate.bucket].push(candidate);
  }

  const selected: SportsBingoSquareTemplate[] = [];
  const selectedKeys = new Set<string>();
  const playerPropMarketCounts = new Map<string, number>();
  const selectedPlayerPropAxes = new Set<string>();
  const selectedMlbResolverFamilyCounts = new Map<string, number>();
  const rejectionReasons = new Map<string, number>();
  const reject = (reason: string) => rejectionReasons.set(reason, (rejectionReasons.get(reason) ?? 0) + 1);

  const isNfl = sportKey === "americanfootball_nfl";
  const isMlb = sportKey === "baseball_mlb";
  // Phase 9d — tiered once over the whole candidate list rather than per pool, because MLB's two
  // player-square families (the props themselves and the webhook achievement squares) are drawn in
  // two separate blocks below and a player must land in the same tier in both. `null` whenever no
  // candidate carries a `starScore`, which is the no-tilt fallback.
  const mlbStarTiers = options.precomputedStarTiers
    ? options.precomputedStarTiers.mlb
    : isMlb
      ? buildMLBStarTiers(candidates)
      : null;
  const mlbTierOf = (candidate: SportsBingoSquareTemplate): MLBStarTier => {
    const playerKey = mlbCandidatePlayerKey(candidate);
    return (playerKey ? mlbStarTiers?.get(playerKey) : undefined) ?? "deep";
  };
  /**
   * Phase 9d — the star ceiling is a **board-level** budget for MLB, not a per-block one.
   *
   * NFL seats every player square in one block, so its ceiling and reservation live inside that
   * block. MLB seats them in two: the named-player achievement draw (the "Aaron Judge hits a home
   * run" phrasing) and the player-prop draw. Bounding only the second would leave the exact failure
   * the plan names — a board of six famous names and no unknowns — reachable through the first, so
   * these counts are shared and both blocks read them.
   */
  const mlbTierCounts: Record<MLBStarTier, number> = { star: 0, known: 0, deep: 0 };
  const mlbStarsAreBlocked = (): boolean => mlbTierCounts.star >= MLB_STAR_MAX_STAR_SLOTS;
  /**
   * Restrict an offered pool to non-stars once the ceiling is reached. Degrades to "take what
   * exists" when the pool has no non-star left, rather than failing generation — the same
   * preference-not-requirement discipline `arrangeBoardSquaresForFeasibleLines` uses for the
   * correlation cap. Never fail a board over a mix rule.
   */
  const mlbOfferedUnderCeiling = (
    available: SportsBingoSquareTemplate[]
  ): { offered: SportsBingoSquareTemplate[]; degraded: boolean } => {
    if (!mlbStarsAreBlocked()) {
      return { offered: available, degraded: false };
    }
    const nonStar = available.filter((candidate) => mlbTierOf(candidate) !== "star");
    return nonStar.length > 0 ? { offered: nonStar, degraded: false } : { offered: available, degraded: true };
  };
  const selectedNflPlayerCounts = new Map<string, number>();
  const selectedNflMarketCounts = new Map<string, number>();
  const selectedNflTeamStatCounts = new Map<TeamSide, number>();
  let selectedNflTeamStatTotal = 0;

  const tryAdd = (candidate: SportsBingoSquareTemplate): boolean => {
    if (selected.length >= 24 || selectedKeys.has(candidate.key)) {
      reject("full_or_duplicate_key");
      return false;
    }

    // NFL diversity caps, checked before any bookkeeping below mutates state: no single player may
    // own more than two squares (otherwise one quarterback's passing line quietly becomes half the
    // board's outcome), and no single prop type may appear more than twice.
    const nflPlayerKey = isNfl ? nflCandidatePlayerKey(candidate) : null;
    const nflMarketKey = isNfl ? getPlayerPropMarketKey(candidate) : "";
    if (nflPlayerKey && (selectedNflPlayerCounts.get(nflPlayerKey) ?? 0) >= 2) {
      reject(`nfl_player_cap:${nflPlayerKey}`);
      return false;
    }
    if (nflMarketKey && (selectedNflMarketCounts.get(nflMarketKey) ?? 0) >= 2) {
      reject(`nfl_market_cap:${nflMarketKey}`);
      return false;
    }

    // Phase 8b — cap the flavor block **by source**, not just by count. Two limits, both here:
    //   - max 2 Tier-1 squares per team, so one team's box score can't own a chunk of the board;
    //   - max `BINGO_NFL_TIER1_MAX_PER_BOARD` Tier-1 squares per board.
    // The board cap defaults to 3 because 8a's Q1 — is `team_stats` populated mid-game, or only at
    // Final? — is **still unanswered** and cannot be answered until a real NFL game is being played
    // (earliest 2026-09-11). The plan's instruction for the Final-only case is a cap of ~3, and
    // Final-only is the conservative branch: a board full of squares that all settle at the whistle
    // is dead for three hours. It is env-tunable precisely so the Week-1 live check can raise it
    // without a deploy — see the handoff notes in docs/prop-bingo-nfl-plan.md.
    const isNflTeamStatsSquare = isNfl && isNFLTeamStatsResolver(candidate.resolver);
    const nflTeamStatsSide = isNflTeamStatsSquare ? nflFlavorTeamSide(candidate.resolver) : null;
    if (isNflTeamStatsSquare) {
      if (selectedNflTeamStatTotal >= NFL_TIER1_MAX_SQUARES_PER_BOARD) {
        reject("nfl_tier1_board_cap");
        return false;
      }
      if (nflTeamStatsSide && (selectedNflTeamStatCounts.get(nflTeamStatsSide) ?? 0) >= NFL_TIER1_MAX_SQUARES_PER_TEAM) {
        reject(`nfl_tier1_team_cap:${nflTeamStatsSide}`);
        return false;
      }
    }

    const axis = getPlayerPropAxisKey(candidate);
    if (axis) {
      if (selectedPlayerPropAxes.has(axis)) {
        reject("duplicate_axis");
        return false;
      }
      selectedPlayerPropAxes.add(axis);
      const marketKey = getPlayerPropMarketKey(candidate);
      if (marketKey) {
        playerPropMarketCounts.set(marketKey, (playerPropMarketCounts.get(marketKey) ?? 0) + 1);
      }
    }
    if (sportKey === "baseball_mlb") {
      const familyKey = mlbResolverFamilyKey(candidate);
      if (familyKey) {
        const current = selectedMlbResolverFamilyCounts.get(familyKey) ?? 0;
        if (current >= 2) {
          reject(`mlb_family_cap:${familyKey}`);
          return false;
        }
        selectedMlbResolverFamilyCounts.set(familyKey, current + 1);
      }
    }
    if (nflPlayerKey) {
      selectedNflPlayerCounts.set(nflPlayerKey, (selectedNflPlayerCounts.get(nflPlayerKey) ?? 0) + 1);
    }
    if (nflMarketKey) {
      selectedNflMarketCounts.set(nflMarketKey, (selectedNflMarketCounts.get(nflMarketKey) ?? 0) + 1);
    }
    if (isNflTeamStatsSquare) {
      selectedNflTeamStatTotal += 1;
      if (nflTeamStatsSide) {
        selectedNflTeamStatCounts.set(nflTeamStatsSide, (selectedNflTeamStatCounts.get(nflTeamStatsSide) ?? 0) + 1);
      }
    }
    selected.push(candidate);
    selectedKeys.add(candidate.key);
    return true;
  };

  // NFL planned 2/3/3/3 core + 5 team-game specials in Phase 3, leaving 8 slots for the player
  // props filled below. Phase 8b moves one slot from the **team-total** ladder to the specials
  // bucket (2/3/3/2 core = 10, specials 6, props 8), because that ladder is the block Phase 3
  // note 11 and Phase 4 note 3 both flagged for emitting dead-weight 85-93% rungs — it is the right
  // donor, and the flavor slate is what the slot buys. One fewer spread than the other leagues
  // because the spread ladder is the most self-similar block on the board.
  const planByBucket: Array<[CandidateBucket, number]> = [
    ["moneyline", 2],
    ["spread", isNfl ? 3 : 4],
    ["total", 3],
    ["team-total", isNfl ? 2 : 3],
    ["special", isBasketballSportKey(sportKey) ? 1 : isNfl ? 6 : 0],
    ["achievement", isBasketballSportKey(sportKey) ? 5 : sportKey === "baseball_mlb" ? 4 : 0],
  ];

  // Core market buckets get their band-worthy rungs offered first (see CORE_SQUARE_MIN/MAX above);
  // the outliers stay at the back of the pool as fallback rather than being dropped.
  const CORE_LADDER_BUCKETS: ReadonlySet<CandidateBucket> = new Set<CandidateBucket>(["spread", "total", "team-total"]);
  const isDeadWeightLadderRung = (candidate: SportsBingoSquareTemplate): boolean =>
    CORE_LADDER_BUCKETS.has(candidate.bucket) &&
    (candidate.probability < CORE_SQUARE_MIN_PROBABILITY || candidate.probability > CORE_SQUARE_MAX_PROBABILITY);
  /**
   * Shuffle, then sink the ladder's dead-weight rungs to the back. Applied to the planned buckets
   * *and* to the final catch-all fill — the fill is where they actually leak onto a board, because
   * a game with no player props (every historical game, and a live one the books haven't posted
   * props for) leaves eight slots for it to satisfy from the whole candidate pool.
   */
  const preferLiveRungs = (pool: SportsBingoSquareTemplate[]): SportsBingoSquareTemplate[] => {
    const ordered = orderByDifficulty(pool, difficultyBias);
    const live = ordered.filter((candidate) => !isDeadWeightLadderRung(candidate));
    const deadWeight = ordered.filter(isDeadWeightLadderRung);
    return deadWeight.length === 0 ? live : [...live, ...deadWeight];
  };

  for (const [bucket, desired] of planByBucket) {
    if (desired <= 0) {
      continue;
    }
    const pool = preferLiveRungs(grouped[bucket]);
    let addedForBucket = 0;
    for (const candidate of pool) {
      if (selected.length >= 24 || addedForBucket >= desired) {
        break;
      }
      if (tryAdd(candidate)) {
        addedForBucket += 1;
      }
    }
  }

  const desiredPlayerPropCount = Math.min(8, Math.max(0, 24 - selected.length));
  const playerPropPool = orderByDifficulty(grouped["player-prop"], difficultyBias);
  let selectedPlayerProps = 0;
  const rejectedPlayerPropKeys = new Set<string>();

  if (isBasketballSportKey(sportKey)) {
    const playerAchievementPool = orderByDifficulty(grouped.achievement.filter((item) => isPlayerSpecificAchievementResolver(item.resolver)), difficultyBias);
    let added = 0;
    for (const candidate of playerAchievementPool) {
      if (selected.length >= 24 || added >= 3) break;
      if (tryAdd(candidate)) added += 1;
    }
  }

  if (sportKey === "baseball_mlb") {
    const playerAchievementPool = orderByDifficulty(
      grouped.achievement.filter(
        (item) =>
          item.resolver.kind === "mlb_webhook_player_event_at_least" ||
          item.resolver.kind === "mlb_webhook_player_event_at_most"
      ),
      difficultyBias
    );
    const namedPlayerPool = playerAchievementPool.filter((item) => isMlbNamedPlayerSquare(item));
    const fallbackEventPool = orderByDifficulty(candidates.filter((item) => isMlbFallbackEventSquare(item)), difficultyBias);

    const lineupConfidenceSignal = clamp(
      Math.min(1, namedPlayerPool.length / 10) +
      Math.min(1, candidates.filter((item) => item.key.startsWith("mlb_star_hr:")).length / 2),
      0,
      1.75
    );
    // Dynamic target: prefer more named-player squares when lineup confidence is strong,
    // but avoid rigid floors that deadlock on sparse/elite-pitching slates.
    const weightedNamedTarget = Math.min(6, Math.max(2, Math.round(2 + lineupConfidenceSignal * 2)));
    let addedNamed = 0;
    let fallbackSubstitutions = 0;
    let fallbackCursor = 0;
    let namedReservationDegraded = 0;

    while (selected.length < 24 && addedNamed < weightedNamedTarget) {
      const availableNamed = namedPlayerPool.filter((item) => !selectedKeys.has(item.key));
      if (availableNamed.length === 0) {
        break;
      }
      // Phase 9d — the board-level star ceiling binds here too, not only in the prop draw below.
      const { offered: offeredNamed, degraded } = mlbOfferedUnderCeiling(availableNamed);
      if (degraded) {
        namedReservationDegraded += 1;
      }
      const nextNamed = takeWeightedCandidate(offeredNamed, (item) => {
        // Normally weighted toward the likelier (more fun) events; the difficulty bias flips that
        // when the board is landing above target, which is the only way an MLB board reaches 25%.
        const base =
          difficultyBias > 0
            ? clamp(1 - item.probability, 0.05, 0.95) * difficultyBias + clamp(item.probability, 0.05, 0.95) * (1 - difficultyBias)
            : clamp(item.probability, 0.05, 0.95);
        const supportBoost = item.supportLevel === "supported" ? 1.25 : 1;
        // Phase 9d: this used to be `item.key.startsWith("mlb_star_hr:") ? 1.45 : 1` — a flat boost
        // for whichever of eleven hardcoded names happened to be in the lineup. It is now the tier
        // the live star index put this player in, so a hitter who breaks out in June is boosted in
        // June. `mlbTierOf` returns "deep" (boost 1.0) whenever there is no index, which reproduces
        // the un-boosted draw exactly rather than the old branded one.
        const starBoost = MLB_STAR_TIER_BOOST[mlbTierOf(item)];
        return base * supportBoost * starBoost;
      });
      if (!nextNamed) {
        break;
      }
      if (tryAdd(nextNamed)) {
        addedNamed += 1;
        mlbTierCounts[mlbTierOf(nextNamed)] += 1;
        continue;
      }
      // If this named candidate is rejected by diversity constraints, smoothly degrade
      // to fallback event squares so generation keeps moving.
      while (fallbackCursor < fallbackEventPool.length) {
        const fallbackCandidate = fallbackEventPool[fallbackCursor];
        fallbackCursor += 1;
        if (!fallbackCandidate || selectedKeys.has(fallbackCandidate.key)) {
          continue;
        }
        if (tryAdd(fallbackCandidate)) {
          fallbackSubstitutions += 1;
          break;
        }
      }
    }
    console.info("[sportsBingo] mlb_named_player_weighting", {
      named_candidate_pool_size: namedPlayerPool.length,
      fallback_event_pool_size: fallbackEventPool.length,
      lineup_confidence_signal: Number(lineupConfidenceSignal.toFixed(2)),
      weighted_named_target: weightedNamedTarget,
      added_named: addedNamed,
      fallback_substitutions: fallbackSubstitutions,
      star: mlbTierCounts.star,
      known: mlbTierCounts.known,
      deep: mlbTierCounts.deep,
      star_ceiling_degraded: namedReservationDegraded,
    });
  }

  if (sportKey === "baseball_mlb") {
    const mlbPlayerAchievementSelectedCount = selected.filter(
      (item) =>
        item.resolver.kind === "mlb_webhook_player_event_at_least" ||
        item.resolver.kind === "mlb_webhook_player_event_at_most"
    ).length;
    if (mlbPlayerAchievementSelectedCount < 2) {
      console.warn("[sportsBingo] mlb_player_achievement_shortfall", {
        selected: mlbPlayerAchievementSelectedCount,
        desired: 2,
      });
    }
  }

  if (isBasketballSportKey(sportKey)) {
    const coreMarkets = shuffle([
      "player_points",
      "player_rebounds",
      "player_assists",
      "player_steals",
      "player_blocks",
    ]);

    for (const marketKey of coreMarkets) {
      if (selected.length >= 24 || selectedPlayerProps >= desiredPlayerPropCount) {
        break;
      }
      const candidate = playerPropPool.find(
        (item) => item.resolver.kind === "player_prop" && item.resolver.marketKey === marketKey && !selectedKeys.has(item.key)
      );
      if (candidate && tryAdd(candidate)) {
        selectedPlayerProps += 1;
      }
    }
  }

  // Phase 9b — NFL's eight prop slots are drawn, not taken in order. Every other league keeps the
  // original ordered fill below, byte for byte, and so does NFL whenever no candidate carries a
  // `starScore` (see `buildNFLStarTiers`).
  const nflStarTiers = options.precomputedStarTiers
    ? options.precomputedStarTiers.nfl
    : isNfl
      ? buildNFLStarTiers(grouped["player-prop"])
      : null;
  if (nflStarTiers) {
    const tierOf = (candidate: SportsBingoSquareTemplate): NFLStarTier => {
      const playerKey = nflCandidatePlayerKey(candidate);
      return (playerKey ? nflStarTiers.get(playerKey) : undefined) ?? "deep";
    };
    const tierCounts: Record<NFLStarTier, number> = { star: 0, known: 0, deep: 0 };
    // The ceiling and the floor both scale down with the slot count, so a board with only five
    // prop slots to fill still reserves a proportionate share rather than the literal two.
    const maxStarSlots = Math.min(NFL_STAR_MAX_STAR_SLOTS, Math.max(0, desiredPlayerPropCount - NFL_STAR_MIN_NON_STAR_SLOTS));
    let reservationDegraded = 0;

    while (selected.length < 24 && selectedPlayerProps < desiredPlayerPropCount) {
      const available = playerPropPool.filter(
        (candidate) => !selectedKeys.has(candidate.key) && !rejectedPlayerPropKeys.has(candidate.key)
      );
      if (available.length === 0) {
        break;
      }

      // The reservation is a hard gate on which candidates are *offered*, not a weight that the
      // escalating `difficultyBias` can outvote: once the slots left equal the non-star squares
      // still owed, or the star ceiling is reached, stars stop being drawable at all.
      const nonStarStillOwed = Math.max(0, NFL_STAR_MIN_NON_STAR_SLOTS - (tierCounts.known + tierCounts.deep));
      const slotsLeft = desiredPlayerPropCount - selectedPlayerProps;
      const starsBlocked = tierCounts.star >= maxStarSlots || slotsLeft <= nonStarStillOwed;
      let offered = available;
      if (starsBlocked) {
        const nonStar = available.filter((candidate) => tierOf(candidate) !== "star");
        // "If the pool genuinely has no non-star props, the reservation degrades to take what
        // exists" — the same preference-not-requirement discipline
        // `arrangeBoardSquaresForFeasibleLines` uses for the correlation cap. Never fail a board
        // over a mix rule.
        if (nonStar.length > 0) {
          offered = nonStar;
        } else {
          reservationDegraded += 1;
        }
      }

      const next = takeWeightedCandidate(
        offered,
        (candidate) => difficultyDrawWeight(candidate, difficultyBias) * NFL_STAR_TIER_BOOST[tierOf(candidate)]
      );
      if (!next) {
        break;
      }
      if (tryAdd(next)) {
        selectedPlayerProps += 1;
        tierCounts[tierOf(next)] += 1;
      } else {
        // Rejected by a diversity cap (max 2 squares per player, max 2 per prop type) or by the
        // duplicate-axis guard. Those caps are what star tilt pushes hardest against, so a
        // rejection here is expected traffic, not an error.
        rejectedPlayerPropKeys.add(next.key);
      }
    }

    options.onStarMix?.({
      sport: "nfl",
      star: tierCounts.star,
      known: tierCounts.known,
      deep: tierCounts.deep,
      pool: playerPropPool.length,
      starPlayersInPool: [...nflStarTiers.values()].filter((tier) => tier === "star").length,
      desiredSlots: desiredPlayerPropCount,
      maxStarSlots,
      reservationDegraded,
    });
  }

  // Phase 9d — the same weighted draw, ceiling and reservation for MLB's prop slots. Structurally
  // identical to the NFL block above (deliberately: it is the same rule, and a second variant of it
  // would be a second thing to keep calibrated), differing only in which tunables it reads. It runs
  // at all only when `mlbStarTiers` is non-null, i.e. when the repaired prop feed answered for this
  // game; otherwise MLB falls through to the ordered fill below exactly as before.
  if (mlbStarTiers && isMlb) {
    let reservationDegraded = 0;

    while (selected.length < 24 && selectedPlayerProps < desiredPlayerPropCount) {
      const available = playerPropPool.filter(
        (candidate) => !selectedKeys.has(candidate.key) && !rejectedPlayerPropKeys.has(candidate.key)
      );
      if (available.length === 0) {
        break;
      }

      // A hard gate on what is *offered*, not a weight the escalating `difficultyBias` can outvote.
      // Two conditions close it: the board-level star ceiling (shared with the named-player draw
      // above, via `mlbTierCounts`), and the non-star reservation coming due — once the prop slots
      // left equal the non-star squares still owed, stars stop being drawable at all.
      const nonStarStillOwed = Math.max(
        0,
        MLB_STAR_MIN_NON_STAR_SLOTS - (mlbTierCounts.known + mlbTierCounts.deep)
      );
      const slotsLeft = desiredPlayerPropCount - selectedPlayerProps;
      const ceiling = mlbOfferedUnderCeiling(available);
      let offered = ceiling.offered;
      if (ceiling.degraded) {
        // The **ceiling** is hard, unlike the floor below: the plan gives the reservation a
        // "take what exists" degrade but gives the ceiling none, and a board of nothing but famous
        // names is the failure this phase exists to prevent. So stop drawing props rather than
        // seat a sixth star. The board still fills — the last-resort `preferLiveRungs` top-up at
        // the end of this function takes from every bucket, which is where a genuinely
        // stars-only pool ends up.
        reservationDegraded += 1;
        break;
      } else if (slotsLeft <= nonStarStillOwed) {
        const nonStar = available.filter((candidate) => mlbTierOf(candidate) !== "star");
        if (nonStar.length > 0) {
          offered = nonStar;
        } else {
          reservationDegraded += 1;
        }
      }

      const next = takeWeightedCandidate(
        offered,
        (candidate) => difficultyDrawWeight(candidate, difficultyBias) * MLB_STAR_TIER_BOOST[mlbTierOf(candidate)]
      );
      if (!next) {
        break;
      }
      if (tryAdd(next)) {
        selectedPlayerProps += 1;
        mlbTierCounts[mlbTierOf(next)] += 1;
      } else {
        // Rejected by a diversity cap or the duplicate-axis guard. Those caps are what star tilt
        // pushes hardest against, so a rejection here is expected traffic, not an error.
        rejectedPlayerPropKeys.add(next.key);
      }
    }

    options.onStarMix?.({
      sport: "mlb",
      star: mlbTierCounts.star,
      known: mlbTierCounts.known,
      deep: mlbTierCounts.deep,
      pool: playerPropPool.length,
      starPlayersInPool: [...mlbStarTiers.values()].filter((tier) => tier === "star").length,
      desiredSlots: desiredPlayerPropCount,
      maxStarSlots: MLB_STAR_MAX_STAR_SLOTS,
      reservationDegraded,
    });
  }

  while (selected.length < 24 && selectedPlayerProps < desiredPlayerPropCount) {
    // Phase 9d — the ordered fill has to honour MLB's star ceiling too, or a board that hit the
    // ceiling in the draw above would simply collect its sixth and seventh star here instead.
    // Inert for every other league and for MLB with no index: `mlbStarTiers` is null and this
    // predicate is always false.
    const blockedByCeiling = (candidate: SportsBingoSquareTemplate): boolean =>
      mlbStarTiers !== null && mlbStarsAreBlocked() && mlbTierOf(candidate) === "star";

    const preferred = playerPropPool.find((candidate) => {
      if (selectedKeys.has(candidate.key) || rejectedPlayerPropKeys.has(candidate.key)) {
        return false;
      }
      if (blockedByCeiling(candidate)) {
        return false;
      }
      const marketKey = getPlayerPropMarketKey(candidate);
      if (!marketKey) {
        return false;
      }
      return (playerPropMarketCounts.get(marketKey) ?? 0) < 2;
    });

    const fallback = playerPropPool.find(
      (candidate) =>
        !selectedKeys.has(candidate.key) &&
        !rejectedPlayerPropKeys.has(candidate.key) &&
        !blockedByCeiling(candidate)
    );
    const next = preferred ?? fallback;
    if (!next) {
      break;
    }
    if (tryAdd(next)) {
      selectedPlayerProps += 1;
      if (mlbStarTiers !== null) {
        mlbTierCounts[mlbTierOf(next)] += 1;
      }
    } else {
      rejectedPlayerPropKeys.add(next.key);
    }
  }

  if (selected.length < 24) {
    const fallbackPool = preferLiveRungs(candidates);
    // Phase 9d — two passes for MLB so the star ceiling survives the last-resort top-up. The first
    // pass skips star squares once the ceiling is reached; the second allows anything, because a
    // board that cannot otherwise reach 24 squares is a worse outcome than a sixth star. For every
    // other league (and for MLB with no star index) the first pass takes everything and the second
    // finds nothing left to add, so this is byte-equivalent to the single loop it replaces.
    for (const candidate of fallbackPool) {
      if (selected.length >= 24) {
        break;
      }
      if (mlbStarTiers !== null && mlbStarsAreBlocked() && mlbTierOf(candidate) === "star") {
        continue;
      }
      if (tryAdd(candidate) && mlbStarTiers !== null) {
        mlbTierCounts[mlbTierOf(candidate)] += 1;
      }
    }
    for (const candidate of fallbackPool) {
      if (selected.length >= 24) {
        break;
      }
      tryAdd(candidate);
    }
  }

  if (selected.length < 24) {
    // Player-facing: this reaches the UI verbatim (SportsBingoSelectBoard renders `payload.error`),
    // so it reads as an absence, not as an internal shortfall.
    throw new Error("No bingo board is available for this game yet. Check back closer to kickoff.");
  }

  if (isBasketballSportKey(sportKey)) {
    const hardFloor = isWnbaSportKey(sportKey) ? Math.max(6, BINGO_PLAYER_SPECIFIC_HARD_FLOOR - 2) : BINGO_PLAYER_SPECIFIC_HARD_FLOOR;
    const playerSpecificPool = grouped.achievement.filter((item) => isPlayerSpecificAchievementResolver(item.resolver));
    let playerSpecificSelectedCount = selected.filter((item) => isPlayerSpecificAchievementResolver(item.resolver)).length;
    const shortfall = Math.max(0, hardFloor - playerSpecificSelectedCount);

    const poolFamilyCounts = countCandidateResolverFamilies(candidates);

    let pivotReplacementsRequested = 0;
    let pivotReplacementsApplied = 0;
    if (isWnbaSportKey(sportKey) && shortfall > 0) {
      pivotReplacementsRequested = shortfall;
      const situationalPool = shuffle(
        candidates.filter((candidate) => !selectedKeys.has(candidate.key) && isSituationalPivotCandidate(candidate))
      );

      const replaceableIndices = selected
        .map((candidate, index) => ({ candidate, index }))
        .filter(({ candidate }) => candidate.bucket === "player-prop")
        .map(({ index }) => index);

      for (const index of replaceableIndices) {
        if (pivotReplacementsApplied >= shortfall) {
          break;
        }
        const replacement = situationalPool[pivotReplacementsApplied];
        if (!replacement) {
          break;
        }
        const previous = selected[index];
        if (!previous) {
          continue;
        }
        selected[index] = replacement;
        selectedKeys.delete(previous.key);
        selectedKeys.add(replacement.key);
        pivotReplacementsApplied += 1;
      }

      playerSpecificSelectedCount = selected.filter((item) => isPlayerSpecificAchievementResolver(item.resolver)).length;
    }

    const selectedFamilyCounts = countCandidateResolverFamilies(selected);
    const droppedFamilyCounts = new Map<string, number>();
    for (const [family, poolCount] of poolFamilyCounts.entries()) {
      const dropped = poolCount - (selectedFamilyCounts.get(family) ?? 0);
      if (dropped > 0) {
        droppedFamilyCounts.set(family, dropped);
      }
    }

    console.info("[sportsBingo] player_floor_telemetry", {
      sport_key: sportKey,
      player_candidate_pool_size: playerSpecificPool.length,
      player_specific_selected_count: playerSpecificSelectedCount,
      hard_floor: hardFloor,
      shortfall,
      pivot_replacements_requested: pivotReplacementsRequested,
      pivot_replacements_applied: pivotReplacementsApplied,
      pool_counts_by_family: sortedCountObject(poolFamilyCounts),
      selected_counts_by_family: sortedCountObject(selectedFamilyCounts),
      dropped_counts_by_family: sortedCountObject(droppedFamilyCounts),
      rejection_reasons: Object.fromEntries(rejectionReasons.entries()),
    });
    console.info("[sportsBingo] board_diagnostics", {
      sport_key: sportKey,
      player_candidate_pool_size: playerSpecificPool.length,
      player_specific_selected_count: playerSpecificSelectedCount,
      hard_floor: hardFloor,
      shortfall,
      pivot_replacements_requested: pivotReplacementsRequested,
      pivot_replacements_applied: pivotReplacementsApplied,
      rejection_reasons: Object.fromEntries(rejectionReasons.entries()),
    });
    if (playerSpecificSelectedCount < hardFloor) {
      console.warn("[sportsBingo] basketball_floor_pivot_applied", {
        sport_key: sportKey,
        player_specific_selected_count: playerSpecificSelectedCount,
        hard_floor: hardFloor,
        shortfall,
      });
      return selected.slice(0, 24);
    }
  }

  return selected.slice(0, 24);
}

function buildBoardSquares(selected: SportsBingoSquareTemplate[]): InternalBoardSquare[] {
  const squares: InternalBoardSquare[] = [];
  let sourceIndex = 0;

  for (let boardIndex = 0; boardIndex < 25; boardIndex += 1) {
    if (boardIndex === 12) {
      squares.push({
        index: boardIndex,
        key: "free",
        label: "FREE",
        probability: 1,
        isFree: true,
        resolver: { kind: "free" },
        supportLevel: "supported",
      });
      continue;
    }

    const candidate = selected[sourceIndex];
    if (!candidate) {
      throw new Error("Unable to map selected candidates to board indices.");
    }
    sourceIndex += 1;

    squares.push({
      index: boardIndex,
      key: candidate.key,
      label: candidate.label,
      probability: candidate.probability,
      isFree: false,
      resolver: candidate.resolver,
      supportLevel: candidate.supportLevel ?? "supported",
      teamHint: candidate.teamHint ?? null,
    });
  }

  return squares;
}

function marginBoundsForResolver(
  resolver: SportsBingoResolver
): { lowerExclusive: number; upperExclusive: number } | null {
  switch (resolver.kind) {
    case "moneyline":
      return resolver.team === "home"
        ? { lowerExclusive: 0, upperExclusive: Number.POSITIVE_INFINITY }
        : { lowerExclusive: Number.NEGATIVE_INFINITY, upperExclusive: 0 };
    case "spread_more_than":
      return resolver.team === "home"
        ? { lowerExclusive: resolver.line, upperExclusive: Number.POSITIVE_INFINITY }
        : { lowerExclusive: Number.NEGATIVE_INFINITY, upperExclusive: -resolver.line };
    case "spread_keep_close":
      return resolver.team === "home"
        ? { lowerExclusive: -resolver.line, upperExclusive: Number.POSITIVE_INFINITY }
        : { lowerExclusive: Number.NEGATIVE_INFINITY, upperExclusive: resolver.line };
    // |margin| <= L is the single interval (-L, L), so it composes with the spread/moneyline bounds
    // above for free. Its opposite (|margin| >= L) is a union of two tails and cannot be expressed
    // as one interval — those pairs are handled explicitly in `resolversAreMutuallyExclusive`.
    case "nfl_margin_at_most":
      return { lowerExclusive: -resolver.line, upperExclusive: resolver.line };
    default:
      return null;
  }
}

function resolversAreMutuallyExclusive(left: SportsBingoResolver, right: SportsBingoResolver): boolean {
  const leftMargin = marginBoundsForResolver(left);
  const rightMargin = marginBoundsForResolver(right);

  if (leftMargin || rightMargin) {
    const leftLower = leftMargin?.lowerExclusive ?? Number.NEGATIVE_INFINITY;
    const leftUpper = leftMargin?.upperExclusive ?? Number.POSITIVE_INFINITY;
    const rightLower = rightMargin?.lowerExclusive ?? Number.NEGATIVE_INFINITY;
    const rightUpper = rightMargin?.upperExclusive ?? Number.POSITIVE_INFINITY;
    if (Math.max(leftLower, rightLower) >= Math.min(leftUpper, rightUpper)) {
      return true;
    }
  }

  if (left.kind === "game_total_over" && right.kind === "game_total_under" && left.line >= right.line) {
    return true;
  }
  if (left.kind === "game_total_under" && right.kind === "game_total_over" && right.line >= left.line) {
    return true;
  }

  if (
    (left.kind === "team_total_over" || left.kind === "team_total_under") &&
    (right.kind === "team_total_over" || right.kind === "team_total_under") &&
    left.team === right.team
  ) {
    if (left.kind === "team_total_over" && right.kind === "team_total_under" && left.line >= right.line) {
      return true;
    }
    if (left.kind === "team_total_under" && right.kind === "team_total_over" && right.line >= left.line) {
      return true;
    }
  }

  if (
    left.kind === "player_prop" &&
    right.kind === "player_prop" &&
    left.marketKey === right.marketKey &&
    left.player.toLowerCase() === right.player.toLowerCase()
  ) {
    if (left.direction === "over" && right.direction === "under" && left.line >= right.line) {
      return true;
    }
    if (left.direction === "under" && right.direction === "over" && right.line >= left.line) {
      return true;
    }
  }

  // --- Phase 3: NFL contradictions the interval machinery above can't express -------------------
  // `nfl_margin_at_least` is a two-tailed union, so each of its conflicts is stated directly.
  for (const [a, b] of [
    [left, right],
    [right, left],
  ] as const) {
    if (a.kind === "nfl_margin_at_least") {
      // A margin of at least L and at most M is impossible whenever M < L.
      if (b.kind === "nfl_margin_at_most" && b.line < a.line) {
        return true;
      }
      // Overtime ends on the first score differential, so an OT game cannot finish 9+ points apart.
      if (b.kind === "nfl_overtime" && a.line > 8) {
        return true;
      }
      // Note `spread_keep_close` is deliberately NOT listed: it bounds the margin in one direction
      // only, so a blowout the other way satisfies both it and `nfl_margin_at_least`.
    }
    // Overtime forces a margin inside a field goal plus a two-point conversion.
    if (a.kind === "nfl_overtime" && b.kind === "nfl_margin_at_most" && b.line < 1) {
      return true;
    }
    // Both teams can't lead at halftime.
    if (
      a.kind === "nfl_team_leads_at_halftime" &&
      b.kind === "nfl_team_leads_at_halftime" &&
      a.team !== b.team
    ) {
      return true;
    }
    // A team scores in all four quarters or it doesn't — these two are exact complements.
    if (
      a.kind === "nfl_team_scores_every_quarter" &&
      b.kind === "nfl_team_shutout_quarter" &&
      a.team === b.team
    ) {
      return true;
    }
    // Scoring in every quarter rules out a quarter in which neither team scored.
    if (a.kind === "nfl_team_scores_every_quarter" && b.kind === "nfl_any_quarter_scoreless") {
      return true;
    }

    // --- Phase 8b: the flavor slate's own contradictions ---------------------------------------
    // None of these are inferable by the interval machinery above, and every one of them is a pair
    // that could otherwise land on the same line and make it unwinnable.
    //
    // "Neither team turns it over" vs. either team turning it over at all.
    if (a.kind === "nfl_combined_team_stat_at_most" && b.kind === "nfl_team_stat_at_least" && a.field === b.field) {
      if (b.threshold > a.threshold) {
        return true;
      }
    }
    if (
      a.kind === "nfl_combined_team_stat_at_most" &&
      b.kind === "nfl_combined_team_stat_at_least" &&
      a.field === b.field &&
      b.threshold > a.threshold
    ) {
      return true;
    }
    // The same field, same team, pulled in both directions.
    if (
      a.kind === "nfl_team_stat_at_least" &&
      b.kind === "nfl_team_stat_at_most" &&
      a.team === b.team &&
      a.field === b.field &&
      a.threshold > b.threshold
    ) {
      return true;
    }
    // "Perfect in the red zone" and "left a red-zone trip without a touchdown" are exact
    // complements for the same team.
    if (
      a.kind === "nfl_team_perfect_red_zone" &&
      b.kind === "nfl_team_red_zone_trip_without_touchdown" &&
      a.team === b.team
    ) {
      return true;
    }
    // Only one team can win time of possession, so two of these with opposite teams cannot both
    // land — and neither can two with the same team at different bounds, which is fine, that pair
    // is nested rather than contradictory.
    if (
      a.kind === "nfl_team_possession_advantage" &&
      b.kind === "nfl_team_possession_advantage" &&
      a.team !== b.team
    ) {
      return true;
    }
    // Both teams leading at some point requires a lead change, which requires the game not to have
    // been a wire-to-wire blowout — but the two are only strictly contradictory when the *first*
    // scorer also wins wire to wire. That is not expressible here, so it is left to the
    // correlation model rather than asserted as an exclusion.
  }

  return false;
}

function lineIsTheoreticallyPossible(squares: InternalBoardSquare[]): boolean {
  const resolvers = squares
    .map((square) => square.resolver)
    .filter((resolver) => resolver.kind !== "free" && resolver.kind !== "replacement_auto");

  if (resolvers.length === 0) {
    return true;
  }

  for (let leftIndex = 0; leftIndex < resolvers.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < resolvers.length; rightIndex += 1) {
      const left = resolvers[leftIndex];
      const right = resolvers[rightIndex];
      if (!left || !right) {
        continue;
      }
      if (resolversAreMutuallyExclusive(left, right)) {
        return false;
      }
    }
  }

  return true;
}

function boardHasTheoreticallyPossibleLines(squares: InternalBoardSquare[]): boolean {
  const byIndex = new Map<number, InternalBoardSquare>();
  for (const square of squares) {
    byIndex.set(square.index, square);
  }

  for (const line of LINE_PATTERNS) {
    const lineSquares = line.map((index) => byIndex.get(index)).filter(Boolean) as InternalBoardSquare[];
    if (lineSquares.length !== line.length) {
      return false;
    }
    if (!lineIsTheoreticallyPossible(lineSquares)) {
      return false;
    }
  }
  return true;
}

/**
 * Shuffle the selected squares into board positions until every line is (a) not self-contradictory
 * and (b) inside Phase 5b's directional correlation cap — no line built mostly out of one
 * directional bet, which is precisely how a "25%" board silently becomes a 45% board.
 *
 * The cap is a **preference, not a requirement**: if no arrangement in `maxArrangements` satisfies
 * it, the first merely-feasible arrangement is returned. A thin candidate pool must still produce a
 * board, and this way the cap can only ever improve an arrangement — it can never introduce a new
 * "unable to generate" failure that did not exist before Phase 5.
 */
function arrangeBoardSquaresForFeasibleLines(
  selected: SportsBingoSquareTemplate[],
  maxArrangements = 120
): InternalBoardSquare[] | null {
  let feasibleFallback: InternalBoardSquare[] | null = null;

  for (let attempt = 0; attempt < maxArrangements; attempt += 1) {
    const arrangement = buildBoardSquares(shuffle(selected));
    if (!boardHasTheoreticallyPossibleLines(arrangement)) {
      continue;
    }
    if (boardRespectsDirectionalCap(arrangement, LINE_PATTERNS)) {
      return arrangement;
    }
    feasibleFallback ??= arrangement;
  }

  return feasibleFallback;
}

function buildBoardPreview(
  game: SportsBingoGame,
  squares: InternalBoardSquare[],
  simulationTrials: number
): SportsBingoBoardPreview {
  const previewSquares: SportsBingoSquarePreview[] = squares.map((square) => ({
    index: square.index,
    key: square.key,
    label: square.label,
    probability: square.probability,
    isFree: square.isFree,
    supportLevel: square.supportLevel,
  }));

  const boardProbability = estimateBoardWinProbabilityWithTrials(
    squares.map((square) => ({
      index: square.index,
      probability: square.probability,
      isFree: square.isFree,
      resolver: square.resolver,
      teamHint: square.teamHint ?? null,
    })),
    simulationTrials
  );

  return {
    game,
    boardProbability,
    squares: previewSquares,
  };
}

function generateBoardForGame(
  game: SportsBingoGame,
  candidates: SportsBingoSquareTemplate[],
  options: { generationMode?: "preview" | "final" } = {}
): SportsBingoBoardPreview {
  const target = clamp(BOARD_TARGET_WIN_RATE, 0.05, 0.95);
  const tolerance = clamp(BOARD_TARGET_TOLERANCE, 0.01, 0.2);
  const fullTrials = Math.max(500, Math.min(12_000, BOARD_SIMULATION_TRIALS));
  const simulationTrials =
    options.generationMode === "preview" ? Math.min(fullTrials, resolvePreviewSimulationTrials(candidates.length)) : fullTrials;

  let best: SportsBingoBoardPreview | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  // Phase 9b/9c item 5 — the realised star mix of the board that is actually kept. Held in a box
  // so the callback below can write to it without TypeScript narrowing it to `null`.
  const attemptStarMix: { value: StarMixTelemetry | null } = { value: null };
  // Read through a function: TypeScript's control-flow analysis cannot see the callback write, so
  // a direct `attemptStarMix.value` read would be narrowed to the `null` it was reset to.
  const readAttemptStarMix = (): StarMixTelemetry | null => attemptStarMix.value;
  let bestStarMix: StarMixTelemetry | null = null;
  let bestStarBias = 0;
  // Phase 5b: re-sampling a uniformly-shuffled pool cannot reach a target the pool is not centred
  // on. Every `ESCALATE_EVERY` fruitless attempts, lean the *selection* (never the pricing) toward
  // harder or easier squares depending on which side of the target the best board so far sits.
  // Bias stays at 0 — today's exact behaviour — for any board that finds its target promptly.
  const ESCALATE_EVERY = 24;
  const MAX_DIFFICULTY_BIAS = 0.8;
  let difficultyBias = 0;

  // Phase 5 (code-review fix plan) — hoisted out of the attempt loop below. The tiers are a pure
  // function of `candidates`, which never changes across the 180 attempts, so computing them here
  // is output-identical and drops 180 O(n^2) percentile walks per board to one.
  const precomputedStarTiers = buildStarTiersForPool(candidates, game.sportKey);

  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (attempt > 0 && attempt % ESCALATE_EVERY === 0 && best) {
      const direction = best.boardProbability > target ? 1 : -1;
      difficultyBias = clamp(difficultyBias + direction * 0.2, -MAX_DIFFICULTY_BIAS, MAX_DIFFICULTY_BIAS);
    }

    attemptStarMix.value = null;
    const picked = pickCandidateSet(candidates, game.sportKey, {
      difficultyBias,
      precomputedStarTiers,
      onStarMix: (mix) => {
        attemptStarMix.value = mix;
      },
    });
    const boardSquares = arrangeBoardSquaresForFeasibleLines(picked);
    if (!boardSquares) {
      continue;
    }

    const preview = buildBoardPreview(game, boardSquares, simulationTrials);
    const delta = Math.abs(preview.boardProbability - target);

    if (!best || delta < bestDelta) {
      best = preview;
      bestDelta = delta;
      bestStarMix = readAttemptStarMix();
      bestStarBias = difficultyBias;
    }

    if (delta <= tolerance) {
      break;
    }
  }

  if (!best) {
    throw new Error("Unable to generate a bingo board for this game.");
  }

  // Phase 9b — the observability line the plan asks for (9c item 5), matching the shape of
  // `mlb_named_player_weighting` so a real Sunday slate can be audited from production logs
  // instead of by re-running a simulator. One line per board, describing the board that shipped.
  // Phase 9d makes the name per-sport (`nfl_star_mix` / `mlb_star_mix`) rather than adding a second
  // callback: `pickCandidateSet` runs up to 180 times per board and only one attempt survives, so
  // both leagues have to route through the same "log the board that was actually kept" discipline.
  if (bestStarMix) {
    console.info(`[sportsBingo] ${bestStarMix.sport}_star_mix`, {
      star: bestStarMix.star,
      known: bestStarMix.known,
      deep: bestStarMix.deep,
      pool: bestStarMix.pool,
      star_players_in_pool: bestStarMix.starPlayersInPool,
      desired_slots: bestStarMix.desiredSlots,
      max_star_slots: bestStarMix.maxStarSlots,
      min_non_star_slots:
        bestStarMix.sport === "mlb" ? MLB_STAR_MIN_NON_STAR_SLOTS : NFL_STAR_MIN_NON_STAR_SLOTS,
      reservation_degraded: bestStarMix.reservationDegraded,
      difficulty_bias: Number(bestStarBias.toFixed(2)),
    });
  }

  return best;
}

/**
 * Phase 5c of docs/prop-bingo-nfl-plan.md — build a real board for an arbitrary balldontlie game
 * row, including an archived one, for `npm run bingo:simulate`.
 *
 * `listSportsBingoGames` / `generateSportsBingoBoard` cannot serve a backtest: they run through
 * `loadGameCatalog`, which only ever looks at the *upcoming* slate. This is the same pipeline
 * (`buildGameAndCandidatesFromBallDontLie` -> `generateBoardForGame`) entered one level down, so a
 * backtest board is built by the shipped generator with the shipped candidate mix and the shipped
 * estimator — not by a script's idea of them.
 *
 * The one thing it cannot reproduce is player props: `/nfl/v1/odds/player_props` is live-only, so a
 * historical board is core markets plus team/game/quarter squares. That limitation is stated in the
 * plan and is the reason the backtest is a floor on realism, not a full replay.
 */
export function buildSportsBingoBoardFromBallDontLieGame(params: {
  sportKey: string;
  row: Record<string, unknown>;
  marketModel?: NFLMarketModel | null;
  /** R4: extra candidate templates the caller assembled itself — see `buildMlbTeamEventCandidateTemplatesForBacktest`. */
  extraCandidates?: SportsBingoSquareTemplate[];
}): {
  game: SportsBingoGame;
  boardProbability: number;
  candidateCount: number;
  /** Board order, resolver included — the backtest needs the resolver to grade the square. */
  squares: Array<{ index: number; key: string; label: string; probability: number; isFree: boolean; resolver: SportsBingoResolver }>;
} | null {
  const entry = buildGameAndCandidatesFromBallDontLie(
    params.sportKey,
    params.row as BallDontLieGame,
    params.marketModel ?? null,
    params.extraCandidates ?? []
  );
  if (!entry) {
    return null;
  }

  const boardable = entry.candidates.filter(
    (candidate) => BINGO_ALLOW_POSSIBLE_SQUARES || (candidate.supportLevel ?? "supported") === "supported"
  );
  if (boardable.length < 24) {
    return null;
  }

  const preview = generateBoardForGame(entry.game, boardable);
  const byKey = new Map(boardable.map((candidate) => [candidate.key, candidate]));

  return {
    game: entry.game,
    boardProbability: preview.boardProbability,
    candidateCount: boardable.length,
    squares: preview.squares.map((square) => ({
      index: square.index,
      key: square.key,
      label: square.label,
      probability: square.probability,
      isFree: square.isFree,
      resolver: byKey.get(square.key)?.resolver ?? { kind: "free" },
    })),
  };
}

/**
 * Phase 7 of docs/prop-bingo-nfl-plan.md — a board built through the **full async candidate path**,
 * with resolvers attached so it can be settled.
 *
 * `buildSportsBingoBoardFromBallDontLieGame` only sees `buildGameAndCandidatesFromBallDontLie`,
 * i.e. the core markets. That is enough for NFL backtesting, where the extra families are
 * play-derived, but an MLB board is mostly the team-event block — which is assembled asynchronously
 * from `/mlb/v1/stats` and is therefore invisible to that function. Measuring an MLB win rate
 * without it would measure a board no player is ever dealt.
 *
 * `generateSportsBingoBoard` runs the same pipeline but deliberately returns a client-facing
 * payload with resolvers stripped, and it should stay that way — the resolver is grading internals.
 * Hence this separate seam.
 */
export async function buildSportsBingoBoardWithResolvers(params: {
  gameId: string;
  sportKey: string;
}): Promise<{
  game: SportsBingoGame;
  boardProbability: number;
  candidateCount: number;
  squares: Array<{ index: number; key: string; label: string; probability: number; isFree: boolean; resolver: SportsBingoResolver }>;
} | null> {
  const entry = await getGameEntryWithCandidates({
    sportKey: params.sportKey,
    gameId: params.gameId,
    includePlayerProps: true,
  });
  if (!entry) {
    return null;
  }

  const preview = generateBoardForGame(entry.game, entry.candidates);
  const byKey = new Map(entry.candidates.map((candidate) => [candidate.key, candidate]));

  return {
    game: entry.game,
    boardProbability: preview.boardProbability,
    candidateCount: entry.candidates.length,
    squares: preview.squares.map((square) => ({
      index: square.index,
      key: square.key,
      label: square.label,
      probability: square.probability,
      isFree: square.isFree,
      resolver: byKey.get(square.key)?.resolver ?? { kind: "free" },
    })),
  };
}

export async function listSportsBingoGames(params: {
  sportKey?: string;
  includeLocked?: boolean;
  tzOffsetMinutes?: number | string;
} = {}): Promise<SportsBingoGame[]> {
  const sportKey = (params.sportKey ?? DEFAULT_SPORT_KEY).trim() || DEFAULT_SPORT_KEY;
  const includeLocked = Boolean(params.includeLocked);
  const parsedOffset = Number.parseInt(String(params.tzOffsetMinutes ?? ""), 10);
  const tzOffsetMinutes = Number.isFinite(parsedOffset) ? Math.max(-14 * 60, Math.min(14 * 60, parsedOffset)) : new Date().getTimezoneOffset();
  const now = Date.now();
  const todayLocalMs = now - tzOffsetMinutes * 60_000;
  const todayLocalDate = new Date(todayLocalMs);
  const todayLocalKey = `${todayLocalDate.getUTCFullYear()}-${String(todayLocalDate.getUTCMonth() + 1).padStart(2, "0")}-${String(
    todayLocalDate.getUTCDate()
  ).padStart(2, "0")}`;

  const catalog = await getGameCatalog(sportKey);

  return catalog
    // Only list games we can actually build a board for. Without this, an NFL game the books have
    // not priced still appears (its core squares exist, they are just all `possible`), the player
    // taps it, and board generation throws — surfaced as a raw error where an absence belongs.
    // Carries over the open empty-state item from the Phase 1 and Phase 2 handoff notes.
    .filter((entry) => boardableCandidateCount(entry.candidates) >= 24)
    .map((entry) => ({
      ...entry.game,
      isLocked: +new Date(entry.game.startsAt) <= now,
    }))
    .filter((game) => {
      const startsAtMs = +new Date(game.startsAt);
      if (!Number.isFinite(startsAtMs)) {
        return false;
      }
      const localMs = startsAtMs - tzOffsetMinutes * 60_000;
      const localDate = new Date(localMs);
      const localKey = `${localDate.getUTCFullYear()}-${String(localDate.getUTCMonth() + 1).padStart(2, "0")}-${String(
        localDate.getUTCDate()
      ).padStart(2, "0")}`;
      return localKey === todayLocalKey;
    })
    .filter((game) => (includeLocked ? true : !game.isLocked));
}

export type SportsBingoSquareTemplatePreview = {
  key: string;
  label: string;
  bucket: "moneyline" | "spread" | "total" | "team-total" | "player-prop" | "special" | "achievement";
  probability: number;
  supportLevel: SquareSupportLevel;
  resolverKind:
    | "free"
    | "moneyline"
    | "spread_more_than"
    | "spread_keep_close"
    | "game_total_over"
    | "game_total_under"
    | "team_total_over"
    | "team_total_under"
    | "player_prop"
    | "nba_player_stat_at_least"
    | "nba_player_double_double"
    | "team_triple_double"
    | "any_triple_double"
    | "nba_team_stat_at_least"
    | "nba_team_players_scored_at_least"
    | "nba_player_triple_double"
    | "nba_player_perfect_ft"
    | "nba_player_perfect_fg"
    | "nba_player_triple_threat"
    | "nba_player_zero_turnovers"
    | "nba_player_plus_minus_at_least"
    | "nba_team_has_double_double"
    | "nba_team_three_pt_scorers"
    | "nba_team_turnovers_at_most"
    | "nba_team_outrebounds"
    | "nba_player_bench_scores"
    | "nba_team_scores_first"
    | "nba_team_leads_at_halftime"
    | "nba_team_points_in_any_quarter_at_least"
    | "nba_player_points_first_half_at_least"
    | "nba_player_assists_in_any_quarter_at_least"
    | "nba_player_steals_first_half_at_least"
    | "mlb_webhook_player_event_at_least"
    | "mlb_webhook_player_event_at_most"
    | "mlb_webhook_team_event_at_least"
    | "nfl_player_anytime_td"
    | "nfl_player_first_td"
    | "nfl_team_scores_every_quarter"
    | "nfl_team_shutout_quarter"
    | "nfl_team_quarter_points_at_least"
    | "nfl_any_quarter_scoreless"
    | "nfl_team_leads_at_halftime"
    | "nfl_halftime_leader_loses"
    | "nfl_overtime"
    | "nfl_both_teams_score_at_least"
    | "nfl_margin_at_most"
    | "nfl_margin_at_least"
    | "nfl_second_half_higher_scoring"
    | "nfl_first_score_is_field_goal"
    | "nfl_first_scorer_wins"
    | "nfl_non_offensive_touchdown"
    | "nfl_fourth_down_conversion"
    | "nfl_long_touchdown"
    // Phase 8b — the flavor slate.
    | "nfl_team_stat_at_least"
    | "nfl_team_stat_at_most"
    | "nfl_combined_team_stat_at_least"
    | "nfl_combined_team_stat_at_most"
    | "nfl_team_perfect_red_zone"
    | "nfl_team_red_zone_trip_without_touchdown"
    | "nfl_team_possession_advantage"
    | "nfl_game_max_stat_at_least"
    | "nfl_game_total_stat_at_least"
    | "nfl_game_missed_field_goal"
    | "nfl_non_quarterback_pass_attempt"
    | "nfl_first_score_within_minutes"
    | "nfl_score_in_final_minutes"
    | "nfl_both_teams_lead"
    | "nfl_lead_change_second_half"
    | "nfl_tied_after_halftime"
    | "nfl_winner_trailed_in_fourth"
    | "nfl_two_point_conversion"
    | "nfl_safety"
    | "nfl_goal_line_touchdown"
    | "replacement_auto";
};

export async function listSportsBingoSquareTemplates(params: {
  gameId: string;
  sportKey?: string;
  includePlayerProps?: boolean;
}): Promise<{ game: SportsBingoGame; squares: SportsBingoSquareTemplatePreview[] }> {
  const gameId = params.gameId.trim();
  if (!gameId) {
    throw new Error("gameId is required.");
  }

  const sportKey = (params.sportKey ?? DEFAULT_SPORT_KEY).trim() || DEFAULT_SPORT_KEY;
  const entry = await getGameEntryWithCandidates({
    sportKey,
    gameId,
    includePlayerProps: params.includePlayerProps !== false,
  });
  if (!entry) {
    throw new Error("The selected game is unavailable right now.");
  }

  const squares: SportsBingoSquareTemplatePreview[] = entry.candidates
    .map((candidate) => ({
      key: candidate.key,
      label: candidate.label,
      bucket: candidate.bucket,
      probability: clamp(candidate.probability, 0.05, 0.95),
      supportLevel: candidate.supportLevel ?? "supported",
      resolverKind: candidate.resolver.kind,
    }))
    .sort((a, b) => {
      if (a.supportLevel !== b.supportLevel) {
        return a.supportLevel === "supported" ? -1 : 1;
      }
      return a.key.localeCompare(b.key);
    });

  return {
    game: entry.game,
    squares,
  };
}

export async function generateSportsBingoBoard(params: {
  gameId: string;
  sportKey?: string;
  generationMode?: "preview" | "final";
}): Promise<SportsBingoBoardPreview> {
  const gameId = params.gameId.trim();
  if (!gameId) {
    throw new Error("gameId is required.");
  }

  const sportKey = (params.sportKey ?? DEFAULT_SPORT_KEY).trim() || DEFAULT_SPORT_KEY;
  const entry = await getGameEntryWithCandidates({
    sportKey,
    gameId,
    includePlayerProps: true,
  });
  if (!entry) {
    throw new Error("The selected game is unavailable right now.");
  }

  return generateBoardForGame(entry.game, entry.candidates, {
    generationMode: params.generationMode ?? "final",
  });
}

function parseResolver(value: unknown): SportsBingoResolver | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const resolver = value as Partial<SportsBingoResolver>;
  if (typeof resolver.kind !== "string") {
    return null;
  }

  switch (resolver.kind) {
    case "free":
      return { kind: "free" };
    case "replacement_auto":
      return { kind: "replacement_auto" };
    case "moneyline":
      if (resolver.team === "home" || resolver.team === "away") {
        return { kind: "moneyline", team: resolver.team };
      }
      return null;
    case "spread_more_than":
      if ((resolver.team === "home" || resolver.team === "away") && typeof resolver.line === "number" && Number.isFinite(resolver.line)) {
        return { kind: "spread_more_than", team: resolver.team, line: resolver.line };
      }
      return null;
    case "spread_keep_close":
      if ((resolver.team === "home" || resolver.team === "away") && typeof resolver.line === "number" && Number.isFinite(resolver.line)) {
        return { kind: "spread_keep_close", team: resolver.team, line: resolver.line };
      }
      return null;
    case "game_total_over":
      if (typeof resolver.line === "number" && Number.isFinite(resolver.line)) {
        return { kind: "game_total_over", line: resolver.line };
      }
      return null;
    case "game_total_under":
      if (typeof resolver.line === "number" && Number.isFinite(resolver.line)) {
        return { kind: "game_total_under", line: resolver.line };
      }
      return null;
    case "team_total_over":
      if ((resolver.team === "home" || resolver.team === "away") && typeof resolver.line === "number" && Number.isFinite(resolver.line)) {
        return { kind: "team_total_over", team: resolver.team, line: resolver.line };
      }
      return null;
    case "team_total_under":
      if ((resolver.team === "home" || resolver.team === "away") && typeof resolver.line === "number" && Number.isFinite(resolver.line)) {
        return { kind: "team_total_under", team: resolver.team, line: resolver.line };
      }
      return null;
    case "player_prop":
      if (
        typeof resolver.marketKey === "string" &&
        typeof resolver.player === "string" &&
        typeof resolver.line === "number" &&
        Number.isFinite(resolver.line) &&
        (resolver.direction === "over" || resolver.direction === "under")
      ) {
        return {
          kind: "player_prop",
          marketKey: resolver.marketKey,
          player: resolver.player,
          line: resolver.line,
          direction: resolver.direction,
        };
      }
      return null;
    case "nba_player_stat_at_least":
      if (
        typeof resolver.player === "string" &&
        typeof resolver.threshold === "number" &&
        Number.isFinite(resolver.threshold) &&
        (resolver.metric === "points" ||
          resolver.metric === "rebounds" ||
          resolver.metric === "assists" ||
          resolver.metric === "steals" ||
          resolver.metric === "blocks" ||
          resolver.metric === "threes" ||
          resolver.metric === "offensive_rebounds" ||
          resolver.metric === "free_throws_made" ||
          resolver.metric === "defensive_rebounds" ||
          resolver.metric === "two_point_fg" ||
          resolver.metric === "minutes_played")
      ) {
        return {
          kind: "nba_player_stat_at_least",
          player: resolver.player,
          metric: resolver.metric,
          threshold: resolver.threshold,
        };
      }
      return null;
    case "nba_player_double_double":
      if (typeof resolver.player === "string") {
        return { kind: "nba_player_double_double", player: resolver.player };
      }
      return null;
    case "team_triple_double":
      if (resolver.team === "home" || resolver.team === "away") {
        return { kind: "team_triple_double", team: resolver.team };
      }
      return null;
    case "any_triple_double":
      return { kind: "any_triple_double" };
    case "nba_team_stat_at_least":
      if (
        (resolver.team === "home" || resolver.team === "away") &&
        typeof resolver.threshold === "number" &&
        Number.isFinite(resolver.threshold) &&
        (resolver.metric === "points" ||
          resolver.metric === "blocks" ||
          resolver.metric === "steals" ||
          resolver.metric === "made_threes" ||
          resolver.metric === "offensive_rebounds" ||
          resolver.metric === "field_goal_pct" ||
          resolver.metric === "free_throw_pct" ||
          resolver.metric === "total_rebounds" ||
          resolver.metric === "total_assists")
      ) {
        return {
          kind: "nba_team_stat_at_least",
          team: resolver.team,
          metric: resolver.metric,
          threshold: resolver.threshold,
        };
      }
      return null;
    case "nba_team_players_scored_at_least":
      if (
        (resolver.team === "home" || resolver.team === "away") &&
        typeof resolver.threshold === "number" &&
        Number.isFinite(resolver.threshold)
      ) {
        return {
          kind: "nba_team_players_scored_at_least",
          team: resolver.team,
          threshold: resolver.threshold,
        };
      }
      return null;
    case "nba_player_triple_double":
      if (typeof resolver.player === "string") {
        return { kind: "nba_player_triple_double", player: resolver.player };
      }
      return null;
    case "nba_player_perfect_ft":
      if (typeof resolver.player === "string") {
        return { kind: "nba_player_perfect_ft", player: resolver.player };
      }
      return null;
    case "nba_player_perfect_fg":
      if (typeof resolver.player === "string") {
        return { kind: "nba_player_perfect_fg", player: resolver.player };
      }
      return null;
    case "nba_player_triple_threat":
      if (typeof resolver.player === "string") {
        return { kind: "nba_player_triple_threat", player: resolver.player };
      }
      return null;
    case "nba_player_zero_turnovers":
      if (typeof resolver.player === "string") {
        return { kind: "nba_player_zero_turnovers", player: resolver.player };
      }
      return null;
    case "nba_player_plus_minus_at_least":
      if (
        typeof resolver.player === "string" &&
        typeof resolver.threshold === "number" &&
        Number.isFinite(resolver.threshold)
      ) {
        return { kind: "nba_player_plus_minus_at_least", player: resolver.player, threshold: resolver.threshold };
      }
      return null;
    case "nba_team_has_double_double":
      if (resolver.team === "home" || resolver.team === "away") {
        return { kind: "nba_team_has_double_double", team: resolver.team };
      }
      return null;
    case "nba_team_three_pt_scorers":
      if (
        (resolver.team === "home" || resolver.team === "away") &&
        typeof resolver.threshold === "number" &&
        Number.isFinite(resolver.threshold)
      ) {
        return { kind: "nba_team_three_pt_scorers", team: resolver.team, threshold: resolver.threshold };
      }
      return null;
    case "nba_team_turnovers_at_most":
      if (
        (resolver.team === "home" || resolver.team === "away") &&
        typeof resolver.threshold === "number" &&
        Number.isFinite(resolver.threshold)
      ) {
        return { kind: "nba_team_turnovers_at_most", team: resolver.team, threshold: resolver.threshold };
      }
      return null;
    case "nba_team_outrebounds":
      if (resolver.team === "home" || resolver.team === "away") {
        return { kind: "nba_team_outrebounds", team: resolver.team };
      }
      return null;
    case "nba_player_bench_scores":
      if (typeof resolver.player === "string" && typeof resolver.threshold === "number" && Number.isFinite(resolver.threshold)) {
        return { kind: "nba_player_bench_scores", player: resolver.player, threshold: resolver.threshold };
      }
      return null;
    case "nba_team_scores_first":
      if (resolver.team === "home" || resolver.team === "away") {
        return { kind: "nba_team_scores_first", team: resolver.team };
      }
      return null;
    case "nba_team_leads_at_halftime":
      if (resolver.team === "home" || resolver.team === "away") {
        return { kind: "nba_team_leads_at_halftime", team: resolver.team };
      }
      return null;
    case "nba_team_points_in_any_quarter_at_least":
      if ((resolver.team === "home" || resolver.team === "away") && typeof resolver.threshold === "number" && Number.isFinite(resolver.threshold)) {
        return { kind: "nba_team_points_in_any_quarter_at_least", team: resolver.team, threshold: resolver.threshold };
      }
      return null;
    case "nba_player_points_first_half_at_least":
      if (typeof resolver.player === "string" && typeof resolver.threshold === "number" && Number.isFinite(resolver.threshold)) {
        return { kind: "nba_player_points_first_half_at_least", player: resolver.player, threshold: resolver.threshold };
      }
      return null;
    case "nba_player_assists_in_any_quarter_at_least":
      if (typeof resolver.player === "string" && typeof resolver.threshold === "number" && Number.isFinite(resolver.threshold)) {
        return { kind: "nba_player_assists_in_any_quarter_at_least", player: resolver.player, threshold: resolver.threshold };
      }
      return null;
    case "nba_player_steals_first_half_at_least":
      if (typeof resolver.player === "string" && typeof resolver.threshold === "number" && Number.isFinite(resolver.threshold)) {
        return { kind: "nba_player_steals_first_half_at_least", player: resolver.player, threshold: resolver.threshold };
      }
      return null;
    case "mlb_webhook_player_event_at_least":
      if (
        typeof resolver.player === "string" &&
        typeof resolver.threshold === "number" &&
        Number.isFinite(resolver.threshold) &&
        (resolver.event === "hit" ||
          resolver.event === "home_run" ||
          resolver.event === "strikeout" ||
          resolver.event === "walk" ||
          resolver.event === "hit_by_pitch" ||
          resolver.event === "rbi" ||
          resolver.event === "stolen_base" ||
          resolver.event === "pitcher_out")
      ) {
        return {
          kind: "mlb_webhook_player_event_at_least",
          player: resolver.player,
          event: resolver.event,
          threshold: resolver.threshold,
          currentCount:
            typeof resolver.currentCount === "number" && Number.isFinite(resolver.currentCount)
              ? resolver.currentCount
              : undefined,
        };
      }
      return null;
    case "mlb_webhook_player_event_at_most":
      if (
        typeof resolver.player === "string" &&
        typeof resolver.threshold === "number" &&
        Number.isFinite(resolver.threshold) &&
        (resolver.event === "strikeout" ||
          resolver.event === "earned_run" ||
          resolver.event === "hit_allowed")
      ) {
        return {
          kind: "mlb_webhook_player_event_at_most",
          player: resolver.player,
          event: resolver.event,
          threshold: resolver.threshold,
          currentCount:
            typeof resolver.currentCount === "number" && Number.isFinite(resolver.currentCount)
              ? resolver.currentCount
              : undefined,
        };
      }
      return null;
    case "mlb_webhook_team_event_at_least":
      if (
        (resolver.team === "home" || resolver.team === "away") &&
        typeof resolver.threshold === "number" &&
        Number.isFinite(resolver.threshold) &&
        (resolver.event === "groundout" ||
          resolver.event === "flyout" ||
          resolver.event === "strikeout" ||
          resolver.event === "walk" ||
          resolver.event === "hit_by_pitch" ||
          resolver.event === "hit" ||
          resolver.event === "home_run" ||
          resolver.event === "quick_out_under_3_pitches")
      ) {
        return {
          kind: "mlb_webhook_team_event_at_least",
          team: resolver.team,
          event: resolver.event,
          threshold: resolver.threshold,
          currentCount:
            typeof resolver.currentCount === "number" && Number.isFinite(resolver.currentCount)
              ? resolver.currentCount
              : undefined,
        };
      }
      return null;
    // --- Phase 3: the NFL square family -------------------------------------------------------
    case "nfl_player_anytime_td":
      if (typeof resolver.player === "string") {
        return { kind: "nfl_player_anytime_td", player: resolver.player };
      }
      return null;
    case "nfl_player_first_td":
      if (typeof resolver.player === "string") {
        return { kind: "nfl_player_first_td", player: resolver.player };
      }
      return null;
    case "nfl_team_scores_every_quarter":
      if (resolver.team === "home" || resolver.team === "away") {
        return { kind: "nfl_team_scores_every_quarter", team: resolver.team };
      }
      return null;
    case "nfl_team_shutout_quarter":
      if (resolver.team === "home" || resolver.team === "away") {
        return { kind: "nfl_team_shutout_quarter", team: resolver.team };
      }
      return null;
    case "nfl_team_quarter_points_at_least":
      if (
        (resolver.team === "home" || resolver.team === "away") &&
        typeof resolver.threshold === "number" &&
        Number.isFinite(resolver.threshold)
      ) {
        return { kind: "nfl_team_quarter_points_at_least", team: resolver.team, threshold: resolver.threshold };
      }
      return null;
    case "nfl_any_quarter_scoreless":
      return { kind: "nfl_any_quarter_scoreless" };
    case "nfl_team_leads_at_halftime":
      if (resolver.team === "home" || resolver.team === "away") {
        return { kind: "nfl_team_leads_at_halftime", team: resolver.team };
      }
      return null;
    case "nfl_halftime_leader_loses":
      return { kind: "nfl_halftime_leader_loses" };
    case "nfl_overtime":
      return { kind: "nfl_overtime" };
    case "nfl_both_teams_score_at_least":
      if (typeof resolver.threshold === "number" && Number.isFinite(resolver.threshold)) {
        return { kind: "nfl_both_teams_score_at_least", threshold: resolver.threshold };
      }
      return null;
    case "nfl_margin_at_most":
      if (typeof resolver.line === "number" && Number.isFinite(resolver.line)) {
        return { kind: "nfl_margin_at_most", line: resolver.line };
      }
      return null;
    case "nfl_margin_at_least":
      if (typeof resolver.line === "number" && Number.isFinite(resolver.line)) {
        return { kind: "nfl_margin_at_least", line: resolver.line };
      }
      return null;
    case "nfl_second_half_higher_scoring":
      return { kind: "nfl_second_half_higher_scoring" };
    case "nfl_first_score_is_field_goal":
      return { kind: "nfl_first_score_is_field_goal" };
    case "nfl_first_scorer_wins":
      return { kind: "nfl_first_scorer_wins" };
    case "nfl_non_offensive_touchdown":
      return { kind: "nfl_non_offensive_touchdown" };
    case "nfl_fourth_down_conversion":
      return { kind: "nfl_fourth_down_conversion" };
    case "nfl_long_touchdown":
      if (typeof resolver.yards === "number" && Number.isFinite(resolver.yards)) {
        return { kind: "nfl_long_touchdown", yards: resolver.yards };
      }
      return null;
    // --- Phase 8b: the flavor slate -------------------------------------------------------------
    // `field` goes through the allowlist here and nowhere else, which is what makes a typo in a
    // persisted resolver fail closed (the square voids) instead of grading against a zero.
    case "nfl_team_stat_at_least":
      if (
        (resolver.team === "home" || resolver.team === "away") &&
        isNFLTeamStatField(resolver.field) &&
        isFiniteNumber(resolver.threshold)
      ) {
        return {
          kind: "nfl_team_stat_at_least",
          team: resolver.team,
          field: resolver.field,
          threshold: resolver.threshold,
        };
      }
      return null;
    case "nfl_team_stat_at_most":
      if (
        (resolver.team === "home" || resolver.team === "away") &&
        isNFLTeamStatField(resolver.field) &&
        isFiniteNumber(resolver.threshold)
      ) {
        return {
          kind: "nfl_team_stat_at_most",
          team: resolver.team,
          field: resolver.field,
          threshold: resolver.threshold,
        };
      }
      return null;
    case "nfl_combined_team_stat_at_least":
      if (isNFLTeamStatField(resolver.field) && isFiniteNumber(resolver.threshold)) {
        return { kind: "nfl_combined_team_stat_at_least", field: resolver.field, threshold: resolver.threshold };
      }
      return null;
    case "nfl_combined_team_stat_at_most":
      if (isNFLTeamStatField(resolver.field) && isFiniteNumber(resolver.threshold)) {
        return { kind: "nfl_combined_team_stat_at_most", field: resolver.field, threshold: resolver.threshold };
      }
      return null;
    case "nfl_team_perfect_red_zone":
      if ((resolver.team === "home" || resolver.team === "away") && isFiniteNumber(resolver.minTrips)) {
        return { kind: "nfl_team_perfect_red_zone", team: resolver.team, minTrips: resolver.minTrips };
      }
      return null;
    case "nfl_team_red_zone_trip_without_touchdown":
      if (resolver.team === "home" || resolver.team === "away") {
        return { kind: "nfl_team_red_zone_trip_without_touchdown", team: resolver.team };
      }
      return null;
    case "nfl_team_possession_advantage":
      if ((resolver.team === "home" || resolver.team === "away") && isFiniteNumber(resolver.seconds)) {
        return { kind: "nfl_team_possession_advantage", team: resolver.team, seconds: resolver.seconds };
      }
      return null;
    case "nfl_game_max_stat_at_least":
      if (
        isNFLPlayerStatField(resolver.field) &&
        isFiniteNumber(resolver.threshold) &&
        (resolver.scope === "any_player" || resolver.scope === "both_teams")
      ) {
        return {
          kind: "nfl_game_max_stat_at_least",
          field: resolver.field,
          threshold: resolver.threshold,
          scope: resolver.scope,
        };
      }
      return null;
    case "nfl_game_total_stat_at_least":
      if (isNFLPlayerStatField(resolver.field) && isFiniteNumber(resolver.threshold)) {
        return { kind: "nfl_game_total_stat_at_least", field: resolver.field, threshold: resolver.threshold };
      }
      return null;
    case "nfl_game_missed_field_goal":
      return { kind: "nfl_game_missed_field_goal" };
    case "nfl_non_quarterback_pass_attempt":
      return { kind: "nfl_non_quarterback_pass_attempt" };
    case "nfl_first_score_within_minutes":
      if (isFiniteNumber(resolver.minutes)) {
        return { kind: "nfl_first_score_within_minutes", minutes: resolver.minutes };
      }
      return null;
    case "nfl_score_in_final_minutes":
      if ((resolver.segment === "first_half" || resolver.segment === "fourth_quarter") && isFiniteNumber(resolver.minutes)) {
        return { kind: "nfl_score_in_final_minutes", segment: resolver.segment, minutes: resolver.minutes };
      }
      return null;
    case "nfl_both_teams_lead":
      return { kind: "nfl_both_teams_lead" };
    case "nfl_lead_change_second_half":
      return { kind: "nfl_lead_change_second_half" };
    case "nfl_tied_after_halftime":
      return { kind: "nfl_tied_after_halftime" };
    case "nfl_winner_trailed_in_fourth":
      return { kind: "nfl_winner_trailed_in_fourth" };
    case "nfl_two_point_conversion":
      return { kind: "nfl_two_point_conversion" };
    case "nfl_safety":
      return { kind: "nfl_safety" };
    case "nfl_goal_line_touchdown":
      if (isFiniteNumber(resolver.yards)) {
        return { kind: "nfl_goal_line_touchdown", yards: resolver.yards };
      }
      return null;
    default:
      return null;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function mapCardRow(row: SportsBingoCardRow, squares: SportsBingoSquareRow[]): SportsBingoCard {
  const squareLabelForCard = (square: SportsBingoSquareRow): string => {
    if (square.is_free) {
      return "FREE";
    }
    const resolver = parseResolver(square.resolver);
    if (!resolver) {
      return square.label;
    }
    const game: SportsBingoGame = {
      id: row.game_id,
      sportKey: row.sport_key,
      homeTeam: row.home_team,
      awayTeam: row.away_team,
      startsAt: row.starts_at,
      gameLabel: row.game_label,
      isLocked: Date.parse(row.starts_at) <= Date.now(),
    };
    return buildSquareLabel(game, resolver);
  };

  const mappedSquares = squares
    .map((square) => {
      const resolver = parseResolver(square.resolver);
      return {
        id: square.id,
        index: square.square_index,
        key: resolverKey(resolver ?? { kind: "free" }),
        label: squareLabelForCard(square),
        probability: Number(square.probability),
        isFree: square.is_free,
        status: square.status,
        resolvedAt: square.resolved_at ?? undefined,
        propProgress: resolver ? resolverProgressPayload(resolver) ?? undefined : undefined,
      };
    })
    .sort((a, b) => a.index - b.index);

  return {
    id: row.id,
    userId: row.user_id,
    venueId: row.venue_id,
    gameId: row.game_id,
    gameLabel: row.game_label,
    sportKey: row.sport_key,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    startsAt: row.starts_at,
    status: row.status,
    boardProbability: Number(row.board_probability),
    rewardPoints: Number(row.reward_points),
    rewardClaimedAt: row.reward_claimed_at ?? undefined,
    createdAt: row.created_at,
    settledAt: row.settled_at ?? undefined,
    squares: mappedSquares,
  };
}

async function listCardRows(params: {
  userId?: string;
  activeOnly?: boolean;
  limit?: number;
  sportKey?: string;
  gameId?: string;
  stalestFirst?: boolean;
  // Half-open [startsAtFrom, startsAtTo) window on `starts_at`, as ISO strings. Used by the
  // Bingo calendar (plan 5a): the day filter has to run in SQL, because filtering the 100-row
  // window client-side silently loses history for an active player.
  startsAtFrom?: string;
  startsAtTo?: string;
}): Promise<Array<{ card: SportsBingoCardRow; squares: SportsBingoSquareRow[] }>> {
  assertSupabaseConfigured();

  let query = supabaseAdmin!
    .from("sports_bingo_cards")
    .select(
      "id, user_id, venue_id, game_id, game_label, sport_key, home_team, away_team, starts_at, status, board_probability, reward_points, reward_claimed_at, near_win_notified_at, won_notified_at, won_line, settled_at, created_at, updated_at, last_cron_processed_at"
    )
    .order(params.stalestFirst ? "last_cron_processed_at" : "created_at", {
      ascending: Boolean(params.stalestFirst),
      nullsFirst: Boolean(params.stalestFirst),
    })
    .limit(Math.max(1, Math.min(params.limit ?? 100, 500)));

  if (params.userId) {
    query = query.eq("user_id", params.userId);
  }
  if (params.activeOnly) {
    query = query.eq("status", "active");
  }
  if (params.sportKey) {
    query = query.eq("sport_key", params.sportKey);
  }
  if (params.gameId) {
    query = query.eq("game_id", params.gameId);
  }
  if (params.startsAtFrom) {
    query = query.gte("starts_at", params.startsAtFrom);
  }
  if (params.startsAtTo) {
    query = query.lt("starts_at", params.startsAtTo);
  }

  const { data: cardsData, error: cardsError } = await query;
  if (cardsError || !cardsData) {
    if (isMissingSportsBingoTablesError(cardsError)) {
      return [];
    }
    throw new Error(cardsError?.message ?? "Failed to load bingo cards.");
  }

  const cards = cardsData as SportsBingoCardRow[];
  if (cards.length === 0) {
    return [];
  }

  const cardIds = cards.map((card) => card.id);
  const { data: squaresData, error: squaresError } = await supabaseAdmin!
    .from("sports_bingo_squares")
    .select("id, card_id, square_index, label, resolver, probability, is_free, status, created_at, resolved_at")
    .in("card_id", cardIds)
    .order("square_index", { ascending: true });

  if (squaresError || !squaresData) {
    if (isMissingSportsBingoTablesError(squaresError)) {
      return [];
    }
    throw new Error(squaresError?.message ?? "Failed to load bingo squares.");
  }

  const byCardId = new Map<string, SportsBingoSquareRow[]>();
  for (const row of squaresData as SportsBingoSquareRow[]) {
    const existing = byCardId.get(row.card_id) ?? [];
    existing.push(row);
    byCardId.set(row.card_id, existing);
  }

  return cards.map((card) => ({
    card,
    squares: byCardId.get(card.id) ?? [],
  }));
}

/** Exported for the validator, which grades a resolver against a live-fetched snapshot directly. */
export function evaluateResolver(
  resolver: SportsBingoResolver,
  snapshot: ScoreSnapshot,
  nbaStatsSnapshot: NBAGamePlayerStatsSnapshot | null = null,
  mlbStatsSnapshot: MLBGamePlayerStatsSnapshot | null = null,
  nflStatsSnapshot: NFLGameStatsSnapshot | null = null
): { status: "pending" | "hit" | "miss" | "void"; resolved: boolean } {
  const home = snapshot.homeScore;
  const away = snapshot.awayScore;
  const completed = snapshot.completed;

  if (resolver.kind === "free") {
    return { status: "hit", resolved: true };
  }

  if (resolver.kind === "replacement_auto") {
    return { status: "void", resolved: true };
  }
  const hasGameScore = home !== null && away !== null;

  const teamScore = (team: TeamSide) => (team === "home" ? (home ?? 0) : (away ?? 0));
  const opponentScore = (team: TeamSide) => (team === "home" ? (away ?? 0) : (home ?? 0));
  const totalScore = (home ?? 0) + (away ?? 0);

  switch (resolver.kind) {
    case "moneyline":
      if (!hasGameScore) {
        return { status: "pending", resolved: false };
      }
      if (!completed) {
        return { status: "pending", resolved: false };
      }
      if (teamScore(resolver.team) === opponentScore(resolver.team)) {
        return { status: "void", resolved: true };
      }
      return {
        status: teamScore(resolver.team) > opponentScore(resolver.team) ? "hit" : "miss",
        resolved: true,
      };
    case "spread_more_than":
      if (!hasGameScore) {
        return { status: "pending", resolved: false };
      }
      if (!completed) {
        return { status: "pending", resolved: false };
      }
      return {
        status: teamScore(resolver.team) - opponentScore(resolver.team) > resolver.line ? "hit" : "miss",
        resolved: true,
      };
    case "spread_keep_close":
      if (!hasGameScore) {
        return { status: "pending", resolved: false };
      }
      if (!completed) {
        return { status: "pending", resolved: false };
      }
      return {
        status: teamScore(resolver.team) + resolver.line > opponentScore(resolver.team) ? "hit" : "miss",
        resolved: true,
      };
    case "game_total_over":
      if (!hasGameScore) {
        return { status: "pending", resolved: false };
      }
      if (totalScore > resolver.line) {
        return { status: "hit", resolved: true };
      }
      if (completed) {
        return { status: "miss", resolved: true };
      }
      return { status: "pending", resolved: false };
    case "game_total_under":
      if (hasGameScore && totalScore >= resolver.line) {
        return { status: "miss", resolved: true };
      }
      if (!hasGameScore) {
        return { status: "pending", resolved: false };
      }
      if (!completed) {
        return { status: "pending", resolved: false };
      }
      return {
        status: totalScore < resolver.line ? "hit" : "miss",
        resolved: true,
      };
    case "team_total_over": {
      if (!hasGameScore) {
        return { status: "pending", resolved: false };
      }
      const score = teamScore(resolver.team);
      if (score > resolver.line) {
        return { status: "hit", resolved: true };
      }
      if (completed) {
        return { status: "miss", resolved: true };
      }
      return { status: "pending", resolved: false };
    }
    case "team_total_under": {
      if (hasGameScore && teamScore(resolver.team) >= resolver.line) {
        return { status: "miss", resolved: true };
      }
      if (!hasGameScore) {
        return { status: "pending", resolved: false };
      }
      if (!completed) {
        return { status: "pending", resolved: false };
      }
      const score = teamScore(resolver.team);
      return {
        status: score < resolver.line ? "hit" : "miss",
        resolved: true,
      };
    }
    case "player_prop": {
      const isNba = snapshot.sportKey === "basketball_nba";
      const isMlb = snapshot.sportKey === "baseball_mlb";
      const isNfl = snapshot.sportKey === "americanfootball_nfl";
      // Phase 4: NFL props grade off the `/nfl/v1/stats` box score. Three deliberate differences
      // from the NBA/MLB path below, all of them from the plan's settlement rules:
      //   1. a market we cannot settle **voids** rather than missing — the player never had a
      //      chance at it, so it is not a loss;
      //   2. an over/at-least hits the instant the box score clears the line, mid-game, while an
      //      under/at-most is only safe at Final;
      //   3. a player with no box-score row at Final (inactive, DNP) **voids**, and is registered
      //      in `isResolverEligibleForVoidRegrade` so a late-arriving stat line reopens the square.
      if (isNfl) {
        if (!isNFLPlayerPropMarketSupported(resolver.marketKey)) {
          return { status: "void", resolved: true };
        }
        if (!nflStatsSnapshot) {
          return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
        }
        const isFinalized = completed || nflStatsSnapshot.finalized;
        const nflLine = findNFLPlayerStatLine(nflStatsSnapshot, resolver.player);
        if (!nflLine) {
          return isFinalized ? { status: "void", resolved: true } : { status: "pending", resolved: false };
        }
        const value = getNFLPlayerPropValue(nflLine, resolver.marketKey);
        if (value === null || !Number.isFinite(value)) {
          return isFinalized ? { status: "void", resolved: true } : { status: "pending", resolved: false };
        }
        if (resolver.direction === "over") {
          if (value > resolver.line) {
            return { status: "hit", resolved: true };
          }
          return isFinalized ? { status: "miss", resolved: true } : { status: "pending", resolved: false };
        }
        // Under: a box-score total only ever grows, so clearing the line is an immediate miss —
        // but staying below it proves nothing until the game is over.
        if (value >= resolver.line) {
          return { status: "miss", resolved: true };
        }
        return isFinalized ? { status: "hit", resolved: true } : { status: "pending", resolved: false };
      }
      const supported = isNba
        ? isNBAPlayerPropMarketSupported(resolver.marketKey)
        : isMlb
        ? isMLBPlayerPropMarketSupported(resolver.marketKey)
        : false;
      if (!supported) {
        return { status: "miss", resolved: true };
      }

      if (isNba && !nbaStatsSnapshot) {
        if (!completed) {
          return { status: "pending", resolved: false };
        }
        return { status: "miss", resolved: true };
      }
      if (isMlb && !mlbStatsSnapshot) {
        if (!completed) {
          return { status: "pending", resolved: false };
        }
        return { status: "void", resolved: true };
      }

      const nbaLine = isNba && nbaStatsSnapshot ? findNBAPlayerStatLine(nbaStatsSnapshot, resolver.player) : null;
      const mlbLine = isMlb && mlbStatsSnapshot ? findMLBPlayerStatLine(mlbStatsSnapshot, resolver.player) : null;
      const isFinalized = Boolean((isNba && nbaStatsSnapshot?.finalized) || (isMlb && mlbStatsSnapshot?.finalized));
      if (!nbaLine && !mlbLine) {
        if (!completed && !isFinalized) {
          return { status: "pending", resolved: false };
        }
        return { status: isMlb ? "void" : "miss", resolved: true };
      }
      const value = nbaLine
        ? getNBAPlayerPropValue(nbaLine, resolver.marketKey)
        : mlbLine
        ? getMLBPlayerPropValue(mlbLine, resolver.marketKey)
        : null;
      if (value === null || !Number.isFinite(value)) {
        if (!completed && !isFinalized) {
          return { status: "pending", resolved: false };
        }
        return { status: isMlb ? "void" : "miss", resolved: true };
      }

      const line = value;
      if (line === resolver.line) {
        if (!completed && !isFinalized) {
          return { status: "pending", resolved: false };
        }
        return { status: "miss", resolved: true };
      }

      if (resolver.direction === "over") {
        if (line > resolver.line) {
          return { status: "hit", resolved: true };
        }
        if (completed || isFinalized) {
          return { status: "miss", resolved: true };
        }
        return { status: "pending", resolved: false };
      }
      if (line >= resolver.line) {
        return { status: "miss", resolved: true };
      }
      if (completed || isFinalized) {
        return { status: line < resolver.line ? "hit" : "miss", resolved: true };
      }
      return { status: "pending", resolved: false };
    }
    case "nba_player_stat_at_least": {
      if (!nbaStatsSnapshot) {
        if (!completed) {
          return { status: "pending", resolved: false };
        }
        return { status: "void", resolved: true };
      }
      const line = findNBAPlayerStatLine(nbaStatsSnapshot, resolver.player);
      if (!line) {
        if (!completed && !nbaStatsSnapshot.finalized) {
          return { status: "pending", resolved: false };
        }
        return { status: "miss", resolved: true };
      }
      const value = getNBAPlayerMilestoneValue(line, resolver.metric);
      if (value === null || !Number.isFinite(value)) {
        if (!completed && !nbaStatsSnapshot.finalized) {
          return { status: "pending", resolved: false };
        }
        return { status: "miss", resolved: true };
      }
      if (value >= resolver.threshold) {
        return { status: "hit", resolved: true };
      }
      if (completed || nbaStatsSnapshot.finalized) {
        return { status: "miss", resolved: true };
      }
      return { status: "pending", resolved: false };
    }
    case "nba_player_double_double": {
      if (!nbaStatsSnapshot) {
        if (!completed) {
          return { status: "pending", resolved: false };
        }
        return { status: "void", resolved: true };
      }
      const line = findNBAPlayerStatLine(nbaStatsSnapshot, resolver.player);
      if (!line) {
        if (!completed && !nbaStatsSnapshot.finalized) {
          return { status: "pending", resolved: false };
        }
        return { status: "miss", resolved: true };
      }
      if (hasDoubleDouble(line)) {
        return { status: "hit", resolved: true };
      }
      if (completed || nbaStatsSnapshot.finalized) {
        return { status: "miss", resolved: true };
      }
      return { status: "pending", resolved: false };
    }
    case "team_triple_double":
    case "any_triple_double": {
      if (!nbaStatsSnapshot) {
        if (!completed) {
          return { status: "pending", resolved: false };
        }
        return { status: "void", resolved: true };
      }
      if (resolver.kind === "any_triple_double") {
        if (nbaStatsSnapshot.anyHasTripleDouble) {
          return { status: "hit", resolved: true };
        }
        if (completed || nbaStatsSnapshot.finalized) {
          return { status: "miss", resolved: true };
        }
        return { status: "pending", resolved: false };
      }

      const hasTeamTripleDouble = resolver.team === "home"
        ? nbaStatsSnapshot.homeHasTripleDouble
        : nbaStatsSnapshot.awayHasTripleDouble;
      if (hasTeamTripleDouble) {
        return { status: "hit", resolved: true };
      }
      if (completed || nbaStatsSnapshot.finalized) {
        return { status: "miss", resolved: true };
      }
      return { status: "pending", resolved: false };
    }
    case "nba_team_stat_at_least": {
      if (!nbaStatsSnapshot) {
        if (!completed) {
          return { status: "pending", resolved: false };
        }
        return { status: "void", resolved: true };
      }

      const aggregates = buildNBATeamAggregates(nbaStatsSnapshot, resolver.team);
      const value = getNBATeamMilestoneValue(aggregates, resolver.metric);
      if (value === null || !Number.isFinite(value)) {
        if (!completed && !nbaStatsSnapshot.finalized) {
          return { status: "pending", resolved: false };
        }
        return { status: "miss", resolved: true };
      }

      if (value >= resolver.threshold) {
        return { status: "hit", resolved: true };
      }
      if (completed || nbaStatsSnapshot.finalized) {
        return { status: "miss", resolved: true };
      }
      return { status: "pending", resolved: false };
    }
    case "nba_team_players_scored_at_least": {
      if (!nbaStatsSnapshot) {
        if (!completed) {
          return { status: "pending", resolved: false };
        }
        return { status: "void", resolved: true };
      }
      const aggregates = buildNBATeamAggregates(nbaStatsSnapshot, resolver.team);
      if (aggregates.scorers >= resolver.threshold) {
        return { status: "hit", resolved: true };
      }
      if (completed || nbaStatsSnapshot.finalized) {
        return { status: "miss", resolved: true };
      }
      return { status: "pending", resolved: false };
    }
    case "nba_player_triple_double": {
      if (!nbaStatsSnapshot) {
        if (!completed) return { status: "pending", resolved: false };
        return { status: "void", resolved: true };
      }
      const line = findNBAPlayerStatLine(nbaStatsSnapshot, resolver.player);
      if (!line) {
        if (!completed && !nbaStatsSnapshot.finalized) return { status: "pending", resolved: false };
        return { status: "miss", resolved: true };
      }
      if (hasTripleDouble(line)) return { status: "hit", resolved: true };
      if (completed || nbaStatsSnapshot.finalized) return { status: "miss", resolved: true };
      return { status: "pending", resolved: false };
    }
    case "nba_player_perfect_ft": {
      // Misses immediately on first missed FT attempt.
      if (!nbaStatsSnapshot) {
        if (!completed) return { status: "pending", resolved: false };
        return { status: "void", resolved: true };
      }
      const line = findNBAPlayerStatLine(nbaStatsSnapshot, resolver.player);
      if (!line) {
        if (!completed && !nbaStatsSnapshot.finalized) return { status: "pending", resolved: false };
        return { status: "miss", resolved: true };
      }
      if (line.fta > line.ftm) return { status: "miss", resolved: true };
      if (!completed && !nbaStatsSnapshot.finalized) return { status: "pending", resolved: false };
      if (line.fta < 3) return { status: "miss", resolved: true };
      return { status: line.ftm === line.fta ? "hit" : "miss", resolved: true };
    }
    case "nba_player_perfect_fg": {
      // Misses immediately on first missed FG attempt.
      if (!nbaStatsSnapshot) {
        if (!completed) return { status: "pending", resolved: false };
        return { status: "void", resolved: true };
      }
      const line = findNBAPlayerStatLine(nbaStatsSnapshot, resolver.player);
      if (!line) {
        if (!completed && !nbaStatsSnapshot.finalized) return { status: "pending", resolved: false };
        return { status: "miss", resolved: true };
      }
      if (line.fga > line.fgm) return { status: "miss", resolved: true };
      if (!completed && !nbaStatsSnapshot.finalized) return { status: "pending", resolved: false };
      if (line.fga < 4) return { status: "miss", resolved: true };
      return { status: line.fgm === line.fga ? "hit" : "miss", resolved: true };
    }
    case "nba_player_triple_threat": {
      if (!nbaStatsSnapshot) {
        if (!completed) return { status: "pending", resolved: false };
        return { status: "void", resolved: true };
      }
      const line = findNBAPlayerStatLine(nbaStatsSnapshot, resolver.player);
      if (!line) {
        if (!completed && !nbaStatsSnapshot.finalized) return { status: "pending", resolved: false };
        return { status: "miss", resolved: true };
      }
      if (line.pts >= 5 && line.reb >= 5 && line.ast >= 5) return { status: "hit", resolved: true };
      if (completed || nbaStatsSnapshot.finalized) return { status: "miss", resolved: true };
      return { status: "pending", resolved: false };
    }
    case "nba_player_zero_turnovers": {
      // Only resolves at game end.
      if (!nbaStatsSnapshot) {
        if (!completed) return { status: "pending", resolved: false };
        return { status: "void", resolved: true };
      }
      const line = findNBAPlayerStatLine(nbaStatsSnapshot, resolver.player);
      if (!line) return { status: "miss", resolved: true };
      if (line.turnover > 0) return { status: "miss", resolved: true };
      if (!completed && !nbaStatsSnapshot.finalized) return { status: "pending", resolved: false };
      return { status: line.turnover === 0 ? "hit" : "miss", resolved: true };
    }
    case "nba_player_plus_minus_at_least": {
      if (!nbaStatsSnapshot) {
        if (!completed) return { status: "pending", resolved: false };
        return { status: "void", resolved: true };
      }
      const line = findNBAPlayerStatLine(nbaStatsSnapshot, resolver.player);
      if (!line) {
        if (!completed && !nbaStatsSnapshot.finalized) return { status: "pending", resolved: false };
        return { status: "miss", resolved: true };
      }
      if (line.plusMinus >= resolver.threshold) return { status: "hit", resolved: true };
      if (completed || nbaStatsSnapshot.finalized) return { status: "miss", resolved: true };
      return { status: "pending", resolved: false };
    }
    case "nba_team_has_double_double": {
      if (!nbaStatsSnapshot) {
        if (!completed) return { status: "pending", resolved: false };
        return { status: "void", resolved: true };
      }
      const agg = buildNBATeamAggregates(nbaStatsSnapshot, resolver.team);
      if (agg.doubleDoubleCount >= 1) return { status: "hit", resolved: true };
      if (completed || nbaStatsSnapshot.finalized) return { status: "miss", resolved: true };
      return { status: "pending", resolved: false };
    }
    case "nba_team_three_pt_scorers": {
      if (!nbaStatsSnapshot) {
        if (!completed) return { status: "pending", resolved: false };
        return { status: "void", resolved: true };
      }
      const agg = buildNBATeamAggregates(nbaStatsSnapshot, resolver.team);
      if (agg.threePtScorerCount >= resolver.threshold) return { status: "hit", resolved: true };
      if (completed || nbaStatsSnapshot.finalized) return { status: "miss", resolved: true };
      return { status: "pending", resolved: false };
    }
    case "nba_team_turnovers_at_most": {
      // Only resolves at game end.
      if (!nbaStatsSnapshot) {
        if (!completed) return { status: "pending", resolved: false };
        return { status: "void", resolved: true };
      }
      const agg = buildNBATeamAggregates(nbaStatsSnapshot, resolver.team);
      if (agg.totalTurnovers > resolver.threshold) return { status: "miss", resolved: true };
      if (!completed && !nbaStatsSnapshot.finalized) return { status: "pending", resolved: false };
      return { status: agg.totalTurnovers <= resolver.threshold ? "hit" : "miss", resolved: true };
    }
    case "nba_team_outrebounds": {
      // Only resolves at game end.
      if (!nbaStatsSnapshot) {
        if (!completed) return { status: "pending", resolved: false };
        return { status: "void", resolved: true };
      }
      if (!completed && !nbaStatsSnapshot.finalized) return { status: "pending", resolved: false };
      const teamAgg = buildNBATeamAggregates(nbaStatsSnapshot, resolver.team);
      const oppSide: TeamSide = resolver.team === "home" ? "away" : "home";
      const oppAgg = buildNBATeamAggregates(nbaStatsSnapshot, oppSide);
      return { status: teamAgg.totalRebounds > oppAgg.totalRebounds ? "hit" : "miss", resolved: true };
    }
    case "nba_player_bench_scores": {
      if (!nbaStatsSnapshot || !nbaStatsSnapshot.lineupDataAvailable) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      const playerId = resolveSnapshotPlayerId(nbaStatsSnapshot, resolver.player);
      if (!playerId) return completed ? { status: "miss", resolved: true } : { status: "pending", resolved: false };
      const lineup = nbaStatsSnapshot.lineupByPlayerId.get(playerId);
      if (lineup?.starter) return { status: "miss", resolved: true };
      if (!lineup) return completed ? { status: "miss", resolved: true } : { status: "pending", resolved: false };
      const line = findNBAPlayerStatLine(nbaStatsSnapshot, resolver.player);
      if (!line) return completed ? { status: "miss", resolved: true } : { status: "pending", resolved: false };
      if (line.pts >= resolver.threshold) return { status: "hit", resolved: true };
      if (completed || nbaStatsSnapshot.finalized) return { status: "miss", resolved: true };
      return { status: "pending", resolved: false };
    }
    case "nba_team_scores_first": {
      if (!nbaStatsSnapshot || !nbaStatsSnapshot.quarterExtrasAvailable) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      if (!nbaStatsSnapshot.firstScoringTeam) {
        if (completed || nbaStatsSnapshot.finalized) return { status: "miss", resolved: true };
        return { status: "pending", resolved: false };
      }
      return { status: nbaStatsSnapshot.firstScoringTeam === resolver.team ? "hit" : "miss", resolved: true };
    }
    case "nba_team_leads_at_halftime": {
      if (!nbaStatsSnapshot || !nbaStatsSnapshot.quarterExtrasAvailable) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      const homeHalf = nbaStatsSnapshot.homeHalftimeScore;
      const awayHalf = nbaStatsSnapshot.awayHalftimeScore;
      if (homeHalf === null || awayHalf === null) {
        if (completed || nbaStatsSnapshot.finalized) return { status: "miss", resolved: true };
        return { status: "pending", resolved: false };
      }
      if (homeHalf === awayHalf) return { status: "miss", resolved: true };
      const teamLeads = resolver.team === "home" ? homeHalf > awayHalf : awayHalf > homeHalf;
      return { status: teamLeads ? "hit" : "miss", resolved: true };
    }
    case "nba_team_points_in_any_quarter_at_least": {
      if (!nbaStatsSnapshot || !nbaStatsSnapshot.quarterExtrasAvailable) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      const maxPoints = resolver.team === "home" ? nbaStatsSnapshot.homeMaxQuarterPoints : nbaStatsSnapshot.awayMaxQuarterPoints;
      if (maxPoints >= resolver.threshold) return { status: "hit", resolved: true };
      if (completed || nbaStatsSnapshot.finalized) return { status: "miss", resolved: true };
      return { status: "pending", resolved: false };
    }
    case "nba_player_points_first_half_at_least": {
      if (!nbaStatsSnapshot || !nbaStatsSnapshot.periodStatsAvailable) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      const playerId = resolveSnapshotPlayerId(nbaStatsSnapshot, resolver.player);
      if (!playerId) return completed ? { status: "miss", resolved: true } : { status: "pending", resolved: false };
      const agg = nbaStatsSnapshot.firstHalfByPlayerId.get(playerId);
      const pts = agg?.pts ?? 0;
      if (pts >= resolver.threshold) return { status: "hit", resolved: true };
      if (completed || nbaStatsSnapshot.finalized) return { status: "miss", resolved: true };
      return { status: "pending", resolved: false };
    }
    case "nba_player_assists_in_any_quarter_at_least": {
      if (!nbaStatsSnapshot || !nbaStatsSnapshot.periodStatsAvailable) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      const playerId = resolveSnapshotPlayerId(nbaStatsSnapshot, resolver.player);
      if (!playerId) return completed ? { status: "miss", resolved: true } : { status: "pending", resolved: false };
      const maxAst = nbaStatsSnapshot.maxQuarterAssistsByPlayerId.get(playerId) ?? 0;
      if (maxAst >= resolver.threshold) return { status: "hit", resolved: true };
      if (completed || nbaStatsSnapshot.finalized) return { status: "miss", resolved: true };
      return { status: "pending", resolved: false };
    }
    case "nba_player_steals_first_half_at_least": {
      if (!nbaStatsSnapshot || !nbaStatsSnapshot.periodStatsAvailable) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      const playerId = resolveSnapshotPlayerId(nbaStatsSnapshot, resolver.player);
      if (!playerId) return completed ? { status: "miss", resolved: true } : { status: "pending", resolved: false };
      const agg = nbaStatsSnapshot.firstHalfByPlayerId.get(playerId);
      const steals = agg?.stl ?? 0;
      if (steals >= resolver.threshold) return { status: "hit", resolved: true };
      if (completed || nbaStatsSnapshot.finalized) return { status: "miss", resolved: true };
      return { status: "pending", resolved: false };
    }
    case "mlb_webhook_player_event_at_least": {
      const current = Math.max(0, Number(resolver.currentCount ?? 0));
      const target = Math.max(1, Number(resolver.threshold ?? 1));
      if (current >= target) {
        return { status: "hit", resolved: true };
      }
      if (completed) {
        return { status: "miss", resolved: true };
      }
      return { status: "pending", resolved: false };
    }
    case "mlb_webhook_player_event_at_most": {
      const current = Math.max(0, Number(resolver.currentCount ?? 0));
      const maxAllowed = Math.max(0, Number(resolver.threshold ?? 0));
      if (current > maxAllowed) {
        return { status: "miss", resolved: true };
      }
      if (completed) {
        return { status: "hit", resolved: true };
      }
      return { status: "pending", resolved: false };
    }
    case "mlb_webhook_team_event_at_least": {
      const current = Math.max(0, Number(resolver.currentCount ?? 0));
      const target = Math.max(1, Number(resolver.threshold ?? 1));
      if (current >= target) {
        return { status: "hit", resolved: true };
      }
      if (completed) {
        return { status: "miss", resolved: true };
      }
      return { status: "pending", resolved: false };
    }
    // --- Phase 4 of docs/prop-bingo-nfl-plan.md: NFL grading -----------------------------------
    // Two rules run through everything below and are worth stating once:
    //   * **Asymmetry.** Anything monotone — a touchdown scored, a quarter's points, a
    //     fourth-down conversion — hits the instant the feed shows it, mid-game. Anything that
    //     needs the game to be over — a final margin, "held scoreless", "the second half
    //     outscores the first" as a *miss* — only settles at Final.
    //   * **Missing data voids, it never misses.** No box score, no plays walk, no stat line for
    //     the player: the square voids at Final rather than charging a player for our outage.
    //     The NFL player kinds are registered in `isResolverEligibleForVoidRegrade`, so a late
    //     arriving box score reopens them.
    case "nfl_player_anytime_td": {
      if (!nflStatsSnapshot) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      const isFinalized = completed || nflStatsSnapshot.finalized;
      const statLine = findNFLPlayerStatLine(nflStatsSnapshot, resolver.player);
      if (!statLine) {
        return isFinalized ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      if (nflPlayerTouchdowns(statLine) >= 1) {
        return { status: "hit", resolved: true };
      }
      return isFinalized ? { status: "miss", resolved: true } : { status: "pending", resolved: false };
    }
    case "nfl_player_first_td": {
      if (!nflStatsSnapshot || !nflStatsSnapshot.plays.available) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      const isFinalized = completed || nflStatsSnapshot.finalized;
      const firstTouchdown = nflStatsSnapshot.plays.firstTouchdown;
      if (!firstTouchdown) {
        // Nobody has scored a touchdown yet. At Final that means a touchdown-free game — books
        // would refund, but a miss is the honest bingo outcome: every first-TD square on every
        // board in the room loses together, which is self-evidently fair, and it keeps the card
        // able to settle.
        return isFinalized ? { status: "miss", resolved: true } : { status: "pending", resolved: false };
      }
      if (!firstTouchdown.scorerName) {
        // The play prose did not parse into a scorer. Guessing here would settle the wrong player,
        // so void — see `extractNFLTouchdownScorerName`.
        return { status: "void", resolved: true };
      }
      return nflPlayerRefMatchesName(resolver.player, firstTouchdown.scorerName)
        ? { status: "hit", resolved: true }
        : { status: "miss", resolved: true };
    }
    case "nfl_team_scores_every_quarter": {
      if (!nflStatsSnapshot) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      const quarters = nflStatsSnapshot.quarters;
      for (let index = 0; index < 4; index += 1) {
        const points = nflQuarterPoints(quarters, resolver.team, index);
        if (points === 0) {
          return { status: "miss", resolved: true };
        }
      }
      // "Never held scoreless" is a claim about all four quarters, so it needs all four — a hole
      // in the breakdown voids rather than awarding a hit off columns that were never published.
      if (quarters.quartersCompleted >= 4 && nflRegulationQuartersKnown(quarters, resolver.team)) {
        return { status: "hit", resolved: true };
      }
      return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
    }
    case "nfl_team_shutout_quarter": {
      if (!nflStatsSnapshot) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      const quarters = nflStatsSnapshot.quarters;
      for (let index = 0; index < 4; index += 1) {
        if (nflQuarterPoints(quarters, resolver.team, index) === 0) {
          return { status: "hit", resolved: true };
        }
      }
      if (quarters.quartersCompleted >= 4 && nflRegulationQuartersKnown(quarters, resolver.team)) {
        return { status: "miss", resolved: true };
      }
      return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
    }
    case "nfl_team_quarter_points_at_least": {
      if (!nflStatsSnapshot) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      const column = resolver.team === "home" ? nflStatsSnapshot.quarters.home : nflStatsSnapshot.quarters.away;
      // A quarter's points only grow, so a partially-played quarter that already clears the
      // threshold is a hit — no need to wait for the quarter to end.
      if (column.some((value) => value !== null && value >= resolver.threshold)) {
        return { status: "hit", resolved: true };
      }
      if (
        nflStatsSnapshot.quarters.quartersCompleted >= 4 &&
        nflRegulationQuartersKnown(nflStatsSnapshot.quarters, resolver.team)
      ) {
        return { status: "miss", resolved: true };
      }
      return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
    }
    case "nfl_any_quarter_scoreless": {
      if (!nflStatsSnapshot) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      const quarters = nflStatsSnapshot.quarters;
      for (let index = 0; index < 4; index += 1) {
        if (nflQuarterPoints(quarters, "home", index) === 0 && nflQuarterPoints(quarters, "away", index) === 0) {
          return { status: "hit", resolved: true };
        }
      }
      if (quarters.quartersCompleted >= 4 && nflRegulationQuartersKnown(quarters, "both")) {
        return { status: "miss", resolved: true };
      }
      return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
    }
    case "nfl_team_leads_at_halftime": {
      if (!nflStatsSnapshot) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      const homeHalf = nflHalftimeScore(nflStatsSnapshot.quarters, "home");
      const awayHalf = nflHalftimeScore(nflStatsSnapshot.quarters, "away");
      if (homeHalf === null || awayHalf === null) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      const mine = resolver.team === "home" ? homeHalf : awayHalf;
      const theirs = resolver.team === "home" ? awayHalf : homeHalf;
      // A halftime tie is a miss, not a void: "leads at halftime" is simply false.
      return { status: mine > theirs ? "hit" : "miss", resolved: true };
    }
    case "nfl_halftime_leader_loses": {
      if (!nflStatsSnapshot) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      const homeHalf = nflHalftimeScore(nflStatsSnapshot.quarters, "home");
      const awayHalf = nflHalftimeScore(nflStatsSnapshot.quarters, "away");
      if (homeHalf === null || awayHalf === null) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      if (homeHalf === awayHalf) {
        // There was no halftime leader, so the square has no subject. This is the one NFL void
        // the resolver's own type documents.
        return { status: "void", resolved: true };
      }
      if (!completed || !hasGameScore) {
        return { status: "pending", resolved: false };
      }
      const halftimeLeader: TeamSide = homeHalf > awayHalf ? "home" : "away";
      const winner: TeamSide | null = (home ?? 0) > (away ?? 0) ? "home" : (away ?? 0) > (home ?? 0) ? "away" : null;
      // A tie means the halftime leader did not win, which is exactly what the square claims.
      return { status: winner === halftimeLeader ? "miss" : "hit", resolved: true };
    }
    case "nfl_overtime": {
      if (!nflStatsSnapshot) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      const overtime = nflStatsSnapshot.quarters.wentToOvertime;
      if (overtime === true) {
        return { status: "hit", resolved: true };
      }
      if (overtime === null) {
        // Points the breakdown cannot account for. That is either an unpublished overtime column
        // or an unpublished regulation quarter, and calling it either way is a guess.
        return completed || nflStatsSnapshot.finalized
          ? { status: "void", resolved: true }
          : { status: "pending", resolved: false };
      }
      return completed || nflStatsSnapshot.finalized
        ? { status: "miss", resolved: true }
        : { status: "pending", resolved: false };
    }
    case "nfl_both_teams_score_at_least": {
      if (!hasGameScore) {
        return { status: "pending", resolved: false };
      }
      if (Math.min(home ?? 0, away ?? 0) >= resolver.threshold) {
        return { status: "hit", resolved: true };
      }
      return completed ? { status: "miss", resolved: true } : { status: "pending", resolved: false };
    }
    case "nfl_margin_at_most": {
      // Not monotone in either direction — a margin can grow and shrink — so it is a Final-only
      // square. The line is always a half-point, so there is no push to handle.
      if (!hasGameScore || !completed) {
        return { status: "pending", resolved: false };
      }
      return { status: Math.abs((home ?? 0) - (away ?? 0)) < resolver.line ? "hit" : "miss", resolved: true };
    }
    case "nfl_margin_at_least": {
      if (!hasGameScore || !completed) {
        return { status: "pending", resolved: false };
      }
      return { status: Math.abs((home ?? 0) - (away ?? 0)) > resolver.line ? "hit" : "miss", resolved: true };
    }
    case "nfl_second_half_higher_scoring": {
      if (!nflStatsSnapshot) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      const quarters = nflStatsSnapshot.quarters;
      // Both halftime scores or nothing: an unknown first-half quarter read as zero understates the
      // bar the second half has to clear, which is a phantom hit rather than a missing one.
      const homeFirstHalf = nflHalftimeScore(quarters, "home");
      const awayFirstHalf = nflHalftimeScore(quarters, "away");
      if (homeFirstHalf === null || awayFirstHalf === null) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      // Overtime is deliberately excluded: a "half" means a regulation half, and a game that needed
      // overtime was tied at the end of regulation either way.
      const firstHalf = homeFirstHalf + awayFirstHalf;
      const secondHalfSoFar =
        (quarters.home[2] ?? 0) + (quarters.home[3] ?? 0) + (quarters.away[2] ?? 0) + (quarters.away[3] ?? 0);
      // The first half is frozen and the second half only grows, so clearing it is an early hit.
      if (secondHalfSoFar > firstHalf) {
        return { status: "hit", resolved: true };
      }
      if (quarters.quartersCompleted >= 4 && nflRegulationQuartersKnown(quarters, "both")) {
        return { status: "miss", resolved: true };
      }
      return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
    }
    case "nfl_first_score_is_field_goal": {
      if (!nflStatsSnapshot || !nflStatsSnapshot.plays.available) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      const kind = nflStatsSnapshot.plays.firstScoreKind;
      if (kind === null) {
        // Still 0-0. At Final that is a scoreless game: the first score was not a field goal.
        return completed || nflStatsSnapshot.finalized
          ? { status: "miss", resolved: true }
          : { status: "pending", resolved: false };
      }
      return { status: kind === "field_goal" ? "hit" : "miss", resolved: true };
    }
    case "nfl_first_scorer_wins": {
      if (!nflStatsSnapshot || !nflStatsSnapshot.plays.available) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      const firstScoringTeam = nflStatsSnapshot.plays.firstScoringTeam;
      if (firstScoringTeam === null) {
        return completed || nflStatsSnapshot.finalized
          ? { status: "miss", resolved: true }
          : { status: "pending", resolved: false };
      }
      if (!completed || !hasGameScore) {
        return { status: "pending", resolved: false };
      }
      const winner: TeamSide | null = (home ?? 0) > (away ?? 0) ? "home" : (away ?? 0) > (home ?? 0) ? "away" : null;
      return { status: winner === firstScoringTeam ? "hit" : "miss", resolved: true };
    }
    case "nfl_non_offensive_touchdown": {
      if (!nflStatsSnapshot || !nflStatsSnapshot.plays.available) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      if (nflStatsSnapshot.plays.sawNonOffensiveTouchdown) {
        return { status: "hit", resolved: true };
      }
      return completed || nflStatsSnapshot.finalized
        ? { status: "miss", resolved: true }
        : { status: "pending", resolved: false };
    }
    case "nfl_fourth_down_conversion": {
      if (!nflStatsSnapshot || !nflStatsSnapshot.plays.available) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      if (nflStatsSnapshot.plays.sawFourthDownConversion) {
        return { status: "hit", resolved: true };
      }
      return completed || nflStatsSnapshot.finalized
        ? { status: "miss", resolved: true }
        : { status: "pending", resolved: false };
    }
    case "nfl_long_touchdown": {
      if (!nflStatsSnapshot || !nflStatsSnapshot.plays.available) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      if (nflStatsSnapshot.plays.longestTouchdownYards >= resolver.yards) {
        return { status: "hit", resolved: true };
      }
      return completed || nflStatsSnapshot.finalized
        ? { status: "miss", resolved: true }
        : { status: "pending", resolved: false };
    }

    // --- Phase 8b Tier 1: `/nfl/v1/team_stats` ---------------------------------------------------
    // The settlement asymmetry the plan warns about, made explicit in one place: an at-least square
    // on a monotone counter hits the instant the feed clears it; everything else waits for Final;
    // a missing `team_stats` row **voids** rather than missing, which is what lets the regrade path
    // reopen it when a late feed arrives (and is exactly the postseason case 8a found).
    case "nfl_team_stat_at_least":
    case "nfl_team_stat_at_most": {
      const value = nflTeamStatValue(nflStatsSnapshot, resolver.team, resolver.field);
      if (value === null) {
        return nflTeamStatsUnavailable(completed, nflStatsSnapshot);
      }
      const settled = completed || nflStatsSnapshot?.finalized === true;
      const monotone = NFL_MONOTONE_TEAM_STAT_FIELDS.has(resolver.field);
      if (resolver.kind === "nfl_team_stat_at_least") {
        if (monotone && value >= resolver.threshold) {
          return { status: "hit", resolved: true };
        }
        if (settled) {
          return { status: value >= resolver.threshold ? "hit" : "miss", resolved: true };
        }
        return { status: "pending", resolved: false };
      }
      // At-most: a monotone counter that has already blown past the bound can never come back, so
      // that miss is settleable early. The hit is never early — the counter can still climb.
      if (monotone && value > resolver.threshold) {
        return { status: "miss", resolved: true };
      }
      if (settled) {
        return { status: value <= resolver.threshold ? "hit" : "miss", resolved: true };
      }
      return { status: "pending", resolved: false };
    }
    case "nfl_combined_team_stat_at_least":
    case "nfl_combined_team_stat_at_most": {
      const homeValue = nflTeamStatValue(nflStatsSnapshot, "home", resolver.field);
      const awayValue = nflTeamStatValue(nflStatsSnapshot, "away", resolver.field);
      if (homeValue === null || awayValue === null) {
        return nflTeamStatsUnavailable(completed, nflStatsSnapshot);
      }
      const combined = homeValue + awayValue;
      const settled = completed || nflStatsSnapshot?.finalized === true;
      const monotone = NFL_MONOTONE_TEAM_STAT_FIELDS.has(resolver.field);
      if (resolver.kind === "nfl_combined_team_stat_at_least") {
        if (monotone && combined >= resolver.threshold) {
          return { status: "hit", resolved: true };
        }
        if (settled) {
          return { status: combined >= resolver.threshold ? "hit" : "miss", resolved: true };
        }
        return { status: "pending", resolved: false };
      }
      if (monotone && combined > resolver.threshold) {
        return { status: "miss", resolved: true };
      }
      if (settled) {
        return { status: combined <= resolver.threshold ? "hit" : "miss", resolved: true };
      }
      return { status: "pending", resolved: false };
    }
    case "nfl_team_perfect_red_zone": {
      const attempts = nflTeamStatValue(nflStatsSnapshot, resolver.team, "red_zone_attempts");
      const scores = nflTeamStatValue(nflStatsSnapshot, resolver.team, "red_zone_scores");
      if (attempts === null || scores === null) {
        return nflTeamStatsUnavailable(completed, nflStatsSnapshot);
      }
      // Final-only in both directions, matching its declared complement
      // `nfl_team_red_zone_trip_without_touchdown`. The two squares are mutually exclusive, so they
      // cannot grade on opposite reliability assumptions: the complement documents that
      // `red_zone_attempts` almost certainly increments on *entering* the red zone, before the trip
      // resolves, which makes a live `attempts > scores` a drive still in progress rather than a
      // trip that failed. Settling that as a miss is unreopenable, so it waits for Final too.
      if (!(completed || nflStatsSnapshot?.finalized === true)) {
        return { status: "pending", resolved: false };
      }
      return { status: attempts >= resolver.minTrips && attempts === scores ? "hit" : "miss", resolved: true };
    }
    case "nfl_team_red_zone_trip_without_touchdown": {
      const attempts = nflTeamStatValue(nflStatsSnapshot, resolver.team, "red_zone_attempts");
      const scores = nflTeamStatValue(nflStatsSnapshot, resolver.team, "red_zone_scores");
      if (attempts === null || scores === null) {
        return nflTeamStatsUnavailable(completed, nflStatsSnapshot);
      }
      // `red_zone_attempts` almost certainly increments on *entering* the red zone, before the trip
      // has resolved, so a live `attempts > scores` can be a trip still in progress rather than a
      // trip that failed. That makes an early hit unsafe; this waits for Final.
      if (!(completed || nflStatsSnapshot?.finalized === true)) {
        return { status: "pending", resolved: false };
      }
      return { status: attempts > scores ? "hit" : "miss", resolved: true };
    }
    case "nfl_team_possession_advantage": {
      const mine = nflTeamStatValue(nflStatsSnapshot, resolver.team, "possession_time_seconds");
      const theirs = nflTeamStatValue(
        nflStatsSnapshot,
        resolver.team === "home" ? "away" : "home",
        "possession_time_seconds"
      );
      if (mine === null || theirs === null) {
        return nflTeamStatsUnavailable(completed, nflStatsSnapshot);
      }
      // A possession *differential* is not monotone — the other team gets the ball back — so this
      // is Final-only even though both of its inputs are counters.
      if (!(completed || nflStatsSnapshot?.finalized === true)) {
        return { status: "pending", resolved: false };
      }
      return { status: mine - theirs >= resolver.seconds ? "hit" : "miss", resolved: true };
    }

    // --- Phase 8b Tier 2: `/nfl/v1/stats`, game level --------------------------------------------
    // Every field here is a monotone counter, so all of these are at-least squares that hit the
    // moment the box score clears them and miss only at Final.
    case "nfl_game_max_stat_at_least": {
      if (!nflStatsSnapshot || nflStatsSnapshot.lines.length === 0) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      const cleared =
        resolver.scope === "any_player"
          ? nflStatsSnapshot.lines.some((line) => nflPlayerStatValue(line, resolver.field) >= resolver.threshold)
          : (["home", "away"] as const).every((side) =>
              nflStatsSnapshot.lines.some(
                (line) => line.teamSide === side && nflPlayerStatValue(line, resolver.field) >= resolver.threshold
              )
            );
      if (cleared) {
        return { status: "hit", resolved: true };
      }
      return completed || nflStatsSnapshot.finalized
        ? { status: "miss", resolved: true }
        : { status: "pending", resolved: false };
    }
    case "nfl_game_total_stat_at_least": {
      if (!nflStatsSnapshot || nflStatsSnapshot.lines.length === 0) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      const total = nflStatsSnapshot.lines.reduce(
        (sum, line) => sum + nflPlayerStatValue(line, resolver.field),
        0
      );
      if (total >= resolver.threshold) {
        return { status: "hit", resolved: true };
      }
      return completed || nflStatsSnapshot.finalized
        ? { status: "miss", resolved: true }
        : { status: "pending", resolved: false };
    }
    case "nfl_game_missed_field_goal": {
      if (!nflStatsSnapshot || nflStatsSnapshot.lines.length === 0) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      if (nflStatsSnapshot.lines.some((line) => line.fieldGoalAttempts > line.fieldGoalsMade)) {
        return { status: "hit", resolved: true };
      }
      return completed || nflStatsSnapshot.finalized
        ? { status: "miss", resolved: true }
        : { status: "pending", resolved: false };
    }
    case "nfl_non_quarterback_pass_attempt": {
      if (!nflStatsSnapshot || nflStatsSnapshot.lines.length === 0) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      // The position comes off the box-score row itself, so this needs no `/nfl/v1/players` join at
      // all. A row with no position is skipped rather than assumed to be a non-quarterback, which
      // would turn missing metadata into a false hit.
      if (
        nflStatsSnapshot.lines.some(
          (line) => line.passingAttempts >= 1 && line.position !== null && line.position !== "QB"
        )
      ) {
        return { status: "hit", resolved: true };
      }
      return completed || nflStatsSnapshot.finalized
        ? { status: "miss", resolved: true }
        : { status: "pending", resolved: false };
    }

    // --- Phase 8b Tier 3: clock-and-score arithmetic over the plays walk --------------------------
    case "nfl_first_score_within_minutes": {
      if (!nflStatsSnapshot || !nflStatsSnapshot.plays.available) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      const elapsed = nflStatsSnapshot.plays.firstScoreElapsedSeconds;
      if (elapsed !== null) {
        // The first score is the first score: once it has happened this square is decided, either
        // way, with no need to wait for the whistle.
        return { status: elapsed <= resolver.minutes * 60 ? "hit" : "miss", resolved: true };
      }
      return completed || nflStatsSnapshot.finalized
        ? { status: "miss", resolved: true }
        : { status: "pending", resolved: false };
    }
    case "nfl_score_in_final_minutes": {
      if (!nflStatsSnapshot || !nflStatsSnapshot.plays.available) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      const facts = nflStatsSnapshot.plays;
      const remaining =
        resolver.segment === "first_half" ? facts.minSecondsRemainingFirstHalfScore : facts.minSecondsRemainingFourthScore;
      if (remaining !== null && remaining <= resolver.minutes * 60) {
        return { status: "hit", resolved: true };
      }
      // The first half is over the moment a third-quarter play appears, so that square does not
      // have to wait for the game to end to miss.
      if (resolver.segment === "first_half" && facts.highestPeriodSeen >= 3) {
        return { status: "miss", resolved: true };
      }
      return completed || nflStatsSnapshot.finalized
        ? { status: "miss", resolved: true }
        : { status: "pending", resolved: false };
    }
    case "nfl_both_teams_lead": {
      if (!nflStatsSnapshot || !nflStatsSnapshot.plays.available) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      if (nflStatsSnapshot.plays.homeLed && nflStatsSnapshot.plays.awayLed) {
        return { status: "hit", resolved: true };
      }
      return completed || nflStatsSnapshot.finalized
        ? { status: "miss", resolved: true }
        : { status: "pending", resolved: false };
    }
    case "nfl_lead_change_second_half": {
      if (!nflStatsSnapshot || !nflStatsSnapshot.plays.available) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      if (nflStatsSnapshot.plays.sawLeadChangeAfterHalftime) {
        return { status: "hit", resolved: true };
      }
      return completed || nflStatsSnapshot.finalized
        ? { status: "miss", resolved: true }
        : { status: "pending", resolved: false };
    }
    case "nfl_tied_after_halftime": {
      if (!nflStatsSnapshot || !nflStatsSnapshot.plays.available) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      if (nflStatsSnapshot.plays.sawTieAfterHalftime) {
        return { status: "hit", resolved: true };
      }
      return completed || nflStatsSnapshot.finalized
        ? { status: "miss", resolved: true }
        : { status: "pending", resolved: false };
    }
    case "nfl_winner_trailed_in_fourth": {
      if (!nflStatsSnapshot || !nflStatsSnapshot.plays.available) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      // There is no "winner" until there is a winner, so this one is Final-only by construction.
      if (!completed || !hasGameScore) {
        return { status: "pending", resolved: false };
      }
      const winner: TeamSide | null = (home ?? 0) > (away ?? 0) ? "home" : (away ?? 0) > (home ?? 0) ? "away" : null;
      if (winner === null) {
        return { status: "void", resolved: true };
      }
      const trailed =
        winner === "home" ? nflStatsSnapshot.plays.homeTrailedInFourth : nflStatsSnapshot.plays.awayTrailedInFourth;
      return { status: trailed ? "hit" : "miss", resolved: true };
    }
    case "nfl_two_point_conversion": {
      if (!nflStatsSnapshot || !nflStatsSnapshot.plays.available) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      return nflPlayFlagOutcome(nflStatsSnapshot.plays.sawTwoPointConversion, completed, nflStatsSnapshot);
    }
    case "nfl_safety": {
      if (!nflStatsSnapshot || !nflStatsSnapshot.plays.available) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      return nflPlayFlagOutcome(nflStatsSnapshot.plays.sawSafety, completed, nflStatsSnapshot);
    }
    case "nfl_goal_line_touchdown": {
      if (!nflStatsSnapshot || !nflStatsSnapshot.plays.available) {
        return completed ? { status: "void", resolved: true } : { status: "pending", resolved: false };
      }
      const shortest = nflStatsSnapshot.plays.shortestTouchdownYardsToEndzone;
      if (shortest !== null && shortest <= resolver.yards) {
        return { status: "hit", resolved: true };
      }
      return completed || nflStatsSnapshot.finalized
        ? { status: "miss", resolved: true }
        : { status: "pending", resolved: false };
    }
    default:
      return { status: "void", resolved: true };
  }
}

/**
 * One team's value for an allowlisted `team_stats` field, or `null` when the row is not available.
 *
 * A field that is absent from an available row reads as `0`, because that is what BDL's omission
 * means — it drops `sacks` and `fourth_down_conversions` entirely for a team that recorded none —
 * and it is what the base rates in `lib/sportsBingoNflFlavor.ts` were measured against (8a's
 * `sacked_gte_4` rate reproduces exactly under this reading and not under "absent = unknown").
 */
function nflTeamStatValue(
  snapshot: NFLGameStatsSnapshot | null,
  team: TeamSide,
  field: NFLTeamStatField
): number | null {
  if (!snapshot || !snapshot.teamStats.available) {
    return null;
  }
  const side = team === "home" ? snapshot.teamStats.home : snapshot.teamStats.away;
  if (!side) {
    return null;
  }
  return side[field] ?? 0;
}

/**
 * Settle a "did this ever happen?" play-walk flag. `true` hits the moment it is seen, `false` is a
 * miss only once the game is over (a walk of a live game has not seen the rest of it yet), and
 * `null` — the walk saw the points but could not attribute them — voids at Final. Squares are never
 * reopened once settled, so the ambiguous case must not take the miss.
 */
function nflPlayFlagOutcome(
  flag: boolean | null,
  completed: boolean,
  snapshot: NFLGameStatsSnapshot
): { status: "pending" | "hit" | "miss" | "void"; resolved: boolean } {
  if (flag === true) {
    return { status: "hit", resolved: true };
  }
  if (!(completed || snapshot.finalized)) {
    return { status: "pending", resolved: false };
  }
  return flag === null ? { status: "void", resolved: true } : { status: "miss", resolved: true };
}

/** Missing `team_stats` voids at Final and stays pending before it — never misses. */
function nflTeamStatsUnavailable(
  completed: boolean,
  snapshot: NFLGameStatsSnapshot | null
): { status: "pending" | "hit" | "miss" | "void"; resolved: boolean } {
  return completed || snapshot?.finalized === true
    ? { status: "void", resolved: true }
    : { status: "pending", resolved: false };
}

/** One player row's value for an allowlisted stat field. `touchdowns` is synthetic; see the catalog. */
function nflPlayerStatValue(line: NFLPlayerStatLine, field: NFLPlayerStatField): number {
  switch (field) {
    case "rushing_yards":
      return line.rushingYards;
    case "receiving_yards":
      return line.receivingYards;
    case "passing_yards":
      return line.passingYards;
    case "receptions":
      return line.receptions;
    case "touchdowns":
      return nflPlayerTouchdowns(line);
    case "field_goals_made":
      return line.fieldGoalsMade;
    case "long_field_goal_made":
      return line.longFieldGoalMade;
    case "total_tackles":
      return line.totalTackles;
    case "defensive_sacks":
      return line.defensiveSacks;
    case "defensive_interceptions":
      return line.defensiveInterceptions;
    case "punts_inside_20":
      return line.puntsInside20;
  }
}

function computeCardSignals(squares: SportsBingoCardSquare[]): {
  hasWinningLine: boolean;
  winningLine?: number[];
  isNearWin: boolean;
} {
  const statusByIndex = new Map<number, SquareStatus>();
  const freeByIndex = new Map<number, boolean>();
  for (const square of squares) {
    statusByIndex.set(square.index, square.status);
    freeByIndex.set(square.index, square.isFree);
  }

  let hasWinningLine = false;
  let winningLine: number[] | undefined;
  let isNearWin = false;

  for (const line of LINE_PATTERNS) {
    let hits = 0;
    let misses = 0;
    let pending = 0;
    for (const index of line) {
      const status = statusByIndex.get(index) ?? "pending";
      const isFree = freeByIndex.get(index) ?? false;
      if (isFree || status === "hit") {
        hits += 1;
      } else if (status === "miss") {
        misses += 1;
      } else {
        pending += 1;
      }
    }

    if (hits === 5) {
      hasWinningLine = true;
      winningLine = line;
      break;
    }

    if (hits === 4 && pending === 1 && misses === 0) {
      isNearWin = true;
    }
  }

  return {
    hasWinningLine,
    winningLine,
    isNearWin,
  };
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function isResolverEligibleForVoidRegrade(resolver: SportsBingoResolver): boolean {
  switch (resolver.kind) {
    case "player_prop":
    case "nba_player_stat_at_least":
    case "nba_player_double_double":
    case "team_triple_double":
    case "any_triple_double":
    case "nba_team_stat_at_least":
    case "nba_team_players_scored_at_least":
    case "nba_player_triple_double":
    case "nba_player_perfect_ft":
    case "nba_player_perfect_fg":
    case "nba_player_triple_threat":
    case "nba_player_zero_turnovers":
    case "nba_player_plus_minus_at_least":
    case "nba_team_has_double_double":
    case "nba_team_three_pt_scorers":
    case "nba_team_turnovers_at_most":
    case "nba_team_outrebounds":
    case "nba_player_bench_scores":
    case "nba_team_scores_first":
    case "nba_team_leads_at_halftime":
    case "nba_team_points_in_any_quarter_at_least":
    case "nba_player_points_first_half_at_least":
    case "nba_player_assists_in_any_quarter_at_least":
    case "nba_player_steals_first_half_at_least":
    case "mlb_webhook_player_event_at_least":
    case "mlb_webhook_player_event_at_most":
    case "mlb_webhook_team_event_at_least":
    // Every NFL kind voids on **missing data** — the player never appeared in the box score
    // (inactive, DNP), the `/nfl/v1/stats` pull failed, or the `/nfl/v1/plays` walk did — which is
    // exactly the case this regrade path exists for: a late-arriving feed must be able to reopen
    // the square instead of leaving a player settled against an outage.
    case "nfl_player_anytime_td":
    case "nfl_player_first_td":
    case "nfl_team_scores_every_quarter":
    case "nfl_team_shutout_quarter":
    case "nfl_team_quarter_points_at_least":
    case "nfl_any_quarter_scoreless":
    case "nfl_team_leads_at_halftime":
    case "nfl_halftime_leader_loses":
    case "nfl_overtime":
    case "nfl_second_half_higher_scoring":
    case "nfl_first_score_is_field_goal":
    case "nfl_first_scorer_wins":
    case "nfl_non_offensive_touchdown":
    case "nfl_fourth_down_conversion":
    case "nfl_long_touchdown":
    // Phase 8b. Every flavor kind voids on missing data — an empty `/nfl/v1/team_stats` (the
    // postseason gap 8a found), a failed `/nfl/v1/stats` pull, or a plays walk that did not run —
    // so every one of them must be reopenable when the feed catches up.
    case "nfl_team_stat_at_least":
    case "nfl_team_stat_at_most":
    case "nfl_combined_team_stat_at_least":
    case "nfl_combined_team_stat_at_most":
    case "nfl_team_perfect_red_zone":
    case "nfl_team_red_zone_trip_without_touchdown":
    case "nfl_team_possession_advantage":
    case "nfl_game_max_stat_at_least":
    case "nfl_game_total_stat_at_least":
    case "nfl_game_missed_field_goal":
    case "nfl_non_quarterback_pass_attempt":
    case "nfl_first_score_within_minutes":
    case "nfl_score_in_final_minutes":
    case "nfl_both_teams_lead":
    case "nfl_lead_change_second_half":
    case "nfl_tied_after_halftime":
    case "nfl_winner_trailed_in_fourth":
    case "nfl_two_point_conversion":
    case "nfl_safety":
    case "nfl_goal_line_touchdown":
      return true;
    default:
      return false;
  }
}

function resolverPlayerMatchesEventName(playerRef: string, eventPlayerName: string): boolean {
  const parsed = parseResolverPlayerRef(playerRef);
  const targetTokens = tokenizeName(parsed.displayName || playerRef);
  const eventTokens = tokenizeName(eventPlayerName);
  if (targetTokens.length === 0 || eventTokens.length === 0) {
    return false;
  }
  const targetLast = targetTokens[targetTokens.length - 1] ?? "";
  const eventLast = eventTokens[eventTokens.length - 1] ?? "";
  if (!targetLast || targetLast !== eventLast) {
    return false;
  }
  const targetFirst = targetTokens[0] ?? "";
  const eventFirst = eventTokens[0] ?? "";
  if (!targetFirst || !eventFirst) {
    return false;
  }
  return eventFirst === targetFirst || eventFirst.startsWith(targetFirst[0] ?? "");
}

function resolverPlayerMatchesEvent(
  playerRef: string,
  eventPlayerId: number | null | undefined,
  eventPlayerName: string
): boolean {
  const parsed = parseResolverPlayerRef(playerRef);
  const normalizedEventPlayerId = Number(eventPlayerId ?? 0);
  if (parsed.playerId && Number.isFinite(normalizedEventPlayerId) && normalizedEventPlayerId > 0) {
    return parsed.playerId === normalizedEventPlayerId;
  }
  return resolverPlayerMatchesEventName(playerRef, eventPlayerName);
}

function getMlbWebhookEventAliases(eventType: MlbWebhookBingoEvent["eventType"]): Set<string> {
  const set = new Set<string>();
  set.add(eventType);
  if (eventType === "home_run") {
    set.add("hit");
  }
  return set;
}

function resolveTeamSideFromEvent(card: SportsBingoCardRow, eventTeamName: string): TeamSide | null {
  if (!eventTeamName) {
    return null;
  }
  if (teamsMatch(eventTeamName, card.home_team)) {
    return "home";
  }
  if (teamsMatch(eventTeamName, card.away_team)) {
    return "away";
  }
  return null;
}

function isOutEvent(eventType: MlbWebhookBingoEvent["eventType"]): boolean {
  return eventType === "groundout" || eventType === "flyout" || eventType === "strikeout";
}

function applyWebhookCountToResolver(
  resolver: SportsBingoResolver,
  event: MlbWebhookBingoEvent,
  teamSide: TeamSide | null
): SportsBingoResolver | null {
  const aliases = getMlbWebhookEventAliases(event.eventType);
  if (resolver.kind === "mlb_webhook_player_event_at_least") {
    if (!aliases.has(resolver.event)) {
      return null;
    }
    if (!resolverPlayerMatchesEvent(resolver.player, event.playerId, event.playerName)) {
      return null;
    }
    return { ...resolver, currentCount: Math.max(0, Number(resolver.currentCount ?? 0)) + 1 };
  }
  if (resolver.kind === "mlb_webhook_player_event_at_most") {
    if (!aliases.has(resolver.event)) {
      return null;
    }
    if (!resolverPlayerMatchesEvent(resolver.player, event.playerId, event.playerName)) {
      return null;
    }
    return { ...resolver, currentCount: Math.max(0, Number(resolver.currentCount ?? 0)) + 1 };
  }
  if (resolver.kind === "mlb_webhook_team_event_at_least") {
    if (!teamSide || resolver.team !== teamSide) {
      return null;
    }
    if (resolver.event === "quick_out_under_3_pitches") {
      if (!isOutEvent(event.eventType)) {
        return null;
      }
      if (!Number.isFinite(event.pitchCount) || Number(event.pitchCount) >= 3) {
        return null;
      }
      return { ...resolver, currentCount: Math.max(0, Number(resolver.currentCount ?? 0)) + 1 };
    }
    if (!aliases.has(resolver.event)) {
      return null;
    }
    return { ...resolver, currentCount: Math.max(0, Number(resolver.currentCount ?? 0)) + 1 };
  }
  return null;
}

function mlbResolverCurrentCountFromPlayerSnapshot(
  resolver: SportsBingoResolver,
  event: MlbPlayerSnapshotBingoEvent
): number | null {
  if (resolver.kind === "mlb_webhook_player_event_at_least") {
    switch (resolver.event) {
      case "hit":
        return Math.max(0, Math.floor(Number(event.batterStats.h ?? 0)));
      case "home_run":
        return Math.max(0, Math.floor(Number(event.batterStats.homeRuns ?? 0)));
      case "strikeout":
        return Math.max(0, Math.floor(Number(event.batterStats.strikeoutsAsBatter ?? 0)));
      case "rbi":
        return Math.max(0, Math.floor(Number(event.batterStats.rbi ?? 0)));
      case "stolen_base":
        return Math.max(0, Math.floor(Number(event.batterStats.stolenBases ?? 0)));
      case "pitcher_out":
        return Math.max(0, Math.floor(Number(event.pitcherStats.outs ?? 0)));
      default:
        return null;
    }
  }
  if (resolver.kind === "mlb_webhook_player_event_at_most") {
    switch (resolver.event) {
      case "strikeout":
        return Math.max(0, Math.floor(Number(event.batterStats.strikeoutsAsBatter ?? 0)));
      case "earned_run":
        return Math.max(0, Math.floor(Number(event.pitcherStats.earnedRuns ?? 0)));
      case "hit_allowed":
        return Math.max(0, Math.floor(Number(event.pitcherStats.hitsAllowed ?? 0)));
      default:
        return null;
    }
  }
  return null;
}

export async function applyMlbPlayerSnapshotEvent(event: MlbPlayerSnapshotBingoEvent): Promise<{ updatedSquares: number }> {
  assertSupabaseConfigured();

  const gameId = String(event.gameId ?? "").trim();
  const playerName = String(event.playerName ?? "").trim();
  const playerId = Number(event.playerId ?? 0);
  if (!gameId || !playerName || !Number.isFinite(playerId) || playerId <= 0) {
    return { updatedSquares: 0 };
  }

  const rows = await listCardRows({
    activeOnly: true,
    sportKey: "baseball_mlb",
    gameId,
    limit: 300,
  });
  if (rows.length === 0) {
    return { updatedSquares: 0 };
  }

  const activeCardIds = rows.map(({ card }) => card.id);
  const { data: squares, error } = await supabaseAdmin!
    .from("sports_bingo_squares")
    .select("id, resolver")
    .in("card_id", activeCardIds)
    .eq("status", "pending")
    .eq("player_id", Math.trunc(playerId));
  if (error || !squares?.length) {
    return { updatedSquares: 0 };
  }

  let updatedSquares = 0;
  for (const square of squares as Array<{ id: string; resolver: unknown }>) {
    const resolver = parseResolver(square.resolver);
    if (!resolver) {
      continue;
    }
    if (resolver.kind !== "mlb_webhook_player_event_at_least" && resolver.kind !== "mlb_webhook_player_event_at_most") {
      continue;
    }
    if (!resolverPlayerMatchesEvent(resolver.player, playerId, playerName)) {
      continue;
    }

    const nextCount = mlbResolverCurrentCountFromPlayerSnapshot(resolver, event);
    if (nextCount === null) {
      continue;
    }
    const currentCount = Math.max(0, Math.floor(Number(resolver.currentCount ?? 0)));
    if (nextCount === currentCount) {
      continue;
    }
    const nextResolver: SportsBingoResolver = { ...resolver, currentCount: nextCount };
    const { error: updateError } = await supabaseAdmin!
      .from("sports_bingo_squares")
      .update({ resolver: nextResolver })
      .eq("id", square.id);
    if (!updateError) {
      updatedSquares += 1;
    }
  }

  return { updatedSquares };
}

export async function applyMlbWebhookPropEvent(event: MlbWebhookBingoEvent): Promise<{ updatedSquares: number; completedSquares: number }> {
  assertSupabaseConfigured();

  const gameId = String(event.gameId ?? "").trim();
  const playerName = String(event.playerName ?? "").trim();
  const teamName = String(event.teamName ?? "").trim();
  if (!gameId || !playerName) {
    return { updatedSquares: 0, completedSquares: 0 };
  }

  const rows = await listCardRows({
    activeOnly: true,
    sportKey: "baseball_mlb",
    gameId,
    limit: 300,
  });
  if (rows.length === 0) {
    return { updatedSquares: 0, completedSquares: 0 };
  }

  let updatedSquares = 0;
  let completedSquares = 0;
  const nowIso = new Date().toISOString();
  const touchedSquareIds = new Set<string>();
  const activeCardIds = rows.map(({ card }) => card.id);

  const playerId = Number(event.playerId ?? 0);
  const mappedEventType = toMlbSquareEventType(event.eventType);
  if (Number.isFinite(playerId) && playerId > 0 && mappedEventType && activeCardIds.length > 0) {
    const { data: directSquares, error: directSquaresError } = await supabaseAdmin!
      .from("sports_bingo_squares")
      .select("id, resolver, status, resolved_at")
      .in("card_id", activeCardIds)
      .eq("status", "pending")
      .eq("player_id", Math.trunc(playerId))
      .eq("event_type", mappedEventType);
    if (!directSquaresError && directSquares?.length) {
      for (const square of directSquares as Array<{ id: string; resolver: unknown; status: SquareStatus; resolved_at: string | null }>) {
        const resolver = parseResolver(square.resolver);
        if (!resolver) {
          continue;
        }
        const updatedResolver = applyWebhookCountToResolver(resolver, event, null);
        if (!updatedResolver) {
          continue;
        }

        let nextStatus: SquareStatus = square.status;
        let resolvedAt = square.resolved_at;
        if (updatedResolver.kind === "mlb_webhook_player_event_at_least" || updatedResolver.kind === "mlb_webhook_team_event_at_least") {
          const current = Math.max(0, Number(updatedResolver.currentCount ?? 0));
          const target = Math.max(1, Number(updatedResolver.threshold ?? 1));
          if (current >= target) {
            nextStatus = "hit";
            resolvedAt = nowIso;
            completedSquares += 1;
          }
        } else if (updatedResolver.kind === "mlb_webhook_player_event_at_most") {
          const current = Math.max(0, Number(updatedResolver.currentCount ?? 0));
          const maxAllowed = Math.max(0, Number(updatedResolver.threshold ?? 0));
          if (current > maxAllowed) {
            nextStatus = "miss";
            resolvedAt = nowIso;
            completedSquares += 1;
          }
        }

        const { error } = await supabaseAdmin!
          .from("sports_bingo_squares")
          .update({
            resolver: updatedResolver,
            status: nextStatus,
            resolved_at: nextStatus === "pending" ? null : resolvedAt,
          })
          .eq("id", square.id);
        if (!error) {
          updatedSquares += 1;
          touchedSquareIds.add(square.id);
        }
      }
    }
  }

  for (const { card, squares } of rows) {
    const teamSide = resolveTeamSideFromEvent(card, teamName);
    for (const square of squares) {
      if (touchedSquareIds.has(square.id)) {
        continue;
      }
      if (square.status !== "pending" || square.is_free) {
        continue;
      }
      const resolver = parseResolver(square.resolver);
      if (!resolver) {
        continue;
      }
      const updatedResolver = applyWebhookCountToResolver(resolver, event, teamSide);
      if (!updatedResolver) {
        continue;
      }

      let nextStatus: SquareStatus = square.status;
      let resolvedAt = square.resolved_at;
      if (updatedResolver.kind === "mlb_webhook_player_event_at_least" || updatedResolver.kind === "mlb_webhook_team_event_at_least") {
        const current = Math.max(0, Number(updatedResolver.currentCount ?? 0));
        const target = Math.max(1, Number(updatedResolver.threshold ?? 1));
        if (current >= target) {
          nextStatus = "hit";
          resolvedAt = nowIso;
          completedSquares += 1;
        }
      } else if (updatedResolver.kind === "mlb_webhook_player_event_at_most") {
        const current = Math.max(0, Number(updatedResolver.currentCount ?? 0));
        const maxAllowed = Math.max(0, Number(updatedResolver.threshold ?? 0));
        if (current > maxAllowed) {
          nextStatus = "miss";
          resolvedAt = nowIso;
          completedSquares += 1;
        }
      }

      const { error } = await supabaseAdmin!
        .from("sports_bingo_squares")
        .update({
          resolver: updatedResolver,
          status: nextStatus,
          resolved_at: nextStatus === "pending" ? null : resolvedAt,
        })
        .eq("id", square.id);
      if (!error) {
        updatedSquares += 1;
      }
    }
  }

  return { updatedSquares, completedSquares };
}

async function getScoresBySportKey(sportKey: string): Promise<Map<string, ScoreSnapshot>> {
  const now = Date.now();
  const cached = scoreCache.get(sportKey);
  if (cached && now < cached.expiresAt) {
    cacheTelemetry.scoreCacheHits += 1;
    return cached.byGameId;
  }
  cacheTelemetry.scoreCacheMisses += 1;

  const path = SPORT_PATH_BY_KEY[sportKey];
  if (!path) {
    return new Map<string, ScoreSnapshot>();
  }

  // `dates[]`, never `start_date`/`end_date`. This lookup is shared across every league above, and
  // `/nfl/v1/games` and `/mlb/v1/games` silently ignore the date-range form — they return the
  // oldest rows in the archive (2002 for NFL, 2000 spring training for MLB) as though unfiltered,
  // so no card ever matched a score. NBA/WNBA return the identical set either way, and NHL only
  // honours `dates[]`. Verified against the live API 2026-08-17.
  const query = buildBallDontLieDatesQuery(
    Date.now() - 3 * 24 * 60 * 60 * 1000,
    Date.now() + 1 * 24 * 60 * 60 * 1000
  );
  const payload = await fetchBallDontLieList<BallDontLieGame>(path, query);

  const byGameId = new Map<string, ScoreSnapshot>();
  for (const event of payload) {
    const snapshot = normalizeBallDontLieScoreRow(event as Record<string, unknown>, sportKey);
    if (!snapshot) {
      continue;
    }
    byGameId.set(snapshot.gameId, snapshot);
  }

  scoreCache.set(sportKey, {
    byGameId,
    expiresAt: now + SCORE_CACHE_MS,
  });

  return byGameId;
}

/**
 * `settled` splits out `void`/`replaced` from `pending`, which `hits`/`misses`/`pending` alone
 * cannot express.
 *
 * **Why this matters (Phase 4, docs/prop-bingo-nfl-plan.md):** the loss branch in
 * `refreshSportsBingoProgress` fires on `pending === 0`. Before this split a voided square counted
 * as pending forever, so any card carrying one stayed `active` after Final and never notified its
 * owner — a latent bug on every league (an NBA prop for a player who was a late scratch does it
 * too), which Phase 4 would have made routine on NFL boards, where inactive lists mean DNP voids
 * are ordinary rather than exotic. A void square can never become a hit, so once nothing is
 * genuinely pending the card is decided.
 */
function summarizeCard(card: SportsBingoCard): {
  hits: number;
  misses: number;
  pending: number;
  voided: number;
} {
  let hits = 0;
  let misses = 0;
  let pending = 0;
  let voided = 0;
  for (const square of card.squares) {
    if (square.isFree || square.status === "hit") {
      hits += 1;
    } else if (square.status === "miss") {
      misses += 1;
    } else if (square.status === "void" || square.status === "replaced") {
      voided += 1;
    } else {
      pending += 1;
    }
  }
  return { hits, misses, pending, voided };
}

async function loadUserPoints(userId: string): Promise<number> {
  const { data } = await supabaseAdmin!
    .from("users")
    .select("points")
    .eq("id", userId)
    .maybeSingle<{ points: number }>();
  return Number(data?.points ?? 0);
}

function buildBingoScorecardLink(params: { cardId: string; startsAt: string }): string {
  const startsAt = params.startsAt;
  const startsAtMs = Date.parse(startsAt);
  const date = Number.isFinite(startsAtMs)
    ? new Date(startsAtMs - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
    : new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  return `/bingo/home?date=${encodeURIComponent(date)}&cardId=${encodeURIComponent(params.cardId)}`;
}

async function addNotification(
  userId: string,
  type: "success" | "warning" | "info",
  message: string,
  linkUrl?: string
): Promise<void> {
  await supabaseAdmin!.from("notifications").insert({
    user_id: userId,
    type,
    message,
    link_url: linkUrl ?? null,
  });
}

function toGameFromCardRow(card: SportsBingoCardRow): SportsBingoGame {
  return {
    id: card.game_id,
    sportKey: card.sport_key,
    homeTeam: card.home_team,
    awayTeam: card.away_team,
    startsAt: card.starts_at,
    gameLabel: card.game_label,
    isLocked: Date.parse(card.starts_at) <= Date.now(),
  };
}

function isMlbStarBrandedSquareLabel(label: string): boolean {
  const trimmed = String(label ?? "").trim();
  const hrMatch = trimmed.match(/^(.*)\s+HR$/i);
  if (!hrMatch?.[1]) {
    return false;
  }
  return MLB_STAR_BRANDED_PLAYER_KEYS.has(normalizeNameKey(hrMatch[1]));
}

function isMlbLateScratchWindow(card: SportsBingoCardRow, nowMs: number): boolean {
  const startsAtMs = Date.parse(card.starts_at);
  const createdAtMs = Date.parse(card.created_at);
  const inGameWindow =
    Number.isFinite(startsAtMs) &&
    nowMs >= startsAtMs - MLB_LATE_SCRATCH_SWAP_WINDOW_MS &&
    nowMs <= startsAtMs + MLB_LATE_SCRATCH_SWAP_WINDOW_MS;
  const inLockWindow =
    Number.isFinite(createdAtMs) &&
    nowMs >= createdAtMs &&
    nowMs <= createdAtMs + MLB_LATE_SCRATCH_SWAP_WINDOW_MS;
  return inGameWindow || inLockWindow;
}

function getMlbPlayerLineupStatus(
  snapshot: MLBGamePlayerStatsSnapshot,
  playerRef: string
): { starter: boolean; teamSide: TeamSide | null } | null {
  const parsed = parseResolverPlayerRef(playerRef);
  if (parsed.playerId && snapshot.lineupByPlayerId.has(parsed.playerId)) {
    return snapshot.lineupByPlayerId.get(parsed.playerId) ?? null;
  }
  const playerKey = normalizeNameKey(parsed.displayName || playerRef);
  if (!playerKey) {
    return null;
  }
  return snapshot.lineupByPlayerKey.get(playerKey) ?? null;
}

async function autoSwapLateScratchedStarSquares(params: {
  card: SportsBingoCardRow;
  squares: SportsBingoSquareRow[];
  mlbStatsSnapshot: MLBGamePlayerStatsSnapshot | null;
}): Promise<{ swappedSquares: number; updatedSquares: number; squares: SportsBingoSquareRow[] }> {
  const { card, mlbStatsSnapshot } = params;
  const squares = [...params.squares];
  if (!mlbStatsSnapshot) {
    return { swappedSquares: 0, updatedSquares: 0, squares };
  }
  const nowMs = Date.now();
  if (!isMlbLateScratchWindow(card, nowMs)) {
    return { swappedSquares: 0, updatedSquares: 0, squares };
  }
  const hasConfirmedLineups =
    mlbStatsSnapshot.lineupByPlayerId.size > 0 || mlbStatsSnapshot.lineupByPlayerKey.size > 0;
  if (!hasConfirmedLineups) {
    return { swappedSquares: 0, updatedSquares: 0, squares };
  }

  let swappedSquares = 0;
  let updatedSquares = 0;
  for (let index = 0; index < squares.length; index += 1) {
    const square = squares[index];
    if (!square || square.is_free || square.status !== "pending") {
      continue;
    }

    const resolver = parseResolver(square.resolver);
    if (!resolver || resolver.kind !== "mlb_webhook_player_event_at_least") {
      continue;
    }
    if (resolver.event !== "home_run" || resolver.threshold < 1) {
      continue;
    }
    if (!isMlbStarBrandedSquareLabel(square.label)) {
      continue;
    }

    const lineupStatus = getMlbPlayerLineupStatus(mlbStatsSnapshot, resolver.player);
    if (lineupStatus?.starter) {
      continue;
    }

    const replacementTeam = lineupStatus?.teamSide ?? "home";
    const replacementResolver: SportsBingoResolver = {
      kind: "mlb_webhook_team_event_at_least",
      team: replacementTeam,
      event: "home_run",
      threshold: 2,
      currentCount: 0,
    };
    const replacementLabel = buildSquareLabel(toGameFromCardRow(card), replacementResolver);
    const { data, error } = await supabaseAdmin!
      .from("sports_bingo_squares")
      .update({
        resolver: replacementResolver,
        label: replacementLabel,
        probability: 0.46,
        status: "pending",
        resolved_at: null,
      })
      .eq("id", square.id)
      .select("id, card_id, square_index, label, resolver, probability, is_free, status, created_at, resolved_at")
      .single<SportsBingoSquareRow>();
    if (error || !data) {
      continue;
    }
    squares[index] = data;
    swappedSquares += 1;
    updatedSquares += 1;
  }

  return { swappedSquares, updatedSquares, squares };
}

function isNflLateScratchWindow(card: SportsBingoCardRow, nowMs: number): boolean {
  const startsAtMs = Date.parse(card.starts_at);
  const createdAtMs = Date.parse(card.created_at);
  const inGameWindow =
    Number.isFinite(startsAtMs) &&
    nowMs >= startsAtMs - NFL_LATE_SCRATCH_SWAP_WINDOW_MS &&
    nowMs <= startsAtMs + NFL_LATE_SCRATCH_SWAP_WINDOW_MS;
  const inLockWindow =
    Number.isFinite(createdAtMs) &&
    nowMs >= createdAtMs &&
    nowMs <= createdAtMs + NFL_LATE_SCRATCH_SWAP_WINDOW_MS;
  return inGameWindow || inLockWindow;
}

/** The player ref carried by an NFL player-prop resolver, or null for a non-player resolver. */
function nflPropResolverPlayerRef(resolver: SportsBingoResolver): string | null {
  switch (resolver.kind) {
    case "player_prop":
    case "nfl_player_anytime_td":
    case "nfl_player_first_td":
      return resolver.player || null;
    default:
      return null;
  }
}

export type NFLInactivePropSwap = {
  squareId: string;
  squareIndex: number;
  playerRef: string;
  replacementResolver: SportsBingoResolver;
  replacementLabel: string;
  probability: number;
};

/**
 * Phase 4 (docs/prop-bingo-nfl-activation-plan.md) — pure: given a card's squares and a *fresh*
 * injury index, decide which NFL player-prop squares belong to a player who is now inactive and
 * what each should become. Kept separate from the DB write in `autoSwapInactiveNFLPropSquares`
 * below so the swap decision is unit-testable without a Supabase double.
 *
 * Mirrors MLB's `autoSwapLateScratchedStarSquares` philosophy: a dead player square is swapped for
 * a live *whole-game* square that still resolves through the game — "both teams score at least 17
 * points," which has no box-score or roster dependency. The square keeps its own priced
 * probability (clamped) rather than being re-modelled, so the card's stored win probability stays
 * coherent. Two scratched players on one board both land on this same replacement — the same
 * limitation MLB carries; rare enough to accept. Void stays the settlement-time safety net for
 * everything the window misses; a scratched player is never settled `miss`.
 */
export function planNFLInactivePropSwaps(params: {
  card: SportsBingoCardRow;
  squares: SportsBingoSquareRow[];
  injuryIndex: NFLInjuryIndex | null;
  nowMs?: number;
}): NFLInactivePropSwap[] {
  const { card, squares, injuryIndex } = params;
  if (!injuryIndex || injuryIndex.failed) {
    return [];
  }
  if (injuryIndex.inactivePlayerIds.size === 0 && injuryIndex.inactivePlayerKeys.size === 0) {
    return [];
  }
  const nowMs = params.nowMs ?? Date.now();
  if (!isNflLateScratchWindow(card, nowMs)) {
    return [];
  }

  const game = toGameFromCardRow(card);
  const swaps: NFLInactivePropSwap[] = [];
  for (const square of squares) {
    if (!square || square.is_free || square.status !== "pending") {
      continue;
    }
    const resolver = parseResolver(square.resolver);
    if (!resolver) {
      continue;
    }
    const playerRef = nflPropResolverPlayerRef(resolver);
    if (!playerRef) {
      continue;
    }
    const parsedRef = parseResolverPlayerRef(playerRef);
    if (!isNFLPlayerInactive(injuryIndex, parsedRef.playerId, parsedRef.displayName || playerRef)) {
      continue;
    }
    const replacementResolver: SportsBingoResolver = {
      kind: "nfl_both_teams_score_at_least",
      threshold: 17,
    };
    swaps.push({
      squareId: square.id,
      squareIndex: square.square_index,
      playerRef,
      replacementResolver,
      replacementLabel: buildSquareLabel(game, replacementResolver),
      probability: clamp(Number(square.probability ?? 0.5) || 0.5, 0.25, 0.75),
    });
  }
  return swaps;
}

async function autoSwapInactiveNFLPropSquares(params: {
  card: SportsBingoCardRow;
  squares: SportsBingoSquareRow[];
  injuryIndex: NFLInjuryIndex | null;
}): Promise<{ swappedSquares: number; updatedSquares: number; squares: SportsBingoSquareRow[] }> {
  const squares = [...params.squares];
  const plan = planNFLInactivePropSwaps({ card: params.card, squares, injuryIndex: params.injuryIndex });
  if (plan.length === 0) {
    return { swappedSquares: 0, updatedSquares: 0, squares };
  }

  const indexById = new Map(squares.map((square, index) => [square.id, index]));
  let swappedSquares = 0;
  let updatedSquares = 0;
  for (const swap of plan) {
    const { data, error } = await supabaseAdmin!
      .from("sports_bingo_squares")
      .update({
        resolver: swap.replacementResolver,
        label: swap.replacementLabel,
        probability: swap.probability,
        status: "pending",
        resolved_at: null,
      })
      .eq("id", swap.squareId)
      .select("id, card_id, square_index, label, resolver, probability, is_free, status, created_at, resolved_at")
      .single<SportsBingoSquareRow>();
    if (error || !data) {
      continue;
    }
    const index = indexById.get(swap.squareId);
    if (index !== undefined) {
      squares[index] = data;
    }
    swappedSquares += 1;
    updatedSquares += 1;
  }
  return { swappedSquares, updatedSquares, squares };
}

export async function refreshSportsBingoProgress(params: {
  userId?: string;
  limit?: number;
  sportKey?: string;
  gameId?: string;
  bypassCache?: boolean;
  invalidationMode?: "force" | "throttled";
} = {}): Promise<{
  scannedCards: number;
  updatedSquares: number;
  settledWins: number;
  settledLosses: number;
  nearWinAlerts: number;
}> {
  const refreshStartedAtMs = Date.now();
  const telemetryStart = {
    scoreCacheHits: cacheTelemetry.scoreCacheHits,
    scoreCacheMisses: cacheTelemetry.scoreCacheMisses,
    invalidationInvocations: cacheTelemetry.invalidationInvocations,
    invalidationThrottledSkips: cacheTelemetry.invalidationThrottledSkips,
  };
  assertSupabaseConfigured();
  if (params.bypassCache) {
    maybeInvalidateSportsBingoCaches({
      sportKey: params.sportKey,
      gameId: params.gameId,
      mode: params.invalidationMode ?? "force",
    });
  }

  const activeCardRows = await listCardRows({
    userId: params.userId,
    activeOnly: true,
    sportKey: params.sportKey,
    gameId: params.gameId,
    limit: params.limit ?? 200,
    stalestFirst: true,
  });

  if (activeCardRows.length === 0) {
    console.info("[sportsBingo][telemetry]", {
      phase: "refresh",
      scanned_cards: 0,
      updated_squares: 0,
      refresh_latency_ms: Date.now() - refreshStartedAtMs,
      score_cache_hits: cacheTelemetry.scoreCacheHits,
      score_cache_misses: cacheTelemetry.scoreCacheMisses,
      invalidation_invocations: cacheTelemetry.invalidationInvocations,
      invalidation_throttled_skips: cacheTelemetry.invalidationThrottledSkips,
      score_cache_hits_delta: cacheTelemetry.scoreCacheHits - telemetryStart.scoreCacheHits,
      score_cache_misses_delta: cacheTelemetry.scoreCacheMisses - telemetryStart.scoreCacheMisses,
      invalidation_invocations_delta: cacheTelemetry.invalidationInvocations - telemetryStart.invalidationInvocations,
      invalidation_throttled_skips_delta:
        cacheTelemetry.invalidationThrottledSkips - telemetryStart.invalidationThrottledSkips,
    });
    return {
      scannedCards: 0,
      updatedSquares: 0,
      settledWins: 0,
      settledLosses: 0,
      nearWinAlerts: 0,
    };
  }

  const sportKeys = Array.from(new Set(activeCardRows.map((entry) => entry.card.sport_key).filter(Boolean)));
  const scoresBySport = new Map<string, Map<string, ScoreSnapshot>>();
  for (const sportKey of sportKeys) {
    try {
      scoresBySport.set(sportKey, await getScoresBySportKey(sportKey));
    } catch {
      scoresBySport.set(sportKey, new Map<string, ScoreSnapshot>());
    }
  }

  let updatedSquares = 0;
  let settledWins = 0;
  let settledLosses = 0;
  let nearWinAlerts = 0;
  let swappedLateScratchSquares = 0;
  let swappedNflInactiveSquares = 0;
  // Phase 4: one `/nfl/v1/player_injuries` pull per sweep, shared across every NFL card, and only
  // when an NFL card is actually present. `resolveNFLInjuryIndex` is also process-cached, but the
  // live-staleness bound forces a re-pull if that cache is older than ~10 minutes so a scratch
  // that posts ~90 minutes before kickoff is caught mid-sweep.
  let nflInjuryIndexForSweep: NFLInjuryIndex | null = null;
  let nflInjuryIndexLoaded = false;
  const nbaStatsSnapshotsByOddsGameId = new Map<string, NBAGamePlayerStatsSnapshot | null>();
  const mlbStatsSnapshotsByOddsGameId = new Map<string, MLBGamePlayerStatsSnapshot | null>();
  // Keyed by game id **and** whether the plays walk was included, so a plays-free snapshot fetched
  // for one card is never reused for a card that actually holds an Optional-3b square.
  const nflStatsSnapshotsByGameId = new Map<string, NFLGameStatsSnapshot | null>();
  // Phase 3 (live-event parity): one `live-stats:americanfootball_nfl` diff per *game* per sweep,
  // no matter how many cards or memo variants that game has. Without this set, two cards whose
  // resolvers need different optional legs (plays / team_stats) produce two snapshot fetches and
  // would double-broadcast the same change inside a single sweep.
  const nflLiveStatBroadcastGameIds = new Set<string>();
  let nflLiveStatBroadcastRows = 0;
  let nflLiveStatDroppedRows = 0;
  let nflLiveStatSeededGames = 0;
  const nflLiveStatSends: Array<Promise<unknown>> = [];

  for (const entry of activeCardRows) {
    const cardRow = entry.card;
    let squares = [...entry.squares];
    const oddsScore = scoresBySport.get(cardRow.sport_key)?.get(cardRow.game_id) ?? null;

    let nbaStatsSnapshot: NBAGamePlayerStatsSnapshot | null = null;
    let mlbStatsSnapshot: MLBGamePlayerStatsSnapshot | null = null;
    let nflStatsSnapshot: NFLGameStatsSnapshot | null = null;
    if (cardRow.sport_key === "americanfootball_nfl") {
      // One `/nfl/v1/stats` (+ conditional `/nfl/v1/plays`) call per *game*, memoized across every
      // card holding that game — the same discipline the MLB path uses.
      const parsedResolvers = squares
        .map((square) => parseResolver(square.resolver))
        .filter((resolver): resolver is SportsBingoResolver => resolver !== null);
      const includePlays = parsedResolvers.some(nflResolverNeedsPlays);
      // Phase 8b: a board with no Tier-1 square never pays for `/nfl/v1/team_stats`, and a board
      // that has one pays for it exactly once per game no matter how many cards hold it.
      const includeTeamStats = parsedResolvers.some(nflResolverNeedsTeamStats);
      const memoKey = `${cardRow.game_id}:${includePlays ? "plays" : "box"}:${includeTeamStats ? "team" : "noteam"}`;
      if (nflStatsSnapshotsByGameId.has(memoKey)) {
        nflStatsSnapshot = nflStatsSnapshotsByGameId.get(memoKey) ?? null;
      } else {
        nflStatsSnapshot = await getNFLGameStatsSnapshot(cardRow, { includePlays, includeTeamStats });
        nflStatsSnapshotsByGameId.set(memoKey, nflStatsSnapshot);
      }
      if (nflStatsSnapshot && !nflLiveStatBroadcastGameIds.has(cardRow.game_id)) {
        nflLiveStatBroadcastGameIds.add(cardRow.game_id);
        const broadcast = broadcastNFLLiveStatDeltas(cardRow, nflStatsSnapshot);
        nflLiveStatBroadcastRows += broadcast.broadcastRows;
        nflLiveStatDroppedRows += broadcast.droppedRows;
        nflLiveStatSeededGames += broadcast.seeded ? 1 : 0;
        nflLiveStatSends.push(...broadcast.sends);
      }
      if (!nflInjuryIndexLoaded) {
        nflInjuryIndexLoaded = true;
        try {
          nflInjuryIndexForSweep = await resolveNFLInjuryIndex({
            maxStalenessMs: NFL_INJURY_INDEX_LIVE_STALENESS_MS,
          });
        } catch {
          nflInjuryIndexForSweep = null;
        }
      }
    } else if (isBasketballSportKey(cardRow.sport_key)) {
      if (nbaStatsSnapshotsByOddsGameId.has(cardRow.game_id)) {
        nbaStatsSnapshot = nbaStatsSnapshotsByOddsGameId.get(cardRow.game_id) ?? null;
      } else {
        nbaStatsSnapshot = await getNBAGamePlayerStatsSnapshot(cardRow);
        nbaStatsSnapshotsByOddsGameId.set(cardRow.game_id, nbaStatsSnapshot);
      }
    } else if (cardRow.sport_key === "baseball_mlb") {
      if (mlbStatsSnapshotsByOddsGameId.has(cardRow.game_id)) {
        mlbStatsSnapshot = mlbStatsSnapshotsByOddsGameId.get(cardRow.game_id) ?? null;
      } else {
        mlbStatsSnapshot = await getMLBGamePlayerStatsSnapshot(cardRow);
        mlbStatsSnapshotsByOddsGameId.set(cardRow.game_id, mlbStatsSnapshot);
      }
    }

    if (cardRow.sport_key === "baseball_mlb") {
      const swapResult = await autoSwapLateScratchedStarSquares({
        card: cardRow,
        squares,
        mlbStatsSnapshot,
      });
      squares = swapResult.squares;
      swappedLateScratchSquares += swapResult.swappedSquares;
      updatedSquares += swapResult.updatedSquares;
    }

    if (cardRow.sport_key === "americanfootball_nfl") {
      // Phase 4: inside the kickoff window, swap any prop square whose player is now on the injury
      // report as not playing for a live whole-game square. Void still backstops anything missed.
      const swapResult = await autoSwapInactiveNFLPropSquares({
        card: cardRow,
        squares,
        injuryIndex: nflInjuryIndexForSweep,
      });
      squares = swapResult.squares;
      swappedNflInactiveSquares += swapResult.swappedSquares;
      updatedSquares += swapResult.updatedSquares;
    }

    const startsAtMs = Date.parse(cardRow.starts_at);
    const isPastForceFinalizeWindow =
      Number.isFinite(startsAtMs) && Date.now() - startsAtMs >= BINGO_FORCE_FINALIZE_AFTER_START_MS;
    const score = mergeLiveScores(
      mergeLiveScores(
        mergeLiveScores(oddsScore, toNBALiveScoreSnapshot(cardRow, nbaStatsSnapshot)),
        toMLBLiveScoreSnapshot(cardRow, mlbStatsSnapshot)
      ),
      toNFLLiveScoreSnapshot(cardRow, nflStatsSnapshot)
    );
    if (!score && !isPastForceFinalizeWindow) {
      await supabaseAdmin!.from("sports_bingo_cards").update({ last_cron_processed_at: new Date().toISOString() }).eq("id", cardRow.id);
      continue;
    }

    const effectiveScore: ScoreSnapshot =
      score ??
      ({
        gameId: cardRow.game_id,
        sportKey: cardRow.sport_key,
        homeTeam: cardRow.home_team,
        awayTeam: cardRow.away_team,
        homeScore: null,
        awayScore: null,
        completed: true,
      } satisfies ScoreSnapshot);

    const mustForceFinalize = !score?.completed && isPastForceFinalizeWindow;

    for (let index = 0; index < squares.length; index += 1) {
      const square = squares[index] as SportsBingoSquareRow;
      if (!square) {
        continue;
      }
      if (square.is_free) {
        if (square.status !== "hit") {
          const { data } = await supabaseAdmin!
            .from("sports_bingo_squares")
            .update({ status: "hit", resolved_at: new Date().toISOString() })
            .eq("id", square.id)
            .select("id, card_id, square_index, label, resolver, probability, is_free, status, created_at, resolved_at")
            .single<SportsBingoSquareRow>();
          if (data) {
            squares[index] = data;
            updatedSquares += 1;
          }
        }
        continue;
      }

      const resolver = parseResolver(square.resolver);
      if (!resolver) {
        if (square.status !== "pending") {
          continue;
        }
        const { data, error } = await supabaseAdmin!
          .from("sports_bingo_squares")
          .update({ status: "void", resolved_at: new Date().toISOString() })
          .eq("id", square.id)
          .select("id, card_id, square_index, label, resolver, probability, is_free, status, created_at, resolved_at")
          .single<SportsBingoSquareRow>();
        if (error || !data) {
          throw new Error(error?.message ?? "Failed to mark bingo square as void.");
        }
        squares[index] = data;
        updatedSquares += 1;
        continue;
      }

      if (square.status !== "pending" && !(square.status === "void" && isResolverEligibleForVoidRegrade(resolver))) {
        continue;
      }

      const evaluation = evaluateResolver(resolver, effectiveScore, nbaStatsSnapshot, mlbStatsSnapshot, nflStatsSnapshot);
      if (evaluation.status === "pending" && !mustForceFinalize) {
        if (square.status === "void" && isResolverEligibleForVoidRegrade(resolver)) {
          const { data, error } = await supabaseAdmin!
            .from("sports_bingo_squares")
            .update({ status: "pending", resolved_at: null })
            .eq("id", square.id)
            .select("id, card_id, square_index, label, resolver, probability, is_free, status, created_at, resolved_at")
            .single<SportsBingoSquareRow>();
          if (error || !data) {
            throw new Error(error?.message ?? "Failed to reopen Bingo square for regrading.");
          }
          squares[index] = data;
          updatedSquares += 1;
        }
        continue;
      }

      if (evaluation.status === "void" || evaluation.status === "pending") {
        const { data, error } = await supabaseAdmin!
          .from("sports_bingo_squares")
          .update({ status: "void", resolved_at: new Date().toISOString() })
          .eq("id", square.id)
          .select("id, card_id, square_index, label, resolver, probability, is_free, status, created_at, resolved_at")
          .single<SportsBingoSquareRow>();
        if (error || !data) {
          throw new Error(error?.message ?? "Failed to mark bingo square as void.");
        }
        squares[index] = data;
        updatedSquares += 1;
        continue;
      }

      const resolvedAt = new Date().toISOString();
      const { data, error } = await supabaseAdmin!
        .from("sports_bingo_squares")
        .update({ status: evaluation.status, resolved_at: resolvedAt })
        .eq("id", square.id)
        .select("id, card_id, square_index, label, resolver, probability, is_free, status, created_at, resolved_at")
        .single<SportsBingoSquareRow>();

      if (error || !data) {
        throw new Error(error?.message ?? "Failed to update bingo square state.");
      }

      squares[index] = data;
      updatedSquares += 1;
    }

    const mappedCard = mapCardRow(cardRow, squares);
    const signals = computeCardSignals(mappedCard.squares);

    if (signals.hasWinningLine) {
      const { data: wonRow, error: cardUpdateError } = await supabaseAdmin!
        .from("sports_bingo_cards")
        .update({
          status: "won",
          settled_at: new Date().toISOString(),
          won_line: signals.winningLine ?? null,
          won_notified_at: new Date().toISOString(),
        })
        .eq("id", cardRow.id)
        .eq("status", "active")
        .select("id")
        .maybeSingle<{ id: string }>();

      if (!cardUpdateError && wonRow?.id) {
        await addNotification(
          cardRow.user_id,
          "success",
          `Your ${cardRow.away_team} vs. ${cardRow.home_team} Bingo Board won! +${cardRow.reward_points} pts!`,
          buildBingoScorecardLink({ cardId: cardRow.id, startsAt: cardRow.starts_at })
        );

        settledWins += 1;
      }

      continue;
    }

    const { misses, pending } = summarizeCard(mappedCard);

    if (signals.isNearWin && !cardRow.near_win_notified_at) {
      const { data: nearWinRow } = await supabaseAdmin!
        .from("sports_bingo_cards")
        .update({ near_win_notified_at: new Date().toISOString() })
        .eq("id", cardRow.id)
        .is("near_win_notified_at", null)
        .select("id")
        .maybeSingle<{ id: string }>();
      if (nearWinRow?.id) {
        await addNotification(
          cardRow.user_id,
          "warning",
          `You're one square away from Bingo in ${cardRow.game_label}!`
        );
        nearWinAlerts += 1;
      }
    }

    if ((effectiveScore.completed || mustForceFinalize) && pending === 0) {
      const { data: lostRow, error: loseError } = await supabaseAdmin!
        .from("sports_bingo_cards")
        .update({ status: "lost", settled_at: new Date().toISOString() })
        .eq("id", cardRow.id)
        .eq("status", "active")
        .select("id")
        .maybeSingle<{ id: string }>();

      if (!loseError && lostRow?.id) {
        await addNotification(cardRow.user_id, "info", `Final in ${cardRow.game_label}. This Bingo card did not win.`);
        settledLosses += 1;
      }
    }

    await supabaseAdmin!.from("sports_bingo_cards").update({ last_cron_processed_at: new Date().toISOString() }).eq("id", cardRow.id);
  }

  // Flush the NFL live-stat broadcasts before returning, so a short sweep does not exit with its
  // realtime POSTs still in flight. Settled, never rethrown — each promise already swallows.
  if (nflLiveStatSends.length > 0) {
    await Promise.allSettled(nflLiveStatSends);
  }

  const response = {
    scannedCards: activeCardRows.length,
    updatedSquares,
    settledWins,
    settledLosses,
    nearWinAlerts,
  };
  console.info("[sportsBingo][telemetry]", {
    phase: "refresh",
    scanned_cards: response.scannedCards,
    updated_squares: response.updatedSquares,
    settled_wins: response.settledWins,
    settled_losses: response.settledLosses,
    near_win_alerts: response.nearWinAlerts,
    late_scratch_swaps: swappedLateScratchSquares,
    nfl_inactive_swaps: swappedNflInactiveSquares,
    nfl_live_stat_rows: nflLiveStatBroadcastRows,
    nfl_live_stat_dropped_rows: nflLiveStatDroppedRows,
    nfl_live_stat_seeded_games: nflLiveStatSeededGames,
    refresh_latency_ms: Date.now() - refreshStartedAtMs,
    score_cache_hits: cacheTelemetry.scoreCacheHits,
    score_cache_misses: cacheTelemetry.scoreCacheMisses,
    invalidation_invocations: cacheTelemetry.invalidationInvocations,
    invalidation_throttled_skips: cacheTelemetry.invalidationThrottledSkips,
    score_cache_hits_delta: cacheTelemetry.scoreCacheHits - telemetryStart.scoreCacheHits,
    score_cache_misses_delta: cacheTelemetry.scoreCacheMisses - telemetryStart.scoreCacheMisses,
    invalidation_invocations_delta: cacheTelemetry.invalidationInvocations - telemetryStart.invalidationInvocations,
    invalidation_throttled_skips_delta:
      cacheTelemetry.invalidationThrottledSkips - telemetryStart.invalidationThrottledSkips,
  });
  return response;
}

export async function listUserSportsBingoCards(params: {
  userId: string;
  includeSettled?: boolean;
  refreshProgress?: boolean;
  startsAtFrom?: string;
  startsAtTo?: string;
}): Promise<SportsBingoCard[]> {
  const userId = params.userId.trim();
  if (!userId) {
    return [];
  }

  if (params.refreshProgress !== false) {
    await refreshSportsBingoProgress({ userId, limit: 50 });
  }

  const rows = await listCardRows({
    userId,
    activeOnly: false,
    limit: 100,
    startsAtFrom: params.startsAtFrom,
    startsAtTo: params.startsAtTo,
  });
  const cards = rows.map((entry) => mapCardRow(entry.card, entry.squares));

  if (params.includeSettled) {
    return cards;
  }

  return cards.filter((card) => card.status === "active");
}

// Local-calendar days on which the user holds at least one board. Feeds the Bingo date
// calendar's "this day has boards" dots (plan 5a). Deliberately a single-column read over a
// wider row window than `listUserSportsBingoCards` — it is cheap, and the calendar is useless
// if it can only dot the 100 most recent cards. `tzOffsetMinutes` follows the browser's
// `Date.getTimezoneOffset()` convention (minutes to ADD to local time to get UTC), matching
// `listSportsBingoGames`.
export async function listUserSportsBingoCardDates(params: {
  userId: string;
  tzOffsetMinutes?: number | string;
  limit?: number;
}): Promise<string[]> {
  assertSupabaseConfigured();

  const userId = params.userId.trim();
  if (!userId) {
    return [];
  }

  const parsedOffset = Number.parseInt(String(params.tzOffsetMinutes ?? ""), 10);
  const tzOffsetMinutes = Number.isFinite(parsedOffset)
    ? Math.max(-14 * 60, Math.min(14 * 60, parsedOffset))
    : new Date().getTimezoneOffset();

  const { data, error } = await supabaseAdmin!
    .from("sports_bingo_cards")
    .select("starts_at")
    .eq("user_id", userId)
    .order("starts_at", { ascending: false })
    .limit(Math.max(1, Math.min(params.limit ?? 500, 1000)));

  if (error || !data) {
    if (isMissingSportsBingoTablesError(error)) {
      return [];
    }
    throw new Error(error?.message ?? "Failed to load bingo card dates.");
  }

  const days = new Set<string>();
  for (const row of data as Array<{ starts_at: string | null }>) {
    const startsAtMs = Date.parse(String(row.starts_at ?? ""));
    if (!Number.isFinite(startsAtMs)) {
      continue;
    }
    const local = new Date(startsAtMs - tzOffsetMinutes * 60_000);
    days.add(
      `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(
        local.getUTCDate()
      ).padStart(2, "0")}`
    );
  }

  return Array.from(days).sort();
}

function normalizeSquarePreviewPayload(value: unknown): Array<{ index: number; key: string; isFree: boolean }> {
  const rows = asArray(value);
  const parsed: Array<{ index: number; key: string; isFree: boolean }> = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const item = row as { index?: unknown; key?: unknown; isFree?: unknown };
    const index = Number(item.index);
    const key = String(item.key ?? "").trim();
    const isFree = Boolean(item.isFree);
    if (!Number.isFinite(index) || index < 0 || index > 24 || !key) {
      continue;
    }
    parsed.push({ index, key, isFree });
  }
  return parsed;
}

export async function createSportsBingoCard(params: {
  userId: string;
  venueId: string;
  gameId: string;
  sportKey?: string;
  squares: unknown;
}): Promise<SportsBingoCard> {
  assertSupabaseConfigured();

  const userId = params.userId.trim();
  const venueId = params.venueId.trim();
  const gameId = params.gameId.trim();
  const sportKey = (params.sportKey ?? DEFAULT_SPORT_KEY).trim() || DEFAULT_SPORT_KEY;

  if (!userId || !venueId || !gameId) {
    throw new Error("userId, venueId, and gameId are required.");
  }

  const normalizedSquares = normalizeSquarePreviewPayload(params.squares);
  if (normalizedSquares.length !== 25) {
    throw new Error("A bingo board must include exactly 25 squares.");
  }

  const indexSet = new Set<number>();
  for (const square of normalizedSquares) {
    if (indexSet.has(square.index)) {
      throw new Error("Bingo board contains duplicate square indices.");
    }
    indexSet.add(square.index);
  }

  if (indexSet.size !== 25) {
    throw new Error("Bingo board is missing one or more squares.");
  }

  const center = normalizedSquares.find((square) => square.index === 12);
  if (!center || !center.isFree) {
    throw new Error("Bingo board center square must be the free square.");
  }

  const entry = await getGameEntryWithCandidates({
    sportKey,
    gameId,
    includePlayerProps: true,
  });
  if (!entry) {
    throw new Error("Selected game is no longer available.");
  }

  if (+new Date(entry.game.startsAt) <= Date.now()) {
    throw new Error("Games are locked once they begin. Select a game that has not started.");
  }

  // Regrade stale active cards first so slot checks reflect current reality.
  await refreshSportsBingoProgress({ userId, limit: 100, bypassCache: true });

  const byKey = new Map(entry.candidates.map((candidate) => [candidate.key, candidate]));

  const boardSquares: Array<{ index: number; template: SportsBingoSquareTemplate | null; isFree: boolean }> = [];
  const usedSquareKeys = new Set<string>();
  for (const square of normalizedSquares) {
    if (square.isFree) {
      boardSquares.push({ index: square.index, template: null, isFree: true });
      continue;
    }

    const candidate = byKey.get(square.key);
    if (!candidate) {
      throw new Error("One or more board squares are stale. Please generate a new bingo card.");
    }
    if (usedSquareKeys.has(candidate.key)) {
      throw new Error("Bingo board contains duplicate squares. Generate a new board.");
    }
    usedSquareKeys.add(candidate.key);

    boardSquares.push({
      index: square.index,
      template: candidate,
      isFree: false,
    });
  }

  const usedGameSquareCount = boardSquares.filter((square) => !square.isFree).length;
  if (usedGameSquareCount !== 24) {
    throw new Error("Bingo board must contain exactly 24 non-free squares.");
  }

  const boardProbability = estimateBoardWinProbabilityWithTrials(
    boardSquares.map((square) => ({
      index: square.index,
      probability: square.template?.probability ?? 1,
      isFree: square.isFree,
      resolver: square.template?.resolver ?? { kind: "free" },
      teamHint: square.template?.teamHint ?? null,
    })),
    BOARD_SIMULATION_TRIALS
  );

  const activeWindowStartIso = new Date(Date.now() - ACTIVE_CARD_SLOT_BUFFER_HOURS * 60 * 60 * 1000).toISOString();

  const { count: activeCount } = await supabaseAdmin!
    .from("sports_bingo_cards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("venue_id", venueId)
    .eq("status", "active")
    .gt("starts_at", activeWindowStartIso);

  // Missing-table errors surface as null counts in the SDK call path above.
  // Detect explicitly before proceeding so users see a clear migration message.
  const { error: cardsTableCheckError } = await supabaseAdmin!.from("sports_bingo_cards").select("id").limit(1);
  if (isMissingSportsBingoTablesError(cardsTableCheckError)) {
    throw new Error(SPORTS_BINGO_MIGRATION_REQUIRED_ERROR);
  }

  if ((activeCount ?? 0) >= MAX_ACTIVE_CARDS_PER_USER) {
    throw new Error("Limit Reached");
  }

  const { data: existingSameGame } = await supabaseAdmin!
    .from("sports_bingo_cards")
    .select("id")
    .eq("user_id", userId)
    .eq("venue_id", venueId)
    .eq("game_id", gameId)
    .eq("status", "active")
    .gt("starts_at", activeWindowStartIso)
    .limit(1);

  if ((existingSameGame?.length ?? 0) > 0) {
    throw new Error("You already have an active Sports Bingo card for this game.");
  }

  const rewardPoints = Number.isFinite(BINGO_REWARD_POINTS) ? Math.max(1, BINGO_REWARD_POINTS) : 100;
  const startsAtIso = new Date(entry.game.startsAt).toISOString();

  const { data: insertedCard, error: cardError } = await supabaseAdmin!
    .from("sports_bingo_cards")
    .insert({
      user_id: userId,
      venue_id: venueId,
      sport_key: sportKey,
      game_id: gameId,
      game_label: entry.game.gameLabel,
      home_team: entry.game.homeTeam,
      away_team: entry.game.awayTeam,
      starts_at: startsAtIso,
      status: "active",
      board_probability: boardProbability,
      reward_points: rewardPoints,
    })
    .select(
      "id, user_id, venue_id, game_id, game_label, sport_key, home_team, away_team, starts_at, status, board_probability, reward_points, reward_claimed_at, near_win_notified_at, won_notified_at, won_line, settled_at, created_at"
    )
    .single<SportsBingoCardRow>();

  if (cardError || !insertedCard) {
    if (isMissingSportsBingoTablesError(cardError)) {
      throw new Error(SPORTS_BINGO_MIGRATION_REQUIRED_ERROR);
    }
    const errorCode = (cardError as { code?: string } | null)?.code;
    if (errorCode === "23505") {
      throw new Error("You already have an active Sports Bingo card for this game.");
    }
    throw new Error(cardError?.message ?? "Failed to create Sports Bingo card.");
  }

  const nowIso = new Date().toISOString();
  const squareRows = boardSquares
    .sort((a, b) => a.index - b.index)
    .map((square) => {
      if (square.isFree) {
        const resolver: SportsBingoResolver = { kind: "free" };
        return {
          card_id: insertedCard.id,
          square_index: square.index,
          label: "FREE",
          resolver,
          probability: 1,
          is_free: true,
          square_type: "generic",
          player_id: null,
          event_type: null,
          status: "hit" as SquareStatus,
          resolved_at: nowIso,
        };
      }

      const squareMetadata = getSquareMetadataForResolver(square.template!.resolver);
      return {
        card_id: insertedCard.id,
        square_index: square.index,
        label: square.template!.label,
        resolver: square.template!.resolver,
        probability: square.template!.probability,
        is_free: false,
        square_type: squareMetadata.squareType,
        player_id: squareMetadata.playerId,
        event_type: squareMetadata.eventType,
        status: "pending" as SquareStatus,
        resolved_at: null,
      };
    });

  const { data: insertedSquares, error: squaresError } = await supabaseAdmin!
    .from("sports_bingo_squares")
    .insert(squareRows)
    .select("id, card_id, square_index, label, resolver, probability, is_free, status, created_at, resolved_at");

  if (squaresError || !insertedSquares) {
    await supabaseAdmin!.from("sports_bingo_cards").delete().eq("id", insertedCard.id);
    if (isMissingSportsBingoTablesError(squaresError)) {
      throw new Error(SPORTS_BINGO_MIGRATION_REQUIRED_ERROR);
    }
    throw new Error(squaresError?.message ?? "Failed to create Sports Bingo squares.");
  }

  return mapCardRow(insertedCard, insertedSquares as SportsBingoSquareRow[]);
}

export async function claimSportsBingoReward(params: {
  userId: string;
  cardId: string;
}): Promise<{ cardId: string; rewardPoints: number }> {
  assertSupabaseConfigured();

  const userId = params.userId.trim();
  const cardId = params.cardId.trim();
  if (!userId || !cardId) {
    throw new Error("userId and cardId are required.");
  }

  const { data: claimedCard, error: claimError } = await supabaseAdmin!
    .from("sports_bingo_cards")
    .update({ reward_claimed_at: new Date().toISOString() })
    .eq("id", cardId)
    .eq("user_id", userId)
    .eq("status", "won")
    .is("reward_claimed_at", null)
    .select("id, reward_points, game_label, venue_id")
    .maybeSingle<{ id: string; reward_points: number; game_label: string; venue_id: string | null }>();

  if (claimError) {
    throw new Error(claimError.message ?? "Failed to claim Bingo points.");
  }
  if (!claimedCard) {
    throw new Error("This Bingo reward was already claimed or is not eligible yet.");
  }

  const baseRewardPoints = Math.max(0, Number(claimedCard.reward_points ?? 0));
  let rewardPoints = baseRewardPoints;
  const venueId = String(claimedCard.venue_id ?? "").trim();
  if (venueId && rewardPoints > 0) {
    try {
      const campaignResult = await applyChallengeCampaignPoints({
        userId,
        venueId,
        gameType: "bingo",
        basePoints: rewardPoints,
      });
      rewardPoints = Math.max(0, Number(campaignResult.finalPoints ?? rewardPoints));
    } catch {}
  }

  if (rewardPoints > 0) {
    const currentPoints = await loadUserPoints(userId);
    await supabaseAdmin!
      .from("users")
      .update({ points: currentPoints + rewardPoints })
      .eq("id", userId);
  }

  return {
    cardId: claimedCard.id,
    rewardPoints,
  };
}
