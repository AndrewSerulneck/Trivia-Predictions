"use client";

import { useDelayedFlag } from "@/lib/hooks/useDelayedFlag";

const BORDER_CARD = "border-emerald-400/30";
const BORDER_ACTIVE = "border-emerald-400/60";
const TEXT_ACCENT = "text-emerald-300";
const TEXT_LABEL = "text-emerald-300 tracking-[0.14em] uppercase font-black text-xs";

/**
 * How long the countdown may sit at 00:00 before we admit to loading. The
 * round-boundary kick (lib/categoryBlitzRealtime.ts) now fetches the next round
 * the moment the countdown expires, so the normal wait is one round-trip —
 * short enough that a loading message would flash and vanish. Holding the
 * zeroed countdown instead is both stiller and more honest: the timer really
 * did reach zero, and the board is moments away. Past this, the wait is real
 * (a failed kick falling back to its retry ladder) and worth naming.
 */
const LOADING_GRACE_MS = 600;

const formatMmSs = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

interface IntermissionStatusProps {
  nextRoundStartsIn: number | null;
  compact?: boolean;
}

/** "Next round starts in" status card — shown both inside the reveal journey's
 *  push-down beat (RevealSequence) and on the resting results intermission
 *  (ResultsScreen), so it lives in its own file rather than either. */
const IntermissionStatus = ({ nextRoundStartsIn, compact = false }: IntermissionStatusProps) => {
  const expired = nextRoundStartsIn != null && nextRoundStartsIn <= 0;
  const showLoading = useDelayedFlag(expired, LOADING_GRACE_MS);

  if (nextRoundStartsIn == null) {
    return (
      <div className={`rounded-2xl border ${BORDER_CARD} bg-slate-900/60 ${compact ? "px-3 py-2" : "p-4"} text-center`}>
        <p className={TEXT_LABEL}>Status</p>
        <p className={`mt-2 font-black text-white ${compact ? "text-sm" : "text-lg"}`}>Waiting for next round</p>
      </div>
    );
  }

  if (showLoading) {
    return (
      <div className={`rounded-2xl border-2 ${BORDER_ACTIVE} bg-emerald-500/10 ${compact ? "px-3 py-2" : "p-4"} text-center`}>
        <p
          className={`animate-pulse font-black ${TEXT_ACCENT} ${compact ? "text-base" : "text-2xl"}`}
        >
          Loading categories…
        </p>
      </div>
    );
  }

  const isUrgent = nextRoundStartsIn <= 10;

  return (
    <div className={`rounded-2xl border-2 ${BORDER_ACTIVE} bg-emerald-500/10 ${compact ? "px-3 py-2" : "p-4"} text-center`}>
      <p className={TEXT_LABEL}>Next round starts in</p>
      <p
        className={`mt-1 font-black tabular-nums ${compact ? "text-xl" : "text-4xl"} ${
          isUrgent ? "tp-countdown-urgent" : TEXT_ACCENT
        }`}
      >
        {formatMmSs(nextRoundStartsIn)}
      </p>
    </div>
  );
};

export default IntermissionStatus;
