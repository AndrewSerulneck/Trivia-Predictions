import { NextResponse } from "next/server";
import {
  BINGO_AVAILABILITY_RETRY_MESSAGE,
  BINGO_AVAILABILITY_UNAVAILABLE_MESSAGE,
  resolveSportsBingoCreationAvailability,
} from "@/lib/sportsBingoAvailability";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const availability = await resolveSportsBingoCreationAvailability({
      tzOffsetMinutes: searchParams.get("tzOffsetMinutes"),
      evaluationTimeMs: Date.now(),
    });
    const leagues = availability.leagues
      .filter((league) => league.games.length > 0)
      .map((league) => ({ key: league.sportKey, label: league.label, icon: league.emoji }));

    if (availability.allFailed) {
      return NextResponse.json(
        { ok: false, leagues, error: BINGO_AVAILABILITY_UNAVAILABLE_MESSAGE },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      leagues,
      incomplete: availability.incomplete,
      ...(availability.incomplete ? { warning: BINGO_AVAILABILITY_RETRY_MESSAGE } : {}),
      evaluatedAt: availability.evaluatedAt,
      tzOffsetMinutes: availability.tzOffsetMinutes,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load Sports Bingo leagues.",
      },
      { status: 500 }
    );
  }
}
