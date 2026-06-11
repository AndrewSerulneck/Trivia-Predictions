"use client";

import { motion } from "framer-motion";
import type { GameplayAnimationProps } from "@/types/animation";

export function FantasyLiveCollectAnimation({ onComplete }: GameplayAnimationProps) {
  return (
    <motion.div
      className="fixed bottom-20 left-1/2 z-[1100] -translate-x-1/2"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: [0, 1, 1, 0], y: [20, 0, 0, -8] }}
      transition={{
        duration: 1.2,
        times: [0, 0.25, 0.75, 1],
        ease: "easeInOut",
      }}
      onAnimationComplete={onComplete}
    >
      <div className="flex items-center gap-2 rounded-full border border-[#6ee7b7]/60 bg-emerald-500/20 px-5 py-2.5">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          className="shrink-0"
        >
          <circle cx="12" cy="12" r="8" fill="#fde047" stroke="#a16207" strokeWidth="1.5" />
        </svg>
        <span className="text-sm font-black text-[#6ee7b7]">Points added!</span>
      </div>
    </motion.div>
  );
}