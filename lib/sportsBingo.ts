import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { applyChallengeCampaignPoints } from "@/lib/challengeCampaigns";

const BALLDONTLIE_API_BASE_URL = process.env.BALLDONTLIE_API_BASE_URL ?? "https://api.balldontlie.io";
const BALLDONTLIE_API_KEY = process.env.BALLDONTLIE_API_KEY?.trim() ?? "";
const DEFAULT_SPORT_KEY = "basketball_nba";
const BINGO_REWARD_POINTS = Number.parseInt(process.env.BINGO_REWARD_POINTS ?? "50", 10);
const BOARD_TARGET_WIN_RATE = Number.parseFloat(process.env.BINGO_BOARD_TARGET_WIN_RATE ?? "0.42");
const BOARD_TARGET_TOLERANCE = Number.parseFloat(process.env.BINGO_BOARD_TARGET_TOLERANCE ?? "0.05");
const BOARD_SIMULATION_TRIALS = Number.parseInt(process.env.BINGO_BOARD_SIM_TRIALS ?? "2500", 10);
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
const NBA_PLAYER_STATS_CACHE_MS = 5_000;
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
const MLB_STAR_BRANDED_PLAYER_KEYS = new Set([
  "aaron judge",
  "shohei ohtani",
  "juan soto",
  "yordan alvarez",
  "pete alonso",
  "bryce harper",
  "fernando tatis jr",
  "mookie betts",
  "kyle schwarber",
  "manny machado",
  "vladimir guerrero jr",
]);
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
  // NFL
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

const MLB_SETTLABLE_PLAYER_PROP_MARKETS = new Set([
  "player_hits",
  "player_home_runs",
  "player_rbis",
  "player_runs",
  "player_strikeouts_pitcher",
]);

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

type SportsBingoResolver =
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
  | { kind: "replacement_auto" };

type SportsBingoSquareTemplate = {
  key: string;
  label: string;
  resolver: SportsBingoResolver;
  probability: number;
  bucket: CandidateBucket;
  supportLevel?: SquareSupportLevel;
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
  name?: string;
  city?: string;
};

type BallDontLieGame = {
  id?: number;
  season?: number;
  status?: string;
  datetime?: string;
  date?: string;
  home_team_score?: number | string | null;
  visitor_team_score?: number | string | null;
  home_team?: BallDontLieTeam;
  visitor_team?: BallDontLieTeam;
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
  starter?: boolean;
  player?: BallDontLiePlayer;
  team?: BallDontLieTeam;
};

type BallDontLiePlay = {
  period?: number;
  home_score?: number;
  away_score?: number;
  is_scoring_play?: boolean;
  points?: number;
  player_ids?: number[];
  team?: BallDontLieTeam;
};

type BallDontLieListResponse<T> = {
  data?: T[];
  meta?: {
    next_cursor?: number | null;
  };
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
  firstScoringTeam: TeamSide | null;
  homeHalftimeScore: number | null;
  awayHalftimeScore: number | null;
  homeMaxQuarterPoints: number;
  awayMaxQuarterPoints: number;
  firstHalfByPlayerId: Map<number, { pts: number; ast: number; stl: number }>;
  maxQuarterAssistsByPlayerId: Map<number, number>;
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

let gameCatalogCache = new Map<string, CatalogCacheEntry>();
let gameEntryWithCandidatesCache = new Map<string, { expiresAt: number; entry: { game: SportsBingoGame; candidates: SportsBingoSquareTemplate[] } }>();
let scoreCache = new Map<string, { expiresAt: number; byGameId: Map<string, ScoreSnapshot> }>();
let nbaPlayerStatsCache = new Map<string, { expiresAt: number; snapshot: NBAGamePlayerStatsSnapshot | null }>();
let mlbPlayerStatsCache = new Map<string, { expiresAt: number; snapshot: MLBGamePlayerStatsSnapshot | null }>();
let nbaPlayerProfilesCache = new Map<string, { expiresAt: number; profiles: NBAPlayerProfile[] }>();
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
    nbaPlayerProfilesCache.delete(gameId);
  } else {
    nbaPlayerStatsCache.clear();
    mlbPlayerStatsCache.clear();
    nbaPlayerProfilesCache.clear();
  }

  gameEntryWithCandidatesCache.clear();
}

function assertSupabaseConfigured(): void {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }
}

function isBallDontLieConfigured(): boolean {
  return Boolean(BALLDONTLIE_API_KEY);
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

function getTeamDisplayName(team: BallDontLieTeam | null | undefined): string {
  return String(team?.full_name ?? team?.name ?? "").trim();
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
    default:
      return "Sports Bingo square";
  }
}

async function fetchBallDontLieJson(path: string, query: URLSearchParams): Promise<unknown> {
  const isTestEnv = process.env.NODE_ENV === "test";
  if (!isBallDontLieConfigured() && !isTestEnv) {
    throw new Error("BALLDONTLIE_API_KEY is not configured.");
  }

  let response: Response;
  try {
    response = await fetch(`${BALLDONTLIE_API_BASE_URL}${path}?${query.toString()}`, {
      method: "GET",
      headers: BALLDONTLIE_API_KEY
        ? {
            Authorization: BALLDONTLIE_API_KEY,
          }
        : undefined,
      next: { revalidate: 15 },
    });
  } catch (fetchError) {
    console.error(`[BallDontLie] Network error fetching ${path}:`, fetchError);
    return {};
  }

  if (!response.ok) {
    console.error(`[BallDontLie] Request failed (${response.status}) for ${path}. Returning empty result.`);
    return {};
  }

  return response.json();
}

async function fetchBallDontLieList<T>(path: string, baseQuery: URLSearchParams): Promise<T[]> {
  const allRows: T[] = [];
  let cursor: number | null = null;

  for (let page = 0; page < 12; page += 1) {
    const query = new URLSearchParams(baseQuery.toString());
    if (cursor !== null) {
      query.set("cursor", String(cursor));
    }

    const payload = (await fetchBallDontLieJson(path, query)) as BallDontLieListResponse<T>;
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    allRows.push(...rows);

    const nextCursor = payload?.meta?.next_cursor;
    if (typeof nextCursor !== "number") {
      break;
    }
    cursor = nextCursor;
  }

  return allRows;
}

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
    const parsed = +new Date(`${fallback}T00:00:00.000Z`);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return Number.POSITIVE_INFINITY;
}

