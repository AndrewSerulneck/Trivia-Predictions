"use client";

import { motion, useReducedMotion } from "framer-motion";

const ValidAnswerGlow = () => {
  const reduce = useReducedMotion() ?? false;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-end pr-2"
      aria-hidden
    >
      {/* border + bg flush over the parent row */}
      {!reduce && (
        <span className="tp-valid-glow absolute inset-0 rounded-[inherit]" />
      )}

      {/* checkmark at the row's right edge */}
      <motion.svg
        viewBox="0 0 24 24"
        className="relative h-4 w-4 text-emerald-400"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.6 }}
        animate={
          reduce
            ? { opacity: 1 }
            : { opacity: [0, 1, 1, 0], scale: [0.6, 1.1, 1, 1] }
        }
        transition={
          reduce
            ? { duration: 0 }
            : { duration: 0.4, times: [0, 0.3, 0.75, 1], ease: "easeOut" }
        }
      >
        {reduce ? (
          <path d="M4 12.5 L9.5 18 L20 6" />
        ) : (
          <motion.path
            d="M4 12.5 L9.5 18 L20 6"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          />
        )}
      </motion.svg>
    </div>
  );
};

export default ValidAnswerGlow;
