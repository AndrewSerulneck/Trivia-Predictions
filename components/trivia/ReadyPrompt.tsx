"use client";

import { AnimatePresence, motion } from "framer-motion";

interface ReadyPromptProps {
  type: "game_start" | "round_start";
  roundNumber?: number;
  category?: string | null;
  secondsRemaining: number;
  isVisible: boolean;
}

export function ReadyPrompt({ type, roundNumber, category, secondsRemaining, isVisible }: ReadyPromptProps) {
  const isLateRound = roundNumber !== undefined && roundNumber >= 6;

  const gradientClass =
    type === "game_start"
      ? "from-red-500 via-orange-400 to-yellow-300"
      : isLateRound
      ? "from-rose-500 via-red-400 to-orange-300"
      : "from-indigo-500 via-purple-400 to-cyan-300";

  const headline =
    type === "game_start" ? "GET READY!" : roundNumber ? `ROUND ${roundNumber}` : "NEXT ROUND";

  const subtext =
    type === "game_start" ? "Game is about to begin!" : "is about to begin!";

  return (
    <AnimatePresence>
      {isVisible ? (
        <motion.div
          key="ready-prompt"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[1400] flex flex-col items-center justify-center bg-slate-950/95 p-6 text-center backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.85, y: 24 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 22 }}
            className="flex flex-col items-center"
          >
            <p
              className={`bg-gradient-to-r ${gradientClass} bg-clip-text text-5xl font-black tracking-tight text-transparent sm:text-7xl lg:text-8xl`}
            >
              {headline}
            </p>
            <p className="mt-1 text-xl font-bold text-slate-300 sm:text-2xl">{subtext}</p>
            {type === "round_start" && category ? (
              <p className="mt-2 rounded-xl border border-amber-400/50 bg-amber-950/40 px-4 py-2 text-base font-semibold text-amber-200 sm:text-lg">
                Category: {category}
              </p>
            ) : null}
            <motion.p
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 0.65, repeat: Infinity, ease: "easeInOut" }}
              className={`mt-5 bg-gradient-to-r ${gradientClass} bg-clip-text font-black text-transparent ${secondsRemaining <= 0 ? "text-3xl" : "text-9xl tabular-nums"}`}
            >
              {secondsRemaining <= 0 ? "Game Loading..." : Math.max(0, secondsRemaining)}
            </motion.p>
            <p className="mt-3 text-lg font-semibold text-slate-400 sm:text-xl">Are you ready?</p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
