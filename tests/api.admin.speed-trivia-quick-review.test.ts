import { beforeEach, describe, expect, it, vi } from "vitest";
import * as core from "@/lib/speed-trivia-uniqueness/core.cjs";
import * as runtime from "@/lib/speed-trivia-uniqueness/runtime.cjs";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), auth: vi.fn(), paid: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
vi.mock("@/lib/adminAuth", () => ({ requireAdminAuth: mocks.auth }));
// Quick Review must never reach the paid checker.
vi.mock("@/lib/speedTriviaAdmission", () => ({ openSpeedTriviaAdmission: mocks.paid, approveSpeedTrivia: mocks.paid, writeSpeedTrivia: mocks.paid }));
import { GET, POST } from "@/app/api/admin/trivia/quick-review/route";
import { runQuickReviewBulk } from "@/lib/speedTriviaQuickReview";

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
});

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
    expect(await response.json()).toEqual({ ok: true, total: 7333, items: [item(1)], counts: { queued: 0, needsLook: 0, repeats: 0 } });
    expect(mocks.rpc).toHaveBeenCalledWith("speed_trivia_review_queue", { p_category: "Science", p_source: "recent", p_sort: "newest", p_after_created: "2026-07-01T00:00:09+00:00", p_after_id: id(9), p_limit: 50, p_score_min: null, p_score_max: null, p_after_score: null, p_view: "waiting" });
    await get("?category=Literary%20Landscapes&source=live&sort=random&afterId=bad&score=9");
    expect(mocks.rpc).toHaveBeenLastCalledWith("speed_trivia_review_queue", { p_category: null, p_source: "all", p_sort: "best", p_after_created: null, p_after_id: null, p_limit: 50, p_score_min: null, p_score_max: null, p_after_score: null, p_view: "waiting" });
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

describe("Quick Review bulk by filter", () => {
  // A fake queue: decided rows leave it, like the SQL function.
  const fakeDb = (count: number) => {
    const waiting = Array.from({ length: count }, (_, n) => item(n + 1, n % 2 === 0));
    mocks.rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
      if (name === "speed_trivia_review_queue") {
        const rows = waiting.filter((row) => !args.p_category || row.category === args.p_category);
        return ok({ total: rows.length, rows: rows.slice(0, Number(args.p_limit)) });
      }
      if (name === "speed_trivia_quick_reject") {
        const ids = args.p_row_ids as string[];
        for (const rowId of ids) waiting.splice(waiting.findIndex((row) => row.id === rowId), 1);
        return ok({ rejected: ids });
      }
      if (name === "speed_trivia_quick_keep") {
        const rows = (args.p_check as { rows: { id: string }[] }).rows;
        const outcomes = rows.map((row) => ({ id: row.id, outcome: waiting.find((w) => w.id === row.id)!.recent ? "approved" : "queued" }));
        for (const row of rows) waiting.splice(waiting.findIndex((w) => w.id === row.id), 1);
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
    expect(result).toEqual({ processed: 230, approved: 0, queued: 0, rejected: 230, remaining: 20 });
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
    expect(result).toEqual({ processed: 1000, approved: 500, queued: 500, rejected: 0, remaining: 200 });
    expect(mocks.paid).not.toHaveBeenCalled();
  });

  it("stops when a page makes no progress or time runs out", async () => {
    mocks.rpc.mockImplementation((name: string) => name === "speed_trivia_review_queue" ? ok({ total: 5, rows: [item(1)] }) : ok({ rows: [{ id: id(1), outcome: "changed" }] }));
    expect(await runQuickReviewBulk("keep", filter, 5)).toMatchObject({ processed: 0, remaining: 5 });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);

    fakeDb(500);
    let clock = 0;
    const result = await runQuickReviewBulk("reject", filter, 500, () => (clock += 40_000));
    expect(result.processed).toBe(100);
  });
});
