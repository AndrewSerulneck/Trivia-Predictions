import { NextResponse } from "next/server";
import { claimFantasyReward, listUserFantasyEntries, refreshFantasyProgress, submitFantasyEntry, updateFantasyEntryLineup } from "@/lib/fantasy";

function normalizeBoolean(value: string | null, fallback: boolean): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

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
    normalized.includes("already") ||
    normalized.includes("locked") ||
    normalized.includes("must") ||
    normalized.includes("available") ||
    normalized.includes("claim") ||
    normalized.includes("only create") ||
    normalized.includes("no longer be changed")
  ) {
    return 400;
  }
  return 500;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = String(searchParams.get("userId") ?? "").trim();
    if (!userId) {
      return NextResponse.json({ ok: true, entries: [] });
    }

    const refreshProgress = normalizeBoolean(searchParams.get("refreshProgress"), false);
    if (refreshProgress) {
      await refreshFantasyProgress({ userId, limit: 200 });
    }

    const entries = await listUserFantasyEntries({
      userId,
      includeSettled: normalizeBoolean(searchParams.get("includeSettled"), true),
      refreshProgress: false,
      limit: Math.max(1, Math.min(300, normalizePositiveInt(searchParams.get("limit"), 120))),
    });

    return NextResponse.json({ ok: true, entries });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load fantasy entries.";
    return NextResponse.json({ ok: false, error: message }, { status: toClientErrorStatus(message) });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      userId?: string;
      venueId?: string;
      gameId?: string;
      lineup?: unknown;
      entryId?: string;
      tzOffsetMinutes?: number | string;
    };

    const action = String(body.action ?? "").trim().toLowerCase();

    if (action === "claim") {
      const result = await claimFantasyReward({
        userId: String(body.userId ?? "").trim(),
        entryId: String(body.entryId ?? "").trim(),
      });
      return NextResponse.json({ ok: true, result });
    }

    const entry =
      action === "update"
        ? await updateFantasyEntryLineup({
            userId: String(body.userId ?? "").trim(),
            venueId: String(body.venueId ?? "").trim(),
            gameId: String(body.gameId ?? "").trim(),
            lineup: body.lineup,
            tzOffsetMinutes: body.tzOffsetMinutes,
          })
        : await submitFantasyEntry({
          userId: String(body.userId ?? "").trim(),
          venueId: String(body.venueId ?? "").trim(),
          gameId: String(body.gameId ?? "").trim(),
          lineup: body.lineup,
          tzOffsetMinutes: body.tzOffsetMinutes,
        });

    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit fantasy entry.";
    return NextResponse.json({ ok: false, error: message }, { status: toClientErrorStatus(message) });
  }
}
