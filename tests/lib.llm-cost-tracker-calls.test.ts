import { describe, expect, it, vi } from "vitest";

// Phase 7e (R2 #29.3): the cost dashboard counts calls, not ledger rows. An OpenAI ledger row covers a whole run.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: null }));
const { callsOf, summarizeUsage } = await import("@/lib/llmCostTracker");

describe("llmCostTracker summary", () => {
  it("counts metadata.calls when present, else one call per row", () => {
    expect(callsOf({ calls: 248 })).toBe(248);
    for (const calls of [undefined, null, 0, -3, 1.5, "x"]) expect(callsOf({ calls })).toBe(1);
    const summary = summarizeUsage([
      { feature: "speed_question_checks", model: "gpt-6-luna", input_tokens: 187379, output_tokens: 22302, cost_cents: "2.9889", calls: 248 },
      { feature: "speed_question_checks", model: "gpt-6-luna", input_tokens: 480948, output_tokens: 56531, cost_cents: "7.6360", calls: 643 },
      { feature: "live_question_checks", model: "gpt-6.1-sol", input_tokens: 1853, output_tokens: 186, cost_cents: 0.5566, calls: 5 },
      { feature: "category_blitz_grading", model: "claude-haiku-4-5", input_tokens: 100, output_tokens: 10, cost_cents: 0.01 },
    ]);
    expect(summary.byFeature).toEqual([
      { feature: "speed_question_checks", calls: 891, inputTokens: 668327, outputTokens: 78833, costCents: expect.closeTo(10.6249, 6) },
      { feature: "live_question_checks", calls: 5, inputTokens: 1853, outputTokens: 186, costCents: 0.5566 },
      { feature: "category_blitz_grading", calls: 1, inputTokens: 100, outputTokens: 10, costCents: 0.01 },
    ]);
    expect(summary.byModel.find((m) => m.model === "gpt-6-luna")?.calls).toBe(891);
  });
});
