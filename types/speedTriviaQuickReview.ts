/** chatgpt / gemini = the daily writer (Phase 4b): ChatGPT, or the Gemini fallback. */
export type QuickReviewSource = "all" | "older" | "recent" | "chatgpt" | "gemini";
/** best = highest bar-test score first, then oldest. */
export type QuickReviewSort = "oldest" | "newest" | "best";
export type QuickReviewDecision = "keep" | "reject";
/** waiting = undecided; needs_look / repeats = results of the overnight check (Phase 3). */
export type QuickReviewView = "waiting" | "needs_look" | "repeats";
export type QuickReviewRejectReason = "quality" | "wrong";
/** approved = free fast lane; queued = waits for the overnight check; changed = edited since it was shown.
 * subject_full / untagged (Phase 4a.1 star cap): nothing written, the question stays waiting. */
export type QuickReviewKeepOutcome = "approved" | "queued" | "changed" | "not_pending" | "subject_full" | "untagged";

export type QuickReviewFilter = {
  category: string | null;
  source: QuickReviewSource;
  sort: QuickReviewSort;
  /** Bar-test score 1–5 (Phase 2); null = any, including unscored. */
  score: number | null;
  view: QuickReviewView;
};

/** Phase 2 "bar test" (lib/speed-trivia-quality/audience.cjs). */
export type QuickReviewAudience = {
  score: number;
  familiar: number;
  fun: number;
  estCorrect: number;
  flags: string[];
};

export type QuickReviewItem = {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  category: string | null;
  difficulty: string | null;
  createdAt: string;
  /** Written by the nightly writer, which admitted it against the whole bank. */
  recent: boolean;
  /** The daily writer's source ("chatgpt" | "gemini-fallback"); null for anything older. */
  source?: string | null;
  /** Variety map cell, from the writer's tag. */
  area?: string | null;
  era?: string | null;
  /** Current Events: the https source the writer gave. */
  sourceUrl?: string | null;
  /** The writer's one-sentence "why it's true" note (D30); null for anything older. */
  whyTrue?: string | null;
  contentHash: string;
  /** Null when unscored, or when the question changed after it was scored. */
  audience: QuickReviewAudience | null;
  /** The overnight check's note (needs_look / repeats views). */
  note?: string | null;
  /** The approved question this one repeats (repeats view). */
  match?: { id: string; question: string; answer: string } | null;
};

/** Undo result: `view` is the list the question is back in (Phase 3c). */
export type QuickReviewUndoResult = { id: string; status: string; view: Extract<QuickReviewView, "waiting" | "needs_look"> };

export type QuickReviewCounts = { queued: number; needsLook: number; repeats: number };

export type QuickReviewPage = { total: number; items: QuickReviewItem[]; counts: QuickReviewCounts };

/** True after 2 days in a row on the Gemini fallback: the ChatGPT login needs renewing (Phase 4b, D13). */
export type QuickReviewWriterStatus = { writerStopped: boolean };

export type QuickReviewBulkResult = {
  processed: number;
  approved: number;
  queued: number;
  /** Kept but left waiting: the subject already has 5 approved questions (or no tag yet). */
  full: number;
  /** Where the next request continues (rows left waiting stay in the queue, so paging can't restart at the top). */
  next: { createdAt: string; id: string } | null;
  rejected: number;
  /** Rows that changed under the Keep twice in this request; they stay waiting, after `next`. */
  changed: number;
  remaining: number;
};
