import { NextResponse } from "next/server";
import { listNFLWeeks, getCurrentNFLWeek, isNFLWeekLocked } from "@/lib/nflPickEm";

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
