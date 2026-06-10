"use client";

import { useEffect } from "react";
import { motion, useAnimationControls } from "framer-motion";

// Answering-phase countdown: the progress bar and seconds readout shift
// emerald → amber → rose as time runs low, and the number gives a quick scale
// pop on every tick inside the final 5 seconds (plus a steady pulse at <= 3s)
// to build urgency.
export const LiveTriviaCountdownTimer = ({
  secondsRemaining,
  progressPct,
}: {
  secondsRemaining: number;
  progressPct: number;
}) => {
  const pulseControls = useAnimationControls();

  useEffect(() => {
    if (secondsRemaining <= 5) {
      void pulseControls.start({
        scale: [1, 1.18, 1],
        transition: { duration: 0.3, ease: "easeOut" },
      });
    }
  }, [secondsRemaining, pulseControls]);

  const barColor =
    secondsRemaining >= 8 ? "bg-emerald-400" : secondsRemaining >= 4 ? "bg-amber-400" : "bg-rose-500";
  const textColor =
    secondsRemaining >= 8 ? "text-emerald-200" : secondsRemaining >= 4 ? "text-amber-200" : "text-rose-300";

  return (
    <>
      <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full ${barColor} transition-all duration-700`} style={{ width: `${progressPct}%` }} />
      </div>
      <p className={`mt-1 text-2xl font-black ${textColor}${secondsRemaining <= 3 ? " animate-pulse" : ""}`}>
        <motion.span animate={pulseControls} className="inline-block">
          {secondsRemaining}s
        </motion.span>
      </p>
    </>
  );
};
