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
  return Array.from({ length: 20 }, (_, i): FireParticle => {
    const xPercent = 5 + Math.random() * 90;             // 5–95vw
    const targetYPercent = 10 + Math.random() * 50;      // 10–60vh from top
    const fontSize = 36 + Math.random() * 28;            // 36–64px
    const duration = 700 + Math.random() * 500;          // 700–1200ms
    const delay = Math.random() * 500;                   // 0–500ms

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
    }, 2000);

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
          background: "linear-gradient(135deg, rgba(245,158,11,0.92), rgba(249,115,22,0.92))",
          border: "2px solid rgba(251,191,36,1)",
          borderRadius: "1.25rem",
          paddingLeft: "2.5rem",
          paddingRight: "2.5rem",
          paddingTop: "1.25rem",
          paddingBottom: "1.25rem",
          maxWidth: "300px",
          textAlign: "center",
          willChange: "transform, opacity",
          boxShadow: "0 0 40px 12px rgba(245,158,11,0.55), 0 0 80px 24px rgba(249,115,22,0.30)",
        }}
        // Enter: scale 0 → overshoot 1.35 → settle 1.0
        // Hold through t=1600ms, then fly up + fade out over 400ms
        //
        // Keyframe normalised to 2.0s total:
        //   t=0ms    (0.00): scale 0,    y 0,   opacity 0
        //   t=220ms  (0.11): scale 1.35, y 0,   opacity 1   ← spring peak
        //   t=380ms  (0.19): scale 1.0,  y 0,   opacity 1   ← settle
        //   t=1600ms (0.80): scale 1.0,  y 0,   opacity 1   ← hold end
        //   t=2000ms (1.00): scale 1.0,  y -60, opacity 0   ← exit
        initial={{ scale: 0, y: 0, opacity: 0 }}
        animate={{
          scale:   [0,    1.35, 1.0,  1.0,  1.0 ],
          y:       [0,    0,    0,    0,    -60 ],
          opacity: [0,    1,    1,    1,    0   ],
        }}
        transition={{
          duration: 2.0,
          times: [0, 0.11, 0.19, 0.80, 1.0],
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
            fontSize: "2.25rem",
            fontWeight: 900,
            color: "rgba(255,255,255,1)",
            lineHeight: 1.15,
            textShadow: "0 2px 8px rgba(180,80,0,0.6)",
          }}
        >
          🔥 On Fire!
        </p>
        <p
          style={{
            margin: "0.35rem 0 0",
            fontSize: "0.875rem",
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            color: "rgba(255,247,200,0.95)",
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
          "radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, rgba(245,158,11,0.55) 100%)",
        pointerEvents: "none",
        willChange: "opacity",
        zIndex: 9998,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 0.3, 1, 0] }}
      transition={{
        duration: 1.4,
        times: [0, 0.2, 0.45, 0.6, 1.0],
        ease: "easeInOut",
      }}
    />
  )
}