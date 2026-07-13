"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import GradingCascade, { type GradingAnswer } from "@/components/category-blitz/GradingCascade";
import LiveLeaderboard from "@/components/category-blitz/LiveLeaderboard";
import IntermissionStatus from "@/components/category-blitz/IntermissionStatus";
import { GAME_THEME } from "@/lib/themeTokens";
import { MODE_CONFIG } from "@/lib/categoryBlitzModes";
import type { CategoryBlitzRoundResults } from "@/types";

// How long to let the leaderboard play its count-up / reorder / +N flash after
// it pushes the cascade down before settling into the resting intermission.
// The resting screen shows the same (settled) leaderboard, so settling
// promptly just brings the next-round countdown into view — no content
// disappears.
const LEADERBOARD_HOLD_MS = 2200;
const LEADERBOARD_HOLD_REDUCED_MS = 500;

// Spring used to push the previous round's answers down the page as the
// leaderboard + countdown drop in above them — a little overshoot so the
// push reads as a lively "thud" rather than a linear slide.
const PUSH_SPRING = { type: "spring" as const, stiffness: 300, damping: 24, mass: 0.9 };

// Absolute safety net: if the cascade's onComplete or any beat callback never
// fires (stalled animation, dropped timer), force the settle so the viewer is
// never stranded in the "reveal" phase. Generous enough not to clip a normal
// run (worst case ≈ full cascade + push-down spring + leaderboard hold ≈ 7s).
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
  /** Next-round countdown, folded into the push-down beat alongside the
   *  leaderboard so both drop in together. */
  nextRoundStartsIn: number | null;
}

/**
 * Phase 4 — the single-column vertical reveal journey for one scored round.
 *
 * Beat 1: the viewer's answers grade in on a full-screen GradingCascade.
 * Beat 2: when the cascade finishes, the leaderboard + "next round starts in"
 *         card drop in above it with a spring, pushing the graded answers
 *         down the page via layout reflow — nothing is covered or removed,
 *         the viewer can still scroll down to review them.
 * Beat 3: the leaderboard plays its rank-change animation (count-up / reorder /
 *         +N flash — all already built into LiveLeaderboard).
 * Beat 4: after a short hold, onSettled fires and the hook flips to the resting
 *         "results" intermission (countdown + settled leaderboard).
 *
 * Every beat is backed by a fallback timer so a missed callback can never
 * strand the viewer in "reveal" (see MAX_SEQUENCE_MS and the hold timer).
 */
const RevealSequence = ({ answers, leaderboardEntries, meId, roundId, onSettled, nextRoundStartsIn }: RevealSequenceProps) => {
  const reduce = useReducedMotion() ?? false;
  // Every answer in the batch shares the same round, so the first one's mode
  // (default "standard" if the batch is empty) is the round's mode.
  const theme = GAME_THEME[MODE_CONFIG[answers[0]?.mode ?? "standard"].themeKey];
  const [stage, setStage] = useState<"revealing" | "leaderboard">("revealing");
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

  // Beat 2 → 3 → 4: let the push-down + leaderboard animation play, then
  // settle into the resting intermission. The leaderboard mounts at the top
  // of the (unscrolled) container, so it lands in view on its own — no
  // scrollIntoView needed, and the viewer stays free to scroll up/down.
  useEffect(() => {
    if (stage !== "leaderboard") return;
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
      {/* Beats 2–4 — leaderboard + next-round countdown, mounted above the
          cascade only once it finishes, so they drop in with a spring and
          push the graded answers down via layout reflow. Nothing is removed
          or covered — the viewer can still scroll down to the answers. */}
      <AnimatePresence initial={false}>
        {stage === "leaderboard" && (
          <motion.section
            key="leaderboard"
            layout
            initial={reduce ? false : { opacity: 0, y: -60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0.15 } : PUSH_SPRING}
            className="shrink-0 px-3 py-6"
          >
            <div className="mx-auto mb-4 w-full max-w-sm">
              <IntermissionStatus nextRoundStartsIn={nextRoundStartsIn} compact />
            </div>
            <p className={`${theme.textLabel} mx-auto mb-3 w-full max-w-sm text-center`}>Leaderboard</p>
            <LiveLeaderboard entries={leaderboardEntries} meId={meId} />
          </motion.section>
        )}
      </AnimatePresence>

      {/* Beat 1 — full-screen answer reveal. `layout` lets this section
          animate its reflow (in sync with the leaderboard's spring above)
          when it gets pushed down instead of jumping instantly. */}
      <motion.section layout transition={reduce ? { duration: 0 } : PUSH_SPRING} className="flex min-h-full shrink-0 flex-col justify-center py-6">
        <p className={`${theme.textLabel} mx-auto mb-3 w-full max-w-sm px-3 text-center`}>Your answers</p>
        <GradingCascade
          answers={answers}
          onComplete={handleCascadeComplete}
          firstDelayMs={firstDelayMs}
          stepMs={stepMs}
        />
      </motion.section>
    </div>
  );
};

export default RevealSequence;
