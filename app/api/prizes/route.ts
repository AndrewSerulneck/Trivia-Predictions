import { NextResponse } from "next/server";
import {
  claimPrizeWin,
  getCurrentWeekStartDate,
  getWeeklyPrizeForVenue,
  listUserPrizeWins,
} from "@/lib/competition";

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
    const userId = String(searchParams.get("userId") ?? "").trim();
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

    const result = await claimPrizeWin({
      userId: String(body.userId ?? "").trim(),
      prizeWinId: String(body.prizeWinId ?? "").trim(),
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process prize request.";
    return NextResponse.json({ ok: false, error: message }, { status: toClientErrorStatus(message) });
  }
}
