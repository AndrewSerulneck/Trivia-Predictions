import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { startRound } from "@/lib/categoryBlitz";

/** POST /api/category-blitz/sessions/[id]/start — start a round (admin only) */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const round = await startRound(id);
    return NextResponse.json({ ok: true, round });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start round.";
    const status = message.includes("not found") ? 404 : message.includes("Cannot") ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
