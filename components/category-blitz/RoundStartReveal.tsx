"use client";

import {
  motion,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import { useEffect, useRef } from "react";

interface RoundStartRevealProps {
  letter: string;
  categories: string[];
  onDone?: () => void;
}

const LETTER_LAND_MS = 0.5; // seconds; shockwave + cascade key off this

const list: Variants = {
  hidden: {},
  show: {
    transition: { delayChildren: LETTER_LAND_MS, staggerChildren: 0.06 },
  },
};

const row: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

const rowReduced: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
};

const RoundStartReveal = ({
  letter,
  categories,
  onDone,
}: RoundStartRevealProps) => {
  const reduce = useReducedMotion() ?? false;
  const doneRef = useRef(false);

  const fire = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone?.();
  };

  // Fallback in case there are no categories to hang onAnimationComplete on.
  useEffect(() => {
    if (categories.length > 0) return;
    const id = window.setTimeout(fire, reduce ? 200 : LETTER_LAND_MS * 1000 + 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.length, reduce]);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-5 bg-slate-950 p-5">
      {/* letter badge + shockwave */}
      <div className="relative flex items-center justify-center">
        {!reduce && (
          <motion.span
            className="pointer-events-none absolute h-20 w-20 rounded-full border-2 border-emerald-400/60"
            initial={{ scale: 0.5, opacity: 0.6 }}
            animate={{ scale: 2.6, opacity: 0 }}
            transition={{
              duration: 0.55,
              delay: LETTER_LAND_MS - 0.08,
              ease: "easeOut",
            }}
            aria-hidden
          />
        )}

        <motion.div
          className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[linear-gradient(132deg,#10b981,#22c55e,#14b8a6)] text-4xl font-black text-emerald-950 shadow-lg shadow-emerald-500/20"
          initial={
            reduce
              ? { opacity: 0 }
              : { y: -120, opacity: 0, scale: 0.8 }
          }
          animate={
            reduce
              ? { opacity: 1 }
              : { y: 0, opacity: 1, scale: [0.8, 1.15, 0.95, 1] }
          }
          transition={
            reduce
              ? { duration: 0.25 }
              : {
                  duration: LETTER_LAND_MS,
                  ease: [0.34, 1.56, 0.64, 1],
                  scale: { duration: LETTER_LAND_MS, times: [0, 0.55, 0.8, 1] },
                }
          }
        >
          {letter}
        </motion.div>
      </div>

      {/* category cascade */}
      <motion.ul
        variants={list}
        initial="hidden"
        animate="show"
        className="flex w-full flex-col gap-1.5"
      >
        {categories.map((c, i) => (
          <motion.li
            key={`${c}-${i}`}
            variants={reduce ? rowReduced : row}
            onAnimationComplete={i === categories.length - 1 ? fire : undefined}
            className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm font-semibold text-slate-200"
          >
            {c}
          </motion.li>
        ))}
      </motion.ul>
    </div>
  );
};

export default RoundStartReveal;
