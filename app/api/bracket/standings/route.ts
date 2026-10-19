import { NextResponse } from "next/server";
import { isBracketsEnabled } from "@/lib/seasonalGames";
import { isBracketKind } from "@/lib/brackets/tree";
import { getBracketStandings } from "@/lib/bracketsEntries";
import { resolveRequestUserId } from "@/lib/serverSession";

// GET /api/bracket/standings?venueId=&tournamentId=&kind=&userId= — one venue's standings for one
// bracket: usernames, scores and ranks only (never a user id or another player's picks). Read when
// opened, never polled.

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!isBracketsEnabled()) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const url = new URL(request.url);
  const venueId = url.searchParams.get("venueId")?.trim() ?? "";
  const tournamentId = url.searchParams.get("tournamentId")?.trim() ?? "";
  const kind = url.searchParams.get("kind");
  if (!venueId || !tournamentId || !isBracketKind(kind)) {
    return NextResponse.json({ ok: false, error: "venueId, tournamentId and kind are required." }, { status: 400, headers: NO_STORE });
  }
  const actor = resolveRequestUserId(request, url.searchParams.get("userId"));
  if (actor.forbidden) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403, headers: NO_STORE });

  const result = await getBracketStandings({ tournamentId, kind, venueId, userId: actor.userId });
  if (!result.ok) {
    if (result.status >= 500) console.error("[Brackets] standings-read-failed", { message: result.error });
    return NextResponse.json({ ok: false, error: result.status >= 500 ? "Standings are unavailable right now." : result.error }, { status: result.status, headers: NO_STORE });
  }
  return NextResponse.json(
    { ok: true, standings: result.standings, championshipTotal: result.championshipTotal },
    { headers: NO_STORE },
  );
}
