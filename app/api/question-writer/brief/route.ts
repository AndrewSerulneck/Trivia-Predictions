import { NextResponse } from "next/server";
import { BriefError, buildBrief } from "@/lib/question-writer/brief.cjs";
import { isWriterAuthorized } from "@/lib/questionWriterAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Today's writing brief for the private writer repo (docs/speed-trivia-backlog-and-quality-plan.md Phase 4b).
// Two bounded reads per call; called about once a day per game.
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function GET(request: Request) {
  if (!isWriterAuthorized(request)) return json({ ok: false, error: "Unauthorized." }, 401);
  if (!supabaseAdmin) return json({ ok: false, error: "Unavailable." }, 503);
  try {
    const game = new URL(request.url).searchParams.get("game") ?? "";
    const brief = await buildBrief({ client: supabaseAdmin, game });
    return json({ ok: true, ...brief });
  } catch (error) {
    if (error instanceof BriefError && error.code === "game_not_ready") return json({ ok: false, error: error.message }, 404);
    return json({ ok: false, error: "Unavailable." }, 503);
  }
}
