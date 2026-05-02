import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { apiSportsGet } from "@/lib/apisports";

function formatDateUTC(offsetDays = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function summarizePayload(payload: unknown): { keys: string[]; sample: unknown } {
  if (!payload || typeof payload !== "object") {
    return { keys: [], sample: payload };
  }
  const obj = payload as Record<string, unknown>;
  const keys = Object.keys(obj).slice(0, 20);
  return { keys, sample: obj.response ?? obj.results ?? obj.errors ?? obj };
}

function extractErrors(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  return (payload as { errors?: unknown }).errors ?? null;
}

function hasErrorPayload(payload: unknown): boolean {
  const errors = extractErrors(payload);
  if (Array.isArray(errors)) {
    return errors.length > 0;
  }
  if (!errors || typeof errors !== "object") {
    return false;
  }
  const values = Object.values(errors as Record<string, unknown>);
  if (values.length === 0) {
    return false;
  }
  return values.some((value) => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return String(value ?? "").trim().length > 0;
  });
}

function isUsableProbe(result: { ok: boolean; json: unknown }): boolean {
  return result.ok && !hasErrorPayload(result.json);
}

function firstGameIdFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const response = (payload as { response?: unknown }).response;
  if (!Array.isArray(response) || response.length === 0) {
    return "";
  }
  const first = response[0] as { id?: unknown };
  if (typeof first?.id === "number" || typeof first?.id === "string") {
    return String(first.id).trim();
  }
  return "";
}

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const apiKey = process.env.APISPORTS_API_KEY?.trim() ?? "";
  const baseUrl = process.env.APISPORTS_NBA_BASE_URL?.trim() ?? "";
  const product = process.env.APISPORTS_NBA_PRODUCT?.trim() ?? "nba";

  if (!apiKey || !baseUrl) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing APISPORTS_API_KEY or APISPORTS_NBA_BASE_URL.",
      },
      { status: 400 }
    );
  }

  const today = formatDateUTC(0);
  const yesterday = formatDateUTC(-1);

  const statusResult = await apiSportsGet(baseUrl, "/status", apiKey);
  const gamesTodayResult = await apiSportsGet(baseUrl, `/games?date=${encodeURIComponent(today)}`, apiKey);
  const gamesYesterdayResult = await apiSportsGet(baseUrl, `/games?date=${encodeURIComponent(yesterday)}`, apiKey);

  const gameId = firstGameIdFromPayload(gamesTodayResult.json) || firstGameIdFromPayload(gamesYesterdayResult.json);

  const probePaths = gameId
    ? [
        `/games/statistics?id=${encodeURIComponent(gameId)}`,
        `/players/statistics?game=${encodeURIComponent(gameId)}`,
        `/events?game=${encodeURIComponent(gameId)}`,
      ]
    : ["/games/statistics?id=1", "/players/statistics?game=1", "/events?game=1"];

  const [gameStatsResult, playerStatsResult, eventsResult] = await Promise.all([
    apiSportsGet(baseUrl, probePaths[0], apiKey),
    apiSportsGet(baseUrl, probePaths[1], apiKey),
    apiSportsGet(baseUrl, probePaths[2], apiKey),
  ]);

  const responses = {
    status: {
      path: "/status",
      ok: statusResult.ok,
      status: statusResult.status,
      authMode: statusResult.mode,
      ...summarizePayload(statusResult.json),
      errors: extractErrors(statusResult.json),
      error: statusResult.error,
    },
    gamesToday: {
      path: `/games?date=${today}`,
      ok: gamesTodayResult.ok,
      status: gamesTodayResult.status,
      authMode: gamesTodayResult.mode,
      ...summarizePayload(gamesTodayResult.json),
      errors: extractErrors(gamesTodayResult.json),
      error: gamesTodayResult.error,
    },
    gamesYesterday: {
      path: `/games?date=${yesterday}`,
      ok: gamesYesterdayResult.ok,
      status: gamesYesterdayResult.status,
      authMode: gamesYesterdayResult.mode,
      ...summarizePayload(gamesYesterdayResult.json),
      errors: extractErrors(gamesYesterdayResult.json),
      error: gamesYesterdayResult.error,
    },
    gameStats: {
      path: probePaths[0],
      ok: gameStatsResult.ok,
      status: gameStatsResult.status,
      authMode: gameStatsResult.mode,
      ...summarizePayload(gameStatsResult.json),
      errors: extractErrors(gameStatsResult.json),
      error: gameStatsResult.error,
    },
    playerStats: {
      path: probePaths[1],
      ok: playerStatsResult.ok,
      status: playerStatsResult.status,
      authMode: playerStatsResult.mode,
      ...summarizePayload(playerStatsResult.json),
      errors: extractErrors(playerStatsResult.json),
      error: playerStatsResult.error,
    },
    events: {
      path: probePaths[2],
      ok: eventsResult.ok,
      status: eventsResult.status,
      authMode: eventsResult.mode,
      ...summarizePayload(eventsResult.json),
      errors: extractErrors(eventsResult.json),
      error: eventsResult.error,
    },
  };

  const canAuthenticate = isUsableProbe(statusResult) || isUsableProbe(gamesTodayResult) || isUsableProbe(gamesYesterdayResult);
  const hasEventsEndpoint = isUsableProbe(eventsResult);
  const hasStatsEndpoints = isUsableProbe(gameStatsResult) || isUsableProbe(playerStatsResult);

  return NextResponse.json({
    ok: true,
    config: {
      product,
      baseUrl,
      hasApiKey: Boolean(apiKey),
      discoveredGameId: gameId || null,
    },
    capabilityAssessment: {
      canAuthenticate,
      hasStatsEndpoints,
      hasEventsEndpoint,
      supportsDynamicBingoLikely: canAuthenticate && (hasEventsEndpoint || hasStatsEndpoints),
      note:
        hasEventsEndpoint
          ? "Events endpoint responded successfully. This is a strong signal for near-real-time square triggers."
          : "Events endpoint did not confirm. Dynamic updates can still work using periodic stat deltas if stats endpoints are available.",
    },
    responses,
  });
}
