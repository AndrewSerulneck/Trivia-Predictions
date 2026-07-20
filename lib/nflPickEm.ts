import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchBallDontLieList } from "@/lib/balldontlie";
import { getLocalDateKey } from "@/lib/timezone";
import { type PickEmPick, type PickEmGame } from "@/lib/pickem";

// ============================================
// CONSTANTS
// ============================================

const NFL_PICKEM_SPORT_KEY = "americanfootball_nfl";
const NFL_PICKEM_LEAGUE = "NFL";
const NFL_PICKEM_SPORT_SLUG = "nfl" as const;
const PICKEM_REWARD_POINTS = 10;
const PICKEM_LOCK_GRACE_MS = 0;

// ============================================
// TYPES
// ============================================

export type NFLWeek = {
  id: string;
  season: number;
  weekNumber: number;
  weekType: "preseason" | "regular" | "postseason";
  displayLabel: string | null;
  weekStartDate: string; // YYYY-MM-DD (Thursday)
  weekEndDate: string;   // YYYY-MM-DD (Monday)
  thursdayKickoff: string | null; // ISO timestamp
  status: "upcoming" | "open" | "locked" | "complete";
  gamesCount: number;
  syncedAt: string | null;
};

export type NFLPickEmGame = PickEmGame & {
  nflWeekId: string;
  weekNumber: number;
  isThursdayGame: boolean;
  isSundayGame: boolean;
  isMondayGame: boolean;
};

export type NFLUserWeekSummary = {
  id: string;
  weekId: string;
  weekNumber: number;
  weekStartDate: string;
  weekEndDate: string;
  status: string;
  picksCount: number;
  correctPicks: number;
  incorrectPicks: number;
  totalPoints: number;
  isComplete: boolean;
  isLocked: boolean;
  lockTime: string | null;
};

export type NFLWeekOption = {
  id: string;
  weekNumber: number;
  weekType: NFLWeek["weekType"];
  label: string;
  weekStartDate: string;
  weekEndDate: string;
  status: string;
  isLocked: boolean;
  isCurrent: boolean;
  gamesCount: number;
};

// Raw types from database
 type NFLWeekRow = {
  id: string;
  season: number;
  week_number: number;
  week_type?: string | null;
  display_label?: string | null;
  week_start_date: string;
  week_end_date: string;
  thursday_kickoff: string | null;
  status: string;
  games_count: number;
  synced_at: string | null;
};

type NFLUserWeekRow = {
  id: string;
  user_id: string;
  venue_id: string;
  nfl_week_id: string;
  picks_count: number;
  correct_picks: number;
  incorrect_picks: number;
  total_points: number;
  is_complete: boolean;
  completed_at: string | null;
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get the Thursday that starts the week containing the given date
 */
export function getThursdayOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const dayOfWeek = d.getUTCDay(); // 0 = Sunday, 4 = Thursday
  const daysSinceThursday = (dayOfWeek - 4 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceThursday);
  return d;
}

/**
 * Calculate NFL week number based on season start
 * NFL Week 1 is the first Thursday in September
 */
export function calculateNFLWeekNumber(thursdayDate: Date, season: number): number {
  const seasonStart = new Date(Date.UTC(season, 8, 1)); // September 1st
  const firstThursday = getThursdayOfWeek(seasonStart);
  
  // If first Thursday is before Sept 1, move to next Thursday
  if (firstThursday.getUTCMonth() < 8) {
    firstThursday.setUTCDate(firstThursday.getUTCDate() + 7);
  }
  
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const diffTime = thursdayDate.getTime() - firstThursday.getTime();
  const diffWeeks = Math.floor(diffTime / msPerWeek);
  
  return Math.max(1, diffWeeks + 1);
}

/**
 * Check if a week is locked (picks can no longer be changed)
 * Per-game locking: each game locks at its own kickoff
 * Week is considered "locked" for UI purposes when the first game has started
 */
