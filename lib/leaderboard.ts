import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getLocalDateKey, getTimeZoneParts, getVenueTimezone, zonedStartOfDayToUtc } from "@/lib/timezone";
import type { LeaderboardEntry } from "@/types";

type LeaderboardRow = {
  id: string;
  username: string;
  venue_id: string;
  points: number;
};

export type LeaderboardGameFilter =
  | "all"
  | "speed-trivia"
  | "live-trivia"
  | "category-blitz"
  | "bingo"
  | "pickem"
  | "fantasy"
  | "predictions"
  | "nfl-pickem";

export type LeaderboardTimeframe = "today" | "week" | "month" | "year" | "all-time";

const LEADERBOARD_QUERY_TIMEOUT_MS = 8000;
const SPEED_TRIVIA_POINTS_PER_CORRECT = 2;
const MAX_VENUE_USERS_FOR_TIMEFRAME = 5000;
const MAX_POINT_ROWS_PER_SOURCE = 5000;
const LEADERBOARD_GAME_FILTERS: LeaderboardGameFilter[] = [
  "all",
  "speed-trivia",
  "live-trivia",
  "category-blitz",
  "bingo",
  "pickem",
  "fantasy",
  "predictions",
  "nfl-pickem",
];
const LEADERBOARD_TIMEFRAMES: LeaderboardTimeframe[] = ["today", "week", "month", "year", "all-time"];

const FALLBACK_LEADERBOARD: LeaderboardEntry[] = [
  {
    userId: "demo-1",
    username: "TriviaAce",
    venueId: "brunswick-grove",
    points: 320,
    rank: 1,
  },
  {
    userId: "demo-2",
    username: "PredictionPro",
    venueId: "brunswick-grove",
    points: 275,
    rank: 2,
  },
  {
    userId: "demo-3",
    username: "FastThinker",
    venueId: "brunswick-grove",
    points: 240,
    rank: 3,
  },
];

function rankEntries(rows: LeaderboardRow[]): LeaderboardEntry[] {
  const sorted = [...rows].sort((a, b) => b.points - a.points || a.username.localeCompare(b.username));
  return sorted.map((row, index) => ({
    userId: row.id,
    username: row.username,
    venueId: row.venue_id,
    points: row.points,
    rank: index + 1,
  }));
}

export function parseLeaderboardTimeframe(value: string | null | undefined): LeaderboardTimeframe {
  const normalized = String(value ?? "").trim().toLowerCase();
  return LEADERBOARD_TIMEFRAMES.includes(normalized as LeaderboardTimeframe)
    ? (normalized as LeaderboardTimeframe)
    : "all-time";
}

export function parseLeaderboardGameFilter(value: string | null | undefined): LeaderboardGameFilter {
  const normalized = String(value ?? "").trim().toLowerCase();
  return LEADERBOARD_GAME_FILTERS.includes(normalized as LeaderboardGameFilter)
    ? (normalized as LeaderboardGameFilter)
    : "all";
}

function getTimeframeStart(timeframe: Exclude<LeaderboardTimeframe, "all-time">, timeZone: string, now = new Date()): Date {
  const parts = getTimeZoneParts(now, timeZone);
  if (timeframe === "year") {
    return zonedStartOfDayToUtc(parts.year, 1, 1, timeZone);
  }
  if (timeframe === "month") {
    return zonedStartOfDayToUtc(parts.year, parts.month, 1, timeZone);
  }
  if (timeframe === "week") {
    const localDateMs = Date.UTC(parts.year, parts.month - 1, parts.day);
    const dayOfWeek = new Date(localDateMs).getUTCDay();
    const weekStart = new Date(localDateMs - dayOfWeek * 24 * 60 * 60 * 1000);
    return zonedStartOfDayToUtc(weekStart.getUTCFullYear(), weekStart.getUTCMonth() + 1, weekStart.getUTCDate(), timeZone);
  }
  return zonedStartOfDayToUtc(parts.year, parts.month, parts.day, timeZone);
}

