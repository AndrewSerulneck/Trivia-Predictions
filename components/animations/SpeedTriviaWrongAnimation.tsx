"use client";

import { useEffect, useRef } from "react";
import { motion, useAnimationControls } from "framer-motion";
import type { GameplayAnimationProps } from "@/types/animation";

// ─── Root component ───────────────────────────────────────────────────────────

export function SpeedTriviaWrongAnimation({ onComplete }: GameplayAnimationProps) {
  const cancelledRef   = useRef<boolean>(false);
  const holdTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lifecycleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const badgeControls = useAnimationControls();
  const shakeControls = useAnimationControls();

  useEffect(() => {
    // ── Badge: spring in → hold 600ms → spring out ──────────────────────────
    void (async (): Promise<void> => {
      await badgeControls.start({
        scale:   1.0,
        opacity: 1,
        transition: {
          type:      "spring",
          stiffness: 600,
          damping:   20,
        },
      });

      await new Promise<void>((resolve) => {
        holdTimerRef.current = setTimeout(resolve, 600);
      });

      if (cancelledRef.current) return;

      await badgeControls.start({
        scale:   0.8,
        opacity: 0,
        transition: {
          type:      "spring",
          stiffness: 400,
          damping:   28,
        },
      });
    })();

    // ── Shake ring: sequence of x translations over 350ms ───────────────────
    void shakeControls.start({
      x: [0, -12, 12, -8, 8, -4, 4, 0],
      transition: {
        duration: 0.35,
        ease:     "linear",
        times:    [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1.0],
      },
    });

    // ── Lifecycle ────────────────────────────────────────────────────────────
    lifecycleTimer.current = setTimeout(() => {
      if (!cancelledRef.current) onComplete();
    }, 1000);

    return () => {
      cancelledRef.current = true;
      if (holdTimerRef.current   !== null) clearTimeout(holdTimerRef.current);
      if (lifecycleTimer.current !== null) clearTimeout(lifecycleTimer.current);
      badgeControls.stop();
      shakeControls.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* ── LAYER 1: Full-screen flash pulse ──────────────────────────────────── */}
      <motion.div
        className="pointer-events-none fixed inset-0 bg-rose-500/30"
        style={{ willChange: "opacity" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.7, 0] }}
        transition={{
          duration: 0.4,
          times:    [0, 0.15, 1],
          ease:     "easeOut",
        }}
      />

      {/* ── LAYER 2: "✗ Wrong" stamp badge ────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <motion.div
          animate={badgeControls}
          initial={{ scale: 1.4, opacity: 0 }}
          className="rounded-[20px] border border-[#fb7185]/70 bg-rose-500/20 px-8 py-4 text-2xl font-black uppercase tracking-[0.12em] text-rose-100 shadow-[0_0_60px_rgba(251,113,133,0.45)]"
          style={{ willChange: "transform, opacity" }}
        >
          ✗ Wrong
        </motion.div>
      </div>

      {/* ── LAYER 3: Answer-area shake ring ───────────────────────────────────── */}
      {/* Wrapper positions the ring at viewport center-x, 55% from top */}
      <div
        className="pointer-events-none fixed inset-x-0"
        style={{ top: "55%", display: "flex", justifyContent: "center" }}
      >
        <motion.div
          animate={shakeControls}
          className="h-[180px] w-[340px] rounded-3xl border-2 border-rose-500/35 opacity-50"
          style={{
            willChange:  "transform",
            // Pull up by half own height so the ring centres on the 55% line
            translateY:  "-50%",
          }}
        />
      </div>
    </>
  )
}