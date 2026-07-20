import { NextResponse } from "next/server";
import { buildNFLLeaderboardWeekOptions, getNFLWeekDisplayLabel, listNFLWeeks, getCurrentNFLWeek, isNFLWeekLocked } from "@/lib/nflPickEm";
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

    const currentWeek = await getCurrentNFLWeek(season);
    
    // Transform to options format
    const weekOptions = weeks.map(week => ({
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
