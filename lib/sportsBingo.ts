import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ODDS_API_BASE_URL = process.env.ODDS_API_BASE_URL ?? "https://api.the-odds-api.com/v4";
const ODDS_API_KEY = process.env.ODDS_API_KEY?.trim() ?? "";
const BALLDONTLIE_API_BASE_URL = process.env.BALLDONTLIE_API_BASE_URL ?? "https://api.balldontlie.io";
const BALLDONTLIE_API_KEY = process.env.BALLDONTLIE_API_KEY?.trim() ?? "";
const DEFAULT_SPORT_KEY = "basketball_nba";
const BINGO_REWARD_POINTS = Number.parseInt(process.env.BINGO_REWARD_POINTS ?? "40", 10);
const BOARD_TARGET_WIN_RATE = Number.parseFloat(process.env.BINGO_BOARD_TARGET_WIN_RATE ?? "0.20");
const BOARD_TARGET_TOLERANCE = Number.parseFloat(process.env.BINGO_BOARD_TARGET_TOLERANCE ?? "0.04");
const BOARD_SIMULATION_TRIALS = Number.parseInt(process.env.BINGO_BOARD_SIM_TRIALS ?? "2500", 10);
const MAX_ACTIVE_CARDS_PER_USER = 4;
const GAME_CATALOG_CACHE_MS = 30_000;
const PLAYER_PROPS_CACHE_MS = 10 * 60 * 1000;
const SCORE_CACHE_MS = 15_000;
const NBA_PLAYER_STATS_CACHE_MS = 15_000;
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

type TeamSide = "home" | "away";
type CandidateBucket = "moneyline" | "spread" | "total" | "team-total" | "player-prop" | "special";
type CardStatus = "active" | "won" | "lost" | "canceled";
type SquareStatus = "pending" | "hit" | "miss" | "void" | "replaced";
type PlayerPropDirection = "over" | "under";

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
  | { kind: "team_triple_double"; team: TeamSide }
  | { kind: "any_triple_double" }
  | { kind: "replacement_auto" };

type SportsBingoSquareTemplate = {
  key: string;
  label: string;
  resolver: SportsBingoResolver;
  probability: number;
  bucket: CandidateBucket;
};

type SportsBingoSquarePreview = {
  index: number;
  key: string;
  label: string;
  probability: number;
  isFree: boolean;
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
};

type NBAGamePlayerStatsSnapshot = {
  gameId: number;
  finalized: boolean;
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
    case "team_triple_double":
      return `team_triple_double:${resolver.team}`;
    case "any_triple_double":
      return "any_triple_double";
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
      return `${team} wins by ${formatLine(resolver.line)}+ points.`;
    }
    case "spread_keep_close": {
      const team = teamForSide(resolver.team);
      return `${team} wins or loses by fewer than ${formatLine(resolver.line)} points.`;
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
      const statLabel = PLAYER_PROP_MARKET_LABELS[resolver.marketKey] ?? "stat";
      const directionText = resolver.direction === "over" ? "over" : "under";
      return `${resolver.player}: ${directionText} ${formatLine(resolver.line)} ${statLabel}.`;
    }
    case "team_triple_double": {
      const team = teamForSide(resolver.team);
      return `${team}: any player records a triple-double.`;
    }
    case "any_triple_double":
      return "Any player records a triple-double.";
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
    lines,
    byPlayerKey,
    homeHasTripleDouble,
    awayHasTripleDouble,
    anyHasTripleDouble: homeHasTripleDouble || awayHasTripleDouble,
  };
}

async function getNBAGamePlayerStatsSnapshot(card: SportsBingoCardRow): Promise<NBAGamePlayerStatsSnapshot | null> {
  if (card.sport_key !== "basketball_nba" || !isBallDontLieConfigured()) {
    return null;
  }

  const now = Date.now();
  const cached = nbaPlayerStatsCache.get(card.game_id);
  if (cached && now < cached.expiresAt) {
    return cached.snapshot;
  }

  try {
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
    });
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
  if (params.includePlayerProps !== false) {
    const playerProps = await getPlayerPropCandidatesForGame(entry.game);
    if (playerProps.length > 0) {
      candidates = aggregateCandidates([...candidates, ...playerProps])
        .map((item) => ({ ...item, probability: clamp(item.probability, 0.05, 0.95) }))
        .sort((a, b) => a.key.localeCompare(b.key));
    }
  }

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
};

function getPlayerPropMarketKey(candidate: SportsBingoSquareTemplate): string {
  if (candidate.resolver.kind !== "player_prop") {
    return "";
  }
  return candidate.resolver.marketKey;
}

