"use client";

import { motion, useReducedMotion } from "framer-motion";

// CSS-only pieces of the game moments (docs/venue-display-hype-and-intro-stinger-plan.md §4 Phase 5).
// Transform + opacity only. Mount them conditionally: a one-shot (LightStreak, OneShotShine) only after
// `useFxMoment(key)` is true, so it never plays on a poll tick or after a reload; EdgeGlow while a timer is in
// its last seconds. Reduced motion: one-shots don't render; EdgeGlow holds still.

type OverlayProps = { color: string };

/** A light streak crossing the whole panel once. The parent must be `relative overflow-hidden`. */
export function LightStreak({ color, delayS = 0 }: OverlayProps & { delayS?: number }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;
  return (
    <motion.span
      aria-hidden
      data-testid="moment-streak"
      className="pointer-events-none absolute inset-y-0 left-0 z-10 w-1/3 will-change-transform"
      style={{ background: `linear-gradient(100deg, transparent, ${color}, transparent)`, skewX: -18, opacity: 0, x: "-120%" }}
      animate={{ x: ["-120%", "420%"], opacity: [0, 0.55, 0.55, 0] }}
      transition={{ duration: 0.9, ease: [0.65, 0, 0.35, 1], delay: delayS }}
    />
  );
}

/** One diagonal shine across a box (the winner row, the correct answer). The parent must be `relative overflow-hidden`. */
export function OneShotShine({ delayS = 0, tint = "rgba(255,255,255,0.45)" }: { delayS?: number; tint?: string }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;
  return (
    <motion.span
      aria-hidden
      data-testid="moment-shine"
      className="pointer-events-none absolute inset-y-0 left-0 w-1/4 will-change-transform"
      style={{ background: `linear-gradient(100deg, transparent, ${tint}, transparent)`, skewX: -18, opacity: 0, x: "-120%" }}
      animate={{ x: ["-120%", "520%"], opacity: [0, 1, 1, 0] }}
      transition={{ duration: 1.1, ease: "easeInOut", delay: delayS }}
    />
  );
}

/** The stage edge breathing in `color` once a second. The parent must be `relative`. */
export function EdgeGlow({ color }: OverlayProps) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      aria-hidden
      data-testid="edge-glow"
      className="pointer-events-none absolute inset-0 z-10"
      style={{ background: `radial-gradient(ellipse at center, transparent 48%, ${color}99 100%)` }}
      initial={{ opacity: 0 }}
      animate={reduceMotion ? { opacity: 0.45 } : { opacity: [0.2, 1, 0.2] }}
      transition={reduceMotion ? { duration: 0.2 } : { duration: 1, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}
