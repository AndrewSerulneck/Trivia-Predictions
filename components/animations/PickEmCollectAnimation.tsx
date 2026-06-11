"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

export function PickEmCollectAnimation({
  pointsCollected,
  correctPicks,
  totalSettledPicks,
  multiplierApplied,
  onComplete,
}: {
  pointsCollected: number;
  correctPicks: number;
  totalSettledPicks: number;
  multiplierApplied: 1 | 2 | 3;
  onComplete: () => void;
}) {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);

  const baseDelay = 0.4;
  const stagger = 0.08;
  const hasMultiplier = multiplierApplied > 1;

  const items: { key: string; node: React.ReactNode }[] = [];
  if (hasMultiplier) {
    items.push({
      key: "multiplier",
      node: (
        <span className="text-lg font-black uppercase tracking-wide text-amber-400">
          {multiplierApplied}x MULTIPLIER!
        </span>
      ),
    });
  }
  items.push({
    key: "points",
    node: <span className="text-6xl font-black text-amber-400">+{pointsCollected}</span>,
  });
  items.push({
    key: "label",
    node: (
      <span className="font-black uppercase tracking-widest text-white">POINTS COLLECTED</span>
    ),
  });
  items.push({
    key: "picks",
    node: (
      <span className="text-sm text-slate-400">
        {correctPicks} / {totalSettledPicks} Correct Picks
      </span>
    ),
  });

  const lastIndex = items.length - 1;

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/75 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="flex flex-col items-center gap-2 rounded-2xl border border-amber-400/40 bg-slate-950/95 px-10 py-8 text-center shadow-2xl"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={exiting ? { scale: 0.85, opacity: 0 } : { scale: 1, opacity: 1 }}
            transition={
              exiting
                ? { duration: 0.3, ease: "easeIn" }
                : { type: "spring", stiffness: 260, damping: 18 }
            }
          >
            {items.map((item, index) => (
              <motion.div
                key={item.key}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: baseDelay + index * stagger, duration: 0.25 }}
                onAnimationComplete={
                  index === lastIndex
                    ? () => {
                        if (!exiting) setExiting(true);
                      }
                    : undefined
                }
              >
                {item.node}
              </motion.div>
            ))}
          </motion.div>

          {exiting && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 1.4 }}
              onAnimationComplete={() => setVisible(false)}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}