const BORDER_CARD = "border-emerald-400/30";
const BORDER_ACTIVE = "border-emerald-400/60";
const TEXT_ACCENT = "text-emerald-300";
const TEXT_LABEL = "text-emerald-300 tracking-[0.14em] uppercase font-black text-xs";

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
  if (nextRoundStartsIn == null) {
    return (
      <div className={`rounded-2xl border ${BORDER_CARD} bg-slate-900/60 ${compact ? "px-3 py-2" : "p-4"} text-center`}>
        <p className={TEXT_LABEL}>Status</p>
        <p className={`mt-2 font-black text-white ${compact ? "text-sm" : "text-lg"}`}>Waiting for next round</p>
      </div>
    );
  }

  if (nextRoundStartsIn <= 0) {
    return (
      <div className={`rounded-2xl border-2 ${BORDER_ACTIVE} bg-emerald-500/10 ${compact ? "px-3 py-2" : "p-4"} text-center`}>
        <p className={TEXT_LABEL}>Next round starts in</p>
        <p
          className={`mt-1 animate-pulse font-black ${TEXT_ACCENT} ${compact ? "text-base" : "text-2xl"}`}
        >
          Loading categories…
        </p>
        {!compact ? <p className="mt-2 text-xs text-emerald-100/70">Results stay visible until the next letter drops.</p> : null}
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
      {!compact ? <p className="mt-2 text-xs text-emerald-100/70">Results stay visible until the next letter drops.</p> : null}
    </div>
  );
};

export default IntermissionStatus;
