"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AutoScaleToFit } from "@/components/venue-screen/AutoScaleToFit";
import { SCREEN_COLORS, SCREEN_EASE as EASE } from "@/lib/venueScreenBrand";

/* ------------------------------------------------------------------ *
 * <TvLetterReveal />  — Category Blitz, round start.
 *
 * The called letter slams into the middle of the screen, holds, then
 * travels to its resting slot while the twelve category prompts cascade
 * in beside it. Keyed on the letter (plus round), so the slam replays
 * exactly once per round and a cold mount behaves like a prop change.
 *
 * Authored via Claude Web UI (Prompt D), integrated into the venue screen.
 * Two changes from the original: (1) recolored from emerald to this
 * codebase's actual Category Blitz brand identity — fuchsia → violet
 * (see lib/venueScreenBrand.ts; the pre-existing venue screen had the same
 * emerald/brand mismatch, corrected in the Phase 2 rebrand). (2) the
 * countdown is derived PURELY from `nowMs`/`updatedAtMs` props rather than
 * a local `Date.now()` timer, and the "first seen total" is tracked via
 * React's "adjust state during render" pattern rather than a mutated ref —
 * both required by this project's stricter hooks lint (same fix as Prompts
 * A and B).
 * ------------------------------------------------------------------ */

export type TvLetterRevealProps = {
  letter: string;
  categories: string[];
  secondsRemaining: number;
  /** The parent's ticking clock (VenueScreenClient's `nowMs`). */
  nowMs: number;
  /** Server timestamp the current state (incl. secondsRemaining) was computed at. */
  updatedAtMs: number;
  /** Distinguishes rounds that reuse the same letter. */
  roundId?: string | number;
  roundNumber?: number;
  totalRounds?: number;
  totalSeconds?: number;
};

const BRAND = {
  canvas: SCREEN_COLORS.canvas,
  deep: SCREEN_COLORS.violet600,
  mid: SCREEN_COLORS.fuchsia500,
  light: SCREEN_COLORS.fuchsia400,
  glow: SCREEN_COLORS.fuchsia300,
  amber: SCREEN_COLORS.amber500,
  amberLight: SCREEN_COLORS.amber400,
  red: "#ef4444",
  slate: "#94a3b8",
};

const SEGMENTS = 44;

/* Geometry. The letter's resting slot and the screen centre, so the
   slam can be expressed as a transform on the element that already
   lives in its final position — no portals, no measuring, no layout
   thrash on a set-top box. Tuned to this component's own 1920x1080
   layout below; update REST if the padding or letter card size changes. */
const REST = { x: 376, y: 566 };
const CENTER = { x: 960, y: 540 };
const TRAVEL = { x: CENTER.x - REST.x, y: CENTER.y - REST.y };

function urgency(seconds: number) {
  if (seconds <= 5) return { main: BRAND.red, glow: "#fca5a5" };
  if (seconds <= 10) return { main: BRAND.amber, glow: BRAND.amberLight };
  return { main: BRAND.light, glow: BRAND.mid };
}