export function isNFLWeekLocked(week: NFLWeek): boolean {
  // For per-game locking, we use thursdayKickoff as a UI indicator
  // but actual pick locks happen per-game
  if (!week.thursdayKickoff) return false;
  return Date.now() >= new Date(week.thursdayKickoff).getTime();
}

/**
 * Check if an individual game is locked
 */
function isGameLocked(startsAt: string): boolean {
  const startsAtMs = new Date(startsAt).getTime();
  if (!Number.isFinite(startsAtMs)) {
    return true;
  }
  return Date.now() >= startsAtMs;
}

/**
 * Determine if a date is within a given week
 */
export function isDateInWeek(date: string, week: NFLWeek): boolean {
  const d = new Date(date);
  const start = new Date(week.weekStartDate);
  const end = new Date(week.weekEndDate);
  end.setDate(end.getDate() + 1); // Include the full Monday
  
  return d >= start && d < end;
}

function normalizeNFLWeekType(value: string | null | undefined): NFLWeek["weekType"] {
  if (value === "preseason" || value === "postseason") {
    return value;
  }
  return "regular";
}

export function getNFLWeekDisplayLabel(week: Pick<NFLWeek, "displayLabel" | "weekNumber">): string {
  const label = String(week.displayLabel ?? "").trim();
  return label || `Week ${week.weekNumber}`;
}

export function isNFLWeekStarted(
  week: Pick<NFLWeek, "weekStartDate">,
  options: { now?: Date; timeZone?: string } = {}
): boolean {
  const timeZone = String(options.timeZone ?? "America/New_York").trim() || "America/New_York";
  return week.weekStartDate <= getLocalDateKey(options.now ?? new Date(), timeZone);
}

export function buildNFLLeaderboardWeekOptions(
  weeks: NFLWeek[],
  options: { now?: Date; timeZone?: string } = {}
): {
  weeks: NFLWeekOption[];
  currentWeekId: string | null;
  defaultWeekId: string | null;
} {
  const timeZone = String(options.timeZone ?? "America/New_York").trim() || "America/New_York";
  const today = getLocalDateKey(options.now ?? new Date(), timeZone);
  const startedWeeks = weeks.filter((week) => isNFLWeekStarted(week, { now: options.now, timeZone }));
  const currentWeek = startedWeeks.find((week) => week.weekStartDate <= today && week.weekEndDate >= today) ?? null;
  const defaultWeek = currentWeek ?? startedWeeks[startedWeeks.length - 1] ?? null;

  return {
    weeks: startedWeeks.map((week) => ({
      id: week.id,
      weekNumber: week.weekNumber,
      weekType: week.weekType,
      label: getNFLWeekDisplayLabel(week),
      weekStartDate: week.weekStartDate,
      weekEndDate: week.weekEndDate,
      status: week.status,
      isLocked: isNFLWeekLocked(week),
      isCurrent: currentWeek?.id === week.id,
      gamesCount: week.gamesCount,
    })),
    currentWeekId: currentWeek?.id ?? null,
    defaultWeekId: defaultWeek?.id ?? null,
  };
}

// ============================================
// LOCK MECHANISM
// ============================================

/**
 * Determine the lock time for an NFL week
 *
 * Rules:
 * 1. If there's a Thursday Night Football game, lock at earliest kickoff
 * 2. If no Thursday game (bye week), lock at first game of the week
 * 3. If no games at all (shouldn't happen), return null
 */
export async function determineWeekLockTime(
  weekStartDate: string,
  weekEndDate: string
): Promise<string | null> {
  // Fetch Thursday games
  const thursdayGames = await fetchNFLGamesFromBDL(weekStartDate, weekStartDate);
  
  if (thursdayGames.length > 0) {
    // Find earliest kickoff on Thursday
    const earliest = thursdayGames
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];
    
    return earliest.startsAt;
  }
  
  // No Thursday game - find first game of the week
  const allGames = await fetchNFLGamesFromBDL(weekStartDate, weekEndDate);
  
  if (allGames.length === 0) {
    return null;
  }
  
  const earliestGame = allGames
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];
  
  return earliestGame.startsAt;
}

