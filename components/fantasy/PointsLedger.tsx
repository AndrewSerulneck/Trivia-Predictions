"use client";

import { AnimatePresence, motion } from "framer-motion";

export type LedgerEntry = {
  id: string;
  playerName: string;
  teamName: string;
  actionLabel: string;
  pointsDelta: number;
  timestamp: number;
};

function formatDelta(delta: number): string {
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)} pts`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function PointsLedger({
  entries,
  gameLabel,
  isLive = false,
}: {
  entries: LedgerEntry[];
  gameLabel?: string;
  isLive?: boolean;
}) {
  const visible = entries.slice(0, 5);

  return (
    <div className="rounded-ht-2xl border border-ht-cyan-600/40 bg-ht-elevated p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ht-fg-primary">Live Points Ledger</h3>
          {gameLabel ? (
            <p className="mt-0.5 truncate text-xs text-ht-fg-muted">{gameLabel}</p>
          ) : null}
        </div>
        <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-ht-cyan-600/40 bg-ht-elevated-2 px-2 py-1">
          <span
            className={`inline-flex h-2 w-2 rounded-full ${
              isLive ? "animate-pulse bg-cyan-500" : "bg-ht-border-soft"
            }`}
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ht-cyan-400">
            {isLive ? "Live" : "Waiting"}
          </span>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="mt-3 text-xs text-ht-fg-muted">{isLive ? "Waiting for scoring activity..." : "No Live Games"}</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((entry) => (
              <motion.li
                key={entry.id}
                layout
                initial={{ y: -18, opacity: 0, scale: 0.95 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 30,
                  mass: 0.7,
                }}
                className="flex items-start justify-between gap-2 rounded-ht-lg border border-ht-border-hairline bg-ht-surface px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-ht-fg-primary">
                    {entry.playerName}
                    <span className="ml-1 font-normal text-ht-fg-muted">·</span>
                    <span className="ml-1 font-normal text-ht-fg-muted">{entry.teamName}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-ht-fg-muted">{entry.actionLabel}</p>
                  <p className="mt-0.5 text-[10px] text-ht-fg-muted">{formatTime(entry.timestamp)}</p>
                </div>
                <span
                  className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                    entry.pointsDelta >= 0
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-rose-500/15 text-rose-400"
                  }`}
                >
                  {formatDelta(entry.pointsDelta)}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
