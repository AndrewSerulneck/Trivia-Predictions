import { NextResponse } from "next/server";
import { getFantasyPlayerPoolForDate, getFantasyPlayerPoolForGame, listFantasyGames, listFantasyLeaderboard } from "@/lib/fantasy";
import type { FantasyLeaderboardEntry, FantasyPlayerPoolItem } from "@/lib/fantasy";

const FANTASY_DAILY_GAME_ID_PREFIX = "nba-daily-";

function normalizePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function normalizeTimezoneOffset(value: string | null | undefined): number {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed)) {
    return new Date().getTimezoneOffset();
  }
  return Math.max(-14 * 60, Math.min(14 * 60, parsed));
}

function getTodayDateInOffset(tzOffsetMinutes: number): string {
  const now = Date.now();
  const localMs = now - tzOffsetMinutes * 60_000;
  const d = new Date(localMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
    const tzOffset = normalizeTimezoneOffset(tzOffsetMinutes);
    const gameId = String(searchParams.get("gameId") ?? "").trim();
    const sportKey = String(searchParams.get("sportKey") ?? "").trim() || undefined;
    const venueId = String(searchParams.get("venueId") ?? "").trim();

    const games = await listFantasyGames({
      date,
      tzOffsetMinutes: tzOffsetMinutes ?? undefined,
      limit: Math.max(1, Math.min(40, normalizePositiveInt(searchParams.get("limit"), 20))),
    });

    const fallbackDate = date || getTodayDateInOffset(tzOffset);
    const dailyGameId = `${FANTASY_DAILY_GAME_ID_PREFIX}${fallbackDate}`;

    let playerPool: FantasyPlayerPoolItem[] = [];
    if (gameId) {
      playerPool = await getFantasyPlayerPoolForGame({ gameId, sportKey, date, tzOffsetMinutes });
    } else {
      playerPool = await getFantasyPlayerPoolForDate({ date, tzOffsetMinutes, includeStartedGames: false });
    }

    let leaderboard: FantasyLeaderboardEntry[] = [];
    const leaderboardGameId = gameId || dailyGameId;
    if (venueId && leaderboardGameId) {
      leaderboard = await listFantasyLeaderboard({ venueId, gameId: leaderboardGameId, limit: 30 });
    }

    return NextResponse.json({ ok: true, games, playerPool, leaderboard, dailyGameId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load fantasy games.";
    return NextResponse.json({ ok: false, error: message }, { status: toClientErrorStatus(message) });
  }
}
