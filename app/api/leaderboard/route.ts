import { NextResponse } from "next/server";
import { getLeaderboardSnapshotForVenue, parseLeaderboardGameFilter, parseLeaderboardTimeframe } from "@/lib/leaderboard";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const venueId = (searchParams.get("venue") ?? "").trim();
  const userId = (searchParams.get("userId") ?? "").trim();
  const timeframe = parseLeaderboardTimeframe(searchParams.get("timeframe"));
  const game = parseLeaderboardGameFilter(searchParams.get("game"));
  const nflWeekId = (searchParams.get("nflWeekId") ?? "").trim();

  if (!venueId) {
    return NextResponse.json({ ok: false, error: "venue is required." }, { status: 400 });
  }

  const { entries, currentUserRank } = await getLeaderboardSnapshotForVenue({ venueId, userId, timeframe, game, nflWeekId });
  return NextResponse.json({ ok: true, entries, currentUserRank, timeframe, game, nflWeekId });
}
