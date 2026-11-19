export type LedgerFeature = "speed_question_checks" | "live_question_checks" | "question_tagging" | "live_trivia_rewrite";
export const FEATURES: readonly LedgerFeature[];
export type ModelUsage = { calls: number; inputTokens: number; outputTokens: number; dollars: number };
export type LedgerRow = {
  provider: "openai"; model: string; feature: LedgerFeature; input_tokens: number; output_tokens: number; cost_cents: number;
  metadata: Record<string, unknown>;
};
type LedgerClient = { from: (table: string) => unknown } | null | undefined;
export function rowsFor(input: { feature: LedgerFeature; byModel: Record<string, ModelUsage> | null | undefined; metadata?: Record<string, unknown> | null }): LedgerRow[];
export function recordUsage(client: LedgerClient, input: { feature: LedgerFeature; byModel: Record<string, ModelUsage> | null | undefined; metadata?: Record<string, unknown> | null }): Promise<number>;
export function recordBudget(client: LedgerClient, input: { feature: LedgerFeature; budget: { summary: () => Record<string, unknown> } | null | undefined; metadata?: Record<string, unknown> | null }): Promise<number>;
