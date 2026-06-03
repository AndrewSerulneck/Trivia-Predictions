"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import type { GameplayAnimationProps } from "@/types/animation";

type GameplayAnimationBurstProps = GameplayAnimationProps & {
  label: string;
  tone: "success" | "error" | "neutral" | "gold";
};

const TONE_CLASSES: Record<GameplayAnimationBurstProps["tone"], string> = {
  success: "border-emerald-400/70 bg-emerald-500/20 text-emerald-100 shadow-[0_0_40px_rgba(52,211,153,0.35)]",
  error: "border-rose-400/70 bg-rose-500/20 text-rose-100 shadow-[0_0_40px_rgba(251,113,133,0.35)]",
  neutral: "border-cyan-400/70 bg-cyan-500/20 text-cyan-100 shadow-[0_0_40px_rgba(34,211,238,0.35)]",
  gold: "border-amber-400/70 bg-amber-500/20 text-amber-100 shadow-[0_0_40px_rgba(251,191,36,0.35)]",
};

export function GameplayAnimationBurst({
  label,
  tone,
  onComplete,
}: GameplayAnimationBurstProps) {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, 900);
    return () => {
      window.clearTimeout(timer);
    };
  }, [onComplete]);

  return (
    <div className="flex h-full w-full items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.72, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: -8 }}
        transition={{ type: "spring", stiffness: 420, damping: 24, mass: 0.85 }}
        className={`rounded-2xl border px-6 py-4 text-center text-lg font-black uppercase tracking-[0.12em] ${TONE_CLASSES[tone]}`}
      >
        {label}
      </motion.div>
    </div>
  );
}
