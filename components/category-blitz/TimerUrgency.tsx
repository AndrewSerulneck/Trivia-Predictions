"use client";

import { motion, useReducedMotion } from "framer-motion";

interface TimerUrgencyProps {
  timeRemaining: number;
  label?: string;
}

type Stage = "calm" | "alert" | "panic";

const getStage = (t: number): Stage => {
  if (t < 10) return "panic";
  if (t <= 30) return "alert";
  return "calm";
};

const TimerUrgency = ({ timeRemaining, label }: TimerUrgencyProps) => {
  const reduce = useReducedMotion() ?? false;
  const stage = getStage(timeRemaining);
  const display = label ?? String(timeRemaining);

  const colorClass =
    stage === "panic"
      ? "text-rose-400"
      : stage === "alert"
        ? "text-emerald-300"
        : "text-slate-100";

  if (reduce) {
    return (
      <span
        className={`text-2xl font-black tabular-nums ${colorClass}`}
        role="timer"
        aria-live={stage === "panic" ? "assertive" : "off"}
      >
        {display}
      </span>
    );
  }

  return (
    <motion.span
      key={stage}
      className={`inline-block text-2xl font-black tabular-nums ${colorClass} ${
        stage === "panic" ? "tp-timer-panic" : ""
      }`}
      animate={
        stage === "calm"
          ? { scale: 1 }
          : stage === "alert"
            ? { scale: [1, 1.04, 1] }
            : { scale: [1, 1.08, 1] }
      }
      transition={
        stage === "calm"
          ? { duration: 0.2 }
          : stage === "alert"
            ? { duration: 1.2, repeat: Infinity, ease: "easeOut" }
            : { duration: 0.6, repeat: Infinity, ease: "easeOut" }
      }
      role="timer"
      aria-live={stage === "panic" ? "assertive" : "off"}
    >
      {display}
    </motion.span>
  );
};

export default TimerUrgency;
