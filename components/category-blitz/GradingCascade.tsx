"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import CorrectBurst from "@/components/category-blitz/CorrectBurst";
import WrongVerdict from "@/components/category-blitz/WrongVerdict";
import { EASE_ACCEL } from "@/lib/motionEasing";

type Verdict =
  | "correct"
  | "duplicate"
  | "wrong_letter"
  | "invalid"
  | "too_obscure"
  | "moderated"
  | "pending"
  | "insufficient_players";

export interface GradingAnswer {
  category: string;
  answer: string | null;
  reason: Verdict;
  explanation?: string;
  points: number;
  /** "reverse" ("Blend In!") cards glow brighter the more players matched — see reverseGlow below. Defaults to "standard". */
  mode?: "standard" | "reverse";
}

/**
 * "Blend In!" (reverse) glow tier for a matched ("correct") answer — brighter
 * the more players hit it (consensus made visible). `points` is exactly the
 * matching-player count (reverseRoundPoints is the identity function), so it
 * doubles as the tier lookup. Mirrors reverseMatchGlow in CategoryBlitzGame's
 * ResultsScreen so the live cascade and the static results card agree.
 */
function reverseGlow(points: number): { card: string; badge: string } {
  if (points >= 5) {
    return {
      card: "border-amber-300/70 bg-fuchsia-900/50 shadow-[0_0_22px_rgba(245,158,11,0.55)]",
      badge: "bg-amber-400/20 text-amber-200 ring-1 ring-amber-300/50",
    };
  }
  if (points >= 3) {
    return {
      card: "border-fuchsia-400/60 bg-fuchsia-900/40 shadow-[0_0_14px_rgba(217,70,239,0.4)]",
      badge: "bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-400/40",
    };
  }
  return {
    card: "border-fuchsia-400/40 bg-fuchsia-950/30",
    badge: "bg-fuchsia-500/15 text-fuchsia-300 ring-1 ring-fuchsia-400/30",
  };
}

interface GradingCascadeProps {
  answers: GradingAnswer[];
  onComplete?: () => void;
  /**
   * When true, every row animates to its exit state instead of "show" — the
   * ENTER half of the intermission transition (results rows accelerate out
   * as the leaderboard snaps in behind them). See
   * docs/category-blitz-scoring-and-bugfix-plan.md Phase 4.
   */
  exiting?: boolean;
  /**
   * Delay before the FIRST row resolves, in ms. Defaults to FIRST_DELAY_MS.
   * RevealSequence passes a larger, deliberate value for the full-screen
   * reveal (Phase 4 beat 1).
   */
  firstDelayMs?: number;
  /**
   * Delay between each subsequent row resolving, in ms. Defaults to STEP_MS.
   * RevealSequence scales this to the answer count so a short and a long
   * answer list both feel unhurried but not sluggish.
   */
  stepMs?: number;
}

const FIRST_DELAY_MS = 450;
const STEP_MS = 200;

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
  exit: { transition: { staggerChildren: 0.03 } },
};

const cardIn: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  exit: { opacity: 0, y: -14, scale: 0.96, transition: { duration: 0.18, ease: EASE_ACCEL } },
};

const RESOLVED: Record<
  Exclude<Verdict, "pending">,
  { card: string; badge: string; label: string }
> = {
  correct: {
    card: "border-emerald-400/40 bg-emerald-500/10",
    badge:
      "bg-[linear-gradient(132deg,#10b981,#22c55e,#14b8a6)] text-emerald-950",
    label: "correct",
  },
  wrong_letter: {
    card: "border-rose-400/40 bg-rose-500/10",
    badge: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30",
    label: "wrong letter",
  },
  invalid: {
    card: "border-rose-400/40 bg-rose-500/10",
    badge: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30",
    label: "invalid",
  },
  duplicate: {
    card: "border-slate-700/60 bg-slate-800/40",
    badge: "bg-slate-700/40 text-slate-300 ring-1 ring-slate-600/40",
    label: "dup",
  },
  // Reverse ("Blend In!") rounds: a safe, on-topic answer nobody else matched —
  // still scores 1. (Phase 5 restyles the reverse reveal in the mode's palette.)
  too_obscure: {
    card: "border-slate-700/60 bg-slate-800/40",
    badge: "bg-slate-700/40 text-slate-300 ring-1 ring-slate-600/40",
    label: "solo",
  },
  // Suppressed from the reveal upstream (buildResults), so this never renders;
  // present only to satisfy the exhaustive Verdict map.
  moderated: {
    card: "border-slate-800 bg-slate-900/50",
    badge: "bg-slate-800/60 text-slate-500 ring-1 ring-slate-700/40",
    label: "—",
  },
  insufficient_players: {
    card: "border-amber-400/40 bg-amber-500/10",
    badge: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30",
    label: "insufficient players",
  },
};

