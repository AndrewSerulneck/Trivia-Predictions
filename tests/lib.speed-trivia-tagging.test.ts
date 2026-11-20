import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdmissionError, createBudget } from "@/lib/speed-trivia-uniqueness/runtime.cjs";
import { openaiResponse } from "./helpers/openaiReply";
import type { AdmissionRow, AdmissionSession } from "@/types/speedTriviaAdmission";

// Phase 4a.1: Admin add/edit tags a Speed question on save; an untagged approval is tagged once and retried.
// Supabase and OpenAI are fakes; nothing leaves the process.
const mocks = vi.hoisted(() => ({
  upserts: [] as unknown[], areasError: null as unknown, upsertError: null as unknown,
  // Phase 4c.8: the stored tag's subject, and speed_trivia_subject_has_room's answer.
  currentSubject: null as string | null, room: true as boolean | null, rpcs: [] as { name: string; args: unknown }[],
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === "question_coverage_areas") {
        const chain = { select: () => chain, eq: () => chain, order: () => Promise.resolve({ data: [{ id: "a1", name: "Reptiles", eras: ["Timeless"], active: true, note: null }], error: mocks.areasError }) };
        return chain;
      }
      if (table === "question_tags") {
        const read = { select: () => read, eq: () => read,
          maybeSingle: async () => ({ data: mocks.currentSubject ? { subject_key: mocks.currentSubject } : null, error: null }) };
        return { ...read, upsert: (rows: unknown) => { mocks.upserts.push(rows); return Promise.resolve({ error: mocks.upsertError }); } };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: async (name: string, args: unknown) => {
      mocks.rpcs.push({ name, args });
      return mocks.room === null ? { data: null, error: { message: "down" } } : { data: mocks.room, error: null };
    },
  },
}));

const { tagSpeedQuestion } = await import("@/lib/speedTriviaTagging");
const { approveSpeedTrivia, speedTriviaError, writeSpeedTrivia } = await import("@/lib/speedTriviaAdmission");
const { tagOne } = await import("@/lib/question-variety/tagging.cjs");

const row = (over: Partial<AdmissionRow> = {}): AdmissionRow => ({
  id: "11111111-1111-4111-8111-111111111111", slug: "q-1", question: "Which lizard changes colour?", options: ["Chameleon", "Gecko", "Iguana", "Skink"],
  correct_answer: 0, category: "Animals", question_pool: "anytime_blitz", answer_format: "multiple_choice", status: "pending_review",
  created_at: "2026-11-01T00:00:00Z", ...over,
}) as AdmissionRow;
const openai = (item: unknown, ok = true) => vi.fn(async () => openaiResponse(JSON.stringify({ items: [item] }), {}, ok ? 200 : 400));

