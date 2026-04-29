import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ODDS_API_BASE_URL = process.env.ODDS_API_BASE_URL ?? "https://api.the-odds-api.com/v4";
const ODDS_API_KEY = process.env.ODDS_API_KEY?.trim() ?? "";
const BALLDONTLIE_API_BASE_URL = process.env.BALLDONTLIE_API_BASE_URL ?? "https://api.balldontlie.io";
const BALLDONTLIE_API_KEY = process.env.BALLDONTLIE_API_KEY?.trim() ?? "";
const FANTASY_SPORT_KEY = "basketball_nba";
const FANTASY_LINEUP_SIZE = 5;
const FANTASY_POINTS_FOR_WINNER = Math.max(0, Number.parseInt(process.env.FANTASY_WINNER_POINTS ?? "250", 10) || 250);
const FANTASY_PLAYER_POOL_LIMIT = 30;
const FANTASY_SCORES_DAYS_FROM = 2;
const FANTASY_TABLES_MISSING_ERROR =
  "Fantasy tables are not installed in this Supabase project yet. Run migration supabase/migrations/20260428184500_add_fantasy_entries.sql.";

const FANTASY_PROP_MARKETS = ["player_points", "player_rebounds", "player_assists"] as const;

type FantasyEntryStatus = "pending" | "live" | "final" | "canceled";
type FantasyGameStatus = "scheduled" | "live" | "final";

type SupabaseLikeError = {
  code?: string;
  message?: string;
};

type OddsEvent = {
  id?: string;
  sport_key?: string;
  sport_title?: string;
  commence_time?: string;
  home_team?: string;
  away_team?: string;
};

type OddsScoreEvent = {
  id?: string;
  sport_key?: string;
  completed?: boolean;
  commence_time?: string;
  home_team?: string;
  away_team?: string;
  scores?: Array<{
    name?: string;
    score?: number | string | null;
  }>;
};

type OddsEventOdds = {
  id?: string;
  bookmakers?: Array<{
    markets?: Array<{
      key?: string;
      outcomes?: Array<{
        name?: string;
        description?: string;
        point?: number | string;
      }>;
    }>;
  }>;
};

type BallDontLieTeam = {
  full_name?: string;
  name?: string;
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
  player?: BallDontLiePlayer;
  game?: BallDontLieGame;
};

type BallDontLieListResponse<T> = {
  data?: T[];
  meta?: {
    next_cursor?: number | null;
  };
};

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
  settled_at: string | null;
  created_at: string;
  updated_at: string;
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
  playerName: string;
  coverage: number;
  projectedLine: number | null;
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
  status: FantasyEntryStatus;
  points: number;
  scoreBreakdown: Record<string, number>;
  rewardPoints: number;
  rewardClaimedAt: string | null;
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

function assertOddsConfigured(): void {
  if (!ODDS_API_KEY) {
    throw new Error("ODDS_API_KEY is not configured.");
  }
}

