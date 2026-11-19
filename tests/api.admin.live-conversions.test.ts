import { beforeEach, describe, expect, it, vi } from "vitest";

// "Make Live" admin API (docs/speed-trivia-backlog-and-quality-plan.md Phase 4e, D37). Fake server client; no database.
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/adminAuth", () => ({ requireAdminAuth: mocks.auth }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { rpc: mocks.rpc, from: () => { throw new Error("no table reads"); } } }));
import { DELETE, GET, POST } from "@/app/api/admin/trivia/live-conversions/route";
import { conversionState } from "@/lib/liveConversions";

const ID = "86000000-0000-4000-8000-000000000001";
const url = "https://example.invalid/api/admin/trivia/live-conversions";
const send = (method: "POST" | "DELETE", body: unknown) =>
  (method === "POST" ? POST : DELETE)(new Request(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ ok: true });
});

describe("live-conversions route", () => {
  it("is admin only", async () => {
    mocks.auth.mockResolvedValue({ ok: false, error: "Unauthorized.", status: 401 });
    expect((await send("POST", { questionId: ID })).status).toBe(401);
    expect((await GET(new Request(`${url}?ids=${ID}`))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("queues, cancels and maps refusals to a 409 with plain words", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { id: "r1", status: "queued", already: false }, error: null });
    expect(await (await send("POST", { questionId: ID })).json()).toEqual({ ok: true, state: "queued", already: false });
    expect(mocks.rpc).toHaveBeenLastCalledWith("live_conversion_queue", { p_question_id: ID });
    mocks.rpc.mockResolvedValueOnce({ data: { cancelled: true }, error: null });
    expect(await (await send("DELETE", { questionId: ID })).json()).toEqual({ ok: true, cancelled: true });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "conversion-already-live" } });
    const refused = await send("POST", { questionId: ID });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: "already_live", error: "Already in Live." });
    expect((await send("POST", { questionId: "nope" })).status).toBe(400);
  });

  it("reads ≤ 100 labels in one call and leaves out questions with nothing to show", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [
      { questionId: ID, status: "done", reason: null, liveStatus: "pending_review" },
      { questionId: "86000000-0000-4000-8000-000000000002", status: "done", reason: null, liveStatus: "reject" },
    ], error: null });
    const response = await GET(new Request(`${url}?ids=${ID},86000000-0000-4000-8000-000000000002`));
    expect(await response.json()).toEqual({ ok: true, states: { [ID]: { state: "in_review" } } });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const many = Array.from({ length: 101 }, (_, i) => `86000000-0000-4000-8000-${String(i).padStart(12, "0")}`).join(",");
    expect((await GET(new Request(`${url}?ids=${many}`))).status).toBe(400);
  });

  it("labels every request status", () => {
    expect(conversionState({ status: "queued", reason: null, liveStatus: null })).toEqual({ state: "queued" });
    expect(conversionState({ status: "sent", reason: null, liveStatus: "received" })).toEqual({ state: "converting" });
    expect(conversionState({ status: "declined", reason: "Too hard.", liveStatus: null })).toEqual({ state: "not_convertible", reason: "Too hard." });
    expect(conversionState({ status: "failed", reason: "Already in Live: X", liveStatus: "rejected" })).toEqual({ state: "not_convertible", reason: "Already in Live: X" });
    expect(conversionState({ status: "done", reason: null, liveStatus: "pr_open" })).toEqual({ state: "kept" });
    expect(conversionState({ status: "done", reason: null, liveStatus: "published" })).toEqual({ state: "in_live" });
  });
});
