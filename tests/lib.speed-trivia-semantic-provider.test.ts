import { describe, expect, it } from "vitest";
import * as provider from "@/lib/speed-trivia-uniqueness/openai.cjs";
import * as core from "@/lib/speed-trivia-uniqueness/core.cjs";
import type { ComparisonTask, FactDecision, SpeedQuestion } from "@/types/speedTriviaUniqueness";
import { openaiBody } from "./helpers/openaiReply";
// Phase 4f.2 (D40): the repeat checker on the OpenAI API. Same guarantees as the Gemini client it replaced.
const row = (id: string): SpeedQuestion => ({ id, question: `Which artist released album ${id}?`, options: ["Artist", "Other"], correct_answer: 0, category: "Music", question_pool: "anytime_blitz", answer_format: "multiple_choice", status: "pending_review" });
const task: ComparisonTask = { id: "pair-1", a: row("a"), b: row("b") };
const result: FactDecision = { decision: "unique", fact: "Different albums", explanation: "Separate release facts", qualityA: "sound", qualityB: "uncertain", confidence: "high" };
const response = (decisions: unknown = [{ id: task.id, ...result }], status = "completed", usage = true) => {
  const body: Record<string, unknown> = openaiBody(JSON.stringify({ decisions }), { status, input: 100, output: 100, reasoning: 20, model: "actual-model" });
  if (!usage) delete body.usage;
  return new Response(JSON.stringify(body));
};
const setup = (transport: typeof fetch, apiKey: string | null = "fake-test-key") => {
  const cache = new Map<string, provider.CachedPair>(), claims: provider.TokenClaim[] = [], usages: provider.TokenUsage[] = [];
  const judge = provider.createJudge({ apiKey, budget: { reserve: claim => { claims.push(claim); return "reservation"; }, settle: (_id, actual) => { usages.push(actual); } }, cache, transport });
  return { judge, claims, usages, cache };
};
describe("capped semantic dependency (OpenAI)", () => {
  it("sends the unchanged fact-judge-v2 prompt with a strict schema and stores nothing at OpenAI", async () => {
    let body: Record<string, unknown> = {};
    const harness = setup(async (_url, init) => { body = JSON.parse(String(init?.body)); return response(); });
    await harness.judge.adjudicate([task]);
    expect(body).toMatchObject({ model: provider.JUDGE_MODEL, store: false, text: { format: { type: "json_schema", strict: true } } });
    expect(String(body.input).startsWith(provider.SYSTEM)).toBe(true);
    expect(provider.PROMPT_VERSION).toBe("fact-judge-v2");
    expect(harness.judge.modelVersion.startsWith(`openai:${provider.JUDGE_MODEL}:fact-judge-v2:`)).toBe(true);
  });
  it("reserves worst-case spend before sending, and accounts for reasoning tokens", async () => {
    const harness = setup(async () => { expect(harness.claims).toHaveLength(1); return response(); });
    expect((await harness.judge.adjudicate([task]))[0].decision).toBe("unique");
    expect(harness.usages[0].outputTokens).toBe(100); expect(harness.usages[0].thoughtTokens).toBe(20); expect(harness.claims[0].outputTokens).toBe(2048);
    expect(harness.claims[0].dollars).toBeGreaterThan(harness.usages[0].dollars);
  });
  it("does not retry on timeout, a client error, truncation, invalid schema or missing usage", async () => {
    const transports: (typeof fetch)[] = [async () => { throw new Error("secret-upstream-url"); }, async () => new Response("{}", { status: 400 }), async () => response([], "incomplete"), async () => response([]), async () => response(undefined, "completed", false)];
    for (const transport of transports) {
      let calls = 0; const harness = setup(async (...args) => { calls++; return transport(...args); });
      await expect(harness.judge.adjudicate([task])).rejects.toThrow(/semantic/); expect(calls).toBe(1); expect(harness.cache.size).toBe(0);
    }
  });
  it("reuses content/version cache and swaps directional quality correctly; a Gemini verdict is never reused", async () => {
    let calls = 0; const harness = setup(async () => { calls++; return response(); });
    await harness.judge.adjudicate([task]);
    const [cached] = await harness.judge.adjudicate([{ id: "reverse", a: task.b, b: task.a }]);
    expect(calls).toBe(1); expect(cached.id).toBe("reverse"); expect(cached.qualityA).toBe("uncertain"); expect(cached.qualityB).toBe("sound");
    expect(core.pairKey(task.a, task.b, "gemini-2.5-flash:fact-judge-v2:thinking-0:batch-1")).not.toBe(core.pairKey(task.a, task.b, harness.judge.modelVersion));
  });
  it("holds missing credentials and refuses a request before any send when budget is exhausted", async () => {
    const missing = setup(async () => response(), null);
    await expect(missing.judge.adjudicate([task])).rejects.toThrow("missing-OPENAI"); expect(missing.claims).toHaveLength(0);
    let calls = 0;
    const judge = provider.createJudge({ apiKey: "fake", budget: { reserve: () => { throw new Error("semantic-budget-exhausted"); }, settle: () => {} }, cache: new Map(), transport: async () => { calls++; return response(); } });
    await expect(judge.adjudicate([task])).rejects.toThrow("budget-exhausted"); expect(calls).toBe(0);
  });
  it("refuses omitted, unexpected and duplicate IDs", async () => {
    for (const values of [[{ id: "wrong", ...result }], [{ id: task.id, ...result }, { id: task.id, ...result }]]) await expect(setup(async () => response(values)).judge.adjudicate([task])).rejects.toThrow("incomplete-or-invalid");
  });
});
