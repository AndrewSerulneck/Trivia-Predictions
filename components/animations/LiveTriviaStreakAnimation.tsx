"use client";

import { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import type { GameplayAnimationProps } from "@/types/animation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FireParticle {
  id: number;
  /** vw percentage: 15–85 */
  xPercent: number;
  /** Target vh percentage from top: 20–60 */
  targetYPercent: number;
  /** px: 28–48 */
  fontSize: number;
  /** ms: 800–1400 */
  duration: number;
  /** ms: 0–400 */
  delay: number;
}

// ─── Module-level style injection guard ──────────────────────────────────────
// Ensures @keyframes is written to the DOM exactly once per session,
// even if multiple streak animations mount in the same session.

let keyframesInjected = false;

const KEYFRAMES_ID = "streak-fire-rise-keyframes";

function injectKeyframes(): void {
  if (keyframesInjected) return;
  if (typeof document === "undefined") return;
  if (document.getElementById(KEYFRAMES_ID) !== null) {
    keyframesInjected = true;
    return;
  }

  const style = document.createElement("style");
  style.id = KEYFRAMES_ID;
  // --fire-y is set inline per particle as the upward translate target.
  // X drift is baked into the left % position; no horizontal CSS var needed.
  style.textContent = `
    @keyframes streak-fire-rise {
      0% {
        transform: translateY(0px);
        opacity: 1;
      }
      80% {
        opacity: 1;
      }
      100% {
        transform: translateY(var(--fire-travel-y));
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
  keyframesInjected = true;
}

// ─── Particle generation (stable per render via useMemo) ─────────────────────

function generateParticles(): FireParticle[] {
  return Array.from({ length: 8 }, (_, i): FireParticle => {
    const xPercent = 15 + Math.random() * 70;           // 15–85vw
    const targetYPercent = 20 + Math.random() * 40;      // 20–60vh from top
    // Travel distance: from bottom (100vh) up to targetYPercent vh
    // expressed as a negative px value via CSS custom property at render
    const fontSize = 28 + Math.random() * 20;            // 28–48px
    const duration = 800 + Math.random() * 600;          // 800–1400ms
    const delay = Math.random() * 400;                   // 0–400ms

    return { id: i, xPercent, targetYPercent, fontSize, duration, delay };
  });
}

// ─── Root component ───────────────────────────────────────────────────────────

export function LiveTriviaStreakAnimation({ onComplete }: GameplayAnimationProps) {
  const cancelledRef = useRef<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable particle data — generated once at first render, never changes
  const particles = useMemo<FireParticle[]>(() => generateParticles(), []);

  useEffect(() => {
    // Inject @keyframes once per session
    injectKeyframes();

    timerRef.current = setTimeout(() => {
      if (!cancelledRef.current) {
        onComplete();
      }
    }, 1600);

    return () => {
      cancelledRef.current = true;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* ── LAYER 1: Fire emoji cascade ─────────────────────────────────────── */}
      <FireCascade particles={particles} />

      {/* ── LAYER 2: "On Fire!" streak badge ────────────────────────────────── */}
      <StreakBadge />

      {/* ── LAYER 3: Amber vignette edge pulse ──────────────────────────────── */}
      <VignettePulse />
    </>
  );
}

// ─── Layer 1: Fire cascade ────────────────────────────────────────────────────

interface FireCascadeProps {
  particles: FireParticle[];
}

function FireCascade({ particles }: FireCascadeProps) {
  return (
    <>
      {particles.map((p: FireParticle) => {
        // Travel distance from bottom of viewport to target Y position.
        // Particles start at top: 100vh (via CSS), travel upward.
        // --fire-travel-y is a negative value: -(100vh - targetYPercent vh)
        const travelVh = 100 - p.targetYPercent;
        const travelY = `-${travelVh}vh`;

        return (
          <span
            key={p.id}
            style={{
              position: "fixed",
              left: `${p.xPercent}vw`,
              top: "100vh",
              fontSize: `${p.fontSize}px`,
              lineHeight: 1,
              pointerEvents: "none",
              userSelect: "none",
              willChange: "transform",
              zIndex: 9997,
              // CSS custom property consumed by @keyframes streak-fire-rise
              ["--fire-travel-y" as string]: travelY,
              animationName: "streak-fire-rise",
              animationDuration: `${p.duration}ms`,
              animationDelay: `${p.delay}ms`,
              animationTimingFunction: "cubic-bezier(0.33, 1, 0.68, 1)",
              animationFillMode: "forwards",
              // Hidden before animation begins (delay > 0 frames)
              opacity: 0,
            }}
          >
            🔥
          </span>
        );
      })}
    </>
  );
}

// ─── Layer 2: Streak badge ────────────────────────────────────────────────────

function StreakBadge() {
  return (
    <div
      style={{
        position: "fixed",
        top: "40%",
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 10000,
      }}
    >
      <motion.div
        style={{
          background: "linear-gradient(to right, rgba(245,158,11,0.30), rgba(249,115,22,0.30))",
          border: "1px solid rgba(251,191,36,0.70)",  // amber-400/70
          borderRadius: "1rem",                         // rounded-2xl
          paddingLeft: "2rem",
          paddingRight: "2rem",
          paddingTop: "1rem",
          paddingBottom: "1rem",
          maxWidth: "240px",
          textAlign: "center",
          willChange: "transform, opacity",
        }}
        // Enter: scale 0 → overshoot 1.15 → settle 1.0 via spring
        // Hold at scale 1.0 through t=1300ms
        // Exit: y -40, opacity 0 over 300ms starting at t=1300ms
        //
        // Keyframe normalised to 1.6s total:
        //   t=0ms    (0.000): scale 0,    y 0,   opacity 0
        //   t=220ms  (0.138): scale 1.15, y 0,   opacity 1   ← spring peak
        //   t=350ms  (0.219): scale 1.0,  y 0,   opacity 1   ← settle
        //   t=1300ms (0.813): scale 1.0,  y 0,   opacity 1   ← hold end
        //   t=1600ms (1.000): scale 1.0,  y -40, opacity 0   ← exit
        initial={{ scale: 0, y: 0, opacity: 0 }}
        animate={{
          scale:   [0,    1.15, 1.0,  1.0,  1.0 ],
          y:       [0,    0,    0,    0,    -40 ],
          opacity: [0,    1,    1,    1,    0   ],
        }}
        transition={{
          duration: 1.6,
          times: [0, 0.138, 0.219, 0.813, 1.0],
          scale: {
            ease: ["easeOut", "easeOut", "linear", "linear"],
          },
          y: {
            ease: ["linear", "linear", "linear", "easeIn"],
          },
          opacity: {
            ease: ["easeOut", "linear", "linear", "easeIn"],
          },
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "1.5rem",       // text-2xl
            fontWeight: 900,
            color: "rgba(253,230,138,1)", // amber-200
            lineHeight: 1.2,
          }}
        >
          🔥 On Fire!
        </p>
        <p
          style={{
            margin: "0.25rem 0 0",
            fontSize: "0.75rem",      // text-xs
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            color: "rgba(251,191,36,0.80)", // amber-400/80
            lineHeight: 1,
          }}
        >
          Correct Streak!
        </p>
      </motion.div>
    </div>
  );
}

// ─── Layer 3: Vignette pulse ──────────────────────────────────────────────────

function VignettePulse() {
  return (
    <motion.div
      style={{
        position: "fixed",
        inset: 0,
        background:
          "radial-gradient(ellipse at center, rgba(0,0,0,0) 0%, rgba(245,158,11,0.15) 80%)",
        pointerEvents: "none",
        willChange: "opacity",
        zIndex: 9998,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0.8, 0] }}
      transition={{
        duration: 0.8,
        times: [0, 0.3, 1],
        ease: "easeInOut",
      }}
    />
  )
}