/**
 * Get lock status with detailed information
 */
export function getLockStatus(week: {
  thursdayKickoff: string | null;
}): {
  isLocked: boolean;
  timeUntilLock: number | null; // milliseconds
  lockTimeFormatted: string | null;
} {
  if (!week.thursdayKickoff) {
    return {
      isLocked: false,
      timeUntilLock: null,
      lockTimeFormatted: null,
    };
  }
  
  const lockTime = new Date(week.thursdayKickoff).getTime();
  const now = Date.now();
  const isLocked = now >= lockTime;
  
  return {
    isLocked,
    timeUntilLock: isLocked ? 0 : lockTime - now,
    lockTimeFormatted: new Date(week.thursdayKickoff).toLocaleString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }),
  };
}

// ============================================
// WEEK MANAGEMENT
// ============================================

/**
 * Fetch all NFL weeks for a season
 */
export async function listNFLWeeks(
  season: number,
  includeComplete: boolean = false
): Promise<NFLWeek[]> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client not configured");
  }
  
  // First, update week statuses
  await supabaseAdmin.rpc("update_nfl_week_status");
  
  let query = supabaseAdmin
    .from("nfl_pickem_weeks")
    .select("*")
    .eq("season", season)
    .order("week_number", { ascending: true });
  
  if (!includeComplete) {
    query = query.neq("status", "complete");
  }
  
  const { data, error } = await query;
  
  if (error) {
    throw new Error(`Failed to fetch NFL weeks: ${error.message}`);
  }
  
  return (data || []).map(mapNFLWeekRow);
}

/**
 * Get a specific NFL week by ID
 */
export async function getNFLWeekById(weekId: string): Promise<NFLWeek | null> {
  if (!supabaseAdmin) return null;
  
  const { data, error } = await supabaseAdmin
    .from("nfl_pickem_weeks")
    .select("*")
    .eq("id", weekId)
    .single();
  
  if (error || !data) return null;
  
  return mapNFLWeekRow(data);
}

/**
 * Get the current NFL week based on today's date
 */
export async function getCurrentNFLWeek(season: number): Promise<NFLWeek | null> {
  const weeks = await listNFLWeeks(season, true);
  const now = new Date();
  
  return weeks.find(w => {
    const start = new Date(w.weekStartDate);
    const end = new Date(w.weekEndDate);
    return now >= start && now <= end;
  }) || null;
}

/**
 * Map database row to NFLWeek type
 */
function mapNFLWeekRow(row: NFLWeekRow): NFLWeek {
  return {
    id: row.id,
    season: row.season,
    weekNumber: row.week_number,
    weekType: normalizeNFLWeekType(row.week_type),
    displayLabel: row.display_label ?? null,
    weekStartDate: row.week_start_date,
    weekEndDate: row.week_end_date,
    thursdayKickoff: row.thursday_kickoff,
    status: row.status as NFLWeek["status"],
    gamesCount: row.games_count,
    syncedAt: row.synced_at,
  };
}

// ============================================
// GAME FETCHING
// ============================================

/**
 * Fetch NFL games from balldontlie API for a date range
 */
