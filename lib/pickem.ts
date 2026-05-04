import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type PickEmSportSlug = "nba" | "mlb" | "nhl" | "soccer" | "nfl";
type PickEmPickStatus = "pending" | "won" | "lost" | "push" | "canceled";
type PickEmGameStatus = "scheduled" | "live" | "final";

type PickEmSportOption = {
  slug: PickEmSportSlug;
  label: string;
  subtitle: string;
  isInSeason: boolean;
  isClickable: boolean;
  sportKeys: string[];
};

export type PickEmSport = Omit<PickEmSportOption, "sportKeys">;

export type PickEmGame = {
  id: string;
  sportSlug: PickEmSportSlug;
  sportKey: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  isLocked: boolean;
  status: PickEmGameStatus;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeam: string | null;
  userPickId?: string;
  userPickTeam?: string;
  userPickStatus?: PickEmPickStatus;
  userPickRewardPoints?: number;
  userPickRewardClaimedAt?: string | null;
};

export type PickEmPick = {
  id: string;
  userId: string;
  venueId: string;
  sportSlug: PickEmSportSlug;
  sportKey: string;
  league: string;
  gameId: string;
  gameLabel: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  selectedTeam: string;
  selectedSide: "home" | "away";
  status: PickEmPickStatus;
  homeScore: number | null;
  awayScore: number | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  rewardPoints: number;
  rewardClaimedAt: string | null;
};

type PickEmPickRow = {
  id: string;
  user_id: string;
  venue_id: string;
  sport_slug: PickEmSportSlug;
  sport_key: string;
  league: string;
  game_id: string;
  game_label: string;
  home_team: string;
  away_team: string;
  starts_at: string;
  selected_team: string;
  selected_side: "home" | "away";
  status: PickEmPickStatus;
  home_score: number | null;
  away_score: number | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  reward_points: number;
  reward_claimed_at: string | null;
};

type OddsCatalogItem = {
  key?: string;
  title?: string;
  active?: boolean;
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
  sport_title?: string;
  commence_time?: string;
  completed?: boolean;
  home_team?: string;
  away_team?: string;
  scores?: Array<{
    name?: string;
    score?: number | string | null;
  }>;
};

type NormalizedOddsEvent = {
  id: string;
  oddsEventId: string;
  sportKey: string;
  league: string;
  startsAt: string;
  homeTeam: string;
  awayTeam: string;
};

const ODDS_API_BASE_URL = process.env.ODDS_API_BASE_URL ?? "https://api.the-odds-api.com/v4";
const ODDS_API_KEY = process.env.ODDS_API_KEY?.trim() ?? "";
const ODDS_SCORES_DAYS_FROM = Math.max(1, Math.min(3, Number.parseInt(process.env.ODDS_API_SCORES_DAYS ?? "3", 10) || 3));
const PICKEM_LOCK_GRACE_MS = 0;
const PICKEM_DAILY_PICK_LIMIT = 10;
const SPORTS_CATALOG_CACHE_MS = 5 * 60 * 1000;
const PICKEM_TABLES_MISSING_ERROR =
  "Pick 'Em tables are not installed in this Supabase project yet. Run migration supabase/migrations/20260427113000_add_pickem_tables.sql.";
const PICKEM_REWARD_POINTS = 10;
const PICKEM_PICK_SELECT =
  "id, user_id, venue_id, sport_slug, sport_key, league, game_id, game_label, home_team, away_team, starts_at, selected_team, selected_side, status, home_score, away_score, created_at, updated_at, resolved_at, reward_points, reward_claimed_at";

const DEFAULT_SOCCER_KEYS = [
  "soccer_usa_mls",
  "soccer_epl",
  "soccer_spain_la_liga",
  "soccer_italy_serie_a",
  "soccer_germany_bundesliga",
  "soccer_uefa_champs_league",
];

const PICKEM_SPORTS: PickEmSportOption[] = [
  {
    slug: "nba",
    label: "NBA",
    subtitle: "National Basketball Association",
    isInSeason: true,
    isClickable: true,
    sportKeys: ["basketball_nba"],
  },
  {
    slug: "mlb",
    label: "MLB",
    subtitle: "Major League Baseball",
    isInSeason: true,
    isClickable: true,
    sportKeys: ["baseball_mlb"],
  },
  {
    slug: "nhl",
    label: "NHL",
    subtitle: "National Hockey League",
    isInSeason: false,
    isClickable: false,
    sportKeys: ["icehockey_nhl"],
  },
  {
    slug: "soccer",
    label: "Soccer",
    subtitle: "Top Domestic & International Leagues",
    isInSeason: true,
    isClickable: true,
    sportKeys: DEFAULT_SOCCER_KEYS,
  },
  {
    slug: "nfl",
    label: "NFL",
    subtitle: "National Football League",
    isInSeason: true,
    isClickable: true,
    sportKeys: ["americanfootball_nfl"],
  },
];

const SPORT_BY_SLUG = new Map(PICKEM_SPORTS.map((item) => [item.slug, item]));

