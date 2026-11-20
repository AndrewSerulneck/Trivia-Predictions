import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ── Pricing (USD per 1M tokens, as of July 2026) ────────────────────────────

type ModelPrice = { input: number; output: number };

const ANTHROPIC_PRICING: Record<string, ModelPrice> = {
  "claude-haiku-4-5-20251001": { input: 0.80, output: 4.00 },
  "claude-haiku-4-5":          { input: 0.80, output: 4.00 },
  "claude-opus-4-8":           { input: 15.00, output: 75.00 },
};

// ── Public types ────────────────────────────────────────────────────────────

export type LlmUsageFeature =
  // OpenAI question checks (Phase 4f.2): one row per model per run, written by lib/openai/ledger.cjs
  | "speed_question_checks"
  | "live_question_checks"
  | "question_tagging"
  // category_blitz_grading/moderation: not emitted anywhere yet — no caller instruments Category Blitz
  | "category_blitz_grading"
  | "category_blitz_moderation"
  | "username_moderation"
  | "live_trivia_rewrite";

// "gemini" stays readable for rows written before Phase 4f.2; nothing writes it any more.
export type LlmUsageProvider = "anthropic" | "gemini" | "openai";

export type LlmUsageLogRow = {
  id: string;
  provider: LlmUsageProvider;
  model: string;
  feature: LlmUsageFeature;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type LlmCostSummary = {
  totalCostCents: number;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byFeature: { feature: LlmUsageFeature; calls: number; inputTokens: number; outputTokens: number; costCents: number }[];
  byModel: { model: string; calls: number; inputTokens: number; outputTokens: number; costCents: number }[];
  recent: LlmUsageLogRow[];
};

// ── Core helpers ────────────────────────────────────────────────────────────

/**
 * Compute estimated cost in cents from model name and token counts.
 * Falls back to 0 if the model is unrecognised.
 */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = ANTHROPIC_PRICING[model];
  if (!price) return 0;
  const costUsd = (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
  return Number((costUsd * 100).toFixed(4)); // convert USD → cents, keep 4 decimals
}

/**
 * Infer provider from model name.
 */
export function inferProvider(model: string): LlmUsageProvider {
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gemini-")) return "gemini";
  if (model.startsWith("gpt-")) return "openai";
  return "anthropic";
}

// ── Tracking helpers (fire-and-forget) ──────────────────────────────────────

type AnthropicUsage = {
  input_tokens: number;
  output_tokens: number;
};

/**
 * Track an Anthropic API call. Fire-and-forget — never throws.
 */
export async function trackAnthropicUsage(
  usage: AnthropicUsage,
  model: string,
  feature: LlmUsageFeature,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (!supabaseAdmin) return;
  const costCents = estimateCost(model, usage.input_tokens, usage.output_tokens);
  try {
    await supabaseAdmin.from("llm_usage_logs").insert({
      provider: "anthropic",
      model,
      feature,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cost_cents: costCents,
      metadata: metadata ?? null,
    });
  } catch (err) {
    console.warn("[llmCostTracker] Failed to log Anthropic usage:", err instanceof Error ? err.message : err);
  }
}

// ── Query helpers ───────────────────────────────────────────────────────────

function buildRangeFilter(range: "today" | "week" | "month" | "all"): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  let from: string;

  switch (range) {
    case "today": {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      from = start.toISOString();
      break;
    }
    case "week": {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      from = start.toISOString();
      break;
    }
    case "month": {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 1);
      from = start.toISOString();
      break;
    }
    default:
      from = "1970-01-01T00:00:00Z";
  }

  return { from, to };
}

// The dashboard's widest range ("all") reads at most this many rows. The OpenAI ledger writes a few a night.
const SUMMARY_ROW_LIMIT = 20_000;

export type UsageSummaryRow = {
  feature: LlmUsageFeature;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_cents: number | string | null;
  calls?: unknown;
};

