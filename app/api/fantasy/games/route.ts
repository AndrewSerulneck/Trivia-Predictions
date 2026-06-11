import { NextResponse } from "next/server";
import { getFantasyPlayerPoolForDate, getFantasyPlayerPoolForGame, listFantasyGames, listFantasyLeaderboard } from "@/lib/fantasy";
import type { FantasyLeaderboardEntry, FantasyPlayerPoolEmptyReason, FantasyPlayerPoolItem } from "@/lib/fantasy";

const FANTASY_DAILY_GAME_ID_PREFIX = "nba-daily-";
const FANTASY_WNBA_DAILY_GAME_ID_PREFIX = "wnba-daily-";
const FANTASY_MLB_DAILY_GAME_ID_PREFIX = "mlb-daily-";
const FANTASY_ALLOW_STARTED_DRAFTING_FOR_TESTING =
  String(process.env.FANTASY_ALLOW_STARTED_DRAFTING_FOR_TESTING ?? "")
    .trim()
    .toLowerCase() === "true";

function parseDailyGameDateFromId(gameId: string): string | null {
  const trimmed = String(gameId ?? "").trim();
  if (trimmed.startsWith(FANTASY_DAILY_GAME_ID_PREFIX)) {
    const rawDate = trimmed.slice(FANTASY_DAILY_GAME_ID_PREFIX.length).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
  }
  if (trimmed.startsWith(FANTASY_WNBA_DAILY_GAME_ID_PREFIX)) {
    const rawDate = trimmed.slice(FANTASY_WNBA_DAILY_GAME_ID_PREFIX.length).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
  }
  if (trimmed.startsWith(FANTASY_MLB_DAILY_GAME_ID_PREFIX)) {
    const rawDate = trimmed.slice(FANTASY_MLB_DAILY_GAME_ID_PREFIX.length).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
  }
  return null;
}

function resolveDailyGameIdForSport(todayDate: string, sportKey: string | undefined): string {
  const normalizedSportKey = String(sportKey ?? "").trim().toLowerCase();
  if (normalizedSportKey.includes("wnba")) {
    return `${FANTASY_WNBA_DAILY_GAME_ID_PREFIX}${todayDate}`;
  }
  if (normalizedSportKey.includes("mlb") || normalizedSportKey.includes("baseball")) {
    return `${FANTASY_MLB_DAILY_GAME_ID_PREFIX}${todayDate}`;
  }
  return `${FANTASY_DAILY_GAME_ID_PREFIX}${todayDate}`;
}

function resolveLeagueForFantasySelection(gameId: string, sportKey: string | undefined): string | null {
  const trimmedGameId = String(gameId ?? "").trim();
  if (trimmedGameId.startsWith(FANTASY_WNBA_DAILY_GAME_ID_PREFIX)) {
    return "WNBA";
  }
  if (trimmedGameId.startsWith(FANTASY_MLB_DAILY_GAME_ID_PREFIX)) {
    return "MLB";
  }
  if (trimmedGameId.startsWith(FANTASY_DAILY_GAME_ID_PREFIX)) {
    return "NBA";
  }

  const normalizedSportKey = String(sportKey ?? "").trim().toLowerCase();
  if (normalizedSportKey.includes("wnba")) {
    return "WNBA";
  }
  if (normalizedSportKey.includes("mlb") || normalizedSportKey.includes("baseball")) {
    return "MLB";
  }
  if (normalizedSportKey.includes("nba") || normalizedSportKey.includes("basketball")) {
    return "NBA";
  }

  return null;
}

function normalizePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function normalizeBoolean(value: string | null, fallback: boolean): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
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
    const requestedDate = String(searchParams.get("date") ?? "").trim() || undefined;
    const tzOffsetMinutes = searchParams.get("tzOffsetMinutes") ?? undefined;
    const tzOffset = normalizeTimezoneOffset(tzOffsetMinutes);
    const todayDate = getTodayDateInOffset(tzOffset);
    const date = requestedDate ?? todayDate;
    const gameId = String(searchParams.get("gameId") ?? "").trim();
    const sportKey = String(searchParams.get("sportKey") ?? "").trim() || undefined;
    const venueId = String(searchParams.get("venueId") ?? "").trim();
    // Keep explicit query param precedence, otherwise allow test-mode override.
    const includeStartedGames = normalizeBoolean(
      searchParams.get("includeStartedGames"),
      FANTASY_ALLOW_STARTED_DRAFTING_FOR_TESTING
    );

    const games = await listFantasyGames({
      date,
      tzOffsetMinutes: tzOffsetMinutes ?? undefined,
      limit: Math.max(1, Math.min(40, normalizePositiveInt(searchParams.get("limit"), 20))),
    });

    const dailyGameId = `${FANTASY_DAILY_GAME_ID_PREFIX}${todayDate}`;
    const wnbaDailyGameId = `${FANTASY_WNBA_DAILY_GAME_ID_PREFIX}${todayDate}`;
    const mlbDailyGameId = `${FANTASY_MLB_DAILY_GAME_ID_PREFIX}${todayDate}`;

    let playerPool: FantasyPlayerPoolItem[] = [];
    if (gameId) {
      const dailyDateFromGameId = parseDailyGameDateFromId(gameId);
      playerPool = await getFantasyPlayerPoolForGame({
        gameId,
        sportKey,
        date: dailyDateFromGameId === todayDate ? dailyDateFromGameId : requestedDate ?? todayDate,
        tzOffsetMinutes,
        includeStartedGames,
      });
    } else {
      playerPool = await getFantasyPlayerPoolForDate({ date, tzOffsetMinutes, includeStartedGames });
    }

    let leaderboard: FantasyLeaderboardEntry[] = [];
    const leaderboardGameId = gameId || resolveDailyGameIdForSport(todayDate, sportKey);
    if (venueId && leaderboardGameId) {
      leaderboard = await listFantasyLeaderboard({ venueId, gameId: leaderboardGameId, limit: 30 });
    }

    let playerPoolEmptyReason: FantasyPlayerPoolEmptyReason | null = null;
    if (playerPool.length === 0) {
      const selectedLeague = resolveLeagueForFantasySelection(gameId, sportKey);
      const slateGames = gameId
        ? selectedLeague
          ? games.filter((game) => game.league === selectedLeague)
          : games.filter((game) => game.id === gameId)
        : selectedLeague
        ? games.filter((game) => game.league === selectedLeague)
        : games;

      if (slateGames.length === 0) {
        playerPoolEmptyReason = "no-games";
      } else if (!includeStartedGames && slateGames.every((game) => game.isLocked)) {
        playerPoolEmptyReason = "all-games-started";
      } else {
        playerPoolEmptyReason = "no-eligible-players";
      }
    }

    return NextResponse.json({
      ok: true,
      games,
      playerPool,
      playerPoolEmptyReason,
      leaderboard,
      dailyGameId,
      wnbaDailyGameId,
      mlbDailyGameId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load fantasy games.";
    return NextResponse.json({ ok: false, error: message }, { status: toClientErrorStatus(message) });
  }
}
