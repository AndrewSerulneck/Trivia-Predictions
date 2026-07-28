import { NextResponse } from "next/server";
import { buildNFLGameWeekOptions, buildNFLLeaderboardWeekOptions, listNFLWeeks } from "@/lib/nflPickEm";
import { getVenueTimezone } from "@/lib/timezone";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const season = Number(searchParams.get("season")) || new Date().getFullYear();
    const includeComplete = searchParams.get("includeComplete") === "true";
    const mode = searchParams.get("mode") === "leaderboard" ? "leaderboard" : "game";
    const venueId = (searchParams.get("venue") ?? searchParams.get("venueId") ?? "").trim();
    const requestedTimeZone = String(searchParams.get("timezone") ?? "").trim();
    
    const weeks = await listNFLWeeks(season, mode === "leaderboard" ? true : includeComplete);

    if (mode === "leaderboard") {
      const timeZone = requestedTimeZone || await getVenueTimezone(venueId);
      const leaderboardOptions = buildNFLLeaderboardWeekOptions(weeks, { timeZone });

      return NextResponse.json({
        ok: true,
        weeks: leaderboardOptions.weeks,
        currentWeekId: leaderboardOptions.currentWeekId,
        defaultWeekId: leaderboardOptions.defaultWeekId,
        season,
        mode,
        timeZone,
      });
    }

    // Game mode takes no timezone: week visibility is the fixed Tue 05:00 UTC
    // rollover (isNFLWeekOpenForPicks), the same rule /api/nfl-pickem/games
    // gates on. Only leaderboard mode still resolves a venue zone, above.
    const gameOptions = buildNFLGameWeekOptions(weeks);

    return NextResponse.json({
      ok: true,
      weeks: gameOptions.weeks,
      currentWeekId: gameOptions.currentWeekId,
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
