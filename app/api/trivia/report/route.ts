import { NextResponse } from "next/server";
import { resolveRequestUserId } from "@/lib/serverSession";
import { isQuestionReportGame } from "@/lib/questionReportReasons";
import { submitQuestionReport } from "@/lib/questionReports";

// Phase 4c.7 (D32): a player reports a question they have answered. Server-only table; see lib/questionReports.ts.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  let body: { userId?: unknown; game?: unknown; questionId?: unknown; slug?: unknown; reason?: unknown; note?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't send. Try again." }, { status: 400 });
  }

  // As POST /api/trivia: the signed session when enforced; the claimed id only without SESSION_SECRET (local dev).
  const { userId, forbidden } = resolveRequestUserId(request, typeof body.userId === "string" ? body.userId : null);
  if (forbidden || !userId || !UUID.test(userId)) {
    return NextResponse.json({ ok: false, error: "Session required." }, { status: 401 });
  }
  if (!isQuestionReportGame(body.game)) {
    return NextResponse.json({ ok: false, error: "Pick a reason." }, { status: 400 });
  }

  const outcome = await submitQuestionReport({
    userId,
    game: body.game,
    questionId: typeof body.questionId === "string" ? body.questionId : undefined,
    slug: typeof body.slug === "string" ? body.slug : undefined,
    reason: body.reason,
    note: body.note,
  });
  if (!outcome.ok) return NextResponse.json({ ok: false, error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true, message: "Sent." });
}
