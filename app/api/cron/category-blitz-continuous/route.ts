import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { runContinuousCategoryBlitzEngine } from "@/lib/categoryBlitz";

/**
 * Scores expired continuous Category Blitz rounds — so a round is still graded
 * when every player closed the app mid-round. It never starts a round: the game
 * "sleeps when idle" and only a player with the game open starts the next one
 * (docs/category-blitz-how-to-play-plan.md Phase 5). An idle tick is one query.
 */
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }

  try {
    const result = await runContinuousCategoryBlitzEngine();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Continuous Category Blitz cron engine failed." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
