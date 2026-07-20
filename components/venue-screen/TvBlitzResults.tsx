"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { SCREEN_COLORS, SCREEN_EASE as EASE } from "@/lib/venueScreenBrand";

/* ------------------------------------------------------------------ *
 * <TvBlitzResults />  — Category Blitz, between rounds.
 *
 * Three phases arrive as props, not as internal timers:
 *   scoring  → answers are being tallied, board withheld
 *   results  → board cascades in, ranks settle
 *   next     → countdown takes the stage for the next letter
 *
 * This venue screen's backend only ever emits two of the three
 * (`intermission` and `results` — there's no distinct "tallying" state
 * exposed), so the integration below maps intermission → "next" and never
 * passes "scoring". The component still works unmodified either way; the
 * copy map is the only place phase-specific text lives.
 *
 * Authored via Claude Web UI (Prompt E), integrated into the venue screen.
 * Two changes from the original: (1) recolored from emerald to this
 * codebase's actual Category Blitz brand identity — fuchsia → violet — with
 * the author's own suggested tweak applied: 1st place gets an amber
 * "champion marker" accent (matching the Live Trivia round-break podium)
 * since brightness-only hierarchy within one hue doesn't separate well at
 * ten feet; 2nd/3rd stay in the fuchsia/violet family. (2) the countdown is
 * derived PURELY from `nowMs`/`updatedAtMs` props rather than a local
 * `Date.now()` timer, and the late-mount guard uses React's "adjust state
 * during render" pattern rather than a mutated ref — both required by this
 * project's stricter hooks lint (same fix as Prompts A, B, and D).
 * ------------------------------------------------------------------ */

export type BlitzPhase = "scoring" | "results" | "next";

export type BlitzEntry = {
  id: string;
  name: string;
  score: number;
  /** Points earned in the round just played. */
  roundScore?: number;
  /** Rank before this round, for the movement chip. */
  previousRank?: number;
};

export type TvBlitzResultsProps = {
  leaderboard: BlitzEntry[];
  letter: string;
  secondsRemaining: number;
  phase: BlitzPhase;
  /** The parent's ticking clock (VenueScreenClient's `nowMs`). */
  nowMs: number;
  /** Server timestamp the current state (incl. secondsRemaining) was computed at. */
  updatedAtMs: number;
  roundNumber?: number;
  totalRounds?: number;
  totalSeconds?: number;
  maxRows?: number;
};

const BRAND = {
  deep: SCREEN_COLORS.violet600,
  mid: SCREEN_COLORS.fuchsia500,
  light: SCREEN_COLORS.fuchsia400,
  glow: SCREEN_COLORS.fuchsia300,
  amber: SCREEN_COLORS.amber500,
  amberLight: SCREEN_COLORS.amber400,
  red: "#ef4444",
  slate: "#94a3b8",
};


/* Podium accents: 1st gets the amber "champion marker" (matches the Live
   Trivia round-break podium); 2nd/3rd stay within the Blitz fuchsia/violet
   family, which separates better at ten feet than brightness steps of one hue. */
const PODIUM = [
  { accent: BRAND.amberLight, wash: "rgba(251,191,36,0.14)", bar: BRAND.amberLight },
  { accent: BRAND.light, wash: "rgba(232,121,249,0.10)", bar: BRAND.light },
  { accent: SCREEN_COLORS.violet500, wash: "rgba(139,92,246,0.09)", bar: SCREEN_COLORS.violet500 },
];

const PHASE_COPY: Record<BlitzPhase, { title: string; clock: string }> = {
  scoring: { title: "Tallying answers", clock: "Results in" },
  results: { title: "Round results", clock: "Next letter in" },
  next: { title: "Next round up", clock: "Starting in" },
};

function urgency(seconds: number) {
  if (seconds <= 5) return { main: BRAND.red, glow: "#fca5a5" };
  if (seconds <= 10) return { main: BRAND.amber, glow: BRAND.amberLight };
  return { main: BRAND.light, glow: BRAND.mid };
}

