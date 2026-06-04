"use client";

import { useEffect, useRef, useState } from "react";
import { motion, animate } from "framer-motion";
import type { GameplayAnimationProps } from "@/types/animation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InputRect {
  left: number;
  top: number;
  width: number;
  height: number;
  centerX: number;
}

// ─── Root component ───────────────────────────────────────────────────────────

export function LiveTriviaCorrectAnimation({ onComplete }: GameplayAnimationProps) {
  const cancelledRef = useRef<boolean>(false);
  const timer1Ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  // State (not ref) so that setting it after DOM read triggers a render,
  // letting Layer 1 and Layer 2 mount with correct positions.
  const [inputRect, setInputRect] = useState<InputRect | null>(null);

  // Ref to the glow overlay div; used for imperative box-shadow animation.
  // Attached after inputRect is set (second render).
  const glowDivRef = useRef<HTMLDivElement | null>(null);

  // ─── Mount effect: read DOM, start glow animation, schedule onComplete ──────
  useEffect(() => {
    if (typeof document === "undefined") return;

    const input = document.querySelector<HTMLInputElement>(
      'input[placeholder="Type your answer..."]'
    );

    if (input !== null) {
      const rect = input.getBoundingClientRect();
      setInputRect({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        centerX: rect.left + rect.width / 2,
      });
    }

    // Schedule onComplete at end of total lifecycle
    timer1Ref.current = setTimeout(() => {
      if (!cancelledRef.current) {
        onComplete();
      }
    }, 1200);

    return () => {
      cancelledRef.current = true;
      if (timer1Ref.current !== null) clearTimeout(timer1Ref.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Glow animation fires once the glowDiv is mounted (inputRect set) ───────
  useEffect(() => {
    const glowEl = glowDivRef.current;
    if (glowEl === null || inputRect === null) return;

    animate(
      glowEl,
      {
        boxShadow: [
          "0px 0px 0px 0px rgba(52,211,153,0)",
          "0px 0px 0px 8px rgba(52,211,153,0.6)",
          "0px 0px 0px 16px rgba(52,211,153,0)",
        ],
      },
      {
        duration: 0.8,
        ease: "easeInOut",
      }
    );
  }, [inputRect]);

  return (
    <>
      {/* ── LAYER 1: Input border glow overlay ──────────────────────────────── */}
      {inputRect !== null && (
        <div
          ref={glowDivRef}
          style={{
            position: "fixed",
            left: inputRect.left,
            top: inputRect.top,
            width: inputRect.width,
            height: inputRect.height,
            borderRadius: "0.75rem",                 // rounded-xl (12px)
            border: "2px solid rgba(52,211,153,1)",  // emerald-400
            pointerEvents: "none",
            willChange: "box-shadow",
            zIndex: 9998,
          }}
        />
      )}

      {/* ── LAYER 2: "+10" counter floating up from input origin ────────────── */}
      {inputRect !== null && <FloatingCounter inputRect={inputRect} />}

      {/* ── LAYER 3: "RIGHT" stamp centred on screen ────────────────────────── */}
      <RightStamp />
    </>
  );
}

// ─── Layer 2: Floating +10 counter ───────────────────────────────────────────

interface FloatingCounterProps {
  inputRect: InputRect;
}

function FloatingCounter({ inputRect }: FloatingCounterProps) {
  return (
    <motion.div
      style={{
        position: "fixed",
        // Centre horizontally on the input field
        left: inputRect.centerX,
        // Sit 20px above the top edge of the input
        top: inputRect.top - 20,
        // Pull back the natural left offset so text is centred
        x: "-50%",
        pointerEvents: "none",
        willChange: "transform, opacity",
        zIndex: 9999,
        color: "#34d399",
        fontWeight: 900,
        fontSize: "52px",
        lineHeight: 1,
        textShadow: "0 0 24px rgba(52,211,153,0.9)",
        whiteSpace: "nowrap",
        userSelect: "none",
      }}
      initial={{ y: 0, opacity: 0 }}
      animate={{
        y: [0, -45, -90],
        opacity: [0, 1, 0],
      }}
      transition={{
        duration: 0.9,
        ease: [0.22, 1, 0.36, 1],
        times: [0, 0.5, 1],
      }}
    >
      +10
    </motion.div>
  );
}

// ─── Layer 3: "RIGHT" stamp ───────────────────────────────────────────────────

function RightStamp() {
  return (
    // Full-screen centering wrapper — fades the whole stamp out at the end
    <motion.div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 10000,
      }}
      // Wrapper handles only the exit fade so the inner pill doesn't double-fade
      initial={{ opacity: 1 }}
      animate={{ opacity: [1, 1, 0] }}
      transition={{
        duration: 1.2,
        times: [0, 0.792, 1],   // hold until 950ms (0.792×1200ms), then exit
        ease: "easeIn",
      }}
    >
      {/* Pill: scale pop-in → hold → slight shrink on exit */}
      <motion.div
        style={{
          backgroundColor: "rgba(16,185,129,0.25)",  // emerald-500/25
          border: "2px solid rgba(52,211,153,0.8)",   // emerald-400/80
          borderRadius: "1rem",                        // rounded-2xl (16px)
          paddingLeft: "2.5rem",
          paddingRight: "2.5rem",
          paddingTop: "1.25rem",
          paddingBottom: "1.25rem",
          color: "rgba(236,253,245,1)",                // emerald-100
          fontSize: "2.25rem",                         // text-4xl
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          willChange: "transform, opacity",
          userSelect: "none",
        }}
        // scale: spring-pop enter (1.6→1), hold, gentle shrink exit (1→0.85)
        initial={{ scale: 1.6, opacity: 0 }}
        animate={{
          scale:   [1.6, 1,   1,    0.85],
          opacity: [0,   1,   1,    0   ],
        }}
        transition={{
          duration: 1.2,
          // keyframe timing: 0ms, 200ms, 950ms, 1200ms → normalised
          times: [0, 0.167, 0.792, 1],
          scale: {
            ease: ["backOut", "linear", "easeIn"],
          },
          opacity: {
            ease: ["easeOut", "linear", "easeIn"],
          },
        }}
      >
        ✓ RIGHT
      </motion.div>
    </motion.div>
  );
}