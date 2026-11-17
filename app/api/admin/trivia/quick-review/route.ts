import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import {
  QUICK_REVIEW_BATCH_LIMIT,
  QuickReviewError,
  isContentHash,
  isQuickReviewId,
  parseQuickReviewCursor,
  parseQuickReviewFilter,
  quickKeep,
  quickReject,
  quickUndo,
  readQuickReviewQueue,
  readWriterStopped,
  runQuickReviewBulk,
} from "@/lib/speedTriviaQuickReview";
import { REVIEW_NO_CACHE } from "@/lib/triviaReviewTransport";

// Speed Trivia Quick Review. Free: no paid checks run here (docs/speed-trivia-backlog-and-quality-plan.md Phase 1).
export const maxDuration = 120;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: REVIEW_NO_CACHE });

const fail = (error: unknown) =>
  error instanceof QuickReviewError
    ? json({ ok: false, code: error.code, error: error.message }, error.status)
    : json({ ok: false, code: "failed", error: "Quick Review failed. Try again." }, 500);

export async function GET(request: Request) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
    const url = new URL(request.url);
    const filter = parseQuickReviewFilter({
      category: url.searchParams.get("category"),
      source: url.searchParams.get("source"),
      sort: url.searchParams.get("sort"),
      score: url.searchParams.get("score"),
      view: url.searchParams.get("view"),
    });
    const after = parseQuickReviewCursor({
      afterId: url.searchParams.get("afterId"),
      afterCreated: url.searchParams.get("afterCreated"),
      afterScore: url.searchParams.get("afterScore"),
    });
    const [page, writerStopped] = await Promise.all([readQuickReviewQueue(filter, after, undefined, { withNotes: true }), after ? false : readWriterStopped()]);
    return json({ ok: true, ...page, writerStopped });
  } catch (error) {
    return fail(error);
  }
}

type PostBody = {
  action?: unknown;
  rows?: unknown;
  ids?: unknown;
  id?: unknown;
  reason?: unknown;
  decision?: unknown;
  category?: unknown;
  source?: unknown;
  score?: unknown;
  view?: unknown;
  max?: unknown;
  after?: unknown;
};

export async function POST(request: Request) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
    const body = (await request.json().catch(() => ({}))) as PostBody;

    if (body.action === "keep") {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      const valid = rows.filter((row): row is { id: string; contentHash: string } =>
        isQuickReviewId((row as { id?: unknown })?.id) && isContentHash((row as { contentHash?: unknown })?.contentHash));
      const unique = [...new Map(valid.map((row) => [row.id, { id: row.id, contentHash: row.contentHash }])).values()];
      if (unique.length === 0 || unique.length !== rows.length || unique.length > QUICK_REVIEW_BATCH_LIMIT) {
        return json({ ok: false, error: "Invalid request." }, 400);
      }
      return json({ ok: true, rows: await quickKeep(unique) });
    }

    if (body.action === "reject") {
      const ids = Array.isArray(body.ids) ? [...new Set(body.ids)] : [];
      // Exact reasons only: a quality reject releases the fact (D5), so a typo must never become one.
      const reason = body.reason === "wrong" || body.reason === "quality" ? body.reason : null;
      if (!reason || ids.length === 0 || ids.length > QUICK_REVIEW_BATCH_LIMIT || !ids.every(isQuickReviewId)) {
        return json({ ok: false, error: "Invalid request." }, 400);
      }
      return json({ ok: true, rejected: await quickReject(ids, reason) });
    }

    if (body.action === "undo") {
      if (!isQuickReviewId(body.id)) return json({ ok: false, error: "Invalid request." }, 400);
      return json({ ok: true, ...(await quickUndo(body.id)) });
    }

    if (body.action === "bulk") {
      const decision = body.decision === "keep" || body.decision === "reject" ? body.decision : null;
      const max = Number(body.max);
      if (!decision || !Number.isSafeInteger(max) || max < 1) return json({ ok: false, error: "Invalid request." }, 400);
      const filter = parseQuickReviewFilter({ category: body.category, source: body.source, score: body.score, view: body.view });
      const start = body.after && typeof body.after === "object" ? body.after as { id?: unknown; createdAt?: unknown } : null;
      const after = start ? parseQuickReviewCursor({ afterId: start.id, afterCreated: start.createdAt }) : null;
      return json({ ok: true, ...(await runQuickReviewBulk(decision, filter, max, Date.now, after)) });
    }

    return json({ ok: false, error: "Unknown action." }, 400);
  } catch (error) {
    return fail(error);
  }
}
