import { REVIEW_DIAGNOSTIC_MS, REVIEW_STREAM_TYPE } from "@/lib/triviaReviewTransport";
import type { TriviaReviewRecord } from "@/types/triviaReview";

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const row = (value: unknown): boolean => object(value) && typeof value.id === "string" && ["approved", "repeat", "unresolved"].includes(String(value.outcome))
  && (value.reason === undefined || typeof value.reason === "string") && (value.code === undefined || typeof value.code === "string")
  && (value.matches === undefined || Array.isArray(value.matches) && value.matches.length <= 3 && value.matches.every(match => object(match) && typeof match.id === "string" && typeof match.question === "string" && typeof match.answer === "string"));
const valid = (value: unknown): value is TriviaReviewRecord => {
  if (!object(value)) return false;
  switch (value.type) {
    case "start": return value.version === 1 && (value.mode === "review" ? count(value.total) && value.total <= 200 : value.mode === "diagnostic" && value.durationMs === REVIEW_DIAGNOSTIC_MS);
    case "heartbeat": return count(value.elapsedMs);
    case "checking": return typeof value.id === "string" && typeof value.question === "string";
    case "row": {
      const counts = value.counts;
      return row(value.result) && object(counts) && ["checked", "approved", "repeats", "unresolved", "remaining"].every(key => count(counts[key]));
    }
    case "complete": return object(value.result) && typeof value.result.ok === "boolean" && Array.isArray(value.result.savedIds) && value.result.savedIds.every(id => typeof id === "string");
    case "diagnostic_complete": return count(value.elapsedMs) && value.questionReads === 0 && value.questionWrites === 0 && value.providerCalls === 0;
    default: return false;
  }
};

// TextDecoder preserves Unicode split between packets; newlines frame records,
// independently of the network's arbitrary packet boundaries.
export const consumeTriviaReviewStream = async (
  response: Response,
  mode: "review" | "diagnostic",
  onRecord: (record: TriviaReviewRecord) => void,
): Promise<Extract<TriviaReviewRecord, { type: "complete" | "diagnostic_complete" }>> => {
  if (!response.ok || !response.headers.get("Content-Type")?.includes(REVIEW_STREAM_TYPE) || !response.body) throw new Error("Review stream unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "", started = false, bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      bytes += value?.byteLength ?? 0;
      if (bytes > 8_000_000) throw new Error("Review stream exceeds limit");
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.length > 4_000_000) throw new Error("Review record exceeds limit");
        const record: unknown = JSON.parse(line);
        if (!valid(record)) throw new Error("Invalid review record");
        if (record.type === "start") {
          if (started || record.mode !== mode) throw new Error("Unexpected review mode");
          started = true;
        } else if (!started) throw new Error("Missing review start");
        if (mode === "diagnostic" && ["checking", "row", "complete"].includes(record.type) || mode === "review" && record.type === "diagnostic_complete") throw new Error("Unexpected review result");
        onRecord(record);
        if (record.type === "complete" || record.type === "diagnostic_complete") return record;
      }
      if (buffer.length > 4_000_000) throw new Error("Review record exceeds limit");
      if (done) throw new Error("Review ended without acknowledgement");
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
};
