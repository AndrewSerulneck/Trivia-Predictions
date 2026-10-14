import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { REVIEW_DIAGNOSTIC_MS, REVIEW_NO_CACHE, triviaReviewStream } from "@/lib/triviaReviewTransport";

export const maxDuration = 60;

// Fixed, manual transport probe. No IDs, bank reads/writes or provider calls.
export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status, headers: REVIEW_NO_CACHE });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 0) {
    return NextResponse.json({ ok: false, error: "Send an empty diagnostic request." }, { status: 400, headers: REVIEW_NO_CACHE });
  }
  return triviaReviewStream(request.signal, { type: "start", version: 1, mode: "diagnostic", durationMs: REVIEW_DIAGNOSTIC_MS }, async (emit, signal) => {
    const started = Date.now();
    await new Promise<void>(resolve => {
      const cancel = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => { signal.removeEventListener("abort", cancel); resolve(); }, REVIEW_DIAGNOSTIC_MS);
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) cancel();
    });
    if (!signal.aborted) emit({ type: "diagnostic_complete", elapsedMs: Date.now() - started, questionReads: 0, questionWrites: 0, providerCalls: 0 });
  });
}
