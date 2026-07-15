# Phase 3: Backend API Development

## 3.1 Existing Backend Patterns

### Pattern Analysis from lib/pickem.ts

**File**: [`lib/pickem.ts`](lib/pickem.ts:1)

Key patterns to follow:

```typescript
// Line 1: Server-only import prevents client-side execution
import "server-only";

// Lines 3-4: Import Supabase admin and BDL helper
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchBallDontLieList } from "@/lib/balldontlie";

// Lines 22-43: Comprehensive type definitions
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
```

**Code Review**: The type definitions are comprehensive. For NFL Pick 'Em, we'll extend these rather than redefine.

### BallDontLie Integration Pattern

**File**: [`lib/balldontlie.ts`](lib/balldontlie.ts:1) (inferred from usage)

```typescript
// From lib/pickem.ts lines 889-905
async function fetchBallDontLieEventsForSportKey(
  sportKey: string,
  fromIso: string,
  toIso: string,
  leagueLabel: string
): Promise<NormalizedBallDontLieEvent[]> {
  const provider = BDL_PATH_BY_SPORT_KEY[sportKey];
  if (!provider) {
    return [];
  }
  
  // Build query variants for date range
  const queryVariants = buildQueryVariantsForSportKey(sportKey, fromIso, toIso, "100");
  
  // Fetch from BDL API
  const [batchResults, teamNameMap] = await Promise.all([
    Promise.allSettled(
      pathVariants.flatMap((path) =>
        queryVariants.map((query) => fetchBallDontLieList<BallDontLieGame>(path, query, 2))
      )
    ),
    fetchTeamNameMapForSportKey(sportKey),
  ]);
  // ... processing
}
```

**Code Review**: The pattern uses `fetchBallDontLieList()` helper with retry logic. We'll use the same pattern for NFL.

### API Route Pattern

**File**: [`app/api/pickem/games/route.ts`](app/api/pickem/games/route.ts:1)

```typescript
import { NextResponse } from "next/server";
import { listPickEmGames, settlePendingPickEmPicks } from "@/lib/pickem";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sportSlug = searchParams.get("sportSlug");
  const date = searchParams.get("date");
  const weekStartDate = searchParams.get("weekStartDate");
  const userId = searchParams.get("userId") || undefined;
  
  try {
    const result = await listPickEmGames({
      sportSlug: sportSlug!,
      date: date || undefined,
      weekStartDate: weekStartDate || undefined,
      userId,
    });
    
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
```

**Code Review**: Simple pattern - parse params, call lib function, return JSON with `ok` boolean.

## 3.2 New Library: lib/nflPickEm.ts

Create comprehensive library for NFL Pick 'Em:

