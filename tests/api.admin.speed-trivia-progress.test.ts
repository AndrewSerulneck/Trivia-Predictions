import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBudget } from "@/lib/speed-trivia-uniqueness/runtime.cjs";
import { consumeTriviaReviewStream } from "@/lib/triviaReviewParser";
import type { TriviaReviewRecord } from "@/types/triviaReview";
const mocks = vi.hoisted(() => ({ from: vi.fn(), open: vi.fn(), approve: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("@/lib/adminAuth", () => ({ requireAdminAuth: mocks.auth }));
vi.mock("@/lib/speedTriviaAdmission", () => ({ openSpeedTriviaAdmission: mocks.open, approveSpeedTrivia: mocks.approve,
  speedTriviaError: (error: { code?: string; conflicts?: string[] }) => ({ code: error.code ?? "write_failed", status: 503, conflicts: error.conflicts ?? [] }) }));
import { POST } from "@/app/api/admin/trivia/questions/route";
import { POST as diagnostic } from "@/app/api/admin/trivia/review-diagnostic/route";
const row = (id: string) => ({ id, question: `Question ${id}?`, options: ["Ångström", "B", "C", "D"], correct_answer: 0, status: "pending_review", question_pool: "anytime_blitz", answer_format: "multiple_choice" });
const request = (body: unknown, signal?: AbortSignal) => new Request("https://example.invalid/api/admin/trivia/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
const approve = (ids: string[], signal?: AbortSignal) => POST(request({ action: "approve", pool: "anytime_blitz", ids, progressive: true }, signal));
const selectedRead = (data: ReturnType<typeof row>[]) => {
  const query = { select: vi.fn(), in: vi.fn(), eq: vi.fn(), abortSignal: vi.fn().mockResolvedValue({ data, error: null }) };
  query.select.mockReturnValue(query); query.in.mockReturnValue(query); query.eq.mockReturnValue(query); mocks.from.mockReturnValue(query);
  return query;
};
const collect = async (response: Response) => {
  const records: TriviaReviewRecord[] = [];
  const final = await consumeTriviaReviewStream(response, "review", record => records.push(record));
  return { records, final };
};
describe("progressive Speed review", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers(); mocks.auth.mockResolvedValue({ ok: true });
    mocks.open.mockResolvedValue({ budget: { assertTime: vi.fn() }, index: () => ({ byId: new Map() }) });
    mocks.approve.mockResolvedValue({ status: "active" });
  });
  afterEach(() => vi.useRealTimers());
  it("delivers start and heartbeats while corpus loading and the first provider check are delayed", async () => {
    selectedRead([row("a")]);
    let opened!: () => void, checked!: () => void;
    const loading = new Promise<void>(resolve => { opened = resolve; });
    mocks.open.mockImplementation(async () => { await loading; return { budget: { assertTime: vi.fn() } }; });
    mocks.approve.mockImplementation(() => new Promise<void>(resolve => { checked = resolve; }));
    const response = await approve(["a"]);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const records: TriviaReviewRecord[] = [];
    const finished = consumeTriviaReviewStream(response, "review", record => records.push(record));
    await vi.advanceTimersByTimeAsync(0);
    expect(records).toEqual([{ type: "start", version: 1, mode: "review", total: 1 }]);
    expect(mocks.approve).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(35_000);
    expect(records.filter(record => record.type === "heartbeat")).toHaveLength(7);
    opened(); await vi.advanceTimersByTimeAsync(0);
    expect(records).toContainEqual({ type: "checking", id: "a", question: "Question a?" });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(records.at(-1)).toMatchObject({ type: "heartbeat", elapsedMs: 45_000 });
    checked(); await finished;
    expect(records.at(-2)).toMatchObject({ type: "row", result: { id: "a", outcome: "approved" } });
    expect(vi.getTimerCount()).toBe(0); expect(mocks.open).toHaveBeenCalledTimes(1);
  });
  it("pauses 200 selected rows after three saved approvals with one shared gate", async () => {
    const rows = Array.from({ length: 200 }, (_, index) => row(String(index))); selectedRead(rows);
    let saved = 0;
    mocks.open.mockResolvedValue({ budget: { assertTime: () => { if (saved === 3) throw Object.assign(new Error("Deadline"), { code: "budget_exhausted" }); } } });
    mocks.approve.mockImplementation(async () => { saved++; });
    const { records, final } = await collect(await approve(rows.map(item => item.id)));
    expect(final).toMatchObject({ type: "complete", result: { ok: true, paused: true, code: "budget_exhausted", savedIds: ["0", "1", "2"], notProcessed: rows.slice(3).map(item => item.id) } });
    expect(records.filter(record => record.type === "row")).toHaveLength(3);
    expect(mocks.open).toHaveBeenCalledTimes(1); expect(mocks.approve).toHaveBeenCalledTimes(3); expect(mocks.from).toHaveBeenCalledTimes(1);
  });
  it("shares the configured $0.50 ceiling across the entire selection instead of funding each row", async () => {
    selectedRead([row("a"), row("b"), row("c"), row("d")]);
    const budget = createBudget({ dollars: 0.50, elapsedMs: 240_000 });
    mocks.open.mockResolvedValue({ budget });
    mocks.approve.mockImplementation(async () => { budget.reserve({ dollars: 0.20 }); });
    const { final } = await collect(await approve(["a", "b", "c", "d"]));
    expect(final).toMatchObject({ result: { ok: true, paused: true, savedIds: ["a", "b"], notProcessed: ["c", "d"] } });
    expect(budget.summary()).toMatchObject({ dollars: 0.40, ceiling: { dollars: 0.50 } }); expect(mocks.open).toHaveBeenCalledTimes(1);
  });
  it("reports exact repeat/hold reasons and approved matches without another database read", async () => {
    selectedRead([row("a"), row("b"), row("c")]);
    const active = { ...row("keeper"), status: "active", question: "Which unit is named after Ångström?" };
    mocks.open.mockResolvedValue({ budget: { assertTime: vi.fn() }, index: () => ({ byId: new Map([["keeper", { row: active }], ["pending", { row: row("pending") }]]) }) });
    mocks.approve.mockRejectedValueOnce(Object.assign(new Error("Same measured fact"), { code: "duplicate", conflicts: ["keeper", "pending"] }))
      .mockRejectedValueOnce(Object.assign(new Error("Premise not verified"), { code: "uncertain" }));
    const { records, final } = await collect(await approve(["a", "b", "c"]));
    expect(records).toContainEqual(expect.objectContaining({ type: "row", result: { id: "a", outcome: "repeat", code: "duplicate", reason: "Same measured fact", matches: [{ id: "keeper", question: active.question, answer: "Ångström" }] } }));
    expect(records).toContainEqual(expect.objectContaining({ type: "row", result: expect.objectContaining({ id: "b", outcome: "unresolved", reason: "Premise not verified" }) }));
    expect(final).toMatchObject({ result: { ok: true, savedIds: ["c"], notProcessed: [] } }); expect(mocks.from).toHaveBeenCalledTimes(1);
  });
  it("preserves earlier results on a provider failure and leaves later rows unchecked", async () => {
    selectedRead([row("a"), row("b"), row("c")]);
    mocks.approve.mockResolvedValueOnce(row("a")).mockRejectedValueOnce(Object.assign(new Error("Provider unavailable"), { code: "verification_unavailable" }));
    const { final } = await collect(await approve(["a", "b", "c"]));
    expect(final).toMatchObject({ result: { ok: false, savedIds: ["a"], holds: [{ id: "b", code: "verification_unavailable" }], notProcessed: ["c"], needsRecovery: true } });
    expect(mocks.approve).toHaveBeenCalledTimes(2);
  });
  it("does not start another question after reader cancellation", async () => {
    selectedRead([row("a"), row("b")]); let finish!: () => void;
    mocks.approve.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const response = await approve(["a", "b"]); const reader = response.body!.getReader();
    await vi.advanceTimersByTimeAsync(0); await reader.read(); await reader.cancel(); finish(); await vi.advanceTimersByTimeAsync(0);
    expect(mocks.approve).toHaveBeenCalledTimes(1); expect(mocks.open.mock.calls[0][0].signal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  it("measures bounded transfer for a complete synthetic 200-row run", async () => {
    const rows = Array.from({ length: 200 }, (_, index) => row(String(index))); selectedRead(rows);
    const response = await approve(rows.map(item => item.id));
    const bytes = new TextEncoder().encode(await response.text()).byteLength;
    expect(bytes).toBeLessThan(100_000); expect(mocks.open).toHaveBeenCalledTimes(1); expect(mocks.approve).toHaveBeenCalledTimes(200);
    console.log(JSON.stringify({ syntheticSelected: 200, streamBytes: bytes, paidCalls: 0 }));
  });
  it("rejects unauthenticated or incompatible progressive requests before work", async () => {
    mocks.auth.mockResolvedValue({ ok: false, status: 401, error: "Unauthorized" });
    const denied = await approve(["a"]); expect(denied.status).toBe(401); expect(denied.headers.get("Cache-Control")).toContain("no-store");
    mocks.auth.mockResolvedValue({ ok: true });
    for (const body of [{ action: "approve", ids: [], pool: "anytime_blitz", progressive: true }, { action: "delete", ids: ["a"], pool: "anytime_blitz", progressive: true }, { action: "approve", ids: ["a"], pool: "live_showdown", progressive: true }]) expect((await POST(request(body))).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.open).not.toHaveBeenCalled();
  });
});
describe("free authenticated transport diagnostic", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); mocks.auth.mockResolvedValue({ ok: true }); });
  afterEach(() => vi.useRealTimers());
  it("streams for a fixed 45 seconds with a distinct diagnostic conclusion and no question/provider work", async () => {
    const response = await diagnostic(request({})); const records: TriviaReviewRecord[] = [];
    const result = consumeTriviaReviewStream(response, "diagnostic", record => records.push(record));
    await vi.advanceTimersByTimeAsync(0); expect(records[0]).toMatchObject({ type: "start", mode: "diagnostic", durationMs: 45_000 });
    await vi.advanceTimersByTimeAsync(40_000); expect(records.at(-1)).toMatchObject({ type: "heartbeat", elapsedMs: 40_000 });
    await vi.advanceTimersByTimeAsync(5_000); expect(await result).toEqual({ type: "diagnostic_complete", elapsedMs: 45_000, questionReads: 0, questionWrites: 0, providerCalls: 0 });
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.open).not.toHaveBeenCalled(); expect(mocks.approve).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("requires admin auth and rejects IDs or caller-specified duration", async () => {
    mocks.auth.mockResolvedValueOnce({ ok: false, status: 401, error: "Unauthorized" });
    expect((await diagnostic(request({}))).status).toBe(401);
    for (const body of [{ ids: ["a"] }, { durationMs: 300_000 }, null, []]) expect((await diagnostic(request(body))).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.open).not.toHaveBeenCalled();
  });
});
