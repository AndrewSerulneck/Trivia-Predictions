export type QuickReviewSource = "all" | "older" | "recent";
/** best = highest bar-test score first, then oldest. */
export type QuickReviewSort = "oldest" | "newest" | "best";
export type QuickReviewDecision = "keep" | "reject";
export type QuickReviewRejectReason = "quality" | "wrong";
/** approved = free fast lane; queued = waits for the overnight check; changed = edited since it was shown. */
export type QuickReviewKeepOutcome = "approved" | "queued" | "changed" | "not_pending";

export type QuickReviewFilter = {
  category: string | null;
  source: QuickReviewSource;
  sort: QuickReviewSort;
  /** Bar-test score 1–5 (Phase 2); null = any, including unscored. */
  score: number | null;
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
};

export type QuickReviewPage = { total: number; items: QuickReviewItem[] };

export type QuickReviewBulkResult = {
  processed: number;
  approved: number;
  queued: number;
  rejected: number;
  remaining: number;
};
