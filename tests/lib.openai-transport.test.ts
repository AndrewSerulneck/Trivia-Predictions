import { describe, expect, it, vi } from "vitest";
import * as openai from "@/lib/openai/responses.cjs";
import * as ledger from "@/lib/openai/ledger.cjs";
import { createBudget } from "@/lib/speed-trivia-uniqueness/runtime.cjs";
import { openaiBody, openaiResponse } from "./helpers/openaiReply";

// Phase 4f.2 (D40): the one OpenAI transport for question checks, and its cost ledger.
const schema = { type: "object", additionalProperties: false, required: ["answer"], properties: { answer: { type: "string" } } };
const call = (transport: typeof fetch, model = "gpt-6-luna", apiKey: string | null = "k") =>
  openai.callJson({ model, apiKey, prompt: "Q", schema, maxOutputTokens: 256, transport });

describe("OpenAI transport", () => {
  it("sends a strict JSON schema with store:false and the model's lowest reasoning setting", async () => {
    const transport = vi.fn(async (_url: string, _init: RequestInit) => openaiResponse('{"answer":"Mars"}', { input: 40, output: 12 }));
    const reply = await call(transport as unknown as typeof fetch);
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: "gpt-6-luna", input: "Q", store: false, max_output_tokens: 256, reasoning: { effort: "none" },
      text: { format: { type: "json_schema", strict: true, name: "result", schema } } });
    expect(body.temperature).toBeUndefined();
    expect(reply).toMatchObject({ complete: true, text: '{"answer":"Mars"}', usage: { inputTokens: 40, outputTokens: 12, dollars: (40 * 0.1 + 12 * 0.5) / 1e6 } });
    expect(openai.jsonOf(reply, "x")).toEqual({ answer: "Mars" });
  });

  it("uses temperature 0 for a model without reasoning settings", async () => {
    const transport = vi.fn(async (_url: string, _init: RequestInit) => openaiResponse("{}"));
    await call(transport as unknown as typeof fetch, "gpt-4o-mini");
    const body = JSON.parse(String(transport.mock.calls[0][1].body));
    expect(body.temperature).toBe(0);
    expect(body.reasoning).toBeUndefined();
  });

  it("prices every listed model and refuses one it can't price, or a missing key, before sending", async () => {
    for (const model of Object.keys(openai.RATES)) expect(model in openai.EFFORT, model).toBe(true);
    const transport = vi.fn();
    await expect(call(transport as unknown as typeof fetch, "gpt-unknown")).rejects.toThrow("openai-unknown-model");
    await expect(call(transport as unknown as typeof fetch, "gpt-6-luna", null)).rejects.toThrow("missing-OPENAI_API_KEY");
    expect(transport).not.toHaveBeenCalled();
  });

  it("returns usage for an incomplete or refused reply so the caller can settle before refusing it", async () => {
    const incomplete = await call((async () => openaiResponse("{", { status: "incomplete", input: 5, output: 256 })) as unknown as typeof fetch);
    expect(incomplete).toMatchObject({ complete: false, usage: { outputTokens: 256 } });
    expect(() => openai.jsonOf(incomplete, "semantic")).toThrow("semantic-truncated-or-blocked");
    const body = { ...openaiBody(""), output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] };
    const refused = await call((async () => new Response(JSON.stringify(body))) as unknown as typeof fetch);
    expect(refused.complete).toBe(false);
  });

  it("throws short codes, never the provider's message, when nothing was billed", async () => {
    await expect(call((async () => { throw new Error("https://secret.example"); }) as unknown as typeof fetch)).rejects.toThrow(/^openai-network-or-timeout$/);
    await expect(call((async () => new Response(JSON.stringify({ error: { code: "insufficient_quota", message: "secret detail" } }), { status: 429 })) as unknown as typeof fetch)).rejects.toThrow(/^openai-http-429$/);
    const noUsage = { ...openaiBody("{}") } as Record<string, unknown>;
    delete noUsage.usage;
    await expect(call((async () => new Response(JSON.stringify(noUsage))) as unknown as typeof fetch)).rejects.toThrow("openai-missing-usage");
  });

  it("retries a short, unbilled rate limit or server error with backoff, then gives up with a short code", async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => { waits.push(ms); };
    const replies = [new Response("{}", { status: 503 }), new Response("{}", { status: 429, headers: { "retry-after": "2" } }), openaiResponse('{"answer":"Mars"}')];
    const flaky = vi.fn(async () => replies.shift() as Response);
    const reply = await openai.callJson({ model: "gpt-6-luna", apiKey: "k", prompt: "Q", schema, maxOutputTokens: 256, transport: flaky as unknown as typeof fetch, sleep });
    expect(reply.complete).toBe(true);
    expect(flaky).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([1000, 2000]);
    const down = vi.fn(async () => new Response("{}", { status: 502 }));
    await expect(openai.callJson({ model: "gpt-6-luna", apiKey: "k", prompt: "Q", schema, maxOutputTokens: 256, transport: down as unknown as typeof fetch, sleep })).rejects.toThrow(/^openai-http-502$/);
    expect(down).toHaveBeenCalledTimes(3);
  });

  it("never retries a timeout, a client error or an exhausted quota", async () => {
    const sleep = vi.fn(async () => undefined);
    const quota = JSON.stringify({ error: { code: "insufficient_quota", message: "no credits" } });
    for (const [reply, code] of [[() => { throw new Error("timeout"); }, "openai-network-or-timeout"], [() => new Response("{}", { status: 400 }), "openai-http-400"], [() => new Response(quota, { status: 429 }), "openai-http-429"]] as const) {
      const transport = vi.fn(async () => reply());
      await expect(openai.callJson({ model: "gpt-6-luna", apiKey: "k", prompt: "Q", schema, maxOutputTokens: 256, transport: transport as unknown as typeof fetch, sleep })).rejects.toThrow(code);
      expect(transport).toHaveBeenCalledTimes(1);
    }
    expect(sleep).not.toHaveBeenCalled();
  });

  it("Phase 7e (R2 #29.4): a deadline caps the whole call, retries and waits included", async () => {
    let clock = 0;
    const now = () => clock;
    const sleep = async (ms: number) => { clock += ms; };
    const busy = vi.fn(async () => { clock += 4000; return new Response("{}", { status: 503 }); });
    const ask = (deadlineMs: number, transport: typeof fetch) => openai.callJson({ model: "gpt-6-luna", apiKey: "k", prompt: "Q", schema,
      maxOutputTokens: 256, transport, sleep, now, deadlineMs });
    // 4 s attempt + 1 s wait + 4 s attempt = 9 s; a third attempt would need a 3 s wait first, past the 12 s deadline.
    await expect(ask(12_000, busy as unknown as typeof fetch)).rejects.toThrow(/^openai-http-503$/);
    expect(busy).toHaveBeenCalledTimes(2);
    expect(clock).toBe(9000);
    // Each attempt's timeout is cut to what's left of the deadline.
    clock = 0;
    const seen: AbortSignal[] = [];
    const ok = vi.fn(async (_url: string, init: RequestInit) => { seen.push(init.signal as AbortSignal); return openaiResponse('{"answer":"Mars"}'); });
    expect((await ask(5000, ok as unknown as typeof fetch)).complete).toBe(true);
    expect(seen).toHaveLength(1);
    // No time left: nothing is sent, so nothing is billed.
    const never = vi.fn();
    await expect(ask(500, never as unknown as typeof fetch)).rejects.toThrow("openai-deadline");
    expect(never).not.toHaveBeenCalled();
    await expect(ask(-1, never as unknown as typeof fetch)).rejects.toThrow("invalid-deadline");
  });

  it("reserves more than any reply can cost", () => {
    const claim = openai.claimFor({ model: "gpt-6.1-sol", prompt: "x".repeat(1000), maxOutputTokens: 512 });
    expect(claim).toMatchObject({ inputTokens: 3048, outputTokens: 512, requests: 1 });
    expect(claim.dollars).toBeCloseTo((3048 * 2 + 512 * 10) / 1e6, 12);
  });
});

