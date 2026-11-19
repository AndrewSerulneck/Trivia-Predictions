import "server-only";
import { POLICY_VERSION } from "@/lib/speed-trivia-uniqueness/core.cjs";
import { sign } from "@/lib/speed-trivia-uniqueness/runtime.cjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { tagAllowance, tagUntaggedSpeedQuestions, type TagAllowance } from "@/lib/speedTriviaTagging";
import { TRIVIA_CATEGORIES } from "@/lib/triviaCategories";
import type {
  QuickReviewBulkResult,
  QuickReviewDecision,
  QuickReviewFilter,
  QuickReviewItem,
  QuickReviewKeepOutcome,
  QuickReviewPage,
  QuickReviewRejectReason,
  QuickReviewSource,
  QuickReviewUndoResult,
  QuickReviewView,
} from "@/types/speedTriviaQuickReview";

// Speed Trivia Quick Review (docs/speed-trivia-backlog-and-quality-plan.md, Phase 1).
// Every operation is one bounded RPC (supabase/migrations/20261115151703_speed_trivia_quick_review.sql). The one paid
// call: Keep tags a waiting question that has no subject tag (Phase 4c.1; ~$0.0001 each, at most 25 per request).

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

const parseScore = (value: unknown): number | null => {
  const score = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isInteger(score) && score >= 1 && score <= 5 ? score : null;
};

const VIEWS: ReadonlySet<string> = new Set<QuickReviewView>(["waiting", "needs_look", "repeats"]);
const SOURCES: ReadonlySet<string> = new Set<QuickReviewSource>(["all", "older", "recent", "chatgpt", "gemini"]);

export const parseQuickReviewFilter = (
  input: { category?: unknown; source?: unknown; sort?: unknown; score?: unknown; view?: unknown },
): QuickReviewFilter => {
  const category = typeof input.category === "string" && CATEGORY_VALUES.has(input.category) ? input.category : null;
  const source = typeof input.source === "string" && SOURCES.has(input.source) ? (input.source as QuickReviewSource) : "all";
  const sort = input.sort === "newest" || input.sort === "oldest" ? input.sort : "best";
  const view = typeof input.view === "string" && VIEWS.has(input.view) ? (input.view as QuickReviewView) : "waiting";
  return { category, source, sort, score: parseScore(input.score), view };
};

/** Keyset cursor: the last row shown. `score` is its bar-test score (0 when unscored); used by the best sort. */
export type QuickReviewCursor = { createdAt: string; id: string; score: number };

export const parseQuickReviewCursor = (input: { afterId?: unknown; afterCreated?: unknown; afterScore?: unknown }): QuickReviewCursor | null => {
  const { afterId, afterCreated } = input;
  if (!isQuickReviewId(afterId) || typeof afterCreated !== "string" || Number.isNaN(Date.parse(afterCreated))) return null;
  const score = Number(input.afterScore ?? 0);
  return { id: afterId, createdAt: afterCreated, score: Number.isInteger(score) && score >= 0 && score <= 5 ? score : 0 };
};

type QueueRpc = { total: number | string; rows: QuickReviewItem[]; counts?: Partial<Record<keyof QuickReviewPage["counts"], number | string>> };

/**
 * The writer's "why it's true" notes (D30, Phase 4c.5) for the writer-made rows on a page: one read of at most 100
 * ids, and none when the page has no writer rows. Read here, not in the queue RPC, so no migration was needed.
 * A failed read just shows no notes.
 */
const readWhyTrueNotes = async (items: QuickReviewItem[]): Promise<Map<string, string>> => {
  const ids = items.filter((item) => item.recent).map((item) => item.id).filter(isQuickReviewId).slice(0, 100);
  const notes = new Map<string, string>();
  if (!ids.length) return notes;
  try {
    const { data, error } = await admin().from("trivia_questions")
      .select("id, whyTrue:speed_generation_metadata->>whyTrue").in("id", ids);
    if (error || !Array.isArray(data)) return notes;
    for (const row of data as { id?: unknown; whyTrue?: unknown }[]) {
      if (typeof row.id === "string" && typeof row.whyTrue === "string" && row.whyTrue.trim()) notes.set(row.id, row.whyTrue.trim());
    }
  } catch {}
  return notes;
};

