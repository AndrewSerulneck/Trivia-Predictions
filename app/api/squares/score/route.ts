import { NextResponse } from "next/server";
import { isSquaresEnabled } from "@/lib/seasonalGames";
import { getSquaresScoreView } from "@/lib/squaresScore";

// GET /api/squares/score — the shared live read for every Squares screen. Not user-specific, so the
// CDN answers it for 15 s (the same pattern as /api/venue-screen/state): at any number of venues and
// players the origin sees a handful of hits a minute, and each one is a single database request that
// never touches the sports feed. 404 while NEXT_PUBLIC_SQUARES_ENABLED is off. Docs: plan §6.
//
// Errors are never cached: a 503 must not stick at the edge for 15 s.

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const SHARED_15S = { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=15" };

export async function GET() {
  if (!isSquaresEnabled()) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404, headers: NO_STORE });

  const result = await getSquaresScoreView();
  if (!result.ok) {
    console.error("[Squares] score-read-failed", { message: result.error });
    return NextResponse.json({ ok: false, error: "The score is unavailable right now." }, { status: 503, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, ...result.value }, { headers: SHARED_15S });
}
