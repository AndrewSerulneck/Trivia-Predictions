import { NextResponse } from "next/server";
import { applyVenueScreenDebugMode } from "@/lib/venueScreenDebug";
import { getVenueScreenState } from "@/lib/venueScreen";
import { parseVenueScreenDebugMode } from "@/lib/venueScreenTiming";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const venueId = String(url.searchParams.get("venueId") ?? "").trim();
    const debugMode = parseVenueScreenDebugMode(url.searchParams.get("mode"));
    const nowMs = Date.now();

    if (!venueId) {
      return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
    }

    const state = await getVenueScreenState(venueId, nowMs);
    if (!state) {
      return NextResponse.json({ ok: false, error: "Venue not found." }, { status: 404 });
    }

    const screenState = applyVenueScreenDebugMode(state, debugMode, nowMs);
    const cacheHeaders =
      screenState.mode === "idle" && !debugMode
        ? { "Cache-Control": "s-maxage=15, stale-while-revalidate=15" }
        : { "Cache-Control": "no-store" };

    return NextResponse.json(screenState, { headers: cacheHeaders });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load venue screen state." },
      { status: 500 }
    );
  }
}
