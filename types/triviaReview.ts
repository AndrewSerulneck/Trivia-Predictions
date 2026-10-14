export type TriviaReviewMatch = { id: string; question: string; answer: string };
export type TriviaReviewRow = {
  id: string;
  outcome: "approved" | "repeat" | "unresolved";
  code?: string;
  reason?: string;
  matches?: TriviaReviewMatch[];
};
export type TriviaReviewCounts = { checked: number; approved: number; repeats: number; unresolved: number; remaining: number };
export type TriviaBulkResult = {
  ok: boolean;
  savedIds: string[];
  repeats?: { id: string; code?: string; reason?: string; conflicts?: string[]; matches?: TriviaReviewMatch[] }[];
  holds?: { id: string; code?: string; reason?: string; matches?: TriviaReviewMatch[] }[];
  notProcessed?: string[];
  error?: string;
  code?: string;
  paused?: boolean;
  needsRecovery?: boolean;
  recovered?: boolean;
  unconfirmed?: boolean;
};
export type TriviaReviewRecord =
  | { type: "start"; version: 1; mode: "review"; total: number }
  | { type: "start"; version: 1; mode: "diagnostic"; durationMs: number }
  | { type: "heartbeat"; elapsedMs: number }
  | { type: "checking"; id: string; question: string }
  | { type: "row"; result: TriviaReviewRow; counts: TriviaReviewCounts }
  | { type: "complete"; result: TriviaBulkResult }
  | { type: "diagnostic_complete"; elapsedMs: number; questionReads: 0; questionWrites: 0; providerCalls: 0 };