beforeEach(() => {
  mocks.upserts.length = 0;
  mocks.areasError = null;
  mocks.upsertError = null;
  mocks.currentSubject = null;
  mocks.room = true;
  mocks.rpcs.length = 0;
  vi.stubEnv("OPENAI_API_KEY", "test-key");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("tagSpeedQuestion", () => {
  it("tags one question against its category's areas and upserts the tag", async () => {
    const transport = openai({ n: 1, area: "Reptiles", era: "Timeless", subject: "Chameleon" });
    expect(await tagSpeedQuestion(row(), transport as unknown as typeof fetch)).toBe(true);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(mocks.upserts).toEqual([[expect.objectContaining({ game: "speed", question_ref: row().id, area_id: "a1", era: "Timeless",
      subject: "Chameleon", subject_key: "chameleon", written_at: "2026-11-01T00:00:00Z", tagged_by: "openai:gpt-6.1-sol:admin-save-v1" })]]);
  });

  it("keeps a subject when no area fits", async () => {
    expect(await tagSpeedQuestion(row(), openai({ n: 1, area: null, era: null, subject: "Chameleon" }) as unknown as typeof fetch)).toBe(true);
    expect(mocks.upserts).toEqual([[expect.objectContaining({ area_id: null, era: null, subject_key: "chameleon" })]]);
  });

  it("never throws: a bad reply, a provider error, a missing key or Live Trivia return false and write nothing", async () => {
    expect(await tagSpeedQuestion(row(), openai({ n: 1, area: "Not an area", era: "x", subject: "Chameleon" }) as unknown as typeof fetch)).toBe(false);
    expect(await tagSpeedQuestion(row(), openai({}, false) as unknown as typeof fetch)).toBe(false);
    expect(await tagSpeedQuestion(row({ question_pool: "live_showdown" }), openai({}) as unknown as typeof fetch)).toBe(false);
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(await tagSpeedQuestion(row(), openai({}) as unknown as typeof fetch)).toBe(false);
    expect(mocks.upserts).toEqual([]);
  });
});

describe("approveSpeedTrivia and the star cap", () => {
  const session = (failures: string[]) => {
    const write = vi.fn(async () => {
      const code = failures.shift();
      if (code) throw new AdmissionError(code, code === "untagged" ? "No subject tag yet." : "Subject full.");
      return { row: row({ status: "active" }), idempotent: false };
    });
    return { session: { write } as unknown as AdmissionSession, write };
  };

  it("tags an untagged question once and retries the approval", async () => {
    vi.stubGlobal("fetch", openai({ n: 1, area: "Reptiles", era: "Timeless", subject: "Chameleon" }));
    const { session: s, write } = session(["untagged"]);
    expect((await approveSpeedTrivia(row(), s)).status).toBe("active");
    expect(write).toHaveBeenCalledTimes(2);
    expect(mocks.upserts).toHaveLength(1);
  });

  it("leaves it waiting when tagging fails, and never retries a full subject", async () => {
    vi.stubGlobal("fetch", openai({}, false));
    const untagged = session(["untagged"]);
    await expect(approveSpeedTrivia(row(), untagged.session)).rejects.toMatchObject({ code: "untagged" });
    expect(untagged.write).toHaveBeenCalledTimes(1);
    const full = session(["subject_full"]);
    await expect(approveSpeedTrivia(row(), full.session)).rejects.toMatchObject({ code: "subject_full" });
    expect(full.write).toHaveBeenCalledTimes(1);
  });
});

describe("Phase 4c.1: one tag call per Admin save; tagOne shared with the scripts", () => {
  it("an Admin save refused as untagged tags once, retries, and doesn't tag again after the save", async () => {
    const fetch = openai({ n: 1, area: "Reptiles", era: "Timeless", subject: "Chameleon" });
    vi.stubGlobal("fetch", fetch);
    const failures = ["untagged"];
    const write = vi.fn(async () => {
      if (failures.shift()) throw new AdmissionError("untagged", "No subject tag yet.");
      return { row: row({ status: "active" }), idempotent: false };
    });
    expect((await writeSpeedTrivia({ ...row(), status: "active" }, null, { write } as unknown as AdmissionSession)).status).toBe("active");
    expect(write).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.upserts).toHaveLength(1);
  });

  it("a new question saved without hitting the cap is still tagged once after the save", async () => {
    const fetch = openai({ n: 1, area: "Reptiles", era: "Timeless", subject: "Chameleon" });
    vi.stubGlobal("fetch", fetch);
    const write = vi.fn(async () => ({ row: row(), idempotent: false }));
    await writeSpeedTrivia(row(), null, { write } as unknown as AdmissionSession);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("tagOne works with any Supabase-style client (the scripts' service client) and never throws", async () => {
    const upserts: unknown[] = [];
    const chain = { select: () => chain, eq: () => chain, order: async () => ({ data: [{ id: "a1", name: "Reptiles", eras: ["Timeless"], active: true }], error: null }) };
    const client = { from: (table: string) => table === "question_tags" ? { upsert: async (rows: unknown) => { upserts.push(rows); return { error: null }; } } : chain };
    const transport = openai({ n: 1, area: "Reptiles", era: "Timeless", subject: "Chameleon" }) as unknown as typeof fetch;
    expect(await tagOne({ client: client as never, row: row(), apiKey: "k", transport, taggedBy: "openai:gpt-6-luna:keep-queue-v1" })).toBe(true);
    expect(upserts).toEqual([[expect.objectContaining({ question_ref: row().id, subject_key: "chameleon", tagged_by: "openai:gpt-6-luna:keep-queue-v1" })]]);
    const broken = { from: () => { throw new Error("down"); } };
    expect(await tagOne({ client: broken as never, row: row(), apiKey: "k", transport })).toBe(false);
  });
});

// Phase 4c.8 (post-4c.4 review #4, D15): an edit that keeps an approved question approved can't move it into a subject
// that already has 5 other approved questions. The tag is computed before the save (the same one Gemini call).
describe("Phase 4c.8: the star cap holds when an edit re-tags an approved question", () => {
  const active = row({ status: "active" });
  const edit = { question: "Which lizard can move its eyes independently?" };
  const savedRow = row({ ...edit, status: "active" });
  const gate = () => vi.fn(async () => ({ row: savedRow, idempotent: false }));

  it("refuses a move into a full subject with 409 subject_full and saves nothing", async () => {
    const fetch = openai({ n: 1, area: "Reptiles", era: "Timeless", subject: "Komodo dragon" });
    vi.stubGlobal("fetch", fetch);
    mocks.currentSubject = "chameleon";
    mocks.room = false;
    const write = gate();
    const failure = await writeSpeedTrivia(edit, active, { write } as unknown as AdmissionSession).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "subject_full" });
    expect(speedTriviaError(failure)).toMatchObject({ status: 409, code: "subject_full" });
    expect(write).not.toHaveBeenCalled();
    expect(mocks.upserts).toEqual([]);
    expect(mocks.rpcs).toEqual([{ name: "speed_trivia_subject_has_room", args: { p_subject_key: "komodo dragon", p_row_id: active.id } }]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("with room: one OpenAI call, saves, then writes the new tag", async () => {
    const fetch = openai({ n: 1, area: "Reptiles", era: "Timeless", subject: "Komodo dragon" });
    vi.stubGlobal("fetch", fetch);
    mocks.currentSubject = "chameleon";
    const write = gate();
    expect(await writeSpeedTrivia(edit, active, { write } as unknown as AdmissionSession)).toBe(savedRow);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(mocks.upserts).toEqual([[expect.objectContaining({ question_ref: active.id, subject_key: "komodo dragon" })]]);
  });

  it("an unchanged subject skips the room check and still refreshes the tag", async () => {
    const fetch = openai({ n: 1, area: "Reptiles", era: "Timeless", subject: "Chameleon" });
    vi.stubGlobal("fetch", fetch);
    mocks.currentSubject = "chameleon";
    mocks.room = false;
    const write = gate();
    await writeSpeedTrivia(edit, active, { write } as unknown as AdmissionSession);
    expect(mocks.rpcs).toEqual([]);
    expect(write).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.upserts).toHaveLength(1);
  });

  it("if OpenAI fails, saves anyway, keeps the old tag and makes no second call", async () => {
    const fetch = openai({}, false);
    vi.stubGlobal("fetch", fetch);
    mocks.currentSubject = "chameleon";
    const write = gate();
    expect(await writeSpeedTrivia(edit, active, { write } as unknown as AdmissionSession)).toBe(savedRow);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.upserts).toEqual([]);
  });

  it("if the room check can't answer, saves and lets the trigger decide", async () => {
    vi.stubGlobal("fetch", openai({ n: 1, area: "Reptiles", era: "Timeless", subject: "Komodo dragon" }));
    mocks.currentSubject = "chameleon";
    mocks.room = null;
    const write = gate();
    await writeSpeedTrivia(edit, active, { write } as unknown as AdmissionSession);
    expect(write).toHaveBeenCalledTimes(1);
    expect(mocks.upserts).toHaveLength(1);
  });

  it("a race the trigger refuses after the save keeps the old tag and logs", async () => {
    vi.stubGlobal("fetch", openai({ n: 1, area: "Reptiles", era: "Timeless", subject: "Komodo dragon" }));
    mocks.currentSubject = "chameleon";
    mocks.upsertError = { message: "star-cap" };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const write = gate();
    expect(await writeSpeedTrivia(edit, active, { write } as unknown as AdmissionSession)).toBe(savedRow);
    expect(warn).toHaveBeenCalledWith("Tag not changed: subject full.", { questionId: active.id });
    warn.mockRestore();
  });

  it("an edit to a waiting question, or one leaving approval, is tagged after the save as before (no room check)", async () => {
    for (const [existing, patch] of [[row(), edit], [active, { ...edit, status: "deleted" }]] as const) {
      mocks.upserts.length = 0;
      const fetch = openai({ n: 1, area: "Reptiles", era: "Timeless", subject: "Komodo dragon" });
      vi.stubGlobal("fetch", fetch);
      mocks.room = false;
      const write = vi.fn(async () => ({ row: row({ ...patch }), idempotent: false }));
      await writeSpeedTrivia(patch, existing, { write } as unknown as AdmissionSession);
      expect(write).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(mocks.upserts).toHaveLength(1);
    }
    expect(mocks.rpcs).toEqual([]);
  });

  it("tagOne with write: false returns the tag row and writes nothing", async () => {
    const transport = openai({ n: 1, area: "Reptiles", era: "Timeless", subject: "Chameleon" }) as unknown as typeof fetch;
    const client = { from: (table: string) => {
      if (table === "question_tags") throw new Error("must not write");
      const chain = { select: () => chain, eq: () => chain, order: async () => ({ data: [{ id: "a1", name: "Reptiles", eras: ["Timeless"], active: true }], error: null }) };
      return chain;
    } };
    expect(await tagOne({ client: client as never, row: row(), apiKey: "k", transport, write: false }))
      .toMatchObject({ question_ref: row().id, subject_key: "chameleon", area_id: "a1" });
    expect(await tagOne({ client: client as never, row: row(), apiKey: "k", transport: openai({}, false) as unknown as typeof fetch, write: false })).toBeNull();
  });
});

describe("Phase 7e: a tag call has room to answer, is always counted, and is budgeted", () => {
  // A service-role client fake: the category's areas, the cost ledger and the tag upsert.
  const fakeClient = () => {
    const ledgerRows: Record<string, unknown>[] = [];
    const tags: unknown[] = [];
    const client = {
      from: (table: string) => {
        if (table === "question_coverage_areas") {
          const chain = { select: () => chain, eq: () => chain, order: async () => ({ data: [{ id: "a1", name: "Reptiles", eras: ["Timeless"], active: true, note: null }], error: null }) };
          return chain;
        }
        if (table === "llm_usage_logs") return { insert: async (rows: Record<string, unknown>[]) => { ledgerRows.push(...rows); return { error: null }; } };
        if (table === "question_tags") return { upsert: async (rows: unknown) => { tags.push(rows); return { error: null }; } };
        throw new Error(`unexpected table ${table}`);
      },
    };
    return { client, ledgerRows, tags };
  };
  const good = JSON.stringify({ items: [{ n: 1, area: "Reptiles", era: "Timeless", subject: "Chameleon" }] });

  it("asks for 2,048 output tokens (reasoning counts against the limit)", async () => {
    const { client } = fakeClient();
    const transport = vi.fn(async (_url: string, _init: RequestInit) => openaiResponse(good, { model: "gpt-6.1-sol" }));
    expect(await tagOne({ client, row: row(), apiKey: "k", transport: transport as unknown as typeof fetch })).toBe(true);
    expect(JSON.parse(String(transport.mock.calls[0][1].body)).max_output_tokens).toBe(2048);
  });

  it("an incomplete reply that spent its tokens on reasoning is still counted and reported, never silently untagged", async () => {
    const { client, ledgerRows, tags } = fakeClient();
    const warn = vi.fn();
    const transport = vi.fn(async () => openaiResponse("", { status: "incomplete", input: 300, output: 2048, reasoning: 2040, model: "gpt-6.1-sol" }));
    expect(await tagOne({ client, row: row(), apiKey: "k", transport: transport as unknown as typeof fetch, warn })).toBe(false);
    expect(tags).toEqual([]);
    expect(ledgerRows).toEqual([expect.objectContaining({ feature: "question_tagging", model: "gpt-6.1-sol", input_tokens: 300, output_tokens: 2048,
      cost_cents: Number((((300 * 2 + 2048 * 10) / 1e6) * 100).toFixed(4)), metadata: expect.objectContaining({ calls: 1, reasoningTokens: 2040 }) })]);
    expect(warn).toHaveBeenCalledWith("Tagging: tagging-truncated-or-blocked (reasoning 2040, output 2048 of 2048 tokens).");
    // A billed refusal is counted the same way.
    const refusal = { model: "gpt-6.1-sol", status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }], usage: { input_tokens: 300, output_tokens: 5 } };
    expect(await tagOne({ client, row: row(), apiKey: "k", transport: (async () => new Response(JSON.stringify(refusal))) as unknown as typeof fetch, warn })).toBe(false);
    expect(ledgerRows).toHaveLength(2);
  });

  it("reserves on the caller's budget and settles at the reply's real cost (settled without a model, so not counted twice)", async () => {
    const { client, ledgerRows } = fakeClient();
    const budget = createBudget({ dollars: 1 });
    const transport = vi.fn(async () => openaiResponse(good, { input: 400, output: 120, reasoning: 90, model: "gpt-6.1-sol" }));
    expect(await tagOne({ client, row: row(), apiKey: "k", transport: transport as unknown as typeof fetch, budget })).toBe(true);
    expect(budget.summary().dollars).toBeCloseTo((400 * 2 + 120 * 10) / 1e6, 12);
    expect(budget.summary().byModel).toEqual({});
    expect(ledgerRows).toHaveLength(1);
  });

  it("a budget too small for the call stops the caller without calling OpenAI; other failures never throw", async () => {
    const { client } = fakeClient();
    const transport = vi.fn(async () => openaiResponse(good));
    await expect(tagOne({ client, row: row(), apiKey: "k", transport: transport as unknown as typeof fetch, budget: createBudget({ dollars: 0.001 }) }))
      .rejects.toMatchObject({ code: "budget_exhausted" });
    expect(transport).not.toHaveBeenCalled();
    expect(await tagOne({ client, row: row(), apiKey: "k", transport: (async () => { throw new Error("down"); }) as unknown as typeof fetch, budget: createBudget({ dollars: 1 }) })).toBe(false);
  });

  it("a spent deadline sends nothing", async () => {
    const { client, ledgerRows } = fakeClient();
    const transport = vi.fn(async () => openaiResponse(good));
    expect(await tagOne({ client, row: row(), apiKey: "k", transport: transport as unknown as typeof fetch, deadlineMs: 0 })).toBe(false);
    expect(transport).not.toHaveBeenCalled();
    expect(ledgerRows).toEqual([]);
  });
});
