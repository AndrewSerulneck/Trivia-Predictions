"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { wallClockElapsedS } from "@/components/venue-screen/fx/fxClock";
import { useFxTier } from "@/components/venue-screen/fx/useFx";

// Drifting colour behind every venue-display screen (docs/venue-display-hype-and-intro-stinger-plan.md §4 Phase 0).
// Two big radial washes in the theme's ambient colours move slowly by transform only (no blur, no box-shadow),
// on different periods so the pattern never visibly repeats. Each loop ends where it starts, so it never jumps,
// and is phased from the wall clock (a negative start delay), so TVs drift together and a reload doesn't jump.
// Reduced motion: still washes. Tier `off` (the frame watchdog found the device too slow, e.g. 4K on a weak stick):
// the washes glide home and stop, because drifting two 1100 px layers is most of a static screen's per-frame cost there.

const BLOB_PX = 1100; // smaller = cheaper on weak TVs: 1500 px cost ~10 ms/frame at x6 CPU throttle, 1100 px ~6 ms
const PERIOD_A_MS = 47_000;
const PERIOD_B_MS = 61_000;

const STILL = { x: 0, y: 0 };
const SETTLE = { duration: 1.2, ease: "easeOut" } as const;

const wash = (color: string) => `radial-gradient(circle at center, ${color} 0%, transparent 68%)`;

type BrandStageProps = {
  ambientA: string;
  ambientB: string;
};

export function BrandStage({ ambientA, ambientB }: BrandStageProps) {
  const reduceMotion = useReducedMotion();
  const tier = useFxTier();
  const still = Boolean(reduceMotion) || tier === "off";
  // Read once on mount: only the animations' start offsets use it, never the markup.
  const [startedAt] = useState(() => Date.now());
  return (
    <div aria-hidden data-testid="brand-stage" className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute will-change-transform"
        style={{ left: -420, top: -520, width: BLOB_PX, height: BLOB_PX, background: wash(ambientA), opacity: 0.85 }}
        animate={still ? STILL : { x: [0, 560, 180, 0], y: [0, 260, 560, 0] }}
        transition={still ? SETTLE : {
          duration: PERIOD_A_MS / 1000,
          repeat: Infinity,
          ease: "easeInOut",
          delay: -wallClockElapsedS(PERIOD_A_MS, startedAt),
        }}
      />
      <motion.div
        className="absolute will-change-transform"
        style={{ right: -420, bottom: -520, width: BLOB_PX, height: BLOB_PX, background: wash(ambientB), opacity: 0.85 }}
        animate={still ? STILL : { x: [0, -520, -140, 0], y: [0, -300, -540, 0] }}
        transition={still ? SETTLE : {
          duration: PERIOD_B_MS / 1000,
          repeat: Infinity,
          ease: "easeInOut",
          delay: -wallClockElapsedS(PERIOD_B_MS, startedAt),
        }}
      />
    </div>
  );
}
