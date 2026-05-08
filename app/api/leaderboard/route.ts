import { NextResponse } from "next/server";
import { getLeaderboardForVenue, getUserRankForVenue } from "@/lib/leaderboard";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const venueId = (searchParams.get("venue") ?? "").trim();
  const userId = (searchParams.get("userId") ?? "").trim();

  if (!venueId) {
    return NextResponse.json({ ok: false, error: "venue is required." }, { status: 400 });
  }

  const entries = await getLeaderboardForVenue(venueId);
  const currentUserRank = userId ? await getUserRankForVenue(venueId, userId) : null;
  return NextResponse.json({ ok: true, entries, currentUserRank });
}