let sportsCatalogCache: { expiresAt: number; byKey: Map<string, string> } | null = null;
let sportsCatalogInFlight: Promise<Map<string, string>> | null = null;

function isMissingPickEmTablesError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) {
    return false;
  }

  const message = String(error.message ?? "").toLowerCase();
  const referencesPickEmTables =
    message.includes("pickem_picks") ||
    message.includes("pick_em_picks") ||
    message.includes("pick em");

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (referencesPickEmTables && (message.includes("relation") || message.includes("schema cache")))
  );
}

function normalizeTeamKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function buildPickEmGameId(params: {
  oddsEventId: string;
  startsAt: string;
  homeTeam: string;
  awayTeam: string;
}): string {
  const home = normalizeTeamKey(params.homeTeam);
  const away = normalizeTeamKey(params.awayTeam);
  return `${params.oddsEventId}__${params.startsAt}__${home}__${away}`;
}

function normalizeLeagueLabel(value: string): string {
  const cleaned = value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "Unknown League";
  }

  return cleaned
    .split(" ")
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === "nba") return "NBA";
      if (lower === "mlb") return "MLB";
      if (lower === "nfl") return "NFL";
      if (lower === "nhl") return "NHL";
      if (lower === "usa") return "USA";
      if (lower === "uefa") return "UEFA";
      if (lower === "epl") return "EPL";
      if (lower.length <= 3 && lower === lower.toLowerCase()) {
        return lower.toUpperCase();
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function parseDateString(date: string | undefined): { year: number; month: number; day: number } | null {
  const raw = String(date ?? "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
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

function buildUtcRangeForLocalDay(date: string | undefined, tzOffsetMinutes: number): {
  date: string;
  fromIso: string;
  toIso: string;
  fromMs: number;
  toMs: number;
} {
  const fallbackDate = getTodayDateInOffset(tzOffsetMinutes);
  const parsed = parseDateString(date) ?? parseDateString(fallbackDate)!;

  const utcStartMs = Date.UTC(parsed.year, parsed.month - 1, parsed.day, 0, 0, 0, 0) + tzOffsetMinutes * 60_000;
  const utcEndMs = utcStartMs + 24 * 60 * 60 * 1000 - 1;

  const dateKey = `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`;

  return {
    date: dateKey,
    fromIso: new Date(utcStartMs).toISOString(),
    toIso: new Date(utcEndMs).toISOString(),
    fromMs: utcStartMs,
    toMs: utcEndMs,
  };
}

function toLocalDateKey(iso: string, tzOffsetMinutes: number): string {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) {
    return "";
  }
  const localMs = ms - tzOffsetMinutes * 60_000;
  const d = new Date(localMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
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

function parseTimezoneOffset(input: number | string | undefined): number {
  const parsed = Number.parseInt(String(input ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return new Date().getTimezoneOffset();
  }
  return Math.max(-14 * 60, Math.min(14 * 60, parsed));
}

function mapPickRow(row: PickEmPickRow): PickEmPick {
  return {
    id: row.id,
    userId: row.user_id,
    venueId: row.venue_id,
    sportSlug: row.sport_slug,
    sportKey: row.sport_key,
    league: row.league,
    gameId: row.game_id,
    gameLabel: row.game_label,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    startsAt: row.starts_at,
    selectedTeam: row.selected_team,
    selectedSide: row.selected_side,
    status: row.status,
    homeScore: row.home_score,
    awayScore: row.away_score,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    rewardPoints: Number(row.reward_points ?? PICKEM_REWARD_POINTS),
    rewardClaimedAt: row.reward_claimed_at,
  };
}

async function fetchOddsJson(path: string, query: URLSearchParams, revalidateSeconds = 15): Promise<unknown> {
  const response = await fetch(`${ODDS_API_BASE_URL}${path}?${query.toString()}`, {
    method: "GET",
    next: { revalidate: revalidateSeconds },
  });

  if (!response.ok) {
    throw new Error(`The Odds API request failed with status ${response.status}.`);
  }

  return response.json();
}

async function getLeagueTitlesBySportKey(): Promise<Map<string, string>> {
  if (!ODDS_API_KEY) {
    return new Map();
  }

  const now = Date.now();
  if (sportsCatalogCache && now < sportsCatalogCache.expiresAt) {
    return sportsCatalogCache.byKey;
  }

  if (sportsCatalogInFlight) {
    return sportsCatalogInFlight;
  }

  sportsCatalogInFlight = (async () => {
    const query = new URLSearchParams({ apiKey: ODDS_API_KEY });
    const payload = await fetchOddsJson("/sports", query, 120);
    const byKey = new Map<string, string>();

    if (Array.isArray(payload)) {
      for (const item of payload as OddsCatalogItem[]) {
        const key = String(item.key ?? "").trim();
        if (!key) {
          continue;
        }
        const title = String(item.title ?? "").trim();
        byKey.set(key, title ? normalizeLeagueLabel(title) : normalizeLeagueLabel(key));
      }
    }

    sportsCatalogCache = {
      byKey,
      expiresAt: Date.now() + SPORTS_CATALOG_CACHE_MS,
    };

    return byKey;
  })()
    .catch(() => new Map<string, string>())
    .finally(() => {
      sportsCatalogInFlight = null;
    });

  return sportsCatalogInFlight;
}

async function getSportKeysForSlug(sportSlug: PickEmSportSlug): Promise<string[]> {
  const sport = SPORT_BY_SLUG.get(sportSlug);
  if (!sport) {
    return [];
  }

  if (!sport.isClickable) {
    return [];
  }

  if (sportSlug !== "soccer") {
    return sport.sportKeys;
  }

  if (!ODDS_API_KEY) {
    return sport.sportKeys;
  }

  try {
    const leagueTitles = await getLeagueTitlesBySportKey();
    const dynamicKeys = [...leagueTitles.keys()].filter((key) => key.startsWith("soccer_"));
    const preferred = dynamicKeys.filter(
      (key) =>
        key.includes("epl") ||
        key.includes("la_liga") ||
        key.includes("serie_a") ||
        key.includes("bundesliga") ||
        key.includes("mls") ||
        key.includes("uefa_champs")
    );

    if (preferred.length > 0) {
      return preferred;
    }

    return dynamicKeys.length > 0 ? dynamicKeys.slice(0, 12) : sport.sportKeys;
  } catch {
    return sport.sportKeys;
  }
}

async function fetchOddsEventsForSportKey(
  sportKey: string,
  fromIso: string,
  toIso: string,
  leagueLabel: string
): Promise<NormalizedOddsEvent[]> {
  if (!ODDS_API_KEY) {
    return [];
  }

  const query = new URLSearchParams({
    apiKey: ODDS_API_KEY,
    regions: "us",
    markets: "h2h",
    oddsFormat: "american",
    commenceTimeFrom: fromIso,
    commenceTimeTo: toIso,
  });

  const payload = await fetchOddsJson(`/sports/${sportKey}/odds`, query, 10);
  if (!Array.isArray(payload)) {
    return [];
  }

  const events: NormalizedOddsEvent[] = [];
  for (const event of payload as OddsEvent[]) {
    const id = String(event.id ?? "").trim();
    const homeTeam = String(event.home_team ?? "").trim();
    const awayTeam = String(event.away_team ?? "").trim();
    const startsAt = String(event.commence_time ?? "").trim();

    if (!id || !homeTeam || !awayTeam || !startsAt) {
      continue;
    }

    const startsTs = new Date(startsAt).getTime();
    if (!Number.isFinite(startsTs)) {
      continue;
    }

    events.push({
      id: buildPickEmGameId({
        oddsEventId: id,
        startsAt: new Date(startsTs).toISOString(),
        homeTeam,
        awayTeam,
      }),
      oddsEventId: id,
      sportKey,
      league: leagueLabel,
      startsAt: new Date(startsTs).toISOString(),
      homeTeam,
      awayTeam,
    });
  }

  return events;
}

async function fetchScoresForSportKey(sportKey: string): Promise<Map<string, OddsScoreEvent>> {
  if (!ODDS_API_KEY) {
    return new Map();
  }

  const query = new URLSearchParams({
    apiKey: ODDS_API_KEY,
    daysFrom: String(ODDS_SCORES_DAYS_FROM),
    dateFormat: "iso",
  });

  const payload = await fetchOddsJson(`/sports/${sportKey}/scores`, query, 10);
  if (!Array.isArray(payload)) {
    return new Map();
  }

  const byId = new Map<string, OddsScoreEvent>();
  for (const event of payload as OddsScoreEvent[]) {
    const id = String(event.id ?? "").trim();
    if (!id) {
      continue;
    }
    byId.set(id, event);
  }

  return byId;
}

function getTeamScore(scores: OddsScoreEvent["scores"], teamName: string): number | null {
  if (!Array.isArray(scores)) {
    return null;
  }

  const targetKey = normalizeTeamKey(teamName);

  for (const row of scores) {
    const rowName = String(row?.name ?? "").trim();
    if (!rowName) {
      continue;
    }
    if (normalizeTeamKey(rowName) !== targetKey) {
      continue;
    }
    return parseScore(row?.score ?? null);
  }

  return null;
}

function resolveWinner(homeTeam: string, awayTeam: string, homeScore: number | null, awayScore: number | null): string | null {
  if (homeScore === null || awayScore === null) {
    return null;
  }

  if (homeScore > awayScore) {
    return homeTeam;
  }
  if (awayScore > homeScore) {
    return awayTeam;
  }
  return "push";
}

async function insertPickEmSettlementNotification(params: {
  userId: string;
  status: PickEmPickStatus;
  gameLabel: string;
  selectedTeam: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
}): Promise<void> {
  if (!supabaseAdmin) {
    return;
  }

  const statusLabel =
    params.status === "won"
      ? "success"
      : params.status === "lost"
      ? "warning"
      : params.status === "push"
      ? "info"
      : "warning";

  const scoreSummary =
    params.homeScore !== null && params.awayScore !== null
      ? `${params.homeTeam} ${params.homeScore} - ${params.awayScore} ${params.awayTeam}.`
      : "Final score unavailable.";

  const message =
    params.status === "won"
      ? `Pick 'Em result: You won "${params.gameLabel}" with ${params.selectedTeam}. ${scoreSummary}`
      : params.status === "lost"
      ? `Pick 'Em result: You lost "${params.gameLabel}" with ${params.selectedTeam}. ${scoreSummary}`
      : params.status === "push"
      ? `Pick 'Em result: "${params.gameLabel}" ended in a push. ${scoreSummary}`
      : `Pick 'Em result: "${params.gameLabel}" was canceled.`;

  try {
    await supabaseAdmin.from("notifications").insert({
      user_id: params.userId,
      type: statusLabel,
      message,
    });
  } catch {
    // Never block grading if notification write fails.
  }
}

function isPickLocked(startsAt: string): boolean {
  const startsAtMs = new Date(startsAt).getTime();
  if (!Number.isFinite(startsAtMs)) {
    return true;
  }
  return Date.now() >= startsAtMs + PICKEM_LOCK_GRACE_MS;
}

async function listUserPicksByGameId(
  userId: string,
  sportSlug: PickEmSportSlug,
  fromIso: string,
  toIso: string
): Promise<Map<string, PickEmPickRow>> {
  if (!supabaseAdmin || !userId) {
    return new Map();
  }

  const { data, error } = await supabaseAdmin
    .from("pickem_picks")
    .select(PICKEM_PICK_SELECT)
    .eq("user_id", userId)
    .eq("sport_slug", sportSlug)
    .gte("starts_at", fromIso)
    .lte("starts_at", toIso)
    .order("starts_at", { ascending: true });

  if (error) {
    if (isMissingPickEmTablesError(error)) {
      throw new Error(PICKEM_TABLES_MISSING_ERROR);
    }
    throw new Error(error.message ?? "Failed to load Pick 'Em picks.");
  }

  const byGameId = new Map<string, PickEmPickRow>();
  for (const row of (data ?? []) as PickEmPickRow[]) {
    if (row.game_id) {
      byGameId.set(row.game_id, row);
    }
  }
  return byGameId;
}

function getSportOrThrow(sportSlug: string): PickEmSportOption {
  const normalized = String(sportSlug ?? "").trim().toLowerCase() as PickEmSportSlug;
  const sport = SPORT_BY_SLUG.get(normalized);
  if (!sport) {
    throw new Error("Unsupported sport for Pick 'Em.");
  }
  return sport;
}

export function listPickEmSports(): PickEmSport[] {
  return PICKEM_SPORTS.map(({ sportKeys, ...rest }) => rest);
}

export async function listPickEmGames(params: {
  sportSlug: string;
  date?: string;
  weekStartDate?: string;
  tzOffsetMinutes?: number | string;
  userId?: string;
}): Promise<{ sport: PickEmSport; date: string; games: PickEmGame[]; weekOptions?: Array<{ label: string; value: string }>; selectedWeekStartDate?: string }> {
  const sport = getSportOrThrow(params.sportSlug);
  const tzOffsetMinutes = parseTimezoneOffset(params.tzOffsetMinutes);
  const dayRange = buildUtcRangeForLocalDay(params.date, tzOffsetMinutes);
  let date = dayRange.date;
  let fromIso = dayRange.fromIso;
  let toIso = dayRange.toIso;
  let weekOptions: Array<{ label: string; value: string }> = [];
  let selectedWeekStartDate: string | undefined;

  const sportKeys = await getSportKeysForSlug(sport.slug);
  if (sportKeys.length === 0 || !ODDS_API_KEY) {
    return {
      sport: {
        slug: sport.slug,
        label: sport.label,
        subtitle: sport.subtitle,
        isInSeason: sport.isInSeason,
        isClickable: sport.isClickable,
      },
      date,
      games: [],
      weekOptions,
      selectedWeekStartDate,
    };
  }

  const leagueTitles = await getLeagueTitlesBySportKey();

  if (sport.slug === "nfl") {
    const nflKey = sportKeys[0];
    if (nflKey) {
      const now = Date.now();
      const horizonToIso = new Date(now + 140 * 24 * 60 * 60 * 1000).toISOString();
      const horizonFromIso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      const nflEvents = await fetchOddsEventsForSportKey(
        nflKey,
        horizonFromIso,
        horizonToIso,
        leagueTitles.get(nflKey) ?? normalizeLeagueLabel(nflKey)
      );

      const weekStartMsSet = new Set<number>();
      for (const event of nflEvents) {
        const startsAtMs = Date.parse(event.startsAt);
        if (!Number.isFinite(startsAtMs)) continue;
        const dateUtc = new Date(startsAtMs);
        const day = dateUtc.getUTCDay();
        const daysSinceThursday = (day - 4 + 7) % 7;
        const weekStartMs = Date.UTC(
          dateUtc.getUTCFullYear(),
          dateUtc.getUTCMonth(),
          dateUtc.getUTCDate() - daysSinceThursday,
          0,
          0,
          0,
          0
        );
        weekStartMsSet.add(weekStartMs);
      }

      const sortedWeekStarts = [...weekStartMsSet.values()].sort((a, b) => a - b);
      const futureWeekStarts = sortedWeekStarts.filter((ms) => ms > now);
      const fallbackWeekMs = sortedWeekStarts.find((ms) => ms > now) ?? sortedWeekStarts[sortedWeekStarts.length - 1] ?? null;
      const requestedWeekMs = parseDateString(params.weekStartDate)
        ? Date.parse(`${params.weekStartDate}T00:00:00.000Z`)
        : Number.NaN;
      const chosenWeekMs =
        Number.isFinite(requestedWeekMs) && sortedWeekStarts.some((ms) => ms === requestedWeekMs)
          ? requestedWeekMs
          : fallbackWeekMs;

      weekOptions = futureWeekStarts.map((ms, index) => {
        const start = new Date(ms);
        const end = new Date(ms + 6 * 24 * 60 * 60 * 1000);
        const label = `Week ${index + 1} (${start.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })} - ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })})`;
        const value = start.toISOString().slice(0, 10);
        return { label, value };
      });

      if (chosenWeekMs !== null) {
        const startIso = new Date(chosenWeekMs).toISOString();
        const endIso = new Date(chosenWeekMs + 7 * 24 * 60 * 60 * 1000 - 1).toISOString();
        fromIso = startIso;
        toIso = endIso;
        date = startIso.slice(0, 10);
        selectedWeekStartDate = startIso.slice(0, 10);
      }
    }
  }

  const [eventsSettled, scoresSettled, picksByGameId] = await Promise.all([
    Promise.allSettled(
      sportKeys.map((sportKey) =>
        fetchOddsEventsForSportKey(sportKey, fromIso, toIso, leagueTitles.get(sportKey) ?? normalizeLeagueLabel(sportKey))
      )
    ),
    Promise.allSettled(sportKeys.map((sportKey) => fetchScoresForSportKey(sportKey))),
    params.userId ? listUserPicksByGameId(params.userId.trim(), sport.slug, fromIso, toIso) : Promise.resolve(new Map()),
  ]);

  const scoresBySportKey = new Map<string, Map<string, OddsScoreEvent>>();
  for (let i = 0; i < scoresSettled.length; i += 1) {
    const settled = scoresSettled[i];
    const sportKey = sportKeys[i];
    if (settled.status === "fulfilled") {
      scoresBySportKey.set(sportKey, settled.value);
    }
  }

  const eventsById = new Map<string, NormalizedOddsEvent>();
  for (const settled of eventsSettled) {
    if (settled.status !== "fulfilled") {
      continue;
    }
    for (const event of settled.value) {
      eventsById.set(event.id, event);
    }
  }

  // Include games from scoreboards even when odds no longer returns them (in-progress/final games).
  for (const sportKey of sportKeys) {
    const scoreMap = scoresBySportKey.get(sportKey);
    if (!scoreMap) {
      continue;
    }

    for (const scoreEvent of scoreMap.values()) {
      const id = String(scoreEvent.id ?? "").trim();
      const startsAtRaw = String(scoreEvent.commence_time ?? "").trim();
      const homeTeam = String(scoreEvent.home_team ?? "").trim();
      const awayTeam = String(scoreEvent.away_team ?? "").trim();
      if (!id || !startsAtRaw || !homeTeam || !awayTeam) {
        continue;
      }

      const startsTs = new Date(startsAtRaw).getTime();
      if (!Number.isFinite(startsTs)) {
        continue;
      }

      const localDateKey = toLocalDateKey(new Date(startsTs).toISOString(), tzOffsetMinutes);
      if (localDateKey !== date) {
        continue;
      }

      const startsAtIso = new Date(startsTs).toISOString();
      const gameId = buildPickEmGameId({
        oddsEventId: id,
        startsAt: startsAtIso,
        homeTeam,
        awayTeam,
      });
      if (eventsById.has(gameId)) {
        continue;
      }
      eventsById.set(gameId, {
        id: gameId,
        oddsEventId: id,
        sportKey,
        league: leagueTitles.get(sportKey) ?? normalizeLeagueLabel(scoreEvent.sport_title ?? sportKey),
        startsAt: startsAtIso,
        homeTeam,
        awayTeam,
      });
    }
  }

  const scoreByGameId = new Map<string, OddsScoreEvent>();
  for (const event of eventsById.values()) {
    const scoreMap = scoresBySportKey.get(event.sportKey);
    if (!scoreMap) {
      continue;
    }
    const scoreEvent = scoreMap.get(event.oddsEventId);
    if (scoreEvent) {
      scoreByGameId.set(event.id, scoreEvent);
    }
  }

  const games: PickEmGame[] = [];
  for (const event of eventsById.values()) {
    const scoreEvent = scoreByGameId.get(event.id);

    const homeScore = getTeamScore(scoreEvent?.scores, event.homeTeam);
    const awayScore = getTeamScore(scoreEvent?.scores, event.awayTeam);
    const winner = resolveWinner(event.homeTeam, event.awayTeam, homeScore, awayScore);

    let status: PickEmGameStatus = "scheduled";
    if (scoreEvent?.completed) {
      status = "final";
    } else if (homeScore !== null || awayScore !== null || isPickLocked(event.startsAt)) {
      status = "live";
    }

    const pick = picksByGameId.get(event.id) ?? picksByGameId.get(event.oddsEventId);

    games.push({
      id: event.id,
      sportSlug: sport.slug,
      sportKey: event.sportKey,
      league: event.league,
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      startsAt: event.startsAt,
      isLocked: isPickLocked(event.startsAt),
      status,
      homeScore,
      awayScore,
      winnerTeam: winner === "push" ? null : winner,
      userPickId: pick?.id,
      userPickTeam: pick?.selected_team,
      userPickStatus: pick?.status,
      userPickRewardPoints: Number(pick?.reward_points ?? PICKEM_REWARD_POINTS),
      userPickRewardClaimedAt: pick?.reward_claimed_at ?? null,
    });
  }

  games.sort((a, b) => {
    const leagueCompare = a.league.localeCompare(b.league, undefined, { sensitivity: "base" });
    if (leagueCompare !== 0) {
      return leagueCompare;
    }
    return +new Date(a.startsAt) - +new Date(b.startsAt);
  });

  return {
    sport: {
      slug: sport.slug,
      label: sport.label,
      subtitle: sport.subtitle,
      isInSeason: sport.isInSeason,
      isClickable: sport.isClickable,
    },
    date,
    games,
    weekOptions,
    selectedWeekStartDate,
  };
}

export async function submitPickEmPick(params: {
  userId: string;
  venueId: string;
  sportSlug: string;
  gameId: string;
  pickTeam: string;
  date?: string;
  weekStartDate?: string;
  tzOffsetMinutes?: number | string;
}): Promise<PickEmPick> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }

  const userId = String(params.userId ?? "").trim();
  const venueId = String(params.venueId ?? "").trim();
  const gameId = String(params.gameId ?? "").trim();
  const pickTeam = String(params.pickTeam ?? "").trim();
  const sportSlug = String(params.sportSlug ?? "").trim();

  if (!userId || !venueId || !sportSlug || !gameId || !pickTeam) {
    throw new Error("userId, venueId, sportSlug, gameId, and pickTeam are required.");
  }

  const requestedSport = getSportOrThrow(sportSlug);
  if (!requestedSport.isClickable) {
    throw new Error(`${requestedSport.label} Pick 'Em is coming soon.`);
  }

  const tzOffsetMinutes = parseTimezoneOffset(params.tzOffsetMinutes);
  const gameList = await listPickEmGames({
    sportSlug,
    date: params.date,
    weekStartDate: params.weekStartDate,
    tzOffsetMinutes,
    userId,
  });

  const game = gameList.games.find((entry) => entry.id === gameId);
  if (!game) {
    throw new Error("Game not found for selected date/sport.");
  }

  if (game.isLocked) {
    throw new Error("Picks are locked for this game because it has already started.");
  }

  if (pickTeam !== game.homeTeam && pickTeam !== game.awayTeam) {
    throw new Error("pickTeam must match one of the teams in this game.");
  }

  const selectedSide: "home" | "away" = pickTeam === game.homeTeam ? "home" : "away";
  const gameLabel = `${game.awayTeam} vs ${game.homeTeam}`;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("pickem_picks")
    .select(PICKEM_PICK_SELECT)
    .eq("user_id", userId)
    .eq("game_id", gameId)
    .maybeSingle<PickEmPickRow>();

  if (existingError) {
    if (isMissingPickEmTablesError(existingError)) {
      throw new Error(PICKEM_TABLES_MISSING_ERROR);
    }
    throw new Error(existingError.message ?? "Failed to verify existing Pick 'Em pick.");
  }

  if (existing) {
    const startsAtMs = new Date(existing.starts_at).getTime();
    if (!Number.isFinite(startsAtMs) || Date.now() >= startsAtMs + PICKEM_LOCK_GRACE_MS) {
      throw new Error("This pick is locked because the game has started.");
    }

    if (existing.status !== "pending") {
      throw new Error("This pick can no longer be modified.");
    }

    const { data, error } = await supabaseAdmin
      .from("pickem_picks")
      .update({
        selected_team: pickTeam,
        selected_side: selectedSide,
        game_label: gameLabel,
        league: game.league,
        sport_key: game.sportKey,
      })
      .eq("id", existing.id)
      .select(PICKEM_PICK_SELECT)
      .single<PickEmPickRow>();

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to update Pick 'Em pick.");
    }

    return mapPickRow(data);
  }

  const localGameDate = toLocalDateKey(game.startsAt, tzOffsetMinutes);
  const dailyRange = buildUtcRangeForLocalDay(localGameDate || undefined, tzOffsetMinutes);
  const { count: existingCount, error: countError } = await supabaseAdmin
    .from("pickem_picks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("starts_at", dailyRange.fromIso)
    .lte("starts_at", dailyRange.toIso);

  if (countError) {
    if (isMissingPickEmTablesError(countError)) {
      throw new Error(PICKEM_TABLES_MISSING_ERROR);
    }
    throw new Error(countError.message ?? "Failed to validate daily Pick 'Em limit.");
  }

  if ((existingCount ?? 0) >= PICKEM_DAILY_PICK_LIMIT) {
    throw new Error(`Daily pick limit reached (${PICKEM_DAILY_PICK_LIMIT}).`);
  }

  const { data, error } = await supabaseAdmin
    .from("pickem_picks")
    .insert({
      user_id: userId,
      venue_id: venueId,
      sport_slug: game.sportSlug,
      sport_key: game.sportKey,
      league: game.league,
      game_id: game.id,
      game_label: gameLabel,
      home_team: game.homeTeam,
      away_team: game.awayTeam,
      starts_at: game.startsAt,
      selected_team: pickTeam,
      selected_side: selectedSide,
      status: "pending",
      reward_points: PICKEM_REWARD_POINTS,
    })
    .select(PICKEM_PICK_SELECT)
    .single<PickEmPickRow>();

  if (error || !data) {
    if (isMissingPickEmTablesError(error)) {
      throw new Error(PICKEM_TABLES_MISSING_ERROR);
    }
    if (error?.code === "23505") {
      throw new Error("You already made a pick for this game.");
    }
    throw new Error(error?.message ?? "Failed to save Pick 'Em pick.");
  }

  return mapPickRow(data);
}

export async function clearPickEmPick(params: {
  userId: string;
  gameId: string;
}): Promise<{ cleared: boolean }> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }

  const userId = String(params.userId ?? "").trim();
  const gameId = String(params.gameId ?? "").trim();
  if (!userId || !gameId) {
    throw new Error("userId and gameId are required.");
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("pickem_picks")
    .select("id, starts_at, status")
    .eq("user_id", userId)
    .eq("game_id", gameId)
    .maybeSingle<{ id: string; starts_at: string; status: PickEmPickStatus }>();

  if (existingError) {
    if (isMissingPickEmTablesError(existingError)) {
      throw new Error(PICKEM_TABLES_MISSING_ERROR);
    }
    throw new Error(existingError.message ?? "Failed to verify existing Pick 'Em pick.");
  }

  if (!existing) {
    return { cleared: false };
  }

  const startsAtMs = new Date(existing.starts_at).getTime();
  if (!Number.isFinite(startsAtMs) || Date.now() >= startsAtMs + PICKEM_LOCK_GRACE_MS) {
    throw new Error("This pick is locked because the game has started.");
  }

  if (existing.status !== "pending") {
    throw new Error("This pick can no longer be modified.");
  }

  const { error: deleteError } = await supabaseAdmin.from("pickem_picks").delete().eq("id", existing.id);
  if (deleteError) {
    if (isMissingPickEmTablesError(deleteError)) {
      throw new Error(PICKEM_TABLES_MISSING_ERROR);
    }
    throw new Error(deleteError.message ?? "Failed to clear Pick 'Em pick.");
  }

  return { cleared: true };
}

export async function listUserPickEmPicks(params: {
  userId: string;
  sportSlug?: string;
  limit?: number;
  includeSettled?: boolean;
}): Promise<PickEmPick[]> {
  if (!supabaseAdmin) {
    return [];
  }

  const userId = String(params.userId ?? "").trim();
  if (!userId) {
    return [];
  }

  const includeSettled = Boolean(params.includeSettled ?? true);
  const limit = Math.max(1, Math.min(300, Number(params.limit ?? 100)));

  let query = supabaseAdmin
    .from("pickem_picks")
    .select(PICKEM_PICK_SELECT)
    .eq("user_id", userId)
    .order("starts_at", { ascending: false })
    .limit(limit);

  const sportSlug = String(params.sportSlug ?? "").trim();
  if (sportSlug) {
    query = query.eq("sport_slug", sportSlug);
  }
  if (!includeSettled) {
    query = query.eq("status", "pending");
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingPickEmTablesError(error)) {
      throw new Error(PICKEM_TABLES_MISSING_ERROR);
    }
    throw new Error(error.message ?? "Failed to load Pick 'Em history.");
  }

  return (data ?? []).map((row) => mapPickRow(row as PickEmPickRow));
}

export async function settlePendingPickEmPicks(params: { userId?: string } = {}): Promise<{
  pendingScanned: number;
  settledCount: number;
  won: number;
  lost: number;
  push: number;
}> {
  if (!supabaseAdmin || !ODDS_API_KEY) {
    return {
      pendingScanned: 0,
      settledCount: 0,
      won: 0,
      lost: 0,
      push: 0,
    };
  }

  const nowIso = new Date().toISOString();

  let query = supabaseAdmin
    .from("pickem_picks")
    .select(PICKEM_PICK_SELECT)
    .eq("status", "pending")
    .lte("starts_at", nowIso)
    .order("starts_at", { ascending: true })
    .limit(500);

  const userId = String(params.userId ?? "").trim();
  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingPickEmTablesError(error)) {
      throw new Error(PICKEM_TABLES_MISSING_ERROR);
    }
    throw new Error(error.message ?? "Failed to load pending Pick 'Em picks.");
  }

  const pending = (data ?? []) as PickEmPickRow[];
  if (pending.length === 0) {
    return {
      pendingScanned: 0,
      settledCount: 0,
      won: 0,
      lost: 0,
      push: 0,
    };
  }

  const uniqueSportKeys = Array.from(new Set(pending.map((row) => row.sport_key).filter(Boolean)));
  const scoresBySportKey = new Map<string, Map<string, OddsScoreEvent>>();

  const scoresSettled = await Promise.allSettled(uniqueSportKeys.map((sportKey) => fetchScoresForSportKey(sportKey)));
  for (let i = 0; i < scoresSettled.length; i += 1) {
    const settled = scoresSettled[i];
    const sportKey = uniqueSportKeys[i];
    if (settled.status === "fulfilled") {
      scoresBySportKey.set(sportKey, settled.value);
    }
  }

  let settledCount = 0;
  let won = 0;
  let lost = 0;
  let push = 0;

  for (const row of pending) {
    const scoreMap = scoresBySportKey.get(row.sport_key);
    const scoreEvent = scoreMap?.get(row.game_id);
    if (!scoreEvent?.completed) {
      continue;
    }

    const homeScore = getTeamScore(scoreEvent.scores, row.home_team);
    const awayScore = getTeamScore(scoreEvent.scores, row.away_team);

    let status: PickEmPickStatus = "canceled";
    if (homeScore !== null && awayScore !== null) {
      const winner = resolveWinner(row.home_team, row.away_team, homeScore, awayScore);
      if (winner === "push") {
        status = "push";
        push += 1;
      } else if (winner === row.selected_team) {
        status = "won";
        won += 1;
      } else {
        status = "lost";
        lost += 1;
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from("pickem_picks")
      .update({
        status,
        home_score: homeScore,
        away_score: awayScore,
        resolved_at: new Date().toISOString(),
        reward_points: PICKEM_REWARD_POINTS,
      })
      .eq("id", row.id)
      .eq("status", "pending");

    if (updateError) {
      continue;
    }

    await insertPickEmSettlementNotification({
      userId: row.user_id,
      status,
      gameLabel: row.game_label,
      selectedTeam: row.selected_team,
      homeTeam: row.home_team,
      awayTeam: row.away_team,
      homeScore,
      awayScore,
    });

    settledCount += 1;
  }

  return {
    pendingScanned: pending.length,
    settledCount,
    won,
    lost,
    push,
  };
}

export async function claimPickEmReward(params: {
  userId: string;
  pickId: string;
}): Promise<{ claimed: boolean; pointsAwarded: number; status: PickEmPickStatus }> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }

  const userId = String(params.userId ?? "").trim();
  const pickId = String(params.pickId ?? "").trim();
  if (!userId || !pickId) {
    throw new Error("userId and pickId are required.");
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("pickem_picks")
    .update({ reward_claimed_at: nowIso })
    .eq("id", pickId)
    .eq("user_id", userId)
    .eq("status", "won")
    .is("reward_claimed_at", null)
    .select("id, status, reward_points")
    .maybeSingle<{ id: string; status: PickEmPickStatus; reward_points: number | null }>();

  if (error) {
    if (isMissingPickEmTablesError(error)) {
      throw new Error(PICKEM_TABLES_MISSING_ERROR);
    }
    throw new Error(error.message ?? "Failed to claim Pick 'Em reward.");
  }

  if (!data) {
    const { data: current, error: currentError } = await supabaseAdmin
      .from("pickem_picks")
      .select("status, reward_claimed_at, reward_points")
      .eq("id", pickId)
      .eq("user_id", userId)
      .maybeSingle<{ status: PickEmPickStatus; reward_claimed_at: string | null; reward_points: number | null }>();

    if (currentError) {
      throw new Error(currentError.message ?? "Failed to verify Pick 'Em reward status.");
    }
    if (!current) {
      throw new Error("Pick not found.");
    }
    if (current.status !== "won") {
      throw new Error("This pick is not eligible for rewards.");
    }

    return {
      claimed: false,
      pointsAwarded: Number(current.reward_points ?? PICKEM_REWARD_POINTS),
      status: current.status,
    };
  }

  const pointsAwarded = Number(data.reward_points ?? PICKEM_REWARD_POINTS);

  const { data: userRow, error: userError } = await supabaseAdmin
    .from("users")
    .select("points")
    .eq("id", userId)
    .maybeSingle<{ points: number | null }>();
  if (userError) {
    throw new Error(userError.message ?? "Failed to load user points.");
  }

  const nextPoints = Number(userRow?.points ?? 0) + pointsAwarded;
  const { error: updateUserError } = await supabaseAdmin.from("users").update({ points: nextPoints }).eq("id", userId);
  if (updateUserError) {
    throw new Error(updateUserError.message ?? "Failed to award Pick 'Em points.");
  }

  try {
    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      type: "success",
      message: `Pick 'Em reward claimed: +${pointsAwarded} points added to your total.`,
    });
  } catch {}

  return {
    claimed: true,
    pointsAwarded,
    status: data.status,
  };
}
