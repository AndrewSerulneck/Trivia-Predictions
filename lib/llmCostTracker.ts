import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ── Pricing (USD per 1M tokens, as of July 2026) ────────────────────────────

type ModelPrice = { input: number; output: number };

const ANTHROPIC_PRICING: Record<string, ModelPrice> = {
  "claude-haiku-4-5-20251001": { input: 0.80, output: 4.00 },
  "claude-haiku-4-5":          { input: 0.80, output: 4.00 },
  "claude-opus-4-8":           { input: 15.00, output: 75.00 },
};

const GEMINI_PRICING: Record<string, ModelPrice> = {
  "gemini-2.5-flash": { input: 0.15, output: 0.60 },
  "gemini-1.5-flash": { input: 0.075, output: 0.30 },
};

// ── Public types ────────────────────────────────────────────────────────────

export type LlmUsageFeature =
  | "category_blitz_grading"
  | "category_blitz_moderation"
  | "username_moderation"
  | "live_trivia_rewrite";

export type LlmUsageProvider = "anthropic" | "gemini";

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
  const price = ANTHROPIC_PRICING[model] ?? GEMINI_PRICING[model];
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

type GeminiUsage = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
};

/**
 * Track a Gemini API call. Fire-and-forget — never throws.
 */
export async function trackGeminiUsage(
  usage: GeminiUsage,
  model: string,
  feature: LlmUsageFeature,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (!supabaseAdmin) return;
  const inputTokens = usage.promptTokenCount ?? 0;
  const outputTokens = usage.candidatesTokenCount ?? 0;
  const costCents = estimateCost(model, inputTokens, outputTokens);
  try {
    await supabaseAdmin.from("llm_usage_logs").insert({
      provider: "gemini",
      model,
      feature,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_cents: costCents,
      metadata: metadata ?? null,
    });
  } catch (err) {
    console.warn("[llmCostTracker] Failed to log Gemini usage:", err instanceof Error ? err.message : err);
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

    // Aggregate: by feature
    const { data: byFeatureRaw } = await supabaseAdmin
      .from("llm_usage_logs")
      .select("feature, count:feature, sum:input_tokens, sum:output_tokens, sum:cost_cents")
      .gte("created_at", from)
      .lte("created_at", to)
      .returns<{ feature: LlmUsageFeature; count: number; sum: { input_tokens: number; output_tokens: number; cost_cents: number } }[]>();

    // Aggregate: by model
    const { data: byModelRaw } = await supabaseAdmin
      .from("llm_usage_logs")
      .select("model, count:model, sum:input_tokens, sum:output_tokens, sum:cost_cents")
      .gte("created_at", from)
      .lte("created_at", to)
      .returns<{ model: string; count: number; sum: { input_tokens: number; output_tokens: number; cost_cents: number } }[]>();

    const byFeature = (byFeatureRaw ?? []).map((r) => ({
      feature: r.feature,
      calls: r.count,
      inputTokens: r.sum.input_tokens,
      outputTokens: r.sum.output_tokens,
      costCents: Number(r.sum.cost_cents),
    }));

    const byModel = (byModelRaw ?? []).map((r) => ({
      model: r.model,
      calls: r.count,
      inputTokens: r.sum.input_tokens,
      outputTokens: r.sum.output_tokens,
      costCents: Number(r.sum.cost_cents),
    }));

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
