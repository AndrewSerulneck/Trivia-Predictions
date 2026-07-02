import type { VenueScreenDebugMode } from "@/lib/venueScreenTiming";

type VenueScreenStatusProps = {
  updatedAt: number;
  nowMs: number;
  error: string | null;
  failureCount: number;
  isRefreshing: boolean;
  debugMode?: VenueScreenDebugMode | null;
};

export function formatVenueScreenHeartbeat(updatedAt: number, nowMs: number): string {
  if (!Number.isFinite(updatedAt) || !Number.isFinite(nowMs)) return "Updated recently";
  const ageSeconds = Math.max(0, Math.floor((nowMs - updatedAt) / 1_000));
  if (ageSeconds < 5) return "Updated just now";
  if (ageSeconds < 60) return `Updated ${ageSeconds}s ago`;
  const ageMinutes = Math.floor(ageSeconds / 60);
  if (ageMinutes < 60) return `Updated ${ageMinutes}m ago`;
  return `Updated ${Math.floor(ageMinutes / 60)}h ago`;
}

export function VenueScreenStatus({
  updatedAt,
  nowMs,
  error,
  failureCount,
  isRefreshing,
  debugMode,
}: VenueScreenStatusProps) {
  const isReconnecting = Boolean(error);
  const label = isReconnecting ? "Reconnecting" : isRefreshing ? "Refreshing" : "Live";
  const statusClass = isReconnecting
    ? "border-amber-300/30 bg-amber-400/10 text-amber-100"
    : "border-white/10 bg-white/[0.06] text-white/72";

  return (
    <aside
      className={`fixed bottom-5 left-5 z-30 flex max-w-[min(42rem,calc(100vw-2.5rem))] flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-3 text-lg font-black ${statusClass}`}
      aria-live="polite"
    >
      <span className="uppercase tracking-[0.14em]">{label}</span>
      <span className="font-mono text-base font-bold tabular-nums">
        {formatVenueScreenHeartbeat(updatedAt, nowMs)}
      </span>
      {isReconnecting ? (
        <span className="text-base font-bold text-amber-100/82">
          Retry {Math.max(1, failureCount)}
        </span>
      ) : null}
      {debugMode ? (
        <span className="rounded-md border border-cyan-200/20 bg-cyan-300/10 px-2 py-1 text-sm uppercase tracking-[0.12em] text-cyan-100">
          Debug: {debugMode.replace("-", " ")}
        </span>
      ) : null}
    </aside>
  );
}
