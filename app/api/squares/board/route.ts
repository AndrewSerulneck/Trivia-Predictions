import { NextResponse } from "next/server";
import { isSquaresEnabled } from "@/lib/seasonalGames";
import { getSquaresBoardView } from "@/lib/squaresBoard";
import { resolveRequestUserId } from "@/lib/serverSession";

// GET /api/squares/board?venueId=&userId= — the current event's board at one venue. Read-only, no
// cache (claims change). 404 while NEXT_PUBLIC_SQUARES_ENABLED is off. The userId only decides which
// cells are "mine"; it is bound to the signed session like every player route.

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!isSquaresEnabled()) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const url = new URL(request.url);
  const venueId = url.searchParams.get("venueId")?.trim() ?? "";
  if (!venueId) return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400, headers: NO_STORE });

  const actor = resolveRequestUserId(request, url.searchParams.get("userId"));
  if (actor.forbidden) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403, headers: NO_STORE });

  const result = await getSquaresBoardView({ venueId, userId: actor.userId });
  if (!result.ok) {
    console.error("[Squares] board-read-failed", { message: result.error });
    return NextResponse.json({ ok: false, error: "The board is unavailable right now." }, { status: 503, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, ...result.view }, { headers: NO_STORE });
}
