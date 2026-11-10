import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchBallDontLieList } from "@/lib/balldontlie";
import { PICKEM_SPORT_CATALOG, type PickEmSportSlug } from "@/lib/pickemSports";
import { checkPickEmPrizePickLimit } from "@/lib/pickemPrizeLimit";
import { loadPickEmGamePrizes } from "@/lib/pickemGamePrizes";
import type { PickEmGamePrize } from "@/lib/pickemPrizeLine";
import { payPickEmPoints, PICKEM_POINTS_PER_CORRECT_PICK, type PickEmPayoutReport } from "@/lib/pickemPoints";
import {
  collegeFootballGradeGate,
  collegeFootballMissingGameGate,
  collegeFootballSpreadLineGate,
  COLLEGE_FOOTBALL_SPREAD_COPY,
  COLLEGE_FOOTBALL_SPORT_KEY,
  formatCollegeFootballPeriodLabel,
  isFbsCollegeFootballGame,
} from "@/lib/pickemCollegeFootball";
import { getLockedNFLPickEmGameLineForSettlement, type NFLPickEmGameLine } from "@/lib/nflPickEm";
import {
  DEFAULT_CFB_PICKEM_SCORING_MODE,
  getVenueGameSettings,
  getVenueNFLPickEmScoringMode,
  type NFLPickEmScoringMode,
  type VenueGameSettings,
} from "@/lib/venueGameSettings";
import {
  assertPickEmPickWindowOpen,
  assertPickEmPickWindowOpenAtVenue,
  readVenueGameSettingsForPick,
} from "@/lib/pickemPickWindowGate";
import { pickAheadHorizonMs, pickWindowViewForGames, type PickEmPickWindowView } from "@/lib/pickemPickWindow";
import { getVenueTimezone } from "@/lib/timezone";
import { countProviderCall } from "@/lib/providerCallCounter";
import {
  isSpreadLineSportKey,
  loadPickEmGameLines,
  lockPickEmGameLinesForSettlement,
  readPickEmGameLine,
  type PickEmGameLine,
} from "@/lib/pickemGameLines";
import {
  applyVenueFrozenLines,
  frozenLineForPick,
  frozenLinePickColumns,
  lineShownForGame,
  PICKEM_FROZEN_LINE_FAILED_MESSAGE,
  recordedPickLine,
  type PickEmFrozenLine,
} from "@/lib/pickemFrozenLines";

export type { PickEmSportSlug };
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
  /**
   * College Football only: the rule this game is played by at this venue (the player's own pick's
   * stamped rule once they have picked), its line, and whether it can be picked yet.
   */
  scoringMode?: NFLPickEmScoringMode;
  homeSpread?: number | null;
  awaySpread?: number | null;
  lineComingSoon?: boolean;
  /**
   * A Pick 'Em Prize that limits picks ("X out of N") covers this game and the player has used them all:
   * a NEW pick is refused (a pick already made can still be changed or cleared).
   */
  pickLimitReached?: boolean;
  /** The server's words from the prize that covers THIS game (set with pickLimitReached). */
  pickLimitMessage?: string;
  /**
   * The bar's pick window for this sport is shut for this game (away-mode plan B2): "Picks open Mon
   * 12:00 AM" / "Picks closed". Absent = open, no window, or already started.
   */
  pickWindowMessage?: string;
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
  /** College picks: the rule stamped when the pick was made. NFL: written at settlement. */
  scoringMode?: NFLPickEmScoringMode | null;
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
  scoring_mode: NFLPickEmScoringMode | null;
  home_spread: number | string | null;
  away_spread: number | string | null;
};

/**
 * One muted line on the Pick 'Em screen: "Today: 7 right · +70 points". Regular sports only
 * (NFL Pick 'Em has its own screen). Points are already paid — there is nothing to collect.
 */
export type PickEmTodaySummary = {
  localDate: string;
  picks: number;
  pending: number;
  correct: number;
  points: number;
};

