"use client";

import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { SCREEN_COLORS, SCREEN_EASE as EASE } from "@/lib/venueScreenBrand";

/* ------------------------------------------------------------------ *
 * <TvGoLiveTakeover />
 * The 1.8s moment when a venue screen flips from attract mode into a
 * live game. Renders over the game content and removes itself.
 *
 * Authored via Claude Web UI (Prompt H), integrated into the venue screen.
 *
 * Category Blitz color note: the shared authoring preamble said "Category
 * Blitz is emerald," which was stale — this codebase's actual Blitz brand
 * identity is fuchsia → violet (`--ht-game-blitz` in app/globals.css,
 * `CATEGORY_BLITZ_THEME` in lib/venueScreenBrand.ts), corrected here from
 * the same emerald mismatch already fixed in Prompts D and E. Kept as
 * originally authored (fuchsia) — it's the one that's actually on-brand.
 *
 * "Fire once, never replay" is handled ENTIRELY by the caller
 * (VenueScreenClient), not by this component: the caller only mounts
 * <TvGoLiveTakeover> when it client-detects a genuine idle → live
 * transition on a poll AFTER the first (so a page load/reload straight
 * into an already-live game never mounts it), and unmounts it itself via
 * `onComplete`. That sidesteps the original design's local `Date.now()`
 * staleness check and `done` state entirely — both would have required
 * calling `Date.now()` or mutating a ref during render, which this
 * project's stricter hooks lint forbids (see TvQuestionReveal for the same
 * class of fix elsewhere). The one remaining effect below only starts a
 * timer whose callback (not the effect body) calls `onComplete` — the same
 * safe "subscription" pattern already used throughout this codebase.
 * ------------------------------------------------------------------ */

export type GameLabel = "Live Trivia" | "Category Blitz";

export type TvGoLiveTakeoverProps = {
  gameLabel: GameLabel;
  venueName: string;
  onComplete?: () => void;
};

const TOTAL = 1.85; // seconds, end to end

const RAMPS: Record<GameLabel, [string, string, string]> = {
  "Live Trivia": [SCREEN_COLORS.cyan500, SCREEN_COLORS.blue600, SCREEN_COLORS.violet600],
  "Category Blitz": [SCREEN_COLORS.fuchsia400, SCREEN_COLORS.violet500, SCREEN_COLORS.violet600],
};

export function TvGoLiveTakeover({ gameLabel, venueName, onComplete }: TvGoLiveTakeoverProps) {
  const reduceMotion = useReducedMotion();
  const ramp = RAMPS[gameLabel] ?? RAMPS["Live Trivia"];
  const gradient = `linear-gradient(115deg, ${ramp[0]} 0%, ${ramp[1]} 52%, ${ramp[2]} 100%)`;

  // The caller mounts/unmounts this component to control its lifetime; this
  // effect only starts the "let the caller know we're done" timer.
  useEffect(() => {
    const id = window.setTimeout(() => onComplete?.(), TOTAL * 1000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per mount, by design
  }, []);

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden"
      style={{
        zIndex: 60,
        background: SCREEN_COLORS.canvas,
        color: "#f8fafc",
        transformOrigin: "center",
      }}
      initial={{ opacity: 1, scale: 1 }}
      animate={
        reduceMotion
          ? { opacity: [1, 1, 0], scale: 1 }
          : { opacity: [1, 1, 1, 0], scale: [1, 1, 1, 0.93] }
      }
      transition={
        reduceMotion
          ? { duration: TOTAL, times: [0, 0.82, 1], ease: "linear" }
          : { duration: TOTAL, times: [0, 0.72, 0.86, 1], ease: EASE }
      }
    >
      {/* ---- Wipe: three panels sweep across in quick succession ---- */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-0"
          style={{ background: i === 2 ? gradient : ramp[i], transformOrigin: "left center" }}
          initial={reduceMotion ? { scaleX: 1 } : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: 0.34 + i * 0.05, ease: [0.7, 0, 0.24, 1], delay: i * 0.055 }
          }
        />
      ))}

      {/* Impact flash at the end of the wipe */}
      {!reduceMotion && (
        <motion.div
          className="absolute inset-0"
          style={{ background: "#ffffff" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.85, 0] }}
          transition={{ duration: 0.34, times: [0, 0.25, 1], ease: "easeOut", delay: 0.3 }}
        />
      )}

      {/* Vignette so the huge type stays readable over the gradient */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1400px 900px at 50% 50%, rgba(2,6,23,0) 0%, rgba(2,6,23,0.42) 78%, rgba(2,6,23,0.62) 100%)",
        }}
      />

      {/* ---- Content ---- */}
      <div className="relative flex h-full flex-col items-center justify-center" style={{ gap: 18 }}>
        <motion.div
          className="flex items-center"
          style={{ gap: 22 }}
          initial={reduceMotion ? false : { opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE, delay: reduceMotion ? 0 : 0.44 }}
        >
          <span
            style={{ width: 18, height: 18, borderRadius: 999, background: "#ffffff", boxShadow: "0 0 30px rgba(255,255,255,0.9)" }}
          />
          <span style={{ fontSize: 40, fontWeight: 900, letterSpacing: "0.44em", textTransform: "uppercase" }}>We&apos;re live</span>
        </motion.div>

        <motion.div
          style={{
            fontSize: 148,
            fontWeight: 900,
            lineHeight: 1,
            letterSpacing: "-0.045em",
            textAlign: "center",
            padding: "0 80px",
            textShadow: "0 0 90px rgba(255,255,255,0.45)",
          }}
          initial={reduceMotion ? false : { opacity: 0, scale: 1.32, filter: "blur(22px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.58, ease: EASE, delay: reduceMotion ? 0 : 0.5 }}
        >
          {gameLabel}
        </motion.div>

        <motion.div
          style={{ fontSize: 52, fontWeight: 800, letterSpacing: "-0.01em", color: "rgba(248,250,252,0.86)", textAlign: "center", padding: "0 80px" }}
          initial={reduceMotion ? false : { opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: reduceMotion ? 0 : 0.66 }}
        >
          {venueName}
        </motion.div>
      </div>
    </motion.div>
  );
}
