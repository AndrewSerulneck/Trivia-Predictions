import { NextResponse } from "next/server";
import { listPickEmGames, settlePendingPickEmPicks } from "@/lib/pickem";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sportSlug = (searchParams.get("sportSlug") ?? "nba").trim().toLowerCase();
    const date = (searchParams.get("date") ?? "").trim();
    const weekStartDate = (searchParams.get("weekStartDate") ?? "").trim();
    const userId = (searchParams.get("userId") ?? "").trim();
    const venueId = (searchParams.get("venueId") ?? "").trim();
    const tzOffsetMinutes = searchParams.get("tzOffsetMinutes") ?? undefined;

    if (userId) {
      await settlePendingPickEmPicks({ userId });
    }

    const result = await listPickEmGames({
      sportSlug,
      date,
      weekStartDate: weekStartDate || undefined,
      userId: userId || undefined,
      venueId: venueId || undefined,
      tzOffsetMinutes,
    });
    const settlement = null;

    return NextResponse.json({
      ok: true,
      ...result,
      settlement,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Pick 'Em games.";
    const status =
      message.toLowerCase().includes("unsupported sport") ||
      message.toLowerCase().includes("required")
        ? 400
        : 500;

    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
