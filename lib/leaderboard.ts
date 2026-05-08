import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { LeaderboardEntry } from "@/types";

type LeaderboardRow = {
  id: string;
  username: string;
  venue_id: string;
  points: number;
};

const LEADERBOARD_QUERY_TIMEOUT_MS = 8000;

const FALLBACK_LEADERBOARD: LeaderboardEntry[] = [
  {
    userId: "demo-1",
    username: "TriviaAce",
    venueId: "venue-downtown",
    points: 320,
    rank: 1,
  },
  {
    userId: "demo-2",
    username: "PredictionPro",
    venueId: "venue-downtown",
    points: 275,
    rank: 2,
  },
  {
    userId: "demo-3",
    username: "FastThinker",
    venueId: "venue-downtown",
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

export async function getLeaderboardForVenue(venueId: string): Promise<LeaderboardEntry[]> {
  if (!venueId) {
    return [];
  }

  const adminClient = supabaseAdmin;
  if (!adminClient) {
    return FALLBACK_LEADERBOARD.filter((entry) => entry.venueId === venueId);
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
        .limit(50);
    });

    if (error || !data) {
      return FALLBACK_LEADERBOARD.filter((entry) => entry.venueId === venueId);
    }

    return rankEntries(data as LeaderboardRow[]);
  } catch {
    return FALLBACK_LEADERBOARD.filter((entry) => entry.venueId === venueId);
  }
}

export async function getUserRankForVenue(venueId: string, userId: string): Promise<number | null> {
  if (!venueId || !userId) {
    return null;
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