async function withTimedLeaderboardQuery<T>(runQuery: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, LEADERBOARD_QUERY_TIMEOUT_MS);

  try {
    return await runQuery(controller.signal);
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

async function listVenueLeaderboardUsers(venueId: string): Promise<Array<{ id: string; username: string; venue_id: string }>> {
  if (!venueId || !supabaseAdmin) {
    return [];
  }

  const { data, error } = await withTimedLeaderboardQuery(async (signal) => {
    return await supabaseAdmin!
      .from("users")
      .select("id, username, venue_id")
      .abortSignal(signal)
      .eq("venue_id", venueId)
      .limit(MAX_VENUE_USERS_FOR_TIMEFRAME);
  });

  if (error || !data) {
    return [];
  }

  return (data as Array<{ id: string; username: string; venue_id: string }>).map((row) => ({
    id: row.id,
    username: row.username,
    venue_id: row.venue_id,
  }));
}

function addPoints(pointsByUserId: Map<string, number>, userId: string | null | undefined, points: number): void {
  const safeUserId = String(userId ?? "").trim();
  const safePoints = Math.max(0, Math.floor(Number(points ?? 0)));
  if (!safeUserId || safePoints <= 0) {
    return;
  }
  pointsByUserId.set(safeUserId, (pointsByUserId.get(safeUserId) ?? 0) + safePoints);
}

async function getSourceLeaderboardForVenue(
  venueId: string,
  options: {
    timeframe: LeaderboardTimeframe;
    game: Exclude<LeaderboardGameFilter, "nfl-pickem">;
  }
): Promise<LeaderboardEntry[]> {
  if (!venueId || !supabaseAdmin) {
    return [];
  }

  const adminClient = supabaseAdmin;
  const timeZone = options.timeframe === "all-time" ? "America/New_York" : await getVenueTimezone(venueId);
  const startedAt = options.timeframe === "all-time" ? null : getTimeframeStart(options.timeframe, timeZone).toISOString();
  const nowIso = new Date().toISOString();
  const game = options.game;

  const users = await listVenueLeaderboardUsers(venueId);
  if (users.length === 0) {
    return [];
  }

  const userIds = users.map((row) => row.id);
  const pointsByUserId = new Map<string, number>();

  const shouldLoad = (source: Exclude<LeaderboardGameFilter, "all" | "nfl-pickem">) => game === "all" || game === source;
  const applyTimeRange = <T extends { gte: (column: string, value: string) => T; lte: (column: string, value: string) => T }>(
    query: T,
    column: string
  ): T => {
    if (!startedAt) {
      return query;
    }
    return query.gte(column, startedAt).lte(column, nowIso);
  };

  const speedTriviaPromise = shouldLoad("speed-trivia")
    ? withTimedLeaderboardQuery(async (signal) => {
        const query = adminClient
          .from("trivia_answers")
          .select("user_id")
          .abortSignal(signal)
          .in("user_id", userIds)
          .eq("is_correct", true)
          .limit(MAX_POINT_ROWS_PER_SOURCE);
        return await applyTimeRange(query, "answered_at");
      }).catch(() => null)
    : null;

  const liveTriviaPromise = shouldLoad("live-trivia")
    ? withTimedLeaderboardQuery(async (signal) => {
        const query = adminClient
          .from("live_showdown_answers")
          .select("user_id, points_awarded")
          .abortSignal(signal)
          .in("user_id", userIds)
          .limit(MAX_POINT_ROWS_PER_SOURCE);
        return await applyTimeRange(query, "answered_at");
      }).catch(() => null)
    : null;

  const categoryBlitzPromise = shouldLoad("category-blitz")
    ? withTimedLeaderboardQuery(async (signal) => {
        const query = adminClient
          .from("scategories_submissions")
          .select("user_id, points_awarded")
          .abortSignal(signal)
          .eq("venue_id", venueId)
          .limit(MAX_POINT_ROWS_PER_SOURCE);
        return await applyTimeRange(query, "submitted_at");
      }).catch(() => null)
    : null;

  const bingoPromise = shouldLoad("bingo")
    ? withTimedLeaderboardQuery(async (signal) => {
        const query = adminClient
          .from("sports_bingo_cards")
          .select("user_id, reward_points")
          .abortSignal(signal)
          .eq("venue_id", venueId)
          .eq("status", "won")
          .limit(MAX_POINT_ROWS_PER_SOURCE);
        return await applyTimeRange(query, "reward_claimed_at");
      }).catch(() => null)
    : null;

  const pickemPromise = shouldLoad("pickem")
    ? withTimedLeaderboardQuery(async (signal) => {
        const query = adminClient
          .from("pickem_daily_snapshots")
          .select("user_id, collected_points")
          .abortSignal(signal)
          .eq("venue_id", venueId)
          .limit(MAX_POINT_ROWS_PER_SOURCE);
        return await applyTimeRange(query, "collected_at");
      }).catch(() => null)
    : null;

  const fantasyPromise = shouldLoad("fantasy")
    ? withTimedLeaderboardQuery(async (signal) => {
        const query = adminClient
          .from("fantasy_entries")
          .select("user_id, reward_points")
          .abortSignal(signal)
          .eq("venue_id", venueId)
          .limit(MAX_POINT_ROWS_PER_SOURCE);
        return await applyTimeRange(query, "reward_claimed_at");
      }).catch(() => null)
    : null;

  const predictionsPromise = shouldLoad("predictions")
    ? withTimedLeaderboardQuery(async (signal) => {
        const query = adminClient
          .from("user_predictions")
          .select("user_id, points")
          .abortSignal(signal)
          .in("user_id", userIds)
          .eq("status", "won")
          .limit(MAX_POINT_ROWS_PER_SOURCE);
        return await applyTimeRange(query, "resolved_at");
      }).catch(() => null)
    : null;

  const [
    speedTriviaResult,
    liveTriviaResult,
    categoryBlitzResult,
    bingoResult,
    pickemResult,
    fantasyResult,
    predictionsResult,
  ] = await Promise.all([
    speedTriviaPromise,
    liveTriviaPromise,
    categoryBlitzPromise,
    bingoPromise,
    pickemPromise,
    fantasyPromise,
    predictionsPromise,
  ]);

  if (speedTriviaResult?.data) {
    for (const row of speedTriviaResult.data as Array<{ user_id: string }>) {
      addPoints(pointsByUserId, row.user_id, SPEED_TRIVIA_POINTS_PER_CORRECT);
    }
  }
  if (liveTriviaResult?.data) {
    for (const row of liveTriviaResult.data as Array<{ user_id: string; points_awarded: number }>) {
      addPoints(pointsByUserId, row.user_id, row.points_awarded);
    }
  }
  if (categoryBlitzResult?.data) {
    for (const row of categoryBlitzResult.data as Array<{ user_id: string; points_awarded: number }>) {
      addPoints(pointsByUserId, row.user_id, row.points_awarded);
    }
  }
  if (bingoResult?.data) {
    for (const row of bingoResult.data as Array<{ user_id: string; reward_points: number }>) {
      addPoints(pointsByUserId, row.user_id, row.reward_points);
    }
  }
  if (pickemResult?.data) {
    for (const row of pickemResult.data as Array<{ user_id: string; collected_points: number }>) {
      addPoints(pointsByUserId, row.user_id, row.collected_points);
    }
  }
  if (fantasyResult?.data) {
    for (const row of fantasyResult.data as Array<{ user_id: string; reward_points: number }>) {
      addPoints(pointsByUserId, row.user_id, row.reward_points);
    }
  }
  if (predictionsResult?.data) {
    for (const row of predictionsResult.data as Array<{ user_id: string; points: number }>) {
      addPoints(pointsByUserId, row.user_id, row.points);
    }
  }

  const rows = users
    .map((user) => ({
      id: user.id,
      username: user.username,
      venue_id: user.venue_id,
      points: pointsByUserId.get(user.id) ?? 0,
    }))
    .filter((row) => row.points > 0);

  return rankEntries(rows);
}

async function getNflPickEmWeekLeaderboardForVenue(venueId: string, nflWeekId: string): Promise<LeaderboardEntry[]> {
  const safeWeekId = nflWeekId.trim();
  if (!venueId || !safeWeekId || !supabaseAdmin) {
    return [];
  }

  // weekRow lookup and the venue's timezone are independent of each other —
  // fetch them together, then decide whether the week has started before
  // paying for the (users, scores) pair below.
  const [{ data: weekRow, error: weekError }, timeZone] = await Promise.all([
    withTimedLeaderboardQuery(async (signal) => {
      return await supabaseAdmin!
        .from("nfl_pickem_weeks")
        .select("id, week_start_date")
        .abortSignal(signal)
        .eq("id", safeWeekId)
        .maybeSingle<{ id: string; week_start_date: string }>();
    }),
    getVenueTimezone(venueId),
  ]);

  if (weekError || !weekRow) {
    return [];
  }

  if (String(weekRow.week_start_date ?? "") > getLocalDateKey(new Date(), timeZone)) {
    return [];
  }

  // The venue's user list and this week's scores are independent of each
  // other — fetch them together instead of one after the other.
  const [users, { data, error }] = await Promise.all([
    listVenueLeaderboardUsers(venueId),
    withTimedLeaderboardQuery(async (signal) => {
      return await supabaseAdmin!
        .from("nfl_pickem_user_weeks")
        .select("user_id, venue_id, total_points")
        .abortSignal(signal)
        .eq("venue_id", venueId)
        .eq("nfl_week_id", safeWeekId)
        .gt("total_points", 0)
        .limit(MAX_POINT_ROWS_PER_SOURCE);
    }),
  ]);

  if (users.length === 0) {
    return [];
  }

  const userById = new Map(users.map((user) => [user.id, user]));

  if (error || !data) {
    return [];
  }

  const rows = (data as Array<{ user_id: string; venue_id: string; total_points: number }>)
    .map((row) => {
      const user = userById.get(row.user_id);
      if (!user) {
        return null;
      }
      return {
        id: user.id,
        username: user.username,
        venue_id: row.venue_id,
        points: Math.max(0, Math.floor(Number(row.total_points ?? 0))),
      };
    })
    .filter((row): row is LeaderboardRow => Boolean(row && row.points > 0));

  return rankEntries(rows);
}

/**
 * Resolves ranked entries for any non-default game/timeframe selection (a
 * specific game and/or timeframe, or NFL Pick'Em's per-week board). Returns
 * null when the caller should fall through to its own all-time, every-game
 * aggregate instead — that path differs per caller (full entries vs. a
 * single rank via a COUNT query), so it isn't handled here.
 */
async function resolveNonDefaultLeaderboardEntries(
  venueId: string,
  options: { timeframe: LeaderboardTimeframe; game: LeaderboardGameFilter; nflWeekId?: string }
): Promise<LeaderboardEntry[] | null> {
  if (options.game === "nfl-pickem") {
    return getNflPickEmWeekLeaderboardForVenue(venueId, String(options.nflWeekId ?? ""));
  }
  if (options.game !== "all" || options.timeframe !== "all-time") {
    return getSourceLeaderboardForVenue(venueId, { timeframe: options.timeframe, game: options.game });
  }
  return null;
}

export async function getLeaderboardForVenue(
  venueId: string,
  options: {
    timeframe?: LeaderboardTimeframe;
    game?: LeaderboardGameFilter;
    nflWeekId?: string;
    limit?: number;
  } = {}
): Promise<LeaderboardEntry[]> {
  if (!venueId) {
    return [];
  }

  const timeframe = parseLeaderboardTimeframe(options.timeframe);
  const game = parseLeaderboardGameFilter(options.game);
  const limit = Math.max(1, Math.floor(options.limit ?? 50));

  const nonDefaultEntries = await resolveNonDefaultLeaderboardEntries(venueId, { timeframe, game, nflWeekId: options.nflWeekId });
  if (nonDefaultEntries) {
    return nonDefaultEntries.slice(0, limit);
  }

  const adminClient = supabaseAdmin;
  if (!adminClient) {
    return FALLBACK_LEADERBOARD.filter((entry) => entry.venueId === venueId).slice(0, limit);
  }

  try {
    const { data, error } = await withTimedLeaderboardQuery(async (signal) => {
      return await adminClient
        .from("users")
        .select("id, username, venue_id, points")
        .abortSignal(signal)
        .eq("venue_id", venueId)
        .order("points", { ascending: false })
        .order("username", { ascending: true })
        .limit(limit);
    });

    if (error || !data) {
      return FALLBACK_LEADERBOARD.filter((entry) => entry.venueId === venueId).slice(0, limit);
    }

    return rankEntries(data as LeaderboardRow[]);
  } catch {
    return FALLBACK_LEADERBOARD.filter((entry) => entry.venueId === venueId).slice(0, limit);
  }
}

export async function getUserRankForVenue(
  venueId: string,
  userId: string,
  options: {
    timeframe?: LeaderboardTimeframe;
    game?: LeaderboardGameFilter;
    nflWeekId?: string;
  } = {}
): Promise<number | null> {
  if (!venueId || !userId) {
    return null;
  }

  const timeframe = parseLeaderboardTimeframe(options.timeframe);
  const game = parseLeaderboardGameFilter(options.game);

  const nonDefaultEntries = await resolveNonDefaultLeaderboardEntries(venueId, { timeframe, game, nflWeekId: options.nflWeekId });
  if (nonDefaultEntries) {
    return nonDefaultEntries.find((entry) => entry.userId === userId)?.rank ?? null;
  }

  const adminClient = supabaseAdmin;
  if (!adminClient) {
    const fallbackEntry = FALLBACK_LEADERBOARD.find((entry) => entry.venueId === venueId && entry.userId === userId);
    return fallbackEntry?.rank ?? null;
  }

  try {
    const { data: userRow, error: userError } = await withTimedLeaderboardQuery(async (signal) => {
      return await adminClient
        .from("users")
        .select("id, username, points")
        .abortSignal(signal)
        .eq("venue_id", venueId)
        .eq("id", userId)
        .maybeSingle();
    });

    if (userError || !userRow) {
      return null;
    }

    const targetPoints = Number(userRow.points ?? 0);
    const targetUsername = String(userRow.username ?? "");

    const { count, error: countError } = await withTimedLeaderboardQuery(async (signal) => {
      return await adminClient
        .from("users")
        .select("id", { count: "exact", head: true })
        .abortSignal(signal)
        .eq("venue_id", venueId)
        .or(`points.gt.${targetPoints},and(points.eq.${targetPoints},username.lt.${targetUsername})`);
    });

    if (countError || !Number.isFinite(count ?? NaN)) {
      return null;
    }

    return Number(count ?? 0) + 1;
  } catch {
    return null;
  }
}

export async function getLeaderboardSnapshotForVenue(params: {
  venueId: string;
  userId?: string;
  timeframe?: LeaderboardTimeframe;
  game?: LeaderboardGameFilter;
  nflWeekId?: string;
  limit?: number;
}): Promise<{ entries: LeaderboardEntry[]; currentUserRank: number | null }> {
  const venueId = params.venueId.trim();
  const userId = String(params.userId ?? "").trim();
  const timeframe = parseLeaderboardTimeframe(params.timeframe);
  const game = parseLeaderboardGameFilter(params.game);
  const limit = Math.max(1, Math.floor(params.limit ?? 50));

  if (!venueId) {
    return { entries: [], currentUserRank: null };
  }

  const nonDefaultEntries = await resolveNonDefaultLeaderboardEntries(venueId, { timeframe, game, nflWeekId: params.nflWeekId });
  if (nonDefaultEntries) {
    return {
      entries: nonDefaultEntries.slice(0, limit),
      currentUserRank: userId ? nonDefaultEntries.find((entry) => entry.userId === userId)?.rank ?? null : null,
    };
  }

  const entries = await getLeaderboardForVenue(venueId, { timeframe, game, limit });
  const currentUserRank = userId ? await getUserRankForVenue(venueId, userId, { timeframe, game }) : null;
  return { entries, currentUserRank };
}
