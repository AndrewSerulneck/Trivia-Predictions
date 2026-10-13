import { describe, expect, it } from "vitest";
import * as provider from "@/lib/speed-trivia-uniqueness/gemini.cjs";
import * as core from "@/lib/speed-trivia-uniqueness/core.cjs";
import type { ComparisonTask, FactDecision, SpeedQuestion } from "@/types/speedTriviaUniqueness";
const row = (id: string): SpeedQuestion => ({ id, question: `Which artist released album ${id}?`, options: ["Artist", "Other"], correct_answer: 0, category: "Music", question_pool: "anytime_blitz", answer_format: "multiple_choice", status: "pending_review" });
const task: ComparisonTask = { id: "pair-1", a: row("a"), b: row("b") };
const result: FactDecision = { decision: "unique", fact: "Different albums", explanation: "Separate release facts", qualityA: "sound", qualityB: "uncertain", confidence: "high" };
const response = (decisions: unknown = [{ id: task.id, ...result }], finishReason = "STOP", usage = true) => new Response(JSON.stringify({ modelVersion: "actual-model", candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(decisions) }] } }], ...(usage ? { usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 80, thoughtsTokenCount: 20 } } : {}) }));
const setup = (transport: typeof fetch, apiKey: string | null = "fake-test-key") => {
  const cache = new Map<string, provider.CachedPair>(), claims: provider.TokenClaim[] = [], usages: provider.TokenUsage[] = [];
  const judge = provider.createJudge({ apiKey, budget: { reserve: claim => { claims.push(claim); return "reservation"; }, settle: (_id, actual) => { usages.push(actual); } }, cache, transport });
  return { judge, claims, usages, cache };
};
describe("capped semantic dependency", () => {
  it("reserves worst-case spend before sending, and accounts for thinking tokens", async () => {
    const harness = setup(async () => { expect(harness.claims).toHaveLength(1); return response(); });
    expect((await harness.judge.adjudicate([task]))[0].decision).toBe("unique");
    expect(harness.usages[0].outputTokens).toBe(100); expect(harness.claims[0].outputTokens).toBe(8192);
    expect(harness.claims[0].dollars).toBeGreaterThan(harness.usages[0].dollars);
  });
  it("does not retry on timeout, HTTP failure, truncation, invalid schema or missing usage", async () => {
    const transports: (typeof fetch)[] = [async () => { throw new Error("secret-upstream-url"); }, async () => new Response("{}", { status: 429 }), async () => response([], "MAX_TOKENS"), async () => response([]), async () => response(undefined, "STOP", false)];
    for (const transport of transports) {
      let calls = 0; const harness = setup(async (...args) => { calls++; return transport(...args); });
      await expect(harness.judge.adjudicate([task])).rejects.toThrow(/semantic/); expect(calls).toBe(1); expect(harness.cache.size).toBe(0);
    }
  });
  it("reuses content/version cache and swaps directional quality correctly", async () => {
    let calls = 0; const harness = setup(async () => { calls++; return response(); });
    await harness.judge.adjudicate([task]);
    const [cached] = await harness.judge.adjudicate([{ id: "reverse", a: task.b, b: task.a }]);
    expect(calls).toBe(1); expect(cached.id).toBe("reverse"); expect(cached.qualityA).toBe("uncertain"); expect(cached.qualityB).toBe("sound");
    expect(core.pairKey(task.a, task.b, "old-policy")).not.toBe(core.pairKey(task.a, task.b, harness.judge.modelVersion));
  });
  it("holds missing credentials and refuses a request before any send when budget is exhausted", async () => {
    const missing = setup(async () => response(), null);
    await expect(missing.judge.adjudicate([task])).rejects.toThrow("missing-GEMINI"); expect(missing.claims).toHaveLength(0);
    let calls = 0;
    const judge = provider.createJudge({ apiKey: "fake", budget: { reserve: () => { throw new Error("semantic-budget-exhausted"); }, settle: () => {} }, cache: new Map(), transport: async () => { calls++; return response(); } });
    await expect(judge.adjudicate([task])).rejects.toThrow("budget-exhausted"); expect(calls).toBe(0);
  });
  it("refuses omitted, unexpected and duplicate IDs", async () => {
    for (const values of [[{ id: "wrong", ...result }], [{ id: task.id, ...result }, { id: task.id, ...result }]]) await expect(setup(async () => response(values)).judge.adjudicate([task])).rejects.toThrow("incomplete-or-invalid");
  });
});
