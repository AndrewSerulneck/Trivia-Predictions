"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import type { GameplayAnimationProps } from "@/types/animation";

// TriviaGame sets this before calling triggerAnimation("SPEED_TRIVIA_ROUND_COMPLETE"):
//   (window as Record<string, unknown>).__triviaRoundStats = { correctCount, attempted, pointsWon };
declare global {
  interface Window {
    __triviaRoundStats?: { correctCount: number; attempted: number; pointsWon: number };
  }
}

// ─── Extended props (kept for potential direct use; window globals take priority) ─

type SpeedTriviaRoundCompleteProps = GameplayAnimationProps & {
  correctCount?: number;
  attempted?:    number;
  pointsWon?:    number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const RAY_COUNT  = 12;
const RAY_COLORS = ["#facc15", "#84cc16"] as const;

// ─── Framer Motion variants ───────────────────────────────────────────────────

// Card orchestrates stagger of its children via delayChildren + staggerChildren.
// The card itself springs in; after it settles the stat lines cascade in.
const cardVariants = {
  hidden: {
    y:       80,
    opacity: 0,
  },
  visible: {
    y:       0,
    opacity: 1,
    transition: {
      type:            "spring" as const,
      stiffness:       380,
      damping:         28,
      delayChildren:   0.3,   // wait 300ms after card enters before first stat
      staggerChildren: 0.15,  // 150ms between each stat line
    },
  },
  exit: {
    y:       -40,
    opacity: 0,
    transition: {
      duration: 0.3,
      ease:     "easeIn" as const,
    },
  },
} as const;

// Each stat line rises from y:10 and fades in
const statLineVariants = {
  hidden: {
    y:       10,
    opacity: 0,
  },
  visible: {
    y:       0,
    opacity: 1,
    transition: {
      type:      "spring" as const,
      stiffness: 400,
      damping:   32,
    },
  },
} as const;

// ─── Root component ───────────────────────────────────────────────────────────

export function SpeedTriviaRoundCompleteAnimation({
  onComplete,
  correctCount: correctCountProp = 0,
  attempted: attemptedProp       = 15,
  pointsWon: pointsWonProp       = 0,
}: SpeedTriviaRoundCompleteProps) {
  // Prefer window globals (set by TriviaGame before triggering) over prop defaults,
  // since the registry can only pass onComplete.
  const [correctCount] = useState<number>(() =>
    typeof window !== "undefined" ? (window.__triviaRoundStats?.correctCount ?? correctCountProp) : correctCountProp
  );
  const [attempted] = useState<number>(() =>
    typeof window !== "undefined" ? (window.__triviaRoundStats?.attempted ?? attemptedProp) : attemptedProp
  );
  const [pointsWon] = useState<number>(() =>
    typeof window !== "undefined" ? (window.__triviaRoundStats?.pointsWon ?? pointsWonProp) : pointsWonProp
  );
  const cancelledRef   = useRef<boolean>(false);
  const exitTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lifecycleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // useAnimationControls is compatible with variant name strings,
  // so we can trigger "visible" on mount and "exit" at 1000ms
  // while the declarative variant system handles staggerChildren.
  const cardControls = useAnimationControls();

  useEffect(() => {
    // Phase 2: entrance — triggers staggered children via variant propagation
    void cardControls.start("visible");

    // Phase 3: exit at 1000ms
    exitTimerRef.current = setTimeout(() => {
      if (!cancelledRef.current) {
        void cardControls.start("exit");
      }
    }, 1000);

    // Call onComplete at 1400ms (300ms after exit begins)
    lifecycleTimer.current = setTimeout(() => {
      if (!cancelledRef.current) onComplete();
    }, 1400);

    return () => {
      cancelledRef.current = true;
      if (exitTimerRef.current   !== null) clearTimeout(exitTimerRef.current);
      if (lifecycleTimer.current !== null) clearTimeout(lifecycleTimer.current);
      cardControls.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* ── PHASE 1: Radial burst rays (0–400ms) ──────────────────────────────── */}
      <RadialBurst />

      {/* ── PHASE 2 + 3: Stats card (200–1400ms) ─────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate={cardControls}
          className="w-full max-w-[320px] rounded-2xl border border-[rgba(250,204,21,0.5)] bg-[#0f0f17] px-8 py-6"
          style={{ willChange: "transform, opacity" }}
        >
          {/* Stat line 1: accuracy */}
          <motion.p
            variants={statLineVariants}
            className="mb-2 text-xl font-black text-white"
            style={{ willChange: "transform, opacity" }}
          >
            🎯 {correctCount}/{attempted} Correct
          </motion.p>

          {/* Stat line 2: points */}
          <motion.p
            variants={statLineVariants}
            className="mb-2 text-3xl font-black text-[#facc15]"
            style={{ willChange: "transform, opacity" }}
          >
            +{pointsWon} pts
          </motion.p>

          {/* Stat line 3: round complete label */}
          <motion.p
            variants={statLineVariants}
            className="text-sm uppercase tracking-[0.16em] text-[#84cc16]"
            style={{ willChange: "transform, opacity" }}
          >
            Round Complete 🎉
          </motion.p>
        </motion.div>
      </div>
    </>
  );
}

// ─── Phase 1: Radial burst rays ───────────────────────────────────────────────

function RadialBurst() {
  return (
    <div
      className="pointer-events-none fixed inset-0 flex items-center justify-center"
      aria-hidden="true"
    >
      {Array.from({ length: RAY_COUNT }, (_, i) => {
        const angleDeg = (360 / RAY_COUNT) * i;
        // Height cycles through 40 / 55 / 70 px across the 12 rays
        const height   = 40 + (i % 3) * 15;
        const color    = RAY_COLORS[i % RAY_COLORS.length];
        const delay    = i * 0.02; // 20ms stagger per ray

        return (
          <motion.div
            key={i}
            initial={{ scaleY: 0, opacity: 0.7 }}
            animate={{ scaleY: 1, opacity: 0 }}
            transition={{
              duration: 0.4,
              delay,
              ease:     "easeOut",
            }}
            style={{
              // Each ray: 2px wide, anchored at bottom, rotated to its angle.
              // translate(-50%, -100%) moves the bottom edge to the flex center
              // point, then rotate fans it outward in the correct direction.
              position:        "absolute",
              width:           "2px",
              height:          `${height}px`,
              backgroundColor: color,
              transformOrigin: "bottom center",
              willChange:      "transform, opacity",
              transform:       `rotate(${angleDeg}deg) translateX(-50%) translateY(-100%)`,
              // CSS custom property for angle — stored per spec requirement
              ["--angle" as string]: `${angleDeg}deg`,
            }}
          />
        );
      })}
    </div>
  );
}