function isBallDontLieGameFinal(status: string): boolean {
  return status.trim().toLowerCase().startsWith("final");
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

function pickBestMatchingBallDontLieGame(card: SportsBingoCardRow, games: BallDontLieGame[]): BallDontLieGame | null {
  const matching = games.filter((game) => {
    const home = getTeamDisplayName(game.home_team);
    const away = getTeamDisplayName(game.visitor_team);
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


function buildNBAGamePlayerStatsSnapshot(
  card: SportsBingoCardRow,
  game: BallDontLieGame,
  stats: BallDontLieStat[],
  extras?: {
    lineupByPlayerId?: Map<number, { starter: boolean; teamSide: TeamSide | null }>;
    firstScoringTeam?: TeamSide | null;
    homeHalftimeScore?: number | null;
    awayHalftimeScore?: number | null;
    homeMaxQuarterPoints?: number;
    awayMaxQuarterPoints?: number;
    firstHalfByPlayerId?: Map<number, { pts: number; ast: number; stl: number }>;
    maxQuarterAssistsByPlayerId?: Map<number, number>;
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
    finalized: isBallDontLieGameFinal(String(game.status ?? "")),
    homeScore: parseScoreValue(game.home_team_score),
    awayScore: parseScoreValue(game.visitor_team_score),
    lines,
    byPlayerKey,
    homeHasTripleDouble,
    awayHasTripleDouble,
    anyHasTripleDouble: homeHasTripleDouble || awayHasTripleDouble,
    lineupByPlayerId: extras?.lineupByPlayerId ?? new Map(),
    firstScoringTeam: extras?.firstScoringTeam ?? null,
    homeHalftimeScore: extras?.homeHalftimeScore ?? null,
    awayHalftimeScore: extras?.awayHalftimeScore ?? null,
    homeMaxQuarterPoints: extras?.homeMaxQuarterPoints ?? 0,
    awayMaxQuarterPoints: extras?.awayMaxQuarterPoints ?? 0,
    firstHalfByPlayerId: extras?.firstHalfByPlayerId ?? new Map(),
    maxQuarterAssistsByPlayerId: extras?.maxQuarterAssistsByPlayerId ?? new Map(),
  };
}

async function getNBAGamePlayerStatsSnapshot(card: SportsBingoCardRow): Promise<NBAGamePlayerStatsSnapshot | null> {
  if (!isBasketballSportKey(card.sport_key)) {
    return null;
  }
  const basketballApiPrefix = basketballApiPrefixForSportKey(card.sport_key);
  if (!basketballApiPrefix) {
    return null;
  }

  const now = Date.now();
  const cached = nbaPlayerStatsCache.get(card.game_id);
  if (cached && now < cached.expiresAt) {
    return cached.snapshot;
  }

  try {
    if (!isBallDontLieConfigured()) {
      nbaPlayerStatsCache.set(card.game_id, {
        snapshot: null,
        expiresAt: now + NBA_PLAYER_STATS_CACHE_MS,
      });
      return null;
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
    const games = await fetchBallDontLieList<BallDontLieGame>(`${basketballApiPrefix}/games`, gameQuery);
    const matchedGame = pickBestMatchingBallDontLieGame(card, games);
    if (!matchedGame || typeof matchedGame.id !== "number") {
      nbaPlayerStatsCache.set(card.game_id, {
        snapshot: null,
        expiresAt: now + NBA_PLAYER_STATS_CACHE_MS,
      });
      return null;
    }

    const statsQuery = new URLSearchParams({
      per_page: "100",
      period: "0",
    });
    statsQuery.append("game_ids[]", String(matchedGame.id));
    const stats = await fetchBallDontLieList<BallDontLieStat>(`${basketballApiPrefix}/stats`, statsQuery);

    const lineupsQuery = new URLSearchParams({ per_page: "100" });
    lineupsQuery.append("game_ids[]", String(matchedGame.id));
    const lineups = await fetchBallDontLieList<BallDontLieLineup>(`${basketballApiPrefix}/lineups`, lineupsQuery);
    const lineupByPlayerId = new Map<number, { starter: boolean; teamSide: TeamSide | null }>();
    for (const row of lineups) {
      const playerId = Number(row.player?.id ?? 0);
      if (!Number.isFinite(playerId) || playerId <= 0) {
        continue;
      }
      const teamSide = inferCardTeamSide(card, getTeamDisplayName(row.team));
      lineupByPlayerId.set(playerId, { starter: row.starter === true, teamSide });
    }

    const playsQuery = new URLSearchParams({ per_page: "100" });
    playsQuery.append("game_ids[]", String(matchedGame.id));
    const plays = await fetchBallDontLieList<BallDontLiePlay>(`${basketballApiPrefix}/plays`, playsQuery);
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
      if (firstScoringTeam === null && play.is_scoring_play === true) {
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

    const firstHalfByPlayerId = new Map<number, { pts: number; ast: number; stl: number }>();
    const maxQuarterAssistsByPlayerId = new Map<number, number>();
    for (const period of [1, 2, 3, 4]) {
      const periodQuery = new URLSearchParams({ per_page: "100", period: String(period) });
      periodQuery.append("game_ids[]", String(matchedGame.id));
      const periodStats = await fetchBallDontLieList<BallDontLieStat>(`${basketballApiPrefix}/stats`, periodQuery);
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

    const snapshot = buildNBAGamePlayerStatsSnapshot(card, matchedGame, stats, {
      lineupByPlayerId,
      firstScoringTeam,
      homeHalftimeScore,
      awayHalftimeScore,
      homeMaxQuarterPoints,
      awayMaxQuarterPoints,
      firstHalfByPlayerId,
      maxQuarterAssistsByPlayerId,
    });

    nbaPlayerStatsCache.set(card.game_id, {
      snapshot,
      expiresAt: now + NBA_PLAYER_STATS_CACHE_MS,
    });
    return snapshot;
  } catch {
    nbaPlayerStatsCache.set(card.game_id, {
      snapshot: null,
      expiresAt: now + NBA_PLAYER_STATS_CACHE_MS,
    });
    return null;
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

function buildMLBGamePlayerStatsSnapshot(
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
      strikeoutsPitcher: parseStatNumber(row.pitcher_strikeouts ?? row.p_strikeouts ?? row.so_pitcher ?? row.strikeouts),
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
    homeScore: parseScoreValue(game.home_team_score),
    awayScore: parseScoreValue(game.visitor_team_score),
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
    const startDate = toIsoDate(new Date(startsAt - lookbackMs).toISOString());
    const endDate = toIsoDate(new Date(startsAt + lookbackMs).toISOString());

    const gameQuery = new URLSearchParams({
      per_page: "100",
      start_date: startDate,
      end_date: endDate,
    });
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
        const payload = { starter: row.starter === true, teamSide };
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

function findMLBPlayerStatLine(snapshot: MLBGamePlayerStatsSnapshot, playerName: string): MLBPlayerStatLine | null {
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
    const mlbPlayerPropCandidates = await buildMLBPlayerPropCandidates(entry.game);
    if (mlbPlayerPropCandidates.length > 0) {
      merged = aggregateCandidates([...merged, ...mlbPlayerPropCandidates]);
    }
    // Always blend in player-specific achievements derived from historical MLB stat trends
    // so boards stay realistic even when external player-prop feeds are sparse/noisy.
    const mlbHistoricalCandidates = await buildMLBPlayerPropCandidatesFromRecentStats(entry.game);
    if (mlbHistoricalCandidates.length > 0) {
      const historicalAchievements = mlbHistoricalCandidates.filter((item) => item.bucket === "achievement");
      if (historicalAchievements.length > 0) {
        merged = aggregateCandidates([...merged, ...historicalAchievements]);
      }
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

function buildGameAndCandidatesFromBallDontLie(sportKey: string, gameData: BallDontLieGame): GameCatalogEntry | null {
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
  const homeWinProb = 0.55;
  const awayWinProb = 0.45;

  const homeMoneylineResolver: SportsBingoResolver = { kind: "moneyline", team: "home" };
  const awayMoneylineResolver: SportsBingoResolver = { kind: "moneyline", team: "away" };
  rawCandidates.push({
    key: resolverKey(homeMoneylineResolver),
    label: buildSquareLabel(game, homeMoneylineResolver),
    resolver: homeMoneylineResolver,
    probability: homeWinProb,
    bucket: "moneyline",
  });
  rawCandidates.push({
    key: resolverKey(awayMoneylineResolver),
    label: buildSquareLabel(game, awayMoneylineResolver),
    resolver: awayMoneylineResolver,
    probability: awayWinProb,
    bucket: "moneyline",
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

  const averageHomeSpread = isWnbaSportKey(sportKey) ? WNBA_CALIBRATION.averageHomeSpread : -3.5;
  const averageTotal = sportKey === "americanfootball_nfl" ? 45 : sportKey === "baseball_mlb" ? 8 : sportKey === "icehockey_nhl" ? 6 : isWnbaSportKey(sportKey) ? WNBA_CALIBRATION.averageTotal : 226;
  const baseOverProbability = 0.5;

  const favorite: TeamSide = homeWinProb >= awayWinProb ? "home" : "away";
  const underdog: TeamSide = favorite === "home" ? "away" : "home";
  const favoriteBaseLine = Math.max(0.5, Math.abs(averageHomeSpread));
  const spreadOffsets = sportKey === "baseball_mlb" ? [-0.5, 0, 0.5, 1, 1.5, 2] : isWnbaSportKey(sportKey) ? [-3, -1, 0, 1, 3, 5] : [-4, -2, 0, 2, 4, 6, 8];
  const spreadLevels = Array.from(new Set(spreadOffsets.map((offset) => roundLine(favoriteBaseLine + offset)))).filter(
    (line) => line >= 0.5
  );

  for (const line of spreadLevels) {
    const favoriteProbability = clamp(sigmoid(logit(0.5) + (favoriteBaseLine - line) / 3.2), 0.08, 0.92);
    const underdogProbability = clamp(1 - favoriteProbability, 0.08, 0.92);

    const favoriteResolver: SportsBingoResolver = { kind: "spread_more_than", team: favorite, line };
    rawCandidates.push({
      key: resolverKey(favoriteResolver),
      label: buildSquareLabel(game, favoriteResolver),
      resolver: favoriteResolver,
      probability: favoriteProbability,
      bucket: "spread",
    });

    const underdogResolver: SportsBingoResolver = { kind: "spread_keep_close", team: underdog, line };
    rawCandidates.push({
      key: resolverKey(underdogResolver),
      label: buildSquareLabel(game, underdogResolver),
      resolver: underdogResolver,
      probability: underdogProbability,
      bucket: "spread",
    });
  }

  const totalOffsets = sportKey === "baseball_mlb" ? [-3, -2, -1, 0, 1, 2, 3] : isWnbaSportKey(sportKey) ? [-12, -8, -5, -3, 0, 3, 5, 8, 12] : [-15, -10, -6, -3, 0, 3, 6, 10, 15];
  const totalLevels = Array.from(new Set(totalOffsets.map((offset) => roundLine(averageTotal + offset))));
  for (const line of totalLevels) {
    const overProbability = clamp(sigmoid(logit(baseOverProbability) + (averageTotal - line) / 8.5), 0.08, 0.92);
    const underProbability = clamp(1 - overProbability, 0.08, 0.92);

    const overResolver: SportsBingoResolver = { kind: "game_total_over", line };
    rawCandidates.push({
      key: resolverKey(overResolver),
      label: buildSquareLabel(game, overResolver),
      resolver: overResolver,
      probability: overProbability,
      bucket: "total",
    });

    const underResolver: SportsBingoResolver = { kind: "game_total_under", line };
    rawCandidates.push({
      key: resolverKey(underResolver),
      label: buildSquareLabel(game, underResolver),
      resolver: underResolver,
      probability: underProbability,
      bucket: "total",
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
      const overProbability = clamp(sigmoid((impliedTotal - line) / 7.8), 0.05, 0.95);
      const underProbability = clamp(1 - overProbability, 0.05, 0.95);

      const overResolver: SportsBingoResolver = { kind: "team_total_over", team, line };
      rawCandidates.push({
        key: resolverKey(overResolver),
        label: buildSquareLabel(game, overResolver),
        resolver: overResolver,
        probability: overProbability,
        bucket: "team-total",
      });

      const underResolver: SportsBingoResolver = { kind: "team_total_under", team, line };
      rawCandidates.push({
        key: resolverKey(underResolver),
        label: buildSquareLabel(game, underResolver),
        resolver: underResolver,
        probability: underProbability,
        bucket: "team-total",
      });
    }
  };

  buildTeamTotalCandidates("home", impliedHomeTotal);
  buildTeamTotalCandidates("away", impliedAwayTotal);

  const candidates = aggregateCandidates(rawCandidates)
    .map((item) => ({ ...item, probability: clamp(item.probability, 0.05, 0.95) }))
    .sort((a, b) => a.key.localeCompare(b.key));

  if (candidates.length < 24) {
    return null;
  }

  return {
    game,
    candidates,
  };
}

async function loadGameCatalog(sportKey: string): Promise<GameCatalogEntry[]> {
  const sportPathByKey: Record<string, string> = {
    basketball_nba: "/nba/v1/games",
    basketball_wnba: "/wnba/v1/games",
    americanfootball_nfl: "/nfl/v1/games",
    baseball_mlb: "/mlb/v1/games",
    icehockey_nhl: "/nhl/v1/games",
    soccer_usa_mls: "/mls/v1/matches",
    soccer_epl: "/epl/v2/matches",
    soccer_spain_la_liga: "/laliga/v1/matches",
    soccer_italy_serie_a: "/seriea/v1/matches",
    soccer_germany_bundesliga: "/bundesliga/v1/matches",
    soccer_uefa_champs_league: "/ucl/v1/matches",
  };
  const path = sportPathByKey[sportKey];
  if (!path) {
    return [];
  }

  const startMs = Date.now();
  const endMs = startMs + BINGO_LOOKAHEAD_HOURS * 60 * 60 * 1000;
  const daySet = new Set<string>();
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
    daySet.add(new Date(cursor).toISOString().slice(0, 10));
  }

  const payloadById = new Map<string, BallDontLieGame>();
  for (const day of daySet) {
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

  const entries: GameCatalogEntry[] = [];
  for (const item of payload) {
    const entry = buildGameAndCandidatesFromBallDontLie(sportKey, item);
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
    
    const seasonTypeCandidates: Array<"regular" | "playoffs" | ""> = ["regular", "playoffs", ""];
    let seasonRows: Record<string, unknown>[] = [];
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
        period: "0",
      });
      for (const id of playerChunk) {
        historicalQuery.append("player_ids[]", String(id));
      }
      const rows = await fetchBallDontLieList<Record<string, unknown>>(`${basketballApiPrefix}/stats`, historicalQuery);
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

async function buildNBAAchievementCandidates(game: SportsBingoGame, _candidates: SportsBingoSquareTemplate[]): Promise<SportsBingoSquareTemplate[]> {
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

function impliedProbabilityFromAmericanOdds(odds: unknown): number | null {
  const value = Number.parseFloat(String(odds ?? ""));
  if (!Number.isFinite(value) || value === 0) {
    return null;
  }
  if (value > 0) {
    return clamp(100 / (value + 100), 0.02, 0.98);
  }
  return clamp((-value) / ((-value) + 100), 0.02, 0.98);
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

async function buildMLBPlayerPropCandidatesFromRecentStats(game: SportsBingoGame): Promise<SportsBingoSquareTemplate[]> {
  if (!isBallDontLieConfigured()) {
    return [];
  }

  try {
    const gameStartMs = Date.parse(game.startsAt);
    const referenceMs = Number.isFinite(gameStartMs) ? gameStartMs : Date.now();
    const startDate = toIsoDate(new Date(referenceMs - 21 * 24 * 60 * 60 * 1000).toISOString());
    const endDate = toIsoDate(new Date(referenceMs - 6 * 60 * 60 * 1000).toISOString());

    const gameQuery = new URLSearchParams({
      per_page: "100",
      start_date: startDate,
      end_date: endDate,
    });
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
        const rowStrikeouts = parseStatNumber(row.strikeouts ?? row.so);
        const rowWalks = parseStatNumber(row.walks ?? row.bb);
        const rowHitByPitch = parseStatNumber(row.hit_by_pitch ?? row.hbp);
        const rowPlateAppearances = parseStatNumber(row.plate_appearances ?? row.pa ?? row.at_bats ?? row.ab);
        current.batterStrikeouts += rowStrikeouts;
        current.walks += rowWalks;
        current.hitByPitch += rowHitByPitch;
        current.plateAppearances += rowPlateAppearances + rowWalks + rowHitByPitch;
        current.strikeoutsPitcher += parseStatNumber(row.pitcher_strikeouts ?? row.p_strikeouts ?? row.so_pitcher);
        current.pitcherOuts += parseStatNumber(row.pitcher_outs ?? row.p_outs ?? row.outs_recorded ?? row.pitching_outs);
        current.stolenBases += parseStatNumber(row.stolen_bases ?? row.sb);
        current.earnedRunsAllowedPitcher += parseStatNumber(row.earned_runs ?? row.er);
        current.hitsAllowedPitcher += parseStatNumber(row.hits_allowed ?? row.ha);
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
        if (row.starter !== true) {
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

    for (const teamSide of ["home", "away"] as const) {
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

      const teamOutKinds: Array<"groundout" | "flyout" | "strikeout"> = ["groundout", "flyout", "strikeout"];
      for (const eventKind of teamOutKinds) {
        const outResolver: SportsBingoResolver = {
          kind: "mlb_webhook_team_event_at_least",
          team: teamSide,
          event: eventKind,
          threshold: eventKind === "strikeout" ? 5 : 4,
        };
        templates.push({
          key: resolverKey(outResolver),
          label: buildSquareLabel(game, outResolver),
          resolver: outResolver,
          probability: eventKind === "strikeout" ? 0.67 : 0.74,
          bucket: "achievement",
          supportLevel: "supported",
        });
      }

      const teamHitsResolver: SportsBingoResolver = {
        kind: "mlb_webhook_team_event_at_least",
        team: teamSide,
        event: "hit",
        threshold: 5,
      };
      templates.push({
        key: resolverKey(teamHitsResolver),
        label: buildSquareLabel(game, teamHitsResolver),
        resolver: teamHitsResolver,
        probability: 0.78,
        bucket: "achievement",
        supportLevel: "supported",
      });

      for (const plateEvent of ["walk", "hit_by_pitch"] as const) {
        const onBaseResolver: SportsBingoResolver = {
          kind: "mlb_webhook_team_event_at_least",
          team: teamSide,
          event: plateEvent,
          threshold: plateEvent === "walk" ? 2 : 1,
        };
        templates.push({
          key: resolverKey(onBaseResolver),
          label: buildSquareLabel(game, onBaseResolver),
          resolver: onBaseResolver,
          probability: plateEvent === "walk" ? 0.62 : 0.38,
          bucket: "achievement",
          supportLevel: "supported",
        });
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

async function buildMLBPlayerPropCandidates(game: SportsBingoGame): Promise<SportsBingoSquareTemplate[]> {
  if (!isBallDontLieConfigured()) {
    return [];
  }
  let rows: Array<Record<string, unknown>> = [];
  try {
    const query = new URLSearchParams({ per_page: "100" });
    query.append("game_ids[]", game.id);
    rows = await fetchBallDontLieList<Record<string, unknown>>("/mlb/v1/player_props", query);
  } catch {
    rows = [];
  }
  if (rows.length === 0) {
    return buildMLBPlayerPropCandidatesFromRecentStats(game);
  }

  const byAxis = new Map<string, SportsBingoSquareTemplate[]>();
  for (const row of rows) {
    const playerObj = asRecord(row.player);
    const playerId = Number(playerObj.id ?? row.player_id ?? 0);
    const playerName = `${String(playerObj.first_name ?? "").trim()} ${String(playerObj.last_name ?? "").trim()}`.trim();
    if (!playerName) {
      continue;
    }
    const marketKey = String(row.market_key ?? row.market ?? row.prop_type ?? "").trim();
    if (!marketKey || !MLB_SETTLABLE_PLAYER_PROP_MARKETS.has(marketKey)) {
      continue;
    }
    const rawLine = Number.parseFloat(String(row.line ?? row.prop_line ?? row.value ?? ""));
    if (!Number.isFinite(rawLine)) {
      continue;
    }
    const line = roundLine(rawLine);
    if (!Number.isFinite(line) || line <= 0) {
      continue;
    }
    const playerRef = toResolverPlayerRef(playerName, Number.isFinite(playerId) && playerId > 0 ? playerId : null);
    const overResolver: SportsBingoResolver = {
      kind: "player_prop",
      marketKey,
      player: playerRef,
      line,
      direction: "over",
    };
    const underResolver: SportsBingoResolver = {
      kind: "player_prop",
      marketKey,
      player: playerRef,
      line,
      direction: "under",
    };

    const overOddsProb = impliedProbabilityFromAmericanOdds(row.over_odds ?? row.odds_over ?? row.over);
    const underOddsProb = impliedProbabilityFromAmericanOdds(row.under_odds ?? row.odds_under ?? row.under);
    const fallbackOver = defaultMlbOverProbability(marketKey, line);
    const overProbability = clamp(overOddsProb ?? fallbackOver, 0.05, 0.95);
    const underProbability = clamp(underOddsProb ?? 1 - overProbability, 0.05, 0.95);

    const overTemplate: SportsBingoSquareTemplate = {
      key: resolverKey(overResolver),
      label: buildSquareLabel(game, overResolver),
      resolver: overResolver,
      probability: overProbability,
      bucket: "player-prop",
      supportLevel: "supported",
    };
    const underTemplate: SportsBingoSquareTemplate = {
      key: resolverKey(underResolver),
      label: buildSquareLabel(game, underResolver),
      resolver: underResolver,
      probability: underProbability,
      bucket: "player-prop",
      supportLevel: "supported",
    };
    const axisKey = `${marketKey}|${normalizeNameKey(playerRef)}|${line.toFixed(1)}`;
    const existing = byAxis.get(axisKey) ?? [];
    existing.push(overTemplate, underTemplate);
    byAxis.set(axisKey, existing);
  }

  const selected: SportsBingoSquareTemplate[] = [];
  const achievementCandidates: SportsBingoSquareTemplate[] = [];
  for (const templates of byAxis.values()) {
    const overCandidate = templates.find(
      (item) => item.resolver.kind === "player_prop" && item.resolver.direction === "over"
    );
    if (overCandidate && overCandidate.resolver.kind === "player_prop") {
      const achievement = toMlbPlayerAchievementCandidate(
        game,
        overCandidate.resolver,
        overCandidate.probability
      );
      if (achievement) {
        achievementCandidates.push(achievement);
      }
    }
    templates.sort((a, b) => Math.abs(a.probability - 0.5) - Math.abs(b.probability - 0.5));
    const best = templates[0];
    if (best) {
      selected.push(best);
    }
  }

  const parsed = aggregateCandidates(selected)
    .filter((candidate) => candidate.probability >= 0.25)
    .sort((a, b) => a.key.localeCompare(b.key));
  if (parsed.length > 0) {
    return aggregateCandidates([...parsed, ...achievementCandidates])
      .filter((candidate) => {
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
      })
      .sort((a, b) => a.key.localeCompare(b.key));
  }
  return buildMLBPlayerPropCandidatesFromRecentStats(game);
}

function estimateBoardWinProbability(squares: Array<{ index: number; probability: number; isFree: boolean }>): number {
  const trials = Math.max(500, Math.min(12_000, BOARD_SIMULATION_TRIALS));
  let wins = 0;

  const lookupByIndex = new Map<number, { probability: number; isFree: boolean }>();
  for (const square of squares) {
    lookupByIndex.set(square.index, {
      probability: clamp(square.probability, 0, 1),
      isFree: square.isFree,
    });
  }

  for (let trial = 0; trial < trials; trial += 1) {
    const hits = new Array<boolean>(25).fill(false);
    for (let index = 0; index < 25; index += 1) {
      const square = lookupByIndex.get(index);
      if (!square) {
        continue;
      }
      if (square.isFree) {
        hits[index] = true;
      } else {
        hits[index] = Math.random() < square.probability;
      }
    }

    const hasLine = LINE_PATTERNS.some((line) => line.every((index) => hits[index]));
    if (hasLine) {
      wins += 1;
    }
  }

  return wins / trials;
}

function estimateBoardWinProbabilityWithTrials(
  squares: Array<{ index: number; probability: number; isFree: boolean }>,
  requestedTrials: number
): number {
  const trials = Math.max(500, Math.min(12_000, Math.floor(requestedTrials)));
  let wins = 0;

  const lookupByIndex = new Map<number, { probability: number; isFree: boolean }>();
  for (const square of squares) {
    lookupByIndex.set(square.index, {
      probability: clamp(square.probability, 0, 1),
      isFree: square.isFree,
    });
  }

  for (let trial = 0; trial < trials; trial += 1) {
    const hits = new Array<boolean>(25).fill(false);
    for (let index = 0; index < 25; index += 1) {
      const square = lookupByIndex.get(index);
      if (!square) {
        continue;
      }
      if (square.isFree) {
        hits[index] = true;
      } else {
        hits[index] = Math.random() < square.probability;
      }
    }

    const hasLine = LINE_PATTERNS.some((line) => line.every((index) => hits[index]));
    if (hasLine) {
      wins += 1;
    }
  }

  return wins / trials;
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
    default:
      return "";
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

function pickCandidateSet(candidates: SportsBingoSquareTemplate[], sportKey: string): SportsBingoSquareTemplate[] {
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

  const tryAdd = (candidate: SportsBingoSquareTemplate): boolean => {
    if (selected.length >= 24 || selectedKeys.has(candidate.key)) {
      reject("full_or_duplicate_key");
      return false;
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
    selected.push(candidate);
    selectedKeys.add(candidate.key);
    return true;
  };

  const planByBucket: Array<[CandidateBucket, number]> = [
    ["moneyline", 2],
    ["spread", 4],
    ["total", 3],
    ["team-total", 3],
    ["special", isBasketballSportKey(sportKey) ? 1 : 0],
    ["achievement", isBasketballSportKey(sportKey) ? 5 : sportKey === "baseball_mlb" ? 4 : 0],
  ];

  for (const [bucket, desired] of planByBucket) {
    if (desired <= 0) {
      continue;
    }
    const pool = shuffle(grouped[bucket]);
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
  const playerPropPool = shuffle(grouped["player-prop"]);
  let selectedPlayerProps = 0;
  const rejectedPlayerPropKeys = new Set<string>();

  if (isBasketballSportKey(sportKey)) {
    const playerAchievementPool = shuffle(grouped.achievement.filter((item) => isPlayerSpecificAchievementResolver(item.resolver)));
    let added = 0;
    for (const candidate of playerAchievementPool) {
      if (selected.length >= 24 || added >= 3) break;
      if (tryAdd(candidate)) added += 1;
    }
  }

  if (sportKey === "baseball_mlb") {
    const playerAchievementPool = shuffle(
      grouped.achievement.filter(
        (item) =>
          item.resolver.kind === "mlb_webhook_player_event_at_least" ||
          item.resolver.kind === "mlb_webhook_player_event_at_most"
      )
    );
    const namedPlayerPool = playerAchievementPool.filter((item) => isMlbNamedPlayerSquare(item));
    const fallbackEventPool = shuffle(candidates.filter((item) => isMlbFallbackEventSquare(item)));

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

    while (selected.length < 24 && addedNamed < weightedNamedTarget) {
      const availableNamed = namedPlayerPool.filter((item) => !selectedKeys.has(item.key));
      if (availableNamed.length === 0) {
        break;
      }
      const nextNamed = takeWeightedCandidate(availableNamed, (item) => {
        const base = clamp(item.probability, 0.05, 0.95);
        const supportBoost = item.supportLevel === "supported" ? 1.25 : 1;
        const starBoost = item.key.startsWith("mlb_star_hr:") ? 1.45 : 1;
        return base * supportBoost * starBoost;
      });
      if (!nextNamed) {
        break;
      }
      if (tryAdd(nextNamed)) {
        addedNamed += 1;
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

  while (selected.length < 24 && selectedPlayerProps < desiredPlayerPropCount) {
    const preferred = playerPropPool.find((candidate) => {
      if (selectedKeys.has(candidate.key) || rejectedPlayerPropKeys.has(candidate.key)) {
        return false;
      }
      const marketKey = getPlayerPropMarketKey(candidate);
      if (!marketKey) {
        return false;
      }
      return (playerPropMarketCounts.get(marketKey) ?? 0) < 2;
    });

    const fallback = playerPropPool.find(
      (candidate) => !selectedKeys.has(candidate.key) && !rejectedPlayerPropKeys.has(candidate.key)
    );
    const next = preferred ?? fallback;
    if (!next) {
      break;
    }
    if (tryAdd(next)) {
      selectedPlayerProps += 1;
    } else {
      rejectedPlayerPropKeys.add(next.key);
    }
  }

  if (selected.length < 24) {
    const fallbackPool = shuffle(candidates);
    for (const candidate of fallbackPool) {
      if (selected.length >= 24) {
        break;
      }
      tryAdd(candidate);
    }
  }

  if (selected.length < 24) {
    throw new Error("Not enough candidate squares are available for this game.");
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

function arrangeBoardSquaresForFeasibleLines(
  selected: SportsBingoSquareTemplate[],
  maxArrangements = 120
): InternalBoardSquare[] | null {
  for (let attempt = 0; attempt < maxArrangements; attempt += 1) {
    const arrangement = buildBoardSquares(shuffle(selected));
    if (boardHasTheoreticallyPossibleLines(arrangement)) {
      return arrangement;
    }
  }

  return null;
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
    previewSquares.map((square) => ({
      index: square.index,
      probability: square.probability,
      isFree: square.isFree,
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

  for (let attempt = 0; attempt < 180; attempt += 1) {
    const picked = pickCandidateSet(candidates, game.sportKey);
    const boardSquares = arrangeBoardSquaresForFeasibleLines(picked);
    if (!boardSquares) {
      continue;
    }

    const preview = buildBoardPreview(game, boardSquares, simulationTrials);
    const delta = Math.abs(preview.boardProbability - target);

    if (!best || delta < bestDelta) {
      best = preview;
      bestDelta = delta;
    }

    if (delta <= tolerance) {
      break;
    }
  }

  if (!best) {
    throw new Error("Unable to generate a bingo board for this game.");
  }

  return best;
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
    default:
      return null;
  }
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
}): Promise<Array<{ card: SportsBingoCardRow; squares: SportsBingoSquareRow[] }>> {
  assertSupabaseConfigured();

  let query = supabaseAdmin!
    .from("sports_bingo_cards")
    .select(
      "id, user_id, venue_id, game_id, game_label, sport_key, home_team, away_team, starts_at, status, board_probability, reward_points, reward_claimed_at, near_win_notified_at, won_notified_at, won_line, settled_at, created_at"
    )
    .order("created_at", { ascending: false })
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

function evaluateResolver(
  resolver: SportsBingoResolver,
  snapshot: ScoreSnapshot,
  nbaStatsSnapshot: NBAGamePlayerStatsSnapshot | null = null,
  mlbStatsSnapshot: MLBGamePlayerStatsSnapshot | null = null
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
        return { status: "miss", resolved: true };
      }

      const nbaLine = isNba && nbaStatsSnapshot ? findNBAPlayerStatLine(nbaStatsSnapshot, resolver.player) : null;
      const mlbLine = isMlb && mlbStatsSnapshot ? findMLBPlayerStatLine(mlbStatsSnapshot, resolver.player) : null;
      const isFinalized = Boolean((isNba && nbaStatsSnapshot?.finalized) || (isMlb && mlbStatsSnapshot?.finalized));
      if (!nbaLine && !mlbLine) {
        if (!completed && !isFinalized) {
          return { status: "pending", resolved: false };
        }
        return { status: "miss", resolved: true };
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
        return { status: "miss", resolved: true };
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
        return { status: "miss", resolved: true };
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
        return { status: "miss", resolved: true };
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
        return { status: "miss", resolved: true };
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
        return { status: "miss", resolved: true };
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
        return { status: "miss", resolved: true };
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
        return { status: "miss", resolved: true };
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
        return { status: "miss", resolved: true };
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
        return { status: "miss", resolved: true };
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
        return { status: "miss", resolved: true };
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
        return { status: "miss", resolved: true };
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
        return { status: "miss", resolved: true };
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
        return { status: "miss", resolved: true };
      }
      const agg = buildNBATeamAggregates(nbaStatsSnapshot, resolver.team);
      if (agg.doubleDoubleCount >= 1) return { status: "hit", resolved: true };
      if (completed || nbaStatsSnapshot.finalized) return { status: "miss", resolved: true };
      return { status: "pending", resolved: false };
    }
    case "nba_team_three_pt_scorers": {
      if (!nbaStatsSnapshot) {
        if (!completed) return { status: "pending", resolved: false };
        return { status: "miss", resolved: true };
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
        return { status: "miss", resolved: true };
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
        return { status: "miss", resolved: true };
      }
      if (!completed && !nbaStatsSnapshot.finalized) return { status: "pending", resolved: false };
      const teamAgg = buildNBATeamAggregates(nbaStatsSnapshot, resolver.team);
      const oppSide: TeamSide = resolver.team === "home" ? "away" : "home";
      const oppAgg = buildNBATeamAggregates(nbaStatsSnapshot, oppSide);
      return { status: teamAgg.totalRebounds > oppAgg.totalRebounds ? "hit" : "miss", resolved: true };
    }
    case "nba_player_bench_scores": {
      if (!nbaStatsSnapshot) return completed ? { status: "miss", resolved: true } : { status: "pending", resolved: false };
      const playerId = resolveSnapshotPlayerId(nbaStatsSnapshot, resolver.player);
      if (!playerId) return completed ? { status: "miss", resolved: true } : { status: "pending", resolved: false };
      const lineup = nbaStatsSnapshot.lineupByPlayerId.get(playerId);
      if (!lineup || lineup.starter) return { status: "miss", resolved: true };
      const line = findNBAPlayerStatLine(nbaStatsSnapshot, resolver.player);
      if (!line) return completed ? { status: "miss", resolved: true } : { status: "pending", resolved: false };
      if (line.pts >= resolver.threshold) return { status: "hit", resolved: true };
      if (completed || nbaStatsSnapshot.finalized) return { status: "miss", resolved: true };
      return { status: "pending", resolved: false };
    }
    case "nba_team_scores_first": {
      if (!nbaStatsSnapshot) return completed ? { status: "miss", resolved: true } : { status: "pending", resolved: false };
      if (!nbaStatsSnapshot.firstScoringTeam) {
        if (completed || nbaStatsSnapshot.finalized) return { status: "miss", resolved: true };
        return { status: "pending", resolved: false };
      }
      return { status: nbaStatsSnapshot.firstScoringTeam === resolver.team ? "hit" : "miss", resolved: true };
    }
    case "nba_team_leads_at_halftime": {
      if (!nbaStatsSnapshot) return completed ? { status: "miss", resolved: true } : { status: "pending", resolved: false };
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
      if (!nbaStatsSnapshot) return completed ? { status: "miss", resolved: true } : { status: "pending", resolved: false };
      const maxPoints = resolver.team === "home" ? nbaStatsSnapshot.homeMaxQuarterPoints : nbaStatsSnapshot.awayMaxQuarterPoints;
      if (maxPoints >= resolver.threshold) return { status: "hit", resolved: true };
      if (completed || nbaStatsSnapshot.finalized) return { status: "miss", resolved: true };
      return { status: "pending", resolved: false };
    }
    case "nba_player_points_first_half_at_least": {
      if (!nbaStatsSnapshot) return completed ? { status: "miss", resolved: true } : { status: "pending", resolved: false };
      const playerId = resolveSnapshotPlayerId(nbaStatsSnapshot, resolver.player);
      if (!playerId) return completed ? { status: "miss", resolved: true } : { status: "pending", resolved: false };
      const agg = nbaStatsSnapshot.firstHalfByPlayerId.get(playerId);
      const pts = agg?.pts ?? 0;
      if (pts >= resolver.threshold) return { status: "hit", resolved: true };
      if (completed || nbaStatsSnapshot.finalized) return { status: "miss", resolved: true };
      return { status: "pending", resolved: false };
    }
    case "nba_player_assists_in_any_quarter_at_least": {
      if (!nbaStatsSnapshot) return completed ? { status: "miss", resolved: true } : { status: "pending", resolved: false };
      const playerId = resolveSnapshotPlayerId(nbaStatsSnapshot, resolver.player);
      if (!playerId) return completed ? { status: "miss", resolved: true } : { status: "pending", resolved: false };
      const maxAst = nbaStatsSnapshot.maxQuarterAssistsByPlayerId.get(playerId) ?? 0;
      if (maxAst >= resolver.threshold) return { status: "hit", resolved: true };
      if (completed || nbaStatsSnapshot.finalized) return { status: "miss", resolved: true };
      return { status: "pending", resolved: false };
    }
    case "nba_player_steals_first_half_at_least": {
      if (!nbaStatsSnapshot) return completed ? { status: "miss", resolved: true } : { status: "pending", resolved: false };
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
    default:
      return { status: "void", resolved: true };
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

function isResolverEligibleForVoidRegrade(resolver: SportsBingoResolver): boolean {
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

  const sportPathByKey: Record<string, string> = {
    basketball_nba: "/nba/v1/games",
    basketball_wnba: "/wnba/v1/games",
    americanfootball_nfl: "/nfl/v1/games",
    baseball_mlb: "/mlb/v1/games",
    icehockey_nhl: "/nhl/v1/games",
    soccer_usa_mls: "/mls/v1/games",
    soccer_epl: "/epl/v1/games",
    soccer_spain_la_liga: "/laliga/v1/games",
    soccer_italy_serie_a: "/seriea/v1/games",
    soccer_germany_bundesliga: "/bundesliga/v1/games",
    soccer_uefa_champs_league: "/ucl/v1/games",
  };
  const path = sportPathByKey[sportKey];
  if (!path) {
    return new Map<string, ScoreSnapshot>();
  }

  const start = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const query = new URLSearchParams({ start_date: start, end_date: end, per_page: "100" });
  const payload = await fetchBallDontLieList<BallDontLieGame>(path, query);

  const byGameId = new Map<string, ScoreSnapshot>();
  for (const event of payload) {
    const gameId = String(event.id ?? "").trim();
    const homeTeam = String(event.home_team?.full_name ?? event.home_team?.name ?? "").trim();
    const awayTeam = String(event.visitor_team?.full_name ?? event.visitor_team?.name ?? "").trim();
    if (!gameId || !homeTeam || !awayTeam) {
      continue;
    }

    const homeScore = parseScoreValue(event.home_team_score);
    const awayScore = parseScoreValue(event.visitor_team_score);
    const status = String(event.status ?? "").toLowerCase();

    byGameId.set(gameId, {
      gameId,
      sportKey: sportKey,
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      completed: status.includes("final") || status.includes("ft"),
    });
  }

  scoreCache.set(sportKey, {
    byGameId,
    expiresAt: now + SCORE_CACHE_MS,
  });

  return byGameId;
}

function summarizeCard(card: SportsBingoCard): {
  hits: number;
  misses: number;
  pending: number;
} {
  let hits = 0;
  let misses = 0;
  let pending = 0;
  for (const square of card.squares) {
    if (square.isFree || square.status === "hit") {
      hits += 1;
    } else if (square.status === "miss") {
      misses += 1;
    } else {
      pending += 1;
    }
  }
  return { hits, misses, pending };
}

async function loadUserPoints(userId: string): Promise<number> {
  const { data } = await supabaseAdmin!
    .from("users")
    .select("points")
    .eq("id", userId)
    .maybeSingle<{ points: number }>();
  return Number(data?.points ?? 0);
}

async function addNotification(userId: string, type: "success" | "warning" | "info", message: string): Promise<void> {
  await supabaseAdmin!.from("notifications").insert({
    user_id: userId,
    type,
    message,
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
  const nbaStatsSnapshotsByOddsGameId = new Map<string, NBAGamePlayerStatsSnapshot | null>();
  const mlbStatsSnapshotsByOddsGameId = new Map<string, MLBGamePlayerStatsSnapshot | null>();

  for (const entry of activeCardRows) {
    const cardRow = entry.card;
    let squares = [...entry.squares];
    const oddsScore = scoresBySport.get(cardRow.sport_key)?.get(cardRow.game_id) ?? null;

    let nbaStatsSnapshot: NBAGamePlayerStatsSnapshot | null = null;
    let mlbStatsSnapshot: MLBGamePlayerStatsSnapshot | null = null;
    if (isBasketballSportKey(cardRow.sport_key)) {
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

    const startsAtMs = Date.parse(cardRow.starts_at);
    const isPastForceFinalizeWindow =
      Number.isFinite(startsAtMs) && Date.now() - startsAtMs >= BINGO_FORCE_FINALIZE_AFTER_START_MS;
    const score = mergeLiveScores(
      mergeLiveScores(oddsScore, toNBALiveScoreSnapshot(cardRow, nbaStatsSnapshot)),
      toMLBLiveScoreSnapshot(cardRow, mlbStatsSnapshot)
    );
    if (!score && !isPastForceFinalizeWindow) {
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

      const evaluation = evaluateResolver(resolver, effectiveScore, nbaStatsSnapshot, mlbStatsSnapshot);
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
          "info",
          `Bingo in ${cardRow.game_label}! Claim ${cardRow.reward_points} points from Bingo Home.`
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
}): Promise<SportsBingoCard[]> {
  const userId = params.userId.trim();
  if (!userId) {
    return [];
  }

  if (params.refreshProgress !== false) {
    await refreshSportsBingoProgress({ userId, limit: 50 });
  }

  const rows = await listCardRows({ userId, activeOnly: false, limit: 100 });
  const cards = rows.map((entry) => mapCardRow(entry.card, entry.squares));

  if (params.includeSettled) {
    return cards;
  }

  return cards.filter((card) => card.status === "active");
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

  const boardProbability = estimateBoardWinProbability(
    boardSquares.map((square) => ({
      index: square.index,
      probability: square.template?.probability ?? 1,
      isFree: square.isFree,
    }))
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

  await addNotification(
    userId,
    "success",
    `Bingo payout claimed: You won ${rewardPoints} points in ${claimedCard.game_label}.`
  );

  return {
    cardId: claimedCard.id,
    rewardPoints,
  };
}
