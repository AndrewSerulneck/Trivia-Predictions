import { NextResponse } from "next/server";
import { getLiveShowdownState } from "@/lib/liveShowdownEngine";

// Active phases that require real-time data — never cache these.
const ACTIVE_PHASES = new Set(["answering", "rest_warning", "mid_game_break"]);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const venueId = String(url.searchParams.get("venueId") ?? "").trim();
    const userId = String(url.searchParams.get("userId") ?? "").trim();
    const state = await getLiveShowdownState(Date.now(), venueId, userId);

    // When no game is active (idle / upcoming) the heavy leaderboard/question
    // queries are skipped entirely, so we can safely cache for a short window.
    // Active game phases must never be cached — they change every second.
    const gameIsActive = state.isGameActive && ACTIVE_PHASES.has(state.activePhase);
    const cacheHeaders = gameIsActive
      ? { "Cache-Control": "no-store" }
      : { "Cache-Control": "s-maxage=20, stale-while-revalidate=10" };

    return NextResponse.json(
      { ok: true, state, serverTimestamp: Date.now() },
      { headers: cacheHeaders }
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load live showdown state." },
      { status: 500 }
    );
  }
}