export const readQuickReviewQueue = async (
  filter: QuickReviewFilter,
  after: QuickReviewCursor | null,
  limit = QUICK_REVIEW_PAGE_LIMIT,
  options: { withNotes?: boolean } = {},
): Promise<QuickReviewPage> => {
  const data = await call<QueueRpc>("speed_trivia_review_queue", {
    p_category: filter.category,
    p_source: filter.source,
    p_sort: filter.sort,
    p_after_created: after?.createdAt ?? null,
    p_after_id: after?.id ?? null,
    p_limit: Math.max(1, Math.min(100, Math.floor(limit))),
    p_score_min: filter.score,
    p_score_max: filter.score,
    p_after_score: after && filter.sort === "best" ? after.score : null,
    p_view: filter.view,
  });
  const counts = {
    queued: Number(data.counts?.queued) || 0,
    needsLook: Number(data.counts?.needsLook) || 0,
    repeats: Number(data.counts?.repeats) || 0,
  };
  const items = Array.isArray(data.rows) ? data.rows : [];
  if (!options.withNotes) return { total: Number(data.total) || 0, items, counts };
  const notes = await readWhyTrueNotes(items);
  return { total: Number(data.total) || 0, items: notes.size ? items.map((item) => (notes.has(item.id) ? { ...item, whyTrue: notes.get(item.id) } : item)) : items, counts };
};

export type WriterState = "none" | "silent" | "ok";

/**
 * "Writer stopped" (Phase 4b D13, widened in 4c.4 D29; the Gemini fallback case went in 4f.1), for either game. One read
 * of the newest row. `none`: no run ever (the writer was never turned on). `silent`: the newest run is over 2 days old.
 * Unknown (read failed) is `ok`.
 */
export const readWriterState = async (game: "speed" | "live"): Promise<WriterState> => {
  let rows: unknown;
  try {
    const { data, error } = await admin().from("question_writer_runs").select("run_date")
      .eq("game", game).order("run_date", { ascending: false }).limit(1);
    rows = error ? null : data;
  } catch {
    return "ok";
  }
  if (!Array.isArray(rows)) return "ok";
  if (rows.length === 0) return "none";
  const [latest] = rows as { run_date: string }[];
  const dayMs = 86_400_000;
  return Math.floor(Date.now() / dayMs) * dayMs - Date.parse(latest.run_date) > 2 * dayMs ? "silent" : "ok"; // whole UTC days
};

export const readWriterStopped = async (game: "speed" | "live" = "speed"): Promise<boolean> => {
  return (await readWriterState(game)) === "silent";
};

/**
 * Keep: free instant approval when the row already passed a full-bank check; otherwise queued for overnight.
 * First tags the batch's untagged questions (Phase 4c.1), within `allowance`, so the star cap can admit them.
 */
