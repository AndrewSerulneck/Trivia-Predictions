import { NextResponse } from "next/server";
import { refreshSportsBingoProgress } from "@/lib/sportsBingo";

type LiveStatsSyncResult = {
  ok: boolean;
  scannedGames?: number;
  scannedPlayers?: number;
  upsertedPlayers?: number;
  errors?: string[];
  skipped?: boolean;
};

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const bearer = request.headers.get("authorization") ?? "";
    if (bearer.toLowerCase() === `bearer ${secret.toLowerCase()}`) {
      return true;
    }

    const headerSecret = request.headers.get("x-cron-secret") ?? "";
    return headerSecret === secret;
  }

  return false;
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(String(process.env[name] ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

async function triggerLiveStatsSyncFromCron(): Promise<LiveStatsSyncResult> {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!projectUrl || !serviceRole) {
    return { ok: true, skipped: true };
  }

  const pollMs = Math.max(2500, Math.min(60000, readPositiveIntEnv("FANTASY_LIVE_SYNC_ACTIVE_POLL_MS", 2500)));
  const loopMs = Math.max(15000, Math.min(300000, readPositiveIntEnv("FANTASY_LIVE_SYNC_LOOP_MS", 60000)));
  const finalReplayEveryCycle = Math.max(
    0,
    Math.min(200, readPositiveIntEnv("FANTASY_LIVE_SYNC_FINAL_REPLAY_EVERY_CYCLE", 6))
  );
  const endpoint = `${
    projectUrl.replace(/\/+$/, "")
  }/functions/v1/sync-live-player-stats?pollMs=${pollMs}&loopMs=${loopMs}&finalReplayEveryCycle=${finalReplayEveryCycle}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRole}`,
        apikey: serviceRole,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as LiveStatsSyncResult | null;
    if (!response.ok && response.status !== 207) {
      return {
        ok: false,
        errors: [`sync-live-player-stats returned HTTP ${response.status}.`],
      };
    }
    if (!payload || typeof payload.ok !== "boolean") {
      return {
        ok: false,
        errors: ["sync-live-player-stats returned an invalid payload."],
      };
    }
    return payload;
  } catch {
    return {
      ok: false,
      errors: ["sync-live-player-stats request failed."],
    };
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }

  try {
    const liveSync = await triggerLiveStatsSyncFromCron();
    const bingoRefresh = await refreshSportsBingoProgress({ limit: 500 });
    return NextResponse.json({ ok: true, liveSync, bingoRefresh });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Fantasy live sync failed.",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
