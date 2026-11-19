import { NextResponse } from "next/server";
import { CandidateError, parseConversions, receiveConversions } from "@/lib/question-writer/candidates.cjs";
import { MAX_POST_BYTES } from "@/lib/question-writer/rules.cjs";
import { isWriterAuthorized } from "@/lib/questionWriterAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// The private writer posts its Speed -> Live rewrites here (docs/speed-trivia-backlog-and-quality-plan.md Phase 4e,
// D37). Each becomes a Live writer candidate, gated by the nightly like any other; a decline records its reason.
// Same writer token as /candidates; ≤ 20 items, ≤ 64 KB; idempotent per request. Nothing here writes trivia_questions.
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
    const { items, invalid, graded } = parseConversions(body);
    const result = await receiveConversions({ client: supabaseAdmin, items });
    return json({ ok: true, ...result, invalid, graded });
  } catch (error) {
    if (error instanceof CandidateError) return json({ ok: false, code: error.code, error: error.message }, error.status);
    return json({ ok: false, error: "Unavailable." }, 503);
  }
}
