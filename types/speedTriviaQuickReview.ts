export type QuickReviewSource = "all" | "older" | "recent";
export type QuickReviewSort = "oldest" | "newest";
export type QuickReviewDecision = "keep" | "reject";
export type QuickReviewRejectReason = "quality" | "wrong";
/** approved = free fast lane; queued = waits for the overnight check; changed = edited since it was shown. */
export type QuickReviewKeepOutcome = "approved" | "queued" | "changed" | "not_pending";

export type QuickReviewFilter = {
  category: string | null;
  source: QuickReviewSource;
  sort: QuickReviewSort;
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
};

export type QuickReviewPage = { total: number; items: QuickReviewItem[] };

export type QuickReviewBulkResult = {
  processed: number;
  approved: number;
  queued: number;
  rejected: number;
  remaining: number;
};
