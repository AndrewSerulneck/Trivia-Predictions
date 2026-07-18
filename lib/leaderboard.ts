import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { LeaderboardEntry } from "@/types";

type LeaderboardRow = {
  id: string;
  username: string;
  venue_id: string;
  points: number;
};

export type LeaderboardTimeframe = "today" | "week" | "month" | "year" | "all-time";

const LEADERBOARD_QUERY_TIMEOUT_MS = 8000;
const SPEED_TRIVIA_POINTS_PER_CORRECT = 2;
const MAX_VENUE_USERS_FOR_TIMEFRAME = 5000;
const MAX_POINT_ROWS_PER_SOURCE = 5000;
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

function getTimeZoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getTimeZoneParts(date, timeZone);
  const localAsUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return localAsUtcMs - date.getTime();
}

function zonedStartOfDayToUtc(year: number, month: number, day: number, timeZone: string): Date {
  const localMidnightUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  let utcMs = localMidnightUtcMs - getTimeZoneOffsetMs(new Date(localMidnightUtcMs), timeZone);
  utcMs = localMidnightUtcMs - getTimeZoneOffsetMs(new Date(utcMs), timeZone);
  return new Date(utcMs);
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

async function getVenueTimezone(venueId: string): Promise<string> {
  if (!supabaseAdmin) {
    return "America/New_York";
  }
  const { data } = await supabaseAdmin
    .from("venues")
    .select("timezone")
    .eq("id", venueId)
    .maybeSingle<{ timezone: string | null }>();
  return String(data?.timezone ?? "America/New_York").trim() || "America/New_York";
}

function addPoints(pointsByUserId: Map<string, number>, userId: string | null | undefined, points: number): void {
  const safeUserId = String(userId ?? "").trim();
  const safePoints = Math.max(0, Math.floor(Number(points ?? 0)));
  if (!safeUserId || safePoints <= 0) {
    return;
  }
  pointsByUserId.set(safeUserId, (pointsByUserId.get(safeUserId) ?? 0) + safePoints);
}

async function getTimeframeLeaderboardForVenue(
  venueId: string,
  timeframe: Exclude<LeaderboardTimeframe, "all-time">
): Promise<LeaderboardEntry[]> {
  if (!venueId || !supabaseAdmin) {
    return [];
  }

  const adminClient = supabaseAdmin;
  const timeZone = await getVenueTimezone(venueId);
  const startedAt = getTimeframeStart(timeframe, timeZone).toISOString();
  const nowIso = new Date().toISOString();

  const { data: userRows, error: userError } = await withTimedLeaderboardQuery(async (signal) => {
    return await adminClient
      .from("users")
      .select("id, username, venue_id")
      .abortSignal(signal)
      .eq("venue_id", venueId)
      .limit(MAX_VENUE_USERS_FOR_TIMEFRAME);
  });

  if (userError || !userRows || userRows.length === 0) {
    return [];
  }

  const users = (userRows as Array<{ id: string; username: string; venue_id: string }>).map((row) => ({
    id: row.id,
    username: row.username,
    venue_id: row.venue_id,
  }));
  const userIds = users.map((row) => row.id);
  const pointsByUserId = new Map<string, number>();

  const [
    speedTriviaResult,
    liveTriviaResult,
    categoryBlitzResult,
    bingoResult,
    pickemResult,
    fantasyResult,
    predictionsResult,
  ] = await Promise.allSettled([
    withTimedLeaderboardQuery(async (signal) =>
      adminClient
        .from("trivia_answers")
        .select("user_id")
        .abortSignal(signal)
        .in("user_id", userIds)
        .eq("is_correct", true)
        .gte("answered_at", startedAt)
        .lte("answered_at", nowIso)
        .limit(MAX_POINT_ROWS_PER_SOURCE)
    ),
    withTimedLeaderboardQuery(async (signal) =>
      adminClient
        .from("live_showdown_answers")
        .select("user_id, points_awarded")
        .abortSignal(signal)
        .in("user_id", userIds)
        .gte("answered_at", startedAt)
        .lte("answered_at", nowIso)
        .limit(MAX_POINT_ROWS_PER_SOURCE)
    ),
    withTimedLeaderboardQuery(async (signal) =>
      adminClient
        .from("scategories_submissions")
        .select("user_id, points_awarded")
        .abortSignal(signal)
        .eq("venue_id", venueId)
        .gte("submitted_at", startedAt)
        .lte("submitted_at", nowIso)
        .limit(MAX_POINT_ROWS_PER_SOURCE)
    ),
    withTimedLeaderboardQuery(async (signal) =>
      adminClient
        .from("sports_bingo_cards")
        .select("user_id, reward_points")
        .abortSignal(signal)
        .eq("venue_id", venueId)
        .eq("status", "won")
        .gte("reward_claimed_at", startedAt)
        .lte("reward_claimed_at", nowIso)
        .limit(MAX_POINT_ROWS_PER_SOURCE)
    ),
    withTimedLeaderboardQuery(async (signal) =>
      adminClient
        .from("pickem_daily_snapshots")
        .select("user_id, collected_points")
        .abortSignal(signal)
        .eq("venue_id", venueId)
        .gte("collected_at", startedAt)
        .lte("collected_at", nowIso)
        .limit(MAX_POINT_ROWS_PER_SOURCE)
    ),
    withTimedLeaderboardQuery(async (signal) =>
      adminClient
        .from("fantasy_entries")
        .select("user_id, reward_points")
        .abortSignal(signal)
        .eq("venue_id", venueId)
        .gte("reward_claimed_at", startedAt)
        .lte("reward_claimed_at", nowIso)
        .limit(MAX_POINT_ROWS_PER_SOURCE)
    ),
    withTimedLeaderboardQuery(async (signal) =>
      adminClient
        .from("user_predictions")
        .select("user_id, points")
        .abortSignal(signal)
        .in("user_id", userIds)
        .eq("status", "won")
        .gte("resolved_at", startedAt)
        .lte("resolved_at", nowIso)
        .limit(MAX_POINT_ROWS_PER_SOURCE)
    ),
  ]);

  if (speedTriviaResult.status === "fulfilled" && speedTriviaResult.value.data) {
    for (const row of speedTriviaResult.value.data as Array<{ user_id: string }>) {
      addPoints(pointsByUserId, row.user_id, SPEED_TRIVIA_POINTS_PER_CORRECT);
    }
  }
  if (liveTriviaResult.status === "fulfilled" && liveTriviaResult.value.data) {
    for (const row of liveTriviaResult.value.data as Array<{ user_id: string; points_awarded: number }>) {
      addPoints(pointsByUserId, row.user_id, row.points_awarded);
    }
  }
  if (categoryBlitzResult.status === "fulfilled" && categoryBlitzResult.value.data) {
    for (const row of categoryBlitzResult.value.data as Array<{ user_id: string; points_awarded: number }>) {
      addPoints(pointsByUserId, row.user_id, row.points_awarded);
    }
  }
  if (bingoResult.status === "fulfilled" && bingoResult.value.data) {
    for (const row of bingoResult.value.data as Array<{ user_id: string; reward_points: number }>) {
      addPoints(pointsByUserId, row.user_id, row.reward_points);
    }
  }
  if (pickemResult.status === "fulfilled" && pickemResult.value.data) {
    for (const row of pickemResult.value.data as Array<{ user_id: string; collected_points: number }>) {
      addPoints(pointsByUserId, row.user_id, row.collected_points);
    }
  }
  if (fantasyResult.status === "fulfilled" && fantasyResult.value.data) {
    for (const row of fantasyResult.value.data as Array<{ user_id: string; reward_points: number }>) {
      addPoints(pointsByUserId, row.user_id, row.reward_points);
    }
  }
  if (predictionsResult.status === "fulfilled" && predictionsResult.value.data) {
    for (const row of predictionsResult.value.data as Array<{ user_id: string; points: number }>) {
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

export async function getLeaderboardForVenue(
  venueId: string,
  options: { timeframe?: LeaderboardTimeframe; limit?: number } = {}
): Promise<LeaderboardEntry[]> {
  if (!venueId) {
    return [];
  }

  const timeframe = parseLeaderboardTimeframe(options.timeframe);
  const limit = Math.max(1, Math.floor(options.limit ?? 50));

  if (timeframe !== "all-time") {
    return (await getTimeframeLeaderboardForVenue(venueId, timeframe)).slice(0, limit);
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
  options: { timeframe?: LeaderboardTimeframe } = {}
): Promise<number | null> {
  if (!venueId || !userId) {
    return null;
  }

  const timeframe = parseLeaderboardTimeframe(options.timeframe);
  if (timeframe !== "all-time") {
    const entries = await getTimeframeLeaderboardForVenue(venueId, timeframe);
    return entries.find((entry) => entry.userId === userId)?.rank ?? null;
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
  limit?: number;
}): Promise<{ entries: LeaderboardEntry[]; currentUserRank: number | null }> {
  const venueId = params.venueId.trim();
  const userId = String(params.userId ?? "").trim();
  const timeframe = parseLeaderboardTimeframe(params.timeframe);
  const limit = Math.max(1, Math.floor(params.limit ?? 50));

  if (!venueId) {
    return { entries: [], currentUserRank: null };
  }

  if (timeframe !== "all-time") {
    const rankedEntries = await getTimeframeLeaderboardForVenue(venueId, timeframe);
    return {
      entries: rankedEntries.slice(0, limit),
      currentUserRank: userId ? rankedEntries.find((entry) => entry.userId === userId)?.rank ?? null : null,
    };
  }

  const entries = await getLeaderboardForVenue(venueId, { timeframe, limit });
  const currentUserRank = userId ? await getUserRankForVenue(venueId, userId, { timeframe }) : null;
  return { entries, currentUserRank };
}
