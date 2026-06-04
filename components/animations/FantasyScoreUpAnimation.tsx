"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import type { GameplayAnimationProps } from "@/types/animation";

// ─── Global window contract ───────────────────────────────────────────────────
// FantasyHome sets these before calling triggerAnimation("FANTASY_SCORE_UP"):
//   (window as Record<string, unknown>).__fantasyStatFlash   = change.flashLabel;
//   (window as Record<string, unknown>).__fantasyPointsDelta = change.pointsDelta;

declare global {
  interface Window {
    __fantasyStatFlash?:    string;
    __fantasyPointsDelta?:  number;
  }
}

// ─── Color theme helpers ──────────────────────────────────────────────────────

type StatTheme = "gold" | "cyan" | "emerald";

function resolveTheme(label: string): StatTheme {
  const up = label.toUpperCase();
  if (up.includes("HOME RUN") || up.includes("3-POINTER") || up.includes("TOUCHDOWN")) {
    return "gold";
  }
  if (up.includes("STEAL") || up.includes("BLOCK") || up.includes("INTERCEPTION") || up.includes("TURNOVER")) {
    return "cyan";
  }
  return "emerald";
}

interface ThemeTokens {
  color:      string;
  textShadow: string;
}

function themeTokens(theme: StatTheme): ThemeTokens {
  switch (theme) {
    case "gold":
      return {
        color:      "#facc15",
        textShadow: "0 0 20px rgba(250,204,21,0.9)",
      };
    case "cyan":
      return {
        color:      "#67e8f9", // cyan-300
        textShadow: "0 0 20px rgba(103,232,249,0.9)",
      };
    case "emerald":
    default:
      return {
        color:      "#6ee7b7", // emerald-300
        textShadow: "0 0 20px rgba(110,231,183,0.9)",
      };
  }
}

// ─── Root component ───────────────────────────────────────────────────────────

export function FantasyScoreUpAnimation({ onComplete }: GameplayAnimationProps) {
  const cancelledRef   = useRef<boolean>(false);
  const holdTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lifecycleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read window globals synchronously at mount so the first render already has
  // the correct label and theme — refs would not trigger a re-render.
  const [flashLabel] = useState<string>(() => {
    if (typeof window === "undefined") return "STAT UPDATE!";
    const v = window.__fantasyStatFlash;
    return typeof v === "string" && v.length > 0 ? v : "STAT UPDATE!";
  });
  const [pointsDelta] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const v = window.__fantasyPointsDelta;
    return typeof v === "number" && !Number.isNaN(v) ? v : null;
  });
  const theme  = resolveTheme(flashLabel);
  const tokens = themeTokens(theme);

  const labelControls = useAnimationControls();

  useEffect(() => {
    // ── Label: spring in → hold 600ms → exit ───────────────────────────────
    void (async (): Promise<void> => {
      await labelControls.start({
        y:       0,
        opacity: 1,
        transition: {
          type:      "spring",
          stiffness: 400,
          damping:   26,
        },
      });

      await new Promise<void>((resolve) => {
        holdTimerRef.current = setTimeout(resolve, 600);
      });

      if (cancelledRef.current) return;

      await labelControls.start({
        y:       -24,
        opacity: 0,
        transition: { duration: 0.25, ease: "easeIn" },
      });
    })();

    // ── Lifecycle ────────────────────────────────────────────────────────────
    lifecycleTimer.current = setTimeout(() => {
      if (!cancelledRef.current) onComplete();
    }, 1000);

    return () => {
      cancelledRef.current = true;
      if (holdTimerRef.current   !== null) clearTimeout(holdTimerRef.current);
      if (lifecycleTimer.current !== null) clearTimeout(lifecycleTimer.current);
      labelControls.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deltaLabel = pointsDelta !== null ? `+${pointsDelta.toFixed(1)} FP` : "+FP";

  return (
    <>
      {/* ── LAYER 1: Live action label (top 30%) ──────────────────────────────── */}
      <div className="pointer-events-none fixed inset-x-0 flex justify-center" style={{ top: "30%" }}>
        <motion.p
          animate={labelControls}
          initial={{ y: -20, opacity: 0 }}
          className="select-none font-black uppercase"
          style={{
            fontSize:      "28px",
            letterSpacing: "0.1em",
            color:         tokens.color,
            textShadow:    tokens.textShadow,
            willChange:    "transform, opacity",
            whiteSpace:    "nowrap",
          }}
        >
          {flashLabel}
        </motion.p>
      </div>

      {/* ── LAYER 2: Points delta ticker (top 46%, rises and fades) ──────────── */}
      <div className="pointer-events-none fixed inset-x-0 flex justify-center" style={{ top: "46%" }}>
        <motion.p
          className="select-none font-black"
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: -50, opacity: [0, 1, 1, 0] }}
          transition={{
            duration: 0.9,
            ease:     [0.22, 1, 0.36, 1],
            opacity: {
              times:    [0, 0.1, 0.75, 1],
              ease:     ["easeOut", "linear", "easeIn"],
              duration: 0.9,
            },
          }}
          style={{
            fontSize:   "20px",
            color:      tokens.color,
            textShadow: tokens.textShadow,
            willChange: "transform, opacity",
            whiteSpace: "nowrap",
          }}
        >
          {deltaLabel}
        </motion.p>
      </div>

      {/* ── LAYER 3: Glow ring expansion from bottom 20% ──────────────────────── */}
      <div
        className="pointer-events-none fixed inset-x-0 flex justify-center"
        style={{ bottom: "20%" }}
      >
        <motion.div
          className="rounded-full border border-cyan-400/40 bg-cyan-400/20"
          initial={{ scale: 0.5, opacity: 0.5 }}
          animate={{ scale: 2.5, opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{
            width:           "80px",
            height:          "80px",
            transformOrigin: "center center",
            willChange:      "transform, opacity",
            // Pull upward so the ring's center sits on the bottom:20% line
            translateY:      "-50%",
          }}
        />
      </div>
    </>
  );
}