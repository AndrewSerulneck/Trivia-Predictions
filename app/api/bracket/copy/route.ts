import { NextResponse } from "next/server";
import { isBracketsEnabled } from "@/lib/seasonalGames";
import { isBracketKind } from "@/lib/brackets/tree";
import { BRACKET_SAVE_STATUS, copyBracketEntry } from "@/lib/bracketsEntries";
import { resolveRequestUserId } from "@/lib/serverSession";

// POST /api/bracket/copy { venueId, userId, tournamentId, kind, fromVenueId } — "Copy my picks from
// <Venue>": the same account's bracket at another venue becomes this venue's entry, through the
// normal save (same rules). Separate entries afterwards (Andrew, decision 5).

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!isBracketsEnabled()) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const actor = resolveRequestUserId(request, typeof body?.userId === "string" ? body.userId : null);
  if (actor.forbidden) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403, headers: NO_STORE });

  const venueId = typeof body?.venueId === "string" ? body.venueId.trim() : "";
  const fromVenueId = typeof body?.fromVenueId === "string" ? body.fromVenueId.trim() : "";
  const tournamentId = typeof body?.tournamentId === "string" ? body.tournamentId.trim() : "";
  if (!actor.userId || !venueId || !fromVenueId || !tournamentId || !isBracketKind(body?.kind)) {
    return NextResponse.json(
      { ok: false, error: "venueId, userId, tournamentId, kind and fromVenueId are required." },
      { status: 400, headers: NO_STORE },
    );
  }

  const result = await copyBracketEntry({ tournamentId, kind: body.kind, userId: actor.userId, venueId, fromVenueId });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "Brackets are unavailable right now." }, { status: 503, headers: NO_STORE });
  }
  const status = result.outcome === "no_source" ? 404 : result.outcome === "source_invalid" ? 409 : BRACKET_SAVE_STATUS[result.outcome];
  return NextResponse.json(
    { ok: status === 200, outcome: result.outcome, savedAt: result.savedAt, problem: result.problem },
    { status, headers: NO_STORE },
  );
}