describe("budget tally and cost ledger", () => {
  it("tallies settled usage per model in the budget summary, reasoning tokens included (Phase 7e)", () => {
    const budget = createBudget({ dollars: 1 });
    for (const [model, reasoning] of [["gpt-6-luna", { thoughtTokens: 3 }], ["gpt-6-luna", {}], ["gpt-6.1-sol", { reasoningTokens: 7 }]] as const) {
      const reserved = budget.reserve({ dollars: 0.01, inputTokens: 100, outputTokens: 50, requests: 1 });
      budget.settle(reserved, { dollars: 0.001, inputTokens: 80, outputTokens: 20, model, ...reasoning });
    }
    expect(budget.summary().byModel).toEqual({
      "gpt-6-luna": { calls: 2, inputTokens: 160, outputTokens: 40, reasoningTokens: 3, dollars: 0.002 },
      "gpt-6.1-sol": { calls: 1, inputTokens: 80, outputTokens: 20, reasoningTokens: 7, dollars: 0.001 },
    });
    // A settle without a model (a tag call on the Keep Queue's budget) counts against the cap but isn't tallied.
    const reserved = budget.reserve({ dollars: 0.01, inputTokens: 100, outputTokens: 50, requests: 1 });
    budget.settle(reserved, { dollars: 0.004, inputTokens: 80, outputTokens: 20 });
    expect(Object.keys(budget.summary().byModel as Record<string, unknown>)).toEqual(["gpt-6-luna", "gpt-6.1-sol"]);
    expect(budget.summary().dollars).toBeCloseTo(0.007, 10);
  });

  it("Phase 7e: keeps reasoning tokens in the ledger row's metadata", () => {
    expect(ledger.rowsFor({ feature: "question_tagging", byModel: { "gpt-6.1-sol": { calls: 2, inputTokens: 10, outputTokens: 900, reasoningTokens: 850, dollars: 0.01 } } }))
      .toEqual([expect.objectContaining({ output_tokens: 900, metadata: { calls: 2, reasoningTokens: 850 } })]);
  });

  it("writes one openai row per model, in cents, and nothing for an unknown feature or no spend", async () => {
    const inserts: unknown[] = [];
    const client = { from: (table: string) => ({ insert: async (rows: unknown) => { inserts.push({ table, rows }); return { error: null }; } }) };
    const byModel = { "gpt-6-luna": { calls: 3, inputTokens: 900, outputTokens: 60, dollars: 0.00012 }, "gpt-5-nano": { calls: 0, inputTokens: 0, outputTokens: 0, dollars: 0 } };
    expect(await ledger.recordUsage(client, { feature: "speed_question_checks", byModel, metadata: { runDate: "2026-11-20" } })).toBe(1);
    expect(inserts).toEqual([{ table: "llm_usage_logs", rows: [{ provider: "openai", model: "gpt-6-luna", feature: "speed_question_checks",
      input_tokens: 900, output_tokens: 60, cost_cents: 0.012, metadata: { runDate: "2026-11-20", calls: 3 } }] }]);
    expect(await ledger.recordUsage(client, { feature: "nope" as "speed_question_checks", byModel })).toBe(0);
    expect(await ledger.recordUsage(client, { feature: "question_tagging", byModel: {} })).toBe(0);
    expect(inserts).toHaveLength(1);
  });

  it("never throws when the ledger can't be written", async () => {
    const broken = { from: () => ({ insert: async () => { throw new Error("down"); } }) };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await ledger.recordUsage(broken, { feature: "question_tagging", byModel: { "gpt-6-luna": { calls: 1, inputTokens: 1, outputTokens: 1, dollars: 0 } } })).toBe(0);
    expect(await ledger.recordBudget(null, { feature: "speed_question_checks", budget: null })).toBe(0);
    warn.mockRestore();
  });
});
