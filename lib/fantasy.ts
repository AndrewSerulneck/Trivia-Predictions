import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiSportsGet } from "@/lib/apisports";
import { applyChallengeCampaignPoints } from "@/lib/challengeCampaigns";
import { fetchBallDontLieList } from "@/lib/balldontlie";
import { fetchNBAHeadshot as fetchTheSportsDbHeadshot } from "@/lib/thesportsdb";

const APISPORTS_NBA_BASE_URL = process.env.APISPORTS_NBA_BASE_URL?.trim() ?? "https://v2.nba.api-sports.io";
const APISPORTS_API_KEY = process.env.APISPORTS_API_KEY?.trim() ?? "";
const FANTASY_SPORT_KEY = "basketball_nba";
const FANTASY_NFL_SPORT_KEY = "americanfootball_nfl";
const FANTASY_STANDARD_LINEUP_SIZE = 5;
const FANTASY_MLB_LINEUP_SIZE = 6;
const FANTASY_MLB_PITCHER_COUNT = 3;
const FANTASY_MLB_HITTER_COUNT = 3;
const FANTASY_MAX_LINEUP_SIZE = Math.max(FANTASY_STANDARD_LINEUP_SIZE, FANTASY_MLB_LINEUP_SIZE);
const FANTASY_POINTS_MULTIPLIER = Math.max(1, Number.parseInt(process.env.FANTASY_POINTS_MULTIPLIER ?? "1", 10) || 1);
// Keep this high enough to include full-day NBA slates across multiple games.
const FANTASY_PLAYER_POOL_LIMIT = 200;
const FANTASY_LIVE_STATS_LOOKBACK_MS = 48 * 60 * 60 * 1000;
const FANTASY_ENABLE_POOL_LIVE_ENRICH =
  String(process.env.FANTASY_ENABLE_POOL_LIVE_ENRICH ?? "")
    .trim()
    .toLowerCase() === "true";
const FANTASY_USE_DIRECT_APISPORTS_SCORING =
  String(process.env.FANTASY_USE_DIRECT_APISPORTS_SCORING ?? "")
    .trim()
    .toLowerCase() !== "false";
const FANTASY_ALLOW_STARTED_DRAFTING_FOR_TESTING =
  String(process.env.FANTASY_ALLOW_STARTED_DRAFTING_FOR_TESTING ?? "")
    .trim()
    .toLowerCase() === "true";
const FANTASY_TABLES_MISSING_ERROR =
  "Fantasy tables are not installed in this Supabase project yet. Run migration supabase/migrations/20260428184500_add_fantasy_entries.sql.";

const FANTASY_DAILY_GAME_ID_PREFIX = "nba-daily-";
const FANTASY_WNBA_SPORT_KEY = "basketball_wnba";
const FANTASY_WNBA_DAILY_GAME_ID_PREFIX = "wnba-daily-";
const FANTASY_MLB_SPORT_KEY = "baseball_mlb";
const FANTASY_MLB_DAILY_GAME_ID_PREFIX = "mlb-daily-";
const FANTASY_DAILY_TEAM_LABEL = "All Teams";

type FantasyEntryStatus = "pending" | "live" | "final" | "canceled";
type FantasyGameStatus = "scheduled" | "live" | "final";

type SupabaseLikeError = {
  code?: string;
  message?: string;
};

type ApiSportsNbaGame = Record<string, unknown>;
type ApiSportsNbaPlayerStat = Record<string, unknown>;

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const apiSportsGamesCache = new Map<string, CacheEntry<ApiSportsNbaGame[]>>();
const apiSportsPlayerStatsCache = new Map<string, CacheEntry<ApiSportsNbaPlayerStat[]>>();
const apiSportsPlayerIdCache = new Map<string, CacheEntry<number>>();
const apiSportsTeamPlayersCache = new Map<string, CacheEntry<Record<string, unknown>[]>>();
const wnbaGamesCache = new Map<string, CacheEntry<ApiSportsNbaGame[]>>();
const wnbaTeamPlayersCache = new Map<string, CacheEntry<Record<string, unknown>[]>>();
const mlbGamesCache = new Map<string, CacheEntry<ApiSportsNbaGame[]>>();
const mlbTeamPlayersCache = new Map<string, CacheEntry<Record<string, unknown>[]>>();
const APISPORTS_GAMES_TTL_MS = 15_000;
const APISPORTS_PLAYER_STATS_TTL_MS = 10_000;
const APISPORTS_PLAYER_ID_TTL_MS = 12 * 60 * 60 * 1000;
const APISPORTS_TEAM_PLAYERS_TTL_MS = 6 * 60 * 60 * 1000;

type FantasyEntryRow = {
  id: string;
  user_id: string;
  venue_id: string;
  sport_key: string;
  game_id: string;
  game_label: string;
  home_team: string;
  away_team: string;
  starts_at: string;
  lineup: unknown;
  status: FantasyEntryStatus;
  points: number;
  score_breakdown: unknown;
  reward_points: number;
  reward_claimed_at: string | null;
  live_collected_points: number;
  stats_last_source_updated_at: string | null;
  settled_at: string | null;
  created_at: string;
  updated_at: string;
};

type LivePlayerStatRow = {
  player_id?: number;
  game_id: string;
  player_name: string;
  team_name: string;
  game_status: string;
  total_fantasy_points: number;
  source_updated_at: string;
};

export type FantasyGame = {
  id: string;
  sportKey: string;
  league: string;
  startsAt: string;
  gameLabel: string;
  homeTeam: string;
  awayTeam: string;
  status: FantasyGameStatus;
  homeScore: number | null;
  awayScore: number | null;
  isLocked: boolean;
};

export type FantasyPlayerPoolItem = {
  playerId: number | null;
  playerName: string;
  headshotUrl: string | null;
  coverage: number;
  projectedLine: number | null;
  position: string | null;
  team: string | null;
};

export type FantasyPlayerPoolEmptyReason =
  | "no-games"
  | "all-games-started"
  | "no-eligible-players";

export type FantasyLineupPlayer = {
  playerId: number;
  playerName: string;
  headshotUrl?: string | null;
};

export type FantasyEntry = {
  id: string;
  userId: string;
  venueId: string;
  sportKey: string;
  gameId: string;
  gameLabel: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  lineup: string[];
  lineupPlayers: FantasyLineupPlayer[];
  status: FantasyEntryStatus;
  points: number;
  scoreBreakdown: Record<string, number>;
  rewardPoints: number;
  rewardClaimedAt: string | null;
  liveCollectedPoints: number;
  statsLastSourceUpdatedAt: string | null;
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FantasyLeaderboardEntry = {
  entryId: string;
  userId: string;
  username: string;
  points: number;
  status: FantasyEntryStatus;
  rank: number;
  lineup: string[];
  rewardPoints: number;
};

function isMissingFantasyTablesError(error: SupabaseLikeError | null | undefined): boolean {
  if (!error) {
    return false;
  }

  const message = String(error.message ?? "").toLowerCase();
  const referencesFantasyTables = message.includes("fantasy_entries");

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (referencesFantasyTables && (message.includes("relation") || message.includes("schema cache")))
  );
}

function normalizeTeamKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
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

function isPlaceholderFighterName(value: string): boolean {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return true;
  const normalized = trimmed.toLowerCase();
  return /^fighter\s+\d+$/.test(normalized) || /^player\s+\d+$/.test(normalized);
}

function extractMmaFighterName(row: Record<string, unknown>): string {
  const first = String(getPath(row, ["first_name"]) ?? getPath(row, ["fighter", "first_name"]) ?? "").trim();
  const last = String(getPath(row, ["last_name"]) ?? getPath(row, ["fighter", "last_name"]) ?? "").trim();
  const combined = `${first} ${last}`.trim();
  const candidates = [
    combined,
    String(getPath(row, ["name"]) ?? "").trim(),
    String(getPath(row, ["fighter", "name"]) ?? "").trim(),
  ];
  for (const candidate of candidates) {
    if (candidate && !isPlaceholderFighterName(candidate)) {
      return formatFantasyPlayerDisplayName(candidate);
    }
  }
  return "";
}

async function loadCanonicalMmaFighterNamesById(fighterIds: number[]): Promise<Map<number, string>> {
  const byId = new Map<number, string>();
  const ids = Array.from(
    new Set(
      fighterIds
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Math.trunc(value))
    )
  );
  if (ids.length === 0) {
    return byId;
  }

  try {
    const query = new URLSearchParams({ per_page: "100" });
    for (const id of ids) {
      query.append("fighter_ids[]", String(id));
      // Spec and docs both name the param fighter_ids; include both for compatibility.
      query.append("fighter_ids", String(id));
    }
    const rows = await fetchBallDontLieList<Record<string, unknown>>("/mma/v1/fighters", query, 4);
    for (const raw of rows) {
      const fighterId = Number.parseInt(String(raw.id ?? getPath(raw, ["fighter", "id"]) ?? ""), 10);
      const fighterName = extractMmaFighterName(raw);
      if (!Number.isFinite(fighterId) || fighterId <= 0 || !fighterName || byId.has(fighterId)) {
        continue;
      }
      byId.set(fighterId, fighterName);
    }
  } catch {
    // Ignore MMA lookup failures; caller will keep existing fallback names.
  }

  return byId;
}

async function loadCanonicalPlayerNamesById(playerIds: number[]): Promise<Map<number, string>> {
  const byId = new Map<number, string>();
  if (playerIds.length === 0) {
    return byId;
  }

  const ids = Array.from(new Set(playerIds.filter((value) => Number.isFinite(value) && value > 0).map((value) => Math.trunc(value))));
  if (ids.length === 0) {
    return byId;
  }

  // Prefer BDL MMA canonical fighter names first when IDs are present.
  const mmaResolved = await loadCanonicalMmaFighterNamesById(ids);
  for (const [id, name] of mmaResolved.entries()) {
    if (!byId.has(id) && name && !isPlaceholderFighterName(name)) {
      byId.set(id, name);
    }
  }

  if (!supabaseAdmin) {
    return byId;
  }

  const unresolvedIds = ids.filter((id) => !byId.has(id));
  if (unresolvedIds.length === 0) {
    return byId;
  }

  const { data: liveRows } = await supabaseAdmin
    .from("live_player_stats")
    .select("player_id, player_name, source_updated_at")
    .in("player_id", unresolvedIds)
    .order("source_updated_at", { ascending: false })
    .limit(5000);

  for (const raw of (liveRows as Array<Record<string, unknown>> | null) ?? []) {
    const playerId = Number.parseInt(String(raw.player_id ?? ""), 10);
    const playerName = formatFantasyPlayerDisplayName(String(raw.player_name ?? "").trim());
    if (!Number.isFinite(playerId) || playerId <= 0 || !playerName || isPlaceholderFighterName(playerName) || byId.has(playerId)) {
      continue;
    }
    byId.set(playerId, playerName);
  }

  const unresolvedAfterLive = ids.filter((id) => !byId.has(id));
  if (unresolvedAfterLive.length > 0) {
    const { data: headshotRows } = await supabaseAdmin
      .from("fantasy_player_headshots")
      .select("player_id, player_name")
      .in("player_id", unresolvedAfterLive)
      .limit(5000);
    for (const raw of (headshotRows as Array<Record<string, unknown>> | null) ?? []) {
      const playerId = Number.parseInt(String(raw.player_id ?? ""), 10);
      const playerName = formatFantasyPlayerDisplayName(String(raw.player_name ?? "").trim());
      if (!Number.isFinite(playerId) || playerId <= 0 || !playerName || isPlaceholderFighterName(playerName) || byId.has(playerId)) {
        continue;
      }
      byId.set(playerId, playerName);
    }
  }

  return byId;
}

function tokenizeName(value: string): string[] {
  const normalized = normalizeNameKey(value);
  return normalized ? normalized.split(" ").filter(Boolean) : [];
}

function namesLikelyMatch(left: string, right: string): boolean {
  const leftTokens = tokenizeName(left);
  const rightTokens = tokenizeName(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return false;
  }

  const leftNormalized = leftTokens.join(" ");
  const rightNormalized = rightTokens.join(" ");
  if (leftNormalized === rightNormalized) {
    return true;
  }

  if (
    leftTokens.length === 2 &&
    rightTokens.length === 2 &&
    leftTokens[0] === rightTokens[1] &&
    leftTokens[1] === rightTokens[0]
  ) {
    return true;
  }

  const rightSet = new Set(rightTokens);
  const sharedLong = leftTokens.filter((token) => token.length >= 3 && rightSet.has(token));
  if (sharedLong.length === 0) {
    return false;
  }

  const sharedSet = new Set(sharedLong);
  const leftRemainder = leftTokens.filter((token) => !sharedSet.has(token));
  const rightRemainder = rightTokens.filter((token) => !sharedSet.has(token));
  if (leftRemainder.length === 0 || rightRemainder.length === 0) {
    return true;
  }

  return leftRemainder[0]?.charAt(0) === rightRemainder[0]?.charAt(0);
}

function toGameLabel(homeTeam: string, awayTeam: string): string {
  return `${awayTeam} vs. ${homeTeam}`;
}

function parseScore(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }
  return null;
}

