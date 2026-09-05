"use client";

import { useEffect } from "react";
import { motion, useAnimationControls, useReducedMotion } from "framer-motion";

export type ActionPopTone = "cyan" | "gold";

export function ActionPop({
  text,
  x,
  y,
  tone,
  onDone,
}: {
  text: string;
  x: number;
  y: number;
  tone: ActionPopTone;
  onDone: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const controls = useAnimationControls();

  useEffect(() => {
    if (reducedMotion) {
      controls.set({ opacity: 1, scale: 1, y: 0 });
      const timer = window.setTimeout(onDone, 850);
      return () => window.clearTimeout(timer);
    }
    let active = true;
    let holdTimer: number | null = null;
    const run = async () => {
      await controls.set({ opacity: 0, scale: 0.5, y: 0 });
      if (!active) return;
      await controls.start({
        opacity: 1,
        scale: 1.2,
        y: -8,
        transition: { type: "spring", stiffness: 400, damping: 25, mass: 0.8 },
      });
      if (!active) return;
      await new Promise<void>((resolve) => {
        holdTimer = window.setTimeout(() => resolve(), 850);
      });
      if (!active) return;
      await controls.start({
        opacity: 0,
        scale: 1,
        y: -24,
        transition: { type: "spring", stiffness: 400, damping: 25, mass: 0.8 },
      });
      if (!active) return;
      onDone();
    };
    void run();
    return () => {
      active = false;
      if (holdTimer) {
        window.clearTimeout(holdTimer);
      }
    };
  }, [controls, onDone, reducedMotion]);

  return (
    <motion.div
      animate={controls}
      className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-xs font-black uppercase tracking-[0.08em] sm:text-sm"
      style={{
        left: x,
        top: y,
        color: tone === "gold" ? "#facc15" : "#00ffff",
        textShadow:
          tone === "gold"
            ? "0 0 8px rgba(250,204,21,0.92), 0 0 16px rgba(250,204,21,0.75)"
            : "0 0 8px rgba(0,255,255,0.95), 0 0 16px rgba(0,255,255,0.8)",
        willChange: "transform, opacity",
      }} transition={reducedMotion ? { duration: 0 } : undefined}
    >
      {text}
    </motion.div>
  );
}
