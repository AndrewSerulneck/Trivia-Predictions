"use client";

import { useEffect, useRef, useState } from "react";
import { motion, animate } from "framer-motion";
import type { CSSProperties } from "react";
import type { GameplayAnimationProps } from "@/types/animation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RowRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// ─── Root component ───────────────────────────────────────────────────────────

export function LiveTriviaRoundBreakAnimation({ onComplete }: GameplayAnimationProps) {
  const cancelledRef = useRef<boolean>(false);
  const lifecycleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowQueryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // useState so the row highlight div mounts after the deferred DOM read,
  // triggering a re-render with the correct fixed position.
  const [rowRect, setRowRect] = useState<RowRect | null>(null);

  useEffect(() => {
    // ── Layer 3: poll for the player's leaderboard row ──────────────────────
    // The leaderboard renders asynchronously, so retry every 100ms (starting at
    // 100ms) for up to 1200ms. If the row never appears (e.g. viewer outside the
    // top 10), give up gracefully — Layer 3 is simply skipped.
    const POLL_INTERVAL = 100;
    const POLL_DEADLINE = 1200;
    let elapsed = 0;

    const pollForRow = (): void => {
      if (cancelledRef.current) return;
      if (typeof document === "undefined") return;

      // Use attribute-contains selector — safer than escaping slashes in class
      const row = document.querySelector<HTMLTableRowElement>(
        'tr[class*="bg-fuchsia-950"]'
      );

      if (row !== null) {
        const rect = row.getBoundingClientRect();
        setRowRect({
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        });
        return;
      }

      elapsed += POLL_INTERVAL;
      if (elapsed < POLL_DEADLINE) {
        rowQueryTimerRef.current = setTimeout(pollForRow, POLL_INTERVAL);
      }
    };

    rowQueryTimerRef.current = setTimeout(pollForRow, POLL_INTERVAL);

    // ── Lifecycle timer ─────────────────────────────────────────────────────
    lifecycleTimerRef.current = setTimeout(() => {
      if (!cancelledRef.current) {
        onComplete();
      }
    }, 1400);

    return () => {
      cancelledRef.current = true;
      if (lifecycleTimerRef.current !== null) clearTimeout(lifecycleTimerRef.current);
      if (rowQueryTimerRef.current !== null) clearTimeout(rowQueryTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* ── LAYER 1: Phase transition flash (0–400ms) ───────────────────────── */}
      <PhaseFlash />

      {/* ── LAYER 2: "Round Over · Check Your Rank" badge (100ms–900ms) ─────── */}
      <RoundOverBadge />

      {/* ── LAYER 3: Player row highlight pulse (fires after 800ms DOM read) ── */}
      {rowRect !== null && <RowPulse rowRect={rowRect} />}
    </>
  );
}

// ─── Layer 1: Phase transition flash ─────────────────────────────────────────

function PhaseFlash() {
  const style: CSSProperties = {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(217,70,239,0.15)", // fuchsia-500/15
    pointerEvents: "none",
    willChange: "opacity",
    zIndex: 9997,
  };

  return (
    <motion.div
      style={style}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0.6, 0] }}
      transition={{
        duration: 0.4,
        times: [0, 0.12, 1],
        ease: "easeOut",
      }}
    />
  );
}

// ─── Layer 2: Round Over badge ────────────────────────────────────────────────

function RoundOverBadge() {
  const wrapperStyle: CSSProperties = {
    position: "fixed",
    top: "28%",
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "center",
    pointerEvents: "none",
    zIndex: 10000,
  };

  const pillStyle: CSSProperties = {
    backgroundColor: "rgba(74,4,78,0.80)",     // fuchsia-950/80
    border: "1px solid rgba(232,121,249,0.60)", // fuchsia-400/60
    borderRadius: "1rem",                        // rounded-2xl
    paddingLeft: "2rem",
    paddingRight: "2rem",
    paddingTop: "1rem",
    paddingBottom: "1rem",
    color: "rgba(250,232,255,1)",                // fuchsia-100
    fontWeight: 900,
    fontSize: "1.5rem",                          // text-2xl
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    willChange: "transform, opacity",
    whiteSpace: "nowrap",
    userSelect: "none",
  };

  // Timeline (1.4s total):
  //   t=100ms  (0.071): enter begins
  //   t=~350ms (0.250): spring settles at y=0, opacity 1
  //   t=900ms  (0.643): hold ends, exit begins
  //   t=1200ms (0.857): exit complete (y=-20, opacity=0)
  //   t=1400ms (1.000): component done
  //
  // Framer keyframe times are normalised to the 1.3s duration window
  // (100ms delay handled via `initial` held until first keyframe at t=0.077):
  return (
    <div style={wrapperStyle}>
      <motion.div
        style={pillStyle}
        // Start offset downward; spring into position
        initial={{ y: -30, opacity: 0 }}
        animate={{
          y:       [-30,  0,    0,    -20],
          opacity: [0,    1,    1,    0  ],
        }}
        transition={{
          // Delay 100ms, then run for 1300ms → total 1400ms
          delay: 0.1,
          duration: 1.3,
          times: [0, 0.192, 0.615, 0.846],
          y: {
            ease: ["easeOut", "linear", "easeIn"],
          },
          opacity: {
            ease: ["easeOut", "linear", "easeIn"],
          },
        }}
      >
        Round Over · Check Your Rank
      </motion.div>
    </div>
  );
}

// ─── Layer 3: Player row pulse ────────────────────────────────────────────────

interface RowPulseProps {
  rowRect: RowRect;
}

function RowPulse({ rowRect }: RowPulseProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = overlayRef.current;
    if (el === null) return;

    // Sequence: box-shadow pulse + background fade, both 600ms
    animate(
      el,
      {
        boxShadow: [
          "0px 0px 0px 0px rgba(192,38,211,0)",
          "0px 0px 0px 6px rgba(192,38,211,0.55)",
          "0px 0px 0px 0px rgba(192,38,211,0)",
        ],
        backgroundColor: [
          "rgba(192,38,211,0.15)",
          "rgba(192,38,211,0.15)",
          "rgba(192,38,211,0)",
        ],
      },
      {
        duration: 0.6,
        ease: "easeInOut",
      }
    );
  }, []);

  const style: CSSProperties = {
    position: "fixed",
    left: rowRect.left,
    top: rowRect.top,
    width: rowRect.width,
    height: rowRect.height,
    borderRadius: "0.25rem",                       // slight rounding to hug the row
    border: "2px solid rgba(232,121,249,1)",        // fuchsia-400
    backgroundColor: "rgba(192,38,211,0.15)",       // initial bg before animate()
    pointerEvents: "none",
    willChange: "box-shadow, background-color",
    zIndex: 9999,
  };

  return <div ref={overlayRef} style={style} />;
}