async function fetchNFLGamesFromBDL(
  fromDate: string,
  toDate: string
): Promise<Array<{
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  startsAt: string;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeam: string | null;
  status: string;
}>> {
  const dates: string[] = [];
  let current = new Date(fromDate);
  const end = new Date(toDate);
  
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  
  // Fetch games for each date
  const allGames: any[] = [];
  
  for (const date of dates) {
    const games = await fetchBallDontLieList<any>(
      "/nfl/v1/games",
      new URLSearchParams({ "dates[]": date, per_page: "100" }),
      2
    );
    allGames.push(...games);
  }
  
  // Deduplicate by ID
  const seen = new Set<string>();
  const uniqueGames = allGames.filter(g => {
    if (seen.has(g.id)) return false;
    seen.add(g.id);
    return true;
  });
  
  // Transform to standard format
  return uniqueGames.map(game => {
    const homeTeam = game.home_team?.full_name || game.home_team?.name || "";
    const awayTeam = game.visitor_team?.full_name || game.visitor_team?.name || "";
    const isCompleted = game.status?.toLowerCase() === "final" || game.status?.toLowerCase() === "post";
    
    return {
      id: String(game.id),
      homeTeam,
      awayTeam,
      homeTeamId: String(game.home_team?.id || ""),
      awayTeamId: String(game.visitor_team?.id || ""),
      startsAt: game.date,
      homeScore: isCompleted ? game.home_team_score : null,
      awayScore: isCompleted ? game.visitor_team_score : null,
      winnerTeam: game.winner_team?.full_name || null,
      status: game.status,
    };
  });
}

/**
 * Get all games for a specific NFL week
 * FIXES THE BUG: Uses week range instead of single date
 */
export async function listNFLPickEmGames(params: {
  weekId: string;
  userId?: string;
  venueId?: string;
}): Promise<{
  week: NFLWeek;
  games: NFLPickEmGame[];
  userSummary?: NFLUserWeekSummary;
}> {
  const week = await getNFLWeekById(params.weekId);
  if (!week) {
    throw new Error("NFL Week not found");
  }
  
  // Fetch games from balldontlie across the FULL week range (Thursday to Monday)
  // FIX: Use week range instead of single date to get all games
  const games = await fetchNFLGamesFromBDL(week.weekStartDate, week.weekEndDate);
  
  // Transform to NFLPickEmGame format
  const nflGames: NFLPickEmGame[] = games.map(game => {
    const gameDate = new Date(game.startsAt);
    const dayOfWeek = gameDate.getUTCDay();
    
    const isLocked = isGameLocked(game.startsAt);
    const isCompleted = game.winnerTeam !== null;
    
    return {
      id: `${game.id}__${game.startsAt}__${game.awayTeam}__${game.homeTeam}`,
      sportSlug: NFL_PICKEM_SPORT_SLUG,
      sportKey: NFL_PICKEM_SPORT_KEY,
      league: NFL_PICKEM_LEAGUE,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      startsAt: game.startsAt,
      isLocked,
      status: isCompleted ? "final" : isLocked ? "live" : "scheduled",
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      winnerTeam: game.winnerTeam,
      periodLabel: null,
      nflWeekId: week.id,
      weekNumber: week.weekNumber,
      isThursdayGame: dayOfWeek === 4,
      isSundayGame: dayOfWeek === 0,
      isMondayGame: dayOfWeek === 1,
    };
  });
  
  // Sort: Thursday first, then Sunday, then Monday
  nflGames.sort((a, b) => {
    // Priority: Thursday > Sunday > Monday > Other
    const dayPriority = (game: NFLPickEmGame) => {
      if (game.isThursdayGame) return 0;
      if (game.isSundayGame) return 1;
      if (game.isMondayGame) return 2;
      return 3;
    };
    
    const priorityDiff = dayPriority(a) - dayPriority(b);
    if (priorityDiff !== 0) return priorityDiff;
    
    // Then by start time
    return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  });
  
  // Attach user's existing picks
  if (params.userId && params.venueId) {
    // Query across the full week range
    const weekStartIso = new Date(week.weekStartDate).toISOString();
    const weekEndIso = new Date(week.weekEndDate);
    weekEndIso.setHours(23, 59, 59, 999);
    
    const { data: picks } = await supabaseAdmin!
      .from("pickem_picks")
      .select("*")
      .eq("user_id", params.userId)
      .eq("venue_id", params.venueId)
      .eq("sport_slug", NFL_PICKEM_SPORT_SLUG)
      .gte("starts_at", weekStartIso)
      .lte("starts_at", weekEndIso.toISOString());
    
    const pickMap = new Map(picks?.map(p => [p.game_id, p]));
    
    for (const game of nflGames) {
      const pick = pickMap.get(game.id);
      if (pick) {
        game.userPickId = pick.id;
        game.userPickTeam = pick.selected_team;
        game.userPickStatus = pick.status as PickEmPick["status"];
        game.userPickRewardPoints = pick.reward_points;
        game.userPickRewardClaimedAt = pick.reward_claimed_at;
      }
    }
  }
  
  // Get user summary
  let userSummary: NFLUserWeekSummary | undefined;
  if (params.userId && params.venueId) {
    userSummary = await getUserNFLWeekSummary(params.userId, params.venueId, week.id);
  }
  
  return { week, games: nflGames, userSummary };
}