```typescript
// lib/nflPickEm.ts
import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchBallDontLieList } from "@/lib/balldontlie";
import { submitPickEmPick, type PickEmPick, type PickEmGame } from "@/lib/pickem";

// ============================================
// CONSTANTS
// ============================================

const NFL_PICKEM_SPORT_KEY = "americanfootball_nfl";
const NFL_PICKEM_LEAGUE = "NFL";
const NFL_PICKEM_SPORT_SLUG = "nfl" as const;

// ============================================
// TYPES
// ============================================

export type NFLWeek = {
  id: string;
  season: number;
  weekNumber: number;
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
 */
export function isNFLWeekLocked(week: NFLWeek): boolean {
  if (!week.thursdayKickoff) return false;
  return Date.now() >= new Date(week.thursdayKickoff).getTime();
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
  const fromIso = new Date(fromDate).toISOString();
  const toIso = new Date(new Date(toDate).getTime() + 24 * 60 * 60 * 1000).toISOString();
  
  // Build date array for query
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
  
  // Fetch games from balldontlie
  const games = await fetchNFLGamesFromBDL(week.weekStartDate, week.weekEndDate);
  
  // Transform to NFLPickEmGame format
  const nflGames: NFLPickEmGame[] = games.map(game => {
    const gameDate = new Date(game.startsAt);
    const dayOfWeek = gameDate.getUTCDay();
    
    const isLocked = isNFLWeekLocked(week) || Date.now() >= gameDate.getTime();
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
    const { data: picks } = await supabaseAdmin!
      .from("pickem_picks")
      .select("*")
      .eq("user_id", params.userId)
      .eq("venue_id", params.venueId)
      .eq("sport_slug", NFL_PICKEM_SPORT_SLUG)
      .gte("starts_at", week.weekStartDate)
      .lte("starts_at", `${week.weekEndDate}T23:59:59.999Z`);
    
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
    .select("*, nfl_week: nfl_week_id(*)" as any)
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

/**
 * Submit an NFL Pick 'Em pick
 */
export async function submitNFLPickEmPick(params: {
  userId: string;
  venueId: string;
  weekId: string;
  gameId: string;
  pickTeam: string;
}): Promise<PickEmPick> {
  const week = await getNFLWeekById(params.weekId);
  if (!week) {
    throw new Error("NFL Week not found");
  }
  
  // Check if week is locked
  if (isNFLWeekLocked(week)) {
    throw new Error(
      "Picks are locked for this week. " +
      `The Thursday Night Football game kicked off at ${new Date(week.thursdayKickoff!).toLocaleString()}`
    );
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
  
  if (game.isLocked) {
    throw new Error("This game has already started.");
  }
  
  // Validate pick team
  if (params.pickTeam !== game.homeTeam && params.pickTeam !== game.awayTeam) {
    throw new Error(`pickTeam must be either "${game.homeTeam}" or "${game.awayTeam}"`);
  }
  
  // Use existing pick submission logic
  const pick = await submitPickEmPick({
    userId: params.userId,
    venueId: params.venueId,
    sportSlug: NFL_PICKEM_SPORT_SLUG,
    gameId: params.gameId,
    pickTeam: params.pickTeam,
    date: week.weekStartDate, // Pass for consistency
    tzOffsetMinutes: new Date().getTimezoneOffset(),
  });
  
  // Recalculate user week summary
  await supabaseAdmin?.rpc("recalculate_nfl_user_week", {
    p_user_id: params.userId,
    p_venue_id: params.venueId,
    p_nfl_week_id: params.weekId,
  });
  
  return pick;
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
  
  // Find the week for this game
  const { data: week } = await supabaseAdmin
    .from("nfl_pickem_weeks")
    .select("*")
    .lte("week_start_date", pick.starts_at)
    .gte("week_end_date", pick.starts_at)
    .single();
  
  if (week && isNFLWeekLocked(mapNFLWeekRow(week))) {
    throw new Error("Cannot clear pick - week is locked");
  }
  
  // Delete the pick
  const { error } = await supabaseAdmin
    .from("pickem_picks")
    .delete()
    .eq("id", pick.id);
  
  if (error) {
    throw new Error(`Failed to clear pick: ${error.message}`);
  }
  
  // Recalculate summary if we found a week
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
    
    // Find Thursday games for lock time
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
```

## 3.3 API Routes

### Route: /api/nfl-pickem/weeks/route.ts

```typescript
// app/api/nfl-pickem/weeks/route.ts
import { NextResponse } from "next/server";
import { listNFLWeeks, getCurrentNFLWeek } from "@/lib/nflPickEm";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const season = Number(searchParams.get("season")) || new Date().getFullYear();
    const includeComplete = searchParams.get("includeComplete") === "true";
    
    const weeks = await listNFLWeeks(season, includeComplete);
    const currentWeek = await getCurrentNFLWeek(season);
    
    // Transform to options format
    const weekOptions = weeks.map(week => ({
      id: week.id,
      weekNumber: week.weekNumber,
      weekStartDate: week.weekStartDate,
      weekEndDate: week.weekEndDate,
      status: week.status,
      isLocked: isNFLWeekLocked(week),
      isCurrent: currentWeek?.id === week.id,
      gamesCount: week.gamesCount,
    }));
    
    return NextResponse.json({
      ok: true,
      weeks: weekOptions,
      currentWeekId: currentWeek?.id || null,
      season,
    });
  } catch (error) {
    console.error("[NFL Pick 'Em] Error fetching weeks:", error);
    return NextResponse.json(
      { 
        ok: false, 
        error: error instanceof Error ? error.message : "Failed to load NFL weeks" 
      },
      { status: 500 }
    );
  }
}

// Import at top
import { isNFLWeekLocked } from "@/lib/nflPickEm";
```

### Route: /api/nfl-pickem/games/route.ts

