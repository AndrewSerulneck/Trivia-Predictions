import type { QuickReviewAudience } from "@/types/speedTriviaQuickReview";

/** Quick Review, Live mode (docs/speed-trivia-backlog-and-quality-plan.md Phase 4c): one writer candidate. */
export type LiveReviewItem = {
  id: string;
  question: string;
  answer: string;
  acceptableAnswers: string[];
  category: string;
  difficulty: string | null;
  area: string | null;
  era: string | null;
  /** Current Events: the https source the writer gave. */
  sourceUrl: string | null;
  /** The writer's one-sentence "why it's true" note (D30); null for older candidates. */
  whyTrue: string | null;
  /** "chatgpt" | "gemini-fallback". */
  source: string;
  createdAt: string;
  audience: QuickReviewAudience | null;
  /** The repeat check couldn't settle it: the existing Live question it may repeat. */
  possibleRepeat: { slug: string; question: string; answer: string } | null;
  /** Answer or acceptable answers changed with E. */
  edited: boolean;
  /** A Speed -> Live rewrite (Phase 4e, D37): the original Speed question and its answer. */
  fromSpeed: { question: string; answer: string } | null;
  /** A rewrite's subject is over the star cap (shown, never a reject). */
  overStarCap: boolean;
};

/** categories: the Live writer's categories, for the filter. */
export type LiveReviewPage = {
  total: number;
  items: LiveReviewItem[];
  kept: number;
  categories: string[];
  /** Questions in a Publish PR that waits on GitHub (pr_open), and one such PR's link ("" when none). */
  waiting: { waiting: number; prUrl: string };
  /** No batch for 2 days, or two Gemini-fallback days in a row (4c.4, D29). */
  writerStopped?: boolean;
};

export type LiveReviewUndoResult = { id: string; status: "pending_review" };

export type LivePublishResult = {
  /** The PR that appended the questions, or the open Publish PR that blocked this one; "" when nothing new needed adding. */
  prUrl: string;
  merged: boolean;
  /** The PR waits on GitHub: a new one wasn't merged (its questions are pr_open), or an open Publish PR blocked this one. */
  waiting: boolean;
  /** Questions added in the PR (published when merged, waiting on GitHub otherwise). */
  published: number;
  /** Already in the file (e.g. a Publish that merged before it could record it). */
  already: number;
  /** Couldn't be published (e.g. Current Events without an expiry); sent back to review as rejected. */
  refused: number;
  files: string[];
};
