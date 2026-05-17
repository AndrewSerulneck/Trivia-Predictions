import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchBallDontLieList } from "@/lib/balldontlie";
import { applyChallengeCampaignPoints } from "@/lib/challengeCampaigns";

export type PickEmSportSlug = "nba" | "mlb" | "nhl" | "soccer" | "nfl" | "mma";
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
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  isLocked: boolean;
  status: PickEmGameStatus;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeam: string | null;
  periodLabel: string | null;
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
  homeTeamId: string | null;
  awayTeamId: string | null;
  selectedTeamId: string | null;
  winningTeamId: string | null;
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
  home_team_id: string | null;
  away_team_id: string | null;
  selected_team_id: string | null;
  winning_team_id: string | null;
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

export type PickEmPointsBankSummary = {
  localDate: string;
  totalPicks: number;
  settledPicks: number;
  pendingPicks: number;
  correctPicks: number;
  incorrectPicks: number;
  unclaimedCorrectPicks: number;
  pendingPoints: number;
  multiplierEligible: boolean;
  multiplierIfSettledNow: 1 | 2 | 3;
  collectedPointsToday: number;
};

type PickEmDailySnapshotRow = {
  user_id: string;
  venue_id: string;
  local_date: string;
  total_picks: number;
  settled_picks: number;
  pending_picks: number;
  correct_picks: number;
  incorrect_picks: number;
  unclaimed_correct_picks: number;
  pending_points: number;
  collected_points: number;
  multiplier_eligible: boolean;
  multiplier_if_settled_now: number;
  collected_at: string | null;
  updated_at: string;
};

type BallDontLieScoreEvent = {
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

type NormalizedBallDontLieEvent = {
  id: string;
  providerEventId: string;
  sportKey: string;
  league: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  startsAt: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  isCompleted: boolean;
  periodLabel: string | null;
};

type PickEmDebugProbe = {
  sportKey: string;
  path: string;
  url: string;
  statusCode: number;
  bodyPreview: string;
};

const BALLDONTLIE_API_BASE_URL = process.env.BALLDONTLIE_API_BASE_URL ?? "https://api.balldontlie.io";
const BALLDONTLIE_API_KEY = process.env.BALLDONTLIE_API_KEY?.trim() ?? "";

type BallDontLieGame = {
  id?: number | string;
  status?: string;
  datetime?: string;
  date?: string;
  commence_time?: string;
  start_time?: string;
  scheduled_at?: string;
  home_team_score?: number | string | null;
  visitor_team_score?: number | string | null;
  home_score?: number | string | null;
  away_score?: number | string | null;
  home_team?: { full_name?: string; name?: string; city?: string } | string;
  visitor_team?: { full_name?: string; name?: string; city?: string };
  home_team_id?: number | string;
  away_team_id?: number | string;
  name?: string;
  home_team_data?: { full_name?: string; name?: string; city?: string; runs?: number | null } | string;
  away_team_data?: { full_name?: string; name?: string; city?: string; runs?: number | null } | string;
  // Soccer-style schemas
  home_team_name?: string;
  away_team_name?: string;
  away_team?: { full_name?: string; name?: string; city?: string } | string;
  starts_at?: string;
  // Live game clock fields (NBA)
  period?: number | null;
  time?: string | null;
  time_in_period?: string | null;
};

const BDL_PATH_BY_SPORT_KEY: Record<string, { path: string; league: string; isSoccerMatch?: boolean; embeddedTeams?: boolean }> = {
  basketball_nba: { path: "/nba/v1/games", league: "NBA" },
  nba: { path: "/nba/v1/games", league: "NBA" },
  basketball_wnba: { path: "/wnba/v1/games", league: "WNBA" },
  wnba: { path: "/wnba/v1/games", league: "WNBA" },
  baseball_mlb: { path: "/mlb/v1/games", league: "MLB" },
  mlb: { path: "/mlb/v1/games", league: "MLB" },
  icehockey_nhl: { path: "/nhl/v1/games", league: "NHL" },
  nhl: { path: "/nhl/v1/games", league: "NHL" },
  americanfootball_nfl: { path: "/nfl/v1/games", league: "NFL" },
  nfl: { path: "/nfl/v1/games", league: "NFL" },
  mma_ufc: { path: "/mma/v1/fights", league: "UFC" },
  mma: { path: "/mma/v1/fights", league: "MMA" },
  soccer_usa_mls: { path: "/mls/v1/matches", league: "MLS", isSoccerMatch: true },
  soccer_epl: { path: "/epl/v2/matches", league: "EPL", isSoccerMatch: true },
  soccer_spain_la_liga: { path: "/laliga/v1/matches", league: "La Liga", isSoccerMatch: true },
  soccer_italy_serie_a: { path: "/seriea/v1/matches", league: "Serie A", isSoccerMatch: true },
  soccer_france_ligue_one: { path: "/ligue1/v1/matches", league: "Ligue 1", isSoccerMatch: true },
  soccer_germany_bundesliga: { path: "/bundesliga/v1/matches", league: "Bundesliga", isSoccerMatch: true },
  soccer_uefa_champs_league: { path: "/ucl/v1/matches", league: "UEFA Champions League", isSoccerMatch: true },
  soccer_fifa_world_cup: { path: "/fifa/worldcup/v1/matches", league: "FIFA World Cup", isSoccerMatch: true, embeddedTeams: true },
};

const PICKEM_LOCK_GRACE_MS = 0;
const PICKEM_DAILY_PICK_LIMIT = 10;
const PICKEM_TABLES_MISSING_ERROR =
  "Pick 'Em tables are not installed in this Supabase project yet. Run migration supabase/migrations/20260427113000_add_pickem_tables.sql.";
const PICKEM_REWARD_POINTS = 10;
const PICKEM_PICK_SELECT =
  "id, user_id, venue_id, sport_slug, sport_key, league, game_id, home_team_id, away_team_id, selected_team_id, winning_team_id, game_label, home_team, away_team, starts_at, selected_team, selected_side, status, home_score, away_score, created_at, updated_at, resolved_at, reward_points, reward_claimed_at";

const DEFAULT_SOCCER_KEYS = [
  "soccer_usa_mls",
  "soccer_epl",
  "soccer_spain_la_liga",
  "soccer_italy_serie_a",
  "soccer_france_ligue_one",
  "soccer_germany_bundesliga",
  "soccer_uefa_champs_league",
  "soccer_fifa_world_cup",
];

const PICKEM_SPORTS: PickEmSportOption[] = [
  {
    slug: "nba",
    label: "Basketball",
    subtitle: "NBA + WNBA",
    isInSeason: true,
    isClickable: true,
    sportKeys: ["basketball_nba", "basketball_wnba"],
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
    isInSeason: true,
    isClickable: true,
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
    isInSeason: false,
    isClickable: false,
    sportKeys: ["americanfootball_nfl"],
  },
  {
    slug: "mma",
    label: "MMA",
    subtitle: "UFC & major cards",
    isInSeason: true,
    isClickable: true,
    sportKeys: ["mma_ufc"],
  },
];

const SPORT_BY_SLUG = new Map(PICKEM_SPORTS.map((item) => [item.slug, item]));

function getLeagueLabelForSportKey(sportKey: string): string {
  const provider = BDL_PATH_BY_SPORT_KEY[sportKey];
  if (provider?.league) {
    return provider.league;
  }
  return normalizeLeagueLabel(sportKey);
}

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
  providerEventId: string;
  startsAt: string;
  homeTeam: string;
  awayTeam: string;
}): string {
  const home = normalizeTeamKey(params.homeTeam);
  const away = normalizeTeamKey(params.awayTeam);
  return `${params.providerEventId}__${params.startsAt}__${home}__${away}`;
}

