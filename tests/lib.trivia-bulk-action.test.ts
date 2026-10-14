import { describe, expect, it, vi } from "vitest";
import { runTriviaBulkAction } from "@/lib/triviaBulkAction";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
describe("interrupted question approval", () => {
  it("reconciles an HTML timeout without approving again or treating pending rows as repeats", async () => {
    const ids = Array.from({ length: 200 }, (_, i) => `question-${i}`);
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("<html><h1>Timeout</h1></html>", { status: 504 }))
      .mockResolvedValueOnce(json({ ok: true, items: ids.map((id, i) => ({ id, status: i < 5 ? "active" : "pending_review" })) }));
    const result = await runTriviaBulkAction("approve", ids, "anytime_blitz", request);
    expect(result).toMatchObject({ ok: false, recovered: true, savedIds: ids.slice(0, 5), notProcessed: ids.slice(5) });
    expect(result.repeats).toBeUndefined();
    expect(result.error).toContain("does not mean they are repeats");
    expect(request.mock.calls.map(([, options]) => JSON.parse(String(options?.body)).action)).toEqual(["approve", "status"]);
  });
  it("keeps confirmed saves and avoids a misleading JSON error when recovery also fails", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error("Network lost"));
    const result = await runTriviaBulkAction("approve", ["a", "b"], "anytime_blitz", request);
    expect(result).toMatchObject({ ok: false, recovered: true, savedIds: [] });
    expect(result.error).toContain("could not be confirmed");
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("recovers a committed row whose post-write refresh hit the deadline", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ ok: false, code: "budget_exhausted", savedIds: ["a"], repeats: [{ id: "c" }], error: "Approval paused." }, 503))
      .mockResolvedValueOnce(json({ ok: true, items: [{ id: "a", status: "active" }, { id: "b", status: "active" }, { id: "c", status: "pending_review" }, { id: "d", status: "pending_review" }] }));
    expect(await runTriviaBulkAction("approve", ["a", "b", "c", "d"], "anytime_blitz", request)).toMatchObject({ savedIds: ["a", "b"], repeats: [{ id: "c" }], notProcessed: ["d"], error: "Approval paused." });
  });
  it("returns ordinary repeat results directly without extra reads or another paid request", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(json({ ok: false, code: "duplicate", savedIds: ["a"], repeats: [{ id: "b" }] }, 409));
    expect(await runTriviaBulkAction("approve", ["a", "b"], "anytime_blitz", request)).toMatchObject({ savedIds: ["a"], repeats: [{ id: "b" }] });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("reconciles deletion using deleted status, never active status", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("Lost response")).mockResolvedValueOnce(json({ ok: true, items: [{ id: "a", status: "deleted" }, { id: "b", status: "active" }] }));
    expect(await runTriviaBulkAction("delete", ["a", "b"], "anytime_blitz", request)).toMatchObject({ savedIds: ["a"], notProcessed: ["b"] });
  });
});
