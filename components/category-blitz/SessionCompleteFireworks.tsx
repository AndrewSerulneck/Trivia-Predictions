"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";

interface SessionCompleteFireworksProps {
  finalStandings: { username: string; points: number }[];
}

// Deterministic confetti (no Math.random -> no hydration drift): 14 shapes fanned
// out on a circle with varied distance/size/color/rotation.
const PALETTE = ["#10b981", "#22c55e", "#ffffff", "#fbbf24"]; // emerald x2, white, gold
const CONFETTI = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2 + (i % 2) * 0.4;
  const dist = 120 + (i % 4) * 40;
  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    color: PALETTE[i % PALETTE.length],
    size: 6 + (i % 3) * 3,
    rotate: (i % 2 === 0 ? 1 : -1) * (180 + (i % 5) * 60),
    round: i % 3 === 0,
    delay: (i % 5) * 0.04,
  };
});

const podium: Variants = {
  hidden: {},
  show: { transition: { delayChildren: 0.35, staggerChildren: 0.14 } },
};

const podiumRow: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.9 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4, ease: [0.34, 1.56, 0.64, 1] },
  },
};

const podiumRowReduced: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
};

const MEDAL = ["text-amber-300", "text-slate-300", "text-amber-600"];

const SessionCompleteFireworks = ({
  finalStandings,
}: SessionCompleteFireworksProps) => {
  const reduce = useReducedMotion() ?? false;
  const top3 = finalStandings.slice(0, 3);

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center overflow-hidden bg-slate-950/80 backdrop-blur-sm">
      {/* confetti burst from center */}
      {!reduce &&
        CONFETTI.map((c, i) => (
          <motion.span
            key={i}
            className={`absolute ${c.round ? "rounded-full" : "rounded-[2px]"}`}
            style={{
              width: c.size,
              height: c.size,
              backgroundColor: c.color,
            }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{
              x: c.x,
              y: [0, c.y * 0.7, c.y + 60],
              opacity: [1, 1, 0],
              rotate: c.rotate,
            }}
            transition={{
              duration: 1.6,
              delay: c.delay,
              ease: "easeOut",
              times: [0, 0.6, 1],
            }}
            aria-hidden
          />
        ))}

      {/* GAME OVER + top 3 */}
      <motion.div
        className="relative flex flex-col items-center gap-3"
        variants={podium}
        initial="hidden"
        animate="show"
      >
        <motion.h2
          className={`text-3xl font-black tracking-tight text-emerald-300 ${
            !reduce ? "tp-fw-glow" : ""
          }`}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
          animate={
            reduce ? { opacity: 1 } : { opacity: 1, scale: [0.7, 1.12, 1] }
          }
          transition={
            reduce
              ? { duration: 0.2 }
              : { duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }
          }
        >
          GAME OVER!
        </motion.h2>

        <motion.ul
          className="flex w-56 flex-col gap-1.5"
          variants={podium}
        >
          {top3.map((p, i) => (
            <motion.li
              key={`${p.username}-${i}`}
              variants={reduce ? podiumRowReduced : podiumRow}
              className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 ${
                i === 0
                  ? "border-emerald-400/50 bg-emerald-500/10"
                  : "border-slate-800 bg-slate-900/60"
              }`}
            >
              <span
                className={`w-4 shrink-0 text-center text-sm font-black tabular-nums ${MEDAL[i]}`}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-100">
                {p.username}
              </span>
              <span className="shrink-0 text-sm font-black tabular-nums text-emerald-300">
                {p.points}
              </span>
            </motion.li>
          ))}
        </motion.ul>
      </motion.div>

      {/* sealing shimmer sweep */}
      {!reduce && (
        <span
          className="tp-fw-shimmer pointer-events-none absolute inset-0"
          aria-hidden
        />
      )}

      <span className="sr-only" role="status">
        Game over. Final standings:{" "}
        {top3.map((p, i) => `${i + 1}. ${p.username}, ${p.points} points`).join("; ")}.
      </span>
    </div>
  );
};

export default SessionCompleteFireworks;
