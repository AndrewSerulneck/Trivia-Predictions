import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { LeaderboardEntry } from "@/types";

type LeaderboardRow = {
  id: string;
  username: string;
  venue_id: string;
  points: number;
};

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

export async function getLeaderboardForVenue(venueId: string): Promise<LeaderboardEntry[]> {
  if (!venueId) {
    return [];
  }

  if (!supabaseAdmin) {
    return FALLBACK_LEADERBOARD.filter((entry) => entry.venueId === venueId);
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, username, venue_id, points")
    .eq("venue_id", venueId)
    .order("points", { ascending: false })
    .order("username", { ascending: true })
    .limit(50);

  if (error || !data) {
    return FALLBACK_LEADERBOARD.filter((entry) => entry.venueId === venueId);
  }

  return rankEntries(data as LeaderboardRow[]);
}
