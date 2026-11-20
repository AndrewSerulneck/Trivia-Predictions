import { NextResponse } from "next/server";
import { CandidateError, cleanModel, parsePost, receive } from "@/lib/question-writer/candidates.cjs";
import { MAX_POST_BYTES } from "@/lib/question-writer/rules.cjs";
import { isWriterAuthorized } from "@/lib/questionWriterAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// The private writer repo posts the day's candidates here (docs/speed-trivia-backlog-and-quality-plan.md Phase 4b).
// It inserts into question_candidates and nothing else: no question is read, approved or published here.
// Limits: ≤ 40 items, ≤ 64 KB, one batch per game per UTC day (a retry of it is always idempotent, Phase 7g), ≤ 2 posts a day.
// Each item may carry the writer's bar-test grade (D35, Phase 4d.1); it is checked and kept inside the payload.
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request: Request) {
  if (!isWriterAuthorized(request)) return json({ ok: false, error: "Unauthorized." }, 401);
  if (!supabaseAdmin) return json({ ok: false, error: "Unavailable." }, 503);
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_POST_BYTES) return json({ ok: false, error: "Too large." }, 413);
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > MAX_POST_BYTES) return json({ ok: false, error: "Too large." }, 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "Invalid post." }, 400); }
    const envelope = (body ?? {}) as { game?: unknown; model?: unknown };
    const game = typeof envelope.game === "string" ? envelope.game : "";
    const { items, invalid, graded } = parsePost(body, game);
    const result = await receive({ client: supabaseAdmin, game, source: "chatgpt", model: cleanModel(envelope.model), items });
    return json({ ok: true, ...result, invalid, graded });
  } catch (error) {
    if (error instanceof CandidateError) return json({ ok: false, code: error.code, error: error.message }, error.status);
    return json({ ok: false, error: "Unavailable." }, 503);
  }
}
