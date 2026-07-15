import { NextResponse } from "next/server";
import { listNFLPickEmGames, isNFLWeekLocked } from "@/lib/nflPickEm";

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
