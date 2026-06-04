"use client";

import { useEffect, useInsertionEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import type { GameplayAnimationProps } from "@/types/animation";

// ─── Constants ────────────────────────────────────────────────────────────────

const BINGO_LETTERS = [
  { char: "B", color: "#fb7185" }, // rose-400
  { char: "I", color: "#fbbf24" }, // amber-400
  { char: "N", color: "#34d399" }, // emerald-400
  { char: "G", color: "#38bdf8" }, // sky-400
  { char: "O", color: "#a78bfa" }, // violet-400
] as const;

const CONFETTI_COLORS = [
  "#fb7185", // rose-400
  "#fbbf24", // amber-400
  "#34d399", // emerald-400
  "#38bdf8", // sky-400
  "#a78bfa", // violet-400
] as const;

const CONFETTI_STYLE_ID  = "bingo-win-confetti-keyframes";
const CONFETTI_COUNT     = 20;

// Module-level injection guard — survives HMR via the DOM ID check
let confettiKeyframesInjected = false;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConfettiParticle {
  id:       number;
  xPercent: number;          // 10–90 vw
  duration: number;          // 1200–2200 ms
  delay:    number;          // 0–600 ms
  rotation: number;          // 180–720 deg
  drift:    number;          // -60 to +60 px x drift
  color:    string;
}

// ─── Style injection ──────────────────────────────────────────────────────────

function injectConfettiKeyframes(): void {
  if (confettiKeyframesInjected) return;
  if (typeof document === "undefined") return;
  if (document.getElementById(CONFETTI_STYLE_ID) !== null) {
    confettiKeyframesInjected = true;
    return;
  }

  const style = document.createElement("style");
  style.id = CONFETTI_STYLE_ID;
  // --drift   : per-particle horizontal wander (px)
  // --rotation: per-particle total rotation (deg)
  // Drop from top:-20px to below viewport; fade out at 90% of travel
  style.textContent = `
    @keyframes bingo-win-confetti-fall {
      0% {
        transform: translateY(-20px) translateX(0px) rotate(0deg);
        opacity: 1;
      }
      90% {
        opacity: 1;
      }
      100% {
        transform: translateY(calc(100vh + 40px)) translateX(var(--bwc-drift)) rotate(var(--bwc-rotation));
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
  confettiKeyframesInjected = true;
}

// ─── Confetti particle generation ────────────────────────────────────────────

function generateConfetti(): ConfettiParticle[] {
  return Array.from({ length: CONFETTI_COUNT }, (_, i): ConfettiParticle => ({
    id:       i,
    xPercent: 10  + Math.random() * 80,              // 10–90 vw
    duration: 1200 + Math.random() * 1000,            // 1200–2200 ms
    delay:    Math.random() * 600,                    // 0–600 ms
    rotation: 180 + Math.random() * 540,              // 180–720 deg
    drift:    (Math.random() - 0.5) * 120,            // -60 to +60 px
    color:    CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  }));
}

// ─── Root component ───────────────────────────────────────────────────────────

export function BingoWinAnimation({ onComplete }: GameplayAnimationProps) {
  const cancelledRef = useRef<boolean>(false);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inject keyframes synchronously before first paint (useInsertionEffect fires
  // before useEffect and before the browser has a chance to paint, ensuring the
  // @keyframes rule exists before any confetti element is inserted into the DOM)
  useInsertionEffect(() => {
    injectConfettiKeyframes();
  }, []);

  // Stable confetti data — one generation per mount, never re-renders
  const confetti = useMemo<ConfettiParticle[]>(() => generateConfetti(), []);

  // Read reward subtitle from DOM (best-effort, falls back gracefully)
  const subtitleRef = useRef<string>("Points Claimed!");

  useEffect(() => {
    if (typeof document !== "undefined") {
      const el = document.querySelector<HTMLElement>("[data-bingo-card-id]");
      if (el !== null) {
        const text = el.textContent?.trim() ?? "";
        if (text.length > 0) subtitleRef.current = text;
      }
    }

    timerRef.current = setTimeout(() => {
      if (!cancelledRef.current) onComplete();
    }, 2800);

    return () => {
      cancelledRef.current = true;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* ── PHASE 1: Casino felt overlay (0–400ms) ─────────────────────────── */}
      <CasinoOverlay />

      {/* ── PHASE 3: Confetti rain (500–2400ms, CSS animation) ──────────────── */}
      <ConfettiRain particles={confetti} />

      {/* ── PHASE 2: BINGO letters drop in (200–900ms) ──────────────────────── */}
      <BingoLetters />

      {/* ── PHASE 4: Gold ring badge (900–2400ms) ───────────────────────────── */}
      <WinBadge subtitle={subtitleRef.current} />
    </>
  );
}

// ─── Phase 1: Casino felt overlay ─────────────────────────────────────────────

function CasinoOverlay() {
  return (
    <motion.div
      style={{
        position:        "fixed",
        inset:           0,
        backgroundColor: "rgba(12,58,46,0.90)", // #0c3a2e/90
        backdropFilter:  "blur(2px)",
        transformOrigin: "top center",
        pointerEvents:   "none",
        willChange:      "transform, opacity",
        zIndex:          0,
      }}
      initial={{ opacity: 0, scaleY: 0 }}
      animate={{ opacity: 1, scaleY: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    />
  );
}

// ─── Phase 2: BINGO letters ────────────────────────────────────────────────────

function BingoLetters() {
  return (
    <div
      style={{
        position:       "fixed",
        top:            "38%",
        left:           0,
        right:          0,
        display:        "flex",
        justifyContent: "center",
        alignItems:     "center",
        gap:            "0.75rem",
        pointerEvents:  "none",
        zIndex:         2,
      }}
    >
      {BINGO_LETTERS.map(({ char, color }, i) => (
        <motion.span
          key={char}
          style={{
            display:    "block",
            color,
            fontSize:   "4.5rem",    // text-7xl
            fontWeight: 900,
            fontFamily: "'Bree Serif', 'Nunito', serif",
            lineHeight: 1,
            textShadow: `0 0 30px ${color}`,
            willChange: "transform, opacity",
            userSelect: "none",
          }}
          // Drop from above + spring overshoot on landing
          initial={{ y: -80, opacity: 0, scale: 1 }}
          animate={{
            y:       [null, 0,    0   ],
            opacity: [null, 1,    1   ],
            scale:   [null, 1.15, 1.0 ],
          }}
          transition={{
            delay:   0.2 + i * 0.08,            // 200ms base + 80ms stagger
            duration: 0.45,
            y: {
              type:      "spring",
              stiffness: 500,
              damping:   28,
              // y times relative to this transition's duration:
            },
            scale: {
              times:    [0, 0.7, 1],
              ease:     ["easeOut", "easeInOut"],
              duration: 0.45,
            },
            opacity: {
              duration: 0.15,
              ease:     "easeOut",
            },
          }}
        >
          {char}
        </motion.span>
      ))}
    </div>
  );
}

// ─── Phase 3: Confetti rain ────────────────────────────────────────────────────

interface ConfettiRainProps {
  particles: ConfettiParticle[];
}

function ConfettiRain({ particles }: ConfettiRainProps) {
  return (
    <>
      {particles.map((p: ConfettiParticle) => (
        <div
          key={p.id}
          style={{
            position:        "fixed",
            left:            `${p.xPercent}vw`,
            top:             "-20px",
            width:           "6px",
            height:          "12px",
            borderRadius:    "2px",          // rounded-sm
            backgroundColor: p.color,
            pointerEvents:   "none",
            willChange:      "transform, opacity",
            zIndex:          1,
            // Per-particle CSS custom properties consumed by @keyframes
            ["--bwc-drift"     as string]: `${p.drift}px`,
            ["--bwc-rotation"  as string]: `${p.rotation}deg`,
            animationName:           "bingo-win-confetti-fall",
            animationDuration:       `${p.duration}ms`,
            animationDelay:          `${p.delay}ms`,
            animationTimingFunction: "linear",
            animationFillMode:       "forwards",
            // Hidden until delay elapses
            opacity:                 0,
          }}
        />
      ))}
    </>
  );
}

// ─── Phase 4: Win badge ────────────────────────────────────────────────────────

interface WinBadgeProps {
  subtitle: string;
}

function WinBadge({ subtitle }: WinBadgeProps) {
  return (
    <div
      style={{
        position:       "fixed",
        inset:          0,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        pointerEvents:  "none",
        zIndex:         3,
      }}
    >
      <motion.div
        style={{
          border:          "4px solid #facc15",
          borderRadius:    "9999px",             // rounded-full
          padding:         "2rem",               // p-8
          display:         "flex",
          flexDirection:   "column",
          alignItems:      "center",
          justifyContent:  "center",
          gap:             "0.5rem",
          backgroundColor: "rgba(12,58,46,0.70)",
          willChange:      "transform, opacity",
          userSelect:      "none",
        }}
        // Enter: scale 0 → 1.1 → 1 spring
        // Hold until 2200ms (total 2800ms → 2200/2800 = 0.786 of duration)
        // Exit: scale → 1.3, opacity → 0 over last 600ms (0.786 → 1.0)
        initial={{ scale: 0, opacity: 0 }}
        animate={{
          scale:   [0,    1.1,  1.0,  1.0,  1.3],
          opacity: [0,    1,    1,    1,    0  ],
        }}
        transition={{
          // Delay 900ms for badge to appear after letters settle
          delay:    0.9,
          duration: 1.9,            // 900ms + 1900ms = 2800ms total
          times:    [0, 0.158, 0.263, 0.684, 1.0],
          //          ^         ^       ^       ^
          //        0ms      300ms   500ms   1900ms (relative to delay)
          //        (0.9s)   (1.2s)  (1.4s)  (2.8s) absolute
          scale: {
            ease: ["easeOut", "easeOut", "linear", "easeIn"],
          },
          opacity: {
            ease: ["easeOut", "linear", "linear", "easeIn"],
          },
        }}
      >
        <span
          style={{
            fontSize:   "1.875rem",  // text-3xl
            fontWeight: 900,
            color:      "#facc15",
            lineHeight: 1,
            textShadow: "0 0 20px rgba(250,204,21,0.8)",
          }}
        >
          🎉 BINGO!
        </span>
        <span
          style={{
            fontSize:      "0.875rem",  // text-sm
            fontWeight:    700,
            color:         "rgba(250,204,21,0.75)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            lineHeight:    1,
          }}
        >
          {subtitle}
        </span>
      </motion.div>
    </div>
  );
}