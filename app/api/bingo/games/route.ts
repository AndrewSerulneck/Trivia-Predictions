import { NextResponse } from "next/server";
import { listSportsBingoGames } from "@/lib/sportsBingo";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sportKey = (searchParams.get("sportKey") ?? "basketball_nba").trim();
    const includeLocked = (searchParams.get("includeLocked") ?? "true").trim().toLowerCase();
    const tzOffsetMinutes = searchParams.get("tzOffsetMinutes") ?? undefined;

    const games = await listSportsBingoGames({
      sportKey,
      includeLocked: includeLocked === "1" || includeLocked === "true" || includeLocked === "yes",
      tzOffsetMinutes,
    });

    return NextResponse.json({
      ok: true,
      games,
      sportKey,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load Sports Bingo games.",
      },
      { status: 500 }
    );
  }
}
