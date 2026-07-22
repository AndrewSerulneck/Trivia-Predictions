"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AutoScaleToFit } from "@/components/venue-screen/AutoScaleToFit";
import { SCREEN_COLORS, SCREEN_EASE as EASE } from "@/lib/venueScreenBrand";
import { questionType } from "@/lib/tvType";

/* ------------------------------------------------------------------ *
 * <TvAnswerReveal />  — the reveal beat.
 *
 * NOT YET WIRED IN. Built and previewable, but there is nowhere to mount
 * it: `lib/venueScreen.ts` doesn't yet expose a reveal phase, a gated
 * `correctAnswer`, or a hold-duration field for the Live Trivia TV state.
 * Per the scoping note on this prompt, that backend change — and its
 * security-relevant piece (the answer must only ship once answers are
 * locked, or anyone with devtools open on the venue TV sees it early) — is
 * deliberate follow-up work, not a side effect of this UI task.
 *
 * Sits between the question reveal (TvQuestionReveal / Prompt A) and the
 * round-break leaderboard (TvRoundBreak / Prompt B). The question demotes
 * in place, then the answer lands. Keyed on the question, so repeated polls
 * of the same reveal render statically and a new question replays the beat.
 *
 * Continuity note: the demotion is a transform on the question at the SAME
 * type scale <TvQuestionReveal> uses — both now import `questionType` from
 * `lib/tvType.ts` (extracted per the author's own flagged drift risk,
 * rather than kept as a verbatim copy) so the two can't drift apart.
 *
 * Authored via Claude Web UI (Prompt I). Purity fix applied for wiring
 * parity with the rest of this screen: the countdown/hold rail is derived
 * PURELY from `nowMs`/`updatedAtMs` props (not a local `Date.now()` timer),
 * and the late-mount guard uses React's "adjust state during render"
 * pattern rather than a mutated ref — same fix as Prompts A, B, D, and E.
 * ------------------------------------------------------------------ */

export type TvAnswerRevealProps = {
  question: string;
  correctAnswer: string;
  roundNumber: number;
  secondsRemaining: number;
  /** The parent's ticking clock (VenueScreenClient's `nowMs`). */
  nowMs: number;
  /** Server timestamp the current state (incl. secondsRemaining) was computed at. */
  updatedAtMs: number;
  questionId?: string | number;
  totalRounds?: number;
  category?: string;
  /** Length of the reveal hold, for the depleting rail + late-mount guard. */
  totalSeconds?: number;
};

const GRADIENT = `linear-gradient(90deg, ${SCREEN_COLORS.cyan500} 0%, ${SCREEN_COLORS.blue600} 52%, ${SCREEN_COLORS.violet600} 100%)`;
const EMERALD = { base: "#10b981", light: "#34d399", glow: "#6ee7b7" };

function answerType(len: number) {
  if (len <= 24) return 156;
  if (len <= 44) return 124;
  if (len <= 80) return 96;
  return 74;
}

