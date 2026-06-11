"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

export function FantasySettledCollectAnimation({
  pointsCollected,
  entryCount,
  onComplete,
}: {
  pointsCollected: number;
  entryCount: number;
  onComplete: () => void;
}) {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);

  const baseDelay = 0.4;
  const stagger = 0.08;

  const items: { key: string; node: React.ReactNode }[] = [
    {
      key: "icon",
      node: <span className="text-5xl">🏆</span>,
    },
    {
      key: "points",
      node: <span className="text-6xl font-black text-[#fde68a]">+{pointsCollected}</span>,
    },
    {
      key: "label",
      node: (
        <span className="font-black uppercase tracking-widest text-white">FANTASY POINTS</span>
      ),
    },
  ];

  if (entryCount > 1) {
    items.push({
      key: "entries",
      node: <span className="text-sm text-slate-400">{entryCount} lineups settled</span>,
    });
  }

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
            className="flex flex-col items-center gap-2 rounded-2xl border border-[#fde68a]/40 bg-[#0a3128] px-10 py-8 text-center shadow-2xl"
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
              transition={{ duration: 1.2 }}
              onAnimationComplete={() => setVisible(false)}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}