const Check = ({ reduce }: { reduce: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth={3}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {reduce ? (
      <path d="M4 12.5 L9.5 18 L20 6" />
    ) : (
      <motion.path
        d="M4 12.5 L9.5 18 L20 6"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      />
    )}
  </svg>
);

interface RowProps {
  data: GradingAnswer;
  shown: boolean;
  reduce: boolean;
}

const Row = ({ data, shown, reduce }: RowProps) => {
  const resolved = shown && data.reason !== "pending";
  const reason: Verdict = resolved ? data.reason : "pending";
  const isWrong = reason === "wrong_letter" || reason === "invalid";
  const isDup = reason === "duplicate";
  const isCorrect = reason === "correct";
  const isTooObscure = reason === "too_obscure";
  const meta = reason === "pending" ? null : RESOLVED[reason];
  // "Blend In!" matched answers glow brighter the more players hit it —
  // consensus made visible (Phase 5). Only correct answers in a reverse round.
  const glow = isCorrect && data.mode === "reverse" ? reverseGlow(data.points) : null;

  return (
    <motion.li
      variants={cardIn}
      className={`relative overflow-hidden rounded-xl border px-3 py-2.5 transition-colors duration-300 ${
        glow ? glow.card : meta ? meta.card : "border-slate-800 bg-slate-900/50"
      }`}
    >
      {/* Pending: emerald scanline sweeping across, as if being graded. */}
      {!resolved && (
        <span className="tp-scanline motion-reduce:hidden" aria-hidden />
      )}

      {/* Correct: celebratory particle + check burst overlaid on the card. */}
      {isCorrect && <CorrectBurst points={`+${data.points}`} />}

      <div className={resolved ? "tp-verdict-pop" : ""}>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          {data.category}
        </p>

        {isWrong ? (
          // Wrong/invalid: delegate answer + ✕ + explanation typewriter.
          <WrongVerdict
            answer={data.answer ?? "—"}
            explanation={data.explanation ?? ""}
          />
        ) : (
          <div>
            <div className="flex items-start justify-between gap-3">
              <p
                className={`mt-0.5 min-w-0 truncate text-sm font-bold ${
                  isDup
                    ? "text-slate-500 line-through"
                    : resolved
                      ? "text-slate-100"
                      : "text-slate-400"
                }`}
              >
                {data.answer ?? "—"}
              </p>
              <div className="relative shrink-0">
                {reason === "pending" ? (
                  <span
                    className="tp-dot-pulse block h-2 w-2 rounded-full bg-emerald-400"
                    aria-hidden
                  />
                ) : (
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      glow ? glow.badge : meta?.badge ?? ""
                    }`}
                  >
                    {isCorrect && <Check reduce={reduce} />}
                    {glow ? `+${data.points}` : meta?.label}
                  </span>
                )}
              </div>
            </div>
            {(isDup || isTooObscure || (isCorrect && data.mode === "reverse")) && data.explanation && (
              <p className="mt-1 text-[0.65rem] leading-snug text-slate-500">
                {data.explanation}
              </p>
            )}
          </div>
        )}
      </div>

      {/* WrongVerdict announces itself; cover the other states here. */}
      {!isWrong && (
        <span className="sr-only">
          {reason === "pending"
            ? `${data.category}: grading`
            : `${data.category}: ${meta?.label}${
                isCorrect ? `, plus ${data.points} points` : ""
              }`}
        </span>
      )}
    </motion.li>
  );
};

const GradingCascade = ({
  answers,
  onComplete,
  exiting = false,
  firstDelayMs = FIRST_DELAY_MS,
  stepMs = STEP_MS,
}: GradingCascadeProps) => {
  const reduce = useReducedMotion() ?? false;
  const [revealed, setRevealed] = useState(0);
  const doneRef = useRef(false);

  // Advance strictly top-to-bottom; pause on any still-"pending" card so
  // streamed verdicts reveal in order, and auto-cascade a fully-resolved array.
  useEffect(() => {
    if (revealed >= answers.length) return;
    const next = answers[revealed];
    if (!next || next.reason === "pending") return;
    const delay = revealed === 0 ? firstDelayMs : stepMs;
    const id = window.setTimeout(() => setRevealed((n) => n + 1), delay);
    return () => window.clearTimeout(id);
  }, [revealed, answers, firstDelayMs, stepMs]);

  useEffect(() => {
    if (!doneRef.current && answers.length > 0 && revealed >= answers.length) {
      doneRef.current = true;
      onComplete?.();
    }
  }, [revealed, answers.length, onComplete]);

  return (
    <motion.ul
      variants={container}
      initial="hidden"
      animate={exiting ? "exit" : "show"}
      aria-live="polite"
      className="mx-auto flex w-full max-w-sm flex-col gap-2 bg-slate-950 p-3"
    >
      {answers.map((a, i) => (
        <Row
          key={`${a.category}-${i}`}
          data={a}
          shown={i < revealed}
          reduce={reduce}
        />
      ))}
    </motion.ul>
  );
};

export default GradingCascade;
