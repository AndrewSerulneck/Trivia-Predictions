import { NextResponse } from "next/server";
import { submitNFLPickEmPick, clearNFLPick } from "@/lib/nflPickEm";
import { resolveRequestUserId } from "@/lib/serverSession";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, venueId, weekId, gameId, pickTeam } = body;

    // The body's userId is an unverified claim — bind writes to the session so
    // nobody can submit or clear picks on another player's behalf.
    const actor = resolveRequestUserId(request, body.userId);
    if (actor.forbidden) {
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }
    const userId = actor.userId;

    // Validation
    if (!userId || !venueId || !weekId || !gameId) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: userId, venueId, weekId, gameId" },
        { status: 400 }
      );
    }
    
    // Clear pick action
    if (action === "clear") {
      await clearNFLPick({ userId, gameId });
      return NextResponse.json({ ok: true, action: "cleared" });
    }
    
    // Submit pick action
    if (!pickTeam) {
      return NextResponse.json(
        { ok: false, error: "pickTeam is required for submission" },
        { status: 400 }
      );
    }
    
    const pick = await submitNFLPickEmPick({
      userId,
      venueId,
      weekId,
      gameId,
      pickTeam,
    });
    
    return NextResponse.json({
      ok: true,
      pick: {
        id: pick.id,
        gameId: pick.gameId,
        selectedTeam: pick.selectedTeam,
        status: pick.status,
      },
    });
  } catch (error) {
    console.error("[NFL Pick 'Em] Error submitting pick:", error);
    return NextResponse.json(
      { 
        ok: false, 
        error: error instanceof Error ? error.message : "Failed to submit pick" 
      },
      { status: 400 }
    );
  }
}
