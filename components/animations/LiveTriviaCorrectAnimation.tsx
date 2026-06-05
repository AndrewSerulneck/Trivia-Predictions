"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { GameplayAnimationProps } from "@/types/animation";

// 250ms pop-in + 5000ms hold + 300ms exit = 5550ms
// Add 100ms buffer so onComplete fires AFTER the exit animation fully renders
const DURATION_MS = 5550;
const COMPLETE_DELAY_MS = DURATION_MS + 100;

export function LiveTriviaCorrectAnimation({ onComplete }: GameplayAnimationProps) {
  const cancelledRef = useRef<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      if (!cancelledRef.current) onComplete();
    }, COMPLETE_DELAY_MS);
    return () => {
      cancelledRef.current = true;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Normalised keyframe times over 5.55s total:
  //   t=0ms     (0.000): initial
  //   t=250ms   (0.045): pop-in complete
  //   t=5250ms  (0.946): hold ends, exit begins
  //   t=5550ms  (1.000): gone
  const times = [0, 0.045, 0.946, 1] as const;

  return (
    <>
      {/* Screen-wide green flash */}
      <motion.div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(16,185,129,0.18)",
          pointerEvents: "none",
          zIndex: 9997,
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{
          duration: DURATION_MS / 1000,
          times: [...times],
          ease: "easeOut",
        }}
      />

      {/* Radial glow burst behind the stamp */}
      <motion.div
        style={{
          position: "fixed",
          inset: 0,
          background:
            "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(52,211,153,0.35) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 9998,
        }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{
          opacity: [0, 1, 1, 0],
          scale: [0.6, 1.1, 1.05, 1.2],
        }}
        transition={{
          duration: DURATION_MS / 1000,
          times: [...times],
          ease: ["backOut", "linear", "easeIn"],
        }}
      />

      {/* Centre stamp */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 10000,
        }}
      >
        <motion.div
          style={{
            backgroundColor: "rgba(6,78,59,0.85)",
            border: "3px solid rgba(52,211,153,1)",
            borderRadius: "1.5rem",
            paddingLeft: "3.5rem",
            paddingRight: "3.5rem",
            paddingTop: "1.75rem",
            paddingBottom: "1.75rem",
            color: "rgba(236,253,245,1)",
            fontSize: "3rem",
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            textShadow: "0 0 32px rgba(52,211,153,0.9), 0 2px 8px rgba(0,0,0,0.6)",
            boxShadow:
              "0 0 0 0px rgba(52,211,153,0.4), 0 0 60px rgba(52,211,153,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
            whiteSpace: "nowrap",
            userSelect: "none",
            willChange: "transform, opacity",
          }}
          initial={{ scale: 2.2, opacity: 0, y: 0 }}
          animate={{
            scale:   [2.2, 1,    1,    0.9],
            opacity: [0,   1,    1,    0  ],
            y:       [0,   0,    0,    -24],
          }}
          transition={{
            duration: DURATION_MS / 1000,
            times: [...times],
            ease: ["backOut", "linear", "easeIn"],
          }}
        >
          ✓ CORRECT
        </motion.div>
      </div>

      {/* "+10" floating up from centre */}
      <motion.div
        style={{
          position: "fixed",
          left: "50%",
          top: "38%",
          x: "-50%",
          pointerEvents: "none",
          zIndex: 9999,
          color: "#34d399",
          fontWeight: 900,
          fontSize: "3.5rem",
          lineHeight: 1,
          textShadow: "0 0 28px rgba(52,211,153,1)",
          whiteSpace: "nowrap",
          userSelect: "none",
          willChange: "transform, opacity",
        }}
        initial={{ y: 0, opacity: 0 }}
        animate={{
          y:       [0, -30, -90],
          opacity: [0,  1,   0 ],
        }}
        transition={{
          duration: 1.4,
          times: [0, 0.15, 1],
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        +10
      </motion.div>
    </>
  );
}