import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseDisplayCode } from "@/lib/displayCode";
import { gameUrl, marketingUrl } from "@/lib/domainSplit";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
  const code = parseDisplayCode(raw);
  if (!code || !supabaseAdmin) return redirect(marketingUrl("/info"));

  const { data, error } = await supabaseAdmin
    .from("venues")
    .select("id")
    .eq("display_code", code)
    .maybeSingle<{ id: string }>();

  if (error || !data) return redirect(marketingUrl("/info"));
  // Only the keep-awake readout flag rides along; nothing else in the query is forwarded.
  const awake = new URL(request.url).searchParams.get("awake") === "debug" ? "?awake=debug" : "";
  return redirect(gameUrl(`/venue/${encodeURIComponent(data.id)}/screen${awake}`));
};
