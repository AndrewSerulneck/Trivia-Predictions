import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as core from "@/lib/speed-trivia-uniqueness/core.cjs";
import * as runtime from "@/lib/speed-trivia-uniqueness/runtime.cjs";

vi.mock("server-only", () => ({}));
type Filter = [string, string, unknown];
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), auth: vi.fn(), paid: vi.fn(), runs: [] as { run_date: string; source: string }[],
  // Phase 4c.1 tagging: question_tags rows, the waiting trivia_questions rows, and what was upserted.
  tags: [] as { question_ref: string; subject_key: string | null }[], waiting: [] as Record<string, unknown>[], upserts: [] as Record<string, unknown>[][],
}));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    rpc: mocks.rpc,
    // A chainable, awaitable query: the result depends on the table and the eq/in filters.
    from: (table: string) => {
      const filters: Filter[] = [];
      const matches = (row: Record<string, unknown>) => filters.every(([op, column, value]) =>
        op === "in" ? (value as unknown[]).includes(row[column]) : column === "game" || row[column] === value);
      const result = () => {
        if (table === "question_writer_runs") return mocks.runs;
        if (table === "question_tags") return mocks.tags.filter(matches);
        if (table === "trivia_questions") return mocks.waiting.filter(matches);
        if (table === "question_coverage_areas") return [{ id: "a1", name: "Physics", eras: ["Timeless"], active: true, note: null }];
        throw new Error(`unexpected table ${table}`);
      };
      const q = {
        select: () => q, order: () => q, limit: () => q,
        eq: (column: string, value: unknown) => { filters.push(["eq", column, value]); return q; },
        in: (column: string, value: unknown) => { filters.push(["in", column, value]); return q; },
        upsert: async (rows: Record<string, unknown>[]) => { mocks.upserts.push(rows); return { error: null }; },
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve({ data: result(), error: null }).then(resolve, reject),
      };
      return q;
    },
  },
}));
vi.mock("@/lib/adminAuth", () => ({ requireAdminAuth: mocks.auth }));
// Quick Review must never reach the paid checker.
vi.mock("@/lib/speedTriviaAdmission", () => ({ openSpeedTriviaAdmission: mocks.paid, approveSpeedTrivia: mocks.paid, writeSpeedTrivia: mocks.paid }));
import { GET, POST } from "@/app/api/admin/trivia/quick-review/route";
import { runQuickReviewBulk } from "@/lib/speedTriviaQuickReview";
import { openaiResponse } from "./helpers/openaiReply";

const SECRET = "quick-review-test-secret-000000000000000000";
const id = (n: number) => `80000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = (n: number) => String(n % 10).repeat(64);
const item = (n: number, recent = false) => ({ id: id(n), question: `Q${n}?`, options: ["A", "B", "C", "D"], correctAnswer: 0, category: "Science", difficulty: "easy", createdAt: `2026-07-01T00:00:${String(n % 60).padStart(2, "0")}+00:00`, recent, contentHash: hash(n) });
const post = (body: unknown) => POST(new Request("https://example.invalid/api/admin/trivia/quick-review", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
const get = (query = "") => GET(new Request(`https://example.invalid/api/admin/trivia/quick-review${query}`));
const ok = (data: unknown) => Promise.resolve({ data, error: null });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ ok: true });
  vi.stubEnv("SPEED_TRIVIA_ADMISSION_SECRET", SECRET);
  vi.stubEnv("OPENAI_API_KEY", "");
  mocks.runs = [];
  mocks.tags = [];
  mocks.waiting = [];
  mocks.upserts = [];
});
afterEach(() => { vi.unstubAllGlobals(); });

// Phase 4c.1: a waiting Speed row as trivia_questions holds it, and a fake OpenAI tagger that tags anything as "Gravity".
const waitingRow = (n: number) => ({ id: id(n), question: `Q${n}?`, options: ["A", "B", "C", "D"], correct_answer: 0, category: "Science",
  question_pool: "anytime_blitz", status: "pending_review", created_at: "2026-07-01T00:00:00+00:00" });
