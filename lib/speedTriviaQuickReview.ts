import "server-only";
import { POLICY_VERSION } from "@/lib/speed-trivia-uniqueness/core.cjs";
import { sign } from "@/lib/speed-trivia-uniqueness/runtime.cjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { TRIVIA_CATEGORIES } from "@/lib/triviaCategories";
import type {
  QuickReviewBulkResult,
  QuickReviewDecision,
  QuickReviewFilter,
  QuickReviewItem,
  QuickReviewKeepOutcome,
  QuickReviewPage,
  QuickReviewRejectReason,
} from "@/types/speedTriviaQuickReview";

// Speed Trivia Quick Review (docs/speed-trivia-backlog-and-quality-plan.md, Phase 1).
// No paid calls: every operation is one bounded RPC (supabase/migrations/20261115151703_speed_trivia_quick_review.sql).

export const QUICK_REVIEW_PAGE_LIMIT = 50;
export const QUICK_REVIEW_BATCH_LIMIT = 200;
const BULK_PAGE = 100;
const BULK_MAX_PER_REQUEST = 1000;
const BULK_TIME_MS = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const CATEGORY_VALUES: ReadonlySet<string> = new Set(TRIVIA_CATEGORIES.map((category) => category.dbValue));

export class QuickReviewError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
  }
}

const admin = () => {
  if (!supabaseAdmin) throw new QuickReviewError("unavailable", "Supabase admin client is not configured.", 500);
  return supabaseAdmin;
};

const call = async <T,>(name: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await admin().rpc(name, args);
  if (error) {
    const message = error.message ?? "";
    if (/quick-review-undo-drift|quick-review-nothing-to-undo/.test(message) || error.code === "23505") {
      throw new QuickReviewError("undo_refused", "Can't undo. It changed since.", 409);
    }
    if (/invalid-quick-review/.test(message)) throw new QuickReviewError("invalid", "Invalid request.", 400);
    throw new QuickReviewError("unavailable", "Quick Review is unavailable. Try again.", 503);
  }
  return data as T;
};

export const isQuickReviewId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
export const isContentHash = (value: unknown): value is string => typeof value === "string" && HASH.test(value);

export const parseQuickReviewFilter = (input: { category?: unknown; source?: unknown; sort?: unknown }): QuickReviewFilter => {
  const category = typeof input.category === "string" && CATEGORY_VALUES.has(input.category) ? input.category : null;
  const source = input.source === "older" || input.source === "recent" ? input.source : "all";
  const sort = input.sort === "newest" ? "newest" : "oldest";
  return { category, source, sort };
};

type QueueRpc = { total: number | string; rows: QuickReviewItem[] };

export const readQuickReviewQueue = async (
  filter: QuickReviewFilter,
  after: { createdAt: string; id: string } | null,
  limit = QUICK_REVIEW_PAGE_LIMIT,
): Promise<QuickReviewPage> => {
  const data = await call<QueueRpc>("speed_trivia_review_queue", {
    p_category: filter.category,
    p_source: filter.source,
    p_sort: filter.sort,
    p_after_created: after?.createdAt ?? null,
    p_after_id: after?.id ?? null,
    p_limit: Math.max(1, Math.min(100, Math.floor(limit))),
  });
  return { total: Number(data.total) || 0, items: Array.isArray(data.rows) ? data.rows : [] };
};

/** Keep: free instant approval when the row already passed a full-bank check; otherwise queued for overnight. */
export const quickKeep = async (rows: { id: string; contentHash: string }[]) => {
  if (rows.length < 1 || rows.length > QUICK_REVIEW_BATCH_LIMIT) throw new QuickReviewError("invalid", "Invalid request.");
  const secret = process.env.SPEED_TRIVIA_ADMISSION_SECRET;
  if (!secret || secret.length < 32) throw new QuickReviewError("unavailable", "Speed Trivia admission is not configured.", 503);
  const envelope = {
    operation: "quick_keep",
    policyVersion: POLICY_VERSION,
    expiresAt: Date.now() + 120_000,
    rows: rows.map(({ id, contentHash }) => ({ id, contentHash })),
  };
  const data = await call<{ rows: { id: string; outcome: QuickReviewKeepOutcome }[] }>("speed_trivia_quick_keep", {
    p_check: envelope,
    p_signature: sign(secret, envelope),
  });
  return data.rows;
};

export const quickReject = async (ids: string[], reason: QuickReviewRejectReason): Promise<string[]> => {
  if (ids.length < 1 || ids.length > QUICK_REVIEW_BATCH_LIMIT) throw new QuickReviewError("invalid", "Invalid request.");
  const data = await call<{ rejected: string[] }>("speed_trivia_quick_reject", { p_row_ids: ids, p_reason: reason });
  return data.rejected;
};

export const quickUndo = async (id: string): Promise<{ id: string; status: string }> =>
  call<{ id: string; status: string }>("speed_trivia_quick_undo", { p_row_id: id });

/**
 * "Keep all shown" / "Reject all shown": the whole filter, server-side, in pages of 100, capped at `max`
 * (the count Andrew confirmed) and at 1,000 rows / 60 s per request. The caller repeats while `remaining` > 0.
 */
export const runQuickReviewBulk = async (
  decision: QuickReviewDecision,
  filter: QuickReviewFilter,
  max: number,
  now: () => number = Date.now,
): Promise<QuickReviewBulkResult> => {
  const started = now();
  const cap = Math.max(0, Math.min(Math.floor(max), BULK_MAX_PER_REQUEST));
  const result: QuickReviewBulkResult = { processed: 0, approved: 0, queued: 0, rejected: 0, remaining: 0 };
  const oldest = { ...filter, sort: "oldest" as const };
  while (result.processed < cap && now() - started < BULK_TIME_MS) {
    // Decided rows leave the queue, so the first page is always the next undecided one.
    const page = await readQuickReviewQueue(oldest, null, Math.min(BULK_PAGE, cap - result.processed));
    result.remaining = page.total;
    if (page.items.length === 0) break;
    let progressed = 0;
    if (decision === "reject") {
      const rejected = await quickReject(page.items.map((item) => item.id), "quality");
      result.rejected += rejected.length;
      progressed = rejected.length;
    } else {
      const outcomes = await quickKeep(page.items.map(({ id, contentHash }) => ({ id, contentHash })));
      const approved = outcomes.filter((row) => row.outcome === "approved").length;
      const queued = outcomes.filter((row) => row.outcome === "queued").length;
      result.approved += approved;
      result.queued += queued;
      progressed = approved + queued;
    }
    result.processed += progressed;
    result.remaining = Math.max(0, result.remaining - progressed);
    // A concurrent writer changed every row on this page; stop rather than loop.
    if (progressed === 0) break;
  }
  return result;
};
