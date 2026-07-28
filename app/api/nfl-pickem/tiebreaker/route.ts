import { NextResponse } from "next/server";
import { getWeekTiebreakerGame, getTiebreakerGuess, submitTiebreakerGuess } from "@/lib/nflPickEmTiebreaker";
import { resolveRequestUserId } from "@/lib/serverSession";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const venueId = (searchParams.get("venueId") ?? "").trim();
    const weekId = (searchParams.get("weekId") ?? "").trim();

    // Only the requesting user's own guess is ever returned here, so there is
    // nothing to un-hide — but the userId still must be the session's, not a
    // client-supplied claim, matching the sibling NFL routes.
    const viewer = resolveRequestUserId(request, searchParams.get("userId"));
    if (viewer.forbidden) {
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }

    if (!venueId) {
      return NextResponse.json({ ok: false, error: "venueId is required" }, { status: 400 });
    }
    if (!weekId) {
      return NextResponse.json({ ok: false, error: "weekId is required" }, { status: 400 });
    }

    const game = await getWeekTiebreakerGame(weekId);
    if (!game) {
      return NextResponse.json({ ok: false, error: "No tiebreaker game found for this week" }, { status: 404 });
    }

    const guess = viewer.userId
      ? await getTiebreakerGuess({ userId: viewer.userId, venueId, weekId })
      : null;

    return NextResponse.json({
      ok: true,
      game,
      guess: guess ? { predictedTotal: guess.predictedTotal, updatedAt: guess.updatedAt } : null,
    });
  } catch (error) {
    console.error("[NFL Pick 'Em] Error fetching tiebreaker:", error);
    const message = error instanceof Error ? error.message : "Failed to load tiebreaker";
    const status = /not found/i.test(message) ? 404 : /is required/i.test(message) ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { venueId, weekId, predictedTotal } = body;

    // The body's userId is an unverified claim — bind writes to the session,
    // same discipline as /api/nfl-pickem/picks.
    const actor = resolveRequestUserId(request, body.userId);
    if (actor.forbidden) {
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }
    const userId = actor.userId;

    if (!userId || !venueId || !weekId) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: userId, venueId, weekId" },
        { status: 400 }
      );
    }

    const guess = await submitTiebreakerGuess({ userId, venueId, weekId, predictedTotal });

    return NextResponse.json({
      ok: true,
      guess: { predictedTotal: guess.predictedTotal, updatedAt: guess.updatedAt },
    });
  } catch (error) {
    console.error("[NFL Pick 'Em] Error submitting tiebreaker guess:", error);
    const message = error instanceof Error ? error.message : "Failed to save tiebreaker guess";
    const status = /already started/i.test(message) ? 409 : /no tiebreaker game/i.test(message) ? 404 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
