import { getConfiguredAdminCredentials } from "@/lib/adminCredentials";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/adminSession";
import { consumeTriviaReviewStream } from "@/lib/triviaReviewParser";

// Phase 3: pass the independently verified own preview/live origin. This calls
// ONLY the fixed diagnostic, never an approval, status lookup or paid provider.
const main = async () => {
  const origin = new URL(process.argv[2] ?? "");
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/"
    || !(origin.protocol === "https:" && (["hightopchallenge.com", "play.hightopchallenge.com"].includes(origin.hostname) || origin.hostname.endsWith(".vercel.app"))
      || origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname))) throw new Error("Pass a verified preview/live origin.");
  const credential = getConfiguredAdminCredentials()[0];
  const token = credential && createAdminSessionToken(credential.username, 120);
  if (!token) throw new Error("Admin authentication unavailable.");
  const started = Date.now();
  const response = await fetch(new URL("/api/admin/trivia/review-diagnostic", origin), {
    method: "POST", redirect: "error", headers: { "Content-Type": "application/json", Cookie: `${ADMIN_SESSION_COOKIE}=${token}` },
    body: "{}", signal: AbortSignal.timeout(65_000),
  });
  let bytes = 0, firstRecordMs: number | undefined, heartbeats = 0, heartbeatBeyond30 = false;
  let previousRecordMs = 0, maxGapMs = 0;
  const measured = new Response(response.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) { bytes += chunk.byteLength; controller.enqueue(chunk); } })), { status: response.status, headers: response.headers });
  const final = await consumeTriviaReviewStream(measured, "diagnostic", record => {
    const receivedMs = Date.now() - started;
    firstRecordMs ??= receivedMs;
    maxGapMs = Math.max(maxGapMs, receivedMs - previousRecordMs);
    previousRecordMs = receivedMs;
    if (record.type === "heartbeat") { heartbeats++; heartbeatBeyond30 ||= receivedMs > 30_000; }
    console.log(JSON.stringify({ type: record.type, receivedMs }));
  });
  if (final.type !== "diagnostic_complete" || firstRecordMs === undefined || firstRecordMs > 5_000 || maxGapMs > 10_000 || !heartbeatBeyond30 || Date.now() - started < 40_000 || !response.headers.get("Cache-Control")?.includes("no-store")) throw new Error("Transport gate did not pass.");
  console.log(JSON.stringify({ origin: origin.origin, status: response.status, firstRecordMs, maxGapMs, heartbeats, heartbeatBeyond30, elapsedMs: Date.now() - started, bytes, final }));
};
void main().catch(() => { console.error("Transport diagnostic failed. No approval or paid check was requested."); process.exitCode = 1; });
