import { NextResponse } from "next/server";
import {
  claimPrizeWin,
  getCurrentWeekStartDate,
  getWeeklyPrizeForVenue,
  listUserPrizeWins,
} from "@/lib/competition";
import { resolveRequestUserId } from "@/lib/serverSession";

function toClientErrorStatus(message: string): number {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("required") ||
    normalized.includes("not found") ||
    normalized.includes("already") ||
    normalized.includes("must")
  ) {
    return 400;
  }
  return 500;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    // The query's userId is an unverified claim — bind it to the signed session.
    const viewer = resolveRequestUserId(request, searchParams.get("userId"));
    if (viewer.forbidden) {
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }
    const userId = viewer.userId ?? "";
    const venueId = String(searchParams.get("venueId") ?? "").trim();
    const weekStart = String(searchParams.get("weekStart") ?? "").trim() || getCurrentWeekStartDate();

    const [weeklyPrize, wins] = await Promise.all([
      venueId ? getWeeklyPrizeForVenue({ venueId, weekStart }) : null,
      userId ? listUserPrizeWins({ userId, venueId: venueId || undefined, limit: 100 }) : [],
    ]);

    return NextResponse.json({
      ok: true,
      weekStart,
      weeklyPrize,
      wins,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load prize information.";
    return NextResponse.json({ ok: false, error: message }, { status: toClientErrorStatus(message) });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      userId?: string;
      prizeWinId?: string;
    };
    const action = String(body.action ?? "").trim().toLowerCase();
    if (action !== "claim") {
      return NextResponse.json({ ok: false, error: 'Unknown action. Use action="claim".' }, { status: 400 });
    }

    const actor = resolveRequestUserId(request, body.userId);
    if (actor.forbidden) {
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }

    const result = await claimPrizeWin({
      userId: actor.userId ?? "",
      prizeWinId: String(body.prizeWinId ?? "").trim(),
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process prize request.";
    return NextResponse.json({ ok: false, error: message }, { status: toClientErrorStatus(message) });
  }
}