```typescript
// app/api/nfl-pickem/games/route.ts
import { NextResponse } from "next/server";
import { listNFLPickEmGames } from "@/lib/nflPickEm";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const weekId = searchParams.get("weekId");
    const userId = searchParams.get("userId") || undefined;
    const venueId = searchParams.get("venueId") || undefined;
    
    if (!weekId) {
      return NextResponse.json(
        { ok: false, error: "weekId is required" },
        { status: 400 }
      );
    }
    
    const result = await listNFLPickEmGames({ weekId, userId, venueId });
    
    return NextResponse.json({
      ok: true,
      week: {
        id: result.week.id,
        weekNumber: result.week.weekNumber,
        weekStartDate: result.week.weekStartDate,
        weekEndDate: result.week.weekEndDate,
        thursdayKickoff: result.week.thursdayKickoff,
        status: result.week.status,
        isLocked: isNFLWeekLocked(result.week),
      },
      games: result.games,
      userSummary: result.userSummary,
    });
  } catch (error) {
    console.error("[NFL Pick 'Em] Error fetching games:", error);
    return NextResponse.json(
      { 
        ok: false, 
        error: error instanceof Error ? error.message : "Failed to load games" 
      },
      { status: 500 }
    );
  }
}

import { isNFLWeekLocked } from "@/lib/nflPickEm";
```

### Route: /api/nfl-pickem/picks/route.ts

```typescript
// app/api/nfl-pickem/picks/route.ts
import { NextResponse } from "next/server";
import { submitNFLPickEmPick, clearNFLPick } from "@/lib/nflPickEm";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, userId, venueId, weekId, gameId, pickTeam } = body;
    
    // Validation
    if (!userId || !venueId || !weekId || !gameId) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: userId, venueId, weekId, gameId" },
        { status: 400 }
      );
    }
    
    // Clear pick action
    if (action === "clear") {
      await clearNFLPick({ userId, gameId });
      return NextResponse.json({ ok: true, action: "cleared" });
    }
    
    // Submit pick action
    if (!pickTeam) {
      return NextResponse.json(
        { ok: false, error: "pickTeam is required for submission" },
        { status: 400 }
      );
    }
    
    const pick = await submitNFLPickEmPick({
      userId,
      venueId,
      weekId,
      gameId,
      pickTeam,
    });
    
    return NextResponse.json({
      ok: true,
      pick: {
        id: pick.id,
        gameId: pick.gameId,
        selectedTeam: pick.selectedTeam,
        status: pick.status,
      },
    });
  } catch (error) {
    console.error("[NFL Pick 'Em] Error submitting pick:", error);
    return NextResponse.json(
      { 
        ok: false, 
        error: error instanceof Error ? error.message : "Failed to submit pick" 
      },
      { status: 400 }
    );
  }
}
```

### Route: /api/cron/nfl-week-sync/route.ts

```typescript
// app/api/cron/nfl-week-sync/route.ts
import { NextResponse } from "next/server";
import { syncNFLWeeks } from "@/lib/nflPickEm";

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  
  try {
    const currentYear = new Date().getFullYear();
    const weeks = await syncNFLWeeks(currentYear);
    
    return NextResponse.json({
      ok: true,
      weeksSynced: weeks.length,
      message: `Successfully synced ${weeks.length} NFL weeks for ${currentYear} season`,
      weeks: weeks.map(w => ({
        weekNumber: w.weekNumber,
        startDate: w.weekStartDate,
        gamesCount: w.gamesCount,
      })),
    });
  } catch (error) {
    console.error("[NFL Pick 'Em] Week sync failed:", error);
    return NextResponse.json(
      { 
        ok: false, 
        error: error instanceof Error ? error.message : "Week sync failed" 
      },
      { status: 500 }
    );
  }
}
```

## 3.4 Code Review Checklist

Before proceeding to Phase 4:

- [ ] `lib/nflPickEm.ts` compiles without TypeScript errors
- [ ] All API routes return `{ ok: boolean, ... }` format
- [ ] Error handling includes meaningful messages
- [ ] RLS policies prevent unauthorized access
- [ ] Week lock logic tested with real dates
- [ ] Pick submission validates all inputs
- [ ] Cron job properly secured
- [ ] No SQL injection vulnerabilities
- [ ] Database queries use indexes

## 3.5 Testing Commands

```bash
# Test weeks API
curl "http://localhost:3000/api/nfl-pickem/weeks?season=2024&includeComplete=true"

# Test games API
curl "http://localhost:3000/api/nfl-pickem/games?weekId=<week-id>"

# Test pick submission
curl -X POST "http://localhost:3000/api/nfl-pickem/picks" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "<user-id>",
    "venueId": "<venue-id>",
    "weekId": "<week-id>",
    "gameId": "<game-id>",
    "pickTeam": "Kansas City Chiefs"
  }'

# Test cron job (with secret)
curl "http://localhost:3000/api/cron/nfl-week-sync" \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

**Next**: Proceed to [Phase 4: Frontend Components](docs/NFL_PICKEM_PHASE4_FRONTEND.md)
