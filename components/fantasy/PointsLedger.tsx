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
    <div className="rounded-2xl border border-cyan-200/60 bg-white/30 p-4 shadow-lg backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">Live Points Ledger</h3>
          {gameLabel ? (
            <p className="mt-0.5 truncate text-xs text-slate-500">{gameLabel}</p>
          ) : null}
        </div>
        <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-cyan-200 bg-white/80 px-2 py-1">
          <span
            className={`inline-flex h-2 w-2 rounded-full ${
              isLive ? "animate-pulse bg-cyan-500" : "bg-slate-300"
            }`}
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-cyan-700">
            {isLive ? "Live" : "Waiting"}
          </span>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">{isLive ? "Waiting for scoring activity..." : "No Live Games"}</p>
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
                className="flex items-start justify-between gap-2 rounded-lg border border-white/50 bg-white/65 px-3 py-2 backdrop-blur-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-900">
                    {entry.playerName}
                    <span className="ml-1 font-normal text-slate-400">·</span>
                    <span className="ml-1 font-normal text-slate-500">{entry.teamName}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-600">{entry.actionLabel}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">{formatTime(entry.timestamp)}</p>
                </div>
                <span
                  className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                    entry.pointsDelta >= 0
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-rose-100 text-rose-800"
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