type BallDontLieScoreEvent = {
  id?: string;
  sport_key?: string;
  sport_title?: string;
  commence_time?: string;
  completed?: boolean;
  home_team?: string;
  away_team?: string;
  home_team_id?: string | null;
  away_team_id?: string | null;
  winner_team_id?: string | null;
  winner_team?: string | null;
  scores?: Array<{
    name?: string;
    score?: number | string | null;
  }>;
  // The provider's own status words, unparsed (College Football grades from these; Phase 7.3).
  status?: string | null;
  status_state?: string | null;
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
  winnerTeamId: string | null;
  winnerTeam: string | null;
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
  match_status?: string;
  datetime?: string;
  date?: string;
  commence_time?: string;
  start_time?: string;
  scheduled_time?: string;
  scheduled_at?: string;
  home_team_score?: number | string | null;
  visitor_team_score?: number | string | null;
  home_score?: number | string | null;
  away_score?: number | string | null;
  player1_game_score?: number | string | null;
  player2_game_score?: number | string | null;
  is_live?: boolean;
  score?: string | null;
  player1?: { id?: number | string; full_name?: string; first_name?: string; last_name?: string } | string;
  player2?: { id?: number | string; full_name?: string; first_name?: string; last_name?: string } | string;
  winner?: { id?: number | string; full_name?: string; first_name?: string; last_name?: string } | string | null;
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
  [COLLEGE_FOOTBALL_SPORT_KEY]: { path: "/ncaaf/v1/games", league: "College Football" },
  nfl: { path: "/nfl/v1/games", league: "NFL" },
  mma_ufc: { path: "/mma/v1/fights", league: "UFC" },
  mma: { path: "/mma/v1/fights", league: "MMA" },
  tennis_atp: { path: "/atp/v1/matches", league: "ATP" },
  atp: { path: "/atp/v1/matches", league: "ATP" },
  tennis_wta: { path: "/wta/v1/matches", league: "WTA" },
  wta: { path: "/wta/v1/matches", league: "WTA" },
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
const PICKEM_TABLES_MISSING_ERROR =
  "Pick 'Em tables are not installed in this Supabase project yet. Run migration supabase/migrations/20260427113000_add_pickem_tables.sql.";
const PICKEM_REWARD_POINTS = PICKEM_POINTS_PER_CORRECT_PICK;
const PICKEM_PICK_SELECT =
  "id, user_id, venue_id, sport_slug, sport_key, league, game_id, home_team_id, away_team_id, selected_team_id, winning_team_id, game_label, home_team, away_team, starts_at, selected_team, selected_side, status, home_score, away_score, created_at, updated_at, resolved_at, reward_points, reward_claimed_at, scoring_mode, home_spread, away_spread";

// One list, shared with the Pick 'Em Prize rules (lib/pickemSports.ts).
const PICKEM_SPORTS: PickEmSportOption[] = PICKEM_SPORT_CATALOG.map(
  ({ slug, label, subtitle, isInSeason, isClickable, leagues }) => ({
    slug,
    label,
    subtitle,
    isInSeason,
    isClickable,
    sportKeys: leagues.map((league) => league.sportKey),
  }),
);

const SPORT_BY_SLUG = new Map(PICKEM_SPORTS.map((item) => [item.slug, item]));

/** The league label a game (and its pick) carries. Exported for the catalog parity test. */
export function getLeagueLabelForSportKey(sportKey: string): string {
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
      if (lower === "atp") return "ATP";
      if (lower === "wta") return "WTA";
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

function extractEntityId(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (typeof value === "object") {
    return String((value as Record<string, unknown>).id ?? "").trim();
  }
  return "";
}

function extractParticipantName(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (!value || typeof value !== "object") {
    return "";
  }
  const row = value as Record<string, unknown>;
  const full = String(row.full_name ?? "").trim();
  if (full) return full;
  const name = String(row.name ?? "").trim();
  if (name) return name;
  const first = String(row.first_name ?? "").trim();
  const last = String(row.last_name ?? "").trim();
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;
  const display = String(row.display_name ?? "").trim();
  if (display) return display;
  return "";
}

function isTennisSportKey(sportKey: string): boolean {
  return sportKey === "tennis_atp" || sportKey === "tennis_wta" || sportKey === "atp" || sportKey === "wta";
}

function extractTennisWinner(event: Record<string, unknown>): { winnerTeamId: string | null; winnerTeam: string | null } {
  const winnerObject = event.winner as Record<string, unknown> | undefined;
  const winnerTeamId =
    extractEntityId(event.winner_id) ||
    extractEntityId(event.winnerId) ||
    extractEntityId(event.winning_player_id) ||
    extractEntityId(event.winner_player_id) ||
    extractEntityId(winnerObject?.id);
  const winnerTeam = extractParticipantName(event.winner) || String(event.winner_name ?? "").trim() || null;
  return {
    winnerTeamId: winnerTeamId || null,
    winnerTeam: winnerTeam || null,
  };
}

function extractEventStartIso(event: Record<string, unknown>): string | null {
  const rawCandidates = [
    event.scheduled_time,
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
  const matchStatusRaw = String(eventRecord.match_status ?? "").trim().toLowerCase();
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

  const statusValues = [statusRaw, matchStatusRaw, timeRaw, gameStatusRaw, gameStateRaw, eventStatusRaw].filter(Boolean);
  return statusValues.some(
    (value) =>
      value === "post" ||
      value === "off" ||
      value === "completed" ||
      value === "finished" ||
      value === "retired" ||
      value === "walkover" ||
      value === "w/o" ||
      value === "wo" ||
      value === "cancelled" ||
      value === "canceled" ||
      value === "defaulted" ||
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
    scoringMode: row.scoring_mode ?? null,
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
  sportKey: string,
  fromIso: string,
  toIso: string,
  perPage = "100"
): URLSearchParams[] {
  if (isTennisSportKey(sportKey)) {
    const fromYear = new Date(fromIso).getUTCFullYear();
    const toYear = new Date(toIso).getUTCFullYear();
    const years = Array.from(new Set([fromYear, toYear].filter((year) => Number.isFinite(year))));
    if (years.length === 0) {
      years.push(new Date().getUTCFullYear());
    }
    const queries: URLSearchParams[] = [];
    for (const year of years) {
      queries.push(new URLSearchParams({ per_page: perPage, season: String(year) }));
      queries.push(new URLSearchParams({ per_page: perPage, season: String(year), is_live: "true" }));
    }
    return queries;
  }
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
  countProviderCall("bdl", `/mma/v1/fighters/${id}`);
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
        winnerTeamId: winnerId || null,
        winnerTeam: winnerId === homeTeamId ? homeTeam : winnerId === awayTeamId ? awayTeam : null,
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
    const tennisMode = isTennisSportKey(sportKey);
    const id = String(event.id ?? "").trim();
    const homeId = tennisMode
      ? extractEntityId(eventRecord.player1) ||
        String(event.home_team_id ?? "").trim() ||
        String((eventRecord.home_team as Record<string, unknown> | undefined)?.id ?? "").trim()
      : String(event.home_team_id ?? "").trim() ||
        String((eventRecord.home_team as Record<string, unknown> | undefined)?.id ?? "").trim();
    const awayId = tennisMode
      ? extractEntityId(eventRecord.player2) ||
        String(event.away_team_id ?? "").trim() ||
        String((eventRecord.away_team as Record<string, unknown> | undefined)?.id ?? "").trim() ||
        String((eventRecord.visitor_team as Record<string, unknown> | undefined)?.id ?? "").trim()
      : String(event.away_team_id ?? "").trim() ||
        String((eventRecord.away_team as Record<string, unknown> | undefined)?.id ?? "").trim() ||
        String((eventRecord.visitor_team as Record<string, unknown> | undefined)?.id ?? "").trim();
    const splitNames = splitMatchName(String(event.name ?? "").trim());
    const homeTeam = tennisMode
      ? extractParticipantName(eventRecord.player1) || splitNames?.home || ""
      : String(event.home_team_name ?? "").trim() ||
        extractTeamName(eventRecord.home_team) ||
        extractTeamName(eventRecord.home_team_data) ||
        teamNameMap.get(homeId) ||
        splitNames?.home ||
        "";
    const awayTeam = tennisMode
      ? extractParticipantName(eventRecord.player2) || splitNames?.away || ""
      : String(event.away_team_name ?? "").trim() ||
        extractTeamName(eventRecord.away_team) ||
        extractTeamName(eventRecord.away_team_data) ||
        extractTeamName(eventRecord.visitor_team) ||
        teamNameMap.get(awayId) ||
        splitNames?.away ||
        "";
    const startsAt =
      extractEventStartIso(eventRecord) ||
      normalizeBallDontLieGameStartIso(
        String((eventRecord.tournament as Record<string, unknown> | undefined)?.start_date ?? "").trim()
      );

    if (!id || !homeTeam || !awayTeam || !startsAt) {
      continue;
    }
    if (sportKey === COLLEGE_FOOTBALL_SPORT_KEY && !isFbsCollegeFootballGame(eventRecord)) {
      continue;
    }

    const startsTs = new Date(startsAt).getTime();
    if (!Number.isFinite(startsTs)) {
      continue;
    }

    const homeScore = tennisMode
      ? parseScore((eventRecord.player1_game_score as number | string | null | undefined) ?? null)
      : extractHomeScore(eventRecord);
    const awayScore = tennisMode
      ? parseScore((eventRecord.player2_game_score as number | string | null | undefined) ?? null)
      : extractAwayScore(eventRecord);
    const isCompleted = isBallDontLieFinalStatus(eventRecord);
    const periodLabel =
      sportKey === COLLEGE_FOOTBALL_SPORT_KEY
        ? formatCollegeFootballPeriodLabel(eventRecord)
        : formatPeriodLabel(event.time, event.time_in_period, provider.isSoccerMatch ?? false, typeof event.period === "number" ? event.period : null);
    const tennisWinner = tennisMode ? extractTennisWinner(eventRecord) : null;

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
      winnerTeamId: tennisWinner?.winnerTeamId ?? null,
      winnerTeam: tennisWinner?.winnerTeam ?? null,
      isCompleted,
      periodLabel,
    });
  }

  return events;
}

/**
 * One sport's games from 7 days ago to 7 days ahead. `complete` is true only when every day's
 * query came back whole (none failed, none cut off at the page cap), so a game absent from
 * `events` is really absent — the only case in which settlement may act on a missing game.
 */
type PickEmScoreFetch = {
  events: Map<string, BallDontLieScoreEvent>;
  complete: boolean;
};

async function fetchScoresForSportKey(sportKey: string): Promise<PickEmScoreFetch> {
  const provider = BDL_PATH_BY_SPORT_KEY[sportKey];
  if (!provider) {
    return { events: new Map(), complete: false };
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
      return { events: new Map(), complete: false };
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
        home_team_id: fighter1Id || null,
        away_team_id: fighter2Id || null,
        winner_team_id: winnerId || null,
        winner_team: winnerId === fighter1Id ? homeTeam : winnerId === fighter2Id ? awayTeam : null,
        scores: [
          { name: homeTeam, score: homeScore },
          { name: awayTeam, score: awayScore },
        ],
      });
    }
    // MMA reads by year, not by day: never treated as complete.
    return { events: byId, complete: false };
  }

  const now = Date.now();
  const queryVariants = buildQueryVariantsForSportKey(
    sportKey,
    new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
    new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    "100"
  );

  const truncation = { truncated: false };
  const failure = { failed: false };
  const [batchResults, teamNameMap] = await Promise.all([
    Promise.allSettled(
      queryVariants.map((query) =>
        fetchBallDontLieList<BallDontLieGame>(provider.path, query, 2, truncation, failure)
      )
    ),
    fetchTeamNameMapForSportKey(sportKey),
  ]);
  const complete =
    queryVariants.length > 0 &&
    !truncation.truncated &&
    !failure.failed &&
    batchResults.every((result) => result.status === "fulfilled");

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
    const tennisMode = isTennisSportKey(sportKey);
    const splitNames = splitMatchName(String(event.name ?? "").trim());
    const homeTeam = tennisMode
      ? extractParticipantName(eventRecord.player1) || splitNames?.home || ""
      : String(event.home_team_name ?? "").trim() ||
        extractTeamName(eventRecord.home_team) ||
        extractTeamName(eventRecord.home_team_data) ||
        teamNameMap.get(String(event.home_team_id ?? "").trim()) ||
        splitNames?.home ||
        "";
    const awayTeam = tennisMode
      ? extractParticipantName(eventRecord.player2) || splitNames?.away || ""
      : String(event.away_team_name ?? "").trim() ||
        extractTeamName(eventRecord.away_team) ||
        extractTeamName(eventRecord.away_team_data) ||
        extractTeamName(eventRecord.visitor_team) ||
        teamNameMap.get(String(event.away_team_id ?? "").trim()) ||
        splitNames?.away ||
        "";
    const startsAtIso =
      extractEventStartIso(eventRecord) ||
      normalizeBallDontLieGameStartIso(
        String((eventRecord.tournament as Record<string, unknown> | undefined)?.start_date ?? "").trim()
      );
    const homeScore = tennisMode
      ? parseScore((eventRecord.player1_game_score as number | string | null | undefined) ?? null)
      : extractHomeScore(eventRecord);
    const awayScore = tennisMode
      ? parseScore((eventRecord.player2_game_score as number | string | null | undefined) ?? null)
      : extractAwayScore(eventRecord);
    const completed = isBallDontLieFinalStatus(eventRecord);
    const tennisWinner = tennisMode ? extractTennisWinner(eventRecord) : null;
    const homeTeamId = tennisMode
      ? extractEntityId(eventRecord.player1) || String(event.home_team_id ?? "").trim() || null
      : String(event.home_team_id ?? "").trim() || null;
    const awayTeamId = tennisMode
      ? extractEntityId(eventRecord.player2) || String(event.away_team_id ?? "").trim() || null
      : String(event.away_team_id ?? "").trim() || null;
    byId.set(id, {
      id,
      sport_key: sportKey,
      sport_title: provider.league,
      commence_time: startsAtIso ?? "",
      completed,
      home_team: homeTeam,
      away_team: awayTeam,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      winner_team_id: tennisWinner?.winnerTeamId ?? null,
      winner_team: tennisWinner?.winnerTeam ?? null,
      scores: [
        { name: homeTeam, score: homeScore },
        { name: awayTeam, score: awayScore },
      ],
      status: String(eventRecord.status ?? "").trim() || null,
      status_state: String(eventRecord.status_state ?? "").trim() || null,
    });
  }

  return { events: byId, complete };
}

