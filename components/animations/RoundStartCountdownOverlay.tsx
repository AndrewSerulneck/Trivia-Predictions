"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { CSSProperties } from "react";

const STYLE_BLOCK = `
@keyframes rsco-particle-drift {
  0%   { transform: translateY(0) scale(0.6); opacity: 0; }
  20%  { opacity: 0.9; }
  80%  { opacity: 0.7; }
  100% { transform: translateY(-120px) scale(1); opacity: 0; }
}
.rsco-particle {
  animation-name: rsco-particle-drift;
  animation-timing-function: ease-out;
  animation-iteration-count: infinite;
  animation-fill-mode: both;
  animation-duration: var(--rsco-duration, 2000ms);
  animation-delay: var(--rsco-delay, 0ms);
}
`;

const PARTICLES = [
  { leftClass: "left-[18%]", bottomClass: "bottom-[30%]", sizeClass: "h-1.5 w-1.5", delayMs: 300, durationMs: 1900 },
  { leftClass: "left-[38%]", bottomClass: "bottom-[22%]", sizeClass: "h-1 w-1", delayMs: 700, durationMs: 2100 },
  { leftClass: "left-[55%]", bottomClass: "bottom-[34%]", sizeClass: "h-2 w-2", delayMs: 500, durationMs: 2200 },
  { leftClass: "left-[72%]", bottomClass: "bottom-[26%]", sizeClass: "h-1 w-1", delayMs: 1000, durationMs: 1800 },
  { leftClass: "left-[85%]", bottomClass: "bottom-[32%]", sizeClass: "h-1.5 w-1.5", delayMs: 1300, durationMs: 2000 },
];

interface RoundStartCountdownOverlayProps {
  categoryName: string | null | undefined;
  roundNumber: number | null | undefined;
  secondsRemaining: number;
  isVisible: boolean;
}

export function RoundStartCountdownOverlay({
  categoryName,
  roundNumber,
  secondsRemaining,
  isVisible,
}: RoundStartCountdownOverlayProps) {
  const eyebrow = roundNumber ? `ROUND ${roundNumber}` : "NEXT ROUND";
  const category = categoryName ?? "Coming Up Next";
  const countdown = Math.max(0, secondsRemaining);

  return (
    <AnimatePresence>
      {isVisible ? (
        <motion.div
          key="round-start-countdown"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-[1400] flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#1a0533] to-[#3b0764]"
        >
          <style>{STYLE_BLOCK}</style>

          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {PARTICLES.map((p, i) => (
              <div
                key={i}
                className={["rsco-particle absolute rounded-full bg-white/80", p.leftClass, p.bottomClass, p.sizeClass].join(" ")}
                style={
                  {
                    "--rsco-duration": `${p.durationMs}ms`,
                    "--rsco-delay": `${p.delayMs}ms`,
                  } as CSSProperties
                }
              />
            ))}
          </div>

          <p className="text-sm font-bold uppercase tracking-widest text-purple-300">{eyebrow}</p>

          <h1 className="mt-3 px-6 text-center text-4xl font-black uppercase tracking-tight text-white md:text-6xl">
            {category}
          </h1>

          <motion.p
            key={countdown}
            initial={{ scale: 1.25, opacity: 0.7 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="mt-8 text-8xl font-black tabular-nums text-purple-200 md:text-9xl"
          >
            {countdown <= 0 ? "GO!" : countdown}
          </motion.p>

          <p className="mt-4 text-sm font-semibold uppercase tracking-widest text-purple-400">
            Round starts in...
          </p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
