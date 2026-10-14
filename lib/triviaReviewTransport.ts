import type { TriviaReviewRecord } from "@/types/triviaReview";

export const REVIEW_HEARTBEAT_MS = 5_000;
export const REVIEW_DIAGNOSTIC_MS = 45_000;
export const REVIEW_STREAM_TYPE = "application/x-ndjson";
export const REVIEW_NO_CACHE = { "Cache-Control": "no-store, no-transform" };

// Emit the start synchronously, before starting even the selected-row read.
// One request owns the work; cancellation prevents new checks and clears timers.
export const triviaReviewStream = (
  requestSignal: AbortSignal,
  first: Extract<TriviaReviewRecord, { type: "start" }>,
  work: (emit: (record: TriviaReviewRecord) => void, signal: AbortSignal) => Promise<void>,
): Response => {
  const cancellation = new AbortController();
  const encoder = new TextEncoder();
  const started = Date.now();
  let stop = () => {};
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        requestSignal.removeEventListener("abort", stop);
        if (!cancelled) controller.close();
      };
      stop = () => { cancellation.abort(); close(); };
      const emit = (record: TriviaReviewRecord) => {
        if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(record)}\n`));
      };
      emit(first);
      requestSignal.addEventListener("abort", stop, { once: true });
      if (requestSignal.aborted) { stop(); return; }
      heartbeat = setInterval(() => emit({ type: "heartbeat", elapsedMs: Date.now() - started }), REVIEW_HEARTBEAT_MS);
      void Promise.resolve().then(() => work(emit, cancellation.signal)).then(close, error => {
        if (!closed) {
          clearInterval(heartbeat);
          requestSignal.removeEventListener("abort", stop);
          closed = true;
          controller.error(error);
        }
      });
    },
    cancel() { cancelled = true; stop(); },
  });
  return new Response(stream, { headers: {
    ...REVIEW_NO_CACHE,
    "Content-Type": `${REVIEW_STREAM_TYPE}; charset=utf-8`,
    "X-Accel-Buffering": "no",
  } });
};
