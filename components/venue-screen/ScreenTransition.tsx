"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

// Motion foundation for the venue TV screen (Phase 0).
//
// The screen is POLL-DRIVEN (~3s): the parent re-renders with fresh props and
// there are no clean lifecycle events. So every transition is keyed off a
// `transitionKey` derived from the game's identity (mode + phase + round +
// question/letter). When that key changes, AnimatePresence swaps panels; when it
// doesn't, repeated polls are inert. This makes the animations idempotent and
// safe to re-mount — the single most important constraint for this surface.

type ScreenTransitionProps = {
  /** Identity of the current view. Change it to replay the swap; keep it to stay put. */
  transitionKey: string;
  children: ReactNode;
  className?: string;
};

/**
 * Cross-fades + gently rises between keyed views. Honors `prefers-reduced-motion`
 * with an instant swap (no transform, no delay).
 */
export function ScreenTransition({ transitionKey, children, className }: ScreenTransitionProps) {
  const reduce = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={transitionKey}
        className={className}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 26, scale: 0.985 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -18, scale: 0.99 }}
        transition={reduce ? { duration: 0.15 } : { duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        style={{ willChange: "transform, opacity" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