// ============================================
// USER SUMMARIES
// ============================================

/**
 * Get or create user week summary
 */
export async function getUserNFLWeekSummary(
  userId: string,
  venueId: string,
  weekId: string
): Promise<NFLUserWeekSummary | undefined> {
  if (!supabaseAdmin) return undefined;
  
  // First ensure the summary exists
  await supabaseAdmin.rpc("recalculate_nfl_user_week", {
    p_user_id: userId,
    p_venue_id: venueId,
    p_nfl_week_id: weekId,
  });
  
  // Fetch the summary
  const { data, error } = await supabaseAdmin
    .from("nfl_pickem_user_weeks")
    .select("*, nfl_week: nfl_week_id(*)")
    .eq("user_id", userId)
    .eq("venue_id", venueId)
    .eq("nfl_week_id", weekId)
    .single();
  
  if (error || !data) return undefined;
  
  const row = data as NFLUserWeekRow & { nfl_week: NFLWeekRow };
  
  return {
    id: row.id,
    weekId: row.nfl_week_id,
    weekNumber: row.nfl_week.week_number,
    weekStartDate: row.nfl_week.week_start_date,
    weekEndDate: row.nfl_week.week_end_date,
    status: row.nfl_week.status,
    picksCount: row.picks_count,
    correctPicks: row.correct_picks,
    incorrectPicks: row.incorrect_picks,
    totalPoints: row.total_points,
    isComplete: row.is_complete,
    isLocked: isNFLWeekLocked(mapNFLWeekRow(row.nfl_week)),
    lockTime: row.nfl_week.thursday_kickoff,
  };
}

// ============================================
// PICK SUBMISSION
// ============================================

// Pick row selection for queries
const PICKEM_PICK_SELECT =
  "id, user_id, venue_id, sport_slug, sport_key, league, game_id, home_team_id, away_team_id, selected_team_id, winning_team_id, game_label, home_team, away_team, starts_at, selected_team, selected_side, status, home_score, away_score, created_at, updated_at, resolved_at, reward_points, reward_claimed_at";

// Raw pick row type
type PickEmPickRow = {
  id: string;
  user_id: string;
  venue_id: string;
  sport_slug: string;
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
  status: "pending" | "won" | "lost" | "push" | "canceled";
  home_score: number | null;
  away_score: number | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  reward_points: number;
  reward_claimed_at: string | null;
};

function mapPickRowToPick(row: PickEmPickRow): PickEmPick {
  return {
    id: row.id,
    userId: row.user_id,
    venueId: row.venue_id,
    sportSlug: row.sport_slug as PickEmPick["sportSlug"],
    sportKey: row.sport_key,
    league: row.league,
    gameId: row.game_id,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    selectedTeamId: row.selected_team_id,
    winningTeamId: row.winning_team_id,
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
    rewardPoints: row.reward_points,
    rewardClaimedAt: row.reward_claimed_at,
  };
}

/**
 * Submit an NFL Pick 'Em pick
 * Per-game locking: each game locks at its own kickoff
 * Bypasses the isClickable check in lib/pickem.ts
 */
