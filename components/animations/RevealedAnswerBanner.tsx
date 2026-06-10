"use client";

import { AnimatePresence, motion } from "framer-motion";

// Correct-answer reveal during the rest/feedback phase: the banner rises and
// scales in, then a single light shimmer sweeps left-to-right across it (the
// `animate-tp-answer-shimmer` keyframe lives in app/globals.css).
//
// `animationKey` should change per question (the page's `activeKey`) so the
// reveal re-fires for each new correct answer.
export const RevealedAnswerBanner = ({
  answer,
  animationKey,
}: {
  answer: string | null;
  animationKey: string;
}) => {
  return (
    <AnimatePresence>
      {answer ? (
        <motion.p
          key={`reveal-${animationKey}`}
          initial={{ opacity: 0, y: 14, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
          className="relative mt-3 overflow-hidden rounded-xl border border-fuchsia-300/50 bg-fuchsia-950/40 p-3 text-2xl font-extrabold tracking-tight"
        >
          Correct Answer: {answer}
          <span
            aria-hidden
            className="animate-tp-answer-shimmer pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-fuchsia-200/30 to-transparent"
          />
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
};
