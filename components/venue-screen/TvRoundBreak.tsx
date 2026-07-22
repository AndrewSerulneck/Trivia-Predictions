"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AutoScaleToFit } from "@/components/venue-screen/AutoScaleToFit";
import { SCREEN_COLORS, SCREEN_EASE as EASE, getPodiumAccent, withAlpha } from "@/lib/venueScreenBrand";

/* ------------------------------------------------------------------ *
 * <TvRoundBreak />
 * The intermission between questions/rounds on the Live Trivia TV feed.
 *
 * Two animation scopes, deliberately separated:
 *   - The handoff + title + cascade play ONCE per round (keyed on round).
 *   - Leaderboard rows stay mounted across the 3s poll so framer-motion
 *     `layout` can slide them into new positions when ranks change.
 *
 * Authored via Claude Web UI (Prompt B), integrated into the venue screen.
 * The countdown is derived PURELY from `nowMs`/`updatedAtMs` (both plain
 * numbers already ticking once a second in VenueScreenClient) rather than
 * calling `Date.now()` locally, and the late-mount guard is computed via
 * React's "adjust state during render" pattern rather than a mutated ref —
 * both required by this project's stricter hooks lint (see TvQuestionReveal
 * for the same fix applied to Prompt A).
 * ------------------------------------------------------------------ */

export type LeaderboardEntry = {
  id: string;
  name: string;
  score: number;
  /** Rank before this round, for the movement chip. Optional. */
  previousRank?: number;
};

export type TvRoundBreakProps = {
  roundNumber: number;
  leaderboard: LeaderboardEntry[];
  secondsRemaining: number;
  /** The parent's ticking clock (VenueScreenClient's `nowMs`). */
  nowMs: number;
  /** Server timestamp the current state (incl. secondsRemaining) was computed at. */
  updatedAtMs: number;
  totalRounds?: number;
  /** Full length of the break. Used to detect a late mount. */
  totalSeconds?: number;
  /** The question just closed out. Shown briefly during the handoff. */
  outgoingQuestion?: string;
  /** Rows shown before the list is capped. */
  maxRows?: number;
};

const GRADIENT = `linear-gradient(90deg, ${SCREEN_COLORS.cyan500} 0%, ${SCREEN_COLORS.blue600} 52%, ${SCREEN_COLORS.violet600} 100%)`;

// Podium accents come from the shared getPodiumAccent() (lib/venueScreenBrand.ts)
// rather than a hand-rolled gold/silver/bronze copy — see CATEGORY_TEST.md's
// counterpart note in TvBlitzResults.tsx for why Category Blitz's podium
// deliberately stays out of this centralization (its 2nd/3rd intentionally use
// the Blitz fuchsia/violet family instead of literal metals).
const PODIUM_WASH_ALPHA = [0.12, 0.09, 0.1];

function urgency(seconds: number) {
  if (seconds <= 5) return { main: "#ef4444", glow: "#fca5a5" };
  if (seconds <= 10) return { main: SCREEN_COLORS.amber500, glow: SCREEN_COLORS.amber400 };
  return { main: SCREEN_COLORS.cyan400, glow: SCREEN_COLORS.cyan500 };
}