export async function submitNFLPickEmPick(params: {
  userId: string;
  venueId: string;
  weekId: string;
  gameId: string;
  pickTeam: string;
}): Promise<PickEmPick> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }
  
  const week = await getNFLWeekById(params.weekId);
  if (!week) {
    throw new Error("NFL Week not found");
  }
  
  // Get the game details
  const { games } = await listNFLPickEmGames({
    weekId: params.weekId,
    userId: params.userId,
    venueId: params.venueId,
  });
  
  const game = games.find(g => g.id === params.gameId);
  if (!game) {
    throw new Error("Game not found");
  }
  
  // Per-game locking check
  if (game.isLocked) {
    throw new Error("This game has already started. Picks lock at kickoff.");
  }
  
  // Validate pick team
  if (params.pickTeam !== game.homeTeam && params.pickTeam !== game.awayTeam) {
    throw new Error(`pickTeam must be either "${game.homeTeam}" or "${game.awayTeam}"`);
  }
  
  const selectedSide: "home" | "away" = params.pickTeam === game.homeTeam ? "home" : "away";
  const selectedTeamId = selectedSide === "home" ? game.homeTeamId : game.awayTeamId;
  const gameLabel = `${game.awayTeam} vs ${game.homeTeam}`;
  
  // Check for existing pick
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("pickem_picks")
    .select(PICKEM_PICK_SELECT)
    .eq("user_id", params.userId)
    .eq("venue_id", params.venueId)
    .eq("game_id", params.gameId)
    .maybeSingle<PickEmPickRow>();
  
  if (existingError) {
    throw new Error(existingError.message ?? "Failed to verify existing pick.");
  }
  
  if (existing) {
    // Check if pick is locked
    const startsAtMs = new Date(existing.starts_at).getTime();
    if (!Number.isFinite(startsAtMs) || Date.now() >= startsAtMs + PICKEM_LOCK_GRACE_MS) {
      throw new Error("This pick is locked because the game has started.");
    }
    
    if (existing.status !== "pending") {
      throw new Error("This pick can no longer be modified.");
    }
    
    // Update existing pick
    const { data, error } = await supabaseAdmin
      .from("pickem_picks")
      .update({
        selected_team: params.pickTeam,
        selected_side: selectedSide,
        game_label: gameLabel,
        league: game.league,
        sport_key: game.sportKey,
        selected_team_id: selectedTeamId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select(PICKEM_PICK_SELECT)
      .single<PickEmPickRow>();
    
    if (error || !data) {
      throw new Error(error?.message ?? "Failed to update pick.");
    }
    
    // Recalculate user week summary
    await supabaseAdmin.rpc("recalculate_nfl_user_week", {
      p_user_id: params.userId,
      p_venue_id: params.venueId,
      p_nfl_week_id: params.weekId,
    });
    
    return mapPickRowToPick(data);
  }
  
  // Insert new pick
  const { data, error } = await supabaseAdmin
    .from("pickem_picks")
    .insert({
      user_id: params.userId,
      venue_id: params.venueId,
      sport_slug: NFL_PICKEM_SPORT_SLUG,
      sport_key: game.sportKey,
      league: game.league,
      game_id: params.gameId,
      home_team_id: game.homeTeamId,
      away_team_id: game.awayTeamId,
      selected_team: params.pickTeam,
      selected_side: selectedSide,
      selected_team_id: selectedTeamId,
      game_label: gameLabel,
      home_team: game.homeTeam,
      away_team: game.awayTeam,
      starts_at: game.startsAt,
      status: "pending",
      reward_points: PICKEM_REWARD_POINTS,
    })
    .select(PICKEM_PICK_SELECT)
    .single<PickEmPickRow>();
  
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to save pick.");
  }
  
  // Recalculate user week summary
  await supabaseAdmin.rpc("recalculate_nfl_user_week", {
    p_user_id: params.userId,
    p_venue_id: params.venueId,
    p_nfl_week_id: params.weekId,
  });
  
  return mapPickRowToPick(data);
}

