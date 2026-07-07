"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

interface WrongVerdictProps {
  answer: string;
  explanation: string;
}

const WrongVerdict = ({ answer, explanation }: WrongVerdictProps) => {
  const reduce = useReducedMotion() ?? false;
  // Count of characters revealed so far. Only ever advanced from inside the
  // interval callback (async) — never synchronously in the effect body — so the
  // reveal causes no cascading-render lint violation. `typed` is derived below.
  const [count, setCount] = useState(0);
  const typed = reduce ? explanation : explanation.slice(0, count);
  const done = reduce || count >= explanation.length;

  useEffect(() => {
    if (reduce) return;
    let intervalId: number | undefined;
    let i = 0;
    // Small lead-in so the shake + ✕ land before the line starts typing.
    const startId = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        i += 1;
        setCount(i);
        if (i >= explanation.length) window.clearInterval(intervalId);
      }, 18);
    }, 320);
    return () => {
      window.clearTimeout(startId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [explanation, reduce]);

  return (
    <motion.div
      className="flex flex-col gap-1"
      initial={reduce ? false : { x: 0 }}
      animate={reduce ? {} : { x: [0, -3, 3, -2, 2, 0] }}
      transition={reduce ? undefined : { duration: 0.3, ease: "easeInOut" }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-bold text-slate-100">
          {answer}
        </p>
        <motion.span
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-rose-500/15 text-xs font-black text-rose-400 ring-1 ring-rose-400/30"
          initial={reduce ? { scale: 1 } : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={
            reduce
              ? { duration: 0 }
              : { type: "spring", stiffness: 600, damping: 15, delay: 0.05 }
          }
          aria-hidden
        >
          ✕
        </motion.span>
      </div>

      <p className="min-h-[1rem] text-xs leading-snug text-rose-300/80">
        {typed}
        {!reduce && !done && (
          <motion.span
            className="ml-px inline-block h-3 w-px translate-y-px bg-rose-300/80 align-middle"
            animate={{ opacity: [1, 1, 0, 0] }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
            aria-hidden
          />
        )}
      </p>

      <span className="sr-only">
        {answer}: incorrect. {explanation}
      </span>
    </motion.div>
  );
};

export default WrongVerdict;
