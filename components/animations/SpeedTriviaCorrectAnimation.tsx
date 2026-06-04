"use client";

import { useEffect, useInsertionEffect, useMemo, useRef } from "react";
import { motion, useAnimationControls } from "framer-motion";
import type { GameplayAnimationProps } from "@/types/animation";

// ─── Prop type (extends base with optional pointsLabel) ───────────────────────

interface SpeedTriviaCorrectAnimationProps extends GameplayAnimationProps {
  pointsLabel?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PARTICLE_COUNT  = 10;
const PARTICLE_COLORS = ["#34d399", "#34d399", "#facc15", "#34d399", "#facc15"] as const;

const SCATTER_STYLE_ID = "stc-scatter-keyframes";
let   scatterInjected  = false;

// ─── CSS keyframe injection ───────────────────────────────────────────────────
// Uses --tx / --ty CSS custom properties set inline per particle.
// Injected via useInsertionEffect so the rule exists before first paint.

function injectScatterKeyframes(): void {
  if (scatterInjected) return;
  if (typeof document === "undefined") return;
  if (document.getElementById(SCATTER_STYLE_ID) !== null) {
    scatterInjected = true;
    return;
  }
  const style = document.createElement("style");
  style.id    = SCATTER_STYLE_ID;
  style.textContent = `
    @keyframes stc-scatter {
      0%   { transform: translate(-50%, -50%) translate(0px, 0px); opacity: 1; }
      70%  { opacity: 1; }
      100% { transform: translate(-50%, -50%) translate(var(--tx), var(--ty)); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
  scatterInjected = true;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Particle {
  id:       number;
  size:     number;   // px: 6–10
  color:    string;
  tx:       number;   // final x offset px
  ty:       number;   // final y offset px
  duration: number;   // ms: 600–900
  delay:    number;   // ms: 0–150
}

// ─── Particle generation ──────────────────────────────────────────────────────

function generateParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i): Particle => {
    // Spread across full 360° with slight randomisation off perfect evens
    const baseDeg  = (360 / PARTICLE_COUNT) * i;
    const jitter   = (Math.random() - 0.5) * 30;
    const angle    = ((baseDeg + jitter) * Math.PI) / 180;
    const distance = 55 + Math.random() * 55; // 55–110px

    return {
      id:       i,
      size:     6 + Math.round(Math.random() * 4), // 6–10px
      color:    PARTICLE_COLORS[i % PARTICLE_COLORS.length],
      tx:       Math.cos(angle) * distance,
      ty:       Math.sin(angle) * distance,
      duration: 600 + Math.round(Math.random() * 300), // 600–900ms
      delay:    Math.round(Math.random() * 150),        // 0–150ms
    };
  });
}

// ─── Root component ───────────────────────────────────────────────────────────

export function SpeedTriviaCorrectAnimation({
  onComplete,
  pointsLabel = "+2 pts",
}: SpeedTriviaCorrectAnimationProps) {
  const cancelledRef = useRef<boolean>(false);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inject CSS keyframes before first paint
  useInsertionEffect(() => {
    injectScatterKeyframes();
  }, []);

  // Stable particles — generated once per mount
  const particles = useMemo<Particle[]>(() => generateParticles(), []);

  const badgeControls  = useAnimationControls();
  const pointsControls = useAnimationControls();

  useEffect(() => {
    // ── Badge: spring in → hold → exit ─────────────────────────────────────
    void (async (): Promise<void> => {
      // Spring entrance to slight overshoot
      await badgeControls.start({
        scale:   1.15,
        opacity: 1,
        y:       0,
        transition: {
          type:      "spring",
          stiffness: 480,
          damping:   22,
          mass:      0.7,
        },
      });
      // Settle to 1.0
      await badgeControls.start({
        scale: 1.0,
        transition: { duration: 0.08, ease: "easeOut" },
      });
      // Hold ~600ms
      await new Promise<void>((res) => {
        timerRef.current = setTimeout(res, 600);
      });
      if (cancelledRef.current) return;
      // Exit upward
      await badgeControls.start({
        y:       -40,
        opacity: 0,
        transition: { duration: 0.3, ease: "easeIn" },
      });
    })();

    // ── Points counter: rise and fade ───────────────────────────────────────
    void (async (): Promise<void> => {
      // Snap visible
      await pointsControls.start({
        opacity: 1,
        transition: { duration: 0.05 },
      });
      if (cancelledRef.current) return;
      // Rise 120px
      await pointsControls.start({
        y:       -120,
        transition: {
          duration: 0.9,
          ease:     [0.22, 1, 0.36, 1],
        },
      });
      if (cancelledRef.current) return;
      // Fade out
      await pointsControls.start({
        opacity: 0,
        transition: { duration: 0.2, ease: "easeIn" },
      });
    })();

    // ── Lifecycle ────────────────────────────────────────────────────────────
    const lifecycleTimer = setTimeout(() => {
      if (!cancelledRef.current) onComplete();
    }, 1100);

    return () => {
      cancelledRef.current = true;
      clearTimeout(lifecycleTimer);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      badgeControls.stop();
      pointsControls.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* ── LAYER 1: Central burst badge ─────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <motion.div
          animate={badgeControls}
          initial={{ scale: 0, opacity: 0, y: 20 }}
          className="rounded-full border border-[#34d399]/70 bg-emerald-500/20 px-8 py-4 text-2xl font-black uppercase tracking-[0.12em] text-emerald-100 shadow-[0_0_60px_rgba(52,211,153,0.5)]"
          style={{ willChange: "transform, opacity" }}
        >
          ✓ Correct
        </motion.div>
      </div>

      {/* ── LAYER 2: Points counter rising from bottom-center ────────────────── */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[28%] flex justify-center">
        <motion.span
          animate={pointsControls}
          initial={{ opacity: 0, y: 0 }}
          className="select-none font-black tracking-[0.08em]"
          style={{
            fontSize:   "36px",
            color:      "#facc15",
            textShadow: "0 0 20px rgba(250,204,21,0.9)",
            willChange: "transform, opacity",
          }}
        >
          {pointsLabel}
        </motion.span>
      </div>

      {/* ── LAYER 3: Particle scatter (pure CSS animation) ───────────────────── */}
      {particles.map((p: Particle) => (
        <div
          key={p.id}
          className="pointer-events-none fixed"
          style={{
            // Anchor each particle at viewport center
            left:   "50%",
            top:    "50%",
            width:  `${p.size}px`,
            height: `${p.size}px`,
            borderRadius: "9999px",
            backgroundColor: p.color,
            willChange: "transform, opacity",
            zIndex: 1,
            // Direction vectors consumed by @keyframes stc-scatter
            ["--tx" as string]: `${p.tx}px`,
            ["--ty" as string]: `${p.ty}px`,
            animationName:           "stc-scatter",
            animationDuration:       `${p.duration}ms`,
            animationDelay:          `${p.delay}ms`,
            animationTimingFunction: "ease-out",
            animationFillMode:       "forwards",
            // Hidden before animation delay elapses
            opacity: 0,
          }}
        />
      ))}
    </>
  );
}