import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Writer endpoints (docs/speed-trivia-backlog-and-quality-plan.md Phase 4b, step 3). Fake server client; no database.
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), tables: [] as string[] }));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    rpc: mocks.rpc,
    from: (table: string) => {
      mocks.tables.push(table);
      const q = { select: () => q, eq: () => q, order: () => q, limit: async () => ({ data: [], error: null }) };
      return q;
    },
  },
}));
import { GET } from "@/app/api/question-writer/brief/route";
import { POST } from "@/app/api/question-writer/candidates/route";
import { POST as POST_CONVERSIONS } from "@/app/api/question-writer/conversions/route";

const TOKEN = "t".repeat(43);
const auth = { Authorization: `Bearer ${TOKEN}` };
const brief = (game = "speed", headers: Record<string, string> = auth) =>
  GET(new Request(`https://example.invalid/api/question-writer/brief?game=${game}`, { headers }));
const post = (body: unknown, headers: Record<string, string> = auth) =>
  POST(new Request("https://example.invalid/api/question-writer/candidates", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }));
const item = (n = 1) => ({
  slot: { n, category: "Music", area: "Pop", era: "1980s" },
  payload: { question: "Which singer released 'Like a Virgin' in 1984?", options: ["Madonna", "Cyndi Lauper", "Whitney Houston", "Janet Jackson"],
    correctIndex: 0, category: "Music", area: "Pop", era: "1980s", subject: "Madonna", difficulty: "easy", sourceUrl: null, whyTrue: "Madonna released it in 1984." },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tables = [];
  process.env.QUESTION_WRITER_TOKEN = TOKEN;
  mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => name === "question_variety_stats"
    ? { data: { areas: [], cells: [], subjects: [] }, error: null }
    : { data: { runDate: "2026-11-16", received: (args.p_items as unknown[]).length, idempotent: false }, error: null });
});
afterEach(() => { delete process.env.QUESTION_WRITER_TOKEN; });

describe("writer token", () => {
  it("refuses a missing, wrong or short token, and fails closed when none is configured", async () => {
    const attempts: Record<string, string>[] = [{}, { Authorization: "Bearer nope" }, { Authorization: TOKEN }, { Authorization: `bearer ${TOKEN}` }];
    for (const headers of attempts) {
      expect((await brief("speed", headers)).status).toBe(401);
      expect((await post({ game: "speed", items: [item()] }, headers)).status).toBe(401);
    }
    process.env.QUESTION_WRITER_TOKEN = "short";
    expect((await brief("speed", { Authorization: "Bearer short" })).status).toBe(401);
    delete process.env.QUESTION_WRITER_TOKEN;
    expect((await brief("speed", { Authorization: "Bearer " })).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.tables).toEqual([]);
  });
});

describe("GET brief", () => {
  it("returns the day's prompts from one stats read and one examples read", async () => {
    const response = await brief();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.prompts.map((p: { kind: string }) => p.kind)).toEqual(["regular", "currentEvents"]);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.tables).toEqual(["trivia_questions"]);
  });

  it("404s a game that isn't a writer game (Live joined in Phase 4c)", async () => {
    expect((await brief("bingo")).status).toBe(404);
    expect((await brief("")).status).toBe(404);
  });
});

describe("POST candidates", () => {
  it("stores valid items through question_writer_receive only, as ChatGPT", async () => {
    const response = await post({ game: "speed", model: "gpt-6-astra", items: [item(1), { slot: item(2).slot, payload: { question: 3 } }] });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, received: 1, invalid: 1 });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const [name, args] = mocks.rpc.mock.calls[0];
    expect(name).toBe("question_writer_receive");
    expect(args).toMatchObject({ p_game: "speed", p_source: "chatgpt", p_model: "gpt-6-astra" });
    expect(mocks.tables).toEqual([]);
  });

  it("enforces the limits", async () => {
    expect((await post({ game: "speed", items: Array.from({ length: 41 }, (_, i) => item(i + 1)) })).status).toBe(413);
    expect((await post(JSON.stringify({ game: "speed", items: [item()], pad: "x".repeat(70_000) }))).status).toBe(413);
    expect((await post("{not json")).status).toBe(400);
    expect((await post({ game: "speed", items: [] })).status).toBe(422);
    expect((await post({ game: "bingo", items: [item()] })).status).toBe(404);
    // A Speed-shaped item is not a valid Live item (Phase 4c): nothing usable.
    expect((await post({ game: "live", items: [item()] })).status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("passes the database's daily limits through", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "writer-already-received" } });
    expect((await post({ game: "speed", items: [item()] })).status).toBe(409);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "writer-post-limit" } });
    expect((await post({ game: "speed", items: [item()] })).status).toBe(429);
  });
});

// Phase 4e (D37): the writer's Speed -> Live rewrites.
describe("POST /api/question-writer/conversions", () => {
  const REQ = "85000000-0000-4000-8000-000000000001";
  const convert = (body: unknown, headers: Record<string, string> = auth) =>
    POST_CONVERSIONS(new Request("https://example.invalid/api/question-writer/conversions", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }));
  const rewrite = { question: "Rust-colored dust gives which planet its nickname?", answer: "Mars", acceptableAnswers: [], answerIsPerson: false,
    category: "Science & Tech", area: "Astronomy and earth science", era: "Timeless", subject: "Mars", difficulty: "easy", sourceUrl: null, whyTrue: "Iron oxide." };

  it("needs the writer token", async () => {
    expect((await convert({ items: [{ requestId: REQ, declined: true, reason: "x" }] }, {})).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("stores rewrites and declines through live_conversion_receive only", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { runDate: "2026-11-19", received: 1, declined: 1, already: 0 }, error: null });
    const response = await convert({ graderModel: "gpt-6-astra", items: [
      { requestId: REQ, payload: rewrite }, { requestId: "85000000-0000-4000-8000-000000000002", declined: true, reason: "Too hard." }] });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, received: 1, declined: 1, invalid: 0 });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const [name, args] = mocks.rpc.mock.calls[0] as [string, { p_items: Record<string, unknown>[] }];
    expect(name).toBe("live_conversion_receive");
    expect(args.p_items[0]).toMatchObject({ requestId: REQ, slot: { kind: "conversion", category: "Science & Tech" } });
    expect(mocks.tables).toEqual([]);
  });

  it("refuses malformed JSON, nothing usable and too many items", async () => {
    expect((await convert("{")).status).toBe(400);
    expect((await convert({ items: [{ requestId: REQ, payload: { question: "x" } }] })).status).toBe(422);
    expect((await convert({ items: Array.from({ length: 21 }, () => ({ requestId: REQ, declined: true, reason: "x" })) })).status).toBe(413);
  });
});
