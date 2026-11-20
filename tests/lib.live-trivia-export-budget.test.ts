import { beforeEach, describe, expect, it, vi } from "vitest";
import { openaiResponse } from "./helpers/openaiReply";

// Phase 7e (R2 #29.5, #29.6, #29.1): Convert to Live export is capped, budgeted, counted and reports its fallbacks.
// OpenAI and Supabase are fakes; nothing leaves the process.
const mocks = vi.hoisted(() => ({ ledger: [] as Record<string, unknown>[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: () => ({ insert: async (rows: Record<string, unknown>[]) => { mocks.ledger.push(...rows); return { error: null }; } }) },
}));

const { convertForLiveExport, LIVE_EXPORT_MAX_IDS } = await import("@/lib/liveTriviaExport");

const pending = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: `row-${i}`, slug: `q-${i}`, question: `Which planet is number ${i}?`, options: ["Mars", "Venus", "Earth", "Jupiter"],
  correctAnswer: 0, answer: "Mars", category: "Science", difficulty: "easy",
}));
const rewrite = (i: number) => JSON.stringify({ slug: `live-${i}`, question: `Name planet ${i}`, answer: "Mars", acceptableAnswers: [],
  answer_format: "write_in", category: "Science", difficulty: "easy" });

beforeEach(() => {
  mocks.ledger.length = 0;
  vi.stubEnv("OPENAI_API_KEY", "k");
});

describe("convertForLiveExport", () => {
  it("rewrites 4 at a time with room to answer, and writes one ledger row for the request", async () => {
    let inFlight = 0, most = 0, n = 0;
    const transport = vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body)).max_output_tokens).toBe(2048);
      inFlight++; most = Math.max(most, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return openaiResponse(rewrite(n++), { input: 300, output: 100, reasoning: 60, model: "gpt-6.1-sol" });
    });
    const result = await convertForLiveExport(pending(10), { transport: transport as unknown as typeof fetch });
    expect(result.fallbacks).toBe(0);
    expect(result.items.map((item) => item.sourceId)).toEqual(pending(10).map((row) => row.id));
    expect(result.items[0].question.endsWith("?")).toBe(true);
    expect(most).toBe(4);
    expect(mocks.ledger).toEqual([expect.objectContaining({ feature: "live_trivia_rewrite", model: "gpt-6.1-sol", input_tokens: 3000, output_tokens: 1000,
      metadata: { questions: 10, fallbacks: 0, calls: 10, reasoningTokens: 600 } })]);
  });

  it("counts fallbacks, and a billed but unusable reply is still in the ledger", async () => {
    let n = 0;
    const transport = vi.fn(async () => (n++ === 1
      ? openaiResponse("", { status: "incomplete", input: 300, output: 2048, reasoning: 2048, model: "gpt-6.1-sol" })
      : openaiResponse(rewrite(n), { input: 300, output: 100, model: "gpt-6.1-sol" })));
    const result = await convertForLiveExport(pending(3), { transport: transport as unknown as typeof fetch });
    expect(result.fallbacks).toBe(1);
    expect(result.items[1]).toMatchObject({ sourceId: "row-1", answer: "Mars", answer_format: "write_in" });
    expect(mocks.ledger).toEqual([expect.objectContaining({ output_tokens: 2248, metadata: expect.objectContaining({ calls: 3, fallbacks: 1 }) })]);
  });

  it("stops calling at the deadline; the rest fall back", async () => {
    let clock = 0;
    const transport = vi.fn(async () => { await Promise.resolve(); clock += 40_000; return openaiResponse(rewrite(0), { model: "gpt-6.1-sol" }); });
    const result = await convertForLiveExport(pending(12), { transport: transport as unknown as typeof fetch, now: () => clock });
    // 90 s: the first 4 start at 0 s; after 160 s of fake time nothing new may start.
    expect(transport).toHaveBeenCalledTimes(4);
    expect(result.fallbacks).toBe(8);
  });

  it("refuses more than 25 questions", async () => {
    expect(LIVE_EXPORT_MAX_IDS).toBe(25);
    await expect(convertForLiveExport(pending(26))).rejects.toThrow("At most 25");
  });
});