async function probePathForDebug(sportKey: string, path: string, query: URLSearchParams): Promise<PickEmDebugProbe | null> {
  const url = `${BALLDONTLIE_API_BASE_URL}${path}?${query.toString()}`;
  if (!BALLDONTLIE_API_KEY) {
    return { sportKey, path, url, statusCode: 0, bodyPreview: "BALLDONTLIE_API_KEY missing" };
  }
  countProviderCall("bdl", path);
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

export async function getPickEmTodaySummary(params: {
  userId: string;
  venueId: string;
  localDate: string;
  tzOffsetMinutes?: number | string;
}): Promise<PickEmTodaySummary> {
  const tzOffsetMinutes = parseTimezoneOffset(params.tzOffsetMinutes);
  const range = buildUtcRangeForLocalDay(params.localDate, tzOffsetMinutes);
  const empty: PickEmTodaySummary = { localDate: range.date, picks: 0, pending: 0, correct: 0, points: 0 };
  const userId = String(params.userId ?? "").trim();
  const venueId = String(params.venueId ?? "").trim();
  if (!supabaseAdmin || !userId || !venueId) {
    return empty;
  }

  const { data, error } = await supabaseAdmin
    .from("pickem_picks")
    .select("status, reward_points")
    .eq("user_id", userId)
    .eq("venue_id", venueId)
    .neq("sport_slug", "nfl")
    .gte("starts_at", range.fromIso)
    .lte("starts_at", range.toIso);
  if (error || !data) {
    return empty;
  }

  const summary = { ...empty };
  for (const row of data as Array<{ status: PickEmPickStatus; reward_points: number | null }>) {
    summary.picks += 1;
    if (row.status === "pending") summary.pending += 1;
    if (row.status === "won") {
      summary.correct += 1;
      summary.points += Math.max(0, Number(row.reward_points ?? PICKEM_REWARD_POINTS));
    }
  }
  return summary;
}

type PickEmWinGroup = {
  userId: string;
  teams: string[];
  totalPoints: number;
  localDate: string;
  sportSlug: PickEmSportSlug;
};

type PickEmSettlementResult = {
  status: PickEmPickStatus;
  winningTeamId: string | null;
  scoringMode: NFLPickEmScoringMode | null;
  homeSpread: number | null;
  awaySpread: number | null;
};

function resolveOutrightWinningTeamId(
  row: PickEmPickRow,
  scoreEvent: BallDontLieScoreEvent,
  providerWinnerTeamId: string,
  providerWinnerTeamName: string
): string | null {
  if (providerWinnerTeamId) {
    if (row.home_team_id && providerWinnerTeamId === row.home_team_id) {
      return row.home_team_id;
    }
    if (row.away_team_id && providerWinnerTeamId === row.away_team_id) {
      return row.away_team_id;
    }
    if (row.home_team_id && providerWinnerTeamId === String(scoreEvent.home_team_id ?? "").trim()) {
      return row.home_team_id;
    }
    if (row.away_team_id && providerWinnerTeamId === String(scoreEvent.away_team_id ?? "").trim()) {
      return row.away_team_id;
    }
  }

  if (providerWinnerTeamName) {
    const winnerKey = normalizeTeamKey(providerWinnerTeamName);
    if (winnerKey && winnerKey === normalizeTeamKey(row.home_team)) {
      return row.home_team_id;
    }
    if (winnerKey && winnerKey === normalizeTeamKey(row.away_team)) {
      return row.away_team_id;
    }
  }

  return null;
}

function resolveStandardPickEmSettlement(params: {
  row: PickEmPickRow;
  scoreEvent: BallDontLieScoreEvent;
  homeScore: number | null;
  awayScore: number | null;
  providerWinnerTeamId: string;
  providerWinnerTeamName: string;
  scoringMode: NFLPickEmScoringMode | null;
}): PickEmSettlementResult {
  const { row, scoreEvent, homeScore, awayScore, providerWinnerTeamId, providerWinnerTeamName, scoringMode } = params;
  let status: PickEmPickStatus = "canceled";
  let winningTeamId = resolveOutrightWinningTeamId(row, scoreEvent, providerWinnerTeamId, providerWinnerTeamName);

  if (winningTeamId || providerWinnerTeamName) {
    const selectedTeamId = String(row.selected_team_id ?? "").trim() || null;
    if (selectedTeamId && winningTeamId) {
      status = selectedTeamId === winningTeamId ? "won" : "lost";
    } else if (providerWinnerTeamName) {
      status = normalizeTeamKey(providerWinnerTeamName) === normalizeTeamKey(row.selected_team) ? "won" : "lost";
    } else {
      status = "canceled";
    }
  } else if (homeScore !== null && awayScore !== null) {
    const winner = resolveWinner(row.home_team, row.away_team, homeScore, awayScore);
    if (winner === "tie") {
      status = "push";
    } else if (winner) {
      winningTeamId = winner === row.home_team ? row.home_team_id : row.away_team_id;
      const selectedTeamId = String(row.selected_team_id ?? "").trim() || null;
      if (selectedTeamId && winningTeamId) {
        status = selectedTeamId === winningTeamId ? "won" : "lost";
      } else {
        status = winner === row.selected_team ? "won" : "lost";
      }
    }
  }

  return {
    status,
    winningTeamId,
    scoringMode,
    homeSpread: null,
    awaySpread: null,
  };
}

function resolveSpreadPickEmSettlement(params: {
  row: PickEmPickRow;
  scoreEvent: BallDontLieScoreEvent;
  homeScore: number;
  awayScore: number;
  providerWinnerTeamId: string;
  providerWinnerTeamName: string;
  line: Pick<NFLPickEmGameLine, "homeSpread" | "awaySpread">;
}): PickEmSettlementResult {
  const { row, scoreEvent, homeScore, awayScore, providerWinnerTeamId, providerWinnerTeamName, line } = params;
  const winningTeamId =
    resolveOutrightWinningTeamId(row, scoreEvent, providerWinnerTeamId, providerWinnerTeamName) ??
    (homeScore > awayScore ? row.home_team_id : awayScore > homeScore ? row.away_team_id : null);
  // The line moves ONE side, not both. `line.awaySpread` is by construction the
  // negation of `line.homeSpread` (normalizeBDLNFLSpread in lib/nflPickEm.ts
  // derives each from the other), so adding each to its own side shifts the
  // margin by 2 × homeSpread — every pick would be graded against twice the real
  // line. Home is the adjusted side; the away score stays raw. Consequence: with
  // only one spread applied, a push is reachable only on an integer line, which
  // is exactly what a half-point line exists to guarantee.
  const homeAdjusted = homeScore + line.homeSpread;
  let status: PickEmPickStatus = "push";

  if (homeAdjusted !== awayScore) {
    const selectedSide = row.selected_side;
    const adjustedWinnerSide = homeAdjusted > awayScore ? "home" : "away";
    status = selectedSide === adjustedWinnerSide ? "won" : "lost";
  }

  return {
    status,
    winningTeamId,
    scoringMode: "spread",
    homeSpread: line.homeSpread,
    awaySpread: line.awaySpread,
  };
}

async function insertPickEmWinGroupNotifications(groups: Map<string, PickEmWinGroup>): Promise<void> {
  if (!supabaseAdmin || groups.size === 0) {
    return;
  }

  const todayUtc = new Date().toISOString().slice(0, 10);
  const rows: { user_id: string; type: string; message: string; link_url: string }[] = [];

  for (const group of groups.values()) {
    const { userId, teams, totalPoints, localDate, sportSlug } = group;
    if (teams.length === 0 || totalPoints <= 0) {
      continue;
    }

    let message: string;
    if (teams.length === 1) {
      message = `${teams[0]} won. +${totalPoints} pts.`;
    } else if (teams.length === 2) {
      message = `${teams[0]} and ${teams[1]} won. +${totalPoints} pts.`;
    } else {
      message = `${teams[0]}, ${teams[1]}, and others won. +${totalPoints} pts.`;
    }

    const isToday = localDate === todayUtc;
    const linkUrl = isToday
      ? `/pickem?date=${localDate}&sport=${sportSlug}`
      : `/pickem?date=${localDate}`;

    rows.push({ user_id: userId, type: "success", message, link_url: linkUrl });
  }

  if (rows.length === 0) {
    return;
  }

  try {
    await supabaseAdmin.from("notifications").insert(rows);
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

/**
 * Sports offered by the regular daily Pick 'Em experience. NFL has its own
 * week-based game at /nfl-pickem; keep its shared definition above because
 * settlement and legacy pick history still depend on it.
 */
export function listRegularPickEmSports(): PickEmSport[] {
  return listPickEmSports().filter((sport) => sport.slug !== "nfl");
}

/** A provider game as the Pick 'Em Prize tiebreaker needs it (lib/pickemPrizeTiebreaker.ts). */
export type PickEmProviderGame = {
  id: string;
  sportKey: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  homeScore: number | null;
  awayScore: number | null;
  isFinal: boolean;
};

/**
 * Every game the provider lists for these leagues starting in [fromIso, toIso), with the same ids
 * and the same FBS filter the games list uses. A failed provider request reads as no games (the
 * provider client swallows errors), so a caller must never treat an empty list as proof of anything.
 */
export async function listPickEmProviderGames(
  sportKeys: readonly string[],
  fromIso: string,
  toIso: string,
): Promise<PickEmProviderGame[]> {
  const fromMs = Date.parse(fromIso);
  const toMs = Date.parse(toIso);
  const settled = await Promise.allSettled(
    sportKeys.map((sportKey) =>
      fetchBallDontLieEventsForSportKey(sportKey, fromIso, toIso, getLeagueLabelForSportKey(sportKey)),
    ),
  );
  const games: PickEmProviderGame[] = [];
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const event of result.value) {
      const startsMs = Date.parse(event.startsAt);
      if (!Number.isFinite(startsMs) || startsMs < fromMs || startsMs >= toMs) continue;
      games.push({
        id: event.id,
        sportKey: event.sportKey,
        homeTeam: event.homeTeam,
        awayTeam: event.awayTeam,
        startsAt: event.startsAt,
        homeScore: event.homeScore,
        awayScore: event.awayScore,
        isFinal: event.isCompleted,
      });
    }
  }
  return games;
}

export async function listPickEmGames(params: {
  sportSlug: string;
  date?: string;
  weekStartDate?: string;
  tzOffsetMinutes?: number | string;
  userId?: string;
  venueId?: string;
  /** The pick check reads its one line itself; it never needs the list's lines. */
  skipLines?: boolean;
  /**
   * Display only (`/api/pickem/games`): a future `date` the venue's pick-ahead reach doesn't cover is served as
   * today, before any provider call (away-mode plan R9). The pick check never sets it: it must find future games.
   */
  clampToPickAhead?: boolean;
}): Promise<{
  sport: PickEmSport;
  date: string;
  games: PickEmGame[];
  today?: PickEmTodaySummary;
  /** College Football only: this venue's rule, and true when lines may be missing (provider/read failure). */
  collegeScoring?: { mode: NFLPickEmScoringMode; linesUnavailable: boolean };
  /** The venue's active Pick 'Em Prizes that cover these games (Phase 6); empty when there are none. */
  prizes?: PickEmGamePrize[];
  /** A sport with a pick window (away-mode plan B2): the first game still to start's window. */
  pickWindow?: PickEmPickWindowView;
  /** A sport with a pick window: the last local date the day arrows reach (after today), if any. */
  pickAheadThrough?: string;
  weekOptions?: Array<{ label: string; value: string }>;
  selectedWeekStartDate?: string;
  debug?: { probes: PickEmDebugProbe[] };
}> {
  const sport = getSportOrThrow(params.sportSlug);
  const tzOffsetMinutes = parseTimezoneOffset(params.tzOffsetMinutes);
  let requestedDate = params.date;
  if (params.clampToPickAhead && sport.slug !== "nfl") {
    const todayKey = getTodayDateInOffset(tzOffsetMinutes);
    const asked = parseDateString(requestedDate) ? String(requestedDate).trim() : "";
    if (asked > todayKey) {
      const reach = params.venueId?.trim()
        ? await pickAheadReach({ sportSlug: sport.slug, venueId: params.venueId, tzOffsetMinutes })
        : undefined;
      if (!reach?.pickAheadThrough || asked > reach.pickAheadThrough) requestedDate = todayKey;
    }
  }
  const dayRange = buildUtcRangeForLocalDay(requestedDate, tzOffsetMinutes);
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
    const scoreWinner = resolveWinner(event.homeTeam, event.awayTeam, homeScore, awayScore);
    const winner = event.winnerTeam ?? scoreWinner;

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

  // The college lines, the prize lines and today's summary are independent, so they run together. Lines
  // write scoringMode / homeSpread / awaySpread / lineComingSoon on each game; prizes read sportSlug,
  // sportKey, startsAt and userPickTeam and write only pickLimitReached / pickLimitMessage — no field is
  // shared. The pick check (skipLines) never needs lines or prizes, and NFL Pick 'Em has its own prize.
  const wantsLines = sport.slug === "ncaaf" && !params.skipLines;
  const wantsPrizes = !params.skipLines && sport.slug !== "nfl";
  // The pick window (B2) writes only pickWindowMessage, and its settings read is the college rule's
  // cached one (the same promise), so it joins the others.
  const wantsWindow = !params.skipLines && sport.slug !== "nfl" && Boolean(params.venueId?.trim());
  const [collegeScoring, prizes, today, pickWindowFacts] = await Promise.all([
    wantsLines
      ? applyCollegeFootballLines({
          games,
          eventsById,
          picksByGameId,
          venueId: params.venueId,
          fromIso,
          toIso,
        })
      : Promise.resolve(undefined),
    wantsPrizes
      ? loadPickEmGamePrizes({ games, venueId: params.venueId, userId: params.userId })
      : Promise.resolve([] as PickEmGamePrize[]),
    params.userId && params.venueId
      ? getPickEmTodaySummary({
          userId: params.userId.trim(),
          venueId: params.venueId.trim(),
          localDate: date,
          tzOffsetMinutes,
        }).catch(() => undefined)
      : Promise.resolve(undefined),
    wantsWindow
      ? applyPickWindowToGames({ games, sportSlug: sport.slug, venueId: params.venueId ?? "", tzOffsetMinutes })
      : Promise.resolve(undefined),
  ]);

  // The empty-day probe (uncached provider calls, never shown on screen) runs for today and earlier
  // only, so pick-ahead days (B2) add none.
  let debug: { probes: PickEmDebugProbe[] } | undefined;
  if (games.length === 0 && date <= getTodayDateInOffset(tzOffsetMinutes)) {
    const probes: PickEmDebugProbe[] = [];
    for (const sportKey of sportKeys) {
      const paths = getPathVariantsForSportKey(sportKey);
      const queries = buildQueryVariantsForSportKey(sportKey, fromIso, toIso, "5");
      for (const path of paths) {
        for (const query of queries) {
          const probe = await probePathForDebug(sportKey, path, query);
          if (probe) probes.push(probe);
        }
      }
    }
    debug = { probes };
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
    today,
    weekOptions,
    selectedWeekStartDate,
    collegeScoring,
    prizes,
    pickWindow: pickWindowFacts?.pickWindow,
    pickAheadThrough: pickWindowFacts?.pickAheadThrough,
    debug,
  };
}

/**
 * Pick ahead (away-mode plan B2), in place: a game not yet started whose window is shut gets its words
 * (`pickWindowMessage`), and the list gets the first game's window and how far ahead the day arrows reach.
 * A sport with no window (or no readable settings) gets nothing, so it stays today-only. No provider call:
 * one cached settings read (shared with the college rule) and the cached time zone, only with a window.
 */
const applyPickWindowToGames = async (params: {
  games: PickEmGame[];
  sportSlug: PickEmSportSlug;
  venueId: string;
  tzOffsetMinutes: number;
}): Promise<{ pickWindow?: PickEmPickWindowView; pickAheadThrough?: string } | undefined> => {
  const reach = await pickAheadReach(params);
  if (!reach) return undefined;
  const { window, timeZone, nowMs } = reach;
  const { view, closedLines } = pickWindowViewForGames({ window, games: params.games, nowMs, timeZone });
  for (const game of params.games) {
    const line = closedLines.get(game.id);
    if (line) game.pickWindowMessage = line;
  }
  return { pickWindow: view ?? undefined, pickAheadThrough: reach.pickAheadThrough };
};

/**
 * How far ahead the day arrows reach for a sport at a venue (R9): the sport's pick window and the last local
 * date after today it reaches. Undefined = no window (or no readable settings): today only. No provider call;
 * the settings read is the 30 s display cache and the time zone is cached too.
 */
const pickAheadReach = async (params: {
  sportSlug: PickEmSportSlug;
  venueId: string;
  tzOffsetMinutes: number;
}): Promise<
  | { window: NonNullable<NonNullable<VenueGameSettings["pickWindows"]>[PickEmSportSlug]>; timeZone: string; nowMs: number; pickAheadThrough?: string }
  | undefined
> => {
  const settings = await readVenueGameSettingsForDisplay(params.venueId);
  const window = settings?.pickWindows?.[params.sportSlug];
  if (!window) return undefined;
  const timeZone = await getVenueTimezone(params.venueId);
  const nowMs = Date.now();
  const horizonKey = toLocalDateKey(new Date(pickAheadHorizonMs({ window, nowMs, timeZone })).toISOString(), params.tzOffsetMinutes);
  const todayKey = getTodayDateInOffset(params.tzOffsetMinutes);
  return { window, timeZone, nowMs, pickAheadThrough: horizonKey > todayKey ? horizonKey : undefined };
};

const SETTINGS_DISPLAY_CACHE_TTL_MS = 30_000;
const settingsDisplayCache = new Map<string, { value: Promise<VenueGameSettings>; expiresAtMs: number }>();

/** Test hook: forget the cached display settings (the college rule and the pick windows). */
export function clearCollegeScoringModeDisplayCache(): void {
  settingsDisplayCache.clear();
}

/**
 * The venue's Game Settings for DISPLAY only (the college rule and the pick windows, B2): cached 30 s per
 * venue per instance, one read shared by both. A failed read is not cached and reads as null (the list
 * shows the default rule and no window). Pick writes never use this: `submitPickEmPick` reads fresh.
 */
const readVenueGameSettingsForDisplay = async (venueId: string | undefined): Promise<VenueGameSettings | null> => {
  const normalized = String(venueId ?? "").trim();
  if (!normalized) return null;
  const nowMs = Date.now();
  const cached = settingsDisplayCache.get(normalized);
  let value = cached && cached.expiresAtMs > nowMs ? cached.value : null;
  if (!value) {
    for (const [key, entry] of settingsDisplayCache) if (entry.expiresAtMs <= nowMs) settingsDisplayCache.delete(key);
    value = getVenueGameSettings(normalized);
    settingsDisplayCache.set(normalized, { value, expiresAtMs: nowMs + SETTINGS_DISPLAY_CACHE_TTL_MS });
  }
  try {
    return await value;
  } catch (error) {
    if (settingsDisplayCache.get(normalized)?.value === value) settingsDisplayCache.delete(normalized);
    console.warn(`[Pick 'Em] Could not read Game Settings for venue ${normalized}; showing the defaults.`, error);
    return null;
  }
};

/**
 * College Football games, in place: each gets the rule it is played by (the player's own pick's
 * stamped rule once picked, else the venue's), and in spread mode its line, or "Line coming soon"
 * (can't be picked) while a not-yet-started game has none. Lines are refreshed only in spread mode.
 * The line shown is the one the player's pick is graded by (`lineShownForGame`, away-mode plan R2): the
 * line on the pick's row; a pick without one, the global line; no pick, this bar's frozen line (a bar with
 * a College Football pick window, B3: frozen here the first time a game is shown inside its open window),
 * else the global line.
 */
async function applyCollegeFootballLines(params: {
  games: PickEmGame[];
  eventsById: Map<string, NormalizedBallDontLieEvent>;
  picksByGameId: Map<string, PickEmPickRow>;
  venueId: string | undefined;
  fromIso: string;
  toIso: string;
}): Promise<{ mode: NFLPickEmScoringMode; linesUnavailable: boolean }> {
  const settings = await readVenueGameSettingsForDisplay(params.venueId);
  const mode = settings?.cfbPickEmScoringMode ?? DEFAULT_CFB_PICKEM_SCORING_MODE;
  const pickModeOf = (game: PickEmGame): NFLPickEmScoringMode => {
    const pick = params.picksByGameId.get(game.id);
    return pick?.scoring_mode ?? mode;
  };
  const spreadGames = params.games.filter((game) => pickModeOf(game) === "spread");

  let lines = new Map<string, PickEmGameLine>();
  let linesUnavailable = false;
  if (spreadGames.length > 0) {
    try {
      const result = await loadPickEmGameLines({
        sportKey: COLLEGE_FOOTBALL_SPORT_KEY,
        games: Array.from(params.eventsById.values()).filter((event) => event.sportKey === COLLEGE_FOOTBALL_SPORT_KEY),
        fromIso: params.fromIso,
        toIso: params.toIso,
      });
      lines = result.lines;
      linesUnavailable = result.refreshFailed;
    } catch (error) {
      // The read itself failed (e.g. the table is not there yet): games still show, none can be
      // picked against a spread until a line is readable.
      console.warn("[Pick 'Em] Could not read college spread lines; showing games without lines.", error);
      linesUnavailable = true;
    }
  }

  const venueId = String(params.venueId ?? "").trim();
  const window = settings?.pickWindows?.ncaaf;
  let frozen = new Map<string, PickEmFrozenLine>();
  if (window && venueId && spreadGames.length > 0) {
    try {
      frozen = await applyVenueFrozenLines({
        venueId,
        sportKey: COLLEGE_FOOTBALL_SPORT_KEY,
        window,
        timeZone: await getVenueTimezone(venueId),
        games: spreadGames,
        globalLines: lines,
      });
    } catch (error) {
      // The pick freezes (or refuses) on its own, so the list keeps the global lines on screen.
      console.warn(`[Pick 'Em] Could not freeze college lines for venue ${venueId}; showing the global lines.`, error);
      linesUnavailable = true;
    }
  }

  for (const game of params.games) {
    const gameMode = pickModeOf(game);
    game.scoringMode = gameMode;
    if (gameMode !== "spread") continue;
    const pick = params.picksByGameId.get(game.id);
    const line = lineShownForGame({ pick, frozen: frozen.get(game.id), global: lines.get(game.id) });
    game.homeSpread = line?.homeSpread ?? null;
    game.awaySpread = line?.awaySpread ?? null;
    game.lineComingSoon = !line && !game.isLocked;
  }

  return { mode, linesUnavailable };
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
    skipLines: true,
  });

  const game = gameList.games.find((entry) => entry.id === gameId);
  if (!game) {
    throw new Error("Game not found for selected date/sport.");
  }

  // The bar's rules, read once and fresh: the sport's pick window (away-mode plan B1; a failed read
  // leaves picks open) and, below, the college rule stamped on a new pick (a failed read refuses it).
  const settings = await readVenueGameSettingsForPick(venueId);
  const pickWindows = settings?.pickWindows ?? null;

  // Today only, unless the sport has a pick window (B2): then the window decides, and an open window
  // covers games only until its next opening (under a week). A failed settings read keeps today-only.
  const gameLocalDate = toLocalDateKey(game.startsAt, tzOffsetMinutes);
  const todayLocalDate = getTodayDateInOffset(tzOffsetMinutes);
  if (!pickWindows?.[game.sportSlug] && gameLocalDate !== todayLocalDate) {
    throw new Error("You can only place picks for today.");
  }

  if (game.isLocked) {
    throw new Error("Picks are locked for this game because it has already started.");
  }

  if (pickTeam !== game.homeTeam && pickTeam !== game.awayTeam) {
    throw new Error("pickTeam must match one of the teams in this game.");
  }

  await assertPickEmPickWindowOpen({
    venueId,
    sportSlug: game.sportSlug,
    startsAt: game.startsAt,
    windows: pickWindows,
  });

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
  }

  // College Football: the venue's rule when the pick is first made is stamped on it and decides
  // its grade (plan §4); switching sides keeps that rule. A spread pick needs a saved line, and a NEW
  // pick at a bar with a pick window records the bar's frozen line, which grades it (away-mode plan B3).
  // A pick's line is set when it is made (R8): only the insert writes it, never a side switch.
  const { scoringMode, frozenLine } = await resolvePickScoringMode({ game, venueId, existing, settings });
  const lineColumns = frozenLine ? frozenLinePickColumns(frozenLine) : {};

  // A bar's "X out of N" Pick 'Em Prize gives each player N picks in its games (plan D5). Only a new
  // pick can use one up: switching sides on an existing pick never counts.
  if (!existing) {
    const limit = await checkPickEmPrizePickLimit({ userId, venueId, game });
    if (!limit.ok) throw new Error(limit.message);
  }

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from("pickem_picks")
      .update({
        selected_team: pickTeam,
        selected_side: selectedSide,
        game_label: gameLabel,
        league: game.league,
        sport_key: game.sportKey,
        selected_team_id: selectedTeamId,
        ...(scoringMode ? { scoring_mode: scoringMode } : {}),
        // No line columns (R8): a recorded line stays, and a pick without one stays on the global
        // line, which is what the list shows (R2) and what settlement grades it by.
      })
      .eq("id", existing.id)
      .select(PICKEM_PICK_SELECT)
      .single<PickEmPickRow>();

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to update Pick 'Em pick.");
    }

    return mapPickRow(data);
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
      ...(scoringMode ? { scoring_mode: scoringMode } : {}),
      ...lineColumns,
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

