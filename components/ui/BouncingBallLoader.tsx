"use client";

import { motion } from "framer-motion";

interface BouncingBallLoaderProps {
  label?: string;
  size?: "sm" | "md" | "lg";
  fullScreen?: boolean;
  dark?: boolean;
}

export function BouncingBallLoader({
  label = "Hightop Challenge: Game On.",
  size = "md",
  fullScreen = false,
  dark = false,
}: BouncingBallLoaderProps) {
  const ballSize =
    size === "sm" ? "h-7 w-7" : size === "lg" ? "h-14 w-14" : "h-10 w-10";
  const containerH =
    size === "sm" ? "h-12 w-14" : size === "lg" ? "h-24 w-28" : "h-16 w-20";
  const bounceY =
    size === "sm" ? [0, 14, 0] : size === "lg" ? [0, 32, 0] : [0, 22, 0];
  const shadowW =
    size === "sm" ? "w-8" : size === "lg" ? "w-16" : "w-12";
  const textSize =
    size === "sm"
      ? "text-[10px]"
      : size === "lg"
      ? "text-base"
      : "text-xs";
  const gap = size === "sm" ? "gap-2" : size === "lg" ? "gap-4" : "gap-3";

  const ball = (
    <div className={`relative ${containerH} overflow-hidden`}>
      <motion.div
        className={`absolute left-1/2 top-0 ${ballSize} -translate-x-1/2 rounded-full border-2 border-orange-900 bg-orange-400`}
        animate={{ y: bounceY, scaleX: [1, 1.06, 1], scaleY: [1, 0.92, 1] }}
        transition={{ repeat: Infinity, duration: 0.72, ease: "easeInOut" }}
      >
        <div className="absolute inset-x-[47%] top-0 h-full w-[2px] bg-orange-900/80" />
        <div className="absolute inset-y-[47%] left-0 h-[2px] w-full bg-orange-900/80" />
        <div className="absolute left-1/2 top-0 h-full w-1/2 -translate-x-px overflow-hidden">
          <div className="h-full w-[200%] -translate-x-1/2 rounded-full border-2 border-orange-900/60" />
        </div>
      </motion.div>
      <div
        className={`absolute bottom-0 left-1/2 h-[3px] ${shadowW} -translate-x-1/2 rounded-full bg-orange-900/20`}
      />
    </div>
  );

  if (fullScreen) {
    return (
      <div className="pointer-events-none fixed inset-0 z-[2400] flex h-screen w-screen items-center justify-center bg-[#030712]">
        <div className={`flex flex-col items-center justify-center ${gap} px-6 text-center`}>
          {ball}
          <p className={`${textSize} font-black tracking-[0.05em] text-white [font-family:'Kalam','Bree_Serif','Nunito',cursive]`}>
            {label}
          </p>
        </div>
      </div>
    );
  }

  if (dark) {
    return (
      <div className={`flex flex-col items-center justify-center ${gap} px-6 text-center`}>
        {ball}
        <p className={`${textSize} font-black tracking-[0.05em] text-white [font-family:'Kalam','Bree_Serif','Nunito',cursive]`}>
          {label}
        </p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center ${gap} rounded-xl border border-orange-200 bg-gradient-to-b from-orange-50 to-amber-50 px-4 py-6`}>
      {ball}
      <p className={`${textSize} font-semibold tracking-[0.08em] text-slate-700`}>{label}</p>
    </div>
  );
}
