import { NextResponse } from "next/server";
import { skipRound } from "@/lib/categoryBlitz";

/**
 * POST /api/category-blitz/sessions/[id]/skip-round
 * Test-mode-only dev convenience: force the current wait (answer timer,
 * intermission, or lobby dwell) to elapse immediately. No admin auth — the
 * safety boundary is skipRound's own server-side `test_mode` check against
 * the session's DB row (read fresh, never trusted from the request), not the
 * caller's identity. This lets a solo tester call it from the live gameplay
 * UI (not the admin dashboard) while still being impossible to abuse against
 * production sessions. A non-test-mode session always rejects 403 regardless
 * of who calls this. See skipRound (lib/categoryBlitz.ts) for the DB guard's
 * reasoning (mirrors the testMode pin at line 682-689).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: sessionId } = await params;
    const session = await skipRound(sessionId);
    return NextResponse.json({ ok: true, session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to skip round.";
    const status = message.includes("not found")
      ? 404
      : message.includes("only available") || message.includes("Cannot skip")
        ? 403
        : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