/**
 * The rule a college pick is stamped with (null for every other sport). An existing pick keeps its
 * stamp. A new one takes the venue's rule from the pick's one settings read; if that read failed
 * (`settings` null) the pick is refused rather than stamped with a guess. In spread mode the game must
 * already have a saved line (new pick or side switch). At a bar with a College Football pick window (B3)
 * a NEW spread pick also gets the bar's frozen line (frozen now if the list didn't), which the pick
 * records and is graded by; if it can't be frozen the pick is refused, so no windowed pick is saved
 * without it. A side switch never gets one (R8): the pick keeps the line it was made with.
 */
async function resolvePickScoringMode(params: {
  game: PickEmGame;
  venueId: string;
  existing: PickEmPickRow | null;
  settings: VenueGameSettings | null;
}): Promise<{ scoringMode: NFLPickEmScoringMode | null; frozenLine: PickEmFrozenLine | null }> {
  if (!isSpreadLineSportKey(params.game.sportKey)) return { scoringMode: null, frozenLine: null };

  let mode = params.existing?.scoring_mode ?? null;
  if (!mode) {
    if (!params.settings) {
      console.warn(`[Pick 'Em] Could not read the college rule for venue ${params.venueId}; refusing the pick.`);
      throw new Error("We couldn't load this bar's Pick 'Em rules. Please try again.");
    }
    mode = params.settings.cfbPickEmScoringMode;
  }
  if (mode !== "spread") return { scoringMode: mode, frozenLine: null };

  let line: PickEmGameLine | null = null;
  try {
    line = await readPickEmGameLine(params.game.sportKey, params.game.id);
  } catch (error) {
    console.warn(`[Pick 'Em] Could not read the line for game ${params.game.id}.`, error);
  }
  if (!line) {
    throw new Error(COLLEGE_FOOTBALL_SPREAD_COPY.noLineYet);
  }

  // R8: only a new pick takes a line. Clearing a pick and making it again is a new pick.
  if (params.existing || !params.settings?.pickWindows?.[params.game.sportSlug]) {
    return { scoringMode: mode, frozenLine: null };
  }
  let frozenLine: PickEmFrozenLine | null = null;
  try {
    frozenLine = await frozenLineForPick({
      venueId: params.venueId,
      sportKey: params.game.sportKey,
      game: params.game,
      globalLine: line,
    });
  } catch (error) {
    console.warn(`[Pick 'Em] frozen-line-failed venue=${params.venueId} game=${params.game.id}; refusing the pick.`, error);
    throw new Error(PICKEM_FROZEN_LINE_FAILED_MESSAGE);
  }
  // Null only when the game started meanwhile (the database clock); the kickoff lock speaks for it.
  if (!frozenLine) throw new Error("Picks are locked for this game because it has already started.");
  return { scoringMode: mode, frozenLine };
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
    .select("id, starts_at, status, venue_id, sport_slug")
    .eq("user_id", userId)
    .eq("game_id", gameId)
    .maybeSingle<{ id: string; starts_at: string; status: PickEmPickStatus; venue_id: string; sport_slug: string }>();

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

  // Clearing follows the same pick window as making it (away-mode plan B1).
  await assertPickEmPickWindowOpenAtVenue({
    venueId: existing.venue_id,
    sportSlug: existing.sport_slug,
    startsAt: existing.starts_at,
  });

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

/**
 * A pending pick whose game started this long ago can never be graded: the score fetch only looks
 * 7 days back (`fetchScoresForSportKey`). It is cancelled instead (Phase 7.4, F4), or such picks
 * pile up at the head of the oldest-first read and, past the page cap, nobody is graded or paid.
 */
export const PICKEM_UNFINDABLE_PENDING_MS = 8 * 24 * 60 * 60 * 1000;

/** Rows per page of the pending read. */
export const PICKEM_SETTLE_PAGE_SIZE = 500;

/**
 * Most pages of started pending picks one settlement reads (Phase 7.5.2, F14): picks that may
 * legitimately wait up to 48 h (no locked line, "post" but not final) sit at the head of the
 * oldest-first read, so one page alone could hide every later finished game. A normal run is one read.
 */
export const PICKEM_SETTLE_PAGE_CAP = 6;

/**
 * Grade pending picks whose games have started, then pay every correct pick its 10 points
 * (payPickEmPoints, lib/pickemPoints.ts).
 *
 * Who pays (Phase 7.5.2, F15): a global call (the every-minute cron and the balldontlie webhook,
 * no `userId`) always pays, even when it graded nothing, so a pick whose payment failed or was cut
 * off by the batch cap is retried within a minute. A player's own call (the games and picks
 * screens, `userId` set) pays only when it graded a win itself — otherwise every screen load and
 * every 60-second live poll would run a write transaction for nothing; `payout` is then null.
 */
export async function settlePendingPickEmPicks(params: { userId?: string } = {}): Promise<{
  pendingScanned: number;
  settledCount: number;
  won: number;
  lost: number;
  push: number;
  scoringModeUnresolvedSkipped: number;
  payout: PickEmPayoutReport | null;
}> {
  if (!supabaseAdmin) {
    return {
      pendingScanned: 0,
      settledCount: 0,
      won: 0,
      lost: 0,
      push: 0,
      scoringModeUnresolvedSkipped: 0,
      payout: null,
    };
  }

  const admin = supabaseAdmin;
  const nowIso = new Date().toISOString();
  const userId = String(params.userId ?? "").trim();

  // Keyset pages ordered by (starts_at, id): `id` breaks ties, so a game with more picks than a
  // page is still read once each, never skipped or repeated.
  const readPendingPage = async (after: { startsAt: string; id: string } | null): Promise<PickEmPickRow[]> => {
    let query = admin
      .from("pickem_picks")
      .select(PICKEM_PICK_SELECT)
      .eq("status", "pending")
      .lte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(PICKEM_SETTLE_PAGE_SIZE);
    if (userId) {
      query = query.eq("user_id", userId);
    }
    if (after) {
      query = query.or(
        `starts_at.gt."${after.startsAt}",and(starts_at.eq."${after.startsAt}",id.gt."${after.id}")`
      );
    }

    const { data, error } = await query;
    if (error) {
      if (isMissingPickEmTablesError(error)) {
        throw new Error(PICKEM_TABLES_MISSING_ERROR);
      }
      throw new Error(error.message ?? "Failed to load pending Pick 'Em picks.");
    }
    return (data ?? []) as PickEmPickRow[];
  };

  let pending = await readPendingPage(null);

  // The read is oldest first, so only when its first row is past the score window is there anything
  // to cancel: a normal run pays no extra request. One update cancels them all, then read again.
  // Only the first page is checked: a stale pick always sorts ahead of every fresh one.
  const unfindableCutoffMs = Date.parse(nowIso) - PICKEM_UNFINDABLE_PENDING_MS;
  const oldestStartsAtMs = pending.length > 0 ? Date.parse(pending[0].starts_at) : Number.NaN;
  if (Number.isFinite(oldestStartsAtMs) && oldestStartsAtMs < unfindableCutoffMs) {
    let cancelQuery = admin
      .from("pickem_picks")
      .update({
        status: "canceled",
        winning_team_id: null,
        resolved_at: nowIso,
        reward_points: PICKEM_REWARD_POINTS,
      })
      .eq("status", "pending")
      .lt("starts_at", new Date(unfindableCutoffMs).toISOString());
    if (userId) {
      cancelQuery = cancelQuery.eq("user_id", userId);
    }
    const { data: canceledRows, error: cancelError } = await cancelQuery.select("id, starts_at");
    if (cancelError) {
      console.error("[Pick 'Em] stale-pending-cancel-failed", cancelError.message ?? cancelError);
    } else {
      const canceled = (canceledRows ?? []) as Array<{ id: string; starts_at: string }>;
      const oldest = canceled.reduce<string | null>(
        (min, row) => (min === null || Date.parse(row.starts_at) < Date.parse(min) ? row.starts_at : min),
        null
      );
      console.warn(
        `[Pick 'Em] stale-pending-canceled count=${canceled.length} oldest=${oldest ?? "none"} (game started over 8 days ago; outside the score window)`
      );
      pending = await readPendingPage(null);
    }
  }

  // Collect every page first, so each sport's scores are still fetched once per run.
  let lastPage = pending;
  let pagesRead = 1;
  while (lastPage.length === PICKEM_SETTLE_PAGE_SIZE && pagesRead < PICKEM_SETTLE_PAGE_CAP) {
    const last = lastPage[lastPage.length - 1];
    lastPage = await readPendingPage({ startsAt: last.starts_at, id: last.id });
    pagesRead += 1;
    pending = pending.concat(lastPage);
  }
  if (lastPage.length === PICKEM_SETTLE_PAGE_SIZE) {
    console.warn(`[Pick 'Em] settle-page-cap scanned=${pending.length} oldest=${pending[0]?.starts_at ?? "none"}`);
  }

  if (pending.length === 0) {
    return {
      pendingScanned: 0,
      settledCount: 0,
      won: 0,
      lost: 0,
      push: 0,
      scoringModeUnresolvedSkipped: 0,
      // A player's own call has nothing to pay; a global one still pays (retries, F15).
      payout: userId ? null : await payPickEmPoints({ userId }),
    };
  }

  const uniqueSportKeys = Array.from(new Set(pending.map((row) => row.sport_key).filter(Boolean)));
  const scoresBySportKey = new Map<string, PickEmScoreFetch>();

  const scoresSettled = await Promise.allSettled(uniqueSportKeys.map((sportKey) => fetchScoresForSportKey(sportKey)));
  for (let i = 0; i < scoresSettled.length; i += 1) {
    const settled = scoresSettled[i];
    const sportKey = uniqueSportKeys[i];
    if (settled.status === "fulfilled") {
      scoresBySportKey.set(sportKey, settled.value);
    }
  }

  const nflVenueIds = Array.from(
    new Set(pending.filter((row) => row.sport_slug === "nfl").map((row) => row.venue_id).filter(Boolean))
  );
  const nflScoringModes = new Map<string, NFLPickEmScoringMode>();
  const nflModeResults = await Promise.allSettled(
    nflVenueIds.map((venueId) => getVenueNFLPickEmScoringMode(venueId))
  );
  for (let i = 0; i < nflModeResults.length; i += 1) {
    const result = nflModeResults[i];
    if (result.status === "fulfilled") {
      nflScoringModes.set(nflVenueIds[i], result.value);
    }
  }

  const nflLineCache = new Map<string, Promise<NFLPickEmGameLine | null>>();
  const getLockedNFLLine = async (gameId: string): Promise<NFLPickEmGameLine | null> => {
    if (!nflLineCache.has(gameId)) {
      nflLineCache.set(
        gameId,
        getLockedNFLPickEmGameLineForSettlement(gameId).catch(() => null)
      );
    }
    return nflLineCache.get(gameId)!;
  };

  // College spread picks: lock their lines at kickoff (one call; never fetches or creates a line).
  // A failed lock read leaves those picks waiting; it must never run down the 48-hour cancel. A pick that
  // recorded its bar's frozen line (away-mode plan B3) is graded by that and needs no lock.
  const collegeSpreadGameIds = pending
    .filter((row) => row.sport_key === COLLEGE_FOOTBALL_SPORT_KEY && row.scoring_mode === "spread" && !recordedPickLine(row))
    .map((row) => row.game_id);
  let collegeLines = new Map<string, PickEmGameLine>();
  let collegeLinesReadFailed = false;
  if (collegeSpreadGameIds.length > 0) {
    try {
      collegeLines = await lockPickEmGameLinesForSettlement(COLLEGE_FOOTBALL_SPORT_KEY, collegeSpreadGameIds);
    } catch (error) {
      collegeLinesReadFailed = true;
      console.warn("[Pick 'Em] Could not lock college spread lines; leaving college spread picks pending this sweep.", error);
    }
  }

  let settledCount = 0;
  let won = 0;
  let lost = 0;
  let push = 0;
  let scoringModeUnresolvedSkipped = 0;
  const winGroups = new Map<string, PickEmWinGroup>();
  // One warning per stalled game, not per pick on it.
  const spreadStallWarned = new Set<string>();
  // One warning per venue whose scoring-mode read failed, not per pick at that venue.
  const scoringModeUnresolvedWarned = new Set<string>();
  // One warning per college game the provider calls "post" that isn't a final we grade.
  const collegeNotFinalWarned = new Set<string>();
  const staleFinalizeMs = 4 * 60 * 60 * 1000;
  const nowMs = Date.now();

  const recordSettlement = async (
    row: PickEmPickRow,
    settlement: PickEmSettlementResult,
    homeScore: number | null,
    awayScore: number | null
  ): Promise<void> => {
    const { data: updatedRows, error: updateError } = await admin
      .from("pickem_picks")
      .update({
        status: settlement.status,
        home_score: homeScore,
        away_score: awayScore,
        winning_team_id: settlement.winningTeamId,
        scoring_mode: settlement.scoringMode,
        home_spread: settlement.homeSpread,
        away_spread: settlement.awaySpread,
        resolved_at: new Date().toISOString(),
        reward_points: PICKEM_REWARD_POINTS,
      })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id");

    // No row changed: a concurrent run (cron, webhook, player screen) graded this pick first (F23).
    if (updateError || !updatedRows || updatedRows.length === 0) {
      return;
    }

    if (settlement.status === "won") {
      won += 1;
      const localDate = row.starts_at.slice(0, 10);
      const groupKey = `${row.user_id}:${localDate}:${row.sport_slug}`;
      const existing = winGroups.get(groupKey);
      if (existing) {
        existing.teams.push(row.selected_team);
        existing.totalPoints += PICKEM_REWARD_POINTS;
      } else {
        winGroups.set(groupKey, {
          userId: row.user_id,
          teams: [row.selected_team],
          totalPoints: PICKEM_REWARD_POINTS,
          localDate,
          sportSlug: row.sport_slug,
        });
      }
    } else if (settlement.status === "lost") {
      lost += 1;
    } else if (settlement.status === "push") {
      push += 1;
    }

    settledCount += 1;
  };

  for (const row of pending) {
    const scoreFetch = scoresBySportKey.get(row.sport_key);
    const scoreMap = scoreFetch?.events;
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
      // A college pick whose game the provider no longer lists still gets its 48-hour cancel, but
      // only on a complete fetch (an outage reads as "no games"). Other sports: the 8-day cancel above.
      if (
        row.sport_key === COLLEGE_FOOTBALL_SPORT_KEY &&
        collegeFootballMissingGameGate({
          scoresComplete: scoreFetch?.complete === true,
          startsAtMs: Date.parse(row.starts_at),
          nowMs,
        }) === "cancel"
      ) {
        console.warn(
          `[Pick 'Em] Canceling college pick ${row.id} (game ${row.game_id}): the provider has no such game 48 hours after kickoff.`
        );
        await recordSettlement(
          row,
          { status: "canceled", winningTeamId: null, scoringMode: row.scoring_mode ?? null, homeSpread: null, awaySpread: null },
          null,
          null
        );
      }
      continue;
    }

    const homeScore = getTeamScore(scoreEvent.scores, row.home_team);
    const awayScore = getTeamScore(scoreEvent.scores, row.away_team);
    const providerWinnerTeamId = String(scoreEvent.winner_team_id ?? "").trim();
    const providerWinnerTeamName = String(scoreEvent.winner_team ?? "").trim();
    const startsAtMs = Date.parse(row.starts_at);
    const isStale = Number.isFinite(startsAtMs) && nowMs - startsAtMs >= staleFinalizeMs;
    const canFinalizeFromScores = homeScore !== null && awayScore !== null && isStale;
    const canFinalizeFromProviderWinner = providerWinnerTeamId.length > 0 || providerWinnerTeamName.length > 0;
    const collegeGate =
      row.sport_key === COLLEGE_FOOTBALL_SPORT_KEY
        ? collegeFootballGradeGate({
            status: scoreEvent.status ?? null,
            statusState: scoreEvent.status_state ?? null,
            homeScore,
            awayScore,
            startsAtMs,
            nowMs,
          })
        : null;
    if (collegeGate === "wait") {
      // The provider calls it over but it isn't a final we grade (a 0–0 "final", an unknown
      // status_state): say so once per game, so a feed change can't run picks into the 48-hour cancel unseen.
      if (String(scoreEvent.status ?? "").trim().toLowerCase() === "post" && !collegeNotFinalWarned.has(row.game_id)) {
        collegeNotFinalWarned.add(row.game_id);
        console.warn(
          `[Pick 'Em] College game ${row.game_id} is "post" but not a gradeable final (status_state ${JSON.stringify(scoreEvent.status_state ?? null)}, score ${homeScore ?? "?"}–${awayScore ?? "?"}); waiting (cancelled 48 h after kickoff).`
        );
      }
      continue;
    }
    if (collegeGate === null && !scoreEvent.completed && !canFinalizeFromScores && !canFinalizeFromProviderWinner) {
      continue;
    }

    const nflScoringMode = row.sport_slug === "nfl" ? nflScoringModes.get(row.venue_id) ?? null : null;
    // College picks carry the rule stamped when they were made (null only on rows from before it existed).
    const collegeScoringMode = row.sport_key === COLLEGE_FOOTBALL_SPORT_KEY ? row.scoring_mode ?? null : null;
    if (row.sport_slug === "nfl" && !nflScoringMode) {
      // The venue's scoring-mode read failed (rejected out of the
      // Promise.allSettled above), not "this venue has no mode" — that read
      // almost certainly succeeds on the next sweep, unlike a missing line
      // row. So: leave the pick pending, don't void it, and don't fall back
      // to "standard" (that would grade a spread venue under the wrong
      // rules). Just make the skip observable instead of silent.
      scoringModeUnresolvedSkipped += 1;
      if (!scoringModeUnresolvedWarned.has(row.venue_id)) {
        scoringModeUnresolvedWarned.add(row.venue_id);
        console.warn(
          `[Pick 'Em] Could not resolve NFL scoring mode for venue ${row.venue_id}; leaving its pending picks unsettled this sweep.`
        );
      }
      continue;
    }

    // B3: the line a pending spread pick recorded at a windowed bar, which grades it (null otherwise).
    const recordedLine = recordedPickLine(row);
    let settlement: PickEmSettlementResult;
    if (collegeGate === "cancel" || collegeGate === "called_off") {
      console.warn(
        collegeGate === "called_off"
          ? `[Pick 'Em] Canceling college pick ${row.id} (game ${row.game_id}): the provider says ${JSON.stringify(scoreEvent.status_state ?? scoreEvent.status ?? null)}.`
          : `[Pick 'Em] Canceling college pick ${row.id} (game ${row.game_id}): no final 48 hours after kickoff.`
      );
      settlement = {
        status: "canceled",
        winningTeamId: null,
        scoringMode: collegeScoringMode,
        homeSpread: null,
        awaySpread: null,
      };
    } else if (collegeScoringMode === "spread" && homeScore !== null && awayScore !== null && recordedLine) {
      // B3: the line this pick was made against at a windowed bar (frozen for the bar, never changed).
      settlement = resolveSpreadPickEmSettlement({
        row,
        scoreEvent,
        homeScore,
        awayScore,
        providerWinnerTeamId,
        providerWinnerTeamName,
        line: recordedLine,
      });
    } else if (collegeScoringMode === "spread" && homeScore !== null && awayScore !== null) {
      const line = collegeLines.get(row.game_id) ?? null;
      const lineGate = collegeLinesReadFailed
        ? "wait"
        : collegeFootballSpreadLineGate({ hasLockedLine: line !== null, startsAtMs, nowMs });
      if (lineGate === "wait") {
        if (!spreadStallWarned.has(row.game_id)) {
          spreadStallWarned.add(row.game_id);
          console.warn(`[Pick 'Em] College spread game ${row.game_id} is final but has no locked line; leaving picks pending.`);
        }
        continue;
      }
      if (lineGate === "cancel" || !line) {
        console.warn(`[Pick 'Em] Canceling college spread pick ${row.id} (game ${row.game_id}): no locked line 48 hours after kickoff.`);
        settlement = { status: "canceled", winningTeamId: null, scoringMode: "spread", homeSpread: null, awaySpread: null };
      } else {
        settlement = resolveSpreadPickEmSettlement({
          row,
          scoreEvent,
          homeScore,
          awayScore,
          providerWinnerTeamId,
          providerWinnerTeamName,
          line,
        });
      }
    } else if (nflScoringMode === "spread") {
      // B3: a pick made at a windowed bar is graded by the line it recorded; others by the kickoff lock.
      const line =
        homeScore !== null && awayScore !== null
          ? recordedLine ?? (await getLockedNFLLine(row.game_id))
          : null;
      if (homeScore === null || awayScore === null || !line) {
        // A spread pick needs BOTH final scores and the line that was locked at
        // kickoff, and either can be permanently absent:
        //
        //  - The line row is only ever written *before* kickoff
        //    (refreshNFLPickEmGameLines skips games that have already started),
        //    so if nobody loaded that week's games page in time — or the odds
        //    provider had no spread for that game at that moment — no later
        //    sweep can create it. Retrying is futile.
        //  - Scores can be permanently missing too: we only get here when the
        //    provider already calls the game final (or names a winner), so a
        //    null score at this point is a provider data gap, not a game still
        //    in progress.
        //
        // Skipping unconditionally (the old behaviour) left the pick `pending`
        // forever with no error anywhere.
        //
        // Policy: keep retrying while the game is fresh, so a transient gap
        // that closes on its own still grades correctly; once past
        // staleFinalizeMs, void the pick as `canceled` — the same terminal
        // status the standard path already writes when it cannot determine a
        // winner. Voiding is honest (we cannot grade against a line we never
        // recorded), symmetric across every player on that game, and awards
        // nothing either way: reward accrual and automatic payment
        // (pay_pickem_points) both key on `won` only. Grading it straight-up instead would score a player who
        // picked against the spread by a rule they never played by.
        const missing = homeScore === null || awayScore === null ? "final scores" : "a locked spread line";
        if (!isStale) {
          if (!spreadStallWarned.has(row.game_id)) {
            spreadStallWarned.add(row.game_id);
            console.warn(
              `[Pick 'Em] Spread game ${row.game_id} is missing ${missing}; leaving picks pending until the staleness window passes.`
            );
          }
          continue;
        }
        console.warn(
          `[Pick 'Em] Voiding spread pick ${row.id} (game ${row.game_id}): ${missing} never arrived within the staleness window.`
        );
        settlement = {
          status: "canceled",
          // No winner is recorded: we could not apply the spread, so naming a
          // straight-up winner here would imply a grade that never happened.
          winningTeamId: null,
          scoringMode: "spread",
          homeSpread: null,
          awaySpread: null,
        };
      } else {
        settlement = resolveSpreadPickEmSettlement({
          row,
          scoreEvent,
          homeScore,
          awayScore,
          providerWinnerTeamId,
          providerWinnerTeamName,
          line,
        });
      }
    } else {
      settlement = resolveStandardPickEmSettlement({
        row,
        scoreEvent,
        homeScore,
        awayScore,
        providerWinnerTeamId,
        providerWinnerTeamName,
        scoringMode: nflScoringMode ?? collegeScoringMode,
      });
    }

    await recordSettlement(row, settlement, homeScore, awayScore);
  }

  await insertPickEmWinGroupNotifications(winGroups);
  // A player's own call pays only the win it just graded; a global call always pays (F15).
  const payout = userId && won === 0 ? null : await payPickEmPoints({ userId });

  return {
    pendingScanned: pending.length,
    settledCount,
    won,
    lost,
    push,
    scoringModeUnresolvedSkipped,
    payout,
  };
}
