export type TriviaBulkResult = {
  ok: boolean;
  savedIds: string[];
  repeats?: { id: string }[];
  holds?: { id: string }[];
  notProcessed?: string[];
  error?: string;
  code?: string;
  recovered?: boolean;
  unconfirmed?: boolean;
};

// A failed response says nothing about writes already committed. Reconcile only
// these IDs, without resubmitting approval or granting a second checking budget.
export async function runTriviaBulkAction(
  action: "approve" | "delete", ids: string[], pool: string,
  request: typeof fetch = fetch,
): Promise<TriviaBulkResult> {
  let payload: TriviaBulkResult | undefined;
  try {
    const response = await request("/api/admin/trivia/questions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ids, pool }),
    });
    payload = await response.json();
    if (!payload || typeof payload.ok !== "boolean") throw new Error("Invalid response");
    payload.savedIds = (payload.savedIds ?? []).filter(id => ids.includes(id));
    if (response.ok && payload.ok) return payload;
    payload.ok = false;
    if (!["budget_exhausted", "verification_unavailable", "write_failed"].includes(payload.code ?? "")) return payload;
  } catch {
    // HTML timeout pages and network failures both need the same read-only check.
  }

  try {
    const response = await request("/api/admin/trivia/questions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", ids, pool }),
      signal: AbortSignal.timeout(12_000),
    });
    const status = await response.json() as { ok: boolean; items?: { id: string; status: string }[] };
    if (!response.ok || !status.ok || !Array.isArray(status.items)) throw new Error("Status unavailable");
    const savedIds = [...new Set([
      ...(payload?.savedIds ?? []),
      ...status.items.filter(row => ids.includes(row.id) && row.status === (action === "approve" ? "active" : "deleted")).map(row => row.id),
    ])];
    const examined = new Set([...savedIds, ...(payload?.repeats ?? []).map(row => row.id), ...(payload?.holds ?? []).map(row => row.id)]);
    return {
      ...payload, ok: false, savedIds, recovered: true,
      notProcessed: ids.filter(id => !examined.has(id)),
      error: payload?.error ?? "The connection stopped before the request finished. Saved changes were rechecked. Remaining questions may be unchecked; being pending does not mean they are repeats. Try a smaller selection next.",
    };
  } catch {
    return {
      ...payload, ok: false, savedIds: payload?.savedIds ?? [], recovered: true, unconfirmed: true,
      error: "The connection stopped and saved changes could not be confirmed. Refresh Question Review before continuing. Do not assume the remaining questions are repeats.",
    };
  }
}
