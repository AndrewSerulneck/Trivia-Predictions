import { NextResponse } from "next/server";
import { listPickEmGames, settlePendingPickEmPicks } from "@/lib/pickem";

function normalizeBoolean(value: string | null, fallback: boolean): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sportSlug = (searchParams.get("sportSlug") ?? "nba").trim().toLowerCase();
    const date = (searchParams.get("date") ?? "").trim();
    const weekStartDate = (searchParams.get("weekStartDate") ?? "").trim();
    const userId = (searchParams.get("userId") ?? "").trim();
    const tzOffsetMinutes = searchParams.get("tzOffsetMinutes") ?? undefined;
    const refreshSettlement = normalizeBoolean(searchParams.get("refreshSettlement"), true);

    let settlement = null;
    if (userId && refreshSettlement) {
      settlement = await settlePendingPickEmPicks({ userId });
    }

    const result = await listPickEmGames({
      sportSlug,
      date,
      weekStartDate: weekStartDate || undefined,
      userId: userId || undefined,
      tzOffsetMinutes,
    });

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
