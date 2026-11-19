import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { LiveConversionState, LiveConversionStatusMap } from "@/types/liveConversions";

// Speed -> Live conversions (docs/speed-trivia-backlog-and-quality-plan.md Phase 4e, D37). Each call is one bounded
// RPC (supabase/migrations/20261119134654_live_conversion_requests.sql). Nothing here reads or writes question text.

export const LIVE_CONVERSION_STATUS_LIMIT = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class LiveConversionError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
  }
}

export const isConversionId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

const REFUSALS: Record<string, [string, string]> = {
  "conversion-in-review": ["in_review", "Already in Live review."],
  "conversion-already-live": ["already_live", "Already in Live."],
  "conversion-not-active": ["not_active", "Only live or kept questions."],
  "conversion-not-speed": ["not_speed", "Speed questions only."],
};

const call = async <T,>(name: string, args: Record<string, unknown>): Promise<T> => {
  if (!supabaseAdmin) throw new LiveConversionError("unavailable", "Unavailable.", 503);
  const { data, error } = await supabaseAdmin.rpc(name, args);
  if (error) {
    const refusal = Object.entries(REFUSALS).find(([key]) => (error.message ?? "").includes(key));
    if (refusal) throw new LiveConversionError(refusal[1][0], refusal[1][1], 409);
    throw new LiveConversionError("unavailable", "Couldn't save. Try again.", 503);
  }
  return data as T;
};

/** Queue one Speed question. `already`: it was queued or being converted. */
export const queueLiveConversion = (questionId: string) =>
  call<{ id: string; status: "queued" | "sent"; already: boolean }>("live_conversion_queue", { p_question_id: questionId });

/** Cancel a queued request. False when there was none (already sent, or never queued). */
export const cancelLiveConversion = async (questionId: string) =>
  (await call<{ cancelled: boolean }>("live_conversion_cancel", { p_question_id: questionId })).cancelled === true;

type StatusRow = { questionId: string; status: string; reason: string | null; liveStatus: string | null };

/** The list label for one request (the newest that isn't cancelled) and its Live candidate's status. */
export const conversionState = (row: Omit<StatusRow, "questionId">): LiveConversionState => {
  switch (row.status) {
    case "queued": return { state: "queued" };
    case "sent": return { state: "converting" };
    case "declined":
    case "failed": return { state: "not_convertible", reason: row.reason ?? "" };
    case "done":
      if (row.liveStatus === "published") return { state: "in_live" };
      if (row.liveStatus === "keep" || row.liveStatus === "publishing" || row.liveStatus === "pr_open") return { state: "kept" };
      if (row.liveStatus === "pending_review") return { state: "in_review" };
      return { state: "none" };
    default: return { state: "none" };
  }
};

/** Labels for ≤ 100 Speed ids (one read). Ids without a request are left out. */
export const readLiveConversionStatus = async (ids: string[]): Promise<LiveConversionStatusMap> => {
  if (ids.length > LIVE_CONVERSION_STATUS_LIMIT || !ids.every(isConversionId)) throw new LiveConversionError("invalid", "Invalid request.");
  if (!ids.length) return {};
  const rows = await call<StatusRow[]>("live_conversion_status", { p_ids: ids });
  const out: LiveConversionStatusMap = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const state = conversionState(row);
    if (state.state !== "none") out[row.questionId] = state;
  }
  return out;
};
