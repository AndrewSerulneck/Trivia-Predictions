export type QuickReviewSource = "all" | "older" | "recent";
/** best = highest bar-test score first, then oldest. */
export type QuickReviewSort = "oldest" | "newest" | "best";
export type QuickReviewDecision = "keep" | "reject";
/** waiting = undecided; needs_look / repeats = results of the overnight check (Phase 3). */
export type QuickReviewView = "waiting" | "needs_look" | "repeats";
export type QuickReviewRejectReason = "quality" | "wrong";
/** approved = free fast lane; queued = waits for the overnight check; changed = edited since it was shown. */
export type QuickReviewKeepOutcome = "approved" | "queued" | "changed" | "not_pending";

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

export type QuickReviewBulkResult = {
  processed: number;
  approved: number;
  queued: number;
  rejected: number;
  remaining: number;
};
