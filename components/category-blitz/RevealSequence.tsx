"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import GradingCascade, { type GradingAnswer } from "@/components/category-blitz/GradingCascade";
import LiveLeaderboard from "@/components/category-blitz/LiveLeaderboard";
import { EASE_SNAP } from "@/lib/motionEasing";
import type { CategoryBlitzRoundResults } from "@/types";

const TEXT_LABEL = "text-emerald-300 tracking-[0.14em] uppercase font-black text-xs";

// How long to let the leaderboard play its count-up / reorder / +N flash after
// the guided scroll before settling into the resting intermission. The resting
// screen shows the same (settled) leaderboard, so settling promptly just brings
// the next-round countdown into view — no content disappears.
const LEADERBOARD_HOLD_MS = 2200;
const LEADERBOARD_HOLD_REDUCED_MS = 500;

// Absolute safety net: if the cascade's onComplete or any beat callback never
// fires (stalled animation, dropped timer), force the settle so the viewer is
// never stranded in the "reveal" phase. Generous enough not to clip a normal
// run (worst case ≈ full cascade + scroll + leaderboard hold ≈ 10s).
const MAX_SEQUENCE_MS = 16_000;

// Deliberate full-screen pacing for beat 1. Scale the per-row step to the answer
// count so a short list and a full 12 both feel unhurried but never sluggish.
const REVEAL_TARGET_TOTAL_MS = 3600;
const REVEAL_STEP_MIN_MS = 280;
const REVEAL_STEP_MAX_MS = 600;
const REVEAL_FIRST_DELAY_MS = 500;

interface RevealSequenceProps {
  answers: GradingAnswer[];
  leaderboardEntries: CategoryBlitzRoundResults["totals"];
  meId: string;
  /** The round these results belong to — passed back through onSettled. */
  roundId: string;
  /** Called once the whole reveal journey has settled; advances to "results". */
  onSettled: (roundId: string) => void;
}

/**
 * Phase 4 — the single-column vertical reveal journey for one scored round.
 *
 * Beat 1: the viewer's answers grade in on a full-screen GradingCascade.
 * Beat 2: when the cascade finishes, we smooth-scroll down to the leaderboard.
 * Beat 3: the leaderboard plays its rank-change animation (count-up / reorder /
 *         +N flash — all already built into LiveLeaderboard).
 * Beat 4: after a short hold, onSettled fires and the hook flips to the resting
 *         "results" intermission (countdown + settled leaderboard).
 *
 * Every beat is backed by a fallback timer so a missed callback can never
 * strand the viewer in "reveal" (see MAX_SEQUENCE_MS and the hold timer).
 */
const RevealSequence = ({ answers, leaderboardEntries, meId, roundId, onSettled }: RevealSequenceProps) => {
  const reduce = useReducedMotion() ?? false;
  const [stage, setStage] = useState<"revealing" | "leaderboard">("revealing");
  const leaderboardRef = useRef<HTMLDivElement>(null);
  const settledRef = useRef(false);

  const settle = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    onSettled(roundId);
  }, [onSettled, roundId]);

  const { firstDelayMs, stepMs } = useMemo(() => {
    if (reduce) return { firstDelayMs: 0, stepMs: 60 };
    const count = Math.max(1, answers.length);
    const step = Math.min(REVEAL_STEP_MAX_MS, Math.max(REVEAL_STEP_MIN_MS, Math.round(REVEAL_TARGET_TOTAL_MS / count)));
    return { firstDelayMs: REVEAL_FIRST_DELAY_MS, stepMs: step };
  }, [reduce, answers.length]);

  // Beat 1 → 2: the cascade finished revealing every row.
  const handleCascadeComplete = useCallback(() => {
    setStage("leaderboard");
  }, []);

  // Beat 2 → 3 → 4: guide the scroll to the leaderboard, let it animate, then
  // settle into the resting intermission.
  useEffect(() => {
    if (stage !== "leaderboard") return;
    leaderboardRef.current?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    });
    const hold = reduce ? LEADERBOARD_HOLD_REDUCED_MS : LEADERBOARD_HOLD_MS;
    const id = window.setTimeout(settle, hold);
    return () => window.clearTimeout(id);
  }, [stage, reduce, settle]);

  // Global safety net — never leave the viewer stuck mid-reveal.
  useEffect(() => {
    const id = window.setTimeout(settle, MAX_SEQUENCE_MS);
    return () => window.clearTimeout(id);
  }, [settle]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* Beat 1 — full-screen answer reveal */}
      <section className="flex min-h-full shrink-0 flex-col justify-center py-6">
        <p className={`${TEXT_LABEL} mx-auto mb-3 w-full max-w-sm px-3 text-center`}>Your answers</p>
        <GradingCascade
          answers={answers}
          onComplete={handleCascadeComplete}
          firstDelayMs={firstDelayMs}
          stepMs={stepMs}
        />
      </section>

      {/* Beats 3–4 — leaderboard, mounted (and thus animated) only once we
          reach it, so its entrance/count-up plays in view rather than off
          the bottom of the screen. */}
      <section ref={leaderboardRef} className="flex min-h-full shrink-0 flex-col justify-center py-6">
        {stage === "leaderboard" && (
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: EASE_SNAP }}
          >
            <p className={`${TEXT_LABEL} mx-auto mb-3 w-full max-w-sm px-3 text-center`}>Leaderboard</p>
            <LiveLeaderboard entries={leaderboardEntries} meId={meId} />
          </motion.div>
        )}
      </section>
    </div>
  );
};

export default RevealSequence;
