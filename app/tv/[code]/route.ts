import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { findVenueIdByDisplayCode } from "@/lib/displayCodeLookup";
import { gameUrl, marketingUrl } from "@/lib/domainSplit";

// hightopchallenge.com/tv/<code> — the venue's short display link
// (docs/live-trivia-pregame-and-display-cleanup-plan.md, Phase 4). Public (a TV has
// no cookies; proxy.ts lets /tv/* through) and served on every host
// (lib/domainSplit.ts classifies /tv/* as neutral). One indexed read per visit.
//
// The code only reveals the display, which is already public, so there is no rate
// limit. 307 + no-store: a code is permanent, but never let a browser or CDN pin a
// redirect we might need to change.
export const dynamic = "force-dynamic";

const redirect = (target: string) => {
  const response = NextResponse.redirect(target, 307);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
};

export const GET = async (request: NextRequest, { params }: { params: Promise<{ code: string }> }) => {
  const { code: raw } = await params;
  const venueId = await findVenueIdByDisplayCode(raw);
  if (!venueId) return redirect(marketingUrl("/info"));
  // Only the keep-awake readout flag rides along; nothing else in the query is forwarded.
  const awake = new URL(request.url).searchParams.get("awake") === "debug" ? "?awake=debug" : "";
  return redirect(gameUrl(`/venue/${encodeURIComponent(venueId)}/screen${awake}`));
};