function getPlayerPropAxisKey(candidate: SportsBingoSquareTemplate): string {
  if (candidate.resolver.kind !== "player_prop") {
    return "";
  }
  return `${candidate.resolver.marketKey}|${candidate.resolver.player.toLowerCase()}|${candidate.resolver.line.toFixed(1)}`;
}

function pickCandidateSet(candidates: SportsBingoSquareTemplate[], sportKey: string): SportsBingoSquareTemplate[] {
  const grouped: Record<CandidateBucket, SportsBingoSquareTemplate[]> = {
    moneyline: [],
    spread: [],
    total: [],
    "team-total": [],
    "player-prop": [],
    special: [],
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
    if (candidate.resolver.kind === "player_prop") {
      const axis = getPlayerPropAxisKey(candidate);
      if (axis && selectedPlayerPropAxes.has(axis)) {
        return false;
      }
      if (axis) {
        selectedPlayerPropAxes.add(axis);
      }
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
    ["spread", 5],
    ["total", 4],
    ["team-total", 4],
    ["special", sportKey === "basketball_nba" ? 1 : 0],
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
      if (candidate.resolver.kind !== "player_prop") {
        return false;
      }
      const marketKey = candidate.resolver.marketKey;
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
    case "team_triple_double":
      if (resolver.team === "home" || resolver.team === "away") {
        return { kind: "team_triple_double", team: resolver.team };
      }
      return null;
    case "any_triple_double":
      return { kind: "any_triple_double" };
    default:
      return null;
  }
}

function mapCardRow(row: SportsBingoCardRow, squares: SportsBingoSquareRow[]): SportsBingoCard {
  const mappedSquares = squares
    .map((square) => ({
      id: square.id,
      index: square.square_index,
      key: resolverKey(parseResolver(square.resolver) ?? { kind: "replacement_auto" }),
      label: square.label,
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
      "id, user_id, venue_id, game_id, game_label, sport_key, home_team, away_team, starts_at, status, board_probability, reward_points, near_win_notified_at, won_notified_at, won_line, settled_at, created_at"
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
    return { status: "hit", resolved: true };
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
      if (!completed) {
        return { status: "pending", resolved: false };
      }
      if (!isNBAPlayerPropMarketSupported(resolver.marketKey)) {
        return { status: "void", resolved: true };
      }
      if (!nbaStatsSnapshot) {
        return { status: "void", resolved: true };
      }
      if (!nbaStatsSnapshot.finalized) {
        return { status: "pending", resolved: false };
      }

      const line = findNBAPlayerStatLine(nbaStatsSnapshot, resolver.player);
      if (!line) {
        return { status: "void", resolved: true };
      }

      const value = getNBAPlayerPropValue(line, resolver.marketKey);
      if (value === null || !Number.isFinite(value)) {
        return { status: "void", resolved: true };
      }

      if (value === resolver.line) {
        return { status: "void", resolved: true };
      }

      if (resolver.direction === "over") {
        return { status: value > resolver.line ? "hit" : "miss", resolved: true };
      }
      return { status: value < resolver.line ? "hit" : "miss", resolved: true };
    }
    case "team_triple_double":
    case "any_triple_double": {
      if (!completed) {
        return { status: "pending", resolved: false };
      }
      if (!nbaStatsSnapshot) {
        return { status: "void", resolved: true };
      }
      if (!nbaStatsSnapshot.finalized) {
        return { status: "pending", resolved: false };
      }

      if (resolver.kind === "any_triple_double") {
        return { status: nbaStatsSnapshot.anyHasTripleDouble ? "hit" : "miss", resolved: true };
      }

      const hasTeamTripleDouble = resolver.team === "home"
        ? nbaStatsSnapshot.homeHasTripleDouble
        : nbaStatsSnapshot.awayHasTripleDouble;
      return { status: hasTeamTripleDouble ? "hit" : "miss", resolved: true };
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

async function replaceVoidedSquare(params: {
  card: SportsBingoCardRow;
  square: SportsBingoSquareRow;
  usedKeys: Set<string>;
  score: ScoreSnapshot;
  nbaStatsSnapshot?: NBAGamePlayerStatsSnapshot | null;
}): Promise<SportsBingoSquareRow> {
  const catalog = await getGameCatalog(params.card.sport_key);
  const gameEntry = catalog.find((entry) => entry.game.id === params.card.game_id);

  const fallbackResolver: SportsBingoResolver = { kind: "replacement_auto" };
  let replacement: SportsBingoSquareTemplate | null = null;

  if (gameEntry) {
    replacement = gameEntry.candidates.find((candidate) => !params.usedKeys.has(candidate.key)) ?? null;
  }

  const resolvedReplacement = replacement ?? {
    key: "replacement_auto",
    label: "Replacement square (house rules).",
    resolver: fallbackResolver,
    probability: 1,
    bucket: "total" as CandidateBucket,
  };

  const evaluation = evaluateResolver(resolvedReplacement.resolver, params.score, params.nbaStatsSnapshot ?? null);
  const nextStatus: SquareStatus = evaluation.status === "pending"
    ? "pending"
    : evaluation.status === "void"
      ? "hit"
      : evaluation.status;

  const resolvedAt = nextStatus === "pending" ? null : new Date().toISOString();

  const { data, error } = await supabaseAdmin!
    .from("sports_bingo_squares")
    .update({
      label: resolvedReplacement.label,
      resolver: resolvedReplacement.resolver,
      probability: resolvedReplacement.probability,
      status: nextStatus,
      resolved_at: resolvedAt,
    })
    .eq("id", params.square.id)
    .select("id, card_id, square_index, label, resolver, probability, is_free, status, created_at, resolved_at")
    .single<SportsBingoSquareRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to replace voided bingo square.");
  }

  return data;
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
  assertOddsConfigured();

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
    scoresBySport.set(sportKey, await getScoresBySportKey(sportKey));
  }

  let updatedSquares = 0;
  let settledWins = 0;
  let settledLosses = 0;
  let nearWinAlerts = 0;
  const nbaStatsSnapshotsByOddsGameId = new Map<string, NBAGamePlayerStatsSnapshot | null>();

  for (const entry of activeCardRows) {
    const cardRow = entry.card;
    const squares = [...entry.squares];
    const score = scoresBySport.get(cardRow.sport_key)?.get(cardRow.game_id);
    if (!score) {
      continue;
    }

    let nbaStatsSnapshot: NBAGamePlayerStatsSnapshot | null = null;
    if (cardRow.sport_key === "basketball_nba") {
      if (nbaStatsSnapshotsByOddsGameId.has(cardRow.game_id)) {
        nbaStatsSnapshot = nbaStatsSnapshotsByOddsGameId.get(cardRow.game_id) ?? null;
      } else {
        nbaStatsSnapshot = await getNBAGamePlayerStatsSnapshot(cardRow);
        nbaStatsSnapshotsByOddsGameId.set(cardRow.game_id, nbaStatsSnapshot);
      }
    }

    const usedKeys = new Set<string>();
    for (const square of squares) {
      const resolver = parseResolver(square.resolver);
      if (resolver) {
        usedKeys.add(resolverKey(resolver));
      }
    }

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
        const replaced = await replaceVoidedSquare({
          card: cardRow,
          square,
          usedKeys,
          score,
          nbaStatsSnapshot,
        });
        squares[index] = replaced;
        updatedSquares += 1;
        usedKeys.add(resolverKey(parseResolver(replaced.resolver) ?? { kind: "replacement_auto" }));
        continue;
      }

      const evaluation = evaluateResolver(resolver, score, nbaStatsSnapshot);
      if (evaluation.status === "pending") {
        continue;
      }

      if (evaluation.status === "void") {
        const replaced = await replaceVoidedSquare({
          card: cardRow,
          square,
          usedKeys,
          score,
          nbaStatsSnapshot,
        });
        squares[index] = replaced;
        updatedSquares += 1;
        usedKeys.add(resolverKey(parseResolver(replaced.resolver) ?? { kind: "replacement_auto" }));
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
        const currentPoints = await loadUserPoints(cardRow.user_id);
        await supabaseAdmin!
          .from("users")
          .update({ points: currentPoints + Number(cardRow.reward_points) })
          .eq("id", cardRow.user_id);

        await addNotification(
          cardRow.user_id,
          "success",
          `Bingo! You won ${cardRow.reward_points} points in ${cardRow.game_label}.`
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

    if (score.completed && pending === 0 && misses >= 1) {
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

  const rewardPoints = Number.isFinite(BINGO_REWARD_POINTS) ? Math.max(1, BINGO_REWARD_POINTS) : 40;
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
      "id, user_id, venue_id, game_id, game_label, sport_key, home_team, away_team, starts_at, status, board_probability, reward_points, near_win_notified_at, won_notified_at, won_line, settled_at, created_at"
    )
    .single<SportsBingoCardRow>();

  if (cardError || !insertedCard) {
    if (isMissingSportsBingoTablesError(cardError)) {
      throw new Error(SPORTS_BINGO_MIGRATION_REQUIRED_ERROR);
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