/**
 * Clear an NFL Pick 'Em pick
 */
export async function clearNFLPick(params: {
  userId: string;
  gameId: string;
}): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin not configured");
  }
  
  // Get the pick to find its week
  const { data: pick, error: pickError } = await supabaseAdmin
    .from("pickem_picks")
    .select("*, starts_at")
    .eq("user_id", params.userId)
    .eq("game_id", params.gameId)
    .eq("sport_slug", NFL_PICKEM_SPORT_SLUG)
    .single();
  
  if (pickError || !pick) {
    throw new Error("Pick not found");
  }
  
  // Per-game locking: check if this specific game has started
  if (isGameLocked(pick.starts_at)) {
    throw new Error("Cannot clear pick - game has already started");
  }
  
  // Delete the pick
  const { error } = await supabaseAdmin
    .from("pickem_picks")
    .delete()
    .eq("id", pick.id);
  
  if (error) {
    throw new Error(`Failed to clear pick: ${error.message}`);
  }
  
  // Find the week for this game and recalculate summary
  const { data: week } = await supabaseAdmin
    .from("nfl_pickem_weeks")
    .select("*")
    .lte("week_start_date", pick.starts_at)
    .gte("week_end_date", pick.starts_at)
    .single();
  
  if (week) {
    await supabaseAdmin.rpc("recalculate_nfl_user_week", {
      p_user_id: params.userId,
      p_venue_id: pick.venue_id,
      p_nfl_week_id: week.id,
    });
  }
}

// ============================================
// WEEK SYNC (for cron job)
// ============================================

/**
 * Sync NFL weeks from balldontlie API
 * This should be run weekly via cron job
 */
export async function syncNFLWeeks(season: number): Promise<NFLWeek[]> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin not configured");
  }
  
  // Fetch all games for the season
  const games = await fetchBallDontLieList<any>(
    "/nfl/v1/games",
    new URLSearchParams({ 
      seasons: String(season), 
      per_page: "100",
      postseason: "false" // Regular season only
    }),
    3
  );
  
  // Group games by week
  const weekMap = new Map<number, typeof games>();
  
  for (const game of games) {
    const gameDate = new Date(game.date);
    const weekStart = getThursdayOfWeek(gameDate);
    const weekNumber = calculateNFLWeekNumber(weekStart, season);
    
    if (!weekMap.has(weekNumber)) {
      weekMap.set(weekNumber, []);
    }
    weekMap.get(weekNumber)!.push(game);
  }
  
  // Upsert each week
  const weeks: NFLWeek[] = [];
  
  for (const [weekNumber, weekGames] of weekMap) {
    const weekStart = getThursdayOfWeek(new Date(weekGames[0].date));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 4); // Monday
    
    // Find Thursday games for lock time (used for UI indication)
    const thursdayGames = weekGames.filter(g => {
      const d = new Date(g.date);
      return d.getUTCDay() === 4;
    });
    
    const earliestThursday = thursdayGames.length > 0
      ? thursdayGames.sort((a, b) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        )[0]
      : null;
    
    // Upsert week
    const { data: week, error } = await supabaseAdmin
      .from("nfl_pickem_weeks")
      .upsert({
        season,
        week_number: weekNumber,
        week_start_date: weekStart.toISOString().slice(0, 10),
        week_end_date: weekEnd.toISOString().slice(0, 10),
        thursday_kickoff: earliestThursday?.date || null,
        games_count: weekGames.length,
        synced_at: new Date().toISOString(),
      }, {
        onConflict: "season,week_number",
      })
      .select()
      .single();
    
    if (error) {
      console.error(`Failed to sync week ${weekNumber}:`, error);
      continue;
    }
    
    weeks.push(mapNFLWeekRow(week));
  }
  
  return weeks;
}
