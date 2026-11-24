// TV state API baseline (docs/fire-tv-app-plan.md Phase 9 step 2; Phase 15 compares against it).
// Vercel can't break usage down by route on this team's plan (no Observability Plus), so each server instance counts
// its own /api/venue-screen/state requests and logs ONE summary line at most every 10 minutes:
//   [tv-state] minutes=10 requests=31 idle=30 live-trivia-pregame=1 avgMs=84 maxMs=412 avgBytes=1830 maxBytes=6120
// It counts requests that reach the function: responses served from the CDN cache (idle `s-maxage=15`) are not
// counted, so it measures origin work (function time and DB reads), not bandwidth. No venue ids or payloads are logged.
// Limit (CR1.4, F19): an instance's last partial window is never logged, so compare rates (requests ÷ minutes), not
// totals; see docs/fire-tv-app-plan.md Phase 15 step 1.

const FLUSH_MS = 10 * 60 * 1000;

type CountWindow = { requests: number; byMode: Map<string, number>; totalMs: number; maxMs: number; totalBytes: number; maxBytes: number };

const emptyWindow = (): CountWindow => ({ requests: 0, byMode: new Map(), totalMs: 0, maxMs: 0, totalBytes: 0, maxBytes: 0 });

let current = emptyWindow();
let windowStartMs = Date.now();

export const countVenueScreenStateRequest = (
  entry: { mode: string; durationMs: number; bytes: number },
  nowMs: number = Date.now(),
): void => {
  current.requests += 1;
  current.byMode.set(entry.mode, (current.byMode.get(entry.mode) ?? 0) + 1);
  current.totalMs += entry.durationMs;
  current.maxMs = Math.max(current.maxMs, entry.durationMs);
  current.totalBytes += entry.bytes;
  current.maxBytes = Math.max(current.maxBytes, entry.bytes);
  if (nowMs - windowStartMs < FLUSH_MS) return;
  const modes = [...current.byMode.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mode, count]) => `${mode}=${count}`)
    .join(" ");
  console.info(
    `[tv-state] minutes=${Math.round((nowMs - windowStartMs) / 60_000)} requests=${current.requests} ${modes} ` +
      `avgMs=${Math.round(current.totalMs / current.requests)} maxMs=${Math.round(current.maxMs)} ` +
      `avgBytes=${Math.round(current.totalBytes / current.requests)} maxBytes=${current.maxBytes}`,
  );
  current = emptyWindow();
  windowStartMs = nowMs;
};

/** Test hook. */
export const resetVenueScreenUsageCounter = (nowMs: number = Date.now()): void => {
  current = emptyWindow();
  windowStartMs = nowMs;
};
