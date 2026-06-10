"use client";

import { AnimatePresence, motion } from "framer-motion";

// Intermission emcee announcement: the box swaps with a cross-fade whenever the
// text changes, and short messages type in character-by-character for a live
// "host is talking" feel. Long messages (> 120 chars) render instantly to keep
// the stagger from dragging.
const MAX_TYPE_IN_LENGTH = 120;

export const EmceeTypeInAnnouncement = ({ text }: { text: string | null }) => {
  return (
    <AnimatePresence mode="wait">
      {text ? (
        <motion.div
          key={text}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.18 } }}
          transition={{ duration: 0.28 }}
          className="rounded-xl px-4 py-3 text-sm font-bold"
          style={{ background: "rgba(120,53,15,0.3)", border: "1px solid rgba(245,158,11,0.35)", color: "#fde68a" }}
        >
          {text.length <= MAX_TYPE_IN_LENGTH
            ? text.split("").map((char, charIndex) => (
                <motion.span
                  key={charIndex}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: charIndex * 0.018, duration: 0.12 }}
                  className="inline"
                >
                  {char}
                </motion.span>
              ))
            : text}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
