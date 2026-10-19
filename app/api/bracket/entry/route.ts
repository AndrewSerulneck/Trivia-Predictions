import { NextResponse } from "next/server";
import { isBracketsEnabled } from "@/lib/seasonalGames";
import { isBracketKind } from "@/lib/brackets/tree";
import { BRACKET_SAVE_STATUS, parseBracketPicks, parseBracketTiebreaker, saveBracketEntry } from "@/lib/bracketsEntries";
import { resolveRequestUserId } from "@/lib/serverSession";

// POST /api/bracket/entry { venueId, userId, tournamentId, kind, picks[63], tiebreaker } — save
// (create or replace) the player's bracket, drafts included. The rules (open, lock by the database
// clock, own venue, rehearsal = hidden venues, picks that could happen) are enforced inside the
// bracket_save_entry RPC; this route binds the player to the signed session and maps the answer.

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!isBracketsEnabled()) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const actor = resolveRequestUserId(request, typeof body?.userId === "string" ? body.userId : null);
  if (actor.forbidden) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403, headers: NO_STORE });

  const venueId = typeof body?.venueId === "string" ? body.venueId.trim() : "";
  const tournamentId = typeof body?.tournamentId === "string" ? body.tournamentId.trim() : "";
  const picks = parseBracketPicks(body?.picks);
  const tiebreaker = parseBracketTiebreaker(body?.tiebreaker);
  if (!actor.userId || !venueId || !tournamentId || !isBracketKind(body?.kind) || !picks || tiebreaker === undefined) {
    return NextResponse.json(
      { ok: false, error: "venueId, userId, tournamentId, kind (main or second), picks (63) and a tiebreaker (0–400 or null) are required." },
      { status: 400, headers: NO_STORE },
    );
  }

  const result = await saveBracketEntry({ tournamentId, kind: body.kind, userId: actor.userId, venueId, picks, tiebreaker });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "Brackets are unavailable right now." }, { status: 503, headers: NO_STORE });
  }
  const status = BRACKET_SAVE_STATUS[result.outcome];
  return NextResponse.json(
    { ok: status === 200, outcome: result.outcome, savedAt: result.savedAt, problem: result.problem },
    { status, headers: NO_STORE },
  );
}
