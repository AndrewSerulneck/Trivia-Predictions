import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiSportsGet } from "@/lib/apisports";

const ODDS_API_BASE_URL = process.env.ODDS_API_BASE_URL ?? "https://api.the-odds-api.com/v4";
const ODDS_API_KEY = process.env.ODDS_API_KEY?.trim() ?? "";
const BALLDONTLIE_API_BASE_URL = process.env.BALLDONTLIE_API_BASE_URL ?? "https://api.balldontlie.io";
const BALLDONTLIE_API_KEY = process.env.BALLDONTLIE_API_KEY?.trim() ?? "";
const APISPORTS_API_KEY = process.env.APISPORTS_API_KEY?.trim() ?? "";
const APISPORTS_NBA_BASE_URL = process.env.APISPORTS_NBA_BASE_URL?.trim() ?? "";
const DEFAULT_SPORT_KEY = "basketball_nba";
const BINGO_REWARD_POINTS = Number.parseInt(process.env.BINGO_REWARD_POINTS ?? "100", 10);
const BOARD_TARGET_WIN_RATE = Number.parseFloat(process.env.BINGO_BOARD_TARGET_WIN_RATE ?? "0.20");
const BOARD_TARGET_TOLERANCE = Number.parseFloat(process.env.BINGO_BOARD_TARGET_TOLERANCE ?? "0.04");
const BOARD_SIMULATION_TRIALS = Number.parseInt(process.env.BINGO_BOARD_SIM_TRIALS ?? "2500", 10);
const MAX_ACTIVE_CARDS_PER_USER = 4;
const GAME_CATALOG_CACHE_MS = 30_000;
const PLAYER_PROPS_CACHE_MS = 10 * 60 * 1000;
const SCORE_CACHE_MS = 15_000;
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
const ODDS_LOOKAHEAD_HOURS = 36;
const PLAYER_PROP_REGION_FALLBACKS = ["us", "us,eu,uk"] as const;
const SPORTS_BINGO_MIGRATION_REQUIRED_ERROR =
  "Sports Bingo tables are not installed in this Supabase project yet. Run migration supabase/migrations/20260420113000_add_sports_bingo_tables.sql.";

const PLAYER_PROP_MARKETS_BY_SPORT: Record<string, readonly string[]> = {
  basketball_nba: [
    "player_points",
    "player_rebounds",
    "player_assists",
    "player_threes",
    "player_blocks",
    "player_steals",
    "player_turnovers",
  ],
  americanfootball_nfl: [
    "player_pass_tds",
    "player_pass_yds",
    "player_pass_attempts",
    "player_pass_completions",
    "player_pass_interceptions",
    "player_rush_yds",
    "player_rush_attempts",
    "player_rush_tds",
    "player_receptions",
    "player_reception_yds",
    "player_reception_tds",
  ],
  baseball_mlb: [
    "player_hits",
    "player_home_runs",
    "player_rbis",
    "player_runs",
    "player_stolen_bases",
    "player_strikeouts_pitcher",
    "player_earned_runs",
    "player_pitcher_outs",
  ],
};

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
  | { kind: "nba_team_has_double_double"; team: TeamSide }
  | { kind: "nba_team_three_pt_scorers"; team: TeamSide; threshold: number }
  | { kind: "nba_team_turnovers_at_most"; team: TeamSide; threshold: number }
  | { kind: "nba_team_outrebounds"; team: TeamSide }
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
  status: SquareStatus;
  created_at: string;
  resolved_at: string | null;
};

type OddsEvent = {
  id?: string;
  commence_time?: string;
  home_team?: string;
  away_team?: string;
  bookmakers?: Array<{
    markets?: Array<{
      key?: string;
      outcomes?: Array<{
        name?: string;
        description?: string;
        price?: number | string;
        point?: number | string;
      }>;
    }>;
  }>;
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

type OddsScoreEvent = {
  id?: string;
  sport_key?: string;
  completed?: boolean;
  home_team?: string;
  away_team?: string;
  scores?: Array<{
    name?: string;
    score?: number | string | null;
  }>;
};

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
  full_name?: string;
  name?: string;
  city?: string;
};

type BallDontLieGame = {
  id?: number;
  status?: string;
  datetime?: string;
  date?: string;
  home_team_score?: number | string | null;
  visitor_team_score?: number | string | null;
  home_team?: BallDontLieTeam;
  visitor_team?: BallDontLieTeam;
};

type BallDontLiePlayer = {
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
  player?: BallDontLiePlayer;
  team?: BallDontLieTeam;
  game?: BallDontLieGame;
};

type BallDontLieListResponse<T> = {
  data?: T[];
  meta?: {
    next_cursor?: number | null;
  };
};

type ApiSportsNbaGame = Record<string, unknown>;
type ApiSportsNbaPlayerStat = Record<string, unknown>;

type NBAPlayerStatLine = {
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
};

type GameCatalogEntry = {
  game: SportsBingoGame;
  candidates: SportsBingoSquareTemplate[];
};

type CatalogCacheEntry = {
  expiresAt: number;
  entries: GameCatalogEntry[];
};

type PlayerPropsCacheEntry = {
  expiresAt: number;
  candidates: SportsBingoSquareTemplate[];
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
let playerPropsCache = new Map<string, PlayerPropsCacheEntry>();
let scoreCache = new Map<string, { expiresAt: number; byGameId: Map<string, ScoreSnapshot> }>();
let nbaPlayerStatsCache = new Map<string, { expiresAt: number; snapshot: NBAGamePlayerStatsSnapshot | null }>();

function assertSupabaseConfigured(): void {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }
}

function assertOddsConfigured(): void {
  if (!ODDS_API_KEY) {
    throw new Error("ODDS_API_KEY is not configured.");
  }
}

