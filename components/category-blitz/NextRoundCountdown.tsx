"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

interface NextRoundCountdownProps {
  secondsUntilNextRound: number;
  onZero?: () => void;
}

// null = the "GO!" beat after 1 finishes, before onZero fires.
type Tick = number | "go";

const NextRoundCountdown = ({
  secondsUntilNextRound,
  onZero,
}: NextRoundCountdownProps) => {
  const reduce = useReducedMotion() ?? false;
  // Seed straight into the "go" tick when we're handed 0 (or less) so the
  // effect below never needs to synchronously flip count on mount.
  const [count, setCount] = useState<Tick>(() =>
    secondsUntilNextRound > 0 ? secondsUntilNextRound : "go",
  );
  const doneRef = useRef(false);

  // One internal 1s ticker: N → … → 1 → "go" → onZero.
  useEffect(() => {
    if (count === "go") {
      const id = window.setTimeout(() => {
        if (!doneRef.current) {
          doneRef.current = true;
          onZero?.();
        }
      }, 600);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(
      () => setCount((c) => (typeof c === "number" && c > 1 ? c - 1 : "go")),
      1000,
    );
    return () => window.clearTimeout(id);
  }, [count, onZero]);

  const isFinal = count === "go" || (typeof count === "number" && count <= 3);
  const label = count === "go" ? "GO!" : String(count);

  // Final 3-2-1-GO cycle emerald → rose → emerald for drama.
  const finalColor =
    count === "go"
      ? "text-emerald-400"
      : count === 3
        ? "text-emerald-400"
        : count === 2
          ? "text-rose-400"
          : "text-emerald-400";

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm"
      role="status"
      aria-live="assertive"
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={label}
          className={`select-none font-black tabular-nums ${
            isFinal
              ? `${finalColor} ${count === "go" ? "text-7xl" : "text-8xl"} ${
                  !reduce ? "tp-count-glow" : ""
                }`
              : "text-4xl text-slate-100"
          }`}
          initial={
            reduce
              ? { opacity: 1 }
              : isFinal
                ? { scale: 0, opacity: 0 }
                : { scale: 0.8, opacity: 0 }
          }
          animate={
            reduce
              ? { opacity: 1 }
              : isFinal
                ? { scale: [0, 1.4, 1], opacity: [0, 1, 1] }
                : { scale: [0.8, 1.2, 1], opacity: [0, 1, 1] }
          }
          exit={
            reduce
              ? { opacity: 0 }
              : { scale: isFinal ? 1.3 : 1.1, opacity: 0 }
          }
          transition={
            reduce
              ? { duration: 0.15 }
              : isFinal
                ? { duration: 0.5, times: [0, 0.5, 1], ease: "easeOut" }
                : { duration: 0.3, times: [0, 0.5, 1], ease: "easeOut" }
          }
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </div>
  );
};

export default NextRoundCountdown;
