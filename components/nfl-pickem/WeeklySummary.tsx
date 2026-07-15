"use client";

import { motion } from "framer-motion";

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
  const accuracy = summary.picksCount > 0
    ? Math.round((summary.correctPicks / summary.picksCount) * 100)
    : 0;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-[#fde68a]/30 bg-[#020617]/80 p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-black text-[#fde68a]">
          Week {weekNumber} Summary
        </h3>
        {isComplete && (
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
            Complete
          </span>
        )}
      </div>
      
      <div className="mt-3 grid grid-cols-4 gap-2">
        <div className="rounded-lg bg-white/5 p-2 text-center">
          <div className="text-[18px] font-black text-white">
            {summary.picksCount}
          </div>
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
            Picks
          </div>
        </div>
        
        <div className="rounded-lg bg-emerald-500/10 p-2 text-center">
          <div className="text-[18px] font-black text-emerald-400">
            {summary.correctPicks}
          </div>
          <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-500/70">
            Correct
          </div>
        </div>
        
        <div className="rounded-lg bg-rose-500/10 p-2 text-center">
          <div className="text-[18px] font-black text-rose-400">
            {summary.incorrectPicks}
          </div>
          <div className="text-[9px] font-bold uppercase tracking-wider text-rose-500/70">
            Wrong
          </div>
        </div>
        
        <div className="rounded-lg bg-[#fde68a]/10 p-2 text-center">
          <div className="text-[18px] font-black text-[#fde68a]">
            {summary.totalPoints}
          </div>
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#fde68a]/70">
            Points
          </div>
        </div>
      </div>
      
      {summary.picksCount > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>Accuracy</span>
            <span className="font-bold text-white">{accuracy}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${accuracy}%` }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className={`h-full rounded-full ${
                accuracy >= 70 ? "bg-emerald-400" :
                accuracy >= 40 ? "bg-[#fde68a]" :
                "bg-rose-400"
              }`}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}
