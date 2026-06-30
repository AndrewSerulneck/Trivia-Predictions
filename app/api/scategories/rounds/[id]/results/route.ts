import { NextResponse } from "next/server";
import { getRoundResults } from "@/lib/scategories";

/** GET /api/scategories/rounds/[id]/results — fetch scored results for a round */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: roundId } = await params;
    const results = await getRoundResults(roundId);
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load results.";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
