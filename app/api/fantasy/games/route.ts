import { NextResponse } from "next/server";
import { getFantasyPlayerPoolForGame, listFantasyGames, listFantasyLeaderboard } from "@/lib/fantasy";
import type { FantasyLeaderboardEntry, FantasyPlayerPoolItem } from "@/lib/fantasy";

function normalizePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function toClientErrorStatus(message: string): number {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("required") ||
    normalized.includes("not found") ||
    normalized.includes("unavailable") ||
    normalized.includes("invalid")
  ) {
    return 400;
  }
  return 500;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = String(searchParams.get("date") ?? "").trim() || undefined;
    const tzOffsetMinutes = searchParams.get("tzOffsetMinutes") ?? undefined;
    const gameId = String(searchParams.get("gameId") ?? "").trim();
    const sportKey = String(searchParams.get("sportKey") ?? "").trim() || undefined;
    const venueId = String(searchParams.get("venueId") ?? "").trim();

    const games = await listFantasyGames({
      date,
      tzOffsetMinutes: tzOffsetMinutes ?? undefined,
      limit: Math.max(1, Math.min(40, normalizePositiveInt(searchParams.get("limit"), 20))),
    });

    let playerPool: FantasyPlayerPoolItem[] = [];
    if (gameId) {
      playerPool = await getFantasyPlayerPoolForGame({ gameId, sportKey });
    }

    let leaderboard: FantasyLeaderboardEntry[] = [];
    if (gameId && venueId) {
      leaderboard = await listFantasyLeaderboard({ venueId, gameId, limit: 30 });
    }

    return NextResponse.json({ ok: true, games, playerPool, leaderboard });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load fantasy games.";
    return NextResponse.json({ ok: false, error: message }, { status: toClientErrorStatus(message) });
  }
}
