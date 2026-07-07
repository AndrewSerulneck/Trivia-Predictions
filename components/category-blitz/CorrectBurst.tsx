"use client";

import { motion, useReducedMotion } from "framer-motion";

interface CorrectBurstProps {
  points?: string;
}

// Deterministic (no Math.random -> no hydration drift): 8 evenly-spread sparks.
const PARTICLES = Array.from({ length: 8 }, (_, i) => {
  const angle = (i / 8) * Math.PI * 2;
  const dist = 30 + (i % 2) * 8;
  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    color: i % 2 === 0 ? "#10b981" : "#22c55e",
    delay: 0.05 + (i % 3) * 0.015,
  };
});

const CorrectBurst = ({ points = "+2" }: CorrectBurstProps) => {
  const reduce = useReducedMotion() ?? false;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
      aria-hidden
    >
      {/* particle burst */}
      {!reduce &&
        PARTICLES.map((p, i) => (
          <motion.span
            key={i}
            className="absolute h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: p.color }}
            initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
            animate={{ x: p.x, y: p.y, scale: 0, opacity: 0 }}
            transition={{
              duration: 0.5,
              delay: p.delay,
              ease: "easeOut",
            }}
          />
        ))}

      {/* +2 with overshoot bounce, then fade */}
      <motion.div
        className="flex items-center gap-1 text-lg font-extrabold text-emerald-300"
        initial={reduce ? { opacity: 1 } : { scale: 0, opacity: 0 }}
        animate={
          reduce
            ? { opacity: 1 }
            : { scale: [0, 1.25, 1, 1, 0.9], opacity: [0, 1, 1, 1, 0] }
        }
        transition={
          reduce
            ? { duration: 0 }
            : { duration: 0.7, times: [0, 0.28, 0.42, 0.75, 1], ease: "easeOut" }
        }
      >
        {/* thin check-mark draw */}
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {reduce ? (
            <path d="M4 12.5 L9.5 18 L20 6" />
          ) : (
            <motion.path
              d="M4 12.5 L9.5 18 L20 6"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.3, delay: 0.15, ease: "easeOut" }}
            />
          )}
        </svg>
        {points}
      </motion.div>
    </div>
  );
};

export default CorrectBurst;
