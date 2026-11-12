"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { wallClockDelayS } from "@/components/venue-screen/fx/fxClock";

// A diagonal highlight that crosses its parent once every `periodMs`. The parent must be `relative overflow-hidden`.
// Transform + opacity only. Reduced motion: same markup, never animates (stays invisible), so server and client
// HTML match on hydration.
// Sweeps land on wall-clock slots (`delayMs` into each period), so every TV in a bar shines together and a reload
// doesn't add an extra sweep. Stagger siblings with different `delayMs`.

type ShineSweepProps = {
  periodMs?: number;
  /** Offset of the sweep within each wall-clock period. */
  delayMs?: number;
  durationMs?: number;
  tint?: string;
};

export function ShineSweep({
  periodMs = 45_000,
  delayMs = 4_000,
  durationMs = 1_100,
  tint = "rgba(255,255,255,0.5)",
}: ShineSweepProps) {
  const reduceMotion = useReducedMotion();
  // Read once on mount: only the animation's start delay uses it, never the markup.
  const [firstDelayS] = useState(() => wallClockDelayS(periodMs, delayMs, Date.now()));
  const durationS = durationMs / 1000;
  return (
    <motion.span
      aria-hidden
      data-testid="shine-sweep"
      className="pointer-events-none absolute inset-y-0 left-0 w-1/3 will-change-transform"
      style={{ background: `linear-gradient(100deg, transparent, ${tint}, transparent)`, skewX: -18, opacity: 0, x: "-120%" }}
      animate={reduceMotion ? undefined : { x: ["-120%", "420%"], opacity: [0, 1, 1, 0] }}
      transition={{
        duration: durationS,
        repeat: Infinity,
        repeatDelay: Math.max(0, periodMs / 1000 - durationS),
        delay: firstDelayS,
        ease: "easeInOut",
      }}
    />
  );
}