export function TvAnswerReveal({
  question,
  correctAnswer,
  roundNumber,
  secondsRemaining,
  nowMs,
  updatedAtMs,
  questionId,
  totalRounds,
  category,
  totalSeconds,
}: TvAnswerRevealProps) {
  const reduceMotion = useReducedMotion();
  const revealKey = `${questionId ?? question}`;

  /* Depletion interpolated purely from props (see file header). */
  const elapsedSinceUpdate = Math.max(0, (nowMs - updatedAtMs) / 1000);
  const live = Math.max(0, secondsRemaining - elapsedSinceUpdate);
  const shown = Math.ceil(live - 0.001);

  /* Hold length + late-mount guard, both adjusted during render (React's
     blessed pattern) rather than mutated refs, per this project's hooks lint. */
  const [span, setSpan] = useState(() => ({
    key: revealKey,
    total: totalSeconds ?? Math.max(1, secondsRemaining),
    late: secondsRemaining < (totalSeconds ?? Math.max(1, secondsRemaining)) - 2.5,
  }));
  if (span.key !== revealKey) {
    const total = totalSeconds ?? Math.max(1, secondsRemaining);
    setSpan({ key: revealKey, total, late: secondsRemaining < total - 2.5 });
  }
  const total = Math.max(totalSeconds ?? span.total, live, 1);
  const fraction = Math.min(1, live / total);
  const settled = reduceMotion || span.late;

  const qType = questionType(question.length);
  const aSize = answerType(correctAnswer.length);
  const railColor = live <= 3 ? SCREEN_COLORS.amber500 : EMERALD.light;

  const T = { eyebrow: 0.32, answer: 0.46, underline: 0.78 };

  return (
    <div key={revealKey} className="relative h-full min-h-0 w-full overflow-hidden" style={{ color: "#f8fafc" }}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1000px 620px at 12% -10%, rgba(6,182,212,0.12), transparent 60%)," +
            "radial-gradient(900px 640px at 94% 108%, rgba(124,58,237,0.14), transparent 62%)",
        }}
      />
      <div className="absolute inset-x-0 top-0" style={{ height: 10, background: GRADIENT }} />

      {/* One-shot bloom behind the answer that settles rather than pulsing.
          Lives at the panel root, OUTSIDE AutoScaleToFit's measured content:
          it is 700px tall and deliberately overhangs the answer row, so
          measuring it would drag the auto-fit scale around for the ~1s it is
          on screen. Here it is simply clipped by the root's overflow-hidden,
          which is what it always looked like anyway. */}
      {!settled && (
        <motion.div
          className="pointer-events-none absolute"
          style={{
            left: -70,
            top: "50%",
            width: 1200,
            height: 700,
            marginTop: -350,
            borderRadius: 999,
            background: "radial-gradient(closest-side, rgba(52,211,153,0.30), rgba(52,211,153,0) 72%)",
          }}
          initial={{ scale: 0.55, opacity: 0 }}
          animate={{ scale: [0.55, 1.06, 1], opacity: [0, 0.9, 0.42] }}
          transition={{ duration: 1.15, times: [0, 0.45, 1], ease: EASE, delay: T.answer }}
        />
      )}

      <AutoScaleToFit className="relative flex flex-col" style={{ padding: "64px 110px 92px" }}>
        {/* ---- Header ---- */}
        <motion.div
          className="flex items-center justify-between"
          initial={settled ? false : { opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
        >
          <div className="flex items-center" style={{ gap: 18 }}>
            <span style={{ width: 12, height: 12, borderRadius: 999, background: GRADIENT }} />
            <span
              style={{ fontSize: 26, fontWeight: 800, letterSpacing: "0.32em", textTransform: "uppercase", color: SCREEN_COLORS.cyan300 }}
            >
              {category ? `${category} · ` : ""}Round {roundNumber}
              {totalRounds ? ` of ${totalRounds}` : ""}
            </span>
          </div>
          <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: "0.3em", textTransform: "uppercase", color: "#94a3b8" }}>
            Answers locked
          </span>
        </motion.div>

        {/* ---- Question, demoting ----
            Transform-only (scale + y) so it stays compositor work and the
            wrap points never change mid-animation. */}
        <motion.div
          style={{ transformOrigin: "left top", marginTop: 40, maxWidth: 1500 }}
          initial={settled ? { scale: 0.72, opacity: 0.5, y: 0 } : { scale: 1, opacity: 1, y: 46 }}
          animate={{ scale: 0.72, opacity: 0.5, y: 0 }}
          transition={{ duration: settled ? 0 : 0.62, ease: EASE }}
        >
          <p style={{ fontSize: qType.size, lineHeight: qType.leading, fontWeight: 900, letterSpacing: "-0.02em", margin: 0 }}>
            {question}
          </p>
        </motion.div>

        {/* ---- Answer ---- */}
        <div className="relative flex flex-1 flex-col justify-center" style={{ marginTop: -20 }}>
          <motion.div
            className="relative flex items-center"
            style={{ gap: 20 }}
            initial={settled ? false : { opacity: 0, x: -34 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, ease: EASE, delay: T.eyebrow }}
          >
            <CheckBadge settled={settled} delay={T.eyebrow + 0.08} />
            <span style={{ fontSize: 34, fontWeight: 900, letterSpacing: "0.36em", textTransform: "uppercase", color: EMERALD.light }}>
              Correct answer
            </span>
          </motion.div>

          <motion.div
            className="relative"
            style={{
              fontSize: aSize,
              fontWeight: 900,
              lineHeight: 1.04,
              letterSpacing: "-0.03em",
              marginTop: 22,
              maxWidth: 1560,
              textShadow: `0 0 70px ${EMERALD.glow}3d`,
              transformOrigin: "left center",
            }}
            initial={settled ? false : { opacity: 0, scale: 1.16, y: 26, filter: "blur(18px)" }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.6, ease: EASE, delay: T.answer }}
          >
            {correctAnswer}
          </motion.div>

          <motion.div
            style={{
              height: 8,
              borderRadius: 999,
              marginTop: 30,
              maxWidth: 1560,
              background: `linear-gradient(90deg, ${EMERALD.light}, ${SCREEN_COLORS.cyan400} 70%, rgba(34,211,238,0))`,
              transformOrigin: "left center",
            }}
            initial={settled ? false : { scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: 0.7, ease: EASE, delay: T.underline }}
          />
        </div>

        {/* ---- Depleting rail: deliberately not another ring (Prompt A
            already owns the segmented ring; Prompt B owns cascading rows) ---- */}
        <motion.div
          initial={settled ? false : { opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.95 }}
        >
          <div className="flex items-baseline justify-between" style={{ marginBottom: 14 }}>
            <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: "0.3em", textTransform: "uppercase", color: "#94a3b8" }}>
              Standings next
            </span>
            <span style={{ fontSize: 46, fontWeight: 900, color: railColor, fontVariantNumeric: "tabular-nums" }}>{shown}s</span>
          </div>
          <div className="relative overflow-hidden" style={{ height: 10, borderRadius: 999, background: "rgba(148,163,184,0.16)" }}>
            <div
              className="absolute inset-y-0 left-0"
              style={{
                width: `${fraction * 100}%`,
                borderRadius: 999,
                background: `linear-gradient(90deg, ${railColor}, ${SCREEN_COLORS.cyan400})`,
                transition: reduceMotion ? "none" : "width 120ms linear, background 400ms linear",
              }}
            />
          </div>
        </motion.div>
      </AutoScaleToFit>
    </div>
  );
}

/* ---------------------------- badge ---------------------------- */

function CheckBadge({ settled, delay }: { settled: boolean; delay: number }) {
  return (
    <motion.div
      className="flex shrink-0 items-center justify-center"
      style={{
        width: 58,
        height: 58,
        borderRadius: 999,
        background: "rgba(16,185,129,0.16)",
        border: `2px solid ${EMERALD.base}`,
        boxShadow: "0 0 34px rgba(16,185,129,0.4)",
      }}
      initial={settled ? false : { scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE, delay }}
    >
      <svg width={32} height={32} viewBox="0 0 32 32" fill="none">
        <motion.path
          d="M8 17 L13.5 22.5 L24 10"
          stroke={EMERALD.glow}
          strokeWidth={4.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={settled ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.34, ease: "easeOut", delay: delay + 0.14 }}
        />
      </svg>
    </motion.div>
  );
}