export function TvLetterReveal({
  letter,
  categories,
  secondsRemaining,
  nowMs,
  updatedAtMs,
  roundId,
  roundNumber,
  totalRounds,
  totalSeconds,
}: TvLetterRevealProps) {
  const reduceMotion = useReducedMotion();

  const revealKey = `${roundId ?? ""}::${letter}`;
  const glyph = (letter ?? "").trim().slice(0, 1).toUpperCase();

  /* Countdown interpolated purely from props (see file header). */
  const elapsedSinceUpdate = Math.max(0, (nowMs - updatedAtMs) / 1000);
  const live = Math.max(0, secondsRemaining - elapsedSinceUpdate);
  const shown = Math.ceil(live - 0.001);
  const tone = urgency(live);

  /* Timer length: explicit prop, else the first value seen for this reveal.
     Adjusted during render (React's blessed pattern) rather than a mutated
     ref, per this project's hooks lint. */
  const [span, setSpan] = useState(() => ({
    key: revealKey,
    total: totalSeconds ?? Math.max(1, secondsRemaining),
  }));
  if (span.key !== revealKey) {
    setSpan({ key: revealKey, total: totalSeconds ?? Math.max(1, secondsRemaining) });
  }
  const total = Math.max(totalSeconds ?? span.total, live, 1);
  const active = Math.ceil(Math.min(1, live / total) * SEGMENTS);

  const list = useMemo(() => categories.slice(0, 12), [categories]);

  const SLAM = 1.72; // full duration of the hero move
  const CASCADE_AT = reduceMotion ? 0 : SLAM - 0.28;

  return (
    <div key={revealKey} className="relative h-full min-h-0 w-full overflow-hidden" style={{ color: "#f8fafc" }}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1100px 700px at 20% 60%, rgba(217,70,239,0.16), transparent 62%)," +
            "radial-gradient(900px 600px at 100% 0%, rgba(124,58,237,0.12), transparent 60%)",
        }}
      />
      <div
        className="absolute inset-x-0 top-0"
        style={{ height: 10, background: `linear-gradient(90deg, ${BRAND.deep}, ${BRAND.mid} 60%, ${BRAND.glow})` }}
      />

      {/* ---- Impact burst: fires at screen centre on the slam, then gone ---- */}
      {!reduceMotion && (
        <div className="pointer-events-none absolute" style={{ left: CENTER.x, top: CENTER.y, width: 0, height: 0, zIndex: 30 }}>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute"
              style={{
                left: -420,
                top: -420,
                width: 840,
                height: 840,
                borderRadius: 999,
                border: `${6 - i}px solid ${BRAND.light}`,
              }}
              initial={{ scale: 0.12, opacity: 0 }}
              animate={{ scale: [0.12, 1.15 + i * 0.22], opacity: [0.85, 0] }}
              transition={{ duration: 0.9 + i * 0.16, ease: "easeOut", delay: 0.3 + i * 0.07 }}
            />
          ))}
          {Array.from({ length: 14 }).map((_, i) => {
            const a = (i / 14) * Math.PI * 2;
            return (
              <motion.div
                key={`spoke-${i}`}
                className="absolute"
                style={{
                  width: 5,
                  height: 150,
                  borderRadius: 999,
                  background: `linear-gradient(to bottom, ${BRAND.glow}, transparent)`,
                  transformOrigin: "top center",
                  rotate: `${(a * 180) / Math.PI}deg`,
                }}
                initial={{ x: 0, y: 0, opacity: 0, scaleY: 0.3 }}
                animate={{
                  x: Math.sin(a) * 460,
                  y: -Math.cos(a) * 460,
                  opacity: [0, 0.9, 0],
                  scaleY: [0.3, 1.6, 0.4],
                }}
                transition={{ duration: 0.78, ease: "easeOut", delay: 0.32 }}
              />
            );
          })}
        </div>
      )}

      <AutoScaleToFit className="relative" style={{ padding: "54px 96px 56px" }}>
        {/* ---- Header ---- */}
        <div className="flex items-start justify-between" style={{ gap: 48 }}>
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <div className="flex items-center" style={{ gap: 16 }}>
              <span
                style={{ width: 14, height: 14, borderRadius: 999, background: BRAND.light, boxShadow: `0 0 22px ${BRAND.mid}` }}
              />
              <span
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  letterSpacing: "0.34em",
                  textTransform: "uppercase",
                  color: BRAND.light,
                }}
              >
                Category Blitz
              </span>
            </div>
            <h1 style={{ fontSize: 76, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.03em", marginTop: 12 }}>
              Twelve categories. One letter.
            </h1>
            {roundNumber != null && (
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  letterSpacing: "0.3em",
                  textTransform: "uppercase",
                  color: BRAND.slate,
                  marginTop: 12,
                }}
              >
                Round {roundNumber}
                {totalRounds ? ` of ${totalRounds}` : ""}
              </div>
            )}
          </motion.div>

          <TimerRing active={active} shown={shown} tone={tone} reduceMotion={!!reduceMotion} revealKey={revealKey} />
        </div>

        {/* ---- Body: hero letter + category grid ---- */}
        <div className="flex items-start" style={{ gap: 72, marginTop: 34 }}>
          {/* Hero letter. Lives in its resting slot; the slam is a
              transform sequence that starts it at screen centre. */}
          <motion.div
            className="relative shrink-0"
            style={{ width: 460, height: 460, zIndex: 40 }}
            initial={reduceMotion ? false : { x: TRAVEL.x, y: TRAVEL.y, scale: 6.5, opacity: 0, filter: "blur(24px)" }}
            animate={{
              x: [TRAVEL.x, TRAVEL.x, TRAVEL.x, 0],
              y: [TRAVEL.y, TRAVEL.y, TRAVEL.y, 0],
              scale: [6.5, 3.9, 3.9, 1],
              opacity: [0, 1, 1, 1],
              filter: ["blur(24px)", "blur(0px)", "blur(0px)", "blur(0px)"],
            }}
            transition={reduceMotion ? { duration: 0 } : { duration: SLAM, times: [0, 0.19, 0.52, 1], ease: EASE }}
          >
            <div
              className="flex h-full w-full items-center justify-center"
              style={{
                borderRadius: 44,
                background: `linear-gradient(155deg, rgba(217,70,239,0.20), rgba(2,6,23,0.9))`,
                border: `2px solid ${BRAND.deep}`,
                boxShadow: `0 0 120px rgba(217,70,239,0.35), inset 0 0 90px rgba(124,58,237,0.16)`,
              }}
            >
              <span
                style={{
                  fontSize: 340,
                  fontWeight: 900,
                  lineHeight: 1,
                  letterSpacing: "-0.06em",
                  color: "#fdf4ff",
                  textShadow: `0 0 70px ${BRAND.glow}88`,
                }}
              >
                {glyph}
              </span>
            </div>
            <div
              className="absolute inset-x-0 text-center"
              style={{
                bottom: -56,
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: "0.36em",
                textTransform: "uppercase",
                color: BRAND.slate,
              }}
            >
              Your letter
            </div>
          </motion.div>

          {/* Category prompts */}
          <motion.ol
            className="grid flex-1"
            // minmax(0, 1fr) rather than 1fr: a bare `1fr` track floors at the
            // item's MIN-CONTENT width, so one long category name used to push
            // the whole grid past the canvas (the originally reported clipping
            // — see docs/venue-tv-display-content-fit-plan.md Phase 0). With the
            // floor removed the cell can shrink and the name wraps instead.
            style={{
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              gap: 14,
              listStyle: "none",
              margin: 0,
              padding: 0,
            }}
            initial={reduceMotion ? false : "hidden"}
            animate={reduceMotion ? undefined : "show"}
            variants={{ hidden: {}, show: { transition: { delayChildren: CASCADE_AT, staggerChildren: 0.055 } } }}
          >
            {list.map((c, i) => (
              <motion.li
                key={`${i}-${c}`}
                className="flex items-center"
                style={{
                  gap: 22,
                  padding: "14px 26px",
                  minHeight: 92,
                  borderRadius: 16,
                  background: "rgba(15,23,42,0.6)",
                  border: "1px solid rgba(240,171,252,0.18)",
                  boxShadow: `inset 3px 0 0 0 rgba(217,70,239,0.55)`,
                }}
                variants={
                  reduceMotion
                    ? undefined
                    : {
                        hidden: { opacity: 0, x: 60, filter: "blur(8px)" },
                        show: { opacity: 1, x: 0, filter: "blur(0px)", transition: { duration: 0.46, ease: EASE } },
                      }
                }
              >
                <span style={{ fontSize: 30, fontWeight: 900, color: BRAND.light, fontVariantNumeric: "tabular-nums", minWidth: 44 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  style={{
                    fontSize: 36,
                    fontWeight: 700,
                    letterSpacing: "-0.01em",
                    lineHeight: 1.12,
                    // Wrap long names (and break a single unbroken monster word)
                    // instead of truncating them — a category the players can't
                    // read is worse than a two-line row, and the extra height is
                    // absorbed by AutoScaleToFit.
                    overflowWrap: "anywhere",
                  }}
                >
                  {c}
                </span>
              </motion.li>
            ))}
          </motion.ol>
        </div>
      </AutoScaleToFit>
    </div>
  );
}

/* ------------------------------ ring ------------------------------ */

function TimerRing({
  active,
  shown,
  tone,
  reduceMotion,
  revealKey,
}: {
  active: number;
  shown: number;
  tone: { main: string; glow: string };
  reduceMotion: boolean;
  revealKey: string;
}) {
  const size = 268;
  const c = size / 2;
  const rInner = 96;
  const rOuter = 118;

  return (
    <motion.div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: EASE, delay: 0.05 }}
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
                filter: on ? `drop-shadow(0 0 9px ${tone.glow})` : "none",
                transition: reduceMotion ? "none" : "stroke 320ms linear",
              }}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          key={reduceMotion ? "static" : `${revealKey}-${shown}`}
          initial={reduceMotion ? false : { scale: 1.12, opacity: 0.75 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, ease: EASE }}
          style={{
            fontSize: 118,
            fontWeight: 900,
            lineHeight: 1,
            color: tone.main,
            fontVariantNumeric: "tabular-nums",
            textShadow: `0 0 40px ${tone.glow}55`,
          }}
        >
          {shown}
        </motion.span>
        <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.34em", textTransform: "uppercase", color: "#94a3b8" }}>
          Seconds
        </span>
      </div>
    </motion.div>
  );
}
