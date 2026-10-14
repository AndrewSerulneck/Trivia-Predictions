import { describe, expect, it, vi } from "vitest";
import { runTriviaBulkAction } from "@/lib/triviaBulkAction";
import { consumeTriviaReviewStream } from "@/lib/triviaReviewParser";
import { REVIEW_STREAM_TYPE } from "@/lib/triviaReviewTransport";
import type { TriviaReviewRecord, TriviaReviewRow } from "@/types/triviaReview";
const start: TriviaReviewRecord = { type: "start", mode: "review", version: 1, total: 4 };
const row = (result: TriviaReviewRow): TriviaReviewRecord => ({ type: "row", result, counts: { checked: 1, approved: 0, repeats: 1, unresolved: 0, remaining: 3 } });
const repeat: TriviaReviewRow = { id: "b", outcome: "repeat", code: "duplicate", reason: "Same fact: Beyoncé’s album 🎵", matches: [{ id: "keeper", question: "Who released Beyoncé’s album?", answer: "Beyoncé" }] };
const stream = (records: unknown[], chunkSize = 17, tail = "") => {
  const bytes = new TextEncoder().encode(records.map(record => JSON.stringify(record) + "\n").join("") + tail);
  let offset = 0;
  return new Response(new ReadableStream<Uint8Array>({ pull(controller) {
    if (offset === bytes.length) { controller.close(); return; }
    const end = Math.min(bytes.length, offset + chunkSize); controller.enqueue(bytes.slice(offset, end)); offset = end;
  } }), { headers: { "Content-Type": REVIEW_STREAM_TYPE } });
};
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
describe("incremental review client", () => {
  it.each([1, 2, 7, 1024])("parses Unicode and records across %i-byte chunks without losing exact matches", async size => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(stream([start, row(repeat), { type: "complete", result: { ok: true, savedIds: ["a"], notProcessed: ["c", "d"] } }], size));
    const progress = vi.fn();
    const result = await runTriviaBulkAction("approve", ["a", "b", "c", "d"], "anytime_blitz", request, progress);
    expect(result).toMatchObject({ ok: true, savedIds: ["a"], repeats: [repeat], notProcessed: ["c", "d"] });
    expect(progress.mock.calls[1][0]).toMatchObject({ type: "row", result: repeat }); expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toMatchObject({ progressive: true });
  });
  it("exposes a result before the response is complete", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const response = new Response(new ReadableStream({ start(value) { controller = value; } }), { headers: { "Content-Type": REVIEW_STREAM_TYPE } });
    const send = (record: TriviaReviewRecord) => controller.enqueue(new TextEncoder().encode(JSON.stringify(record) + "\n"));
    const request = vi.fn<typeof fetch>().mockResolvedValue(response), progress = vi.fn();
    const pending = runTriviaBulkAction("approve", ["a", "b", "c", "d"], "anytime_blitz", request, progress);
    send(start); send(row(repeat)); await vi.waitFor(() => expect(progress).toHaveBeenCalledTimes(2));
    expect(request).toHaveBeenCalledTimes(1);
    send({ type: "complete", result: { ok: true, savedIds: [] } }); controller.close(); expect((await pending).repeats).toEqual([repeat]);
  });
  it("retains repeats and confirmed approvals after a lost final acknowledgement, then performs exactly one status recovery", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(stream([start, row({ id: "a", outcome: "approved" }), row(repeat)]))
      .mockResolvedValueOnce(json({ ok: true, items: [{ id: "a", status: "active" }, { id: "b", status: "pending_review" }, { id: "c", status: "active" }, { id: "d", status: "pending_review" }] }));
    expect(await runTriviaBulkAction("approve", ["a", "b", "c", "d"], "anytime_blitz", request)).toMatchObject({ ok: false, recovered: true, savedIds: ["a", "c"], repeats: [repeat], notProcessed: ["d"] });
    expect(request.mock.calls.map(([, options]) => JSON.parse(String(options?.body)).action)).toEqual(["approve", "status"]);
  });
  it("keeps a pause normal while reconciling a save committed before the deadline response", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(stream([start, row(repeat), { type: "complete", result: { ok: true, paused: true, code: "budget_exhausted", needsRecovery: true, savedIds: ["a"] } }]))
      .mockResolvedValueOnce(json({ ok: true, items: [{ id: "a", status: "active" }, { id: "c", status: "active" }, { id: "d", status: "pending_review" }] }));
    const result = await runTriviaBulkAction("approve", ["a", "b", "c", "d"], "anytime_blitz", request);
    expect(result).toMatchObject({ ok: true, paused: true, savedIds: ["a", "c"], repeats: [repeat], notProcessed: ["d"] }); expect(result.error).toBeUndefined(); expect(request).toHaveBeenCalledTimes(2);
  });
  it("keeps received decisions when recovery fails and marks continuation unconfirmed", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(stream([start, row({ id: "a", outcome: "approved" }), row(repeat)], 11, '{"type":'))
      .mockRejectedValueOnce(new Error("Network lost"));
    expect(await runTriviaBulkAction("approve", ["a", "b", "c", "d"], "anytime_blitz", request)).toMatchObject({ savedIds: ["a"], repeats: [repeat], unconfirmed: true }); expect(request).toHaveBeenCalledTimes(2);
  });
  it("does not recover unknown IDs or invent repeats from pending status", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(stream([start, row({ ...repeat, id: "outside" })]))
      .mockResolvedValueOnce(json({ ok: true, items: [{ id: "a", status: "pending_review" }, { id: "outside", status: "active" }] }));
    expect(await runTriviaBulkAction("approve", ["a"], "anytime_blitz", request)).toMatchObject({ savedIds: [], notProcessed: ["a"] });
  });
  it("rejects diagnostic results as approvals and rejects approval results as diagnostics", async () => {
    await expect(consumeTriviaReviewStream(stream([{ type: "start", mode: "diagnostic", version: 1, durationMs: 45_000 }]), "review", () => {})).rejects.toThrow("mode");
    await expect(consumeTriviaReviewStream(stream([{ type: "start", mode: "diagnostic", version: 1, durationMs: 45_000 }, { type: "complete", result: { ok: true, savedIds: ["a"] } }]), "diagnostic", () => {})).rejects.toThrow("result");
  });
  it("retains ordinary JSON for deletion and Live approval", async () => {
    for (const [action, pool] of [["delete", "anytime_blitz"], ["approve", "live_showdown"]] as const) {
      const request = vi.fn<typeof fetch>().mockResolvedValue(json({ ok: true, savedIds: ["a"] }));
      expect((await runTriviaBulkAction(action, ["a"], pool, request)).savedIds).toEqual(["a"]); expect(JSON.parse(String(request.mock.calls[0][1]?.body)).progressive).toBeUndefined();
    }
  });
});
