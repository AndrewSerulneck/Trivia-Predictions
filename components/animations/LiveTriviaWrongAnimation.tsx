"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { GameplayAnimationProps } from "@/types/animation";

// 250ms pop-in + 5000ms hold + 300ms exit = 5550ms
// Add 100ms buffer so onComplete fires AFTER the exit animation fully renders
const DURATION_MS = 5550;
const COMPLETE_DELAY_MS = DURATION_MS + 100;

export function LiveTriviaWrongAnimation({ onComplete }: GameplayAnimationProps) {
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

  return (
    <>
      {/* Screen-wide red flash */}
      <motion.div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(244,63,94,0.22)",
          pointerEvents: "none",
          zIndex: 9997,
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{
          duration: DURATION_MS / 1000,
          times: [0, 0.045, 0.946, 1],
          ease: "easeOut",
        }}
      />

      {/* Radial glow burst behind the stamp */}
      <motion.div
        style={{
          position: "fixed",
          inset: 0,
          background:
            "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(244,63,94,0.30) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 9998,
        }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{
          opacity: [0, 1, 1, 0],
          scale:   [0.6, 1.1, 1.05, 1.2],
        }}
        transition={{
          duration: DURATION_MS / 1000,
          times: [0, 0.045, 0.946, 1],
          ease: ["backOut", "linear", "easeIn"],
        }}
      />

      {/* Centre stamp — shakes on entry */}
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
            backgroundColor: "rgba(76,5,25,0.85)",
            border: "3px solid rgba(251,113,133,1)",
            borderRadius: "1.5rem",
            paddingLeft: "3.5rem",
            paddingRight: "3.5rem",
            paddingTop: "1.75rem",
            paddingBottom: "1.75rem",
            color: "rgba(255,241,242,1)",
            fontSize: "3rem",
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            textShadow: "0 0 32px rgba(251,113,133,0.9), 0 2px 8px rgba(0,0,0,0.6)",
            boxShadow:
              "0 0 60px rgba(244,63,94,0.3), inset 0 1px 0 rgba(255,255,255,0.08)",
            whiteSpace: "nowrap",
            userSelect: "none",
            willChange: "transform, opacity",
          }}
          initial={{ scale: 2.2, opacity: 0, x: 0, y: 0 }}
          animate={{
            scale:   [2.2,  1,     1,      1,      1,     1,     1,    0.9],
            opacity: [0,    1,     1,      1,      1,     1,     1,    0  ],
            x:       [0,    0,    -18,    18,    -14,    14,    0,    0  ],
            y:       [0,    0,     0,      0,      0,     0,     0,   -24],
          }}
          transition={{
            duration: DURATION_MS / 1000,
            // shake runs 250ms–900ms (absolute); normalised to 5550ms total
            // t=0ms(0), 250ms(0.045), 395ms(0.071), 541ms(0.097), 661ms(0.119), 781ms(0.141), 900ms(0.162), 5550ms(1)
            times: [0, 0.045, 0.071, 0.097, 0.119, 0.141, 0.162, 1],
            ease: ["backOut", "linear", "linear", "linear", "linear", "linear", "easeIn"],
          }}
        >
          ✗ WRONG
        </motion.div>
      </div>
    </>
  );
}