const fakeOpenAI = (ok = true) => {
  const state = { calls: 0, inFlight: 0, maxInFlight: 0 };
  const fetch = vi.fn(async () => {
    state.calls++; state.inFlight++; state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
    await new Promise((resolve) => setTimeout(resolve, 1));
    state.inFlight--;
    return openaiResponse(JSON.stringify({ items: [{ n: 1, area: "Physics", era: "Timeless", subject: "Gravity" }] }), {}, ok ? 200 : 400);
  });
  vi.stubGlobal("fetch", fetch);
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  return state;
};

describe("Quick Review route", () => {
  it("requires an admin", async () => {
    mocks.auth.mockResolvedValue({ ok: false, status: 401, error: "Admin login required." });
    expect((await get()).status).toBe(401);
    expect((await post({ action: "reject", ids: [id(1)] })).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("reads one bounded page with server-side filters; unknown values fall back", async () => {
    mocks.rpc.mockReturnValue(ok({ total: "7333", rows: [item(1)] }));
    const response = await get(`?category=Science&source=recent&sort=newest&afterId=${id(9)}&afterCreated=2026-07-01T00:00:09%2B00:00`);
    expect(await response.json()).toEqual({ ok: true, total: 7333, items: [item(1)], counts: { queued: 0, needsLook: 0, repeats: 0 }, writerStopped: false });
    expect(mocks.rpc).toHaveBeenCalledWith("speed_trivia_review_queue", { p_category: "Science", p_source: "recent", p_sort: "newest", p_after_created: "2026-07-01T00:00:09+00:00", p_after_id: id(9), p_limit: 50, p_score_min: null, p_score_max: null, p_after_score: null, p_view: "waiting" });
    await get("?category=Literary%20Landscapes&source=live&sort=random&afterId=bad&score=9");
    expect(mocks.rpc).toHaveBeenLastCalledWith("speed_trivia_review_queue", { p_category: null, p_source: "all", p_sort: "best", p_after_created: null, p_after_id: null, p_limit: 50, p_score_min: null, p_score_max: null, p_after_score: null, p_view: "waiting" });
  });

  it("adds the writer's whyTrue note to writer rows in one read, and none for older rows (D30)", async () => {
    // PostgREST returns the aliased column (whyTrue:speed_generation_metadata->>whyTrue) as `whyTrue`.
    mocks.waiting = [{ id: id(1), whyTrue: "A is right because of a fact." }, { id: id(2), whyTrue: null }];
    mocks.rpc.mockReturnValue(ok({ total: 3, rows: [item(1, true), item(2, true), item(3)] }));
    const body = await (await get()).json();
    expect(body.items).toEqual([{ ...item(1, true), whyTrue: "A is right because of a fact." }, item(2, true), item(3)]);
    mocks.rpc.mockReturnValue(ok({ total: 1, rows: [item(3)] }));
    mocks.waiting = [{ id: id(3), whyTrue: "never read" }];
    expect((await (await get()).json()).items).toEqual([item(3)]);
  });

  it("reads the overnight views and counts; bulk can't act on repeats", async () => {
    mocks.rpc.mockReturnValue(ok({ total: 1, rows: [item(1)], counts: { queued: "3", needsLook: 2, repeats: 1 } }));
    const response = await get("?view=repeats");
    expect((await response.json()).counts).toEqual({ queued: 3, needsLook: 2, repeats: 1 });
    expect(mocks.rpc).toHaveBeenLastCalledWith("speed_trivia_review_queue", expect.objectContaining({ p_view: "repeats" }));
    await get("?view=everything");
    expect(mocks.rpc).toHaveBeenLastCalledWith("speed_trivia_review_queue", expect.objectContaining({ p_view: "waiting" }));
    mocks.rpc.mockClear();
    expect((await post({ action: "bulk", decision: "reject", max: 5, view: "repeats" })).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("filters by bar-test score and pages the best sort by score", async () => {
    mocks.rpc.mockReturnValue(ok({ total: 3, rows: [item(1)] }));
    await get(`?score=2&sort=best&afterId=${id(9)}&afterCreated=2026-07-01T00:00:09%2B00:00&afterScore=4`);
    expect(mocks.rpc).toHaveBeenLastCalledWith("speed_trivia_review_queue", expect.objectContaining({ p_sort: "best", p_score_min: 2, p_score_max: 2, p_after_score: 4, p_after_id: id(9) }));
    await get(`?sort=oldest&afterId=${id(9)}&afterCreated=2026-07-01T00:00:09%2B00:00&afterScore=4`);
    expect(mocks.rpc).toHaveBeenLastCalledWith("speed_trivia_review_queue", expect.objectContaining({ p_sort: "oldest", p_after_score: null }));
  });

  it("signs Keep with the admission secret and passes exactly the reviewed content hash", async () => {
    mocks.rpc.mockReturnValue(ok({ rows: [{ id: id(1), outcome: "approved" }] }));
    const response = await post({ action: "keep", rows: [{ id: id(1), contentHash: hash(1) }] });
    expect(await response.json()).toEqual({ ok: true, rows: [{ id: id(1), outcome: "approved" }] });
    const [name, args] = mocks.rpc.mock.calls[0] as [string, { p_check: Record<string, unknown>; p_signature: string }];
    expect(name).toBe("speed_trivia_quick_keep");
    expect(args.p_check).toMatchObject({ operation: "quick_keep", policyVersion: core.POLICY_VERSION, rows: [{ id: id(1), contentHash: hash(1) }] });
    expect(args.p_signature).toBe(runtime.sign(SECRET, args.p_check));
    expect(Number(args.p_check.expiresAt)).toBeLessThanOrEqual(Date.now() + 120_000);
    expect(mocks.paid).not.toHaveBeenCalled();
  });

  it("refuses malformed Keep input and a missing secret", async () => {
    for (const rows of [[], [{ id: "x", contentHash: hash(1) }], [{ id: id(1), contentHash: "short" }], Array.from({ length: 201 }, (_, n) => ({ id: id(n), contentHash: hash(n) }))]) {
      expect((await post({ action: "keep", rows })).status).toBe(400);
    }
    vi.stubEnv("SPEED_TRIVIA_ADMISSION_SECRET", "");
    expect((await post({ action: "keep", rows: [{ id: id(1), contentHash: hash(1) }] })).status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects with a reason and validates ids", async () => {
    mocks.rpc.mockReturnValue(ok({ rejected: [id(1)] }));
    expect(await (await post({ action: "reject", ids: [id(1), id(1)], reason: "wrong" })).json()).toEqual({ ok: true, rejected: [id(1)] });
    expect(mocks.rpc).toHaveBeenCalledWith("speed_trivia_quick_reject", { p_row_ids: [id(1)], p_reason: "wrong" });
    await post({ action: "reject", ids: [id(2)], reason: "quality" });
    expect(mocks.rpc).toHaveBeenLastCalledWith("speed_trivia_quick_reject", { p_row_ids: [id(2)], p_reason: "quality" });
    expect((await post({ action: "reject", ids: ["not-a-uuid"], reason: "quality" })).status).toBe(400);
    // 3c: a quality reject releases the fact (D5), so anything but an exact reason is refused.
    mocks.rpc.mockClear();
    for (const reason of [undefined, null, "", "Wrong", "wrong_answer", "QUALITY", "anything", 1]) {
      const response = await post({ action: "reject", ids: [id(3)], reason });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ ok: false, error: "Invalid request." });
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("3c: Undo says which list the question is back in", async () => {
    mocks.rpc.mockReturnValue(ok({ id: id(1), status: "pending_review", view: "needs_look" }));
    expect(await (await post({ action: "undo", id: id(1) })).json()).toEqual({ ok: true, id: id(1), status: "pending_review", view: "needs_look" });
    // Anything else (including a server without 3c) is Waiting.
    mocks.rpc.mockReturnValue(ok({ id: id(1), status: "pending_review" }));
    expect(await (await post({ action: "undo", id: id(1) })).json()).toEqual({ ok: true, id: id(1), status: "pending_review", view: "waiting" });
  });

  it("maps a refused Undo to 409", async () => {
    mocks.rpc.mockReturnValue(Promise.resolve({ data: null, error: { message: "quick-review-undo-drift" } }));
    const response = await post({ action: "undo", id: id(1) });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "undo_refused", error: "Can't undo. It changed since." });
    expect(mocks.rpc).toHaveBeenCalledWith("speed_trivia_quick_undo", { p_row_id: id(1) });
  });
});

describe("Quick Keep tags an untagged question first (Phase 4c.1)", () => {
  const keepRpc = () => {
    const upsertsAtKeep: number[] = [];
    mocks.rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
      if (name !== "speed_trivia_quick_keep") throw new Error(`unexpected ${name}`);
      upsertsAtKeep.push(mocks.upserts.length);
      const tagged = new Set(mocks.tags.map((tag) => tag.question_ref).concat(mocks.upserts.flat().map((tag) => String(tag.question_ref))));
      return ok({ rows: (args.p_check as { rows: { id: string }[] }).rows.map((row) => ({ id: row.id, outcome: tagged.has(row.id) ? "queued" : "untagged" })) });
    });
    return upsertsAtKeep;
  };

  it("tags only the waiting rows without a tag, then signs the Keep unchanged", async () => {
    const tagger = fakeOpenAI();
    mocks.tags = [{ question_ref: id(1), subject_key: "gravity" }, { question_ref: id(3), subject_key: null }];
    mocks.waiting = [waitingRow(1), waitingRow(2), waitingRow(3)];
    const upsertsAtKeep = keepRpc();
    // id(4) has no tag but isn't waiting (decided elsewhere): never tagged.
    const response = await post({ action: "keep", rows: [1, 2, 3, 4].map((n) => ({ id: id(n), contentHash: hash(n) })) });
    expect(tagger.calls).toBe(2);
    expect(mocks.upserts.flat().map((tag) => tag.question_ref)).toEqual([id(2), id(3)]);
    expect(mocks.upserts.flat()[0]).toMatchObject({ game: "speed", subject_key: "gravity", tagged_by: "openai:gpt-6.1-sol:quick-keep-v1" });
    expect(upsertsAtKeep).toEqual([2]);
    const [, args] = mocks.rpc.mock.calls[0] as [string, { p_check: { rows: unknown[] } }];
    expect(args.p_check.rows).toEqual([1, 2, 3, 4].map((n) => ({ id: id(n), contentHash: hash(n) })));
    expect((await response.json()).rows.map((row: { outcome: string }) => row.outcome)).toEqual(["queued", "queued", "queued", "untagged"]);
  });

  it("tags at most 25 per request, 4 at a time; the rest stay untagged", async () => {
    const tagger = fakeOpenAI();
    mocks.waiting = Array.from({ length: 30 }, (_, n) => waitingRow(n + 1));
    keepRpc();
    const response = await post({ action: "keep", rows: mocks.waiting.map((row, n) => ({ id: row.id, contentHash: hash(n + 1) })) });
    expect(tagger.calls).toBe(25);
    expect(tagger.maxInFlight).toBe(4);
    const outcomes = (await response.json()).rows.map((row: { outcome: string }) => row.outcome);
    expect(outcomes.filter((outcome: string) => outcome === "untagged")).toHaveLength(5);
  });

  it("a failed tag keeps the untagged outcome and still runs the Keep", async () => {
    const tagger = fakeOpenAI(false);
    mocks.waiting = [waitingRow(1)];
    keepRpc();
    const response = await post({ action: "keep", rows: [{ id: id(1), contentHash: hash(1) }] });
    expect(tagger.calls).toBe(1);
    expect(mocks.upserts).toEqual([]);
    expect(await response.json()).toEqual({ ok: true, rows: [{ id: id(1), outcome: "untagged" }] });
  });

  it("makes no tag reads or calls without an OpenAI key", async () => {
    mocks.waiting = [waitingRow(1)];
    keepRpc();
    await post({ action: "keep", rows: [{ id: id(1), contentHash: hash(1) }] });
    expect(mocks.upserts).toEqual([]);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});

describe("Quick Review bulk by filter", () => {
  // A fake queue: decided rows leave it, like the SQL function.
  // full: rows whose subject is at the star cap (Phase 4a.1); Keep leaves them waiting.
  // changes: row number -> how many more Keeps see it changed by another writer (Infinity: every time).
  const fakeDb = (count: number, full: Set<number> = new Set(), changes: Map<number, number> = new Map()) => {
    const waiting = Array.from({ length: count }, (_, n) => item(n + 1, n % 2 === 0));
    const order = waiting.map((row) => row.id);
    mocks.rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
      if (name === "speed_trivia_review_queue") {
        const rows = waiting.filter((row) => !args.p_category || row.category === args.p_category);
        const start = args.p_after_id ? order.indexOf(String(args.p_after_id)) : -1;
        return ok({ total: rows.length, rows: rows.filter((row) => order.indexOf(row.id) > start).slice(0, Number(args.p_limit)) });
      }
      if (name === "speed_trivia_quick_reject") {
        const ids = args.p_row_ids as string[];
        for (const rowId of ids) waiting.splice(waiting.findIndex((row) => row.id === rowId), 1);
        return ok({ rejected: ids });
      }
      if (name === "speed_trivia_quick_keep") {
        const rows = (args.p_check as { rows: { id: string }[] }).rows;
        const isFull = (rowId: string) => full.has(order.indexOf(rowId) + 1);
        const isChanged = (rowId: string) => {
          const left = changes.get(order.indexOf(rowId) + 1) ?? 0;
          if (left > 0) changes.set(order.indexOf(rowId) + 1, left - 1);
          return left > 0;
        };
        const outcomes = rows.map((row) => ({ id: row.id, outcome: isChanged(row.id) ? "changed" : isFull(row.id) ? "subject_full" : waiting.find((w) => w.id === row.id)!.recent ? "approved" : "queued" }));
        for (const row of outcomes) if (row.outcome === "approved" || row.outcome === "queued") waiting.splice(waiting.findIndex((w) => w.id === row.id), 1);
        return ok({ rows: outcomes });
      }
      throw new Error(`unexpected ${name}`);
    });
    return waiting;
  };
  const filter = { category: null, source: "all" as const, sort: "newest" as const, score: null, view: "waiting" as const };

  it("works through the whole filter in pages of 100, capped at the confirmed count", async () => {
    const waiting = fakeDb(250);
    const result = await runQuickReviewBulk("reject", filter, 230);
    expect(result).toEqual({ processed: 230, approved: 0, queued: 0, full: 0, rejected: 230, changed: 0, remaining: 20, next: { createdAt: item(230).createdAt, id: id(230) } });
    expect(waiting).toHaveLength(20);
    const rejectCalls = mocks.rpc.mock.calls.filter(([name]) => name === "speed_trivia_quick_reject");
    expect(rejectCalls.map(([, args]) => (args as { p_row_ids: string[] }).p_row_ids.length)).toEqual([100, 100, 30]);
    expect(rejectCalls.every(([, args]) => (args as { p_reason: string }).p_reason === "quality")).toBe(true);
    // Bulk always reads oldest first.
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "speed_trivia_review_queue").every(([, args]) => (args as { p_sort: string }).p_sort === "oldest")).toBe(true);
  });

  it("passes the score band to every page of a bulk action", async () => {
    fakeDb(30);
    const result = await runQuickReviewBulk("reject", { ...filter, score: 1 }, 30);
    expect(result.rejected).toBe(30);
    const reads = mocks.rpc.mock.calls.filter(([name]) => name === "speed_trivia_review_queue");
    expect(reads.every(([, args]) => (args as { p_score_min: number; p_score_max: number }).p_score_min === 1 && (args as { p_score_max: number }).p_score_max === 1)).toBe(true);
  });

  it("keeps: approves the already-checked rows, queues the rest, at most 1,000 per request", async () => {
    fakeDb(1200);
    const result = await runQuickReviewBulk("keep", filter, 5000);
    expect(result).toMatchObject({ processed: 1000, approved: 500, queued: 500, full: 0, rejected: 0, remaining: 200 });
    expect(mocks.paid).not.toHaveBeenCalled();
  });

  it("keeps past rows whose subject is full: they stay waiting and paging continues after them (Phase 4a.1)", async () => {
    // Rows 1-100 (the whole first page) and 150 are subject-full.
    const waiting = fakeDb(250, new Set([...Array.from({ length: 100 }, (_, n) => n + 1), 150]));
    const first = await runQuickReviewBulk("keep", filter, 250);
    expect(first).toMatchObject({ processed: 250, approved: 75, queued: 74, full: 101, next: { id: id(250) } });
    expect(waiting.map((row) => row.id)).toEqual([...Array.from({ length: 100 }, (_, n) => id(n + 1)), id(150)]);
    // The client passes `next` back: a later request starts after it and finds nothing more.
    const again = await runQuickReviewBulk("keep", filter, 250, Date.now, { ...first.next!, score: 0 });
    expect(again).toMatchObject({ processed: 0, full: 0 });
  });

  it("Phase 4c.1: a bulk Keep tags at most 25 in the whole request, across its pages", async () => {
    const tagger = fakeOpenAI();
    fakeDb(250);
    mocks.waiting = Array.from({ length: 250 }, (_, n) => waitingRow(n + 1));
    const result = await runQuickReviewBulk("keep", filter, 250);
    expect(result.processed).toBe(250);
    expect(tagger.calls).toBe(25);
  });

  // Post-4c.4 review #7: rows changed under a bulk Keep are never skipped silently.
  it("4c.10: a page of only changed rows stops, even after an earlier full page", async () => {
    const all = new Map(Array.from({ length: 100 }, (_, n) => [n + 101, Infinity] as const));
    const waiting = fakeDb(200, new Set(Array.from({ length: 100 }, (_, n) => n + 1)), all);
    const result = await runQuickReviewBulk("keep", filter, 200);
    expect(result).toMatchObject({ processed: 100, full: 100, approved: 0, queued: 0, changed: 100, next: { id: id(100) } });
    expect(waiting).toHaveLength(200);
    // Read page 1, read page 2, then one re-read of page 2.
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "speed_trivia_review_queue")).toHaveLength(3);
  });

  it("4c.10: a mixed page re-reads its changed rows once and keeps them", async () => {
    const waiting = fakeDb(10, new Set([4]), new Map([[3, 1], [7, 1]]));
    const result = await runQuickReviewBulk("keep", filter, 10);
    expect(result).toMatchObject({ processed: 10, approved: 5, queued: 4, full: 1, changed: 0 });
    expect(waiting.map((row) => row.id)).toEqual([id(4)]);
    // The re-read starts just after row 2, the row before the first changed one.
    const reads = mocks.rpc.mock.calls.filter(([name]) => name === "speed_trivia_review_queue");
    expect((reads[1][1] as { p_after_id: string }).p_after_id).toBe(id(2));
  });

  it("4c.10: rows that change twice are reported and the cursor sits before them", async () => {
    const waiting = fakeDb(10, new Set(), new Map([[4, Infinity]]));
    const result = await runQuickReviewBulk("keep", filter, 10);
    expect(result).toMatchObject({ processed: 9, changed: 1, next: { id: id(3) } });
    expect(waiting.map((row) => row.id)).toEqual([id(4)]);
    // A changed first row puts the cursor back where the request started.
    fakeDb(3, new Set(), new Map([[1, Infinity]]));
    expect(await runQuickReviewBulk("keep", filter, 3)).toMatchObject({ processed: 2, changed: 1, next: null });
  });

  it("stops when a page makes no progress or time runs out", async () => {
    mocks.rpc.mockImplementation((name: string) => name === "speed_trivia_review_queue" ? ok({ total: 5, rows: [item(1)] }) : ok({ rows: [{ id: id(1), outcome: "not_pending" }] }));
    expect(await runQuickReviewBulk("keep", filter, 5)).toMatchObject({ processed: 0, remaining: 5, changed: 0 });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);

    fakeDb(500);
    let clock = 0;
    const result = await runQuickReviewBulk("reject", filter, 500, () => (clock += 40_000));
    expect(result.processed).toBe(100);
  });
});

describe("Quick Review writer source (Phase 4b)", () => {
  const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);

  it("passes ChatGPT / Gemini through as Source values", async () => {
    mocks.rpc.mockReturnValue(ok({ total: 0, rows: [] }));
    await get("?source=chatgpt");
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_source: "chatgpt" });
    await get("?source=gemini");
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_source: "gemini" });
  });



  it("says Writer stopped when no batch arrived for over 2 days, but not before the first run", async () => {
    mocks.rpc.mockReturnValue(ok({ total: 0, rows: [] }));
    mocks.runs = [{ run_date: day(5), source: "chatgpt" }];
    expect((await (await get()).json()).writerStopped).toBe(true);
    mocks.runs = [{ run_date: day(2), source: "chatgpt" }];
    expect((await (await get()).json()).writerStopped).toBe(false);
    mocks.runs = [];
    expect((await (await get()).json()).writerStopped).toBe(false);
  });
});
