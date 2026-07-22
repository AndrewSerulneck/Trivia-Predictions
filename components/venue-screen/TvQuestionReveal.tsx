"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AutoScaleToFit } from "@/components/venue-screen/AutoScaleToFit";
import { SCREEN_COLORS, SCREEN_EASE as ease } from "@/lib/venueScreenBrand";
import { questionType } from "@/lib/tvType";

/* ------------------------------------------------------------------ *
 * <TvQuestionReveal />
 * 10-foot "follow-along" display for the Live Trivia question view.
 * Driven entirely by props. The parent (VenueScreenClient/LiveTriviaScreen)
 * re-renders on a 3s poll; the reveal animation replays only when the
 * reveal identity (question + round) changes, never on a same-question poll.
 * Authored via Claude Web UI (Prompt A), integrated into the venue screen.
 *
 * The countdown is derived PURELY from `nowMs`/`updatedAtMs` (both plain
 * numbers already ticking once a second in VenueScreenClient) rather than
 * calling `Date.now()` locally — this project's stricter hooks lint forbids
 * impure calls during render, so the interpolation reuses the parent's
 * existing clock instead of each panel running its own timer.
 * ------------------------------------------------------------------ */

export type TvQuestionRevealProps = {
  question: string;
  category: string;
  roundNumber: number;
  totalRounds: number;
  secondsRemaining: number;
  /** The parent's ticking clock (VenueScreenClient's `nowMs`). */
  nowMs: number;
  /** Server timestamp the current state (incl. secondsRemaining) was computed at. */
  updatedAtMs: number;
  /** Stable id for the question. Falls back to the question text. */
  questionId?: string | number;
  /** Full length of the timer. Falls back to the first value seen. */
  totalSeconds?: number;
};

const GRADIENT = `linear-gradient(90deg, ${SCREEN_COLORS.cyan500} 0%, ${SCREEN_COLORS.blue600} 52%, ${SCREEN_COLORS.violet600} 100%)`;

const SEGMENTS = 48;

/** Timer color ramp. Amber under 10s, red under 5s. */
function urgency(seconds: number) {
  if (seconds <= 5) return { key: "critical", main: "#ef4444", glow: "#fca5a5" };
  if (seconds <= 10) return { key: "warning", main: SCREEN_COLORS.amber500, glow: SCREEN_COLORS.amber400 };
  return { key: "normal", main: SCREEN_COLORS.cyan400, glow: SCREEN_COLORS.cyan500 };
}

