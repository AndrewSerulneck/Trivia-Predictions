import { NextResponse } from "next/server";
import { scoreRound } from "@/lib/scategories";

/**
 * POST /api/scategories/rounds/[id]/score
 * Client-side timer calls this when the round countdown hits zero.
 * The cron at /api/cron/scategories-score is the safety-net fallback.
 * No auth required — scoreRound is idempotent and only fires if the timer
 * has actually expired (enforced in the engine).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: roundId } = await params;
    const results = await scoreRound(roundId);
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to score round.";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