function parseTimezoneOffset(input: number | string | undefined): number {
  const parsed = Number.parseInt(String(input ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return new Date().getTimezoneOffset();
  }
  return Math.max(-14 * 60, Math.min(14 * 60, parsed));
}

function parseDateString(date: string | undefined): { year: number; month: number; day: number } | null {
  const raw = String(date ?? "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1] ?? "", 10);
  const month = Number.parseInt(match[2] ?? "", 10);
  const day = Number.parseInt(match[3] ?? "", 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return { year, month, day };
}

function getTodayDateInOffset(tzOffsetMinutes: number): string {
  const now = Date.now();
  const localMs = now - tzOffsetMinutes * 60_000;
  const d = new Date(localMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getServerTodayDate(): string {
  return getTodayDateInOffset(new Date().getTimezoneOffset());
}

function formatUtcDateOffset(offsetDays = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildFantasyDailyGameId(date: string): string {
  return `${FANTASY_DAILY_GAME_ID_PREFIX}${date}`;
}

function parseFantasyDailyGameId(gameId: string): string | null {
  const raw = String(gameId ?? "").trim();
  if (!raw.startsWith(FANTASY_DAILY_GAME_ID_PREFIX)) {
    return null;
  }

  const date = raw.slice(FANTASY_DAILY_GAME_ID_PREFIX.length).trim();
  return parseDateString(date) ? date : null;
}

function buildWnbaFantasyDailyGameId(date: string): string {
  return `${FANTASY_WNBA_DAILY_GAME_ID_PREFIX}${date}`;
}

function parseWnbaFantasyDailyGameId(gameId: string): string | null {
  const raw = String(gameId ?? "").trim();
  if (!raw.startsWith(FANTASY_WNBA_DAILY_GAME_ID_PREFIX)) {
    return null;
  }
  const date = raw.slice(FANTASY_WNBA_DAILY_GAME_ID_PREFIX.length).trim();
  return parseDateString(date) ? date : null;
}

function buildMlbFantasyDailyGameId(date: string): string {
  return `${FANTASY_MLB_DAILY_GAME_ID_PREFIX}${date}`;
}

function parseMlbFantasyDailyGameId(gameId: string): string | null {
  const raw = String(gameId ?? "").trim();
  if (!raw.startsWith(FANTASY_MLB_DAILY_GAME_ID_PREFIX)) {
    return null;
  }
  const date = raw.slice(FANTASY_MLB_DAILY_GAME_ID_PREFIX.length).trim();
  return parseDateString(date) ? date : null;
}

function parseAnyDailyGameId(gameId: string): { date: string; league: "NBA" | "WNBA" | "MLB" } | null {
  const nbaDate = parseFantasyDailyGameId(gameId);
  if (nbaDate) return { date: nbaDate, league: "NBA" };
  const wnbaDate = parseWnbaFantasyDailyGameId(gameId);
  if (wnbaDate) return { date: wnbaDate, league: "WNBA" };
  const mlbDate = parseMlbFantasyDailyGameId(gameId);
  if (mlbDate) return { date: mlbDate, league: "MLB" };
  return null;
}

function toApiIsoNoMs(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function buildUtcRangeForLocalDay(
  date: string | undefined,
  tzOffsetMinutes: number
): { date: string; fromIso: string; toIso: string; fromMs: number; toMs: number } {
  const fallbackDate = getTodayDateInOffset(tzOffsetMinutes);
  const parsed = parseDateString(date) ?? parseDateString(fallbackDate)!;

  const utcStartMs = Date.UTC(parsed.year, parsed.month - 1, parsed.day, 0, 0, 0, 0) + tzOffsetMinutes * 60_000;
  const utcEndMs = utcStartMs + 24 * 60 * 60 * 1000 - 1;

  const dateKey = `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`;

  return {
    date: dateKey,
    fromIso: toApiIsoNoMs(utcStartMs),
    toIso: toApiIsoNoMs(utcEndMs),
    fromMs: utcStartMs,
    toMs: utcEndMs,
  };
}

function toLocalDateKeyByOffset(utcMs: number, tzOffsetMinutes: number): string {
  const localMs = utcMs - tzOffsetMinutes * 60_000;
  const d = new Date(localMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildUtcRangeForLocalWeekContaining(iso: string, tzOffsetMinutes: number): { fromIso: string; toIso: string } | null {
  const utcMs = Date.parse(iso);
  if (!Number.isFinite(utcMs)) {
    return null;
  }

  const localMs = utcMs - tzOffsetMinutes * 60_000;
  const localDate = new Date(localMs);
  const dayOfWeek = localDate.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;

  const weekStartLocalMs =
    Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate(), 0, 0, 0, 0) -
    daysSinceMonday * 24 * 60 * 60 * 1000;
  const weekEndLocalMs = weekStartLocalMs + 7 * 24 * 60 * 60 * 1000 - 1;

  return {
    fromIso: toApiIsoNoMs(weekStartLocalMs + tzOffsetMinutes * 60_000),
    toIso: toApiIsoNoMs(weekEndLocalMs + tzOffsetMinutes * 60_000),
  };
}

function buildUtcRangeForLocalDayContaining(iso: string, tzOffsetMinutes: number): { fromIso: string; toIso: string } | null {
  const utcMs = Date.parse(iso);
  if (!Number.isFinite(utcMs)) {
    return null;
  }

  const localMs = utcMs - tzOffsetMinutes * 60_000;
  const localDate = new Date(localMs);
  const localDateKey = `${localDate.getUTCFullYear()}-${String(localDate.getUTCMonth() + 1).padStart(2, "0")}-${String(
    localDate.getUTCDate()
  ).padStart(2, "0")}`;
  const range = buildUtcRangeForLocalDay(localDateKey, tzOffsetMinutes);
  return { fromIso: range.fromIso, toIso: range.toIso };
}

function parseLineup(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const lineup: string[] = [];

  for (const item of raw) {
    const name =
      item && typeof item === "object" && !Array.isArray(item)
        ? String((item as Record<string, unknown>).player_name ?? (item as Record<string, unknown>).playerName ?? "").trim()
        : String(item ?? "").trim();
    if (!name) {
      continue;
    }
    const key = normalizeNameKey(name);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    lineup.push(name);
  }

  return lineup.slice(0, FANTASY_MAX_LINEUP_SIZE);
}

function parseLineupPlayers(raw: unknown): FantasyLineupPlayer[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<number>();
  const players: FantasyLineupPlayer[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const row = item as Record<string, unknown>;
    const playerIdRaw = Number.parseInt(String(row.player_id ?? row.playerId ?? ""), 10);
    const playerName = String(row.player_name ?? row.playerName ?? "").trim();
    const headshotUrlRaw = String(row.headshot_url ?? row.headshotUrl ?? "").trim();
    if (!Number.isFinite(playerIdRaw) || playerIdRaw <= 0 || !playerName) {
      continue;
    }
    if (seen.has(playerIdRaw)) {
      continue;
    }
    seen.add(playerIdRaw);
    players.push({ playerId: playerIdRaw, playerName, headshotUrl: headshotUrlRaw || null });
  }

  return players.slice(0, FANTASY_MAX_LINEUP_SIZE);
}

function isMlbPitcherPosition(position: string | null | undefined): boolean {
  const normalized = String(position ?? "").trim().toUpperCase();
  if (!normalized) {
    return false;
  }
  const tokens = normalized.split(/[^A-Z]+/).filter(Boolean);
  return tokens.some((token) => token === "P" || token === "SP" || token === "RP" || token === "CP");
}

function getRequiredFantasyLineupSize(params: { gameId?: string; sportKey?: string }): number {
  const gameId = String(params.gameId ?? "").trim();
  const sportKey = String(params.sportKey ?? "").trim();
  const anyDailyId = gameId ? parseAnyDailyGameId(gameId) : null;
  if (anyDailyId?.league === "MLB" || sportKey === FANTASY_MLB_SPORT_KEY) {
    return FANTASY_MLB_LINEUP_SIZE;
  }
  return FANTASY_STANDARD_LINEUP_SIZE;
}

function assertMlbLineupShape(lineup: string[], playerPool: FantasyPlayerPoolItem[]): void {
  const poolByKey = new Map<string, FantasyPlayerPoolItem>();
  for (const item of playerPool) {
    const key = normalizeNameKey(item.playerName);
    if (!key || poolByKey.has(key)) {
      continue;
    }
    poolByKey.set(key, item);
  }

  let pitcherCount = 0;
  let hitterCount = 0;
  for (const playerName of lineup) {
    const item = poolByKey.get(normalizeNameKey(playerName));
    if (!item) {
      throw new Error(`"${playerName}" is not in the available player pool for this slate.`);
    }
    if (isMlbPitcherPosition(item.position)) {
      pitcherCount += 1;
    } else {
      hitterCount += 1;
    }
  }

  if (pitcherCount !== FANTASY_MLB_PITCHER_COUNT || hitterCount !== FANTASY_MLB_HITTER_COUNT) {
    throw new Error(
      `MLB lineups must include exactly ${FANTASY_MLB_PITCHER_COUNT} pitchers and ${FANTASY_MLB_HITTER_COUNT} hitters.`
    );
  }
}

function parseScoreBreakdown(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const entries = Object.entries(raw as Record<string, unknown>);
  const output: Record<string, number> = {};
  for (const [key, value] of entries) {
    const points = typeof value === "number" && Number.isFinite(value) ? value : Number.parseFloat(String(value));
    if (!Number.isFinite(points)) {
      continue;
    }
    output[String(key)] = Number(points.toFixed(2));
  }
  return output;
}

function zeroBreakdownForLineup(lineup: string[]): Record<string, number> {
  const breakdown: Record<string, number> = {};
  for (const playerName of lineup) {
    breakdown[playerName] = 0;
  }
  return breakdown;
}

function mapFantasyEntryRow(row: FantasyEntryRow): FantasyEntry {
  const lineupPlayers = parseLineupPlayers(row.lineup);
  return {
    id: row.id,
    userId: row.user_id,
    venueId: row.venue_id,
    sportKey: row.sport_key,
    gameId: row.game_id,
    gameLabel: row.game_label,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    startsAt: row.starts_at,
    lineup: lineupPlayers.map((player) => player.playerName),
    lineupPlayers,
    status: row.status,
    points: Number(Number(row.points ?? 0).toFixed(2)),
    scoreBreakdown: parseScoreBreakdown(row.score_breakdown),
    rewardPoints: Math.max(0, Number(row.reward_points ?? 0)),
    rewardClaimedAt: row.reward_claimed_at,
    liveCollectedPoints: Math.max(0, Number(row.live_collected_points ?? 0)),
    statsLastSourceUpdatedAt: row.stats_last_source_updated_at,
    settledAt: row.settled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function sanitizeFantasyEntriesForOutbound(entries: FantasyEntry[]): Promise<FantasyEntry[]> {
  if (entries.length === 0) {
    return entries;
  }

  const names = entries.flatMap((entry) => entry.lineupPlayers.map((player) => player.playerName));
  const headshotByName = await loadNbaHeadshotsByName(names, ["NBA", "WNBA"]);
  const placeholderIds = entries
    .flatMap((entry) => entry.lineupPlayers)
    .filter((player) => player.playerId > 0 && isPlaceholderFighterName(player.playerName))
    .map((player) => player.playerId);
  const canonicalNameById = await loadCanonicalPlayerNamesById(placeholderIds);

  return entries.map((entry) => ({
    ...entry,
    lineupPlayers: entry.lineupPlayers.map((player) => {
      const resolvedName =
        isPlaceholderFighterName(player.playerName) && canonicalNameById.has(player.playerId)
          ? canonicalNameById.get(player.playerId) ?? player.playerName
          : player.playerName;
      return {
        ...player,
        playerName: resolvedName,
        headshotUrl: player.headshotUrl ?? headshotByName.get(normalizeNameKey(resolvedName)) ?? null,
      };
    }),
  }));
}

async function sanitizeFantasyEntryForOutbound(entry: FantasyEntry): Promise<FantasyEntry> {
  const [sanitized] = await sanitizeFantasyEntriesForOutbound([entry]);
  return sanitized ?? entry;
}

async function listApiSportsGamesForLocalDay(date: string | undefined, tzOffsetMinutes: number): Promise<ApiSportsNbaGame[]> {
  const range = buildUtcRangeForLocalDay(date, tzOffsetMinutes);
  const candidateDates = Array.from(
    new Set([
      new Date(range.fromMs - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      new Date(range.fromMs).toISOString().slice(0, 10),
      new Date(range.toMs).toISOString().slice(0, 10),
      new Date(range.toMs + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    ])
  );
  const rowsByDate = await Promise.all(candidateDates.map((candidate) => fetchApiSportsNbaGamesByDate(candidate)));
  const uniqueByGameId = new Map<string, ApiSportsNbaGame>();
  for (const row of rowsByDate.flat()) {
    const id = getApiSportsGameId(row);
    if (!id || uniqueByGameId.has(id)) {
      continue;
    }
    const leagueName = String(getPath(row, ["league", "name"]) ?? "").trim().toLowerCase();
    if (leagueName && !leagueName.includes("nba")) {
      continue;
    }
    const startsAtMs = parseApiSportsGameStartMs(row);
    if (!Number.isFinite(startsAtMs) || startsAtMs < range.fromMs || startsAtMs > range.toMs) {
      continue;
    }
    if (toLocalDateKeyByOffset(startsAtMs, tzOffsetMinutes) !== range.date) {
      continue;
    }
    uniqueByGameId.set(id, row);
  }
  return Array.from(uniqueByGameId.values());
}

async function listWnbaGamesForLocalDay(date: string | undefined, tzOffsetMinutes: number): Promise<ApiSportsNbaGame[]> {
  const range = buildUtcRangeForLocalDay(date, tzOffsetMinutes);
  const candidateDates = Array.from(
    new Set([
      new Date(range.fromMs - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      new Date(range.fromMs).toISOString().slice(0, 10),
      new Date(range.toMs).toISOString().slice(0, 10),
      new Date(range.toMs + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    ])
  );
  const rowsByDate = await Promise.all(candidateDates.map((candidate) => fetchBdlWnbaGamesByDate(candidate)));
  const uniqueByGameId = new Map<string, ApiSportsNbaGame>();
  for (const row of rowsByDate.flat()) {
    const id = getApiSportsGameId(row);
    if (!id || uniqueByGameId.has(id)) {
      continue;
    }
    const startsAtMs = parseApiSportsGameStartMs(row);
    if (!Number.isFinite(startsAtMs) || startsAtMs < range.fromMs || startsAtMs > range.toMs) {
      continue;
    }
    if (toLocalDateKeyByOffset(startsAtMs, tzOffsetMinutes) !== range.date) {
      continue;
    }
    uniqueByGameId.set(id, row);
  }
  return Array.from(uniqueByGameId.values());
}

function rowsToFantasyGames(rows: ApiSportsNbaGame[], sportKey: string, league: string): FantasyGame[] {
  const games: FantasyGame[] = [];
  for (const row of rows) {
    const startsAtMs = parseApiSportsGameStartMs(row);
    if (!Number.isFinite(startsAtMs)) {
      continue;
    }

    const homeTeam = getApiSportsGameTeamName(row, "home");
    const awayTeam = getApiSportsGameTeamName(row, "away");
    if (!homeTeam || !awayTeam) {
      continue;
    }

    const isFinal = isApiSportsGameFinal(row);
    const isStarted = isApiSportsGameStarted(row);
    const status: FantasyGameStatus = isFinal ? "final" : isStarted ? "live" : "scheduled";
    const homeScore = parseScore(getPath(row, ["scores", "home", "points"]) ?? getPath(row, ["scores", "home", "total"]));
    const awayScore = parseScore(
      getPath(row, ["scores", "visitors", "points"]) ??
        getPath(row, ["scores", "away", "points"]) ??
        getPath(row, ["scores", "visitors", "total"]) ??
        getPath(row, ["scores", "away", "total"])
    );

    games.push({
      id: getApiSportsGameId(row),
      sportKey,
      league,
      startsAt: new Date(startsAtMs).toISOString(),
      gameLabel: toGameLabel(homeTeam, awayTeam),
      homeTeam,
      awayTeam,
      status,
      homeScore,
      awayScore,
      isLocked: status !== "scheduled",
    });
  }
  return games;
}

export async function listFantasyGames(params?: {
  date?: string;
  tzOffsetMinutes?: number | string;
  limit?: number;
}): Promise<FantasyGame[]> {
  const limit = Math.max(1, Math.min(40, Number(params?.limit ?? 20)));
  const tzOffsetMinutes = parseTimezoneOffset(params?.tzOffsetMinutes);

  const [nbaRows, wnbaRows, mlbRows] = await Promise.all([
    listApiSportsGamesForLocalDay(params?.date, tzOffsetMinutes),
    listWnbaGamesForLocalDay(params?.date, tzOffsetMinutes),
    listMlbGamesForLocalDay(params?.date, tzOffsetMinutes),
  ]);

  const games: FantasyGame[] = [
    ...rowsToFantasyGames(nbaRows, FANTASY_SPORT_KEY, "NBA"),
    ...rowsToFantasyGames(wnbaRows, FANTASY_WNBA_SPORT_KEY, "WNBA"),
    ...rowsToFantasyGames(mlbRows, FANTASY_MLB_SPORT_KEY, "MLB"),
  ];

  games.sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
  return games.slice(0, limit);
}

function extractApiSportsPlayerId(row: Record<string, unknown>): number | null {
  const candidates = [
    row.id,
    getPath(row, ["player", "id"]),
    getPath(row, ["player", "player_id"]),
  ];
  for (const candidate of candidates) {
    const parsed = Number.parseInt(String(candidate ?? ""), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function extractApiSportsDirectoryPlayerName(row: Record<string, unknown>): string {
  const candidates = [
    String(getPath(row, ["player", "full_name"]) ?? "").trim(),
    String(getPath(row, ["player", "display_name"]) ?? "").trim(),
    String(getPath(row, ["player", "name"]) ?? "").trim(),
    String(getPath(row, ["name"]) ?? "").trim(),
    String(getPath(row, ["athlete", "displayName"]) ?? "").trim(),
    String(getPath(row, ["athlete", "fullName"]) ?? "").trim(),
    String(getPath(row, ["fighter", "name"]) ?? "").trim(),
    String(getPath(row, ["fighter_name"]) ?? "").trim(),
    String(getPath(row, ["contestant", "name"]) ?? "").trim(),
  ];

  const first = String(
    getPath(row, ["firstname"]) ??
      getPath(row, ["first_name"]) ??
      getPath(row, ["player", "firstname"]) ??
      getPath(row, ["player", "first_name"]) ??
      getPath(row, ["fighter", "firstname"]) ??
      getPath(row, ["fighter", "first_name"]) ??
      ""
  ).trim();
  const last = String(
    getPath(row, ["lastname"]) ??
      getPath(row, ["last_name"]) ??
      getPath(row, ["player", "lastname"]) ??
      getPath(row, ["player", "last_name"]) ??
      getPath(row, ["fighter", "lastname"]) ??
      getPath(row, ["fighter", "last_name"]) ??
      ""
  ).trim();
  const combined = `${first} ${last}`.trim();
  if (combined) {
    candidates.unshift(combined);
  }

  for (const candidate of candidates) {
    if (candidate && !isPlaceholderFighterName(candidate)) {
      return candidate;
    }
  }

  return candidates.find(Boolean) ?? "";
}

function extractApiSportsDirectoryTeamId(row: Record<string, unknown>): number | null {
  const candidates = [
    getPath(row, ["team", "id"]),
    getPath(row, ["team", "team_id"]),
    getPath(row, ["teams", "id"]),
    getPath(row, ["league", "team", "id"]),
    getPath(row, ["leagues", "standard", "team", "id"]),
  ];
  for (const candidate of candidates) {
    const parsed = Number.parseInt(String(candidate ?? ""), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function extractApiSportsDirectoryTeamName(row: Record<string, unknown>): string {
  const raw = String(
    getPath(row, ["team", "name"]) ??
      getPath(row, ["teams", "name"]) ??
      getPath(row, ["leagues", "standard", "team", "name"]) ??
      ""
  ).trim();
  return raw;
}

function extractApiSportsDirectoryTeamAbbreviation(row: Record<string, unknown>): string {
  return String(
    getPath(row, ["team", "abbreviation"]) ??
      getPath(row, ["teams", "abbreviation"]) ??
      ""
  ).trim();
}

function extractApiSportsDirectoryPosition(row: Record<string, unknown>): string {
  return String(
    getPath(row, ["position"]) ??
      getPath(row, ["player", "position"]) ??
      ""
  ).trim();
}

function extractApiSportsDirectoryHeadshotUrl(row: Record<string, unknown>): string | null {
  const raw = String(
    getPath(row, ["headshot_url"]) ??
      getPath(row, ["player", "headshot_url"]) ??
      getPath(row, ["draft_kings_picture_url"]) ??
      getPath(row, ["picture_url"]) ??
      ""
  ).trim();
  return raw.startsWith("http") ? raw : null;
}

async function upsertActivePlayersToDb(seeds: ApiSportsPoolSeed[], league: string): Promise<void> {
  if (!supabaseAdmin || seeds.length === 0) return;
  const leagueNorm = league.toUpperCase();
  const dbLeague = leagueNorm === "WNBA" ? "WNBA" : leagueNorm === "MLB" ? "MLB" : "NBA";
  const records = seeds
    .filter((s) => s.playerId && s.playerName)
    .map((s) => ({
      external_id: String(s.playerId),
      player_name: s.playerName,
      league: dbLeague,
      ...(s.headshotUrl ? { headshot_url: s.headshotUrl } : {}),
    }));
  if (!records.length) return;
  try {
    await supabaseAdmin.from("players").upsert(records, {
      onConflict: "external_id,league",
      ignoreDuplicates: false,
    });
    // Fire-and-forget TheSportsDB fallback for players BDL didn't provide a headshot for.
    void backfillMissingHeadshotsFromTheSportsDb(
      seeds.filter((s) => !s.headshotUrl && s.playerId && s.playerName),
      dbLeague
    );
  } catch {
    // Non-fatal: best-effort player record sync
  }
}

async function backfillMissingHeadshotsFromTheSportsDb(
  seeds: Array<{ playerId: number | null; playerName: string }>,
  dbLeague: string
): Promise<void> {
  if (!supabaseAdmin || seeds.length === 0) return;
  // Cap per pool-load to avoid hammering TheSportsDB rate limits.
  const toProcess = seeds.filter((s) => s.playerId && s.playerName).slice(0, 10);
  for (const seed of toProcess) {
    if (!seed.playerId || !seed.playerName) continue;
    try {
      const { data } = await supabaseAdmin
        .from("players")
        .select("headshot_url")
        .eq("external_id", String(seed.playerId))
        .eq("league", dbLeague)
        .maybeSingle<{ headshot_url: string | null }>();
      if (data?.headshot_url) continue;
      const headshotUrl = await fetchTheSportsDbHeadshot(seed.playerName);
      if (!headshotUrl) continue;
      await supabaseAdmin
        .from("players")
        .update({ headshot_url: headshotUrl })
        .eq("external_id", String(seed.playerId))
        .eq("league", dbLeague);
    } catch {
      // Per-player failure is non-fatal.
    }
  }
}

function formatFantasyPlayerDisplayName(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return "";
  }
  // Preserve punctuation/casing when already present.
  if (trimmed.includes(".")) {
    return trimmed;
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0] ?? "";
    const looksLikeInitialBlock = /^[A-Za-z]{2,3}$/.test(first);
    if (looksLikeInitialBlock) {
      const initials = first
        .toUpperCase()
        .split("")
        .map((ch) => `${ch}.`)
        .join("");
      return `${initials} ${parts.slice(1).join(" ")}`.trim();
    }
  }

  return trimmed;
}

function isApiSportsDirectoryPlayerActive(row: Record<string, unknown>): boolean {
  const direct = getPath(row, ["active"]);
  const standard = getPath(row, ["leagues", "standard", "active"]);
  const value = standard ?? direct;
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value > 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return true;
    if (["false", "0", "no", "inactive"].includes(normalized)) return false;
    if (["true", "1", "yes", "active"].includes(normalized)) return true;
  }
  return true;
}

function getApiSportsGameTeamId(game: ApiSportsNbaGame, side: "home" | "away"): number | null {
  const raw =
    side === "home"
      ? getPath(game, ["teams", "home", "id"])
      : getPath(game, ["teams", "visitors", "id"]) ?? getPath(game, ["teams", "away", "id"]);
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getApiSportsGameSeason(game: ApiSportsNbaGame): number | null {
  const parsed = Number.parseInt(String(getPath(game, ["league", "season"]) ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function fetchApiSportsNbaTeamPlayers(teamId: number, season: number | null): Promise<Record<string, unknown>[]> {
  const normalizedTeamId = Math.trunc(teamId);
  const normalizedSeason = Number.isFinite(Number(season)) && (season ?? 0) > 0 ? Math.trunc(season as number) : null;
  const cacheKey = `team:${normalizedTeamId}:season:${normalizedSeason ?? "na"}`;
  const cached = apiSportsTeamPlayersCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  // Use the active endpoint so we only expose currently rostered players
  // for teams in today's slate, not historical team-season memberships.
  const baseActiveQuery = new URLSearchParams({ per_page: "100", "team_ids[]": String(normalizedTeamId) });
  const activeRowsRaw = await fetchBallDontLieList<Record<string, unknown>>("/nba/v1/players/active", baseActiveQuery, 5);
  const mapBdlNbaRow = (row: Record<string, unknown>): Record<string, unknown> => {
    const team = asRecord(row.team);
    return {
      player: {
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        name: `${String(row.first_name ?? "").trim()} ${String(row.last_name ?? "").trim()}`.trim(),
      },
      team: {
        id: team.id,
        name: team.full_name ?? team.name,
        abbreviation: team.abbreviation,
      },
      position: row.position,
      // Capture any headshot URL BDL exposes (field name varies by plan tier).
      headshot_url: row.draft_kings_picture_url ?? row.headshot_url ?? row.picture_url ?? null,
      active: true,
    } as Record<string, unknown>;
  };

  let rows = activeRowsRaw.map((row) => asRecord(row)).map(mapBdlNbaRow);

  if (rows.length === 0) {
    const fallbackQuery = new URLSearchParams({ per_page: "100", "team_ids[]": String(normalizedTeamId) });
    if (normalizedSeason) {
      fallbackQuery.set("seasons[]", String(normalizedSeason));
    }
    const fallbackRowsRaw = await fetchBallDontLieList<Record<string, unknown>>("/nba/v1/players", fallbackQuery, 5);
    // Only include players marked active — prevents historical/retired players from
    // the non-active endpoint from entering the draft pool.
    rows = fallbackRowsRaw
      .map((row) => asRecord(row))
      .filter((row) => isApiSportsDirectoryPlayerActive(row))
      .map(mapBdlNbaRow);
  }

  const matchedByTeamId = rows.filter((row) => extractApiSportsDirectoryTeamId(row) === normalizedTeamId);
  if (matchedByTeamId.length > 0) {
    apiSportsTeamPlayersCache.set(cacheKey, { value: matchedByTeamId, expiresAt: Date.now() + APISPORTS_TEAM_PLAYERS_TTL_MS });
    return matchedByTeamId;
  }

  apiSportsTeamPlayersCache.set(cacheKey, { value: [], expiresAt: Date.now() + 60_000 });
  return [];
}

async function fetchWnbaTeamPlayers(teamId: number, season: number | null): Promise<Record<string, unknown>[]> {
  const normalizedTeamId = Math.trunc(teamId);
  const normalizedSeason = Number.isFinite(Number(season)) && (season ?? 0) > 0 ? Math.trunc(season as number) : null;
  const cacheKey = `wnba-team:${normalizedTeamId}:season:${normalizedSeason ?? "na"}`;
  const cached = wnbaTeamPlayersCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const baseActiveQuery = new URLSearchParams({ per_page: "100", "team_ids[]": String(normalizedTeamId) });
  const activeRowsRaw = await fetchBallDontLieList<Record<string, unknown>>("/wnba/v1/players/active", baseActiveQuery, 5);
  const mapBdlWnbaRow = (row: Record<string, unknown>): Record<string, unknown> => {
    const team = asRecord(row.team);
    return {
      player: {
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        name: `${String(row.first_name ?? "").trim()} ${String(row.last_name ?? "").trim()}`.trim(),
      },
      team: {
        id: team.id,
        name: team.full_name ?? team.name,
        abbreviation: team.abbreviation,
      },
      position: row.position,
      headshot_url: row.draft_kings_picture_url ?? row.headshot_url ?? row.picture_url ?? null,
      active: true,
    } as Record<string, unknown>;
  };

  let rows = activeRowsRaw.map((row) => asRecord(row)).map(mapBdlWnbaRow);

  if (rows.length === 0) {
    const fallbackQuery = new URLSearchParams({ per_page: "100", "team_ids[]": String(normalizedTeamId) });
    if (normalizedSeason) {
      fallbackQuery.set("seasons[]", String(normalizedSeason));
    }
    const fallbackRowsRaw = await fetchBallDontLieList<Record<string, unknown>>("/wnba/v1/players", fallbackQuery, 5);
    rows = fallbackRowsRaw
      .map((row) => asRecord(row))
      .filter((row) => isApiSportsDirectoryPlayerActive(row))
      .map(mapBdlWnbaRow);
  }

  const matchedByTeamId = rows.filter((row) => extractApiSportsDirectoryTeamId(row) === normalizedTeamId);
  const result = matchedByTeamId.length > 0 ? matchedByTeamId : [];
  wnbaTeamPlayersCache.set(cacheKey, { value: result, expiresAt: Date.now() + APISPORTS_TEAM_PLAYERS_TTL_MS });
  return result;
}

type RecentFantasySample = {
  avg: number;
  samples: number;
};

function chunkIds<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function computeProjectionFromBoxScore(pts: number, reb: number, ast: number, stl: number, blk: number, tov: number): number {
  return pts * 1.0 + reb * 1.2 + ast * 1.5 + stl * 3.0 + blk * 3.0 + tov * -1.0;
}

async function loadRecentFantasySamplesByPlayerId(
  playerIds: number[],
  leagueName = "NBA",
): Promise<{ samples: Map<number, RecentFantasySample>; foundIds: Set<number> }> {
  const samples = new Map<number, RecentFantasySample>();
  const foundIds = new Set<number>();
  if (!supabaseAdmin || playerIds.length === 0) {
    return { samples, foundIds };
  }

  const ids = Array.from(new Set(playerIds.filter((value) => Number.isFinite(value) && value > 0).map((value) => Math.trunc(value))));
  if (ids.length === 0) {
    return { samples, foundIds };
  }

  const { data } = await supabaseAdmin
    .from("live_player_stats")
    .select("player_id, game_id, total_fantasy_points, pts, ast, reb, stl, blk, turnovers, source_updated_at")
    .in("player_id", ids)
    .eq("league_name", leagueName)
    .order("source_updated_at", { ascending: false })
    .limit(20000);

  const latestByPlayerGame = new Map<string, number>();
  for (const raw of (data as Array<Record<string, unknown>> | null) ?? []) {
    const playerId = Number.parseInt(String(raw.player_id ?? ""), 10);
    const gameId = String(raw.game_id ?? "").trim();
    if (!Number.isFinite(playerId) || playerId <= 0 || !gameId) {
      continue;
    }
    foundIds.add(playerId);
    const key = `${playerId}::${gameId}`;
    if (latestByPlayerGame.has(key)) {
      continue;
    }
    const tfp = Number(raw.total_fantasy_points ?? 0);
    const points =
      tfp > 0
        ? tfp
        : computeProjectionFromBoxScore(
            Number(raw.pts ?? 0),
            Number(raw.reb ?? 0),
            Number(raw.ast ?? 0),
            Number(raw.stl ?? 0),
            Number(raw.blk ?? 0),
            Number(raw.turnovers ?? 0),
          );
    latestByPlayerGame.set(key, points);
  }

  const totals = new Map<number, { sum: number; count: number }>();
  for (const [key, points] of latestByPlayerGame) {
    const playerId = Number.parseInt(key.split("::")[0] ?? "", 10);
    if (!Number.isFinite(playerId) || playerId <= 0) {
      continue;
    }
    const current = totals.get(playerId) ?? { sum: 0, count: 0 };
    current.sum += Number.isFinite(points) ? points : 0;
    current.count += 1;
    totals.set(playerId, current);
  }

  for (const [playerId, agg] of totals) {
    if (agg.count <= 0) continue;
    samples.set(playerId, {
      avg: Number((agg.sum / agg.count).toFixed(1)),
      samples: agg.count,
    });
  }

  return { samples, foundIds };
}

async function loadWnbaGameStatProjections(playerIds: number[]): Promise<Map<number, number>> {
  const projections = new Map<number, number>();
  if (playerIds.length === 0) return projections;

  // Look back 400 days to capture the previous full WNBA season (May–Sep) plus any
  // early-season games from the current year. WNBA season year == calendar year.
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  type StatAgg = { pts: number; reb: number; ast: number; stl: number; blk: number; tov: number; count: number };
  const totals = new Map<number, StatAgg>();

  for (const chunk of chunkIds(playerIds, 25)) {
    try {
      const query = new URLSearchParams({ start_date: startDate, end_date: endDate, per_page: "100" });
      for (const id of chunk) {
        query.append("player_ids[]", String(id));
      }
      const rows = await fetchBallDontLieList<Record<string, unknown>>("/wnba/v1/stats", query, 5);
      for (const raw of rows) {
        const player = asRecord(asRecord(raw).player ?? {});
        const playerId = Number.parseInt(String(player.id ?? raw.player_id ?? ""), 10);
        if (!Number.isFinite(playerId) || playerId <= 0) continue;
        const agg = totals.get(playerId) ?? { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, count: 0 };
        agg.pts += Number(raw.pts ?? 0);
        agg.reb += Number(raw.reb ?? 0);
        agg.ast += Number(raw.ast ?? 0);
        agg.stl += Number(raw.stl ?? 0);
        agg.blk += Number(raw.blk ?? 0);
        agg.tov += Number(raw.turnover ?? raw.to ?? 0);
        agg.count += 1;
        totals.set(playerId, agg);
      }
    } catch {
      // /wnba/v1/stats unavailable or not on this BDL plan tier; leave projections null
    }
  }

  for (const [playerId, agg] of totals) {
    if (agg.count === 0) continue;
    const proj = computeProjectionFromBoxScore(
      agg.pts / agg.count,
      agg.reb / agg.count,
      agg.ast / agg.count,
      agg.stl / agg.count,
      agg.blk / agg.count,
      agg.tov / agg.count,
    );
    projections.set(playerId, Number(proj.toFixed(1)));
  }

  return projections;
}

async function loadBdlSeasonAverageProjections(playerIds: number[], leagueName: string): Promise<Map<number, number>> {
  const projections = new Map<number, number>();
  if (playerIds.length === 0) {
    return projections;
  }

  // BDL has no season-averages endpoint for WNBA — compute from individual game stats instead.
  if (leagueName.toUpperCase() === "WNBA") {
    return loadWnbaGameStatProjections(playerIds);
  }

  // BDL uses the season start year: 2025 for the 2025-26 NBA season.
  // Jan–Sep belong to the season that started the previous October.
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-based
  const season = month >= 10 ? year : year - 1;

  // /general is proven to work in sportsBingo.ts; try it first, then base path.
  const endpointCandidates = ["/nba/v1/season_averages/general", "/nba/v1/season_averages"];
  // Regular season first; retry without season_type qualifier if empty.
  const seasonTypeCandidates: Array<string | null> = ["regular", null];

  const chunks = chunkIds(playerIds, 100);
  for (const chunk of chunks) {
    let resolved = false;
    for (const endpoint of endpointCandidates) {
      if (resolved) break;
      for (const seasonType of seasonTypeCandidates) {
        if (resolved) break;
        try {
          // type: "base" is required by BDL — omitting it causes 400.
          const seasonQuery = new URLSearchParams({ season: String(season), type: "base", per_page: "100" });
          if (seasonType) seasonQuery.set("season_type", seasonType);
          for (const id of chunk) {
            seasonQuery.append("player_ids[]", String(id));
          }

          console.log("[BDL SEASON AVG] FETCH URL:", `${endpoint}?${seasonQuery.toString().slice(0, 300)}`);

          const rows = await fetchBallDontLieList<Record<string, unknown>>(endpoint, seasonQuery, 1);

          console.log("[BDL SEASON AVG] RAW RESPONSE SAMPLE:", JSON.stringify(rows[0] ?? null).slice(0, 500));
          console.log("[BDL SEASON AVG] ROW COUNT:", rows.length, "| endpoint:", endpoint, "| season_type:", seasonType ?? "none");

          if (rows.length === 0) continue;

          for (const row of rows) {
            // Response shape A (with /general): { player: { id }, stats: { pts, reb, ast, stl, blk, turnover } }
            // Response shape B (without /general): { player_id, pts, reb, ast, stl, blk, turnover, ... }
            const playerRecord = asRecord(row.player ?? {});
            const playerId = Number.parseInt(
              String(playerRecord.id ?? row.player_id ?? ""),
              10,
            );
            if (!Number.isFinite(playerId) || playerId <= 0) continue;

            // Prefer nested stats object; fall back to top-level keys.
            const stats = Object.keys(asRecord(row.stats)).length > 0 ? asRecord(row.stats) : row;
            const proj = computeProjectionFromBoxScore(
              Number((stats as Record<string, unknown>).pts ?? 0),
              Number((stats as Record<string, unknown>).reb ?? 0),
              Number((stats as Record<string, unknown>).ast ?? 0),
              Number((stats as Record<string, unknown>).stl ?? 0),
              Number((stats as Record<string, unknown>).blk ?? 0),
              Number((stats as Record<string, unknown>).turnover ?? (stats as Record<string, unknown>).to ?? 0),
            );
            projections.set(playerId, Number(proj.toFixed(1)));
          }

          resolved = true;
        } catch (err) {
          console.warn("[BDL SEASON AVG] fetch error:", endpoint, seasonType, String(err));
        }
      }
    }
  }

  return projections;
}

async function loadRecentTeamScopedPlayerSeeds(teamNames: string[]): Promise<ApiSportsPoolSeed[]> {
  if (!supabaseAdmin || teamNames.length === 0) {
    return [];
  }

  const targetNames = teamNames.map((name) => name.trim()).filter(Boolean);
  if (targetNames.length === 0) {
    return [];
  }

  const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("live_player_stats")
    .select("player_id, player_name, team_name, source_updated_at")
    .eq("league_name", "NBA")
    .gte("source_updated_at", sinceIso)
    .order("source_updated_at", { ascending: false })
    .limit(20000);

  const seen = new Set<string>();
  const seeds: ApiSportsPoolSeed[] = [];
  for (const raw of (data as Array<Record<string, unknown>> | null) ?? []) {
    const teamName = String(raw.team_name ?? "").trim();
    if (!teamName || !targetNames.some((target) => teamsMatch(teamName, target))) {
      continue;
    }
    const playerName = formatFantasyPlayerDisplayName(String(raw.player_name ?? "").trim());
    const playerId = Number.parseInt(String(raw.player_id ?? ""), 10);
    if (!playerName || isPlaceholderFighterName(playerName) || !Number.isFinite(playerId) || playerId <= 0) {
      continue;
    }
    const key = `${playerId}::${normalizeNameKey(playerName)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    seeds.push({ playerId, playerName, source: "live" });
  }
  return seeds;
}

type ApiSportsPoolSeed = {
  playerId: number | null;
  playerName: string;
  source: "roster" | "stats" | "live";
  position?: string | null;
  team?: string | null;
  headshotUrl?: string | null;
};

function addApiSportsPoolSeed(map: Map<string, ApiSportsPoolSeed>, seed: ApiSportsPoolSeed): void {
  const key = normalizeNameKey(seed.playerName);
  if (!key) {
    return;
  }
  const priority = (source: ApiSportsPoolSeed["source"]): number => {
    if (source === "roster") return 3;
    if (source === "stats") return 2;
    return 1;
  };

  if (seed.playerId && seed.playerId > 0) {
    for (const [existingKey, existing] of map.entries()) {
      if ((existing.playerId ?? 0) !== seed.playerId) {
        continue;
      }

      if (existingKey === key) {
        if (priority(seed.source) >= priority(existing.source)) {
          map.set(existingKey, seed);
        }
        return;
      }

      if (priority(seed.source) > priority(existing.source)) {
        map.delete(existingKey);
        map.set(key, seed);
      }
      return;
    }
  }

  const existingByName = map.get(key);
  if (!existingByName) {
    map.set(key, seed);
    return;
  }

  if (priority(seed.source) > priority(existingByName.source)) {
    map.set(key, seed);
    return;
  }
  if ((!existingByName.playerId || existingByName.playerId <= 0) && seed.playerId && seed.playerId > 0) {
    map.set(key, { ...existingByName, playerId: seed.playerId });
  }
}

async function loadFantasyPlayerPoolFromApiSportsGames(games: ApiSportsNbaGame[]): Promise<FantasyPlayerPoolItem[]> {
  if (games.length === 0) {
    return [];
  }

  const leagueNamesInPool = new Set(
    games.map((game) => String(getPath(game, ["league", "name"]) ?? "").trim().toUpperCase())
  );
  const isWnba = leagueNamesInPool.has("WNBA");
  const isMlb = leagueNamesInPool.has("MLB");
  const teamPlayersFetcher = isWnba
    ? fetchWnbaTeamPlayers
    : isMlb
    ? fetchMlbTeamPlayers
    : fetchApiSportsNbaTeamPlayers;
  const poolLeague = isWnba ? "WNBA" : isMlb ? "MLB" : "NBA";

  const allowedTeamIds = new Set<number>();
  const allowedTeamNames = new Set<string>();
  for (const game of games) {
    const homeTeamId = getApiSportsGameTeamId(game, "home");
    const awayTeamId = getApiSportsGameTeamId(game, "away");
    if (homeTeamId) allowedTeamIds.add(homeTeamId);
    if (awayTeamId) allowedTeamIds.add(awayTeamId);
    const homeName = getApiSportsGameTeamName(game, "home");
    const awayName = getApiSportsGameTeamName(game, "away");
    if (homeName) allowedTeamNames.add(homeName);
    if (awayName) allowedTeamNames.add(awayName);
  }

  const poolSeedByName = new Map<string, ApiSportsPoolSeed>();
  const teamSeasonPairs = new Map<string, { teamId: number; season: number | null }>();
  const teamNameByTeamId = new Map<number, string>();
  for (const game of games) {
    const season = getApiSportsGameSeason(game);
    const homeTeamId = getApiSportsGameTeamId(game, "home");
    const awayTeamId = getApiSportsGameTeamId(game, "away");
    const homeTeamName = getApiSportsGameTeamName(game, "home");
    const awayTeamName = getApiSportsGameTeamName(game, "away");
    if (homeTeamId) {
      teamSeasonPairs.set(`${homeTeamId}:${season ?? "na"}`, { teamId: homeTeamId, season });
      if (homeTeamName) {
        teamNameByTeamId.set(homeTeamId, homeTeamName);
      }
    }
    if (awayTeamId) {
      teamSeasonPairs.set(`${awayTeamId}:${season ?? "na"}`, { teamId: awayTeamId, season });
      if (awayTeamName) {
        teamNameByTeamId.set(awayTeamId, awayTeamName);
      }
    }
  }

  for (const { teamId, season } of teamSeasonPairs.values()) {
    const rows = await teamPlayersFetcher(teamId, season);
    const expectedTeamName = teamNameByTeamId.get(teamId) ?? "";
    for (const row of rows) {
      if (!isApiSportsDirectoryPlayerActive(row)) {
        continue;
      }
      const rowTeamId = extractApiSportsDirectoryTeamId(row);
      const rowTeamName = extractApiSportsDirectoryTeamName(row);
      if (rowTeamId && allowedTeamIds.size > 0 && !allowedTeamIds.has(rowTeamId)) {
        continue;
      }
      if (!rowTeamId && rowTeamName && allowedTeamNames.size > 0 && !Array.from(allowedTeamNames).some((name) => teamsMatch(name, rowTeamName))) {
        continue;
      }
      if (rowTeamId !== teamId && (!rowTeamName || !expectedTeamName || !teamsMatch(rowTeamName, expectedTeamName))) {
        continue;
      }
      const playerName = formatFantasyPlayerDisplayName(extractApiSportsDirectoryPlayerName(row));
      if (!playerName) {
        continue;
      }
      addApiSportsPoolSeed(poolSeedByName, {
        playerId: extractApiSportsPlayerId(row),
        playerName,
        source: "roster",
        position: extractApiSportsDirectoryPosition(row) || null,
        team: extractApiSportsDirectoryTeamAbbreviation(row) || extractApiSportsDirectoryTeamName(row) || null,
        headshotUrl: extractApiSportsDirectoryHeadshotUrl(row),
      });
    }
  }

  // Fallback: if team roster endpoints are unavailable, derive names from game player-stat feeds.
  if (poolSeedByName.size === 0) {
    for (const game of games) {
      const gameId = getApiSportsGameId(game);
      if (!gameId) {
        continue;
      }
      const stats = await fetchApiSportsNbaPlayerStats(gameId);
      for (const rowUnknown of stats) {
        const row = asRecord(rowUnknown);
        const playerName = formatFantasyPlayerDisplayName(extractApiSportsPlayerName(row));
        if (!playerName) {
          continue;
        }
        const statTeamName = String(getPath(row, ["team", "name"]) ?? "").trim();
        if (statTeamName && allowedTeamNames.size > 0 && !Array.from(allowedTeamNames).some((name) => teamsMatch(name, statTeamName))) {
          continue;
        }
        addApiSportsPoolSeed(poolSeedByName, {
          playerId: extractApiSportsPlayerId(row),
          playerName,
          source: "stats",
          team: statTeamName || null,
        });
      }
    }
  }

  // Snapshot of confirmed-active player name keys (from BDL /active roster).
  // Used below to prevent historical players in live_player_stats from entering the pool.
  const rosterPlayerKeys = new Set<string>();
  for (const [key, seed] of poolSeedByName) {
    if (seed.source === "roster") {
      rosterPlayerKeys.add(key);
    }
  }

  // Upsert active players (and any headshots BDL provides) into the players table
  // so future headshot lookups via loadNbaHeadshotsByName resolve correctly.
  void upsertActivePlayersToDb(
    Array.from(poolSeedByName.values()).filter((s) => s.source === "roster"),
    poolLeague,
  );

  if (FANTASY_ENABLE_POOL_LIVE_ENRICH) {
    const scheduledTeamNames = Array.from(
      new Set(
        games
          .flatMap((game) => [getApiSportsGameTeamName(game, "home"), getApiSportsGameTeamName(game, "away")])
          .map((name) => name.trim())
          .filter(Boolean)
      )
    );
    const recentTeamSeeds = await loadRecentTeamScopedPlayerSeeds(scheduledTeamNames);
    for (const seed of recentTeamSeeds) {
      // Only merge live seeds for players that appear on today's active rosters.
      // This prevents historical/retired players in live_player_stats from
      // surfacing in the draft pool (the "80s & 90s player" problem).
      const key = normalizeNameKey(seed.playerName);
      if (key && rosterPlayerKeys.has(key)) {
        addApiSportsPoolSeed(poolSeedByName, seed);
      }
    }
  }

  const seeds = Array.from(poolSeedByName.values()).slice(0, 500);
  const playerIdsForSamples = seeds
    .map((seed) => seed.playerId ?? 0)
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.trunc(value));
  const { samples: sampleByPlayerId, foundIds: supabaseFoundIds } = await loadRecentFantasySamplesByPlayerId(playerIdsForSamples, poolLeague);

  const bdlFallbackIds = playerIdsForSamples.filter((id) => !supabaseFoundIds.has(id));
  const bdlProjections =
    bdlFallbackIds.length > 0 ? await loadBdlSeasonAverageProjections(bdlFallbackIds, poolLeague) : new Map<number, number>();

  const pool: FantasyPlayerPoolItem[] = seeds.map((seed) => {
    const sample = seed.playerId ? sampleByPlayerId.get(seed.playerId) : undefined;
    const bdlProj = seed.playerId ? bdlProjections.get(seed.playerId) : undefined;
    return {
      playerId: seed.playerId,
      playerName: seed.playerName,
      headshotUrl: seed.headshotUrl ?? null,
      coverage: sample?.samples ?? 1,
      projectedLine: sample?.avg ?? (bdlProj !== undefined ? bdlProj : null),
      position: seed.position ?? null,
      team: seed.team ?? null,
    };
  });

  pool.sort((left, right) => {
    if (right.coverage !== left.coverage) {
      return right.coverage - left.coverage;
    }
    if ((right.projectedLine ?? -Infinity) !== (left.projectedLine ?? -Infinity)) {
      return (right.projectedLine ?? -Infinity) - (left.projectedLine ?? -Infinity);
    }
    return left.playerName.localeCompare(right.playerName);
  });

  const poolWithIds = await attachPlayerIdsToPool(pool.slice(0, FANTASY_PLAYER_POOL_LIMIT));
  const headshotByName = await loadNbaHeadshotsByName(poolWithIds.map((item) => item.playerName), poolLeague);
  return poolWithIds.map((item) => ({
    ...item,
    headshotUrl: headshotByName.get(normalizeNameKey(item.playerName)) ?? null,
  }));
}

async function findApiSportsGameByIdNearby(gameId: string): Promise<ApiSportsNbaGame | null> {
  const normalizedGameId = String(gameId ?? "").trim();
  if (!normalizedGameId) {
    return null;
  }
  const candidateDates = [formatUtcDateOffset(-2), formatUtcDateOffset(-1), formatUtcDateOffset(0), formatUtcDateOffset(1), formatUtcDateOffset(2)];
  const rowsByDate = await Promise.all(candidateDates.map((date) => fetchApiSportsNbaGamesByDate(date)));
  for (const row of rowsByDate.flat()) {
    if (getApiSportsGameId(row) === normalizedGameId) {
      return row;
    }
  }
  return null;
}

async function isFantasyEntryRosterLocked(entry: FantasyEntryRow, tzOffsetMinutes: number): Promise<boolean> {
  const lineupPlayers = parseLineupPlayers(entry.lineup);
  if (lineupPlayers.length === 0) {
    return false;
  }

  const anyDailyId = parseAnyDailyGameId(entry.game_id);
  if (!anyDailyId) {
    const startsAtMs = Date.parse(entry.starts_at);
    return Number.isFinite(startsAtMs) ? Date.now() >= startsAtMs : false;
  }

  const { date: dailyDate, league } = anyDailyId;
  const slateGamesFetcher = league === "WNBA" ? listWnbaGamesForLocalDay : listApiSportsGamesForLocalDay;
  const teamPlayersFetcher = league === "WNBA" ? fetchWnbaTeamPlayers : fetchApiSportsNbaTeamPlayers;
  const slateGames = await slateGamesFetcher(dailyDate, tzOffsetMinutes);
  if (slateGames.length === 0) {
    const startsAtMs = Date.parse(entry.starts_at);
    return Number.isFinite(startsAtMs) ? Date.now() >= startsAtMs : false;
  }

  const rowsById = new Map<string, ApiSportsNbaGame>();
  for (const row of slateGames) {
    const id = getApiSportsGameId(row);
    if (id) {
      rowsById.set(id, row);
    }
  }

  const teamToGameStatus = new Map<number, boolean>();
  const teamSeasonPairs = new Map<string, { teamId: number; season: number | null; started: boolean }>();
  for (const row of rowsById.values()) {
    const season = getApiSportsGameSeason(row);
    const started = isLiveOrFinalGameStatus(getApiSportsGameStatusShort(row));
    const homeTeamId = getApiSportsGameTeamId(row, "home");
    const awayTeamId = getApiSportsGameTeamId(row, "away");
    if (homeTeamId) {
      teamSeasonPairs.set(`${homeTeamId}:${season ?? "na"}`, { teamId: homeTeamId, season, started });
      teamToGameStatus.set(homeTeamId, started);
    }
    if (awayTeamId) {
      teamSeasonPairs.set(`${awayTeamId}:${season ?? "na"}`, { teamId: awayTeamId, season, started });
      teamToGameStatus.set(awayTeamId, started);
    }
  }

  const rosteredPlayerIds = new Set(lineupPlayers.map((player) => player.playerId));
  for (const { teamId, season, started } of teamSeasonPairs.values()) {
    const rosterRows = await teamPlayersFetcher(teamId, season);
    const playerIdsOnTeam = new Set(
      rosterRows
        .map((row) => extractApiSportsPlayerId(row))
        .filter((value): value is number => Number.isFinite(value) && (value ?? 0) > 0)
    );
    for (const playerId of rosteredPlayerIds) {
      if (playerIdsOnTeam.has(playerId) && started) {
        return true;
      }
    }
  }

  // Fallback: if roster membership couldn't be resolved, lock only if a tracked live row already shows game started.
  if (supabaseAdmin && league === "NBA") {
    const ids = Array.from(rosteredPlayerIds).filter((id) => Number.isFinite(id) && id > 0);
    if (ids.length > 0) {
      const { data } = await supabaseAdmin
        .from("live_player_stats")
        .select("player_id, game_status, source_updated_at")
        .in("player_id", ids)
        .eq("league_name", "NBA")
        .order("source_updated_at", { ascending: false })
        .limit(2000);
      for (const raw of (data as Array<Record<string, unknown>> | null) ?? []) {
        const status = String(raw.game_status ?? "").trim();
        const playerId = Number.parseInt(String(raw.player_id ?? ""), 10);
        if (!Number.isFinite(playerId) || playerId <= 0 || !rosteredPlayerIds.has(playerId)) {
          continue;
        }
        if (isLiveOrFinalGameStatus(status)) {
          return true;
        }
      }
    }
  }

  return false;
}

async function resolvePlayerIdByNameFromApiSports(playerName: string): Promise<number | null> {
  if (!isApiSportsConfigured()) {
    return null;
  }
  const key = normalizeNameKey(playerName);
  if (!key) {
    return null;
  }

  const cached = apiSportsPlayerIdCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const query = encodeURIComponent(playerName);
  const searchPaths = [
    `/players?search=${query}`,
    `/players?name=${query}`,
  ];

  for (const baseUrl of getApiSportsBaseCandidates()) {
    for (const path of searchPaths) {
      const result = await apiSportsGet(baseUrl, path, APISPORTS_API_KEY);
      if (!result.ok) {
        continue;
      }
      const rows = parseApiSportsResponseRows(result.json);
      for (const rowUnknown of rows) {
        const row = asRecord(rowUnknown);
        const id = extractApiSportsPlayerId(row);
        const resolvedName = extractApiSportsDirectoryPlayerName(row);
        if (!id || !resolvedName) {
          continue;
        }
        if (normalizeNameKey(resolvedName) === key) {
          apiSportsPlayerIdCache.set(key, { value: id, expiresAt: Date.now() + APISPORTS_PLAYER_ID_TTL_MS });
          return id;
        }
      }
    }
  }

  return null;
}

async function attachPlayerIdsToPool(pool: FantasyPlayerPoolItem[]): Promise<FantasyPlayerPoolItem[]> {
  if (pool.length === 0) {
    return pool;
  }

  const liveIdByName = new Map<string, number>();
  if (supabaseAdmin) {
    const sinceIso = new Date(Date.now() - FANTASY_LIVE_STATS_LOOKBACK_MS).toISOString();
    const { data: liveRows } = await supabaseAdmin
      .from("live_player_stats")
      .select("player_id, player_name, source_updated_at")
      .eq("league_name", "NBA")
      .gte("source_updated_at", sinceIso)
      .order("source_updated_at", { ascending: false })
      .limit(5000);

    for (const raw of (liveRows as Array<Record<string, unknown>> | null) ?? []) {
      const name = String(raw.player_name ?? "").trim();
      const id = Number.parseInt(String(raw.player_id ?? ""), 10);
      const key = normalizeNameKey(name);
      if (!key || !Number.isFinite(id) || id <= 0 || liveIdByName.has(key)) {
        continue;
      }
      liveIdByName.set(key, id);
    }
  }

  const nextPool = [...pool];
  for (let i = 0; i < nextPool.length; i += 1) {
    const item = nextPool[i];
    if (!item) {
      continue;
    }
    if (Number.isFinite(item.playerId ?? NaN) && (item.playerId ?? 0) > 0) {
      continue;
    }
    const key = normalizeNameKey(item.playerName);
    if (!key) {
      continue;
    }
    const fromLive = liveIdByName.get(key) ?? null;
    const resolvedId = fromLive ?? (await resolvePlayerIdByNameFromApiSports(item.playerName));
    nextPool[i] = {
      ...item,
      playerId: resolvedId,
    };
  }

  return nextPool;
}

export async function getFantasyPlayerPoolForDate(params?: {
  date?: string;
  tzOffsetMinutes?: number | string;
  includeStartedGames?: boolean;
  league?: "NBA" | "WNBA" | "MLB";
}): Promise<FantasyPlayerPoolItem[]> {
  const tzOffsetMinutes = parseTimezoneOffset(params?.tzOffsetMinutes);
  const date = parseDateString(params?.date) ? String(params?.date) : getTodayDateInOffset(tzOffsetMinutes);
  const includeStartedGames = params?.includeStartedGames === true;
  const league = params?.league ?? "NBA";

  const gameFetcher =
    league === "WNBA"
      ? listWnbaGamesForLocalDay
      : league === "MLB"
      ? listMlbGamesForLocalDay
      : listApiSportsGamesForLocalDay;
  const games = await gameFetcher(date, tzOffsetMinutes);
  const eligibleGames = includeStartedGames ? games : games.filter((game) => !isApiSportsGameStarted(game));

  const liveGames = eligibleGames.filter((game) => isApiSportsGameStarted(game) && !isApiSportsGameFinal(game));
  const prioritizedGames = includeStartedGames && liveGames.length > 0 ? liveGames : eligibleGames;

  return loadFantasyPlayerPoolFromApiSportsGames(prioritizedGames);
}

export async function getFantasyPlayerPoolForGame(params: {
  gameId: string;
  sportKey?: string;
  date?: string;
  tzOffsetMinutes?: number | string;
  includeStartedGames?: boolean;
}): Promise<FantasyPlayerPoolItem[]> {
  const gameId = String(params.gameId ?? "").trim();
  if (!gameId) {
    throw new Error("gameId is required.");
  }

  const dailyDate = parseFantasyDailyGameId(gameId);
  if (dailyDate) {
    return getFantasyPlayerPoolForDate({
      date: params.date ?? dailyDate,
      tzOffsetMinutes: params.tzOffsetMinutes,
      includeStartedGames: params.includeStartedGames === true,
      league: "NBA",
    });
  }

  const wnbaDailyDate = parseWnbaFantasyDailyGameId(gameId);
  if (wnbaDailyDate) {
    return getFantasyPlayerPoolForDate({
      date: params.date ?? wnbaDailyDate,
      tzOffsetMinutes: params.tzOffsetMinutes,
      includeStartedGames: params.includeStartedGames === true,
      league: "WNBA",
    });
  }

  const mlbDailyDate = parseMlbFantasyDailyGameId(gameId);
  if (mlbDailyDate) {
    return getFantasyPlayerPoolForDate({
      date: params.date ?? mlbDailyDate,
      tzOffsetMinutes: params.tzOffsetMinutes,
      includeStartedGames: params.includeStartedGames === true,
      league: "MLB",
    });
  }

  const game = await findApiSportsGameByIdNearby(gameId);
  if (!game) {
    return [];
  }
  if (!params.includeStartedGames && isApiSportsGameStarted(game)) {
    return [];
  }
  return loadFantasyPlayerPoolFromApiSportsGames([game]);
}

async function ensureFantasyTables(): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }

  const { error } = await supabaseAdmin.from("fantasy_entries").select("id").limit(1);
  if (!error) {
    return;
  }

  if (isMissingFantasyTablesError(error)) {
    throw new Error(FANTASY_TABLES_MISSING_ERROR);
  }

  throw new Error(error.message ?? "Failed to access fantasy tables.");
}

async function assertFantasyEntryCadenceAvailable(params: {
  userId: string;
  sportKey: string;
  startsAt: string;
  tzOffsetMinutes: number;
}): Promise<void> {
  if (!supabaseAdmin) {
    return;
  }

  const userId = params.userId.trim();
  const sportKey = params.sportKey.trim();
  const startsAt = params.startsAt.trim();
  const tzOffsetMinutes = params.tzOffsetMinutes;
  if (!userId || !sportKey || !startsAt) {
    return;
  }

  let range: { fromIso: string; toIso: string } | null = null;
  let cadenceLabel = "";
  if (sportKey === FANTASY_SPORT_KEY || sportKey === FANTASY_WNBA_SPORT_KEY || sportKey === FANTASY_MLB_SPORT_KEY) {
    range = buildUtcRangeForLocalDayContaining(startsAt, tzOffsetMinutes);
    cadenceLabel = "day";
  } else if (sportKey === FANTASY_NFL_SPORT_KEY) {
    range = buildUtcRangeForLocalWeekContaining(startsAt, tzOffsetMinutes);
    cadenceLabel = "week";
  } else {
    return;
  }

  if (!range) {
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("fantasy_entries")
    .select("id")
    .eq("user_id", userId)
    .eq("sport_key", sportKey)
    .gte("starts_at", range.fromIso)
    .lte("starts_at", range.toIso)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (error && error.code !== "PGRST116") {
    throw new Error(error.message ?? "Failed to validate fantasy entry limits.");
  }

  if (data?.id) {
    if (sportKey === FANTASY_SPORT_KEY) {
      throw new Error("You can only create 1 NBA fantasy team per day.");
    }
    if (sportKey === FANTASY_WNBA_SPORT_KEY) {
      throw new Error("You can only create 1 WNBA fantasy team per day.");
    }
    if (sportKey === FANTASY_NFL_SPORT_KEY) {
      throw new Error("You can only create 1 NFL fantasy team per week.");
    }
    if (sportKey === FANTASY_MLB_SPORT_KEY) {
      throw new Error("You can only create 1 MLB fantasy team per day.");
    }
    throw new Error(`You can only create 1 fantasy team per ${cadenceLabel}.`);
  }
}

function validateLineup(lineup: unknown, params?: { gameId?: string; sportKey?: string }): string[] {
  const parsed = parseLineup(lineup);
  const requiredSize = getRequiredFantasyLineupSize(params ?? {});
  if (parsed.length !== requiredSize) {
    throw new Error(`Lineup must contain exactly ${requiredSize} unique players.`);
  }
  return parsed;
}

function shouldAllowStartedDraftingForTesting(): boolean {
  return false;
}

function buildStoredLineupWithIds(
  lineup: string[],
  playerPool: FantasyPlayerPoolItem[]
): Array<{ player_id: number; player_name: string; headshot_url: string | null }> {
  const poolByKey = new Map<string, FantasyPlayerPoolItem>();
  for (const item of playerPool) {
    const key = normalizeNameKey(item.playerName);
    if (!key || poolByKey.has(key)) {
      continue;
    }
    poolByKey.set(key, item);
  }

  return lineup.map((playerName) => {
    const key = normalizeNameKey(playerName);
    const item = key ? poolByKey.get(key) : null;
    const playerId = Number(item?.playerId ?? 0);
    if (!Number.isFinite(playerId) || playerId <= 0) {
      throw new Error(
        `Could not resolve a stable player_id for \"${playerName}\". Please refresh player pool and try again.`
      );
    }
    const safePlayerName =
      isPlaceholderFighterName(playerName) && item?.playerName ? String(item.playerName).trim() || playerName : playerName;
    return {
      player_id: Math.trunc(playerId),
      player_name: safePlayerName,
      headshot_url: String(item?.headshotUrl ?? "").trim() || null,
    };
  });
}

export async function submitFantasyEntry(params: {
  userId: string;
  venueId: string;
  gameId: string;
  lineup: unknown;
  tzOffsetMinutes?: number | string;
}): Promise<FantasyEntry> {
  const userId = String(params.userId ?? "").trim();
  const venueId = String(params.venueId ?? "").trim();
  const gameId = String(params.gameId ?? "").trim();
  const lineup = validateLineup(params.lineup, { gameId });
  const tzOffsetMinutes = parseTimezoneOffset(params.tzOffsetMinutes);
  const serverTodayDate = getServerTodayDate();
  const allowStartedDrafting = shouldAllowStartedDraftingForTesting();

  if (!userId || !venueId || !gameId) {
    throw new Error("userId, venueId, and gameId are required.");
  }

  await ensureFantasyTables();

  const anyDailyId = parseAnyDailyGameId(gameId);
  let entryGameId = gameId;
  let entryGameLabel = "";
  let entryHomeTeam = "";
  let entryAwayTeam = "";
  let entryStartsAt = "";
  let entrySportKey = FANTASY_SPORT_KEY;
  let playerPool: FantasyPlayerPoolItem[] = [];

  if (anyDailyId) {
    const { date: dailyDate, league: dailyLeague } = anyDailyId;

    if (dailyDate !== serverTodayDate) {
      throw new Error(`You can only draft players from today's ${dailyLeague} games.`);
    }

    const allDayGames = await listFantasyGames({ date: dailyDate, tzOffsetMinutes, limit: 40 });
    const dayGames = allDayGames.filter((game) => game.league === dailyLeague);
    if (dayGames.length === 0) {
      throw new Error(`No ${dailyLeague} games available for this date.`);
    }

    const eligibleGames = allowStartedDrafting ? dayGames : dayGames.filter((game) => !game.isLocked);
    if (eligibleGames.length === 0) {
      throw new Error(`All ${dailyLeague} games for today have already started.`);
    }

    playerPool = await getFantasyPlayerPoolForDate({
      date: dailyDate,
      tzOffsetMinutes,
      includeStartedGames: allowStartedDrafting,
      league: dailyLeague,
    });
    if (playerPool.length === 0 && !allowStartedDrafting) {
      throw new Error(`No eligible players are available from unstarted ${dailyLeague} games.`);
    }

    const firstStart = eligibleGames
      .map((game) => Date.parse(game.startsAt))
      .filter(Number.isFinite)
      .sort((left, right) => left - right)[0];
    if (!Number.isFinite(firstStart)) {
      throw new Error(`Could not determine the next ${dailyLeague} start time for this slate.`);
    }

    if (dailyLeague === "WNBA") {
      entrySportKey = FANTASY_WNBA_SPORT_KEY;
      entryGameId = buildWnbaFantasyDailyGameId(dailyDate);
      entryGameLabel = `WNBA Daily Challenge (${dailyDate})`;
    } else if (dailyLeague === "MLB") {
      entrySportKey = FANTASY_MLB_SPORT_KEY;
      entryGameId = buildMlbFantasyDailyGameId(dailyDate);
      entryGameLabel = `MLB Daily Challenge (${dailyDate})`;
    } else {
      entrySportKey = FANTASY_SPORT_KEY;
      entryGameId = buildFantasyDailyGameId(dailyDate);
      entryGameLabel = `NBA Daily Challenge (${dailyDate})`;
    }
    entryHomeTeam = FANTASY_DAILY_TEAM_LABEL;
    entryAwayTeam = FANTASY_DAILY_TEAM_LABEL;
    entryStartsAt = new Date(firstStart).toISOString();
  } else {
    throw new Error("Fantasy drafting is only available for today's daily slate.");
  }

  const playerPoolKeys = new Set(playerPool.map((item) => normalizeNameKey(item.playerName)).filter(Boolean));

  for (const playerName of lineup) {
    if (!playerPoolKeys.has(normalizeNameKey(playerName))) {
      throw new Error(`"${playerName}" is not in the available player pool for this slate.`);
    }
  }
  if (entrySportKey === FANTASY_MLB_SPORT_KEY) {
    assertMlbLineupShape(lineup, playerPool);
  }
  const storedLineup = buildStoredLineupWithIds(lineup, playerPool);

  await assertFantasyEntryCadenceAvailable({
    userId,
    sportKey: entrySportKey,
    startsAt: entryStartsAt,
    tzOffsetMinutes,
  });

  const row = {
    user_id: userId,
    venue_id: venueId,
    sport_key: entrySportKey,
    game_id: entryGameId,
    game_label: entryGameLabel,
    home_team: entryHomeTeam,
    away_team: entryAwayTeam,
    starts_at: entryStartsAt,
    lineup: storedLineup,
    status: "pending" as const,
    points: 0,
    score_breakdown: {},
    reward_points: 0,
  };

  const { data, error } = await supabaseAdmin!
    .from("fantasy_entries")
    .insert(row)
    .select(
      "id, user_id, venue_id, sport_key, game_id, game_label, home_team, away_team, starts_at, lineup, status, points, score_breakdown, reward_points, reward_claimed_at, live_collected_points, stats_last_source_updated_at, settled_at, created_at, updated_at"
    )
    .maybeSingle<FantasyEntryRow>();

  if (error || !data) {
    if ((error as SupabaseLikeError | null)?.code === "23505") {
      throw new Error("You already have an entry for this daily slate.");
    }
    if (isMissingFantasyTablesError(error)) {
      throw new Error(FANTASY_TABLES_MISSING_ERROR);
    }
    throw new Error(error?.message ?? "Failed to create fantasy entry.");
  }

  return sanitizeFantasyEntryForOutbound(mapFantasyEntryRow(data));
}

export async function updateFantasyEntryLineup(params: {
  userId: string;
  venueId: string;
  gameId: string;
  lineup: unknown;
  tzOffsetMinutes?: number | string;
}): Promise<FantasyEntry> {
  const userId = String(params.userId ?? "").trim();
  const venueId = String(params.venueId ?? "").trim();
  const gameId = String(params.gameId ?? "").trim();
  const lineup = validateLineup(params.lineup, { gameId });
  const tzOffsetMinutes = parseTimezoneOffset(params.tzOffsetMinutes);
  const serverTodayDate = getServerTodayDate();
  const allowStartedDrafting = shouldAllowStartedDraftingForTesting();

  if (!userId || !venueId || !gameId) {
    throw new Error("userId, venueId, and gameId are required.");
  }

  await ensureFantasyTables();

  const { data: existingRow, error: existingError } = await supabaseAdmin!
    .from("fantasy_entries")
    .select(
      "id, user_id, venue_id, sport_key, game_id, game_label, home_team, away_team, starts_at, lineup, status, points, score_breakdown, reward_points, reward_claimed_at, live_collected_points, stats_last_source_updated_at, settled_at, created_at, updated_at"
    )
    .eq("user_id", userId)
    .eq("venue_id", venueId)
    .eq("game_id", gameId)
    .maybeSingle<FantasyEntryRow>();

  if (existingError || !existingRow) {
    throw new Error("Fantasy entry not found for this slate.");
  }
  if (!allowStartedDrafting && (existingRow.status === "canceled" || existingRow.status === "final")) {
    throw new Error("This lineup can no longer be changed because games have already started.");
  }
  if (!allowStartedDrafting && (await isFantasyEntryRosterLocked(existingRow, tzOffsetMinutes))) {
    throw new Error("This lineup is locked because at least one player on your roster has already started playing.");
  }

  const anyDailyId = parseAnyDailyGameId(gameId);
  if (anyDailyId && anyDailyId.date < serverTodayDate) {
    throw new Error("Past fantasy slates are read-only.");
  }
  const playerPool = anyDailyId
    ? await getFantasyPlayerPoolForDate({ date: anyDailyId.date, tzOffsetMinutes, includeStartedGames: true, league: anyDailyId.league })
    : await getFantasyPlayerPoolForGame({ gameId, sportKey: existingRow.sport_key, tzOffsetMinutes, includeStartedGames: true });
  const poolKeys = new Set(playerPool.map((item) => normalizeNameKey(item.playerName)).filter(Boolean));

  for (const playerName of lineup) {
    if (!poolKeys.has(normalizeNameKey(playerName))) {
      throw new Error(`"${playerName}" is not in the available player pool for this slate.`);
    }
  }
  if (existingRow.sport_key === FANTASY_MLB_SPORT_KEY) {
    assertMlbLineupShape(lineup, playerPool);
  }
  const storedLineup = buildStoredLineupWithIds(lineup, playerPool);

  const { data, error } = await supabaseAdmin!
    .from("fantasy_entries")
    .update({ lineup: storedLineup, score_breakdown: {}, points: 0, stats_last_source_updated_at: null })
    .eq("id", existingRow.id)
    .select(
      "id, user_id, venue_id, sport_key, game_id, game_label, home_team, away_team, starts_at, lineup, status, points, score_breakdown, reward_points, reward_claimed_at, live_collected_points, stats_last_source_updated_at, settled_at, created_at, updated_at"
    )
    .maybeSingle<FantasyEntryRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update fantasy lineup.");
  }

  // Force immediate recompute after live lineup swaps.
  await refreshFantasyProgress({ userId, limit: 200 });

  return sanitizeFantasyEntryForOutbound(mapFantasyEntryRow(data));
}

export async function listUserFantasyEntries(params: {
  userId: string;
  venueId?: string;
  includeSettled?: boolean;
  limit?: number;
  refreshProgress?: boolean;
}): Promise<FantasyEntry[]> {
  const userId = String(params.userId ?? "").trim();
  if (!userId) {
    return [];
  }

  if (params.refreshProgress !== false) {
    await refreshFantasyProgress({ userId });
  }

  await ensureFantasyTables();

  const includeSettled = params.includeSettled !== false;
  const limit = Math.max(1, Math.min(300, Number(params.limit ?? 120)));

  let query = supabaseAdmin!
    .from("fantasy_entries")
    .select(
      "id, user_id, venue_id, sport_key, game_id, game_label, home_team, away_team, starts_at, lineup, status, points, score_breakdown, reward_points, reward_claimed_at, live_collected_points, stats_last_source_updated_at, settled_at, created_at, updated_at"
    )
    .eq("user_id", userId)
    .order("starts_at", { ascending: false })
    .limit(limit);

  const venueId = String(params.venueId ?? "").trim();
  if (venueId) {
    query = query.eq("venue_id", venueId);
  }

  if (!includeSettled) {
    query = query.in("status", ["pending", "live"]);
  }

  const { data, error } = await query;
  if (error || !data) {
    if (isMissingFantasyTablesError(error)) {
      return [];
    }
    throw new Error(error?.message ?? "Failed to load fantasy entries.");
  }

  const mapped = (data as FantasyEntryRow[]).map((row) => mapFantasyEntryRow(row));
  return sanitizeFantasyEntriesForOutbound(mapped);
}

function computeFantasyPoints(stat: {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  turnover: number;
}): number {
  const total =
    stat.pts +
    stat.reb * 1.2 +
    stat.ast * 1.5 +
    stat.stl * 3 +
    stat.blk * 3 -
    stat.turnover;
  return Number(Math.max(0, total).toFixed(2));
}

function computeFantasyRewardPoints(totalFantasyPoints: number): number {
  const safe = Number.isFinite(totalFantasyPoints) ? Math.max(0, totalFantasyPoints) : 0;
  return Math.max(0, Math.round(safe * FANTASY_POINTS_MULTIPLIER));
}

const APISPORTS_FINAL_STATUS_SHORT = new Set(["FT", "AOT"]);
const APISPORTS_IN_PLAY_STATUS_SHORT = new Set(["Q1", "Q2", "Q3", "Q4", "OT", "BT", "HT"]);
const APISPORTS_NOT_STARTED_STATUS_SHORT = new Set(["NS", "POST", "CANC", "SUSP", "AWD", "ABD"]);
const GAME_START_GRACE_MS = 5 * 60 * 1000;

function normalizeBdlGameStatusShort(rawStatus: unknown): string {
  const status = String(rawStatus ?? "").trim().toLowerCase();
  if (!status) {
    return "NS";
  }
  if (
    status.includes("final") ||
    status.includes("finished") ||
    status.includes("complete")
  ) {
    return "FT";
  }
  if (
    status.includes("live") ||
    status.includes("progress") ||
    status.includes("in progress") ||
    status.includes("in_progress") ||
    status.includes("qtr") ||
    status.includes("quarter") ||
    status.includes("half") ||
    status.includes("ot") ||
    status.includes("inning") ||
    status.includes("top ") ||
    status.includes("bot ")
  ) {
    return "LIVE";
  }
  if (
    status.includes("postponed") ||
    status.includes("postponement")
  ) {
    return "POST";
  }
  if (
    status.includes("cancel") ||
    status.includes("suspend") ||
    status.includes("abandon")
  ) {
    return "CANC";
  }
  return "NS";
}

function isFinalGameStatus(value: string): boolean {
  const status = String(value ?? "").trim().toUpperCase();
  return APISPORTS_FINAL_STATUS_SHORT.has(status) || status === "FINAL" || status === "COMPLETED";
}

function isInProgressGameStatus(value: string): boolean {
  const status = String(value ?? "").trim().toUpperCase();
  if (!status) {
    return false;
  }
  if (APISPORTS_IN_PLAY_STATUS_SHORT.has(status)) {
    return true;
  }
  return (
    status.includes("LIVE") ||
    status.includes("IN PLAY") ||
    status.includes("IN_PROGRESS") ||
    status.includes("PROGRESS") ||
    status.includes("QUARTER") ||
    status.includes("HALF") ||
    status.includes("INNING")
  );
}

function isStartedGameStatus(value: string): boolean {
  const status = String(value ?? "").trim().toUpperCase();
  if (!status) {
    return false;
  }
  if (isFinalGameStatus(status)) {
    return true;
  }
  if (APISPORTS_NOT_STARTED_STATUS_SHORT.has(status)) {
    return false;
  }
  if (status === "NOT STARTED" || status === "SCHEDULED" || status === "PREGAME" || status === "PRE-GAME") {
    return false;
  }
  return isLiveOrFinalGameStatus(status);
}

function isLiveOrFinalGameStatus(value: string): boolean {
  const status = String(value ?? "").trim().toUpperCase();
  if (!status) {
    return false;
  }
  return isFinalGameStatus(status) || isInProgressGameStatus(status);
}

async function loadRecentLivePlayerStatsRows(): Promise<LivePlayerStatRow[]> {
  if (!supabaseAdmin) {
    return [];
  }
  const sinceIso = new Date(Date.now() - FANTASY_LIVE_STATS_LOOKBACK_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("live_player_stats")
    .select("player_id, game_id, player_name, team_name, game_status, total_fantasy_points, source_updated_at")
    .eq("league_name", "NBA")
    .gte("source_updated_at", sinceIso)
    .order("source_updated_at", { ascending: false })
    .limit(4000);
  if (error || !Array.isArray(data)) {
    return [];
  }
  return data as LivePlayerStatRow[];
}

async function loadNbaHeadshotsByName(playerNames: string[], league: string | string[] = "NBA"): Promise<Map<string, string>> {
  if (!supabaseAdmin) {
    return new Map();
  }
  const normalizedKeys = Array.from(
    new Set(
      playerNames
        .map((value) => normalizeNameKey(value))
        .filter(Boolean)
    )
  );
  if (normalizedKeys.length === 0) {
    return new Map();
  }
  const normalizedSet = new Set(normalizedKeys);
  const leagues = Array.isArray(league) ? league : [league];
  const { data, error } = await supabaseAdmin
    .from("players")
    .select("player_name, headshot_url")
    .in("league", leagues)
    .not("headshot_url", "is", null)
    .neq("headshot_url", "")
    .limit(2000);
  if (error || !Array.isArray(data)) {
    return new Map();
  }
  const headshotByName = new Map<string, string>();
  for (const row of data as Array<Record<string, unknown>>) {
    const playerName = String(row.player_name ?? "").trim();
    const headshotUrl = String(row.headshot_url ?? "").trim();
    if (!playerName || !headshotUrl) {
      continue;
    }
    const key = normalizeNameKey(playerName);
    if (!key || !normalizedSet.has(key) || headshotByName.has(key)) {
      continue;
    }
    headshotByName.set(key, headshotUrl);
  }
  return headshotByName;
}

function getLatestRowsByGameId(rows: LivePlayerStatRow[]): LivePlayerStatRow[] {
  const byGameId = new Map<string, LivePlayerStatRow>();
  for (const row of rows) {
    const gameId = String(row.game_id ?? "").trim();
    if (!gameId) {
      continue;
    }
    const previous = byGameId.get(gameId);
    if (!previous) {
      byGameId.set(gameId, row);
      continue;
    }
    const nextTs = Date.parse(String(row.source_updated_at ?? ""));
    const previousTs = Date.parse(String(previous.source_updated_at ?? ""));
    if (Number.isFinite(nextTs) && (!Number.isFinite(previousTs) || nextTs > previousTs)) {
      byGameId.set(gameId, row);
    }
  }
  return Array.from(byGameId.values());
}

function computeFantasyFromLiveStats(
  entry: FantasyEntryRow,
  recentLiveRows: LivePlayerStatRow[],
  gameMetaById: Map<string, ApiSportsGameMeta>
): {
  status: FantasyEntryStatus;
  totalPoints: number;
  breakdown: Record<string, number>;
  latestSourceUpdatedAt: string | null;
} | null {
  const lineup = parseLineup(entry.lineup);
  if (lineup.length === 0) {
    return null;
  }

  const nowMs = Date.now();
  const startsAtMs = Date.parse(entry.starts_at);
  // Zero-hour guard: no points before tip-off.
  if (Number.isFinite(startsAtMs) && nowMs < startsAtMs) {
    const zeroBreakdown: Record<string, number> = {};
    for (const playerName of lineup) {
      zeroBreakdown[playerName] = 0;
    }
    return {
      status: "pending",
      totalPoints: 0,
      breakdown: zeroBreakdown,
      latestSourceUpdatedAt: null,
    };
  }

  const hasDailyGameId = Boolean(parseAnyDailyGameId(entry.game_id));
  const breakdown: Record<string, number> = {};
  let totalPoints = 0;
  let playersWithRows = 0;
  let sawNonFinalStatus = false;
  let latestSourceUpdatedAtMs = 0;

  const entryTeamNames = new Set(
    [entry.home_team, entry.away_team]
      .map((teamName) => String(teamName ?? "").trim())
      .filter(Boolean)
      .map((teamName) => normalizeTeamKey(teamName))
  );

  for (const playerName of lineup) {
    const filteredRows = recentLiveRows.filter((row) => {
      if (!isStartedGameStatus(row.game_status)) {
        return false;
      }
      if (!namesLikelyMatch(playerName, String(row.player_name ?? ""))) {
        return false;
      }
      const gameId = String(row.game_id ?? "").trim();
      if (!gameId) {
        return false;
      }
      const rowTs = Date.parse(String(row.source_updated_at ?? ""));
      if (Number.isFinite(startsAtMs) && Number.isFinite(rowTs)) {
        // Delta window starts at tip-off: never ingest pre-game snapshots.
        if (rowTs < startsAtMs || rowTs > nowMs + 2 * 60 * 60 * 1000) {
          return false;
        }
      }
      const gameMeta = gameMetaById.get(gameId);
      if (hasDailyGameId) {
        if (!Number.isFinite(startsAtMs)) {
          return false;
        }
        if (gameMeta) {
          // When API-Sports game metadata is available use a strict slate-window check.
          // Keep stats tied to the active slate window, not prior-day finals.
          if (gameMeta.startMs < startsAtMs - 2 * 60 * 60 * 1000 || gameMeta.startMs > startsAtMs + 36 * 60 * 60 * 1000) {
            return false;
          }
        }
        // Without gameMeta (e.g. BallDontLie game IDs never match API-Sports keys) fall
        // through — the rowTs time-window filter applied above already constrains the row
        // to [startsAt, now + 2h], which is sufficient to exclude prior-day stats.
      } else if (entryTeamNames.size > 0) {
        const teamKey = normalizeTeamKey(String(row.team_name ?? ""));
        if (teamKey && !entryTeamNames.has(teamKey)) {
          return false;
        }
        if (gameMeta) {
          const gameHome = normalizeTeamKey(gameMeta.homeTeam);
          const gameAway = normalizeTeamKey(gameMeta.awayTeam);
          if (!entryTeamNames.has(gameHome) && !entryTeamNames.has(gameAway)) {
            return false;
          }
        }
      }
      return true;
    });

    if (filteredRows.length === 0) {
      breakdown[playerName] = 0;
      continue;
    }

    playersWithRows += 1;
    const latestByGame = getLatestRowsByGameId(filteredRows);
    for (const row of latestByGame) {
      const rowTs = Date.parse(String(row.source_updated_at ?? ""));
      if (Number.isFinite(rowTs) && rowTs > latestSourceUpdatedAtMs) {
        latestSourceUpdatedAtMs = rowTs;
      }
    }
    const playerPoints = latestByGame.reduce((sum, row) => sum + Number(row.total_fantasy_points ?? 0), 0);
    breakdown[playerName] = Number(playerPoints.toFixed(2));
    totalPoints += breakdown[playerName];

    if (!latestByGame.every((row) => isFinalGameStatus(row.game_status))) {
      sawNonFinalStatus = true;
    }
  }

  const nextStatus: FantasyEntryStatus =
    playersWithRows === lineup.length && !sawNonFinalStatus && playersWithRows > 0
      ? "final"
      : playersWithRows > 0 || (Number.isFinite(startsAtMs) && nowMs >= startsAtMs)
      ? "live"
      : "pending";

  return {
    status: nextStatus,
    totalPoints: Number(totalPoints.toFixed(2)),
    breakdown,
    latestSourceUpdatedAt: latestSourceUpdatedAtMs > 0 ? new Date(latestSourceUpdatedAtMs).toISOString() : null,
  };
}

function isApiSportsConfigured(): boolean {
  return Boolean(APISPORTS_NBA_BASE_URL && APISPORTS_API_KEY);
}

function getApiSportsBaseCandidates(): string[] {
  const allowLegacyBasketballFallback =
    String(process.env.APISPORTS_ALLOW_LEGACY_BASKETBALL_FALLBACK ?? "")
      .trim()
      .toLowerCase() === "true";
  const candidates = [
    APISPORTS_NBA_BASE_URL,
    "https://v2.nba.api-sports.io",
    ...(allowLegacyBasketballFallback ? ["https://v1.basketball.api-sports.io"] : []),
  ]
    .map((value) => String(value ?? "").trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return Array.from(new Set(candidates));
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function getPath(source: unknown, path: string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function parseApiSportsResponseRows(json: unknown): Record<string, unknown>[] {
  const root = asRecord(json);
  const rows = root.response;
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map((row) => asRecord(row));
}

function parseNumber(value: unknown): number {
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

function pickFirstNumber(row: Record<string, unknown>, pathOptions: string[][]): number {
  for (const path of pathOptions) {
    const value = getPath(row, path);
    const parsed = parseNumber(value);
    if (Number.isFinite(parsed) && parsed !== 0) {
      return parsed;
    }
  }
  return 0;
}

function parseApiSportsGameStartMs(game: ApiSportsNbaGame): number {
  const directDateValue =
    getPath(game, ["date", "start"]) ??
    getPath(game, ["date"]) ??
    getPath(game, ["game", "date", "start"]) ??
    getPath(game, ["game", "date"]);

  if (typeof directDateValue === "string") {
    const parsed = Date.parse(directDateValue.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  } else if (typeof directDateValue === "number" && Number.isFinite(directDateValue)) {
    return directDateValue > 10_000_000_000 ? directDateValue : directDateValue * 1000;
  }

  const timestampValue =
    getPath(game, ["timestamp"]) ??
    getPath(game, ["date", "timestamp"]) ??
    getPath(game, ["time", "timestamp"]) ??
    getPath(game, ["game", "timestamp"]);
  const timestamp = Number.parseInt(String(timestampValue ?? ""), 10);
  if (Number.isFinite(timestamp) && timestamp > 0) {
    return timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  }

  return Number.POSITIVE_INFINITY;
}

type ApiSportsGameMeta = {
  startMs: number;
  homeTeam: string;
  awayTeam: string;
};

async function loadApiSportsGameMetaForRecentWindow(): Promise<Map<string, ApiSportsGameMeta>> {
  const byGameId = new Map<string, ApiSportsGameMeta>();
  if (!isApiSportsConfigured()) {
    return byGameId;
  }

  const dates = [formatUtcDateOffset(-2), formatUtcDateOffset(-1), formatUtcDateOffset(0), formatUtcDateOffset(1), formatUtcDateOffset(2)];
  const rowsByDate = await Promise.all(dates.map((date) => fetchApiSportsNbaGamesByDate(date)));
  for (const rows of rowsByDate) {
    for (const row of rows) {
      const gameId = getApiSportsGameId(row);
      if (!gameId) {
        continue;
      }
      byGameId.set(gameId, {
        startMs: parseApiSportsGameStartMs(row),
        homeTeam: getApiSportsGameTeamName(row, "home"),
        awayTeam: getApiSportsGameTeamName(row, "away"),
      });
    }
  }

  return byGameId;
}

function getApiSportsGameTeamName(game: ApiSportsNbaGame, side: "home" | "away"): string {
  if (side === "home") {
    return String(getPath(game, ["teams", "home", "name"]) ?? "").trim();
  }
  return String(getPath(game, ["teams", "visitors", "name"]) ?? getPath(game, ["teams", "away", "name"]) ?? "").trim();
}

function getApiSportsGameId(game: ApiSportsNbaGame): string {
  return String(getPath(game, ["id"]) ?? "").trim();
}

function getApiSportsGameStatusShort(game: ApiSportsNbaGame): string {
  return String(getPath(game, ["status", "short"]) ?? "").trim().toUpperCase();
}

function isApiSportsGameInProgress(game: ApiSportsNbaGame): boolean {
  const shortStatus = getApiSportsGameStatusShort(game);
  const longStatus = String(getPath(game, ["status", "long"]) ?? "").trim().toUpperCase();
  return isInProgressGameStatus(shortStatus) || isInProgressGameStatus(longStatus);
}

function isApiSportsGameFinal(game: ApiSportsNbaGame): boolean {
  const longStatus = String(getPath(game, ["status", "long"]) ?? "").trim().toLowerCase();
  const shortStatus = getApiSportsGameStatusShort(game);
  return (
    longStatus.startsWith("finished") ||
    longStatus.startsWith("completed") ||
    longStatus.startsWith("final") ||
    APISPORTS_FINAL_STATUS_SHORT.has(shortStatus)
  );
}

function isApiSportsGameStarted(game: ApiSportsNbaGame): boolean {
  const shortStatus = getApiSportsGameStatusShort(game);
  const longStatus = String(getPath(game, ["status", "long"]) ?? "").trim().toUpperCase();
  const startMs = parseApiSportsGameStartMs(game);
  if (isFinalGameStatus(shortStatus)) {
    return true;
  }
  if (isFinalGameStatus(longStatus)) {
    return true;
  }
  if (APISPORTS_NOT_STARTED_STATUS_SHORT.has(shortStatus)) {
    if (shortStatus === "POST" || shortStatus === "CANC" || shortStatus === "SUSP" || shortStatus === "AWD" || shortStatus === "ABD") {
      return false;
    }
    if (isInProgressGameStatus(longStatus)) {
      return true;
    }
    return Number.isFinite(startMs) && Date.now() >= startMs + GAME_START_GRACE_MS;
  }
  if (!shortStatus && !longStatus) {
    return Number.isFinite(startMs) && Date.now() >= startMs + GAME_START_GRACE_MS;
  }
  if (isApiSportsGameInProgress(game) || isInProgressGameStatus(longStatus)) {
    return true;
  }
  return Number.isFinite(startMs) && Date.now() >= startMs + GAME_START_GRACE_MS;
}

async function fetchApiSportsNbaGamesByDate(dateIso: string): Promise<ApiSportsNbaGame[]> {
  const cacheKey = `games:${dateIso}`;
  const cached = apiSportsGamesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const query = new URLSearchParams({ "dates[]": dateIso, per_page: "100" });
  const rowsRaw = await fetchBallDontLieList<Record<string, unknown>>("/nba/v1/games", query, 5);
  const rows = rowsRaw.map((game) => {
    const homeTeam = asRecord(game.home_team);
    const awayTeam = asRecord(game.visitor_team);
    const shortStatus = normalizeBdlGameStatusShort(game.status);
    return {
      id: game.id,
      date: {
        start: game.datetime ?? game.date,
      },
      league: {
        name: "NBA",
        season: game.season,
      },
      teams: {
        home: {
          id: homeTeam.id,
          name: homeTeam.full_name ?? homeTeam.name,
        },
        visitors: {
          id: awayTeam.id,
          name: awayTeam.full_name ?? awayTeam.name,
        },
      },
      scores: {
        home: {
          points: game.home_team_score,
        },
        visitors: {
          points: game.visitor_team_score,
        },
      },
      status: {
        long: game.status,
        short: shortStatus,
      },
    } as ApiSportsNbaGame;
  });

  apiSportsGamesCache.set(cacheKey, { value: rows, expiresAt: Date.now() + APISPORTS_GAMES_TTL_MS });
  return rows;
}

async function fetchBdlMlbGamesByDate(dateIso: string): Promise<ApiSportsNbaGame[]> {
  const cacheKey = `mlb-games:${dateIso}`;
  const cached = mlbGamesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const query = new URLSearchParams({ "dates[]": dateIso, per_page: "100" });
  const rowsRaw = await fetchBallDontLieList<Record<string, unknown>>("/mlb/v1/games", query, 5);
  const rows = rowsRaw.map((game) => {
    const homeTeam = asRecord(game.home_team);
    const awayTeam = asRecord(game.away_team ?? game.visitor_team);
    const shortStatus = normalizeBdlGameStatusShort(game.status);
    return {
      id: game.id,
      date: {
        start: game.datetime ?? game.date,
      },
      league: {
        name: "MLB",
        season: game.season,
      },
      teams: {
        home: {
          id: homeTeam.id,
          name: homeTeam.full_name ?? homeTeam.name,
        },
        visitors: {
          id: awayTeam.id,
          name: awayTeam.full_name ?? awayTeam.name,
        },
      },
      scores: {
        home: { points: game.home_team_score },
        visitors: { points: game.away_team_score ?? game.visitor_team_score },
      },
      status: {
        long: game.status,
        short: shortStatus,
      },
    } as ApiSportsNbaGame;
  });

  mlbGamesCache.set(cacheKey, { value: rows, expiresAt: Date.now() + APISPORTS_GAMES_TTL_MS });
  return rows;
}

async function listMlbGamesForLocalDay(date: string | undefined, tzOffsetMinutes: number): Promise<ApiSportsNbaGame[]> {
  const range = buildUtcRangeForLocalDay(date, tzOffsetMinutes);
  const candidateDates = Array.from(
    new Set([
      new Date(range.fromMs - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      new Date(range.fromMs).toISOString().slice(0, 10),
      new Date(range.toMs).toISOString().slice(0, 10),
      new Date(range.toMs + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    ])
  );
  const rowsByDate = await Promise.all(candidateDates.map((candidate) => fetchBdlMlbGamesByDate(candidate)));
  const uniqueByGameId = new Map<string, ApiSportsNbaGame>();
  for (const row of rowsByDate.flat()) {
    const id = getApiSportsGameId(row);
    if (!id || uniqueByGameId.has(id)) continue;
    const startsAtMs = parseApiSportsGameStartMs(row);
    if (!Number.isFinite(startsAtMs) || startsAtMs < range.fromMs || startsAtMs > range.toMs) continue;
    if (toLocalDateKeyByOffset(startsAtMs, tzOffsetMinutes) !== range.date) continue;
    uniqueByGameId.set(id, row);
  }
  return Array.from(uniqueByGameId.values());
}

async function fetchMlbTeamPlayers(teamId: number, season: number | null): Promise<Record<string, unknown>[]> {
  const normalizedTeamId = Math.trunc(teamId);
  const cacheKey = `mlb-team:${normalizedTeamId}:season:${season ?? "na"}`;
  const cached = mlbTeamPlayersCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const baseActiveQuery = new URLSearchParams({ per_page: "100", "team_ids[]": String(normalizedTeamId) });
  const activeRowsRaw = await fetchBallDontLieList<Record<string, unknown>>("/mlb/v1/players/active", baseActiveQuery, 5);
  const mapBdlMlbRow = (row: Record<string, unknown>): Record<string, unknown> => {
    const team = asRecord(row.team);
    return {
      player: {
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        name: `${String(row.first_name ?? "").trim()} ${String(row.last_name ?? "").trim()}`.trim(),
      },
      team: {
        id: team.id,
        name: team.full_name ?? team.name,
        abbreviation: team.abbreviation,
      },
      position: row.position,
      headshot_url: row.draft_kings_picture_url ?? row.headshot_url ?? row.picture_url ?? null,
      active: true,
    } as Record<string, unknown>;
  };

  let rows = activeRowsRaw.map((row) => asRecord(row)).map(mapBdlMlbRow);

  if (rows.length === 0) {
    const fallbackQuery = new URLSearchParams({ per_page: "100", "team_ids[]": String(normalizedTeamId) });
    if (season) fallbackQuery.set("seasons[]", String(season));
    const fallbackRowsRaw = await fetchBallDontLieList<Record<string, unknown>>("/mlb/v1/players", fallbackQuery, 5);
    rows = fallbackRowsRaw
      .map((row) => asRecord(row))
      .filter((row) => isApiSportsDirectoryPlayerActive(row))
      .map(mapBdlMlbRow);
  }

  const matchedByTeamId = rows.filter((row) => extractApiSportsDirectoryTeamId(row) === normalizedTeamId);
  const result = matchedByTeamId.length > 0 ? matchedByTeamId : [];
  mlbTeamPlayersCache.set(cacheKey, { value: result, expiresAt: Date.now() + APISPORTS_TEAM_PLAYERS_TTL_MS });
  return result;
}

async function fetchBdlWnbaGamesByDate(dateIso: string): Promise<ApiSportsNbaGame[]> {
  const cacheKey = `wnba-games:${dateIso}`;
  const cached = wnbaGamesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const query = new URLSearchParams({ "dates[]": dateIso, per_page: "100" });
  const rowsRaw = await fetchBallDontLieList<Record<string, unknown>>("/wnba/v1/games", query, 5);
  const rows = rowsRaw.map((game) => {
    const homeTeam = asRecord(game.home_team);
    const awayTeam = asRecord(game.visitor_team);
    const shortStatus = normalizeBdlGameStatusShort(game.status);
    return {
      id: game.id,
      date: {
        start: game.datetime ?? game.date,
      },
      league: {
        name: "WNBA",
        season: game.season,
      },
      teams: {
        home: {
          id: homeTeam.id,
          name: homeTeam.full_name ?? homeTeam.name,
        },
        visitors: {
          id: awayTeam.id,
          name: awayTeam.full_name ?? awayTeam.name,
        },
      },
      scores: {
        home: {
          points: game.home_team_score,
        },
        visitors: {
          points: game.visitor_team_score,
        },
      },
      status: {
        long: game.status,
        short: shortStatus,
      },
    } as ApiSportsNbaGame;
  });

  wnbaGamesCache.set(cacheKey, { value: rows, expiresAt: Date.now() + APISPORTS_GAMES_TTL_MS });
  return rows;
}

async function fetchApiSportsNbaPlayerStats(gameId: string): Promise<ApiSportsNbaPlayerStat[]> {
  const cacheKey = `stats:${gameId}`;
  const cached = apiSportsPlayerStatsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const query = new URLSearchParams({ per_page: "100", "game_ids[]": String(gameId) });
  const rowsRaw = await fetchBallDontLieList<Record<string, unknown>>("/nba/v1/stats", query, 10);
  const rows = rowsRaw.map((row) => {
    const player = asRecord(row.player);
    return {
      player: {
        id: player.id,
        first_name: player.first_name,
        last_name: player.last_name,
        name: `${String(player.first_name ?? "").trim()} ${String(player.last_name ?? "").trim()}`.trim(),
      },
      points: row.pts,
      totReb: row.reb,
      assists: row.ast,
      steals: row.stl,
      blocks: row.blk,
      turnovers: row.turnover,
      statistics: {
        points: row.pts,
        totReb: row.reb,
        assists: row.ast,
        steals: row.stl,
        blocks: row.blk,
        turnovers: row.turnover,
      },
    } as ApiSportsNbaPlayerStat;
  });
  apiSportsPlayerStatsCache.set(cacheKey, { value: rows, expiresAt: Date.now() + APISPORTS_PLAYER_STATS_TTL_MS });
  return rows;
}

function extractApiSportsPlayerName(row: ApiSportsNbaPlayerStat): string {
  const first = String(
    getPath(row, ["player", "firstname"]) ??
      getPath(row, ["player", "first_name"]) ??
      getPath(row, ["fighter", "firstname"]) ??
      getPath(row, ["fighter", "first_name"]) ??
      ""
  ).trim();
  const last = String(
    getPath(row, ["player", "lastname"]) ??
      getPath(row, ["player", "last_name"]) ??
      getPath(row, ["fighter", "lastname"]) ??
      getPath(row, ["fighter", "last_name"]) ??
      ""
  ).trim();
  const combined = `${first} ${last}`.trim();
  const candidates = [
    combined,
    String(getPath(row, ["player", "full_name"]) ?? "").trim(),
    String(getPath(row, ["player", "display_name"]) ?? "").trim(),
    String(getPath(row, ["player", "name"]) ?? "").trim(),
    String(getPath(row, ["fighter", "name"]) ?? "").trim(),
    String(getPath(row, ["fighter_name"]) ?? "").trim(),
    String(getPath(row, ["athlete", "displayName"]) ?? "").trim(),
    String(getPath(row, ["name"]) ?? "").trim(),
  ];
  for (const candidate of candidates) {
    if (candidate && !isPlaceholderFighterName(candidate)) {
      return candidate;
    }
  }
  return candidates.find(Boolean) ?? "";
}


function pickBestMatchingApiSportsGame(entry: FantasyEntryRow, games: ApiSportsNbaGame[]): ApiSportsNbaGame | null {
  const matching = games.filter((game) => {
    const home = getApiSportsGameTeamName(game, "home");
    const away = getApiSportsGameTeamName(game, "away");
    return teamsMatch(home, entry.home_team) && teamsMatch(away, entry.away_team);
  });

  if (matching.length === 0) {
    return null;
  }

  const targetStart = Date.parse(entry.starts_at);
  matching.sort((left, right) => {
    const leftDelta = Math.abs(parseApiSportsGameStartMs(left) - targetStart);
    const rightDelta = Math.abs(parseApiSportsGameStartMs(right) - targetStart);
    return leftDelta - rightDelta;
  });

  return matching[0] ?? null;
}


async function fetchApiSportsStatsForEntry(entry: FantasyEntryRow): Promise<{
  status: FantasyEntryStatus;
  totalPoints: number;
  breakdown: Record<string, number>;
}> {
  const anyDailyId = parseAnyDailyGameId(entry.game_id);
  // WNBA daily entries don't have scoring support yet; skip direct reconciliation.
  if (anyDailyId?.league === "WNBA") {
    const lineup = parseLineup(entry.lineup);
    return { status: entry.status, totalPoints: Number(entry.points ?? 0), breakdown: parseScoreBreakdown(entry.score_breakdown) || zeroBreakdownForLineup(lineup) };
  }
  const dailyDate = anyDailyId?.date ?? null;
  if (dailyDate) {
    return fetchApiSportsStatsForDailyEntry(entry, dailyDate);
  }

  const lineup = parseLineup(entry.lineup);
  const zeroBreakdown = zeroBreakdownForLineup(lineup);
  const startsAtMs = Date.parse(entry.starts_at);
  const nowMs = Date.now();
  if (!Number.isFinite(startsAtMs) || !isApiSportsConfigured()) {
    return { status: entry.status, totalPoints: Number(entry.points ?? 0), breakdown: parseScoreBreakdown(entry.score_breakdown) };
  }
  if (nowMs < startsAtMs) {
    return { status: "pending", totalPoints: 0, breakdown: zeroBreakdown };
  }

  const dates = [
    new Date(startsAtMs - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    new Date(startsAtMs).toISOString().slice(0, 10),
    new Date(startsAtMs + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  ];

  const games: ApiSportsNbaGame[] = [];
  for (const date of dates) {
    const rows = await fetchApiSportsNbaGamesByDate(date);
    for (const row of rows) {
      games.push(row);
    }
  }

  const matchedGame = pickBestMatchingApiSportsGame(entry, games);
  if (!matchedGame) {
    return { status: nowMs >= startsAtMs ? "live" : "pending", totalPoints: 0, breakdown: zeroBreakdown };
  }
  if (!isApiSportsGameStarted(matchedGame)) {
    return { status: "pending", totalPoints: 0, breakdown: zeroBreakdown };
  }

  const apiSportsGameId = getApiSportsGameId(matchedGame);
  if (!apiSportsGameId) {
    return { status: nowMs >= startsAtMs ? "live" : "pending", totalPoints: 0, breakdown: zeroBreakdown };
  }

  const stats = await fetchApiSportsNbaPlayerStats(apiSportsGameId);
  const status: FantasyEntryStatus = isApiSportsGameFinal(matchedGame) ? "final" : "live";
  if (stats.length === 0) {
    return { status, totalPoints: 0, breakdown: zeroBreakdown };
  }

  const statsByPlayer = new Map<string, number>();
  for (const raw of stats) {
    const row = asRecord(raw);
    const playerName = extractApiSportsPlayerName(row);
    if (!playerName) {
      continue;
    }
    const key = normalizeNameKey(playerName);
    if (!key) {
      continue;
    }
    const points = computeFantasyPoints({
      pts: pickFirstNumber(row, [["points"], ["statistics", "points"], ["stats", "points"], ["pts"]]),
      reb: pickFirstNumber(row, [["totReb"], ["rebounds", "total"], ["rebounds"], ["reb"], ["statistics", "totReb"], ["statistics", "rebounds", "total"], ["statistics", "rebounds"], ["stats", "rebounds", "total"], ["stats", "rebounds"]]),
      ast: pickFirstNumber(row, [["assists"], ["ast"], ["statistics", "assists"], ["stats", "assists"]]),
      stl: pickFirstNumber(row, [["steals"], ["stl"], ["statistics", "steals"], ["stats", "steals"]]),
      blk: pickFirstNumber(row, [["blocks"], ["blk"], ["statistics", "blocks"], ["stats", "blocks"]]),
      turnover: pickFirstNumber(row, [["turnovers"], ["turnover"], ["to"], ["ball_losses"], ["statistics", "turnovers"], ["statistics", "ball_losses"], ["stats", "turnovers"]]),
    });

    const current = statsByPlayer.get(key) ?? 0;
    statsByPlayer.set(key, Number((current + points).toFixed(2)));
  }

  const breakdown: Record<string, number> = { ...zeroBreakdown };
  let totalPoints = 0;
  for (const playerName of lineup) {
    const key = normalizeNameKey(playerName);
    const playerPoints = Number((statsByPlayer.get(key) ?? 0).toFixed(2));
    breakdown[playerName] = playerPoints;
    totalPoints += playerPoints;
  }

  return {
    status,
    totalPoints: Number(totalPoints.toFixed(2)),
    breakdown,
  };
}

async function fetchApiSportsStatsForDailyEntry(
  entry: FantasyEntryRow,
  slateDate: string
): Promise<{
  status: FantasyEntryStatus;
  totalPoints: number;
  breakdown: Record<string, number>;
}> {
  const lineup = parseLineup(entry.lineup);
  const zeroBreakdown = zeroBreakdownForLineup(lineup);
  const startsAtMs = Date.parse(entry.starts_at);
  const nowMs = Date.now();
  if (Number.isFinite(startsAtMs) && nowMs < startsAtMs) {
    return { status: "pending", totalPoints: 0, breakdown: zeroBreakdown };
  }

  if (!isApiSportsConfigured()) {
    return { status: entry.status, totalPoints: Number(entry.points ?? 0), breakdown: parseScoreBreakdown(entry.score_breakdown) };
  }

  const parsedDate = parseDateString(slateDate);
  if (!parsedDate) {
    return { status: entry.status, totalPoints: Number(entry.points ?? 0), breakdown: parseScoreBreakdown(entry.score_breakdown) };
  }

  const slateStart = new Date(Date.UTC(parsedDate.year, parsedDate.month - 1, parsedDate.day, 0, 0, 0, 0));
  const dates = [
    new Date(slateStart.getTime() - 24 * 60 * 60 * 1000),
    slateStart,
    new Date(slateStart.getTime() + 24 * 60 * 60 * 1000),
  ].map((d) => d.toISOString().slice(0, 10));

  const gameRowsByDate = await Promise.all(dates.map((date) => fetchApiSportsNbaGamesByDate(date)));
  const allGames: ApiSportsNbaGame[] = gameRowsByDate.flat();
  const slateRelevantGames = allGames.filter((game) => {
    const startMs = parseApiSportsGameStartMs(game);
    if (!Number.isFinite(startMs) || !Number.isFinite(startsAtMs)) {
      return false;
    }
    return startMs >= startsAtMs - 4 * 60 * 60 * 1000 && startMs <= startsAtMs + 36 * 60 * 60 * 1000;
  });
  const startedGames = slateRelevantGames.filter((game) => isApiSportsGameStarted(game));
  const anyInProgressGame = startedGames.some((game) => isApiSportsGameInProgress(game));
  // Daily slate is only final when every relevant game for the slate is final.
  // Using startedGames here can finalize too early if later games haven't started yet.
  const allGamesFinal = slateRelevantGames.length > 0 && slateRelevantGames.every((game) => isApiSportsGameFinal(game));

  if (startedGames.length === 0) {
    const status: FantasyEntryStatus = Number.isFinite(startsAtMs) && nowMs >= startsAtMs ? "live" : "pending";
    return { status, totalPoints: 0, breakdown: zeroBreakdown };
  }

  const statsByPlayer = new Map<string, number>();
  const gameIds = Array.from(
    new Set(
      startedGames
        .map((game) => getApiSportsGameId(game))
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
  const statsBatches = await Promise.all(gameIds.map((gameId) => fetchApiSportsNbaPlayerStats(gameId)));
  const hasAnyStatsRows = statsBatches.some((rows) => rows.length > 0);
  if (!hasAnyStatsRows) {
    const status: FantasyEntryStatus = allGamesFinal ? "final" : "live";
    return { status, totalPoints: 0, breakdown: zeroBreakdown };
  }

  for (const rows of statsBatches) {
    for (const raw of rows) {
      const row = asRecord(raw);
      const playerName = extractApiSportsPlayerName(row);
      if (!playerName) {
        continue;
      }
      const key = normalizeNameKey(playerName);
      if (!key) {
        continue;
      }
      const points = computeFantasyPoints({
        pts: pickFirstNumber(row, [["points"], ["statistics", "points"], ["stats", "points"], ["pts"]]),
        reb: pickFirstNumber(row, [["totReb"], ["rebounds", "total"], ["rebounds"], ["reb"], ["statistics", "totReb"], ["statistics", "rebounds", "total"], ["statistics", "rebounds"], ["stats", "rebounds", "total"], ["stats", "rebounds"]]),
        ast: pickFirstNumber(row, [["assists"], ["ast"], ["statistics", "assists"], ["stats", "assists"]]),
        stl: pickFirstNumber(row, [["steals"], ["stl"], ["statistics", "steals"], ["stats", "steals"]]),
        blk: pickFirstNumber(row, [["blocks"], ["blk"], ["statistics", "blocks"], ["stats", "blocks"]]),
        turnover: pickFirstNumber(row, [["turnovers"], ["turnover"], ["to"], ["ball_losses"], ["statistics", "turnovers"], ["statistics", "ball_losses"], ["stats", "turnovers"]]),
      });
      const current = statsByPlayer.get(key) ?? 0;
      statsByPlayer.set(key, Number((current + points).toFixed(2)));
    }
  }

  const breakdown: Record<string, number> = { ...zeroBreakdown };
  let totalPoints = 0;
  for (const playerName of lineup) {
    const key = normalizeNameKey(playerName);
    const playerPoints = Number((statsByPlayer.get(key) ?? 0).toFixed(2));
    breakdown[playerName] = playerPoints;
    totalPoints += playerPoints;
  }

  const status: FantasyEntryStatus = allGamesFinal
    ? "final"
    : anyInProgressGame || (Number.isFinite(startsAtMs) && nowMs >= startsAtMs)
    ? "live"
    : "pending";

  return {
    status,
    totalPoints: Number(totalPoints.toFixed(2)),
    breakdown,
  };
}


export async function refreshFantasyProgress(params?: {
  userId?: string;
  limit?: number;
}): Promise<{ scanned: number; updated: number; finalized: number; rewardedGames: number }> {
  if (!supabaseAdmin) {
    return { scanned: 0, updated: 0, finalized: 0, rewardedGames: 0 };
  }

  await ensureFantasyTables();

  const limit = Math.max(1, Math.min(500, Number(params?.limit ?? 240)));
  let query = supabaseAdmin
    .from("fantasy_entries")
    .select(
      "id, user_id, venue_id, sport_key, game_id, game_label, home_team, away_team, starts_at, lineup, status, points, score_breakdown, reward_points, reward_claimed_at, live_collected_points, stats_last_source_updated_at, settled_at, created_at, updated_at"
    )
    .in("status", ["pending", "live"])
    .order("starts_at", { ascending: true })
    .limit(limit);

  const userId = String(params?.userId ?? "").trim();
  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;
  if (error || !Array.isArray(data)) {
    if (isMissingFantasyTablesError(error)) {
      return { scanned: 0, updated: 0, finalized: 0, rewardedGames: 0 };
    }
    throw new Error(error?.message ?? "Failed to load fantasy entries for refresh.");
  }

  const entries = data as FantasyEntryRow[];
  if (entries.length === 0) {
    return { scanned: 0, updated: 0, finalized: 0, rewardedGames: 0 };
  }

  const recentLiveRows = await loadRecentLivePlayerStatsRows();
  const gameMetaById = await loadApiSportsGameMetaForRecentWindow();
  const nowMs = Date.now();
  const STALE_RECONCILE_AFTER_MS = 4 * 60 * 60 * 1000;

  let updated = 0;
  let finalized = 0;
  for (const entry of entries) {
    const startsAtMs = Date.parse(entry.starts_at);
    const lineup = parseLineup(entry.lineup);
    const zeroBreakdown = zeroBreakdownForLineup(lineup);

    if (Number.isFinite(startsAtMs) && nowMs < startsAtMs) {
      const existingBreakdown = parseScoreBreakdown(entry.score_breakdown);
      const breakdownChanged = JSON.stringify(existingBreakdown) !== JSON.stringify(zeroBreakdown);
      const pointsChanged = Math.abs(Number(entry.points ?? 0)) >= 0.01;
      const statusChanged = entry.status !== "pending";
      if (breakdownChanged || pointsChanged || statusChanged || entry.reward_points !== 0 || entry.stats_last_source_updated_at) {
        const { error: preTipoffResetError } = await supabaseAdmin
          .from("fantasy_entries")
          .update({
            status: "pending",
            points: 0,
            score_breakdown: zeroBreakdown,
            reward_points: 0,
            stats_last_source_updated_at: null,
            settled_at: null,
          })
          .eq("id", entry.id);
        if (!preTipoffResetError) {
          updated += 1;
        }
      }
      continue;
    }

    let next = {
      status: entry.status,
      totalPoints: Number(entry.points ?? 0),
      breakdown: parseScoreBreakdown(entry.score_breakdown),
      latestSourceUpdatedAt: entry.stats_last_source_updated_at,
    };

    const isStarted = Number.isFinite(startsAtMs) && nowMs >= startsAtMs;
    const isStale = isStarted && Number.isFinite(startsAtMs) && nowMs - startsAtMs >= STALE_RECONCILE_AFTER_MS;
    const fromLiveTable = computeFantasyFromLiveStats(entry, recentLiveRows, gameMetaById);
    if (fromLiveTable) {
      next = fromLiveTable;
    }
    const hasLiveRows = Boolean(fromLiveTable && fromLiveTable.latestSourceUpdatedAt);

    if (FANTASY_USE_DIRECT_APISPORTS_SCORING && (!hasLiveRows || isStale || next.status === "final")) {
      try {
        const direct = await fetchApiSportsStatsForEntry(entry);
        next = {
          ...direct,
          latestSourceUpdatedAt: next.latestSourceUpdatedAt ?? entry.stats_last_source_updated_at,
        };
      } catch {
        // Keep live-table-derived state when direct reconciliation fails.
      }
    }

    const previousSyncTs = Date.parse(String(entry.stats_last_source_updated_at ?? ""));
    const nextSyncTs = Date.parse(String(next.latestSourceUpdatedAt ?? ""));
    if (
      Number.isFinite(previousSyncTs) &&
      Number.isFinite(nextSyncTs) &&
      nextSyncTs <= previousSyncTs &&
      next.status !== "final"
    ) {
      next = {
        status: entry.status,
        totalPoints: Number(entry.points ?? 0),
        breakdown: parseScoreBreakdown(entry.score_breakdown),
        latestSourceUpdatedAt: entry.stats_last_source_updated_at,
      };
    }

    // Safety net: stale entries should never remain pending/live forever.
    // Daily slates span many game start times so use a longer threshold (16 h covers
    // even the latest West-Coast tip-offs finishing after midnight).
    const isDailySlate = Boolean(parseAnyDailyGameId(entry.game_id));
    const DAILY_SLATE_STALE_MS = 16 * 60 * 60 * 1000;
    const isDailySlateStale = isDailySlate && isStarted && nowMs - startsAtMs >= DAILY_SLATE_STALE_MS;
    if ((!isDailySlate && isStale || isDailySlateStale) && next.status !== "final") {
      next = {
        status: "final",
        totalPoints: Number(entry.points ?? 0),
        breakdown: parseScoreBreakdown(entry.score_breakdown),
        latestSourceUpdatedAt: entry.stats_last_source_updated_at,
      };
    }

    const existingBreakdown = parseScoreBreakdown(entry.score_breakdown);
    const breakdownChanged = JSON.stringify(existingBreakdown) !== JSON.stringify(next.breakdown);
    const statusChanged = next.status !== entry.status;
    const pointsChanged = Math.abs(next.totalPoints - Number(entry.points ?? 0)) >= 0.01;
    const nextRewardPoints = next.status === "final" ? computeFantasyRewardPoints(next.totalPoints) : 0;
    const rewardPointsChanged = nextRewardPoints !== Math.max(0, Number(entry.reward_points ?? 0));

    if (!statusChanged && !pointsChanged && !breakdownChanged && !rewardPointsChanged) {
      continue;
    }

    const payload: Record<string, unknown> = {
      status: next.status,
      points: next.totalPoints,
      score_breakdown: next.breakdown,
      reward_points: nextRewardPoints,
      stats_last_source_updated_at: next.latestSourceUpdatedAt ?? entry.stats_last_source_updated_at,
    };

    if (next.status === "final") {
      payload.settled_at = new Date().toISOString();
    }

    const { error: updateError } = await supabaseAdmin.from("fantasy_entries").update(payload).eq("id", entry.id);
    if (updateError) {
      continue;
    }

    updated += 1;
    if (next.status === "final") {
      finalized += 1;
    }
  }

  return {
    scanned: entries.length,
    updated,
    finalized,
    rewardedGames: 0,
  };
}

export async function debugFantasyScoring(params: {
  userId: string;
  entryId?: string;
}): Promise<{
  entry: {
    id: string;
    gameId: string;
    startsAt: string;
    status: string;
    lineup: string[];
    points: number;
  } | null;
  recentLiveRowCount: number;
  playerDiagnostics: Array<{
    playerName: string;
    matchedRowCount: number;
    acceptedGameIds: string[];
    acceptedPoints: number;
    sampleRejectedReasons: string[];
  }>;
}> {
  const userId = String(params.userId ?? "").trim();
  const entryId = String(params.entryId ?? "").trim();
  if (!supabaseAdmin || !userId) {
    return { entry: null, recentLiveRowCount: 0, playerDiagnostics: [] };
  }

  await ensureFantasyTables();

  let query = supabaseAdmin
    .from("fantasy_entries")
    .select("id, game_id, starts_at, status, lineup, points, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (entryId) {
    query = query.eq("id", entryId);
  } else {
    query = query.like("game_id", "nba-daily-%");
  }

  const { data: entryRows } = await query;
  const row = (entryRows?.[0] ?? null) as
    | { id: string; game_id: string; starts_at: string; status: string; lineup: unknown; points: number }
    | null;
  if (!row) {
    return { entry: null, recentLiveRowCount: 0, playerDiagnostics: [] };
  }

  const entry = {
    id: row.id,
    gameId: row.game_id,
    startsAt: row.starts_at,
    status: row.status,
    lineup: parseLineup(row.lineup),
    points: Number(row.points ?? 0),
  };
  const startsAtMs = Date.parse(entry.startsAt);
  const nowMs = Date.now();
  const hasDailyGameId = Boolean(parseFantasyDailyGameId(entry.gameId));
  const recentLiveRows = await loadRecentLivePlayerStatsRows();
  const gameMetaById = await loadApiSportsGameMetaForRecentWindow();

  const playerDiagnostics = entry.lineup.map((playerName) => {
    const rejected: string[] = [];
    const accepted = recentLiveRows.filter((rowLive) => {
      if (!isStartedGameStatus(rowLive.game_status)) {
        rejected.push("not_started_status");
        return false;
      }
      if (!namesLikelyMatch(playerName, String(rowLive.player_name ?? ""))) {
        rejected.push("name_mismatch");
        return false;
      }
      const gameId = String(rowLive.game_id ?? "").trim();
      if (!gameId) {
        rejected.push("missing_game_id");
        return false;
      }
      const rowTs = Date.parse(String(rowLive.source_updated_at ?? ""));
      if (Number.isFinite(startsAtMs) && Number.isFinite(rowTs) && (rowTs < startsAtMs || rowTs > nowMs + 2 * 60 * 60 * 1000)) {
        rejected.push("outside_row_timestamp_window");
        return false;
      }
      const gameMeta = gameMetaById.get(gameId);
      if (hasDailyGameId) {
        if (!gameMeta || !Number.isFinite(startsAtMs)) {
          rejected.push("missing_game_meta_for_daily");
          return false;
        }
        if (gameMeta.startMs < startsAtMs - 2 * 60 * 60 * 1000 || gameMeta.startMs > startsAtMs + 36 * 60 * 60 * 1000) {
          rejected.push("outside_daily_game_window");
          return false;
        }
      }
      return true;
    });

    const latestByGame = getLatestRowsByGameId(accepted);
    const acceptedPoints = Number(latestByGame.reduce((sum, r) => sum + Number(r.total_fantasy_points ?? 0), 0).toFixed(2));
    return {
      playerName,
      matchedRowCount: accepted.length,
      acceptedGameIds: latestByGame.map((r) => String(r.game_id ?? "").trim()).filter(Boolean),
      acceptedPoints,
      sampleRejectedReasons: Array.from(new Set(rejected)).slice(0, 8),
    };
  });

  return {
    entry,
    recentLiveRowCount: recentLiveRows.length,
    playerDiagnostics,
  };
}

export async function listFantasyLeaderboard(params: {
  venueId: string;
  gameId: string;
  limit?: number;
}): Promise<FantasyLeaderboardEntry[]> {
  const venueId = String(params.venueId ?? "").trim();
  const gameId = String(params.gameId ?? "").trim();
  if (!venueId || !gameId || !supabaseAdmin) {
    return [];
  }

  await ensureFantasyTables();

  const limit = Math.max(1, Math.min(80, Number(params.limit ?? 30)));
  const { data, error } = await supabaseAdmin
    .from("fantasy_entries")
    .select("id, user_id, lineup, points, status, reward_points")
    .eq("venue_id", venueId)
    .eq("game_id", gameId)
    .order("points", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error || !Array.isArray(data)) {
    if (isMissingFantasyTablesError(error)) {
      return [];
    }
    throw new Error(error?.message ?? "Failed to load fantasy leaderboard.");
  }

  const userIds = Array.from(new Set(data.map((row) => String((row as { user_id?: string }).user_id ?? "").trim()).filter(Boolean)));
  let usernamesByUserId = new Map<string, string>();

  if (userIds.length > 0) {
    const { data: usersData } = await supabaseAdmin.from("users").select("id, username").in("id", userIds).limit(userIds.length);
    usernamesByUserId = new Map(
      (usersData as Array<{ id: string; username: string }> | null | undefined)?.map((user) => [user.id, user.username]) ?? []
    );
  }

  return data.map((row, index) => {
    const userIdRow = String((row as { user_id?: string }).user_id ?? "").trim();
    const lineup = parseLineup((row as { lineup?: unknown }).lineup);
    const points = Number(Number((row as { points?: number }).points ?? 0).toFixed(2));

    return {
      entryId: String((row as { id?: string }).id ?? "").trim(),
      userId: userIdRow,
      username: usernamesByUserId.get(userIdRow) ?? "Player",
      points,
      status: ((row as { status?: FantasyEntryStatus }).status ?? "pending") as FantasyEntryStatus,
      rank: index + 1,
      lineup,
      rewardPoints: Math.max(0, Number((row as { reward_points?: number }).reward_points ?? 0)),
    };
  });
}

export async function claimFantasyReward(params: {
  userId: string;
  entryId: string;
}): Promise<{ claimed: boolean; pointsAwarded: number }> {
  const userId = String(params.userId ?? "").trim();
  const entryId = String(params.entryId ?? "").trim();
  if (!userId || !entryId) {
    throw new Error("userId and entryId are required.");
  }
  if (!supabaseAdmin) {
    return { claimed: false, pointsAwarded: 0 };
  }

  await ensureFantasyTables();

  const { data: entry, error } = await supabaseAdmin
    .from("fantasy_entries")
    .select("id, user_id, venue_id, status, points, reward_points, reward_claimed_at, live_collected_points, sport_key")
    .eq("id", entryId)
    .eq("user_id", userId)
    .maybeSingle<{
      id: string;
      user_id: string;
      venue_id: string;
      status: FantasyEntryStatus;
      points: number;
      reward_points: number;
      reward_claimed_at: string | null;
      live_collected_points: number;
      sport_key: string;
    }>();

  if (error || !entry) {
    throw new Error(error?.message ?? "Fantasy entry not found.");
  }
  if (entry.status !== "final") {
    throw new Error("Fantasy rewards can only be claimed after the game is final.");
  }
  if (entry.reward_claimed_at) {
    return { claimed: false, pointsAwarded: 0 };
  }

  const basePointsAwarded = computeFantasyRewardPoints(Number(entry.points ?? 0));
  if (basePointsAwarded <= 0) {
    throw new Error("This entry does not have a reward to claim.");
  }
  // Subtract any platform points already awarded via mid-game live collection.
  const alreadyCollected = Math.max(0, Number(entry.live_collected_points ?? 0));
  let pointsAwarded = Math.max(0, basePointsAwarded - alreadyCollected);

  const nowIso = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("fantasy_entries")
    .update({ reward_claimed_at: nowIso, reward_points: pointsAwarded })
    .eq("id", entry.id)
    .is("reward_claimed_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (claimError) {
    throw new Error(claimError.message ?? "Failed to claim fantasy reward.");
  }
  if (!claimed) {
    return { claimed: false, pointsAwarded: 0 };
  }

  const venueId = String(entry.venue_id ?? "").trim();
  if (venueId && pointsAwarded > 0) {
    try {
      const campaignResult = await applyChallengeCampaignPoints({
        userId,
        venueId,
        gameType: "fantasy",
        basePoints: pointsAwarded,
      });
      pointsAwarded = Math.max(0, Number(campaignResult.finalPoints ?? pointsAwarded));
    } catch {}
  }

  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select("points")
    .eq("id", userId)
    .maybeSingle<{ points: number }>();

  if (userError) {
    throw new Error(userError.message ?? "Failed to load user profile.");
  }

  const currentPoints = Math.max(0, Number(user?.points ?? 0));
  const { error: updateUserError } = await supabaseAdmin
    .from("users")
    .update({ points: currentPoints + pointsAwarded })
    .eq("id", userId);

  if (updateUserError) {
    throw new Error(updateUserError.message ?? "Failed to award fantasy points.");
  }

  const sportLabel =
    entry.sport_key === "baseball_mlb"
      ? "baseball"
      : entry.sport_key === "american_football_nfl"
        ? "football"
        : "basketball";
  await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    type: "success",
    message: `Great job, coach! Your fantasy ${sportLabel} team won ${pointsAwarded} pts!`,
  });

  return { claimed: true, pointsAwarded };
}

export async function collectFantasyLivePoints(params: {
  userId: string;
  entryId: string;
}): Promise<{ collected: boolean; platformPointsAwarded: number }> {
  const userId = String(params.userId ?? "").trim();
  const entryId = String(params.entryId ?? "").trim();
  if (!userId || !entryId) {
    throw new Error("userId and entryId are required.");
  }
  if (!supabaseAdmin) {
    return { collected: false, platformPointsAwarded: 0 };
  }

  await ensureFantasyTables();

  const { data: entry, error } = await supabaseAdmin
    .from("fantasy_entries")
    .select("id, user_id, venue_id, status, points, live_collected_points")
    .eq("id", entryId)
    .eq("user_id", userId)
    .maybeSingle<{
      id: string;
      user_id: string;
      venue_id: string;
      status: FantasyEntryStatus;
      points: number;
      live_collected_points: number;
    }>();

  if (error || !entry) {
    throw new Error(error?.message ?? "Fantasy entry not found.");
  }
  if (entry.status !== "pending" && entry.status !== "live") {
    throw new Error("Live points can only be collected while the game is in progress.");
  }

  const currentPlatformPoints = computeFantasyRewardPoints(Math.max(0, Number(entry.points ?? 0)));
  const alreadyCollected = Math.max(0, Number(entry.live_collected_points ?? 0));
  const toAward = Math.max(0, currentPlatformPoints - alreadyCollected);

  if (toAward <= 0) {
    return { collected: false, platformPointsAwarded: 0 };
  }

  // Update live_collected_points atomically — only if it hasn't changed since we read it.
  const { data: updated, error: updateEntryError } = await supabaseAdmin
    .from("fantasy_entries")
    .update({ live_collected_points: alreadyCollected + toAward })
    .eq("id", entryId)
    .eq("live_collected_points", alreadyCollected)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (updateEntryError) {
    throw new Error(updateEntryError.message ?? "Failed to record live collection.");
  }
  if (!updated) {
    // Concurrent collection; return 0 so client knows nothing was awarded this attempt.
    return { collected: false, platformPointsAwarded: 0 };
  }

  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select("points")
    .eq("id", userId)
    .maybeSingle<{ points: number }>();

  if (userError) {
    throw new Error(userError.message ?? "Failed to load user profile.");
  }

  const currentBalance = Math.max(0, Number(user?.points ?? 0));
  const { error: updateUserError } = await supabaseAdmin
    .from("users")
    .update({ points: currentBalance + toAward })
    .eq("id", userId);

  if (updateUserError) {
    throw new Error(updateUserError.message ?? "Failed to award live fantasy points.");
  }

  return { collected: true, platformPointsAwarded: toAward };
}