function assertBallDontLieConfigured(): void {
  if (!BALLDONTLIE_API_KEY) {
    throw new Error("BALLDONTLIE_API_KEY is not configured.");
  }
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

function toGameLabel(homeTeam: string, awayTeam: string): string {
  return `${awayTeam} vs. ${homeTeam}`;
}

function parseScore(value: number | string | null | undefined): number | null {
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

function parseLineValue(value: number | string | null | undefined): number | null {
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

function parseLineup(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const lineup: string[] = [];

  for (const item of raw) {
    const name = String(item ?? "").trim();
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

  return lineup.slice(0, FANTASY_LINEUP_SIZE);
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

function mapFantasyEntryRow(row: FantasyEntryRow): FantasyEntry {
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
    lineup: parseLineup(row.lineup),
    status: row.status,
    points: Number(Number(row.points ?? 0).toFixed(2)),
    scoreBreakdown: parseScoreBreakdown(row.score_breakdown),
    rewardPoints: Math.max(0, Number(row.reward_points ?? 0)),
    rewardClaimedAt: row.reward_claimed_at,
    settledAt: row.settled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function fetchOddsJson(path: string, query: URLSearchParams): Promise<unknown> {
  assertOddsConfigured();
  const response = await fetch(`${ODDS_API_BASE_URL}${path}?${query.toString()}`, {
    method: "GET",
    next: { revalidate: 10 },
  });

  if (!response.ok) {
    throw new Error(`Fantasy odds request failed with status ${response.status}.`);
  }

  return response.json();
}

async function fetchBallDontLieJson(path: string, query: URLSearchParams): Promise<unknown> {
  assertBallDontLieConfigured();
  const response = await fetch(`${BALLDONTLIE_API_BASE_URL}${path}?${query.toString()}`, {
    method: "GET",
    headers: {
      Authorization: BALLDONTLIE_API_KEY,
    },
    next: { revalidate: 10 },
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

async function fetchFantasyEvents(range: { fromIso: string; toIso: string }): Promise<OddsEvent[]> {
  const query = new URLSearchParams();
  query.set("apiKey", ODDS_API_KEY);
  query.set("dateFormat", "iso");
  query.set("commenceTimeFrom", range.fromIso);
  query.set("commenceTimeTo", range.toIso);

  const payload = await fetchOddsJson(`/sports/${encodeURIComponent(FANTASY_SPORT_KEY)}/events`, query);
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload as OddsEvent[];
}

async function fetchFantasyScores(): Promise<Map<string, OddsScoreEvent>> {
  const query = new URLSearchParams();
  query.set("apiKey", ODDS_API_KEY);
  query.set("daysFrom", String(FANTASY_SCORES_DAYS_FROM));
  query.set("dateFormat", "iso");

  const payload = await fetchOddsJson(`/sports/${encodeURIComponent(FANTASY_SPORT_KEY)}/scores`, query);
  if (!Array.isArray(payload)) {
    return new Map();
  }

  const byId = new Map<string, OddsScoreEvent>();
  for (const row of payload as OddsScoreEvent[]) {
    const id = String(row.id ?? "").trim();
    if (id) {
      byId.set(id, row);
    }
  }
  return byId;
}

function mapOddsEventToFantasyGame(event: OddsEvent, scoreEvent: OddsScoreEvent | undefined): FantasyGame | null {
  const id = String(event.id ?? "").trim();
  const startsAt = String(event.commence_time ?? "").trim();
  const homeTeam = String(event.home_team ?? "").trim();
  const awayTeam = String(event.away_team ?? "").trim();
  if (!id || !startsAt || !homeTeam || !awayTeam) {
    return null;
  }

  let homeScore: number | null = null;
  let awayScore: number | null = null;
  if (scoreEvent?.scores && Array.isArray(scoreEvent.scores)) {
    for (const score of scoreEvent.scores) {
      const name = String(score?.name ?? "").trim();
      const value = parseScore(score?.score);
      if (value === null) {
        continue;
      }
      if (teamsMatch(name, homeTeam)) {
        homeScore = value;
      } else if (teamsMatch(name, awayTeam)) {
        awayScore = value;
      }
    }
  }

  const nowMs = Date.now();
  const startsAtMs = new Date(startsAt).getTime();
  const completed = Boolean(scoreEvent?.completed);
  const status: FantasyGameStatus = completed ? "final" : Number.isFinite(startsAtMs) && nowMs >= startsAtMs ? "live" : "scheduled";

  return {
    id,
    sportKey: String(event.sport_key ?? FANTASY_SPORT_KEY).trim() || FANTASY_SPORT_KEY,
    league: String(event.sport_title ?? "NBA").trim() || "NBA",
    startsAt,
    gameLabel: toGameLabel(homeTeam, awayTeam),
    homeTeam,
    awayTeam,
    status,
    homeScore,
    awayScore,
    isLocked: status !== "scheduled",
  };
}

export async function listFantasyGames(params?: {
  date?: string;
  tzOffsetMinutes?: number | string;
  limit?: number;
}): Promise<FantasyGame[]> {
  const limit = Math.max(1, Math.min(40, Number(params?.limit ?? 20)));
  const tzOffsetMinutes = parseTimezoneOffset(params?.tzOffsetMinutes);
  const range = buildUtcRangeForLocalDay(params?.date, tzOffsetMinutes);

  const [events, scoresById] = await Promise.all([fetchFantasyEvents(range), fetchFantasyScores()]);

  const games: FantasyGame[] = [];
  for (const event of events) {
    const id = String(event.id ?? "").trim();
    const game = mapOddsEventToFantasyGame(event, id ? scoresById.get(id) : undefined);
    if (!game) {
      continue;
    }

    const startsAtMs = new Date(game.startsAt).getTime();
    if (!Number.isFinite(startsAtMs) || startsAtMs < range.fromMs || startsAtMs > range.toMs) {
      continue;
    }
    games.push(game);
  }

  games.sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
  return games.slice(0, limit);
}

export async function getFantasyPlayerPoolForGame(params: {
  gameId: string;
  sportKey?: string;
}): Promise<FantasyPlayerPoolItem[]> {
  const gameId = String(params.gameId ?? "").trim();
  const sportKey = String(params.sportKey ?? FANTASY_SPORT_KEY).trim() || FANTASY_SPORT_KEY;
  if (!gameId) {
    throw new Error("gameId is required.");
  }

  const regions = ["us", "us,eu"];
  const playersByKey = new Map<string, { playerName: string; lines: number[]; markets: Set<string> }>();

  for (const region of regions) {
    const query = new URLSearchParams();
    query.set("apiKey", ODDS_API_KEY);
    query.set("regions", region);
    query.set("markets", FANTASY_PROP_MARKETS.join(","));
    query.set("oddsFormat", "american");

    let payload: unknown = null;
    try {
      payload = await fetchOddsJson(`/sports/${encodeURIComponent(sportKey)}/events/${encodeURIComponent(gameId)}/odds`, query);
    } catch {
      continue;
    }

    const odds = payload as OddsEventOdds | null;
    const bookmakers = Array.isArray(odds?.bookmakers) ? odds.bookmakers : [];
    for (const bookmaker of bookmakers) {
      const markets = Array.isArray(bookmaker?.markets) ? bookmaker.markets : [];
      for (const market of markets) {
        const marketKey = String(market?.key ?? "").trim();
        if (!FANTASY_PROP_MARKETS.includes(marketKey as (typeof FANTASY_PROP_MARKETS)[number])) {
          continue;
        }

        const outcomes = Array.isArray(market?.outcomes) ? market.outcomes : [];
        for (const outcome of outcomes) {
          const rawPlayerName = String(outcome?.description ?? "").trim();
          if (!rawPlayerName) {
            continue;
          }

          const key = normalizeNameKey(rawPlayerName);
          if (!key) {
            continue;
          }

          const current = playersByKey.get(key) ?? {
            playerName: rawPlayerName,
            lines: [],
            markets: new Set<string>(),
          };

          const line = parseLineValue(outcome?.point);
          if (line !== null) {
            current.lines.push(line);
          }
          current.markets.add(marketKey);
          playersByKey.set(key, current);
        }
      }
    }

    if (playersByKey.size > 0) {
      break;
    }
  }

  const pool = Array.from(playersByKey.values())
    .map((item) => {
      const total = item.lines.reduce((sum, value) => sum + value, 0);
      const projectedLine = item.lines.length > 0 ? Number((total / item.lines.length).toFixed(1)) : null;
      return {
        playerName: item.playerName,
        coverage: item.markets.size,
        projectedLine,
      };
    })
    .sort((left, right) => {
      if (right.coverage !== left.coverage) {
        return right.coverage - left.coverage;
      }
      if ((right.projectedLine ?? -Infinity) !== (left.projectedLine ?? -Infinity)) {
        return (right.projectedLine ?? -Infinity) - (left.projectedLine ?? -Infinity);
      }
      return left.playerName.localeCompare(right.playerName);
    })
    .slice(0, FANTASY_PLAYER_POOL_LIMIT);

  return pool;
}

async function listFantasyGamesAroundNow(): Promise<FantasyGame[]> {
  const tzOffsetMinutes = new Date().getTimezoneOffset();
  const today = getTodayDateInOffset(tzOffsetMinutes);
  const tomorrowDate = new Date(`${today}T00:00:00.000Z`);
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrow = `${tomorrowDate.getUTCFullYear()}-${String(tomorrowDate.getUTCMonth() + 1).padStart(2, "0")}-${String(
    tomorrowDate.getUTCDate()
  ).padStart(2, "0")}`;

  const [todayGames, tomorrowGames] = await Promise.all([
    listFantasyGames({ date: today, tzOffsetMinutes, limit: 30 }),
    listFantasyGames({ date: tomorrow, tzOffsetMinutes, limit: 30 }),
  ]);

  return [...todayGames, ...tomorrowGames];
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

async function findFantasyGameById(gameId: string): Promise<FantasyGame | null> {
  const games = await listFantasyGamesAroundNow();
  return games.find((game) => game.id === gameId) ?? null;
}

function validateLineup(lineup: unknown): string[] {
  const parsed = parseLineup(lineup);
  if (parsed.length !== FANTASY_LINEUP_SIZE) {
    throw new Error(`Lineup must contain exactly ${FANTASY_LINEUP_SIZE} unique players.`);
  }
  return parsed;
}

export async function submitFantasyEntry(params: {
  userId: string;
  venueId: string;
  gameId: string;
  lineup: unknown;
}): Promise<FantasyEntry> {
  const userId = String(params.userId ?? "").trim();
  const venueId = String(params.venueId ?? "").trim();
  const gameId = String(params.gameId ?? "").trim();
  const lineup = validateLineup(params.lineup);

  if (!userId || !venueId || !gameId) {
    throw new Error("userId, venueId, and gameId are required.");
  }

  await ensureFantasyTables();

  const game = await findFantasyGameById(gameId);
  if (!game) {
    throw new Error("Game not found or unavailable for fantasy lineup entry.");
  }
  if (game.isLocked) {
    throw new Error("This game has already started and is locked.");
  }

  const playerPool = await getFantasyPlayerPoolForGame({ gameId: game.id, sportKey: game.sportKey });
  const playerPoolKeys = new Set(playerPool.map((item) => normalizeNameKey(item.playerName)).filter(Boolean));

  for (const playerName of lineup) {
    if (!playerPoolKeys.has(normalizeNameKey(playerName))) {
      throw new Error(`"${playerName}" is not in the available player pool for this game.`);
    }
  }

  const row = {
    user_id: userId,
    venue_id: venueId,
    sport_key: game.sportKey,
    game_id: game.id,
    game_label: game.gameLabel,
    home_team: game.homeTeam,
    away_team: game.awayTeam,
    starts_at: game.startsAt,
    lineup,
    status: "pending" as const,
    points: 0,
    score_breakdown: {},
    reward_points: 0,
  };

  const { data, error } = await supabaseAdmin!
    .from("fantasy_entries")
    .insert(row)
    .select(
      "id, user_id, venue_id, sport_key, game_id, game_label, home_team, away_team, starts_at, lineup, status, points, score_breakdown, reward_points, reward_claimed_at, settled_at, created_at, updated_at"
    )
    .maybeSingle<FantasyEntryRow>();

  if (error || !data) {
    if ((error as SupabaseLikeError | null)?.code === "23505") {
      throw new Error("You already have an entry for this game.");
    }
    if (isMissingFantasyTablesError(error)) {
      throw new Error(FANTASY_TABLES_MISSING_ERROR);
    }
    throw new Error(error?.message ?? "Failed to create fantasy entry.");
  }

  return mapFantasyEntryRow(data);
}

export async function listUserFantasyEntries(params: {
  userId: string;
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
      "id, user_id, venue_id, sport_key, game_id, game_label, home_team, away_team, starts_at, lineup, status, points, score_breakdown, reward_points, reward_claimed_at, settled_at, created_at, updated_at"
    )
    .eq("user_id", userId)
    .order("starts_at", { ascending: false })
    .limit(limit);

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

  return (data as FantasyEntryRow[]).map((row) => mapFantasyEntryRow(row));
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

function getBallDontLieGameTimestamp(game: BallDontLieGame): number {
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

function getBallDontLieTeamDisplay(team: BallDontLieTeam | null | undefined): string {
  return String(team?.full_name ?? team?.name ?? "").trim();
}

function findBestBallDontLieGame(entry: FantasyEntryRow, games: BallDontLieGame[]): BallDontLieGame | null {
  const matching = games.filter((game) => {
    const home = getBallDontLieTeamDisplay(game.home_team);
    const away = getBallDontLieTeamDisplay(game.visitor_team);
    return teamsMatch(home, entry.home_team) && teamsMatch(away, entry.away_team);
  });

  if (matching.length === 0) {
    return null;
  }

  const targetStart = +new Date(entry.starts_at);
  matching.sort((left, right) => {
    const leftDelta = Math.abs(getBallDontLieGameTimestamp(left) - targetStart);
    const rightDelta = Math.abs(getBallDontLieGameTimestamp(right) - targetStart);
    return leftDelta - rightDelta;
  });

  return matching[0] ?? null;
}

function isBallDontLieGameFinal(status: string): boolean {
  return status.trim().toLowerCase().startsWith("final");
}

async function fetchBallDontLieStatsForEntry(entry: FantasyEntryRow): Promise<{
  status: FantasyEntryStatus;
  totalPoints: number;
  breakdown: Record<string, number>;
}> {
  const startDate = new Date(entry.starts_at);
  if (!Number.isFinite(startDate.getTime())) {
    return { status: entry.status, totalPoints: Number(entry.points ?? 0), breakdown: parseScoreBreakdown(entry.score_breakdown) };
  }

  const dateKey = startDate.toISOString().slice(0, 10);
  const rangeStart = new Date(startDate);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - 1);
  const rangeEnd = new Date(startDate);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

  const gamesQuery = new URLSearchParams();
  gamesQuery.set("start_date", rangeStart.toISOString().slice(0, 10));
  gamesQuery.set("end_date", rangeEnd.toISOString().slice(0, 10));
  gamesQuery.set("per_page", "100");

  const games = await fetchBallDontLieList<BallDontLieGame>("/v1/games", gamesQuery);
  const matchingGame = findBestBallDontLieGame(entry, games);
  if (!matchingGame || typeof matchingGame.id !== "number") {
    return {
      status: entry.status,
      totalPoints: Number(entry.points ?? 0),
      breakdown: parseScoreBreakdown(entry.score_breakdown),
    };
  }

  const statsQuery = new URLSearchParams();
  statsQuery.set("game_ids[]", String(matchingGame.id));
  statsQuery.set("dates[]", dateKey);
  statsQuery.set("per_page", "100");
  const stats = await fetchBallDontLieList<BallDontLieStat>("/v1/stats", statsQuery);

  const statsByPlayer = new Map<string, number>();
  for (const row of stats) {
    const first = String(row.player?.first_name ?? "").trim();
    const last = String(row.player?.last_name ?? "").trim();
    const full = `${first} ${last}`.trim();
    const key = normalizeNameKey(full);
    if (!key) {
      continue;
    }

    const points = computeFantasyPoints({
      pts: Number(row.pts ?? 0),
      reb: Number(row.reb ?? 0),
      ast: Number(row.ast ?? 0),
      stl: Number(row.stl ?? 0),
      blk: Number(row.blk ?? 0),
      turnover: Number(row.turnover ?? 0),
    });

    statsByPlayer.set(key, points);
  }

  const lineup = parseLineup(entry.lineup);
  const breakdown: Record<string, number> = {};
  let totalPoints = 0;

  for (const playerName of lineup) {
    const key = normalizeNameKey(playerName);
    const playerPoints = Number((statsByPlayer.get(key) ?? 0).toFixed(2));
    breakdown[playerName] = playerPoints;
    totalPoints += playerPoints;
  }

  const final = isBallDontLieGameFinal(String(matchingGame.status ?? ""));
  const nowMs = Date.now();
  const startsAtMs = new Date(entry.starts_at).getTime();
  const status: FantasyEntryStatus = final
    ? "final"
    : Number.isFinite(startsAtMs) && nowMs >= startsAtMs
    ? "live"
    : "pending";

  return {
    status,
    totalPoints: Number(totalPoints.toFixed(2)),
    breakdown,
  };
}

async function awardFantasyWinners(params: { venueId: string; gameId: string }): Promise<void> {
  const venueId = String(params.venueId ?? "").trim();
  const gameId = String(params.gameId ?? "").trim();
  if (!venueId || !gameId || !supabaseAdmin) {
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("fantasy_entries")
    .select("id, points, reward_points")
    .eq("venue_id", venueId)
    .eq("game_id", gameId)
    .eq("status", "final");

  if (error || !Array.isArray(data) || data.length === 0) {
    return;
  }

  const normalized = data.map((row) => ({
    id: String((row as { id?: string }).id ?? "").trim(),
    points: Number((row as { points?: number }).points ?? 0),
    rewardPoints: Math.max(0, Number((row as { reward_points?: number }).reward_points ?? 0)),
  }));

  const topPoints = normalized.reduce((max, row) => (row.points > max ? row.points : max), 0);
  const winnerIds = new Set(normalized.filter((row) => row.points === topPoints).map((row) => row.id));

  const updates = normalized.filter((row) => {
    const shouldBe = winnerIds.has(row.id) ? FANTASY_POINTS_FOR_WINNER : 0;
    return row.rewardPoints !== shouldBe;
  });

  if (updates.length === 0) {
    return;
  }

  for (const update of updates) {
    const nextReward = winnerIds.has(update.id) ? FANTASY_POINTS_FOR_WINNER : 0;
    await supabaseAdmin.from("fantasy_entries").update({ reward_points: nextReward }).eq("id", update.id);
  }
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
      "id, user_id, venue_id, sport_key, game_id, game_label, home_team, away_team, starts_at, lineup, status, points, score_breakdown, reward_points, reward_claimed_at, settled_at, created_at, updated_at"
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

  let updated = 0;
  let finalized = 0;
  const rewardKeys = new Set<string>();

  for (const entry of entries) {
    let next = {
      status: entry.status,
      totalPoints: Number(entry.points ?? 0),
      breakdown: parseScoreBreakdown(entry.score_breakdown),
    };

    try {
      next = await fetchBallDontLieStatsForEntry(entry);
    } catch {
      continue;
    }

    const existingBreakdown = parseScoreBreakdown(entry.score_breakdown);
    const breakdownChanged = JSON.stringify(existingBreakdown) !== JSON.stringify(next.breakdown);
    const statusChanged = next.status !== entry.status;
    const pointsChanged = Math.abs(next.totalPoints - Number(entry.points ?? 0)) >= 0.01;

    if (!statusChanged && !pointsChanged && !breakdownChanged) {
      continue;
    }

    const payload: Record<string, unknown> = {
      status: next.status,
      points: next.totalPoints,
      score_breakdown: next.breakdown,
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
      rewardKeys.add(`${entry.venue_id}::${entry.game_id}`);
    }
  }

  let rewardedGames = 0;
  for (const key of rewardKeys) {
    const [venueId, gameId] = key.split("::");
    if (!venueId || !gameId) {
      continue;
    }
    await awardFantasyWinners({ venueId, gameId });
    rewardedGames += 1;
  }

  return {
    scanned: entries.length,
    updated,
    finalized,
    rewardedGames,
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
    .select("id, user_id, status, reward_points, reward_claimed_at")
    .eq("id", entryId)
    .eq("user_id", userId)
    .maybeSingle<{
      id: string;
      user_id: string;
      status: FantasyEntryStatus;
      reward_points: number;
      reward_claimed_at: string | null;
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

  const pointsAwarded = Math.max(0, Number(entry.reward_points ?? 0));
  if (pointsAwarded <= 0) {
    throw new Error("This entry does not have a reward to claim.");
  }

  const nowIso = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("fantasy_entries")
    .update({ reward_claimed_at: nowIso })
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

  await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    type: "success",
    message: `Fantasy reward claimed: +${pointsAwarded} points.`,
  });

  return { claimed: true, pointsAwarded };
}