export const quickKeep = async (rows: { id: string; contentHash: string }[], allowance: TagAllowance = tagAllowance()) => {
  if (rows.length < 1 || rows.length > QUICK_REVIEW_BATCH_LIMIT) throw new QuickReviewError("invalid", "Invalid request.");
  const secret = process.env.SPEED_TRIVIA_ADMISSION_SECRET;
  if (!secret || secret.length < 32) throw new QuickReviewError("unavailable", "Speed Trivia admission is not configured.", 503);
  await tagUntaggedSpeedQuestions(rows.map((row) => row.id), allowance);
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

/** `view` is the list the question is back in: Needs a look when the decision was made there (Phase 3c). */
export const quickUndo = async (id: string): Promise<QuickReviewUndoResult> => {
  const data = await call<{ id: string; status: string; view?: unknown }>("speed_trivia_quick_undo", { p_row_id: id });
  return { id: data.id, status: data.status, view: data.view === "needs_look" ? "needs_look" : "waiting" };
};

/**
 * "Keep all shown" / "Reject all shown": the whole filter, server-side, in pages of 100, capped at `max`
 * (the count Andrew confirmed) and at 1,000 rows / 60 s per request. The caller repeats while `remaining` > 0.
 */
export const runQuickReviewBulk = async (
  decision: QuickReviewDecision,
  filter: QuickReviewFilter,
  max: number,
  now: () => number = Date.now,
  start: QuickReviewCursor | null = null,
): Promise<QuickReviewBulkResult> => {
  // Repeats are already retired; they are restored one at a time with Undo.
  if (filter.view === "repeats") throw new QuickReviewError("invalid", "Invalid request.");
  const started = now();
  const cap = Math.max(0, Math.min(Math.floor(max), BULK_MAX_PER_REQUEST));
  const result: QuickReviewBulkResult = { processed: 0, approved: 0, queued: 0, full: 0, rejected: 0, changed: 0, remaining: 0, next: start };
  // One tagging allowance for the whole request, so tagging can't stretch it past its time limit.
  const allowance = tagAllowance();
  const oldest: QuickReviewFilter = { ...filter, sort: "oldest" };
  // Rows changed under a Keep are re-read once per request with fresh hashes (post-4c.4 review #7).
  let retried = false;
  while (result.processed < cap && now() - started < BULK_TIME_MS) {
    // Decided rows leave the queue; a Keep the star cap refused stays, so paging continues after the last row seen.
    const pageStart = result.next;
    const after = pageStart ? { ...pageStart, score: 0 } : null;
    const page = await readQuickReviewQueue(oldest, after, Math.min(BULK_PAGE, cap - result.processed));
    result.remaining = page.total;
    if (page.items.length === 0) break;
    let progressed = 0;
    let pageFull = 0;
    // Index of this page's first row that changed under the Keep (-1: none). `not_pending` rows have left the queue.
    let firstChanged = -1;
    let pageChanged = 0;
    if (decision === "reject") {
      const rejected = await quickReject(page.items.map((item) => item.id), "quality");
      result.rejected += rejected.length;
      progressed = rejected.length;
    } else {
      const outcomes = await quickKeep(page.items.map(({ id, contentHash }) => ({ id, contentHash })), allowance);
      const byId = new Map(outcomes.map((row) => [row.id, row.outcome]));
      firstChanged = page.items.findIndex((item) => byId.get(item.id) === "changed");
      pageChanged = outcomes.filter((row) => row.outcome === "changed").length;
      // Full rows after the first changed row are read again below, so count them then, not twice.
      const counted = firstChanged < 0 ? page.items : page.items.slice(0, firstChanged);
      pageFull = counted.filter((item) => {
        const outcome = byId.get(item.id);
        return outcome === "subject_full" || outcome === "untagged";
      }).length;
      const approved = outcomes.filter((row) => row.outcome === "approved").length;
      const queued = outcomes.filter((row) => row.outcome === "queued").length;
      result.approved += approved;
      result.queued += queued;
      result.full += pageFull;
      result.processed += pageFull;
      progressed = approved + queued;
    }
    const last = page.items[page.items.length - 1];
    result.next = { createdAt: last.createdAt, id: last.id };
    result.processed += progressed;
    result.remaining = Math.max(0, result.remaining - progressed);
    if (pageChanged > 0) {
      // Put the cursor just before the first changed row, so the changed rows come back with fresh hashes.
      const before = firstChanged > 0 ? page.items[firstChanged - 1] : null;
      result.next = before ? { createdAt: before.createdAt, id: before.id } : pageStart;
      if (retried) {
        result.changed = pageChanged;
        break;
      }
      retried = true;
      continue;
    }
    // Everything left on this page stays waiting (subject full): move on to the next page.
    if (progressed === 0 && pageFull > 0 && decision === "keep") continue;
    // Nothing on this page could be decided; stop rather than loop.
    if (progressed === 0) break;
  }
  return result;
};
