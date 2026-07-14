import { NextResponse } from "next/server";
import { enableSessionTestMode } from "@/lib/categoryBlitz";

/**
 * POST /api/category-blitz/sessions/[id]/enable-test-mode
 * Test-tooling convenience: flip an already-running auto session's `test_mode`
 * column on, so a tester who toggled test mode AFTER the session was created
 * can force-convert the live session and unlock the Skip-round button without
 * waiting for a fresh session to be born in test mode. Mirrors skip-round's
 * auth posture: no caller identity check — the guard is enableSessionTestMode's
 * own server-side status/source check against the session's DB row (read fresh,
 * never trusted from the request). A non-auto or already-ended session rejects.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: sessionId } = await params;
    const session = await enableSessionTestMode(sessionId);
    return NextResponse.json({ ok: true, session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enable test mode.";
    const status = message.includes("not found")
      ? 404
      : message.includes("only available") || message.includes("Cannot enable")
        ? 403
        : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
