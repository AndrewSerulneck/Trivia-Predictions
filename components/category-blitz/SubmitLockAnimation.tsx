"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";

interface SubmitLockAnimationProps {
  answersCount: number;
  onComplete?: () => void;
}

const LockIcon = ({ reduce }: { reduce: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    className="h-6 w-6 text-emerald-950"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="5" y="11" width="14" height="9" rx="2" />
    {reduce ? (
      <path d="M8 11 V7 a4 4 0 0 1 8 0 v4" />
    ) : (
      <motion.path
        d="M8 11 V7 a4 4 0 0 1 8 0 v4"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, delay: 0.45, ease: "easeOut" }}
      />
    )}
  </svg>
);

const SubmitLockAnimation = ({
  answersCount,
  onComplete,
}: SubmitLockAnimationProps) => {
  const reduce = useReducedMotion() ?? false;
  const doneRef = useRef(false);

  const rows = Math.min(Math.max(answersCount, 0), 12);

  // Fire onComplete once, after the badge seal lands (or immediately-ish under reduce).
  useEffect(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    const total = reduce ? 250 : 1000;
    const id = window.setTimeout(() => onComplete?.(), total);
    return () => window.clearTimeout(id);
  }, [reduce, onComplete]);

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      {/* flying answer rows */}
      {!reduce &&
        Array.from({ length: rows }, (_, i) => (
          <motion.span
            key={i}
            className="absolute h-8 w-40 rounded-lg border border-slate-700 bg-slate-900/70"
            style={{ top: `${18 + i * 5}%` }}
            initial={{ opacity: 1, y: 0, scale: 1 }}
            animate={{ opacity: 0, y: -80, scale: 0.8 }}
            transition={{
              duration: 0.5,
              delay: i * 0.06,
              ease: "easeIn",
            }}
            aria-hidden
          />
        ))}

      {/* central lock badge */}
      <motion.div
        className="tp-lock-seal relative flex items-center gap-2.5 overflow-hidden rounded-2xl bg-[linear-gradient(132deg,#10b981,#22c55e,#14b8a6)] px-5 py-3 shadow-lg shadow-emerald-500/25"
        initial={
          reduce
            ? { opacity: 1, scale: 1 }
            : { opacity: 0, scale: 0.6 }
        }
        animate={
          reduce
            ? { opacity: 1, scale: 1 }
            : { opacity: 1, scale: [0.6, 1.12, 1] }
        }
        transition={
          reduce
            ? { duration: 0.2 }
            : {
                duration: 0.5,
                delay: 0.28,
                ease: [0.34, 1.56, 0.64, 1],
              }
        }
      >
        {/* shimmer sweep to "seal" it */}
        {!reduce && (
          <span className="tp-lock-shimmer pointer-events-none absolute inset-0" aria-hidden />
        )}

        <LockIcon reduce={reduce} />
        <span className="relative text-sm font-black tracking-wide text-emerald-950">
          {rows} {rows === 1 ? "answer" : "answers"} locked
        </span>
      </motion.div>

      <span className="sr-only" role="status">
        {rows} answers locked in.
      </span>
    </div>
  );
};

export default SubmitLockAnimation;
