import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import {
  LiveReviewError,
  isLiveCategory,
  isLiveReviewId,
  liveDecide,
  liveEdit,
  liveUndo,
  parseLiveEdit,
  publishLive,
  readLiveReviewQueue,
} from "@/lib/liveTriviaReview";
import { readWriterStopped } from "@/lib/speedTriviaQuickReview";
import { REVIEW_NO_CACHE } from "@/lib/triviaReviewTransport";

// Quick Review, Live mode (docs/speed-trivia-backlog-and-quality-plan.md Phase 4c). Free: no paid checks here.
// Publish writes only through a GitHub PR that appends to data/live-trivia/categories/ (D10).
export const maxDuration = 120;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: REVIEW_NO_CACHE });

const fail = (error: unknown) =>
  error instanceof LiveReviewError
    ? json({ ok: false, code: error.code, error: error.message }, error.status)
    : json({ ok: false, code: "failed", error: "Quick Review failed. Try again." }, 500);

export async function GET(request: Request) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
    const category = new URL(request.url).searchParams.get("category");
    if (category && !isLiveCategory(category)) return json({ ok: false, error: "Invalid request." }, 400);
    const [page, writerStopped] = await Promise.all([readLiveReviewQueue(category || null), readWriterStopped("live")]);
    return json({ ok: true, ...page, writerStopped });
  } catch (error) {
    return fail(error);
  }
}

type PostBody = { action?: unknown; id?: unknown; answer?: unknown; acceptableAnswers?: unknown };

export async function POST(request: Request) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
    const body = (await request.json().catch(() => ({}))) as PostBody;

    if (body.action === "keep" || body.action === "reject") {
      if (!isLiveReviewId(body.id)) return json({ ok: false, error: "Invalid request." }, 400);
      return json({ ok: true, decided: await liveDecide(body.id, body.action) });
    }
    if (body.action === "undo") {
      if (!isLiveReviewId(body.id)) return json({ ok: false, error: "Invalid request." }, 400);
      return json({ ok: true, ...(await liveUndo(body.id)) });
    }
    if (body.action === "edit") {
      const edit = parseLiveEdit(body.answer, body.acceptableAnswers);
      if (!isLiveReviewId(body.id) || !edit) return json({ ok: false, error: "Answer: up to 2 words, or a number." }, 400);
      await liveEdit(body.id, edit);
      return json({ ok: true, ...edit });
    }
    if (body.action === "publish") {
      return json({ ok: true, ...(await publishLive()) });
    }
    return json({ ok: false, error: "Unknown action." }, 400);
  } catch (error) {
    return fail(error);
  }
}
