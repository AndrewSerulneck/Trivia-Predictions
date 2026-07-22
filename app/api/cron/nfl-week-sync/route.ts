import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { syncNFLWeeks } from "@/lib/nflPickEm";

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const currentYear = new Date().getFullYear();
    const weeks = await syncNFLWeeks(currentYear);
    
    return NextResponse.json({
      ok: true,
      weeksSynced: weeks.length,
      message: `Successfully synced ${weeks.length} NFL weeks for ${currentYear} season`,
      weeks: weeks.map(w => ({
        weekNumber: w.weekNumber,
        startDate: w.weekStartDate,
        gamesCount: w.gamesCount,
      })),
    });
  } catch (error) {
    console.error("[NFL Pick 'Em] Week sync failed:", error);
    return NextResponse.json(
      { 
        ok: false, 
        error: error instanceof Error ? error.message : "Week sync failed" 
      },
      { status: 500 }
    );
  }
}
