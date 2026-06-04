"use client";

import { useEffect, useRef, useState } from "react";
import { motion, animate, useAnimationControls } from "framer-motion";
import type { GameplayAnimationProps } from "@/types/animation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InputRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// ─── Root component ───────────────────────────────────────────────────────────

export function LiveTriviaWrongAnimation({ onComplete, payload }: GameplayAnimationProps) {
  const cancelledRef = useRef<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The input is captured at trigger time (before it unmounts on phase change)
  // and passed in via payload. null means it was unavailable, so Layer 1 is
  // skipped gracefully.
  const sourceRect = payload?.inputRect ?? null;
  const [inputRect] = useState<InputRect | null>(() =>
    sourceRect === null
      ? null
      : {
          left: sourceRect.left,
          top: sourceRect.top,
          width: sourceRect.width,
          height: sourceRect.height,
        }
  );

  // ─── Mount effect: schedule onComplete ──────────────────────────────────────
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      if (!cancelledRef.current) {
        onComplete();
      }
    }, 1100);

    return () => {
      cancelledRef.current = true;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* ── LAYER 1: Shake ring anchored to the input field ─────────────────── */}
      {inputRect !== null && <ShakeRing inputRect={inputRect} />}

      {/* ── LAYER 2: Full-screen rose flash ─────────────────────────────────── */}
      <ScreenFlash />

      {/* ── LAYER 3: "✗ WRONG" stamp at screen centre ───────────────────────── */}
      <WrongStamp />
    </>
  );
}

// ─── Layer 1: Shake ring ──────────────────────────────────────────────────────

interface ShakeRingProps {
  inputRect: InputRect;
}

function ShakeRing({ inputRect }: ShakeRingProps) {
  const controls = useAnimationControls();
  const ringRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Phase 1 — horizontal shake (450ms)
    const runSequence = async (): Promise<void> => {
      await controls.start({
        x: [0, -14, 14, -10, 10, -6, 6, -3, 3, 0],
        transition: {
          duration: 0.45,
          ease: "linear",
          times: [0, 0.08, 0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.78, 1.0],
        },
      });

      // Phase 2 — pulse glow (500ms) after shake settles
      const el = ringRef.current;
      if (el !== null) {
        animate(
          el,
          {
            boxShadow: [
              "0px 0px 0px 0px rgba(251,113,133,0)",
              "0px 0px 0px 10px rgba(251,113,133,0.5)",
              "0px 0px 0px 0px rgba(251,113,133,0)",
            ],
          },
          {
            duration: 0.5,
            ease: "easeInOut",
          }
        );
      }
    };

    void runSequence();
  // controls identity is stable; no deps needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      ref={ringRef}
      animate={controls}
      style={{
        position: "fixed",
        left: inputRect.left,
        top: inputRect.top,
        width: inputRect.width,
        height: inputRect.height,
        borderRadius: "0.75rem",                      // rounded-xl
        border: "2px solid rgba(251,113,133,0.8)",    // rose-400/80
        pointerEvents: "none",
        willChange: "transform",
        zIndex: 9998,
      }}
    />
  );
}

// ─── Layer 2: Screen flash ────────────────────────────────────────────────────

function ScreenFlash() {
  return (
    <motion.div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(244,63,94,0.20)",  // rose-500/20
        pointerEvents: "none",
        willChange: "opacity",
        zIndex: 9999,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0.6, 0] }}
      transition={{
        duration: 0.6,
        times: [0, 0.1, 1],
        ease: "easeOut",
      }}
    />
  );
}

// ─── Layer 3: "✗ WRONG" stamp ─────────────────────────────────────────────────

function WrongStamp() {
  return (
    // Outer wrapper: full-screen centering, no opacity of its own
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
      {/*
        Inner pill: spring pop-in (scale 1.5→1, opacity 0→1, 220ms)
        Hold 600ms (total 820ms / 1100ms = 0.745 of duration)
        Exit: y −30, opacity 0, 250ms ease-in (820ms→1100ms)
      */}
      <motion.div
        style={{
          backgroundColor: "rgba(244,63,94,0.25)",   // rose-500/25
          border: "2px solid rgba(251,113,133,0.8)", // rose-400/80
          borderRadius: "1rem",                       // rounded-2xl
          paddingLeft: "2.5rem",
          paddingRight: "2.5rem",
          paddingTop: "1.25rem",
          paddingBottom: "1.25rem",
          color: "rgba(255,241,242,1)",               // rose-100
          fontSize: "2.25rem",                        // text-4xl
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          willChange: "transform, opacity",
          userSelect: "none",
        }}
        // Keyframe map:
        //   t=0ms    (0.000): scale 1.5, y 0,   opacity 0   — initial
        //   t=220ms  (0.200): scale 1.0, y 0,   opacity 1   — enter complete
        //   t=820ms  (0.745): scale 1.0, y 0,   opacity 1   — hold complete
        //   t=1100ms (1.000): scale 1.0, y -30, opacity 0   — exit complete
        initial={{ scale: 1.5, y: 0, opacity: 0 }}
        animate={{
          scale:   [1.5, 1,   1,   1  ],
          y:       [0,   0,   0,   -30],
          opacity: [0,   1,   1,   0  ],
        }}
        transition={{
          duration: 1.1,
          times: [0, 0.2, 0.745, 1],
          scale: {
            ease: ["backOut", "linear", "linear"],
          },
          y: {
            ease: ["linear", "linear", "easeIn"],
          },
          opacity: {
            ease: ["easeOut", "linear", "easeIn"],
          },
        }}
      >
        ✗ WRONG
      </motion.div>
    </div>
  )
}