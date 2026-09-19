import { NextResponse } from "next/server";
import { listSportsBingoSquareTemplates } from "@/lib/sportsBingo";
import {
  requireSportsBingoCreationGame,
  sportsBingoAvailabilityErrorStatus,
} from "@/lib/sportsBingoAvailability";

function normalizeBoolean(value: string | null, fallback = true): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const gameId = (searchParams.get("gameId") ?? "").trim();
    const sportKey = (searchParams.get("sportKey") ?? "basketball_nba").trim() || "basketball_nba";
    const tzOffsetMinutes = searchParams.get("tzOffsetMinutes");
    const includePlayerProps = normalizeBoolean(searchParams.get("includePlayerProps"), true);

    if (!gameId) {
      return NextResponse.json({ ok: false, error: "gameId is required." }, { status: 400 });
    }

    await requireSportsBingoCreationGame({ gameId, sportKey, tzOffsetMinutes, evaluationTimeMs: Date.now() });

    const result = await listSportsBingoSquareTemplates({
      gameId,
      sportKey,
      includePlayerProps,
    });

    const supportSummary = result.squares.reduce(
      (summary, square) => {
        if (square.supportLevel === "supported") {
          summary.supported += 1;
        } else {
          summary.possible += 1;
        }
        return summary;
      },
      { supported: 0, possible: 0 }
    );

    return NextResponse.json({
      ok: true,
      game: result.game,
      supportSummary,
      squares: result.squares,
      note:
        "Squares tagged POSSIBLE are implemented but should be validated against live feed edge cases before high-stakes rewards.",
    });
  } catch (error) {
    const status = sportsBingoAvailabilityErrorStatus(error) ?? 500;
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load bingo square templates.",
      },
      { status }
    );
  }
}