export function TvBlitzResults({
  leaderboard,
  letter,
  secondsRemaining,
  phase,
  nowMs,
  updatedAtMs,
  roundNumber,
  totalRounds,
  totalSeconds,
  maxRows = 8,
}: TvBlitzResultsProps) {
  const reduceMotion = useReducedMotion();
  const glyph = (letter ?? "").trim().slice(0, 1).toUpperCase();

  /* Countdown interpolated purely from props (see file header). */
  const elapsedSinceUpdate = Math.max(0, (nowMs - updatedAtMs) / 1000);
  const live = Math.max(0, secondsRemaining - elapsedSinceUpdate);
  const shown = Math.ceil(live - 0.001);
  const tone = urgency(live);

  /* Late-mount guard: if we come up partway through the results phase,
     land the board settled instead of re-cascading in front of the room.
     Adjusted during render (React's blessed pattern) rather than a mutated
     ref, per this project's hooks lint. */
  const span = totalSeconds ?? Math.max(1, secondsRemaining);
  const [lateGuard, setLateGuard] = useState(() => ({ phase, late: secondsRemaining < span - 3 }));
  if (lateGuard.phase !== phase) {
    setLateGuard({ phase, late: secondsRemaining < span - 3 });
  }
  const settleImmediately = reduceMotion || lateGuard.late;

  const ranked = useMemo(
    () => [...leaderboard].sort((a, b) => b.score - a.score).slice(0, maxRows),
    [leaderboard, maxRows],
  );

  const copy = PHASE_COPY[phase];
  const showBoard = phase !== "scoring";

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ color: "#f8fafc" }}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1000px 660px at 10% -8%, rgba(217,70,239,0.15), transparent 60%)," +
            "radial-gradient(900px 640px at 98% 110%, rgba(124,58,237,0.14), transparent 62%)",
        }}
      />
      <div
        className="absolute inset-x-0 top-0"
        style={{ height: 10, background: `linear-gradient(90deg, ${BRAND.deep}, ${BRAND.mid} 60%, ${BRAND.glow})` }}
      />

      <div className="relative flex h-full flex-col" style={{ padding: "36px 96px 32px" }}>
        {/* ---- Header: letter recap, phase title, countdown ---- */}
        <div className="flex items-center justify-between" style={{ gap: 56 }}>
          <div className="flex items-center" style={{ gap: 40 }}>
            {/* Letter recap. Keyed on the letter so it re-settles per round. */}
            <motion.div
              key={`glyph-${letter}`}
              className="flex shrink-0 items-center justify-center"
              style={{
                width: 150,
                height: 150,
                borderRadius: 32,
                background: "linear-gradient(155deg, rgba(217,70,239,0.20), rgba(2,6,23,0.9))",
                border: `2px solid ${BRAND.deep}`,
                boxShadow: "0 0 70px rgba(217,70,239,0.28), inset 0 0 50px rgba(124,58,237,0.14)",
              }}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.7, rotate: -6 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <span
                style={{
                  fontSize: 112,
                  fontWeight: 900,
                  lineHeight: 1,
                  letterSpacing: "-0.06em",
                  color: "#fdf4ff",
                  textShadow: `0 0 46px ${BRAND.glow}77`,
                }}
              >
                {glyph}
              </span>
            </motion.div>

            <div key={`title-${phase}`}>
              <motion.div
                className="flex items-center"
                style={{ gap: 16 }}
                initial={reduceMotion ? false : { opacity: 0, x: -34 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, ease: EASE }}
              >
                <span style={{ width: 12, height: 12, borderRadius: 999, background: BRAND.light, boxShadow: `0 0 20px ${BRAND.mid}` }} />
                <span
                  style={{
                    fontSize: 26,
                    fontWeight: 800,
                    letterSpacing: "0.32em",
                    textTransform: "uppercase",
                    color: BRAND.light,
                  }}
                >
                  Category Blitz
                  {roundNumber != null ? ` · Round ${roundNumber}${totalRounds ? ` of ${totalRounds}` : ""}` : ""}
                </span>
              </motion.div>

              <motion.h1
                style={{ fontSize: 84, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.035em", marginTop: 8 }}
                initial={reduceMotion ? false : { opacity: 0, y: 26, filter: "blur(12px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.55, ease: EASE, delay: 0.06 }}
              >
                {copy.title}
              </motion.h1>
            </div>
          </div>

          <motion.div
            key={`clock-${phase}`}
            className="flex shrink-0 flex-col items-end"
            initial={reduceMotion ? false : { opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.1 }}
          >
            <span
              style={{ fontSize: 22, fontWeight: 800, letterSpacing: "0.3em", textTransform: "uppercase", color: BRAND.slate }}
            >
              {copy.clock}
            </span>
            <motion.div
              className="flex items-baseline"
              style={{ gap: 12, marginTop: 4 }}
              animate={reduceMotion || phase !== "next" ? undefined : { scale: [1, 1.05, 1] }}
              transition={reduceMotion || phase !== "next" ? undefined : { duration: 1, repeat: Infinity, ease: "easeInOut" }}
            >
              <span
                style={{
                  fontSize: 108,
                  fontWeight: 900,
                  lineHeight: 0.9,
                  color: tone.main,
                  fontVariantNumeric: "tabular-nums",
                  textShadow: `0 0 48px ${tone.glow}55`,
                }}
              >
                {shown}
              </span>
              <span style={{ fontSize: 38, fontWeight: 800, color: BRAND.slate }}>s</span>
            </motion.div>
          </motion.div>
        </div>

        {/* ---- Body ---- */}
        <div className="flex-1" style={{ marginTop: 20 }}>
          <AnimatePresence mode="wait" initial={false}>
            {!showBoard ? (
              <motion.div
                key="scoring"
                className="flex h-full flex-col items-center justify-center"
                style={{ gap: 34 }}
                initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -20 }}
                transition={{ duration: 0.4, ease: EASE }}
              >
                <div style={{ fontSize: 52, fontWeight: 800, color: BRAND.slate, letterSpacing: "-0.01em" }}>
                  Checking every answer beginning with {glyph}
                </div>
                {/* Transient shimmer — only alive during the scoring phase. */}
                <div
                  className="relative overflow-hidden"
                  style={{ width: 900, height: 14, borderRadius: 999, background: "rgba(148,163,184,0.14)" }}
                >
                  {!reduceMotion && (
                    <motion.div
                      className="absolute inset-y-0"
                      style={{
                        width: "38%",
                        borderRadius: 999,
                        background: `linear-gradient(90deg, transparent, ${BRAND.light}, transparent)`,
                      }}
                      animate={{ x: ["-40%", "300%"] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    />
                  )}
                </div>
              </motion.div>
            ) : (
              /* Keyed on the letter, not the phase: results → next must not
                 re-cascade, but a new round must. */
              <motion.div key={`board-${letter}`} className="flex h-full flex-col" style={{ gap: 8 }} initial={false}>
                <AnimatePresence initial={false}>
                  {ranked.map((entry, i) => {
                    const podium = i < 3 ? PODIUM[i] : null;
                    const delta = entry.previousRank != null ? entry.previousRank - (i + 1) : 0;

                    return (
                      <motion.div
                        key={entry.id}
                        layout={!reduceMotion}
                        className="flex items-center"
                        style={{
                          gap: 28,
                          padding: "0 38px",
                          height: podium ? 84 : 72,
                          borderRadius: 20,
                          background: podium ? podium.wash : "rgba(15,23,42,0.55)",
                          border: `1px solid ${podium ? podium.accent + "44" : "rgba(148,163,184,0.14)"}`,
                          boxShadow: podium ? `inset 4px 0 0 0 ${podium.bar}` : "none",
                        }}
                        initial={settleImmediately ? false : { opacity: 0, x: -70, filter: "blur(8px)" }}
                        animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                        exit={reduceMotion ? undefined : { opacity: 0, x: 50 }}
                        transition={{
                          duration: 0.48,
                          ease: EASE,
                          delay: settleImmediately ? 0 : 0.26 + i * 0.08,
                          layout: { duration: 0.62, ease: EASE },
                        }}
                      >
                        <span
                          style={{
                            width: 68,
                            fontSize: podium ? 58 : 46,
                            fontWeight: 900,
                            lineHeight: 1,
                            color: podium ? podium.accent : BRAND.slate,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {i + 1}
                        </span>

                        <span className="flex-1 truncate" style={{ fontSize: podium ? 50 : 44, fontWeight: podium ? 800 : 700, letterSpacing: "-0.01em" }}>
                          {entry.name}
                        </span>

                        {delta !== 0 && (
                          <span
                            style={{
                              fontSize: 25,
                              fontWeight: 800,
                              color: delta > 0 ? BRAND.glow : BRAND.slate,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {delta > 0 ? `▲ ${delta}` : `▼ ${Math.abs(delta)}`}
                          </span>
                        )}

                        {entry.roundScore != null && (
                          <span
                            style={{
                              minWidth: 132,
                              textAlign: "right",
                              fontSize: 32,
                              fontWeight: 800,
                              color: BRAND.light,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            +{entry.roundScore}
                          </span>
                        )}

                        <span
                          style={{
                            minWidth: 180,
                            textAlign: "right",
                            fontSize: podium ? 54 : 48,
                            fontWeight: 900,
                            color: podium ? podium.accent : "#f8fafc",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {entry.score.toLocaleString()}
                        </span>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
