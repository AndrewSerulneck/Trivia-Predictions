import { consumeTriviaReviewStream } from "@/lib/triviaReviewParser";
import { REVIEW_STREAM_TYPE } from "@/lib/triviaReviewTransport";
import type { TriviaBulkResult, TriviaReviewRecord, TriviaReviewRow } from "@/types/triviaReview";
export type { TriviaBulkResult } from "@/types/triviaReview";

const sanitize = (payload: TriviaBulkResult, ids: string[]): TriviaBulkResult => {
  const savedIds = [...new Set((payload.savedIds ?? []).filter(id => ids.includes(id)))];
  const saved = new Set(savedIds);
  const repeats = payload.repeats?.filter(row => ids.includes(row.id) && !saved.has(row.id));
  const repeated = new Set(repeats?.map(row => row.id));
  const holds = payload.holds?.filter(row => ids.includes(row.id) && !saved.has(row.id) && !repeated.has(row.id));
  const examined = new Set([...savedIds, ...(repeats ?? []).map(row => row.id), ...(holds ?? []).map(row => row.id)]);
  return { ...payload, savedIds, repeats, holds, notProcessed: ids.filter(id => !examined.has(id)) };
};

// Every click sends exactly one approval/delete. An ambiguous save can trigger
// one selected-status read, never another approval or another checking budget.
export async function runTriviaBulkAction(
  action: "approve" | "delete", ids: string[], pool: string,
  request: typeof fetch = fetch,
  onProgress?: (record: TriviaReviewRecord) => void,
): Promise<TriviaBulkResult> {
  let payload: TriviaBulkResult | undefined;
  const received = new Map<string, TriviaReviewRow>();
  const progressive = action === "approve" && pool === "anytime_blitz";
  const receivedResult = (): TriviaBulkResult => ({ ok: false,
    savedIds: [...received.values()].filter(row => row.outcome === "approved").map(row => row.id),
    repeats: [...received.values()].filter(row => row.outcome === "repeat"),
    holds: [...received.values()].filter(row => row.outcome === "unresolved"),
  });
  try {
    const response = await request("/api/admin/trivia/questions", {
      method: "POST", headers: { "Content-Type": "application/json", ...(progressive ? { Accept: REVIEW_STREAM_TYPE } : {}) },
      body: JSON.stringify({ action, ids, pool, ...(progressive ? { progressive: true } : {}) }),
    });
    if (response.headers.get("Content-Type")?.includes(REVIEW_STREAM_TYPE)) {
      const final = await consumeTriviaReviewStream(response, "review", record => {
        if (record.type === "row") {
          if (!ids.includes(record.result.id) || received.has(record.result.id)) throw new Error("Unexpected question result");
          received.set(record.result.id, record.result);
        }
        if (record.type === "checking" && !ids.includes(record.id)) throw new Error("Unexpected question selection");
        onProgress?.(record);
      });
      if (final.type !== "complete") throw new Error("Missing approval acknowledgement");
      // Keep every confirmed delta even if a final message omits it.
      const prior = receivedResult();
      payload = { ...final.result, savedIds: [...prior.savedIds, ...final.result.savedIds], repeats: prior.repeats, holds: prior.holds };
    } else {
      payload = await response.json() as TriviaBulkResult;
    }
    if (!payload || typeof payload.ok !== "boolean") throw new Error("Invalid response");
    payload = sanitize(payload, ids);
    if (payload.needsRecovery !== true && response.ok && payload.ok) return payload;
    if (!payload.needsRecovery && !["budget_exhausted", "verification_unavailable", "write_failed"].includes(payload.code ?? "")) return { ...payload, ok: false };
  } catch {
    if (received.size) payload = receivedResult();
  }

  try {
    const response = await request("/api/admin/trivia/questions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", ids, pool }), signal: AbortSignal.timeout(12_000),
    });
    const status = await response.json() as { ok: boolean; items?: { id: string; status: string }[] };
    if (!response.ok || !status.ok || !Array.isArray(status.items)) throw new Error("Status unavailable");
    const result = sanitize({ ...payload, ok: payload?.paused === true, savedIds: [
      ...(payload?.savedIds ?? []),
      ...status.items.filter(row => ids.includes(row.id) && row.status === (action === "approve" ? "active" : "deleted")).map(row => row.id),
    ], recovered: true }, ids);
    if (!result.paused) result.error ??= "The connection stopped before the request finished. Saved changes were rechecked. Pending does not mean they are repeats. Refresh before continuing.";
    return result;
  } catch {
    return sanitize({ ...payload, ok: false, savedIds: payload?.savedIds ?? [], recovered: true, unconfirmed: true,
      error: "Saved changes could not be confirmed. Refresh Question Review before continuing. Do not assume the remaining questions are repeats." }, ids);
  }
}