/** Calls a ledger row stands for: metadata.calls when it's a positive whole number, else 1. */
export const callsOf = (row: { calls?: unknown }): number => {
  const calls = Number(row.calls);
  return Number.isSafeInteger(calls) && calls > 0 ? calls : 1;
};

type Totals = { calls: number; inputTokens: number; outputTokens: number; costCents: number };

/** Sum rows by feature and by model. */
export const summarizeUsage = (rows: UsageSummaryRow[]): Pick<LlmCostSummary, "byFeature" | "byModel"> => {
  const features = new Map<LlmUsageFeature, Totals>();
  const models = new Map<string, Totals>();
  const add = <K,>(map: Map<K, Totals>, key: K, row: UsageSummaryRow) => {
    const entry = map.get(key) ?? { calls: 0, inputTokens: 0, outputTokens: 0, costCents: 0 };
    entry.calls += callsOf(row);
    entry.inputTokens += Number(row.input_tokens) || 0;
    entry.outputTokens += Number(row.output_tokens) || 0;
    entry.costCents += Number(row.cost_cents) || 0;
    map.set(key, entry);
  };
  for (const row of rows) {
    add(features, row.feature, row);
    add(models, row.model, row);
  }
  return {
    byFeature: [...features].map(([feature, totals]) => ({ feature, ...totals })),
    byModel: [...models].map(([model, totals]) => ({ model, ...totals })),
  };
};

/**
 * Query aggregated cost summary for the admin dashboard.
 */
export async function getCostSummary(
  range: "today" | "week" | "month" | "all" = "month",
): Promise<LlmCostSummary> {
  const empty: LlmCostSummary = {
    totalCostCents: 0,
    totalCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    byFeature: [],
    byModel: [],
    recent: [],
  };

  if (!supabaseAdmin) return empty;

  const { from, to } = buildRangeFilter(range);

  try {
    // Recent entries
    const { data: recent } = await supabaseAdmin
      .from("llm_usage_logs")
      .select("*")
      .gte("created_at", from)
      .lte("created_at", to)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<LlmUsageLogRow[]>();

    // Totals: one bounded read, summed here (Phase 7e, R2 #29.3). An OpenAI ledger row covers a whole run, with the
    // real call count in metadata.calls; any other row is one call.
    const { data: usageRows } = await supabaseAdmin
      .from("llm_usage_logs")
      .select("feature, model, input_tokens, output_tokens, cost_cents, calls:metadata->calls")
      .gte("created_at", from)
      .lte("created_at", to)
      .limit(SUMMARY_ROW_LIMIT)
      .returns<UsageSummaryRow[]>();

    const { byFeature, byModel } = summarizeUsage(usageRows ?? []);

    const totalCostCents = byFeature.reduce((acc, f) => acc + f.costCents, 0);
    const totalCalls = byFeature.reduce((acc, f) => acc + f.calls, 0);
    const totalInputTokens = byFeature.reduce((acc, f) => acc + f.inputTokens, 0);
    const totalOutputTokens = byFeature.reduce((acc, f) => acc + f.outputTokens, 0);

    return {
      totalCostCents,
      totalCalls,
      totalInputTokens,
      totalOutputTokens,
      byFeature,
      byModel,
      recent: recent ?? [],
    };
  } catch (err) {
    console.warn("[llmCostTracker] Failed to query cost summary:", err instanceof Error ? err.message : err);
    return empty;
  }
}

/**
 * Delete records older than `retentionDays`. Used by a cron endpoint.
 */
export async function cleanupOldRecords(retentionDays = 90): Promise<number> {
  if (!supabaseAdmin) return 0;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const { data, error } = await supabaseAdmin
    .from("llm_usage_logs")
    .delete()
    .lt("created_at", cutoff.toISOString())
    .select("id");

  if (error) {
    console.warn("[llmCostTracker] Cleanup failed:", error.message);
    return 0;
  }

  return data?.length ?? 0;
}