export function TvRoundBreak({
  roundNumber,
  leaderboard,
  secondsRemaining,
  nowMs,
  updatedAtMs,
  totalRounds,
  totalSeconds,
  outgoingQuestion,
  maxRows = 8,
}: TvRoundBreakProps) {
  const reduceMotion = useReducedMotion();

  /* Countdown interpolated purely from props (see file header). */
  const elapsedSinceUpdate = Math.max(0, (nowMs - updatedAtMs) / 1000);
  const live = Math.max(0, secondsRemaining - elapsedSinceUpdate);
  const shown = Math.ceil(live - 0.001);
  const tone = urgency(live);

  /* Late-mount guard. If we mount partway through the break — a refresh, a
     crashed tab, a re-key from above — skip the handoff and land settled
     instead of replaying a transition the room already watched. Computed
     once when `roundNumber` changes (adjust-state-during-render), not on a
     mutated ref, per this project's hooks lint. */
  const span = totalSeconds ?? Math.max(1, secondsRemaining);
  const [lateGuard, setLateGuard] = useState(() => ({
    round: roundNumber,
    late: secondsRemaining < span - 2.5,
  }));
  if (lateGuard.round !== roundNumber) {
    setLateGuard({ round: roundNumber, late: secondsRemaining < span - 2.5 });
  }
  const skipHandoff = reduceMotion || lateGuard.late;

  const t0 = skipHandoff ? 0 : 0.85;

  const ranked = useMemo(
    () => [...leaderboard].sort((a, b) => b.score - a.score).slice(0, maxRows),
    [leaderboard, maxRows],
  );

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden" style={{ color: "#f8fafc" }}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1000px 620px at 8% -10%, rgba(6,182,212,0.15), transparent 60%)," +
            "radial-gradient(900px 640px at 96% 108%, rgba(124,58,237,0.20), transparent 62%)",
        }}
      />

      <div className="absolute inset-x-0 top-0" style={{ height: 10, background: GRADIENT }} />

      {/* ---- Handoff: the closing question lifts away, a gradient wipe passes ---- */}
      {!skipHandoff && outgoingQuestion && (
        <motion.div
          key={`handoff-${roundNumber}`}
          className="absolute inset-0 z-20 flex items-center"
          style={{ padding: "0 120px", background: SCREEN_COLORS.canvas }}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.42, ease: "linear", delay: 0.5 }}
        >
          <motion.p
            style={{ fontSize: 84, fontWeight: 900, lineHeight: 1.08, letterSpacing: "-0.02em" }}
            initial={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            animate={{ y: -70, opacity: 0, filter: "blur(14px)" }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            {outgoingQuestion}
          </motion.p>
        </motion.div>
      )}

      {!skipHandoff && (
        <motion.div
          key={`wipe-${roundNumber}`}
          className="pointer-events-none absolute inset-x-0 z-30"
          style={{ height: 6, background: GRADIENT, boxShadow: "0 0 90px 30px rgba(37,99,235,0.55)" }}
          initial={{ top: "-6%" }}
          animate={{ top: "106%" }}
          transition={{ duration: 0.85, ease: [0.65, 0, 0.35, 1], delay: 0.25 }}
        />
      )}

      <AutoScaleToFit className="relative flex flex-col" style={{ padding: "40px 96px 36px" }}>
        {/* ---- Title + countdown ---- */}
        <div className="flex items-start justify-between" style={{ gap: 56 }}>
          <div key={`title-${roundNumber}`}>
            <motion.div
              className="flex items-center"
              style={{ gap: 18 }}
              initial={reduceMotion ? false : { opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: t0 }}
            >
              <span style={{ width: 14, height: 14, borderRadius: 999, background: GRADIENT }} />
              <span
                style={{
                  fontSize: 30,
                  fontWeight: 800,
                  letterSpacing: "0.32em",
                  textTransform: "uppercase",
                  color: SCREEN_COLORS.cyan300,
                }}
              >
                Round {roundNumber}
                {totalRounds ? ` of ${totalRounds}` : ""} complete
              </span>
            </motion.div>

            <motion.h1
              style={{
                fontSize: 88,
                fontWeight: 900,
                lineHeight: 1,
                letterSpacing: "-0.035em",
                marginTop: 10,
              }}
              initial={reduceMotion ? false : { opacity: 0, scale: 1.14, filter: "blur(16px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.58, ease: EASE, delay: t0 + 0.06 }}
            >
              Round break
            </motion.h1>
          </div>

          {/* Countdown to the next round */}
          <motion.div
            key={`clock-${roundNumber}`}
            className="flex shrink-0 flex-col items-end"
            initial={reduceMotion ? false : { opacity: 0, y: -28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE, delay: t0 + 0.1 }}
          >
            <span
              style={{
                fontSize: 24,
                fontWeight: 800,
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                color: "#94a3b8",
              }}
            >
              Next round in
            </span>
            <motion.div
              className="flex items-baseline"
              style={{ gap: 14, marginTop: 6 }}
              animate={reduceMotion ? undefined : { scale: [1, 1.045, 1] }}
              transition={reduceMotion ? undefined : { duration: 1, repeat: Infinity, ease: "easeInOut" }}
            >
              <span
                style={{
                  fontSize: 112,
                  fontWeight: 900,
                  lineHeight: 0.9,
                  color: tone.main,
                  fontVariantNumeric: "tabular-nums",
                  textShadow: `0 0 52px ${tone.glow}55`,
                }}
              >
                {shown}
              </span>
              <span style={{ fontSize: 40, fontWeight: 800, color: "#94a3b8" }}>s</span>
            </motion.div>
          </motion.div>
        </div>

        {/* ---- Leaderboard ----
            Keyed on roundNumber only: the cascade replays once per round,
            and rows survive the 3s poll so `layout` can animate reorders. */}
        <div key={`board-${roundNumber}`} className="flex flex-1 flex-col" style={{ gap: 8, marginTop: 22 }}>
          <AnimatePresence initial={false}>
            {ranked.map((entry, i) => {
              const accent = i < 3 ? getPodiumAccent(i + 1) : null;
              const podium = accent ? { ring: accent.ring, text: accent.text, wash: withAlpha(accent.text, PODIUM_WASH_ALPHA[i]) } : null;
              const delta = entry.previousRank != null ? entry.previousRank - (i + 1) : 0;

              return (
                <motion.div
                  key={entry.id}
                  layout={!reduceMotion}
                  className="flex items-center"
                  style={{
                    gap: 32,
                    padding: "0 40px",
                    height: podium ? 86 : 72,
                    borderRadius: 20,
                    background: podium ? podium.wash : "rgba(15,23,42,0.55)",
                    border: `1px solid ${podium ? podium.ring : "rgba(148,163,184,0.14)"}`,
                    boxShadow: podium ? `inset 4px 0 0 0 ${podium.text}` : "none",
                  }}
                  initial={reduceMotion ? false : { opacity: 0, x: -80, filter: "blur(8px)" }}
                  animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                  exit={reduceMotion ? undefined : { opacity: 0, x: 60 }}
                  transition={{
                    duration: 0.5,
                    ease: EASE,
                    delay: reduceMotion ? 0 : t0 + 0.28 + i * 0.085,
                    layout: { duration: 0.65, ease: EASE },
                  }}
                >
                  <span
                    style={{
                      width: 72,
                      fontSize: podium ? 62 : 50,
                      fontWeight: 900,
                      lineHeight: 1,
                      color: podium ? podium.text : "#94a3b8",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {i + 1}
                  </span>

                  <span
                    className="flex-1 truncate"
                    style={{ fontSize: podium ? 54 : 46, fontWeight: podium ? 800 : 700, letterSpacing: "-0.01em" }}
                  >
                    {entry.name}
                  </span>

                  {delta !== 0 && (
                    <span
                      style={{
                        fontSize: 26,
                        fontWeight: 800,
                        letterSpacing: "0.04em",
                        color: delta > 0 ? SCREEN_COLORS.emerald300 : "#94a3b8",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {delta > 0 ? `▲ ${delta}` : `▼ ${Math.abs(delta)}`}
                    </span>
                  )}

                  <span
                    style={{
                      minWidth: 190,
                      textAlign: "right",
                      fontSize: podium ? 58 : 50,
                      fontWeight: 900,
                      color: podium ? podium.text : "#f8fafc",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {entry.score.toLocaleString()}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </AutoScaleToFit>
    </div>
  );
}