function extractProviderEventIdFromGameId(gameId: string): string {
  const raw = String(gameId ?? "").trim();
  if (!raw) return "";
  const idx = raw.indexOf("__");
  return idx === -1 ? raw : raw.slice(0, idx);
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
      if (lower === "wnba") return "WNBA";
      if (lower === "mma") return "MMA";
      if (lower === "ufc") return "UFC";
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

function extractTeamName(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    const full = String(row.full_name ?? "").trim();
    if (full) return full;
    const display = String(row.display_name ?? "").trim();
    if (display) return display;
    const name = String(row.name ?? "").trim();
    if (name) return name;
    const short = String(row.short_name ?? "").trim();
    if (short) return short;
    const city = String(row.city ?? "").trim();
    if (city) return city;
    const location = String(row.location ?? "").trim();
    return location;
  }
  return "";
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

function extractNestedRuns(data: unknown): number | null {
  if (data == null || typeof data !== "object") return null;
  const runs = (data as Record<string, unknown>).runs;
  return parseScore(runs as number | string | null | undefined);
}

function extractHomeScore(event: Record<string, unknown>): number | null {
  return (
    parseScore(
      (event.home_team_score as number | string | null | undefined) ??
        (event.home_score as number | string | null | undefined) ??
        null
    ) ?? extractNestedRuns(event.home_team_data)
  );
}

function extractAwayScore(event: Record<string, unknown>): number | null {
  return (
    parseScore(
      (event.visitor_team_score as number | string | null | undefined) ??
        (event.away_score as number | string | null | undefined) ??
        null
    ) ?? extractNestedRuns(event.away_team_data)
  );
}

function formatPeriodLabel(
  time: string | null | undefined,
  timeInPeriod: string | null | undefined,
  isSoccer: boolean,
  period?: number | null
): string | null {
  const t = String(time ?? "").trim();
  if (t.toLowerCase() === "final" || t.toLowerCase() === "ft") return null;

  if (isSoccer) {
    if (!t) return null;
    if (t.toLowerCase() === "ht" || t.toLowerCase() === "halftime") return "HT";
    if (/^\d{1,3}'/.test(t)) return t;
    return null;
  }

  // NBA-style quarter labels
  if (t) {
    const clock =
      timeInPeriod && String(timeInPeriod).trim() && String(timeInPeriod).trim() !== " "
        ? String(timeInPeriod).trim()
        : null;
    switch (t) {
      case "1st Qtr": return clock ? `Q1 · ${clock}` : "Q1";
      case "2nd Qtr": return clock ? `Q2 · ${clock}` : "Q2";
      case "Halftime": return "Halftime";
      case "3rd Qtr": return clock ? `Q3 · ${clock}` : "Q3";
      case "4th Qtr": return clock ? `Q4 · ${clock}` : "Q4";
      default:
        if (t.toLowerCase().includes("ot") || t.toLowerCase().includes("overtime")) {
          return clock ? `OT · ${clock}` : "OT";
        }
    }
  }

  // MLB-style inning: use numeric period field
  if (typeof period === "number" && period > 0) {
    return `Inn. ${period}`;
  }

  return null;
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

function isBallDontLieFinalStatus(eventRecord: Record<string, unknown>): boolean {
  const statusRaw = String(eventRecord.status ?? "").trim().toLowerCase();
  const timeRaw = String(eventRecord.time ?? "").trim().toLowerCase();
  const gameStatusRaw = String(
    (eventRecord.game as Record<string, unknown> | undefined)?.status ?? ""
  )
    .trim()
    .toLowerCase();
  const gameStateRaw = String(eventRecord.game_state ?? "").trim().toLowerCase();
  const eventStatusRaw = String((eventRecord.event as Record<string, unknown> | undefined)?.status ?? "")
    .trim()
    .toLowerCase();

  const statusValues = [statusRaw, timeRaw, gameStatusRaw, gameStateRaw, eventStatusRaw].filter(Boolean);
  return statusValues.some(
    (value) =>
      value === "post" ||
      value === "off" ||
      value === "completed" ||
      value.includes("final") ||
      value.includes("full_time") ||
      value.includes("full time") ||
      value === "ft" ||
      value === "aet" ||
      value === "after ot" ||
      value === "after overtime"
  );
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
    homeTeamId: row.home_team_id ?? null,
    awayTeamId: row.away_team_id ?? null,
    selectedTeamId: row.selected_team_id ?? null,
    winningTeamId: row.winning_team_id ?? null,
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

async function getSportKeysForSlug(sportSlug: PickEmSportSlug): Promise<string[]> {
  const sport = SPORT_BY_SLUG.get(sportSlug);
  if (!sport) {
    return [];
  }

  if (!sport.isClickable) {
    return [];
  }

  return sport.sportKeys;
}

function listUtcDaysInclusive(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const startMs = Date.parse(`${fromIso.slice(0, 10)}T00:00:00.000Z`);
  const endMs = Date.parse(`${toIso.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return out;
  }
  for (let ms = startMs; ms <= endMs; ms += 24 * 60 * 60 * 1000) {
    out.push(new Date(ms).toISOString().slice(0, 10));
  }
  return out;
}

function buildQueryVariants(fromIso: string, toIso: string, perPage = "100"): URLSearchParams[] {
  const variants: URLSearchParams[] = [];
  const utcDays = listUtcDaysInclusive(fromIso, toIso);
  for (const day of utcDays) {
    variants.push(new URLSearchParams({ per_page: perPage, "dates[]": day }));
  }
  return variants;
}

function buildQueryVariantsForSportKey(
  _sportKey: string,
  fromIso: string,
  toIso: string,
  perPage = "100"
): URLSearchParams[] {
  return listUtcDaysInclusive(fromIso, toIso).map(
    (day) => new URLSearchParams({ per_page: perPage, "dates[]": day })
  );
}

function getPathVariantsForSportKey(sportKey: string): string[] {
  const provider = BDL_PATH_BY_SPORT_KEY[sportKey];
  if (!provider) return [];
  return [provider.path];
}

function getTeamsPathForSportKey(sportKey: string): string | null {
  const provider = BDL_PATH_BY_SPORT_KEY[sportKey];
  if (!provider?.isSoccerMatch || provider.embeddedTeams) return null;
  const base = provider.path.replace(/\/matches$/, "");
  return `${base}/teams`;
}

async function fetchTeamNameMapForSportKey(sportKey: string): Promise<Map<string, string>> {
  const path = getTeamsPathForSportKey(sportKey);
  if (!path) {
    return new Map();
  }
  const rows = await fetchBallDontLieList<Record<string, unknown>>(path, new URLSearchParams({ per_page: "200" }), 2);
  const map = new Map<string, string>();
  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    const name =
      String(row.full_name ?? "").trim() ||
      String(row.display_name ?? "").trim() ||
      String(row.name ?? "").trim() ||
      String(row.short_name ?? "").trim();
    if (id && name) {
      map.set(id, name);
    }
  }
  return map;
}

function splitMatchName(raw: string): { away: string; home: string } | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const atMatch = value.match(/^(.+?)\s+at\s+(.+)$/i);
  if (atMatch) {
    return { away: atMatch[1].trim(), home: atMatch[2].trim() };
  }
  const vMatch = value.match(/^(.+?)\s+v\s+(.+)$/i);
  if (vMatch) {
    return { home: vMatch[1].trim(), away: vMatch[2].trim() };
  }
  const vsMatch = value.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
  if (vsMatch) {
    return { home: vsMatch[1].trim(), away: vsMatch[2].trim() };
  }
  return null;
}

function isInvalidMmaDisplayName(value: unknown): boolean {
  const name = String(value ?? "").trim();
  if (!name) return true;
  const normalized = name.toLowerCase();
  return /^fighter\s+\d+$/.test(normalized) || /^player\s+\d+$/.test(normalized);
}

function extractCanonicalMmaFighterName(row: Record<string, unknown> | null | undefined): string {
  if (!row || typeof row !== "object") {
    return "";
  }
  const first = String(row.first_name ?? "").trim();
  const last = String(row.last_name ?? "").trim();
  const combined = `${first} ${last}`.trim();
  const direct = String(row.name ?? "").trim();
  const candidate = combined || direct;
  return isInvalidMmaDisplayName(candidate) ? "" : candidate;
}

async function fetchMmaFighterProfileById(fighterId: string): Promise<Record<string, unknown> | null> {
  const id = Number.parseInt(String(fighterId ?? "").trim(), 10);
  if (!Number.isFinite(id) || id <= 0 || !BALLDONTLIE_API_KEY) {
    return null;
  }
  const response = await fetch(`${BALLDONTLIE_API_BASE_URL}/mma/v1/fighters/${id}`, {
    method: "GET",
    headers: { Authorization: BALLDONTLIE_API_KEY },
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) {
    return null;
  }
  const payload = (await response.json().catch(() => null)) as { data?: Record<string, unknown> } | null;
  return payload?.data && typeof payload.data === "object" ? payload.data : null;
}

async function fetchBallDontLieEventsForSportKey(
  sportKey: string,
  fromIso: string,
  toIso: string,
  leagueLabel: string
): Promise<NormalizedBallDontLieEvent[]> {
  if (sportKey === "mma_ufc") {
    const mmaProvider = BDL_PATH_BY_SPORT_KEY[sportKey];
    if (!mmaProvider) {
      return [];
    }
    const start = new Date(fromIso);
    const end = new Date(toIso);
    const years = new Set<number>([start.getUTCFullYear(), end.getUTCFullYear()]);
    const eventsById = new Map<number, Record<string, unknown>>();

    for (const year of years) {
      const rows = await fetchBallDontLieList<Record<string, unknown>>(
        "/mma/v1/events",
        new URLSearchParams({ year: String(year), per_page: "100" }),
        2
      ).catch(() => []);
      for (const row of rows) {
        const id = Number(row.id);
        if (Number.isFinite(id)) {
          eventsById.set(id, row);
        }
      }
    }

    const fromMs = Date.parse(fromIso);
    const toMs = Date.parse(toIso);
    const relevantEventIds: number[] = [];
    for (const row of eventsById.values()) {
      const ts = Date.parse(String(row.date ?? ""));
      if (!Number.isFinite(ts)) continue;
      if (ts >= fromMs && ts <= toMs) {
        const id = Number(row.id);
        if (Number.isFinite(id)) {
          relevantEventIds.push(id);
        }
      }
    }

    if (relevantEventIds.length === 0) {
      return [];
    }

    const query = new URLSearchParams({ per_page: "100" });
    for (const eventId of relevantEventIds.slice(0, 50)) {
      query.append("event_ids[]", String(eventId));
    }
    const fights = await fetchBallDontLieList<Record<string, unknown>>("/mma/v1/fights", query, 2).catch(() => []);
    const fighterIds = Array.from(
      new Set(
        fights.flatMap((fight) => {
          const fighter1 = (fight.fighter1 ?? {}) as Record<string, unknown>;
          const fighter2 = (fight.fighter2 ?? {}) as Record<string, unknown>;
          return [String(fighter1.id ?? "").trim(), String(fighter2.id ?? "").trim()].filter(Boolean);
        })
      )
    );
    const fighterProfileRows = await Promise.all(
      fighterIds.map(async (id) => ({ id, row: await fetchMmaFighterProfileById(id) }))
    );
    const fighterProfileById = new Map<string, Record<string, unknown>>();
    for (const item of fighterProfileRows) {
      if (item.row) {
        fighterProfileById.set(item.id, item.row);
      }
    }
    const mmaEvents: NormalizedBallDontLieEvent[] = [];

    for (const fight of fights) {
      const fightId = String(fight.id ?? "").trim();
      const event = (fight.event ?? {}) as Record<string, unknown>;
      const fighter1 = (fight.fighter1 ?? {}) as Record<string, unknown>;
      const fighter2 = (fight.fighter2 ?? {}) as Record<string, unknown>;
      const winner = (fight.winner ?? {}) as Record<string, unknown>;

      const homeTeamId = String(fighter1.id ?? "").trim() || null;
      const awayTeamId = String(fighter2.id ?? "").trim() || null;
      const rawHomeName = String(fighter1.name ?? "").trim();
      const rawAwayName = String(fighter2.name ?? "").trim();
      const enrichedHomeName = homeTeamId ? extractCanonicalMmaFighterName(fighterProfileById.get(homeTeamId)) : "";
      const enrichedAwayName = awayTeamId ? extractCanonicalMmaFighterName(fighterProfileById.get(awayTeamId)) : "";
      const homeTeam = enrichedHomeName || (isInvalidMmaDisplayName(rawHomeName) ? "" : rawHomeName);
      const awayTeam = enrichedAwayName || (isInvalidMmaDisplayName(rawAwayName) ? "" : rawAwayName);
      const startsAt = normalizeBallDontLieGameStartIso(String(event.date ?? ""));
      if (homeTeamId && isInvalidMmaDisplayName(rawHomeName)) {
        console.warn("[pickem][mma] upstream fight payload missing/invalid fighter1.name", {
          fightId,
          fighterId: homeTeamId,
          rawName: rawHomeName,
        });
      }
      if (awayTeamId && isInvalidMmaDisplayName(rawAwayName)) {
        console.warn("[pickem][mma] upstream fight payload missing/invalid fighter2.name", {
          fightId,
          fighterId: awayTeamId,
          rawName: rawAwayName,
        });
      }

      if (homeTeamId && !homeTeam) {
        console.warn("[pickem][mma] skipping fight: unresolved fighter1 name after enrichment", {
          fightId,
          fighterId: homeTeamId,
          rawName: rawHomeName,
          enrichedName: enrichedHomeName,
        });
        continue;
      }
      if (awayTeamId && !awayTeam) {
        console.warn("[pickem][mma] skipping fight: unresolved fighter2 name after enrichment", {
          fightId,
          fighterId: awayTeamId,
          rawName: rawAwayName,
          enrichedName: enrichedAwayName,
        });
        continue;
      }

      if (!fightId || !homeTeam || !awayTeam || !startsAt) continue;

      const winnerId = String(winner.id ?? "").trim();
      const isCompleted = isBallDontLieFinalStatus({ event });
      const homeScore = isCompleted ? (winnerId && homeTeamId && winnerId === homeTeamId ? 1 : 0) : null;
      const awayScore = isCompleted ? (winnerId && awayTeamId && winnerId === awayTeamId ? 1 : 0) : null;
      const league =
        String((event.league as Record<string, unknown> | undefined)?.abbreviation ?? "").trim() ||
        String((event.league as Record<string, unknown> | undefined)?.name ?? "").trim() ||
        leagueLabel ||
        mmaProvider.league;

      mmaEvents.push({
        id: buildPickEmGameId({
          providerEventId: fightId,
          startsAt,
          homeTeam,
          awayTeam,
        }),
        providerEventId: fightId,
        sportKey,
        league,
        homeTeamId,
        awayTeamId,
        startsAt,
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        isCompleted,
        periodLabel: null,
      });
    }

    return mmaEvents;
  }

  const provider = BDL_PATH_BY_SPORT_KEY[sportKey];
  if (!provider) {
    return [];
  }

  const pathVariants = getPathVariantsForSportKey(sportKey);
  const queryVariants = buildQueryVariantsForSportKey(sportKey, fromIso, toIso, "100");

  const [batchResults, teamNameMap] = await Promise.all([
    Promise.allSettled(
      pathVariants.flatMap((path) =>
        queryVariants.map((query) => fetchBallDontLieList<BallDontLieGame>(path, query, 2))
      )
    ),
    fetchTeamNameMapForSportKey(sportKey),
  ]);

  const payload: BallDontLieGame[] = [];
  const seenKeys = new Set<string>();
  for (const result of batchResults) {
    if (result.status !== "fulfilled") continue;
    for (const row of result.value) {
      const key = `${String(row.id ?? "")}::${String(row.date ?? row.datetime ?? row.starts_at ?? row.commence_time ?? "")}`;
      if (!key || seenKeys.has(key)) continue;
      seenKeys.add(key);
      payload.push(row);
    }
  }
  const events: NormalizedBallDontLieEvent[] = [];
  for (const event of payload) {
    const eventRecord = event as unknown as Record<string, unknown>;
    const id = String(event.id ?? "").trim();
    const homeId =
      String(event.home_team_id ?? "").trim() ||
      String((eventRecord.home_team as Record<string, unknown> | undefined)?.id ?? "").trim();
    const awayId =
      String(event.away_team_id ?? "").trim() ||
      String((eventRecord.away_team as Record<string, unknown> | undefined)?.id ?? "").trim() ||
      String((eventRecord.visitor_team as Record<string, unknown> | undefined)?.id ?? "").trim();
    const splitNames = splitMatchName(String(event.name ?? "").trim());
    const homeTeam =
      String(event.home_team_name ?? "").trim() ||
      extractTeamName(eventRecord.home_team) ||
      extractTeamName(eventRecord.home_team_data) ||
      teamNameMap.get(homeId) ||
      splitNames?.home ||
      "";
    const awayTeam =
      String(event.away_team_name ?? "").trim() ||
      extractTeamName(eventRecord.away_team) ||
      extractTeamName(eventRecord.away_team_data) ||
      extractTeamName(eventRecord.visitor_team) ||
      teamNameMap.get(awayId) ||
      splitNames?.away ||
      "";
    const startsAt = extractEventStartIso(eventRecord);

    if (!id || !homeTeam || !awayTeam || !startsAt) {
      continue;
    }

    const startsTs = new Date(startsAt).getTime();
    if (!Number.isFinite(startsTs)) {
      continue;
    }

    const homeScore = extractHomeScore(eventRecord);
    const awayScore = extractAwayScore(eventRecord);
    const isCompleted = isBallDontLieFinalStatus(eventRecord);
    const periodLabel = formatPeriodLabel(event.time, event.time_in_period, provider.isSoccerMatch ?? false, typeof event.period === "number" ? event.period : null);

    events.push({
      id: buildPickEmGameId({
        providerEventId: id,
        startsAt,
        homeTeam,
        awayTeam,
      }),
      providerEventId: id,
      sportKey,
      league: leagueLabel || provider.league,
      homeTeamId: homeId || null,
      awayTeamId: awayId || null,
      startsAt,
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      isCompleted,
      periodLabel,
    });
  }

  return events;
}

async function fetchScoresForSportKey(sportKey: string): Promise<Map<string, BallDontLieScoreEvent>> {
  const provider = BDL_PATH_BY_SPORT_KEY[sportKey];
  if (!provider) {
    return new Map();
  }

  if (sportKey === "mma_ufc") {
    const currentYear = new Date().getUTCFullYear();
    const events = await fetchBallDontLieList<Record<string, unknown>>(
      "/mma/v1/events",
      new URLSearchParams({ year: String(currentYear), per_page: "100" }),
      2
    ).catch(() => []);
    const completedEventIds: string[] = [];
    for (const event of events) {
      const status = String(event.status ?? "").trim().toLowerCase();
      if (status === "completed" || status === "post" || status === "final") {
        const id = String(event.id ?? "").trim();
        if (id) completedEventIds.push(id);
      }
    }
    if (completedEventIds.length === 0) {
      return new Map();
    }

    const query = new URLSearchParams({ per_page: "100" });
    for (const eventId of completedEventIds.slice(0, 50)) {
      query.append("event_ids[]", eventId);
    }
    const fights = await fetchBallDontLieList<Record<string, unknown>>("/mma/v1/fights", query, 2).catch(() => []);
    const byId = new Map<string, BallDontLieScoreEvent>();
    for (const fight of fights) {
      const id = String(fight.id ?? "").trim();
      if (!id) continue;
      const event = (fight.event ?? {}) as Record<string, unknown>;
      const fighter1 = (fight.fighter1 ?? {}) as Record<string, unknown>;
      const fighter2 = (fight.fighter2 ?? {}) as Record<string, unknown>;
      const winner = (fight.winner ?? {}) as Record<string, unknown>;
      const homeTeam = String(fighter1.name ?? "").trim();
      const awayTeam = String(fighter2.name ?? "").trim();
      const winnerId = String(winner.id ?? "").trim();
      const fighter1Id = String(fighter1.id ?? "").trim();
      const fighter2Id = String(fighter2.id ?? "").trim();
      const completed = isBallDontLieFinalStatus({ event });
      const homeScore = completed ? (winnerId && fighter1Id && winnerId === fighter1Id ? 1 : 0) : null;
      const awayScore = completed ? (winnerId && fighter2Id && winnerId === fighter2Id ? 1 : 0) : null;
      byId.set(id, {
        id,
        sport_key: sportKey,
        sport_title: provider.league,
        commence_time: normalizeBallDontLieGameStartIso(String(event.date ?? "")) ?? "",
        completed,
        home_team: homeTeam,
        away_team: awayTeam,
        scores: [
          { name: homeTeam, score: homeScore },
          { name: awayTeam, score: awayScore },
        ],
      });
    }
    return byId;
  }

  const now = Date.now();
  const queryVariants = buildQueryVariantsForSportKey(
    sportKey,
    new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
    new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    "100"
  );

  const [batchResults, teamNameMap] = await Promise.all([
    Promise.allSettled(
      queryVariants.map((query) => fetchBallDontLieList<BallDontLieGame>(provider.path, query, 2))
    ),
    fetchTeamNameMapForSportKey(sportKey),
  ]);

  const payload: BallDontLieGame[] = [];
  const seenKeys = new Set<string>();
  for (const result of batchResults) {
    if (result.status !== "fulfilled") continue;
    for (const row of result.value) {
      const key = `${String(row.id ?? "")}::${String(row.date ?? row.datetime ?? row.starts_at ?? row.commence_time ?? "")}`;
      if (!key || seenKeys.has(key)) continue;
      seenKeys.add(key);
      payload.push(row);
    }
  }

  const byId = new Map<string, BallDontLieScoreEvent>();
  for (const event of payload) {
    const eventRecord = event as unknown as Record<string, unknown>;
    const id = String(event.id ?? "").trim();
    if (!id) {
      continue;
    }
    const homeTeam =
      String(event.home_team_name ?? "").trim() ||
      extractTeamName(eventRecord.home_team) ||
      extractTeamName(eventRecord.home_team_data) ||
      teamNameMap.get(String(event.home_team_id ?? "").trim()) ||
      splitMatchName(String(event.name ?? "").trim())?.home ||
      "";
    const awayTeam =
      String(event.away_team_name ?? "").trim() ||
      extractTeamName(eventRecord.away_team) ||
      extractTeamName(eventRecord.away_team_data) ||
      extractTeamName(eventRecord.visitor_team) ||
      teamNameMap.get(String(event.away_team_id ?? "").trim()) ||
      splitMatchName(String(event.name ?? "").trim())?.away ||
      "";
    const startsAtIso = extractEventStartIso(eventRecord);
    const homeScore = extractHomeScore(eventRecord);
    const awayScore = extractAwayScore(eventRecord);
    const completed = isBallDontLieFinalStatus(eventRecord);
    byId.set(id, {
      id,
      sport_key: sportKey,
      sport_title: provider.league,
      commence_time: startsAtIso ?? "",
      completed,
      home_team: homeTeam,
      away_team: awayTeam,
      scores: [
        { name: homeTeam, score: homeScore },
        { name: awayTeam, score: awayScore },
      ],
    });
  }

  return byId;
}

async function probePathForDebug(sportKey: string, path: string, query: URLSearchParams): Promise<PickEmDebugProbe | null> {
  const url = `${BALLDONTLIE_API_BASE_URL}${path}?${query.toString()}`;
  if (!BALLDONTLIE_API_KEY) {
    return { sportKey, path, url, statusCode: 0, bodyPreview: "BALLDONTLIE_API_KEY missing" };
  }
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: BALLDONTLIE_API_KEY },
      cache: "no-store",
    });
    const raw = await response.text();
    return {
      sportKey,
      path,
      url,
      statusCode: response.status,
      bodyPreview: raw.slice(0, 100),
    };
  } catch (error) {
    return {
      sportKey,
      path,
      url,
      statusCode: -1,
      bodyPreview: error instanceof Error ? error.message.slice(0, 100) : "probe failed",
    };
  }
}

function getTeamScore(scores: BallDontLieScoreEvent["scores"], teamName: string): number | null {
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

function resolveWinner(homeTeam: string, awayTeam: string, homeScore: number | null, awayScore: number | null): string | "tie" | null {
  if (homeScore === null || awayScore === null) {
    return null;
  }

  if (homeScore > awayScore) {
    return homeTeam;
  }
  if (awayScore > homeScore) {
    return awayTeam;
  }
  return "tie";
}

function getPickEmRoundMultiplier(params: {
  totalPicks: number;
  pendingPicks: number;
  correctPicks: number;
  multiplierEligible: boolean;
}): 1 | 2 | 3 {
  if (!params.multiplierEligible) {
    return 1;
  }
  if (params.pendingPicks > 0) {
    return 1;
  }
  if (params.totalPicks !== PICKEM_DAILY_PICK_LIMIT) {
    return 1;
  }
  if (params.correctPicks >= PICKEM_DAILY_PICK_LIMIT) {
    return 3;
  }
  if (params.correctPicks >= 7) {
    return 2;
  }
  return 1;
}

function getUtcDateRangeForIsoDay(startsAtIso: string): { dayStartIso: string; dayEndIso: string } | null {
  const startsAtMs = Date.parse(startsAtIso);
  if (!Number.isFinite(startsAtMs)) {
    return null;
  }
  const date = new Date(startsAtMs);
  const dayStartMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0);
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000 - 1;
  return {
    dayStartIso: new Date(dayStartMs).toISOString(),
    dayEndIso: new Date(dayEndMs).toISOString(),
  };
}

async function recomputePickEmRoundRewards(params: {
  userId: string;
  venueId: string;
  startsAtIso: string;
}): Promise<void> {
  await getPickEmPointsBankSummary({
    userId: params.userId,
    venueId: params.venueId,
    localDate: params.startsAtIso.slice(0, 10),
    tzOffsetMinutes: 0,
  });
}

function computePickEmDailySummary(
  rows: Array<PickEmPickRow | { status: PickEmPickStatus; reward_claimed_at?: string | null }>
): Omit<PickEmPointsBankSummary, "localDate" | "multiplierEligible" | "collectedPointsToday"> {
  let settledPicks = 0;
  let pendingPicks = 0;
  let correctPicks = 0;
  let incorrectPicks = 0;
  let unclaimedCorrectPicks = 0;
  for (const row of rows) {
    if (row.status === "pending") {
      pendingPicks += 1;
      continue;
    }
    settledPicks += 1;
    if (row.status === "won") {
      correctPicks += 1;
      if (!row.reward_claimed_at) {
        unclaimedCorrectPicks += 1;
      }
      continue;
    }
    if (row.status === "lost") {
      incorrectPicks += 1;
    }
  }
  return {
    totalPicks: rows.length,
    settledPicks,
    pendingPicks,
    correctPicks,
    incorrectPicks,
    unclaimedCorrectPicks,
    pendingPoints: unclaimedCorrectPicks * PICKEM_REWARD_POINTS,
    multiplierIfSettledNow: 1,
  };
}

export async function getPickEmPointsBankSummary(params: {
  userId: string;
  venueId: string;
  localDate: string;
  tzOffsetMinutes?: number | string;
}): Promise<PickEmPointsBankSummary> {
  const fallback: PickEmPointsBankSummary = {
    localDate: params.localDate,
    totalPicks: 0,
    settledPicks: 0,
    pendingPicks: 0,
    correctPicks: 0,
    incorrectPicks: 0,
    unclaimedCorrectPicks: 0,
    pendingPoints: 0,
    multiplierEligible: true,
    multiplierIfSettledNow: 1,
    collectedPointsToday: 0,
  };
  if (!supabaseAdmin) {
    return fallback;
  }
  const userId = String(params.userId ?? "").trim();
  const venueId = String(params.venueId ?? "").trim();
  if (!userId || !venueId) {
    return fallback;
  }

  const tzOffsetMinutes = parseTimezoneOffset(params.tzOffsetMinutes);
  const range = buildUtcRangeForLocalDay(params.localDate, tzOffsetMinutes);
  const localDate = range.date;

  const { data: picks, error } = await supabaseAdmin
    .from("pickem_picks")
    .select("status, reward_claimed_at, reward_points")
    .eq("user_id", userId)
    .eq("venue_id", venueId)
    .gte("starts_at", range.fromIso)
    .lte("starts_at", range.toIso);
  if (error || !picks) {
    return { ...fallback, localDate };
  }

  const computed = computePickEmDailySummary(
    picks as Array<{ status: PickEmPickStatus; reward_claimed_at?: string | null }>
  );

  const { data: existing } = await supabaseAdmin
    .from("pickem_daily_snapshots")
    .select("multiplier_eligible, collected_points")
    .eq("user_id", userId)
    .eq("venue_id", venueId)
    .eq("local_date", localDate)
    .maybeSingle<{ multiplier_eligible: boolean | null; collected_points: number | null }>();

  const multiplierEligible = existing?.multiplier_eligible ?? true;
  const collectedPointsToday = Math.max(0, Number(existing?.collected_points ?? 0));
  const multiplierIfSettledNow = getPickEmRoundMultiplier({
    totalPicks: computed.totalPicks,
    pendingPicks: computed.pendingPicks,
    correctPicks: computed.correctPicks,
    multiplierEligible,
  });

  const snapshotRow = {
    user_id: userId,
    venue_id: venueId,
    local_date: localDate,
    total_picks: computed.totalPicks,
    settled_picks: computed.settledPicks,
    pending_picks: computed.pendingPicks,
    correct_picks: computed.correctPicks,
    incorrect_picks: computed.incorrectPicks,
    unclaimed_correct_picks: computed.unclaimedCorrectPicks,
    pending_points: computed.pendingPoints,
    multiplier_eligible: multiplierEligible,
    multiplier_if_settled_now: multiplierIfSettledNow,
    collected_points: collectedPointsToday,
    collected_at: null as string | null,
    updated_at: new Date().toISOString(),
  };

  await supabaseAdmin
    .from("pickem_daily_snapshots")
    .upsert(snapshotRow, { onConflict: "user_id,venue_id,local_date" });

  return {
    localDate,
    ...computed,
    multiplierEligible,
    multiplierIfSettledNow,
    collectedPointsToday,
  };
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
  venueId?: string;
}): Promise<{
  sport: PickEmSport;
  date: string;
  games: PickEmGame[];
  pointsBank?: PickEmPointsBankSummary;
  weekOptions?: Array<{ label: string; value: string }>;
  selectedWeekStartDate?: string;
  debug?: { probes: PickEmDebugProbe[] };
}> {
  const sport = getSportOrThrow(params.sportSlug);
  const tzOffsetMinutes = parseTimezoneOffset(params.tzOffsetMinutes);
  const dayRange = buildUtcRangeForLocalDay(params.date, tzOffsetMinutes);
  let date = dayRange.date;
  let fromIso = dayRange.fromIso;
  let toIso = dayRange.toIso;
  let weekOptions: Array<{ label: string; value: string }> = [];
  let selectedWeekStartDate: string | undefined;

  const sportKeys = await getSportKeysForSlug(sport.slug);
  if (sportKeys.length === 0) {
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

  if (sport.slug === "nfl") {
    const nflKey = sportKeys[0];
    if (nflKey) {
      const now = Date.now();
      const horizonToIso = new Date(now + 140 * 24 * 60 * 60 * 1000).toISOString();
      const horizonFromIso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      const nflEvents = await fetchBallDontLieEventsForSportKey(
        nflKey,
        horizonFromIso,
        horizonToIso,
        getLeagueLabelForSportKey(nflKey)
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

  const [eventsSettled, picksByGameId] = await Promise.all([
    Promise.allSettled(
      sportKeys.map((sportKey) =>
        fetchBallDontLieEventsForSportKey(sportKey, fromIso, toIso, getLeagueLabelForSportKey(sportKey))
      )
    ),
    params.userId ? listUserPicksByGameId(params.userId.trim(), sport.slug, fromIso, toIso) : Promise.resolve(new Map()),
  ]);

  const eventsById = new Map<string, NormalizedBallDontLieEvent>();
  for (const settled of eventsSettled) {
    if (settled.status !== "fulfilled") {
      continue;
    }
    for (const event of settled.value) {
      const localDateKey = toLocalDateKey(event.startsAt, tzOffsetMinutes);
      if (localDateKey !== date) {
        continue;
      }
      eventsById.set(event.id, event);
    }
  }

  const games: PickEmGame[] = [];
  for (const event of eventsById.values()) {
    const homeScore = event.homeScore;
    const awayScore = event.awayScore;
    const winner = resolveWinner(event.homeTeam, event.awayTeam, homeScore, awayScore);

    let status: PickEmGameStatus = "scheduled";
    if (event.isCompleted) {
      status = "final";
    } else if (isPickLocked(event.startsAt)) {
      status = "live";
    }

    const pick = picksByGameId.get(event.id) ?? picksByGameId.get(event.providerEventId);

    games.push({
      id: event.id,
      sportSlug: sport.slug,
      sportKey: event.sportKey,
      league: event.league,
      homeTeamId: event.homeTeamId,
      awayTeamId: event.awayTeamId,
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      startsAt: event.startsAt,
      isLocked: isPickLocked(event.startsAt),
      status,
      homeScore,
      awayScore,
      winnerTeam: winner === "tie" ? null : winner,
      periodLabel: event.periodLabel,
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

  let debug: { probes: PickEmDebugProbe[] } | undefined;
  if (games.length === 0) {
    const probes: PickEmDebugProbe[] = [];
    for (const sportKey of sportKeys) {
      const paths = getPathVariantsForSportKey(sportKey);
      const queries = buildQueryVariants(fromIso, toIso, "5");
      for (const path of paths) {
        for (const query of queries) {
          const probe = await probePathForDebug(sportKey, path, query);
          if (probe) probes.push(probe);
        }
      }
    }
    debug = { probes };
  }

  let pointsBank: PickEmPointsBankSummary | undefined;
  if (params.userId && params.venueId) {
    pointsBank = await getPickEmPointsBankSummary({
      userId: params.userId.trim(),
      venueId: params.venueId.trim(),
      localDate: date,
      tzOffsetMinutes,
    }).catch(() => undefined);
  }

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
    pointsBank,
    weekOptions,
    selectedWeekStartDate,
    debug,
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
  const admin = supabaseAdmin;

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

  const gameLocalDate = toLocalDateKey(game.startsAt, tzOffsetMinutes);
  const todayLocalDate = getTodayDateInOffset(tzOffsetMinutes);
  if (gameLocalDate !== todayLocalDate) {
    throw new Error("You can only place picks for today.");
  }

  if (game.isLocked) {
    throw new Error("Picks are locked for this game because it has already started.");
  }

  if (pickTeam !== game.homeTeam && pickTeam !== game.awayTeam) {
    throw new Error("pickTeam must match one of the teams in this game.");
  }

  const selectedSide: "home" | "away" = pickTeam === game.homeTeam ? "home" : "away";
  const selectedTeamId = selectedSide === "home" ? game.homeTeamId : game.awayTeamId;
  const gameLabel = `${game.awayTeam} vs ${game.homeTeam}`;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("pickem_picks")
    .select(PICKEM_PICK_SELECT)
    .eq("user_id", userId)
    .eq("venue_id", venueId)
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
        selected_team_id: selectedTeamId,
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
    .eq("venue_id", venueId)
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
      home_team_id: game.homeTeamId,
      away_team_id: game.awayTeamId,
      selected_team_id: selectedTeamId,
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
  const admin = supabaseAdmin;

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
  venueId?: string;
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
  const venueId = String(params.venueId ?? "").trim();
  if (venueId) {
    query = query.eq("venue_id", venueId);
  }
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
  if (!supabaseAdmin) {
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
  const scoresBySportKey = new Map<string, Map<string, BallDontLieScoreEvent>>();

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
  const staleFinalizeMs = 4 * 60 * 60 * 1000;
  const nowMs = Date.now();

  for (const row of pending) {
    const scoreMap = scoresBySportKey.get(row.sport_key);
    const providerEventId = extractProviderEventIdFromGameId(row.game_id);
    let scoreEvent = scoreMap?.get(row.game_id);
    if (!scoreEvent && providerEventId) {
      scoreEvent = scoreMap?.get(providerEventId);
    }
    if (!scoreEvent && scoreMap) {
      const rowHomeKey = normalizeTeamKey(row.home_team);
      const rowAwayKey = normalizeTeamKey(row.away_team);
      for (const candidate of scoreMap.values()) {
        const homeKey = normalizeTeamKey(String(candidate.home_team ?? ""));
        const awayKey = normalizeTeamKey(String(candidate.away_team ?? ""));
        if (homeKey && awayKey && homeKey === rowHomeKey && awayKey === rowAwayKey) {
          scoreEvent = candidate;
          break;
        }
      }
    }
    if (!scoreEvent) {
      continue;
    }

    const homeScore = getTeamScore(scoreEvent.scores, row.home_team);
    const awayScore = getTeamScore(scoreEvent.scores, row.away_team);
    const startsAtMs = Date.parse(row.starts_at);
    const isStale = Number.isFinite(startsAtMs) && nowMs - startsAtMs >= staleFinalizeMs;
    const canFinalizeFromScores = homeScore !== null && awayScore !== null && isStale;
    if (!scoreEvent.completed && !canFinalizeFromScores) {
      continue;
    }

    let status: PickEmPickStatus = "canceled";
    let winningTeamId: string | null = null;
    if (homeScore !== null && awayScore !== null) {
      const winner = resolveWinner(row.home_team, row.away_team, homeScore, awayScore);
      if (winner === "tie") {
        status = "push";
        push += 1;
      } else if (winner) {
        winningTeamId = winner === row.home_team ? row.home_team_id : row.away_team_id;
        const selectedTeamId = String(row.selected_team_id ?? "").trim() || null;
        if (selectedTeamId && winningTeamId) {
          status = selectedTeamId === winningTeamId ? "won" : "lost";
        } else {
          status = winner === row.selected_team ? "won" : "lost";
        }
        if (status === "won") {
          won += 1;
        } else {
          lost += 1;
        }
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from("pickem_picks")
      .update({
        status,
        home_score: homeScore,
        away_score: awayScore,
        winning_team_id: winningTeamId,
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

export async function claimPickEmPoints(params: {
  userId: string;
  venueId: string;
  localDate: string;
  tzOffsetMinutes?: number | string;
}): Promise<{
  claimed: boolean;
  pointsAwarded: number;
  claimedPickCount: number;
  multiplierApplied: 1 | 2 | 3;
  multiplierEligible: boolean;
  totalPicks: number;
  settledPicks: number;
  correctPicks: number;
  pendingPicks: number;
}> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }
  const admin = supabaseAdmin;

  const userId = String(params.userId ?? "").trim();
  const venueId = String(params.venueId ?? "").trim();
  if (!userId || !venueId) {
    throw new Error("userId and venueId are required.");
  }
  const tzOffsetMinutes = parseTimezoneOffset(params.tzOffsetMinutes);
  const range = buildUtcRangeForLocalDay(params.localDate, tzOffsetMinutes);

  const runClaimForRange = async (claimRange: ReturnType<typeof buildUtcRangeForLocalDay>) => {
    const { data, error } = await admin.rpc("claim_pickem_points", {
      p_user_id: userId,
      p_venue_id: venueId,
      p_local_date: claimRange.date,
      p_day_start: claimRange.fromIso,
      p_day_end: claimRange.toIso,
    });
    if (error) {
      throw new Error(error.message ?? "Failed to claim Pick 'Em points.");
    }
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      throw new Error("No claim result returned.");
    }
    return row;
  };

  let effectiveClaimDate = range.date;
  let row = await runClaimForRange(range);

  const pointsAwarded = Math.max(0, Number(row.points_awarded ?? 0));
  const claimedPickCount = Math.max(0, Number(row.claimed_pick_count ?? 0));
  const multiplierAppliedRaw = Number(row.multiplier_applied ?? 1);
  const multiplierApplied: 1 | 2 | 3 =
    multiplierAppliedRaw >= 3 ? 3 : multiplierAppliedRaw >= 2 ? 2 : 1;
  const totalPicks = Math.max(0, Number(row.total_picks ?? 0));
  const settledPicks = Math.max(0, Number(row.settled_picks ?? 0));
  const correctPicks = Math.max(0, Number(row.correct_picks ?? 0));
  const pendingPicks = Math.max(0, Number(row.pending_picks ?? 0));
  const multiplierEligible = Boolean(row.multiplier_eligible);

  if (pointsAwarded <= 0 && claimedPickCount <= 0) {
    const latestUnclaimed = await admin
      .from("pickem_picks")
      .select("starts_at")
      .eq("user_id", userId)
      .eq("venue_id", venueId)
      .eq("status", "won")
      .is("reward_claimed_at", null)
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ starts_at: string }>();

    const latestStartsAt = latestUnclaimed.data?.starts_at ?? "";
    const fallbackLocalDate = latestStartsAt ? toLocalDateKey(latestStartsAt, tzOffsetMinutes) : "";

    if (fallbackLocalDate && fallbackLocalDate !== range.date) {
      const fallbackRange = buildUtcRangeForLocalDay(fallbackLocalDate, tzOffsetMinutes);
      row = await runClaimForRange(fallbackRange);
      effectiveClaimDate = fallbackRange.date;
    }
  }

  const finalPointsAwarded = Math.max(0, Number(row.points_awarded ?? 0));
  const finalClaimedPickCount = Math.max(0, Number(row.claimed_pick_count ?? 0));
  const finalTotalPicks = Math.max(0, Number(row.total_picks ?? 0));
  const finalSettledPicks = Math.max(0, Number(row.settled_picks ?? 0));
  const finalCorrectPicks = Math.max(0, Number(row.correct_picks ?? 0));
  const finalPendingPicks = Math.max(0, Number(row.pending_picks ?? 0));

  const qualifyingMultiplier: 1 | 2 | 3 =
    finalPendingPicks === 0 && finalTotalPicks === PICKEM_DAILY_PICK_LIMIT
      ? finalCorrectPicks >= PICKEM_DAILY_PICK_LIMIT
        ? 3
        : finalCorrectPicks >= 7
        ? 2
        : 1
      : 1;

  let bonusPoints = 0;
  if (qualifyingMultiplier > 1) {
    const { data: snapshot } = await admin
      .from("pickem_daily_snapshots")
      .select("collected_points")
      .eq("user_id", userId)
      .eq("venue_id", venueId)
      .eq("local_date", effectiveClaimDate)
      .maybeSingle<{ collected_points: number | null }>();

    const collectedPoints = Math.max(0, Number(snapshot?.collected_points ?? 0));
    const targetCollected = finalCorrectPicks * PICKEM_REWARD_POINTS * qualifyingMultiplier;
    bonusPoints = Math.max(0, targetCollected - collectedPoints);

    if (bonusPoints > 0) {
      const { data: userRow } = await admin
        .from("users")
        .select("points")
        .eq("id", userId)
        .maybeSingle<{ points: number | null }>();
      const currentPoints = Math.max(0, Number(userRow?.points ?? 0));
      await admin.from("users").update({ points: currentPoints + bonusPoints }).eq("id", userId);
      await admin
        .from("pickem_daily_snapshots")
        .update({
          collected_points: collectedPoints + bonusPoints,
          multiplier_if_settled_now: qualifyingMultiplier,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("venue_id", venueId)
        .eq("local_date", effectiveClaimDate);
    }
  }

  const totalAwarded = finalPointsAwarded + bonusPoints;
  const result = {
    claimed: finalClaimedPickCount > 0 || totalAwarded > 0,
    pointsAwarded: totalAwarded,
    claimedPickCount: finalClaimedPickCount,
    multiplierApplied: qualifyingMultiplier > 1 ? qualifyingMultiplier : multiplierApplied,
    multiplierEligible,
    totalPicks: finalTotalPicks,
    settledPicks: finalSettledPicks,
    correctPicks: finalCorrectPicks,
    pendingPicks: finalPendingPicks,
  };

  if (result.claimed && totalAwarded > 0) {
    try {
      await applyChallengeCampaignPoints({
        userId,
        venueId,
        gameType: "pickem",
        basePoints: totalAwarded,
        occurredAt: new Date(),
      });
    } catch {}

    try {
      await supabaseAdmin.from("notifications").insert({
        user_id: userId,
        type: "success",
        message:
          bonusPoints > 0
            ? `Pick 'Em collected: +${totalAwarded} points (includes ${result.multiplierApplied}x multiplier bonus).`
            : `Pick 'Em collected: +${totalAwarded} points added to your credit allocation.`,
      });
    } catch {}
  }

  return result;
}

export async function claimPickEmReward(params: {
  userId: string;
  pickId: string;
}): Promise<{ claimed: boolean; pointsAwarded: number; status: PickEmPickStatus }> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }
  const pickLookup = await supabaseAdmin
    .from("pickem_picks")
    .select("venue_id, starts_at")
    .eq("id", String(params.pickId ?? "").trim())
    .eq("user_id", String(params.userId ?? "").trim())
    .maybeSingle<{ venue_id: string; starts_at: string }>();
  if (pickLookup.error || !pickLookup.data) {
    throw new Error(pickLookup.error?.message ?? "Pick not found.");
  }
  const localDate = pickLookup.data.starts_at.slice(0, 10);
  const result = await claimPickEmPoints({
    userId: params.userId,
    venueId: pickLookup.data.venue_id,
    localDate,
    tzOffsetMinutes: 0,
  });
  return {
    claimed: result.claimed,
    pointsAwarded: result.pointsAwarded,
    status: result.claimed ? "won" : "pending",
  };
}