export function TvQuestionReveal({
  question,
  category,
  roundNumber,
  totalRounds,
  secondsRemaining,
  nowMs,
  updatedAtMs,
  questionId,
  totalSeconds,
}: TvQuestionRevealProps) {
  const reduceMotion = useReducedMotion();

  /* Reveal identity. Changing this remounts the animated subtree, so the
     entrance plays exactly once per question and a cold mount behaves
     identically to a prop change. No lifecycle assumptions anywhere. */
  const revealKey = `${questionId ?? question}::${roundNumber}`;

  /* Countdown interpolated purely from props: how much wall-clock time has
     passed since the server computed `secondsRemaining`, per the parent's
     own ticking clock. No local timer, no impure calls during render. */
  const elapsedSinceUpdate = Math.max(0, (nowMs - updatedAtMs) / 1000);
  const live = Math.max(0, secondsRemaining - elapsedSinceUpdate);

  /* Timer length: explicit prop, else the first value seen for this reveal.
     Adjusted during render (React's blessed pattern for "reset derived state
     when a key changes") rather than a mutated ref, which this project's
     stricter hooks lint forbids reading/writing during render. */
  const [span, setSpan] = useState(() => ({
    key: revealKey,
    total: totalSeconds ?? Math.max(1, secondsRemaining),
  }));
  if (span.key !== revealKey) {
    setSpan({ key: revealKey, total: totalSeconds ?? Math.max(1, secondsRemaining) });
  }
  const total = Math.max(totalSeconds ?? span.total, live, 1);

  const fraction = Math.min(1, live / total);
  const active = Math.ceil(fraction * SEGMENTS);
  const tone = urgency(live);
  const shown = Math.ceil(live - 0.001);

  const words = useMemo(() => question.trim().split(/\s+/), [question]);
  const type = questionType(question.length);
  const perWord = Math.min(0.055, 1.5 / Math.max(words.length, 1));

  return (
    <div
      className="relative h-full min-h-0 w-full overflow-hidden"
      style={{ color: "#f8fafc" }}
    >
      {/* Ambient depth. Static — never animated, so it survives remounts cheaply. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1100px 620px at 14% -12%, rgba(6,182,212,0.16), transparent 62%)," +
            "radial-gradient(900px 620px at 92% 112%, rgba(124,58,237,0.18), transparent 60%)",
        }}
      />

      {/* Top accent bar + glow sweep */}
      <div className="absolute inset-x-0 top-0" style={{ height: 10, background: GRADIENT }}>
        {!reduceMotion && (
          <motion.div
            key={`sweep-${revealKey}`}
            className="absolute bottom-0 top-0"
            style={{
              width: "34%",
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.95), transparent)",
              filter: "blur(1px)",
            }}
            initial={{ x: "-40%", opacity: 0 }}
            animate={{ x: "300%", opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.7, ease, delay: 0.1 }}
          />
        )}
      </div>

      <AutoScaleToFit key={revealKey} className="relative flex flex-col" style={{ padding: "78px 96px 64px" }}>
        {/* ---- Header: category chip, round counter, countdown ring ---- */}
        <div className="flex items-start justify-between" style={{ gap: 64 }}>
          <div className="flex flex-col" style={{ gap: 28 }}>
            <motion.div
              className="inline-flex items-center self-start"
              style={{
                gap: 20,
                padding: "18px 40px 18px 30px",
                borderRadius: 999,
                background: "rgba(15,23,42,0.72)",
                border: "1px solid rgba(34,211,238,0.35)",
                boxShadow: "0 0 60px rgba(6,182,212,0.18)",
                backdropFilter: "blur(6px)",
              }}
              initial={reduceMotion ? false : { opacity: 0, x: -70 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.62, ease }}
            >
              <span style={{ width: 14, height: 14, borderRadius: 999, background: GRADIENT }} />
              <span
                style={{
                  fontSize: 34,
                  fontWeight: 800,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: SCREEN_COLORS.cyan300,
                }}
              >
                {category}
              </span>
            </motion.div>

            <motion.div
              className="flex items-baseline"
              style={{ gap: 18 }}
              initial={reduceMotion ? false : { opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.62, ease, delay: 0.1 }}
            >
              <span
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  letterSpacing: "0.3em",
                  textTransform: "uppercase",
                  color: "#94a3b8",
                }}
              >
                Round
              </span>
              <span style={{ fontSize: 48, fontWeight: 900, lineHeight: 1 }}>{roundNumber}</span>
              <span style={{ fontSize: 30, fontWeight: 700, color: "#94a3b8" }}>of {totalRounds}</span>
            </motion.div>
          </div>

          <CountdownRing
            active={active}
            shown={shown}
            tone={tone}
            reduceMotion={!!reduceMotion}
            revealKey={revealKey}
            ease={ease}
          />
        </div>

        {/* ---- Question ---- */}
        <div className="mt-6 flex flex-1 items-center" style={{ paddingRight: 120 }}>
          <motion.h1
            style={{
              fontSize: type.size,
              lineHeight: type.leading,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textWrap: "balance" as CSSProperties["textWrap"],
            }}
            initial={reduceMotion ? undefined : "hidden"}
            animate={reduceMotion ? undefined : "show"}
            variants={{ hidden: {}, show: { transition: { delayChildren: 0.34, staggerChildren: perWord } } }}
          >
            {words.map((w, i) => (
              <motion.span
                key={`${i}-${w}`}
                className="inline-block"
                style={{ marginRight: "0.32em" }}
                variants={
                  reduceMotion
                    ? undefined
                    : {
                        hidden: { opacity: 0, y: 34, filter: "blur(10px)" },
                        show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.5, ease } },
                      }
                }
              >
                {w}
              </motion.span>
            ))}
          </motion.h1>
        </div>

        {/* ---- Round pips ---- */}
        <motion.div
          className="flex items-center"
          style={{ gap: 14 }}
          initial={reduceMotion ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease, delay: 0.5 }}
        >
          {Array.from({ length: totalRounds }).map((_, i) => (
            <span
              key={i}
              style={{
                height: 8,
                width: i + 1 === roundNumber ? 96 : 44,
                borderRadius: 999,
                background:
                  i + 1 === roundNumber
                    ? GRADIENT
                    : i + 1 < roundNumber
                    ? "rgba(34,211,238,0.42)"
                    : "rgba(148,163,184,0.18)",
              }}
            />
          ))}
        </motion.div>
      </AutoScaleToFit>
    </div>
  );
}

/* ------------------------------ ring ------------------------------ */

function CountdownRing({
  active,
  shown,
  tone,
  reduceMotion,
  revealKey,
  ease,
}: {
  active: number;
  shown: number;
  tone: { key: string; main: string; glow: string };
  reduceMotion: boolean;
  revealKey: string;
  ease: readonly [number, number, number, number];
}) {
  const size = 300;
  const c = size / 2;
  const rOuter = 132;
  const rInner = 108;

  return (
    <motion.div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.86 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.66, ease, delay: 0.06 }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const a = (-90 + i * (360 / SEGMENTS)) * (Math.PI / 180);
          const on = i < active;
          return (
            <line
              key={i}
              x1={c + rInner * Math.cos(a)}
              y1={c + rInner * Math.sin(a)}
              x2={c + rOuter * Math.cos(a)}
              y2={c + rOuter * Math.sin(a)}
              stroke={on ? tone.main : "rgba(148,163,184,0.15)"}
              strokeWidth={9}
              strokeLinecap="round"
              style={{
                filter: on ? `drop-shadow(0 0 10px ${tone.glow})` : "none",
                transition: reduceMotion ? "none" : "stroke 320ms linear",
              }}
            />
          );
        })}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          key={reduceMotion ? "static" : `${revealKey}-${shown}`}
          initial={reduceMotion ? false : { scale: tone.key === "critical" ? 1.24 : 1.1, opacity: 0.75 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.32, ease }}
          style={{
            fontSize: 132,
            fontWeight: 900,
            lineHeight: 1,
            color: tone.main,
            fontVariantNumeric: "tabular-nums",
            textShadow: `0 0 44px ${tone.glow}66`,
          }}
        >
          {shown}
        </motion.span>
        <span
          style={{
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: "0.34em",
            textTransform: "uppercase",
            color: "#94a3b8",
            marginTop: 6,
          }}
        >
          Seconds
        </span>
      </div>
    </motion.div>
  );
}
