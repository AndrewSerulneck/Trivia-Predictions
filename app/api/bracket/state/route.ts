import { NextResponse } from "next/server";
import { isBracketsEnabled } from "@/lib/seasonalGames";
import { getBracketsView } from "@/lib/bracketsEntries";
import { resolveRequestUserId } from "@/lib/serverSession";

// GET /api/bracket/state?venueId=&userId= — every bracket the venue shows (live tournaments; a
// rehearsal only at a hidden venue), with the player's own entries and "copy from" venues. Read
// when the page opens, never polled. 404 while NEXT_PUBLIC_BRACKETS_ENABLED is off. The userId only
// decides "mine"; it is bound to the signed session like every player route.

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!isBracketsEnabled()) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const url = new URL(request.url);
  const venueId = url.searchParams.get("venueId")?.trim() ?? "";
  if (!venueId) return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400, headers: NO_STORE });

  const actor = resolveRequestUserId(request, url.searchParams.get("userId"));
  if (actor.forbidden) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403, headers: NO_STORE });

  const result = await getBracketsView({ venueId, userId: actor.userId });
  if (!result.ok) {
    console.error("[Brackets] state-read-failed", { message: result.error });
    return NextResponse.json({ ok: false, error: "Brackets are unavailable right now." }, { status: 503, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, tournaments: result.tournaments }, { headers: NO_STORE });
}
