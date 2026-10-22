"use client";

import { motion, useReducedMotion } from "framer-motion";

export function WeeklySummary({
  summary,
  weekNumber,
  isComplete,
}: {
  summary: {
    picksCount: number;
    correctPicks: number;
    incorrectPicks: number;
    totalPoints: number;
  };
  weekNumber: number;
  isComplete: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const accuracy = summary.picksCount > 0
    ? Math.round((summary.correctPicks / summary.picksCount) * 100)
    : 0;

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-ht-pickem-card-edge bg-ht-summary-bg p-4 shadow-ht-panel" transition={reducedMotion ? { duration: 0 } : undefined}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-footnote font-black text-ht-pickem-accent">
          Week {weekNumber} Summary
        </h3>
        {isComplete && (
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-caption font-bold text-ht-gain-fg">
            Complete
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        <div className="rounded-lg bg-ht-overlay/5 p-2 text-center">
          <div className="text-[18px] font-black text-ht-fg-bright">
            {summary.picksCount}
          </div>
          <div className="text-caption font-bold uppercase tracking-wider text-ht-fg-muted">
            Picks
          </div>
        </div>

        <div className="rounded-lg bg-emerald-500/10 p-2 text-center">
          <div className="text-[18px] font-black text-ht-gain-fg">
            {summary.correctPicks}
          </div>
          <div className="text-caption font-bold uppercase tracking-wider text-ht-success-label">
            Correct
          </div>
        </div>

        <div className="rounded-lg bg-rose-500/10 p-2 text-center">
          <div className="text-[18px] font-black text-ht-loss-fg">
            {summary.incorrectPicks}
          </div>
          <div className="text-caption font-bold uppercase tracking-wider text-ht-danger-label">
            Wrong
          </div>
        </div>

        <div className="rounded-lg bg-ht-pickem-accent/10 p-2 text-center">
          <div className="text-[18px] font-black text-ht-pickem-accent">
            {summary.totalPoints}
          </div>
          <div className="text-caption font-bold uppercase tracking-wider text-ht-pickem-label">
            Points
          </div>
        </div>
      </div>

      {summary.picksCount > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-caption text-ht-fg-muted">
            <span>Accuracy</span>
            <span className="font-bold text-ht-fg-bright">{accuracy}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ht-overlay/10">
            <motion.div
              initial={reducedMotion ? false : { width: 0 }}
              animate={{ width: `${accuracy}%` }}
              transition={reducedMotion ? { duration: 0 } : { duration: 0.5, delay: 0.2 }}
              className={`h-full rounded-full ${
                accuracy >= 70 ? "bg-emerald-400" :
                accuracy >= 40 ? "bg-ht-pickem-accent" :
                "bg-rose-400"
              }`}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}
