import { NextResponse } from "next/server";
import {
  BINGO_AVAILABILITY_RETRY_MESSAGE,
  BINGO_AVAILABILITY_UNAVAILABLE_MESSAGE,
  resolveSportsBingoCreationAvailability,
  sportsBingoAvailabilityErrorStatus,
} from "@/lib/sportsBingoAvailability";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sportKey = (searchParams.get("sportKey") ?? "basketball_nba").trim().toLowerCase();
    const tzOffsetMinutes = searchParams.get("tzOffsetMinutes") ?? undefined;
    const availability = await resolveSportsBingoCreationAvailability({
      sportKeys: [sportKey],
      tzOffsetMinutes,
      evaluationTimeMs: Date.now(),
    });
    const league = availability.leagues[0];
    const games = league?.games ?? [];

    if (!league?.complete && games.length === 0) {
      return NextResponse.json({ ok: false, games, error: BINGO_AVAILABILITY_UNAVAILABLE_MESSAGE }, { status: 503 });
    }

    return NextResponse.json({
      ok: true,
      games,
      sportKey,
      incomplete: !league?.complete,
      ...(!league?.complete ? { warning: BINGO_AVAILABILITY_RETRY_MESSAGE } : {}),
      evaluatedAt: availability.evaluatedAt,
      tzOffsetMinutes: availability.tzOffsetMinutes,
    });
  } catch (error) {
    const status = sportsBingoAvailabilityErrorStatus(error) ?? 500;
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load Sports Bingo games.",
      },
      { status }
    );
  }
}