function isBallDontLieConfigured(): boolean {
  return Boolean(BALLDONTLIE_API_KEY);
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

function inferTeamSide(name: string, homeTeam: string, awayTeam: string): TeamSide | null {
  const normalized = normalizeTeamKey(name);
  if (!normalized) {
    return null;
  }
  if (normalizeTeamKey(homeTeam) === normalized) {
    return "home";
  }
  if (normalizeTeamKey(awayTeam) === normalized) {
    return "away";
  }
  return null;
}

function impliedProbabilityFromAmericanOdds(odds: number): number | null {
  if (!Number.isFinite(odds) || odds === 0) {
    return null;
  }
  if (odds < 0) {
    return (-odds / (-odds + 100));
  }
  return (100 / (odds + 100));
}

function parseAmericanOdds(value: unknown): number | null {
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

function parseLineValue(value: unknown): number | null {
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

function isApiSportsConfigured(): boolean {
  return Boolean(APISPORTS_API_KEY && APISPORTS_NBA_BASE_URL);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getPath(value: unknown, path: string[]): unknown {
  let cursor: unknown = value;
  for (const segment of path) {
    const record = asRecord(cursor);
    cursor = record[segment];
    if (cursor === undefined || cursor === null) {
      return cursor;
    }
  }
  return cursor;
}

function parseApiSportsResponseRows(payload: unknown): Record<string, unknown>[] {
  const response = getPath(payload, ["response"]);
  if (!Array.isArray(response)) {
    return [];
  }
  return response.map((row) => asRecord(row));
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
    case "nba_team_has_double_double":
      return `nba_team_has_double_double:${resolver.team}`;
    case "nba_team_three_pt_scorers":
      return `nba_team_three_pt_scorers:${resolver.team}:${resolver.threshold.toFixed(1)}`;
    case "nba_team_turnovers_at_most":
      return `nba_team_turnovers_at_most:${resolver.team}:${resolver.threshold.toFixed(1)}`;
    case "nba_team_outrebounds":
      return `nba_team_outrebounds:${resolver.team}`;
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
      return `${team} win by ${formatLine(resolver.line)}+ points.`;
    }
    case "spread_keep_close": {
      const team = teamForSide(resolver.team);
      return `${team} win or lose by less than ${formatLine(resolver.line)} points.`;
    }
    case "game_total_over":
      return `Total points: over ${formatLine(resolver.line)}.`;
    case "game_total_under":
      return `Total points: under ${formatLine(resolver.line)}.`;
    case "team_total_over": {
      const team = teamForSide(resolver.team);
      return `${team}: over ${formatLine(resolver.line)} points.`;
    }
    case "team_total_under": {
      const team = teamForSide(resolver.team);
      return `${team}: under ${formatLine(resolver.line)} points.`;
    }
    case "player_prop": {
      const unit = playerPropUnitLabel(resolver.marketKey);
      if (resolver.direction === "under" && Math.abs(resolver.line - 0.5) < 1e-9) {
        return `${resolver.player}: 0 ${pluralizeUnit(unit, 0)}.`;
      }
      if (resolver.direction === "over" && isHalfLine(resolver.line)) {
        const threshold = Math.floor(resolver.line) + 1;
        return `${resolver.player}: at least ${formatQuantity(threshold)} ${pluralizeUnit(unit, threshold)}.`;
      }
      const directionText = resolver.direction === "over" ? "over" : "under";
      return `${resolver.player}: ${directionText} ${formatLine(resolver.line)} ${pluralizeUnit(unit, resolver.line)}.`;
    }
    case "nba_player_stat_at_least": {
      const statLabel = NBA_PLAYER_MILESTONE_METRIC_LABELS[resolver.metric] ?? "stat";
      const singularStatLabel = statLabel.endsWith("s") ? statLabel.slice(0, -1) : statLabel;
      return `${resolver.player}: at least ${formatQuantity(resolver.threshold)} ${pluralizeUnit(singularStatLabel, resolver.threshold)}.`;
    }
    case "nba_player_double_double":
      return `${resolver.player} records a double-double.`;
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
      return `${resolver.player} records a triple-double.`;
    case "nba_player_perfect_ft":
      return `${resolver.player}: perfect free throws (3+ att).`;
    case "nba_player_perfect_fg":
      return `${resolver.player}: perfect FG% (4+ att).`;
    case "nba_player_triple_threat":
      return `${resolver.player}: 5+ pts, 5+ reb, 5+ ast.`;
    case "nba_player_zero_turnovers":
      return `${resolver.player}: 0 turnovers.`;
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
    default:
      return "Sports Bingo square";
  }
}

async function fetchOddsJson(path: string, query: URLSearchParams): Promise<unknown> {
  assertOddsConfigured();
  const response = await fetch(`${ODDS_API_BASE_URL}${path}?${query.toString()}`, {
    method: "GET",
    next: { revalidate: 15 },
  });

  if (!response.ok) {
    throw new Error(`Sports Bingo odds request failed with status ${response.status}.`);
  }

  return response.json();
}

async function fetchBallDontLieJson(path: string, query: URLSearchParams): Promise<unknown> {
  if (!isBallDontLieConfigured()) {
    throw new Error("BALLDONTLIE_API_KEY is not configured.");
  }

  const response = await fetch(`${BALLDONTLIE_API_BASE_URL}${path}?${query.toString()}`, {
    method: "GET",
    headers: {
      Authorization: BALLDONTLIE_API_KEY,
    },
    next: { revalidate: 15 },
  });

  if (!response.ok) {
    throw new Error(`BallDontLie request failed with status ${response.status}.`);
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

function getApiSportsGameTimestamp(game: ApiSportsNbaGame): number {
  const candidates = [
    getPath(game, ["date", "start"]),
    getPath(game, ["date"]),
    getPath(game, ["datetime"]),
  ];
  for (const candidate of candidates) {
    const text = String(candidate ?? "").trim();
    if (!text) {
      continue;
    }
    const parsed = Date.parse(text);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return Number.POSITIVE_INFINITY;
}

function getApiSportsGameTeamName(game: ApiSportsNbaGame, side: TeamSide): string {
  const sideKey = side === "home" ? "home" : "away";
  const altSideKey = side === "home" ? "home" : "visitors";
  const candidates = [
    getPath(game, ["teams", sideKey, "name"]),
    getPath(game, ["teams", altSideKey, "name"]),
    getPath(game, [sideKey, "name"]),
  ];
  for (const candidate of candidates) {
    const name = String(candidate ?? "").trim();
    if (name) {
      return name;
    }
  }
  return "";
}

function getApiSportsGameId(game: ApiSportsNbaGame): string {
  return String(getPath(game, ["id"]) ?? "").trim();
}

function isApiSportsGameFinal(game: ApiSportsNbaGame): boolean {
  const statusText = String(getPath(game, ["status", "long"]) ?? getPath(game, ["status", "short"]) ?? "").trim().toLowerCase();
  return statusText.startsWith("final") || statusText === "ft" || statusText === "aot";
}

function pickBestMatchingApiSportsGame(card: SportsBingoCardRow, games: ApiSportsNbaGame[]): ApiSportsNbaGame | null {
  const matching = games.filter((game) => {
    const home = getApiSportsGameTeamName(game, "home");
    const away = getApiSportsGameTeamName(game, "away");
    return teamsMatch(home, card.home_team) && teamsMatch(away, card.away_team);
  });
  if (matching.length === 0) {
    return null;
  }

  const targetStart = Date.parse(card.starts_at);
  matching.sort((left, right) => {
    const leftDelta = Math.abs(getApiSportsGameTimestamp(left) - targetStart);
    const rightDelta = Math.abs(getApiSportsGameTimestamp(right) - targetStart);
    return leftDelta - rightDelta;
  });
  return matching[0] ?? null;
}

async function fetchApiSportsNbaGamesByDate(dateIso: string): Promise<ApiSportsNbaGame[]> {
  const result = await apiSportsGet(APISPORTS_NBA_BASE_URL, `/games?date=${encodeURIComponent(dateIso)}`, APISPORTS_API_KEY);
  if (!result.ok) {
    return [];
  }
  return parseApiSportsResponseRows(result.json);
}

async function fetchApiSportsNbaPlayerStats(gameId: string): Promise<ApiSportsNbaPlayerStat[]> {
  const result = await apiSportsGet(
    APISPORTS_NBA_BASE_URL,
    `/players/statistics?game=${encodeURIComponent(gameId)}`,
    APISPORTS_API_KEY
  );
  if (!result.ok) {
    return [];
  }
  return parseApiSportsResponseRows(result.json);
}

function extractApiSportsPlayerName(row: ApiSportsNbaPlayerStat): string {
  const first = String(getPath(row, ["player", "firstname"]) ?? getPath(row, ["player", "first_name"]) ?? "").trim();
  const last = String(getPath(row, ["player", "lastname"]) ?? getPath(row, ["player", "last_name"]) ?? "").trim();
  const full = String(getPath(row, ["player", "name"]) ?? "").trim();
  const combined = `${first} ${last}`.trim();
  return combined || full;
}

function extractApiSportsPlayerTeamName(row: ApiSportsNbaPlayerStat): string {
  return String(getPath(row, ["team", "name"]) ?? "").trim();
}

function pickFirstFiniteStat(row: ApiSportsNbaPlayerStat, keys: string[]): number {
  for (const key of keys) {
    const value = parseStatNumber((row as Record<string, unknown>)[key]);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}

function buildNBAGamePlayerStatsSnapshotFromApiSports(
  card: SportsBingoCardRow,
  game: ApiSportsNbaGame,
  stats: ApiSportsNbaPlayerStat[]
): NBAGamePlayerStatsSnapshot {
  const lines: NBAPlayerStatLine[] = [];
  const byPlayerKey = new Map<string, NBAPlayerStatLine[]>();

  for (const raw of stats) {
    const row = asRecord(raw);
    const playerName = extractApiSportsPlayerName(row);
    if (!playerName) {
      continue;
    }

    const statLine: NBAPlayerStatLine = {
      playerName,
      teamSide: inferCardTeamSide(card, extractApiSportsPlayerTeamName(row)),
      pts: pickFirstFiniteStat(row, ["points", "pts"]),
      reb: pickFirstFiniteStat(row, ["totReb", "rebounds", "reb"]),
      ast: pickFirstFiniteStat(row, ["assists", "ast"]),
      stl: pickFirstFiniteStat(row, ["steals", "stl"]),
      blk: pickFirstFiniteStat(row, ["blocks", "blk"]),
      turnover: pickFirstFiniteStat(row, ["turnovers", "turnover", "to"]),
      threes: pickFirstFiniteStat(row, ["tpm", "fg3m", "threePointMade"]),
      fgm: pickFirstFiniteStat(row, ["fgm", "fieldGoalsMade"]),
      fga: pickFirstFiniteStat(row, ["fga", "fieldGoalsAttempted"]),
      ftm: pickFirstFiniteStat(row, ["ftm", "freeThrowsMade"]),
      fta: pickFirstFiniteStat(row, ["fta", "freeThrowsAttempted"]),
      oreb: pickFirstFiniteStat(row, ["offReb", "oreb"]),
      dreb: pickFirstFiniteStat(row, ["defReb", "dreb"]),
      minSeconds: parseMinutesString(String((row as Record<string, unknown>).min ?? "")),
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
    gameId: Number.parseInt(getApiSportsGameId(game), 10) || 0,
    finalized: isApiSportsGameFinal(game),
    homeScore: parseScoreValue(getPath(game, ["scores", "home", "points"]) ?? getPath(game, ["scores", "home", "total"])),
    awayScore: parseScoreValue(getPath(game, ["scores", "away", "points"]) ?? getPath(game, ["scores", "visitors", "points"]) ?? getPath(game, ["scores", "away", "total"])),
    lines,
    byPlayerKey,
    homeHasTripleDouble,
    awayHasTripleDouble,
    anyHasTripleDouble: homeHasTripleDouble || awayHasTripleDouble,
  };
}

async function getNBAGamePlayerStatsSnapshotFromApiSports(card: SportsBingoCardRow): Promise<NBAGamePlayerStatsSnapshot | null> {
  if (!isApiSportsConfigured()) {
    return null;
  }

  const startsAt = Date.parse(card.starts_at);
  if (!Number.isFinite(startsAt)) {
    return null;
  }
  const dates = [
    toIsoDate(new Date(startsAt - 24 * 60 * 60 * 1000).toISOString()),
    toIsoDate(new Date(startsAt).toISOString()),
    toIsoDate(new Date(startsAt + 24 * 60 * 60 * 1000).toISOString()),
  ];

  const games: ApiSportsNbaGame[] = [];
  for (const date of dates) {
    const rows = await fetchApiSportsNbaGamesByDate(date);
    for (const row of rows) {
      games.push(row);
    }
  }

  const matchedGame = pickBestMatchingApiSportsGame(card, games);
  if (!matchedGame) {
    return null;
  }

  const apiSportsGameId = getApiSportsGameId(matchedGame);
  if (!apiSportsGameId) {
    return null;
  }

  const stats = await fetchApiSportsNbaPlayerStats(apiSportsGameId);
  if (stats.length === 0) {
    return null;
  }

  return buildNBAGamePlayerStatsSnapshotFromApiSports(card, matchedGame, stats);
}

function buildNBAGamePlayerStatsSnapshot(card: SportsBingoCardRow, game: BallDontLieGame, stats: BallDontLieStat[]): NBAGamePlayerStatsSnapshot {
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
  };
}

async function getNBAGamePlayerStatsSnapshot(card: SportsBingoCardRow): Promise<NBAGamePlayerStatsSnapshot | null> {
  if (card.sport_key !== "basketball_nba") {
    return null;
  }

  const now = Date.now();
  const cached = nbaPlayerStatsCache.get(card.game_id);
  if (cached && now < cached.expiresAt) {
    return cached.snapshot;
  }

  try {
    const apiSportsSnapshot = await getNBAGamePlayerStatsSnapshotFromApiSports(card);
    if (apiSportsSnapshot) {
      nbaPlayerStatsCache.set(card.game_id, {
        snapshot: apiSportsSnapshot,
        expiresAt: now + NBA_PLAYER_STATS_CACHE_MS,
      });
      return apiSportsSnapshot;
    }

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
    const games = await fetchBallDontLieList<BallDontLieGame>("/nba/v1/games", gameQuery);
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
    const stats = await fetchBallDontLieList<BallDontLieStat>("/nba/v1/stats", statsQuery);
    const snapshot = buildNBAGamePlayerStatsSnapshot(card, matchedGame, stats);

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

function toNBALiveScoreSnapshot(card: SportsBingoCardRow, snapshot: NBAGamePlayerStatsSnapshot | null): ScoreSnapshot | null {
  if (card.sport_key !== "basketball_nba" || !snapshot) {
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
  const exact = snapshot.byPlayerKey.get(normalizeNameKey(playerName));
  if (exact && exact.length > 0) {
    return pickLikeliestPlayerStatLine(exact);
  }

  const targetTokens = tokenizeName(playerName);
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
      return line.minSeconds;
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

function normalizePlayerPropName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function getPlayerPropMarketsForSport(sportKey: string): readonly string[] {
  return PLAYER_PROP_MARKETS_BY_SPORT[sportKey] ?? [];
}

function parsePlayerPropCandidates(game: SportsBingoGame, eventOdds: OddsEvent): SportsBingoSquareTemplate[] {
  const grouped = new Map<
    string,
    {
      marketKey: string;
      player: string;
      line: number;
      overProbabilities: number[];
      underProbabilities: number[];
    }
  >();

  for (const bookmaker of eventOdds.bookmakers ?? []) {
    for (const market of bookmaker.markets ?? []) {
      const marketKey = String(market.key ?? "").trim();
      if (!(marketKey in PLAYER_PROP_MARKET_LABELS)) {
        continue;
      }

      const outcomes = market.outcomes ?? [];
      for (const outcome of outcomes) {
        const direction = String(outcome.name ?? "").trim().toLowerCase();
        if (direction !== "over" && direction !== "under") {
          continue;
        }

        const player = normalizePlayerPropName(String(outcome.description ?? ""));
        const line = parseLineValue(outcome.point);
        const price = parseAmericanOdds(outcome.price);
        const implied = price === null ? null : impliedProbabilityFromAmericanOdds(price);
        if (!player || line === null || implied === null) {
          continue;
        }

        const key = `${marketKey}|${player.toLowerCase()}|${roundLine(line).toFixed(1)}`;
        const existing = grouped.get(key) ?? {
          marketKey,
          player,
          line: roundLine(line),
          overProbabilities: [],
          underProbabilities: [],
        };

        if (direction === "over") {
          existing.overProbabilities.push(implied);
        } else {
          existing.underProbabilities.push(implied);
        }

        grouped.set(key, existing);
      }
    }
  }

  const templates: SportsBingoSquareTemplate[] = [];

  for (const value of grouped.values()) {
    const overRaw = average(value.overProbabilities, Number.NaN);
    const underRaw = average(value.underProbabilities, Number.NaN);
    if (!Number.isFinite(overRaw) || !Number.isFinite(underRaw)) {
      continue;
    }

    const total = overRaw + underRaw;
    if (total <= 0) {
      continue;
    }

    const overProbability = clamp(overRaw / total, 0.05, 0.95);
    const underProbability = clamp(underRaw / total, 0.05, 0.95);

    const overResolver: SportsBingoResolver = {
      kind: "player_prop",
      marketKey: value.marketKey,
      player: value.player,
      line: value.line,
      direction: "over",
    };
    templates.push({
      key: resolverKey(overResolver),
      label: buildSquareLabel(game, overResolver),
      resolver: overResolver,
      probability: overProbability,
      bucket: "player-prop",
      supportLevel: "supported",
    });

    const underResolver: SportsBingoResolver = {
      kind: "player_prop",
      marketKey: value.marketKey,
      player: value.player,
      line: value.line,
      direction: "under",
    };
    templates.push({
      key: resolverKey(underResolver),
      label: buildSquareLabel(game, underResolver),
      resolver: underResolver,
      probability: underProbability,
      bucket: "player-prop",
      supportLevel: "supported",
    });
  }

  return aggregateCandidates(templates).sort((a, b) => a.key.localeCompare(b.key));
}

type NBAPlayerPropReference = {
  player: string;
  markets: Map<string, { line: number; probability: number }>;
};

function buildNBAPlayerPropReference(candidates: SportsBingoSquareTemplate[]): NBAPlayerPropReference[] {
  const byPlayer = new Map<string, NBAPlayerPropReference>();

  for (const candidate of candidates) {
    if (candidate.resolver.kind !== "player_prop" || candidate.resolver.direction !== "over") {
      continue;
    }
    const player = candidate.resolver.player.trim();
    if (!player) {
      continue;
    }
    const playerKey = normalizeNameKey(player);
    if (!playerKey) {
      continue;
    }

    const existing = byPlayer.get(playerKey) ?? {
      player,
      markets: new Map<string, { line: number; probability: number }>(),
    };

    const marketKey = candidate.resolver.marketKey;
    const current = existing.markets.get(marketKey);
    const nextValue = {
      line: candidate.resolver.line,
      probability: clamp(candidate.probability, 0.05, 0.95),
    };

    if (!current || nextValue.probability > current.probability) {
      existing.markets.set(marketKey, nextValue);
    }
    byPlayer.set(playerKey, existing);
  }

  return [...byPlayer.values()];
}

function projectProbabilityFromLine(params: {
  reference?: { line: number; probability: number };
  threshold: number;
  scale: number;
  fallback: number;
}): number {
  const fallback = clamp(params.fallback, 0.05, 0.95);
  const reference = params.reference;
  if (!reference) {
    return fallback;
  }
  const baseline = clamp(reference.probability, 0.05, 0.95);
  const delta = (reference.line - params.threshold) / Math.max(0.35, params.scale);
  return clamp(sigmoid(logit(baseline) + delta), 0.05, 0.95);
}

function buildNBAAchievementCandidates(game: SportsBingoGame, candidates: SportsBingoSquareTemplate[]): SportsBingoSquareTemplate[] {
  const templates: SportsBingoSquareTemplate[] = [];
  const playerRefs = buildNBAPlayerPropReference(candidates);

  const rankedPlayers = playerRefs
    .map((item) => {
      const points = item.markets.get("player_points")?.probability ?? 0;
      const rebounds = item.markets.get("player_rebounds")?.probability ?? 0;
      const assists = item.markets.get("player_assists")?.probability ?? 0;
      const threes = item.markets.get("player_threes")?.probability ?? 0;
      const blocks = item.markets.get("player_blocks")?.probability ?? 0;
      const steals = item.markets.get("player_steals")?.probability ?? 0;
      const score = points * 1.8 + rebounds * 1.2 + assists * 1.2 + threes + blocks * 0.8 + steals * 0.8;
      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const pushPlayerTemplate = (
    resolver: SportsBingoResolver,
    probability: number,
    supportLevel: SquareSupportLevel
  ): void => {
    const baseLabel = buildSquareLabel(game, resolver);
    templates.push({
      key: resolverKey(resolver),
      label: supportTaggedLabel(baseLabel, supportLevel),
      resolver,
      probability: clamp(probability, 0.05, 0.95),
      bucket: "achievement",
      supportLevel,
    });
  };

  for (const player of rankedPlayers) {
    const points = player.markets.get("player_points");
    const rebounds = player.markets.get("player_rebounds");
    const assists = player.markets.get("player_assists");
    const threes = player.markets.get("player_threes");
    const blocks = player.markets.get("player_blocks");
    const steals = player.markets.get("player_steals");

    // Smart filter helpers: only generate a square if the player's market
    // line indicates the stat is actually within reach.
    const shootsThrees = threes && threes.line >= 0.5;
    const isRebounder = rebounds && rebounds.line >= 4.0;
    const isPlaymaker = assists && assists.line >= 4.5;
    const isShooter = points && points.line >= 12.0;
    const isShooterElite = points && points.line >= 18.0;
    const isShooterStar = points && points.line >= 22.0;
    const isBigMan = blocks && blocks.line >= 0.5;
    const isElitePlaymaker = assists && assists.line >= 7.5;

    // --- Common tier (prob ~0.65–0.88) ---
    pushPlayerTemplate(
      { kind: "nba_player_stat_at_least", player: player.player, metric: "points", threshold: 10 },
      projectProbabilityFromLine({ reference: points, threshold: 10, scale: 7.2, fallback: 0.64 }),
      "supported"
    );
    pushPlayerTemplate(
      { kind: "nba_player_stat_at_least", player: player.player, metric: "steals", threshold: 1 },
      projectProbabilityFromLine({ reference: steals, threshold: 1, scale: 0.8, fallback: 0.31 }),
      "supported"
    );
    pushPlayerTemplate(
      { kind: "nba_player_stat_at_least", player: player.player, metric: "blocks", threshold: 1 },
      projectProbabilityFromLine({ reference: blocks, threshold: 1, scale: 0.7, fallback: 0.28 }),
      "supported"
    );

    // Only assign assist/rebound common squares to eligible players.
    if (isPlaymaker) {
      pushPlayerTemplate(
        { kind: "nba_player_stat_at_least", player: player.player, metric: "assists", threshold: 1 },
        projectProbabilityFromLine({ reference: assists, threshold: 1, scale: 2.8, fallback: 0.72 }),
        "supported"
      );
    }
    if (isRebounder) {
      pushPlayerTemplate(
        { kind: "nba_player_stat_at_least", player: player.player, metric: "rebounds", threshold: 5 },
        projectProbabilityFromLine({ reference: rebounds, threshold: 5, scale: 3.6, fallback: 0.49 }),
        "supported"
      );
    }
    // Only assign 3-pointer squares to players who actually shoot threes.
    if (shootsThrees) {
      pushPlayerTemplate(
        { kind: "nba_player_stat_at_least", player: player.player, metric: "threes", threshold: 1 },
        projectProbabilityFromLine({ reference: threes, threshold: 1, scale: 0.9, fallback: 0.58 }),
        "supported"
      );
      pushPlayerTemplate(
        { kind: "nba_player_stat_at_least", player: player.player, metric: "threes", threshold: 3 },
        projectProbabilityFromLine({ reference: threes, threshold: 3, scale: 0.9, fallback: 0.26 }),
        "supported"
      );
    }

    // --- Moderate tier (prob ~0.30–0.55) ---
    pushPlayerTemplate(
      { kind: "nba_player_stat_at_least", player: player.player, metric: "points", threshold: 20 },
      projectProbabilityFromLine({ reference: points, threshold: 20, scale: 7.2, fallback: 0.44 }),
      "supported"
    );
    if (isPlaymaker) {
      pushPlayerTemplate(
        { kind: "nba_player_stat_at_least", player: player.player, metric: "assists", threshold: 5 },
        projectProbabilityFromLine({ reference: assists, threshold: 5, scale: 3.2, fallback: 0.42 }),
        "supported"
      );
    }
    if (isRebounder) {
      pushPlayerTemplate(
        { kind: "nba_player_stat_at_least", player: player.player, metric: "defensive_rebounds", threshold: 5 },
        projectProbabilityFromLine({ reference: rebounds, threshold: 6.5, scale: 3.2, fallback: 0.33 }),
        "supported"
      );
      pushPlayerTemplate(
        { kind: "nba_player_stat_at_least", player: player.player, metric: "offensive_rebounds", threshold: 1 },
        projectProbabilityFromLine({ reference: rebounds, threshold: 1.25, scale: 3.8, fallback: 0.35 }),
        "supported"
      );
    }
    if (isShooter) {
      pushPlayerTemplate(
        { kind: "nba_player_stat_at_least", player: player.player, metric: "two_point_fg", threshold: 3 },
        projectProbabilityFromLine({ reference: points, threshold: 14, scale: 6.5, fallback: 0.43 }),
        "supported"
      );
    }
    // Only assign perfect FT to active FT shooters (market line implies they go to the line).
    if (points && points.line >= 10) {
      pushPlayerTemplate(
        { kind: "nba_player_perfect_ft", player: player.player },
        clamp(
          projectProbabilityFromLine({ reference: points, threshold: 14, scale: 5.5, fallback: 0.14 }) * 0.7,
          0.05,
          0.30
        ),
        "supported"
      );
    }
    if (isShooterElite) {
      pushPlayerTemplate(
        { kind: "nba_player_stat_at_least", player: player.player, metric: "free_throws_made", threshold: 2 },
        projectProbabilityFromLine({ reference: points, threshold: 16, scale: 5.5, fallback: 0.38 }),
        "supported"
      );
    }

    // --- Rare tier (prob ~0.12–0.28) ---
    if (isBigMan) {
      pushPlayerTemplate(
        { kind: "nba_player_stat_at_least", player: player.player, metric: "blocks", threshold: 2 },
        projectProbabilityFromLine({ reference: blocks, threshold: 2, scale: 0.75, fallback: 0.15 }),
        "possible"
      );
    }
    if (isRebounder) {
      pushPlayerTemplate(
        { kind: "nba_player_stat_at_least", player: player.player, metric: "rebounds", threshold: 10 },
        projectProbabilityFromLine({ reference: rebounds, threshold: 10, scale: 3.3, fallback: 0.24 }),
        "possible"
      );
      pushPlayerTemplate(
        { kind: "nba_player_stat_at_least", player: player.player, metric: "offensive_rebounds", threshold: 3 },
        projectProbabilityFromLine({ reference: rebounds, threshold: 4.0, scale: 3.5, fallback: 0.13 }),
        "possible"
      );
    }
    if (isPlaymaker && isShooter) {
      pushPlayerTemplate(
        { kind: "nba_player_triple_threat", player: player.player },
        clamp(
          projectProbabilityFromLine({ reference: points, threshold: 8, scale: 5.5, fallback: 0.5 }) *
            projectProbabilityFromLine({ reference: rebounds, threshold: 4, scale: 3.0, fallback: 0.45 }) *
            projectProbabilityFromLine({ reference: assists, threshold: 4, scale: 2.8, fallback: 0.42 }),
          0.05,
          0.35
        ),
        "possible"
      );
    }
    if (isShooterStar) {
      pushPlayerTemplate(
        { kind: "nba_player_stat_at_least", player: player.player, metric: "points", threshold: 30 },
        projectProbabilityFromLine({ reference: points, threshold: 30, scale: 7.2, fallback: 0.16 }),
        "possible"
      );
    }
    pushPlayerTemplate(
      { kind: "nba_player_zero_turnovers", player: player.player },
      clamp(
        projectProbabilityFromLine({ reference: points, threshold: 12, scale: 7.0, fallback: 0.24 }) * 0.6,
        0.05,
        0.28
      ),
      "possible"
    );

    // --- Extreme tier (prob < 0.12) ---
    if (shootsThrees) {
      pushPlayerTemplate(
        { kind: "nba_player_stat_at_least", player: player.player, metric: "threes", threshold: 5 },
        projectProbabilityFromLine({ reference: threes, threshold: 5, scale: 0.95, fallback: 0.11 }),
        "possible"
      );
    }
    if (isPlaymaker) {
      pushPlayerTemplate(
        { kind: "nba_player_stat_at_least", player: player.player, metric: "assists", threshold: 10 },
        projectProbabilityFromLine({ reference: assists, threshold: 10, scale: 2.7, fallback: 0.13 }),
        "possible"
      );
    }
    if (isShooterElite && isRebounder) {
      pushPlayerTemplate(
        { kind: "nba_player_double_double", player: player.player },
        clamp(
          projectProbabilityFromLine({ reference: points, threshold: 13, scale: 6.5, fallback: 0.2 }) *
            projectProbabilityFromLine({ reference: rebounds, threshold: 9, scale: 3.2, fallback: 0.14 }) *
            1.45,
          0.05,
          0.45
        ),
        "possible"
      );
    }
    // Only give triple-double squares to genuine all-around playmakers.
    if (isElitePlaymaker && isRebounder && isShooterElite) {
      pushPlayerTemplate(
        { kind: "nba_player_triple_double", player: player.player },
        clamp(
          projectProbabilityFromLine({ reference: points, threshold: 14, scale: 6.0, fallback: 0.15 }) *
            projectProbabilityFromLine({ reference: rebounds, threshold: 9, scale: 3.0, fallback: 0.10 }) *
            projectProbabilityFromLine({ reference: assists, threshold: 9, scale: 2.5, fallback: 0.09 }) *
            4.5,
          0.03,
          0.12
        ),
        "possible"
      );
    }
    // Perfect FG% only for reliable interior/mid-range scorers (high FG% players).
    if (isShooterElite) {
      pushPlayerTemplate(
        { kind: "nba_player_perfect_fg", player: player.player },
        clamp(
          projectProbabilityFromLine({ reference: points, threshold: 18, scale: 5.0, fallback: 0.1 }) * 0.45,
          0.03,
          0.15
        ),
        "possible"
      );
    }
  }

  const pushTeamTemplate = (
    resolver: SportsBingoResolver,
    probability: number,
    supportLevel: SquareSupportLevel
  ): void => {
    const baseLabel = buildSquareLabel(game, resolver);
    templates.push({
      key: resolverKey(resolver),
      label: supportTaggedLabel(baseLabel, supportLevel),
      resolver,
      probability: clamp(probability, 0.05, 0.95),
      bucket: "achievement",
      supportLevel,
    });
  };

  for (const team of ["home", "away"] as const) {
    // Common tier
    pushTeamTemplate({ kind: "nba_team_stat_at_least", team, metric: "points", threshold: 100 }, 0.58, "supported");
    pushTeamTemplate({ kind: "nba_team_players_scored_at_least", team, threshold: 5 }, 0.71, "supported");
    pushTeamTemplate({ kind: "nba_team_stat_at_least", team, metric: "total_assists", threshold: 20 }, 0.68, "supported");
    pushTeamTemplate({ kind: "nba_team_three_pt_scorers", team, threshold: 3 }, 0.66, "supported");
    pushTeamTemplate({ kind: "nba_team_turnovers_at_most", team, threshold: 15 }, 0.70, "supported");

    // Moderate tier
    pushTeamTemplate({ kind: "nba_team_stat_at_least", team, metric: "blocks", threshold: 5 }, 0.46, "supported");
    pushTeamTemplate({ kind: "nba_team_stat_at_least", team, metric: "made_threes", threshold: 10 }, 0.48, "supported");
    pushTeamTemplate({ kind: "nba_team_stat_at_least", team, metric: "total_rebounds", threshold: 40 }, 0.50, "supported");
    pushTeamTemplate({ kind: "nba_team_stat_at_least", team, metric: "total_assists", threshold: 25 }, 0.47, "supported");
    pushTeamTemplate({ kind: "nba_team_has_double_double", team }, 0.45, "supported");
    pushTeamTemplate({ kind: "nba_team_outrebounds", team }, 0.48, "supported");

    // Rare tier
    pushTeamTemplate({ kind: "nba_team_stat_at_least", team, metric: "steals", threshold: 10 }, 0.20, "possible");
    pushTeamTemplate({ kind: "nba_team_stat_at_least", team, metric: "field_goal_pct", threshold: 50 }, 0.22, "possible");
    pushTeamTemplate({ kind: "nba_team_stat_at_least", team, metric: "offensive_rebounds", threshold: 12 }, 0.30, "possible");
    pushTeamTemplate({ kind: "nba_team_three_pt_scorers", team, threshold: 5 }, 0.32, "possible");
    pushTeamTemplate({ kind: "nba_team_turnovers_at_most", team, threshold: 10 }, 0.28, "possible");
    pushTeamTemplate({ kind: "nba_team_stat_at_least", team, metric: "total_rebounds", threshold: 50 }, 0.21, "possible");

    // Extreme tier
    pushTeamTemplate({ kind: "nba_team_stat_at_least", team, metric: "free_throw_pct", threshold: 90 }, 0.14, "possible");
    pushTeamTemplate({ kind: "nba_team_stat_at_least", team, metric: "made_threes", threshold: 15 }, 0.17, "possible");
    pushTeamTemplate({ kind: "nba_team_stat_at_least", team, metric: "points", threshold: 120 }, 0.18, "possible");
  }

  return aggregateCandidates(templates).sort((a, b) => a.key.localeCompare(b.key));
}

async function loadPlayerPropCandidatesForGame(game: SportsBingoGame): Promise<SportsBingoSquareTemplate[]> {
  const markets = getPlayerPropMarketsForSport(game.sportKey);
  if (markets.length === 0) {
    return [];
  }

  const path = `/sports/${game.sportKey}/events/${game.id}/odds`;

  let payload: unknown = null;
  for (const regions of PLAYER_PROP_REGION_FALLBACKS) {
    const query = new URLSearchParams({
      apiKey: ODDS_API_KEY,
      regions,
      markets: markets.join(","),
      oddsFormat: "american",
    });

    try {
      const candidate = await fetchOddsJson(path, query);
      payload = candidate;
      const candidateBookmakers: unknown[] = (
        candidate &&
        typeof candidate === "object" &&
        Array.isArray((candidate as OddsEvent).bookmakers)
      )
        ? ((candidate as OddsEvent).bookmakers as unknown[])
        : [];
      if (candidateBookmakers.length > 0) {
        break;
      }
    } catch {
      continue;
    }
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  return parsePlayerPropCandidates(game, payload as OddsEvent);
}

async function getPlayerPropCandidatesForGame(game: SportsBingoGame): Promise<SportsBingoSquareTemplate[]> {
  const cacheKey = `${game.sportKey}:${game.id}`;
  const now = Date.now();
  const cached = playerPropsCache.get(cacheKey);
  if (cached && now < cached.expiresAt) {
    return cached.candidates;
  }

  const candidates = await loadPlayerPropCandidatesForGame(game);
  playerPropsCache.set(cacheKey, {
    candidates,
    expiresAt: now + PLAYER_PROPS_CACHE_MS,
  });
  return candidates;
}

async function getGameEntryWithCandidates(params: {
  sportKey: string;
  gameId: string;
  includePlayerProps?: boolean;
}): Promise<{ game: SportsBingoGame; candidates: SportsBingoSquareTemplate[] } | null> {
  const catalog = await getGameCatalog(params.sportKey);
  const entry = catalog.find((item) => item.game.id === params.gameId);
  if (!entry) {
    return null;
  }

  let candidates = [...entry.candidates];
  let merged = [...candidates];
  if (params.includePlayerProps !== false) {
    const playerProps = await getPlayerPropCandidatesForGame(entry.game);
    if (playerProps.length > 0) {
      merged = aggregateCandidates([...candidates, ...playerProps]);
    }
  }

  if (entry.game.sportKey === "basketball_nba") {
    const achievementCandidates = buildNBAAchievementCandidates(entry.game, merged);
    if (achievementCandidates.length > 0) {
      merged = aggregateCandidates([...merged, ...achievementCandidates]);
    }
  }

  if (!BINGO_ALLOW_POSSIBLE_SQUARES) {
    merged = merged.filter((item) => (item.supportLevel ?? "supported") === "supported");
  }

  candidates = merged
    .map((item) => ({ ...item, probability: clamp(item.probability, 0.05, 0.95) }))
    .sort((a, b) => a.key.localeCompare(b.key));

  return {
    game: entry.game,
    candidates,
  };
}

function buildGameAndCandidates(sportKey: string, event: OddsEvent): GameCatalogEntry | null {
  const gameId = String(event.id ?? "").trim();
  const homeTeam = String(event.home_team ?? "").trim();
  const awayTeam = String(event.away_team ?? "").trim();
  const startsAt = String(event.commence_time ?? "").trim();
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
  const homeMoneylineSamples: number[] = [];
  const awayMoneylineSamples: number[] = [];
  const homeSpreadPoints: number[] = [];
  const totalLineSamples: number[] = [];
  const overAtBaseSamples: Array<{ line: number; probability: number }> = [];

  for (const bookmaker of event.bookmakers ?? []) {
    for (const market of bookmaker.markets ?? []) {
      const marketKey = String(market.key ?? "").trim();
      const outcomes = market.outcomes ?? [];
      if (outcomes.length < 2) {
        continue;
      }

      if (marketKey === "h2h") {
        const homeOutcome = outcomes.find((item) => inferTeamSide(String(item.name ?? ""), homeTeam, awayTeam) === "home");
        const awayOutcome = outcomes.find((item) => inferTeamSide(String(item.name ?? ""), homeTeam, awayTeam) === "away");
        if (!homeOutcome || !awayOutcome) {
          continue;
        }

        const homeOdds = parseAmericanOdds(homeOutcome.price);
        const awayOdds = parseAmericanOdds(awayOutcome.price);
        if (homeOdds === null || awayOdds === null) {
          continue;
        }

        const homeProb = impliedProbabilityFromAmericanOdds(homeOdds);
        const awayProb = impliedProbabilityFromAmericanOdds(awayOdds);
        if (homeProb === null || awayProb === null) {
          continue;
        }

        const total = homeProb + awayProb;
        if (total <= 0) {
          continue;
        }

        homeMoneylineSamples.push(homeProb / total);
        awayMoneylineSamples.push(awayProb / total);
        continue;
      }

      if (marketKey === "spreads") {
        const homeOutcome = outcomes.find((item) => inferTeamSide(String(item.name ?? ""), homeTeam, awayTeam) === "home");
        const awayOutcome = outcomes.find((item) => inferTeamSide(String(item.name ?? ""), homeTeam, awayTeam) === "away");
        if (!homeOutcome || !awayOutcome) {
          continue;
        }

        const homeOdds = parseAmericanOdds(homeOutcome.price);
        const awayOdds = parseAmericanOdds(awayOutcome.price);
        const homePointRaw = parseLineValue(homeOutcome.point);
        const awayPointRaw = parseLineValue(awayOutcome.point);
        if (homeOdds === null || awayOdds === null || homePointRaw === null || awayPointRaw === null) {
          continue;
        }

        const homeProb = impliedProbabilityFromAmericanOdds(homeOdds);
        const awayProb = impliedProbabilityFromAmericanOdds(awayOdds);
        if (homeProb === null || awayProb === null) {
          continue;
        }

        const total = homeProb + awayProb;
        if (total <= 0) {
          continue;
        }

        const normalizedHome = homeProb / total;
        const normalizedAway = awayProb / total;

        const homeLine = roundLine(Math.abs(homePointRaw));
        const awayLine = roundLine(Math.abs(awayPointRaw));
        homeSpreadPoints.push(homePointRaw);

        const homeResolver: SportsBingoResolver = homePointRaw < 0
          ? { kind: "spread_more_than", team: "home", line: homeLine }
          : { kind: "spread_keep_close", team: "home", line: homeLine };
        const awayResolver: SportsBingoResolver = awayPointRaw < 0
          ? { kind: "spread_more_than", team: "away", line: awayLine }
          : { kind: "spread_keep_close", team: "away", line: awayLine };

        rawCandidates.push({
          key: resolverKey(homeResolver),
          label: buildSquareLabel(game, homeResolver),
          resolver: homeResolver,
          probability: normalizedHome,
          bucket: "spread",
        });

        rawCandidates.push({
          key: resolverKey(awayResolver),
          label: buildSquareLabel(game, awayResolver),
          resolver: awayResolver,
          probability: normalizedAway,
          bucket: "spread",
        });

        continue;
      }

      if (marketKey === "totals") {
        const overOutcome = outcomes.find((item) => String(item.name ?? "").trim().toLowerCase() === "over");
        const underOutcome = outcomes.find((item) => String(item.name ?? "").trim().toLowerCase() === "under");
        if (!overOutcome || !underOutcome) {
          continue;
        }

        const overOdds = parseAmericanOdds(overOutcome.price);
        const underOdds = parseAmericanOdds(underOutcome.price);
        const overLineRaw = parseLineValue(overOutcome.point);
        const underLineRaw = parseLineValue(underOutcome.point);
        if (overOdds === null || underOdds === null || overLineRaw === null || underLineRaw === null) {
          continue;
        }

        const overProb = impliedProbabilityFromAmericanOdds(overOdds);
        const underProb = impliedProbabilityFromAmericanOdds(underOdds);
        if (overProb === null || underProb === null) {
          continue;
        }

        const totalProb = overProb + underProb;
        if (totalProb <= 0) {
          continue;
        }

        const normalizedOver = overProb / totalProb;
        const normalizedUnder = underProb / totalProb;
        const totalLine = roundLine((overLineRaw + underLineRaw) / 2);

        totalLineSamples.push(totalLine);
        overAtBaseSamples.push({ line: totalLine, probability: normalizedOver });

        const overResolver: SportsBingoResolver = { kind: "game_total_over", line: totalLine };
        const underResolver: SportsBingoResolver = { kind: "game_total_under", line: totalLine };

        rawCandidates.push({
          key: resolverKey(overResolver),
          label: buildSquareLabel(game, overResolver),
          resolver: overResolver,
          probability: normalizedOver,
          bucket: "total",
        });
        rawCandidates.push({
          key: resolverKey(underResolver),
          label: buildSquareLabel(game, underResolver),
          resolver: underResolver,
          probability: normalizedUnder,
          bucket: "total",
        });
      }
    }
  }

  const homeWinProb = clamp(average(homeMoneylineSamples, 0.5), 0.1, 0.9);
  const awayWinProb = clamp(average(awayMoneylineSamples, 1 - homeWinProb), 0.1, 0.9);

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

  if (sportKey === "basketball_nba") {
    const homeTripleDoubleProbability = clamp(0.03 + homeWinProb * 0.07, 0.03, 0.16);
    const awayTripleDoubleProbability = clamp(0.03 + awayWinProb * 0.07, 0.03, 0.16);
    const anyTripleDoubleProbability = clamp(
      homeTripleDoubleProbability + awayTripleDoubleProbability - (homeTripleDoubleProbability * awayTripleDoubleProbability),
      0.05,
      0.24
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

  const averageHomeSpread = average(homeSpreadPoints, (50 - homeWinProb * 100) * 0.35);
  const averageTotal = average(totalLineSamples, 226);
  const baseOverProbability = (() => {
    if (overAtBaseSamples.length === 0) {
      return 0.5;
    }
    const closest = overAtBaseSamples.reduce((best, item) => {
      const bestDistance = Math.abs(best.line - averageTotal);
      const currentDistance = Math.abs(item.line - averageTotal);
      return currentDistance < bestDistance ? item : best;
    });
    return clamp(closest.probability, 0.1, 0.9);
  })();

  const favorite: TeamSide = homeWinProb >= awayWinProb ? "home" : "away";
  const underdog: TeamSide = favorite === "home" ? "away" : "home";
  const favoriteBaseLine = Math.max(0.5, Math.abs(averageHomeSpread));
  const spreadLevels = Array.from(new Set([-4, -2, 0, 2, 4, 6, 8].map((offset) => roundLine(favoriteBaseLine + offset)))).filter(
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

  const totalLevels = Array.from(
    new Set([-15, -10, -6, -3, 0, 3, 6, 10, 15].map((offset) => roundLine(averageTotal + offset)))
  );
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
    const levels = Array.from(new Set([-14, -10, -6, -3, 0, 3, 6, 10, 14].map((offset) => roundLine(impliedTotal + offset))));
    for (const line of levels) {
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
  assertOddsConfigured();

  const now = new Date();
  const to = new Date(Date.now() + ODDS_LOOKAHEAD_HOURS * 60 * 60 * 1000);

  const query = new URLSearchParams({
    apiKey: ODDS_API_KEY,
    regions: "us",
    markets: "h2h,spreads,totals",
    oddsFormat: "american",
    commenceTimeFrom: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    commenceTimeTo: to.toISOString().replace(/\.\d{3}Z$/, "Z"),
  });

  const payload = await fetchOddsJson(`/sports/${sportKey}/odds`, query);
  if (!Array.isArray(payload)) {
    return [];
  }

  const entries: GameCatalogEntry[] = [];
  for (const item of payload as OddsEvent[]) {
    const entry = buildGameAndCandidates(sportKey, item);
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
    default:
      return "";
  }
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

  const tryAdd = (candidate: SportsBingoSquareTemplate): boolean => {
    if (selected.length >= 24 || selectedKeys.has(candidate.key)) {
      return false;
    }
    const axis = getPlayerPropAxisKey(candidate);
    if (axis) {
      if (selectedPlayerPropAxes.has(axis)) {
        return false;
      }
      selectedPlayerPropAxes.add(axis);
      const marketKey = getPlayerPropMarketKey(candidate);
      if (marketKey) {
        playerPropMarketCounts.set(marketKey, (playerPropMarketCounts.get(marketKey) ?? 0) + 1);
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
    ["special", sportKey === "basketball_nba" ? 1 : 0],
    ["achievement", sportKey === "basketball_nba" ? 5 : 0],
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

  if (sportKey === "basketball_nba") {
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

function buildBoardPreview(game: SportsBingoGame, squares: InternalBoardSquare[]): SportsBingoBoardPreview {
  const previewSquares: SportsBingoSquarePreview[] = squares.map((square) => ({
    index: square.index,
    key: square.key,
    label: square.label,
    probability: square.probability,
    isFree: square.isFree,
    supportLevel: square.supportLevel,
  }));

  const boardProbability = estimateBoardWinProbability(
    previewSquares.map((square) => ({
      index: square.index,
      probability: square.probability,
      isFree: square.isFree,
    }))
  );

  return {
    game,
    boardProbability,
    squares: previewSquares,
  };
}

function generateBoardForGame(game: SportsBingoGame, candidates: SportsBingoSquareTemplate[]): SportsBingoBoardPreview {
  const target = clamp(BOARD_TARGET_WIN_RATE, 0.05, 0.95);
  const tolerance = clamp(BOARD_TARGET_TOLERANCE, 0.01, 0.2);

  let best: SportsBingoBoardPreview | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (let attempt = 0; attempt < 180; attempt += 1) {
    const picked = pickCandidateSet(candidates, game.sportKey);
    const boardSquares = arrangeBoardSquaresForFeasibleLines(picked);
    if (!boardSquares) {
      continue;
    }

    const preview = buildBoardPreview(game, boardSquares);
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
} = {}): Promise<SportsBingoGame[]> {
  const sportKey = (params.sportKey ?? DEFAULT_SPORT_KEY).trim() || DEFAULT_SPORT_KEY;
  const includeLocked = Boolean(params.includeLocked);

  const catalog = await getGameCatalog(sportKey);
  const now = Date.now();

  return catalog
    .map((entry) => ({
      ...entry.game,
      isLocked: +new Date(entry.game.startsAt) <= now,
    }))
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
    | "nba_team_has_double_double"
    | "nba_team_three_pt_scorers"
    | "nba_team_turnovers_at_most"
    | "nba_team_outrebounds"
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

  return generateBoardForGame(entry.game, entry.candidates);
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
    .map((square) => ({
      id: square.id,
      index: square.square_index,
      key: resolverKey(parseResolver(square.resolver) ?? { kind: "free" }),
      label: squareLabelForCard(square),
      probability: Number(square.probability),
      isFree: square.is_free,
      status: square.status,
      resolvedAt: square.resolved_at ?? undefined,
    }))
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
  nbaStatsSnapshot: NBAGamePlayerStatsSnapshot | null = null
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

  if (home === null || away === null) {
    if (completed) {
      return { status: "void", resolved: true };
    }
    return { status: "pending", resolved: false };
  }

  const teamScore = (team: TeamSide) => (team === "home" ? home : away);
  const opponentScore = (team: TeamSide) => (team === "home" ? away : home);
  const totalScore = home + away;

  switch (resolver.kind) {
    case "moneyline":
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
      if (!completed) {
        return { status: "pending", resolved: false };
      }
      return {
        status: teamScore(resolver.team) - opponentScore(resolver.team) > resolver.line ? "hit" : "miss",
        resolved: true,
      };
    case "spread_keep_close":
      if (!completed) {
        return { status: "pending", resolved: false };
      }
      return {
        status: teamScore(resolver.team) + resolver.line > opponentScore(resolver.team) ? "hit" : "miss",
        resolved: true,
      };
    case "game_total_over":
      if (totalScore > resolver.line) {
        return { status: "hit", resolved: true };
      }
      if (completed) {
        return { status: "miss", resolved: true };
      }
      return { status: "pending", resolved: false };
    case "game_total_under":
      if (!completed) {
        return { status: "pending", resolved: false };
      }
      return {
        status: totalScore < resolver.line ? "hit" : "miss",
        resolved: true,
      };
    case "team_total_over": {
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
      if (!isNBAPlayerPropMarketSupported(resolver.marketKey)) {
        return { status: "miss", resolved: true };
      }
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

      const value = getNBAPlayerPropValue(line, resolver.marketKey);
      if (value === null || !Number.isFinite(value)) {
        if (!completed && !nbaStatsSnapshot.finalized) {
          return { status: "pending", resolved: false };
        }
        return { status: "miss", resolved: true };
      }

      if (value === resolver.line) {
        if (!completed && !nbaStatsSnapshot.finalized) {
          return { status: "pending", resolved: false };
        }
        return { status: "miss", resolved: true };
      }

      if (resolver.direction === "over") {
        if (value > resolver.line) {
          return { status: "hit", resolved: true };
        }
        if (completed || nbaStatsSnapshot.finalized) {
          return { status: "miss", resolved: true };
        }
        return { status: "pending", resolved: false };
      }
      if (completed || nbaStatsSnapshot.finalized) {
        return { status: value < resolver.line ? "hit" : "miss", resolved: true };
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
      // Resolves only at game end; requires fta >= 3 and ftm == fta.
      if (!nbaStatsSnapshot) {
        if (!completed) return { status: "pending", resolved: false };
        return { status: "miss", resolved: true };
      }
      if (!completed && !nbaStatsSnapshot.finalized) return { status: "pending", resolved: false };
      const line = findNBAPlayerStatLine(nbaStatsSnapshot, resolver.player);
      if (!line) return { status: "miss", resolved: true };
      if (line.fta < 3) return { status: "miss", resolved: true };
      return { status: line.ftm === line.fta ? "hit" : "miss", resolved: true };
    }
    case "nba_player_perfect_fg": {
      // Resolves only at game end; requires fga >= 4 and fgm == fga.
      if (!nbaStatsSnapshot) {
        if (!completed) return { status: "pending", resolved: false };
        return { status: "miss", resolved: true };
      }
      if (!completed && !nbaStatsSnapshot.finalized) return { status: "pending", resolved: false };
      const line = findNBAPlayerStatLine(nbaStatsSnapshot, resolver.player);
      if (!line) return { status: "miss", resolved: true };
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
      if (!completed && !nbaStatsSnapshot.finalized) return { status: "pending", resolved: false };
      const line = findNBAPlayerStatLine(nbaStatsSnapshot, resolver.player);
      if (!line) return { status: "miss", resolved: true };
      return { status: line.turnover === 0 ? "hit" : "miss", resolved: true };
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
      if (!completed && !nbaStatsSnapshot.finalized) return { status: "pending", resolved: false };
      const agg = buildNBATeamAggregates(nbaStatsSnapshot, resolver.team);
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

async function getScoresBySportKey(sportKey: string): Promise<Map<string, ScoreSnapshot>> {
  if (!ODDS_API_KEY) {
    return new Map<string, ScoreSnapshot>();
  }

  const now = Date.now();
  const cached = scoreCache.get(sportKey);
  if (cached && now < cached.expiresAt) {
    return cached.byGameId;
  }

  const query = new URLSearchParams({
    apiKey: ODDS_API_KEY,
    daysFrom: "3",
  });
  const payload = await fetchOddsJson(`/sports/${sportKey}/scores`, query);
  if (!Array.isArray(payload)) {
    return new Map<string, ScoreSnapshot>();
  }

  const byGameId = new Map<string, ScoreSnapshot>();
  for (const event of payload as OddsScoreEvent[]) {
    const gameId = String(event.id ?? "").trim();
    const homeTeam = String(event.home_team ?? "").trim();
    const awayTeam = String(event.away_team ?? "").trim();
    if (!gameId || !homeTeam || !awayTeam) {
      continue;
    }

    const byTeam = new Map<string, number>();
    for (const scoreRow of event.scores ?? []) {
      const name = String(scoreRow.name ?? "").trim();
      const score = parseScoreValue(scoreRow.score);
      if (!name || score === null) {
        continue;
      }
      byTeam.set(normalizeTeamKey(name), score);
    }

    const homeScore = byTeam.get(normalizeTeamKey(homeTeam)) ?? null;
    const awayScore = byTeam.get(normalizeTeamKey(awayTeam)) ?? null;

    byGameId.set(gameId, {
      gameId,
      sportKey: String(event.sport_key ?? sportKey).trim() || sportKey,
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      completed: Boolean(event.completed),
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

export async function refreshSportsBingoProgress(params: {
  userId?: string;
  limit?: number;
} = {}): Promise<{
  scannedCards: number;
  updatedSquares: number;
  settledWins: number;
  settledLosses: number;
  nearWinAlerts: number;
}> {
  assertSupabaseConfigured();

  const activeCardRows = await listCardRows({
    userId: params.userId,
    activeOnly: true,
    limit: params.limit ?? 200,
  });

  if (activeCardRows.length === 0) {
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
  const nbaStatsSnapshotsByOddsGameId = new Map<string, NBAGamePlayerStatsSnapshot | null>();

  for (const entry of activeCardRows) {
    const cardRow = entry.card;
    const squares = [...entry.squares];
    const oddsScore = scoresBySport.get(cardRow.sport_key)?.get(cardRow.game_id) ?? null;

    let nbaStatsSnapshot: NBAGamePlayerStatsSnapshot | null = null;
    if (cardRow.sport_key === "basketball_nba") {
      if (nbaStatsSnapshotsByOddsGameId.has(cardRow.game_id)) {
        nbaStatsSnapshot = nbaStatsSnapshotsByOddsGameId.get(cardRow.game_id) ?? null;
      } else {
        nbaStatsSnapshot = await getNBAGamePlayerStatsSnapshot(cardRow);
        nbaStatsSnapshotsByOddsGameId.set(cardRow.game_id, nbaStatsSnapshot);
      }
    }

    const startsAtMs = Date.parse(cardRow.starts_at);
    const isPastForceFinalizeWindow =
      Number.isFinite(startsAtMs) && Date.now() - startsAtMs >= BINGO_FORCE_FINALIZE_AFTER_START_MS;
    const score = mergeLiveScores(oddsScore, toNBALiveScoreSnapshot(cardRow, nbaStatsSnapshot));
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

      if (square.status !== "pending") {
        continue;
      }

      const resolver = parseResolver(square.resolver);
      if (!resolver) {
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

      const evaluation = evaluateResolver(resolver, effectiveScore, nbaStatsSnapshot);
      if (evaluation.status === "pending" && !mustForceFinalize) {
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

  return {
    scannedCards: activeCardRows.length,
    updatedSquares,
    settledWins,
    settledLosses,
    nearWinAlerts,
  };
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

  const { count: activeCount } = await supabaseAdmin!
    .from("sports_bingo_cards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "active");

  // Missing-table errors surface as null counts in the SDK call path above.
  // Detect explicitly before proceeding so users see a clear migration message.
  const { error: cardsTableCheckError } = await supabaseAdmin!.from("sports_bingo_cards").select("id").limit(1);
  if (isMissingSportsBingoTablesError(cardsTableCheckError)) {
    throw new Error(SPORTS_BINGO_MIGRATION_REQUIRED_ERROR);
  }

  if ((activeCount ?? 0) >= MAX_ACTIVE_CARDS_PER_USER) {
    throw new Error("You can only play up to 4 active Sports Bingo cards at once.");
  }

  const { data: existingSameGame } = await supabaseAdmin!
    .from("sports_bingo_cards")
    .select("id")
    .eq("user_id", userId)
    .eq("game_id", gameId)
    .eq("status", "active")
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
          status: "hit" as SquareStatus,
          resolved_at: nowIso,
        };
      }

      return {
        card_id: insertedCard.id,
        square_index: square.index,
        label: square.template!.label,
        resolver: square.template!.resolver,
        probability: square.template!.probability,
        is_free: false,
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
    .select("id, reward_points, game_label")
    .maybeSingle<{ id: string; reward_points: number; game_label: string }>();

  if (claimError) {
    throw new Error(claimError.message ?? "Failed to claim Bingo points.");
  }
  if (!claimedCard) {
    throw new Error("This Bingo reward was already claimed or is not eligible yet.");
  }

  const rewardPoints = Math.max(0, Number(claimedCard.reward_points ?? 0));
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
