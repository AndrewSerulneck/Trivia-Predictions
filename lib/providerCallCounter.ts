// Provider-call baseline (docs/cancelled-prizes-pick-windows-away-mode-plan.md Phase B2, Phase 0 F6).
// Vercel can't count outbound calls on this team's plan (Observability Plus), so each server instance
// counts its own BallDontLie requests and logs ONE summary line at most every 10 minutes:
//   [provider-calls] minutes=10 bdl/ncaaf/v1/games=12 bdl/ncaaf/v1/odds=3
// It counts fetch() calls, so a reply served from Next's data cache is counted too: an upper bound.
// No query strings, ids or payloads are logged. Cost: ≤ 6 log lines per instance per hour.

const FLUSH_MS = 10 * 60 * 1000;

const counts = new Map<string, number>();
let windowStartMs = Date.now();

/** "/mma/v1/fighters/123" → "/mma/v1/fighters/:id" (no ids in logs, and one key per feed). */
const feedOf = (path: string): string =>
  path
    .split("?")[0]
    .split("/")
    .map((part) => (/^\d+$/.test(part) ? ":id" : part))
    .join("/");

export const countProviderCall = (provider: string, path: string, nowMs: number = Date.now()): void => {
  const key = `${provider}${feedOf(path)}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
  if (nowMs - windowStartMs < FLUSH_MS) return;
  const summary = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([feed, count]) => `${feed}=${count}`)
    .join(" ");
  console.info(`[provider-calls] minutes=${Math.round((nowMs - windowStartMs) / 60_000)} ${summary}`);
  counts.clear();
  windowStartMs = nowMs;
};

/** Test hook. */
export const resetProviderCallCounter = (nowMs: number = Date.now()): void => {
  counts.clear();
  windowStartMs = nowMs;
};
