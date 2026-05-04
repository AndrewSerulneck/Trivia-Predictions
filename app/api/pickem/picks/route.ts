import { NextResponse } from "next/server";
import { claimPickEmReward, clearPickEmPick, listUserPickEmPicks, settlePendingPickEmPicks, submitPickEmPick } from "@/lib/pickem";

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
    normalized.includes("unsupported") ||
    normalized.includes("not found") ||
    normalized.includes("locked") ||
    normalized.includes("already") ||
    normalized.includes("coming soon") ||
    normalized.includes("must match") ||
    normalized.includes("limit")
  ) {
    return 400;
  }
  return 500;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = (searchParams.get("userId") ?? "").trim();
    const sportSlug = (searchParams.get("sportSlug") ?? "").trim().toLowerCase();
    const includeSettled = normalizeBoolean(searchParams.get("includeSettled"), true);
    const refreshSettlement = normalizeBoolean(searchParams.get("refreshSettlement"), true);
    const limit = Math.max(1, Math.min(300, normalizePositiveInt(searchParams.get("limit"), 100)));

    if (!userId) {
      return NextResponse.json({ ok: true, picks: [] });
    }

    let settlement = null;
    if (refreshSettlement) {
      settlement = await settlePendingPickEmPicks({ userId });
    }

    const picks = await listUserPickEmPicks({
      userId,
      sportSlug: sportSlug || undefined,
      includeSettled,
      limit,
    });

    return NextResponse.json({
      ok: true,
      picks,
      settlement,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Pick 'Em picks.";
    return NextResponse.json({ ok: false, error: message }, { status: toClientErrorStatus(message) });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      userId?: string;
      venueId?: string;
      sportSlug?: string;
      gameId?: string;
      pickTeam?: string;
      pickId?: string;
      date?: string;
      weekStartDate?: string;
      tzOffsetMinutes?: number | string;
    };

    const action = String(body.action ?? "").trim().toLowerCase();
    if (action === "claim") {
      const result = await claimPickEmReward({
        userId: String(body.userId ?? "").trim(),
        pickId: String(body.pickId ?? "").trim(),
      });

      return NextResponse.json({ ok: true, result });
    }
    if (action === "clear") {
      const result = await clearPickEmPick({
        userId: String(body.userId ?? "").trim(),
        gameId: String(body.gameId ?? "").trim(),
      });
      return NextResponse.json({ ok: true, result });
    }

    const pick = await submitPickEmPick({
      userId: String(body.userId ?? "").trim(),
      venueId: String(body.venueId ?? "").trim(),
      sportSlug: String(body.sportSlug ?? "").trim().toLowerCase(),
      gameId: String(body.gameId ?? "").trim(),
      pickTeam: String(body.pickTeam ?? "").trim(),
      date: String(body.date ?? "").trim() || undefined,
      weekStartDate: String(body.weekStartDate ?? "").trim() || undefined,
      tzOffsetMinutes: body.tzOffsetMinutes,
    });

    return NextResponse.json({ ok: true, pick });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit Pick 'Em pick.";
    return NextResponse.json({ ok: false, error: message }, { status: toClientErrorStatus(message) });
  }
}
