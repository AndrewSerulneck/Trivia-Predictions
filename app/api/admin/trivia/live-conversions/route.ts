import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import {
  LIVE_CONVERSION_STATUS_LIMIT,
  LiveConversionError,
  cancelLiveConversion,
  isConversionId,
  queueLiveConversion,
  readLiveConversionStatus,
} from "@/lib/liveConversions";
import { REVIEW_NO_CACHE } from "@/lib/triviaReviewTransport";

// "Make Live" (docs/speed-trivia-backlog-and-quality-plan.md Phase 4e, D37): queue a Speed question for the nightly
// ChatGPT writer to rewrite as a Live question, cancel a queued one, or read the list's labels. Free: one RPC each.

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: REVIEW_NO_CACHE });

const fail = (error: unknown) =>
  error instanceof LiveConversionError
    ? json({ ok: false, code: error.code, error: error.message }, error.status)
    : json({ ok: false, code: "failed", error: "Try again." }, 500);

const questionIdFrom = async (request: Request): Promise<string | null> => {
  const body = (await request.json().catch(() => ({}))) as { questionId?: unknown };
  return isConversionId(body.questionId) ? body.questionId : null;
};

export async function GET(request: Request) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
    const raw = new URL(request.url).searchParams.get("ids") ?? "";
    const ids = [...new Set(raw.split(",").map((id) => id.trim()).filter(Boolean))];
    if (ids.length > LIVE_CONVERSION_STATUS_LIMIT || !ids.every(isConversionId)) return json({ ok: false, error: "Invalid request." }, 400);
    return json({ ok: true, states: await readLiveConversionStatus(ids) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
    const questionId = await questionIdFrom(request);
    if (!questionId) return json({ ok: false, error: "Invalid request." }, 400);
    const queued = await queueLiveConversion(questionId);
    return json({ ok: true, state: queued.status === "sent" ? "converting" : "queued", already: queued.already });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
    const questionId = await questionIdFrom(request);
    if (!questionId) return json({ ok: false, error: "Invalid request." }, 400);
    return json({ ok: true, cancelled: await cancelLiveConversion(questionId) });
  } catch (error) {
    return fail(error);
  }
}
