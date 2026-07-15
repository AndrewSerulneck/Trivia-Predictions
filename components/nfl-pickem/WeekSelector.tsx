"use client";

import { motion } from "framer-motion";

type WeekOption = {
  id: string;
  weekNumber: number;
  weekStartDate: string;
  weekEndDate: string;
  status: string;
  isLocked: boolean;
  isCurrent: boolean;
  gamesCount: number;
};

export function WeekSelector({
  weeks,
  selectedWeekId,
  onSelect,
}: {
  weeks: WeekOption[];
  selectedWeekId: string;
  onSelect: (weekId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-[#fde68a]/30 bg-slate-900 p-3">
      <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#fde68a]">
        Select Week
      </h3>
      
      <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:thin] [scrollbar-color:rgba(253,230,138,0.3)_transparent]">
        {weeks.map((week) => (
          <motion.button
            key={week.id}
            type="button"
            onClick={() => onSelect(week.id)}
            className={`shrink-0 rounded-lg border px-3 py-2.5 text-left transition-all ${
              selectedWeekId === week.id
                ? "border-[#fde68a] bg-[#fde68a]/20 shadow-lg shadow-[#fde68a]/10"
                : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
            }`}
            whileTap={{ scale: 0.95 }}
            whileHover={{ y: -2 }}
          >
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-black text-white">
                Week {week.weekNumber}
              </span>
              {week.isCurrent && (
                <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">
                  NOW
                </span>
              )}
            </div>
            
            <div className="mt-1 text-[10px] text-slate-400">
              {new Date(week.weekStartDate).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}{" "}
              -{" "}
              {new Date(week.weekEndDate).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </div>
            
            <div className="mt-2 flex items-center gap-2">
              {week.isLocked ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-rose-400">
                  <span>🔒</span> Locked
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                  <span>✓</span> Open
                </span>
              )}
              <span className="text-[9px] text-slate-500">
                {week.gamesCount} games
              </span>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
