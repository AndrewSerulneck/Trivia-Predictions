"use client";

import { useEffect, useInsertionEffect, useRef } from "react";
import { motion, animate, useAnimationControls } from "framer-motion";
import type { GameplayAnimationProps } from "@/types/animation";

// ─── CSS keyframe injection (shimmer sweep) ───────────────────────────────────

const SHIMMER_STYLE_ID = "bnw-shimmer-keyframes";
let shimmerInjected    = false;

function injectShimmerKeyframes(): void {
  if (shimmerInjected) return;
  if (typeof document === "undefined") return;
  if (document.getElementById(SHIMMER_STYLE_ID) !== null) {
    shimmerInjected = true;
    return;
  }
  const style = document.createElement("style");
  style.id    = SHIMMER_STYLE_ID;
  style.textContent = `
    @keyframes bnw-shimmer-sweep {
      0%   { background-position: 200% 0%; }
      100% { background-position: -200% 0%; }
    }
  `;
  document.head.appendChild(style);
  shimmerInjected = true;
}

// ─── Root component ───────────────────────────────────────────────────────────

export function BingoNearWinAnimation({ onComplete }: GameplayAnimationProps) {
  const cancelledRef    = useRef<boolean>(false);
  const badgeTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lifecycleTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs to the border-glow and badge DOM elements for imperative animations
  const borderRef = useRef<HTMLDivElement | null>(null);
  const badgeControls = useAnimationControls();

  // Inject shimmer keyframes synchronously before first paint
  useInsertionEffect(() => {
    injectShimmerKeyframes();
  }, []);

  useEffect(() => {
    // ── Layer 1: Amber border glow pulse (imperative boxShadow, 1800ms) ──────
    const borderEl = borderRef.current;
    if (borderEl !== null) {
      animate(
        borderEl,
        {
          boxShadow: [
            "inset 0 0 0px 0px rgba(251,191,36,0)",
            "inset 0 0 60px 20px rgba(251,191,36,0.4)",
            "inset 0 0 0px 0px rgba(251,191,36,0)",
          ],
        },
        {
          duration: 1.8,
          times:    [0, 0.4, 1],
          ease:     "easeInOut",
        }
      );
    }

    // ── Layer 2: Badge enters at 200ms, pulses, then exits at 1600ms ──────────
    badgeTimerRef.current = setTimeout(() => {
      if (cancelledRef.current) return;

      void (async (): Promise<void> => {
        // Spring entrance
        await badgeControls.start({
          opacity: 1,
          scale:   1,
          transition: {
            type:      "spring",
            stiffness: 320,
            damping:   30,
          },
        });

        if (cancelledRef.current) return;

        // Pulse: scale 1.0 → 1.05 → 1.0, repeat once (2 cycles total = ~1600ms)
        await badgeControls.start({
          scale: [1, 1.05, 1],
          transition: {
            repeat:   1,
            duration: 0.8,
            ease:     "easeInOut",
          },
        });

        if (cancelledRef.current) return;

        // Exit: fade up
        await badgeControls.start({
          opacity: 0,
          y:       -20,
          transition: { duration: 0.2, ease: "easeIn" },
        });
      })();
    }, 200);

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    lifecycleTimer.current = setTimeout(() => {
      if (!cancelledRef.current) onComplete();
    }, 1800);

    return () => {
      cancelledRef.current = true;
      if (badgeTimerRef.current  !== null) clearTimeout(badgeTimerRef.current);
      if (lifecycleTimer.current !== null) clearTimeout(lifecycleTimer.current);
      badgeControls.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* ── LAYER 1: Amber edge border glow (inset box-shadow pulse) ──────────── */}
      <div
        ref={borderRef}
        className="pointer-events-none fixed inset-0"
        style={{ willChange: "box-shadow" }}
      />

      {/* ── LAYER 2: "⚡ One More!" badge ─────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-x-0 flex justify-center" style={{ top: "35%" }}>
        <motion.div
          animate={badgeControls}
          // Hidden and slightly small before the 200ms entry
          initial={{ opacity: 0, scale: 0.85, y: 0 }}
          className="rounded-xl border border-amber-400/60 bg-amber-500/20 px-6 py-3 text-xl font-black uppercase tracking-[0.14em] text-amber-100"
          style={{ willChange: "transform, opacity" }}
        >
          ⚡ One More!
        </motion.div>
      </div>

      {/* ── LAYER 3: CSS shimmer sweep (background-position animation) ────────── */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:              "linear-gradient(135deg, transparent 40%, rgba(251,191,36,0.07) 50%, transparent 60%)",
          backgroundSize:          "300% 300%",
          animationName:           "bnw-shimmer-sweep",
          animationDuration:       "1800ms",
          animationTimingFunction: "linear",
          animationFillMode:       "forwards",
          animationIterationCount: 1,
        }}
      />
    </>
  );
}