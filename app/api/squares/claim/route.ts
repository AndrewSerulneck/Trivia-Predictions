import { NextResponse } from "next/server";
import { isSquaresEnabled } from "@/lib/seasonalGames";
import { isSquaresCell } from "@/lib/squares";
import { claimSquaresCell, type SquaresClaimOutcome } from "@/lib/squaresBoard";
import { resolveRequestUserId } from "@/lib/serverSession";

// POST /api/squares/claim { venueId, userId, cell, action: "claim" | "release" }. The rules (cap,
// lock, one owner per cell, the player's own venue) are enforced inside the squares_claim RPC —
// this route only binds the player to the signed session and maps the answer to a status.

const NO_STORE = { "Cache-Control": "no-store" };

const STATUS: Record<SquaresClaimOutcome, number> = {
  claimed: 200,
  released: 200,
  already_yours: 200,
  taken: 409,
  cap_reached: 409,
  not_yours: 409,
  locked: 409,
  no_event: 404,
  user_not_found: 403,
  wrong_venue: 403,
};

export async function POST(request: Request) {
  if (!isSquaresEnabled()) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as {
    venueId?: unknown;
    userId?: unknown;
    cell?: unknown;
    action?: unknown;
  } | null;
  const actor = resolveRequestUserId(request, typeof body?.userId === "string" ? body.userId : null);
  if (actor.forbidden) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403, headers: NO_STORE });

  const venueId = typeof body?.venueId === "string" ? body.venueId.trim() : "";
  const action = body?.action === "release" ? "release" : body?.action === "claim" ? "claim" : null;
  if (!actor.userId || !venueId || !action || !isSquaresCell(body?.cell)) {
    return NextResponse.json(
      { ok: false, error: "venueId, userId, cell (0–99) and action (claim or release) are required." },
      { status: 400, headers: NO_STORE },
    );
  }

  const result = await claimSquaresCell({ userId: actor.userId, venueId, cell: body.cell as number, action });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "Squares is unavailable right now." },
      { status: 503, headers: NO_STORE },
    );
  }
  const status = STATUS[result.outcome];
  return NextResponse.json(
    { ok: status === 200, outcome: result.outcome, myCells: result.myCells },
    { status, headers: NO_STORE },
  );
}
