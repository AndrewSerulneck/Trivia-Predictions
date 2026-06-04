"use client";

import { useEffect, useRef } from "react";
import { motion, useAnimationControls } from "framer-motion";
import type { GameplayAnimationProps } from "@/types/animation";

// ─── Constants ────────────────────────────────────────────────────────────────

// 6 evenly-spaced angles (degrees), starting at top-right
const PARTICLE_ANGLES_DEG = [0, 60, 120, 180, 240, 300] as const;
type ParticleAngle = (typeof PARTICLE_ANGLES_DEG)[number];

const PARTICLE_COLORS = ["#f97316", "#facc15"] as const;

// Each particle alternates between 40px and 60px travel distance
const PARTICLE_DISTANCES = [40, 60, 40, 60, 40, 60] as const;

// CSS keyframe name — injected once into the document
const SCATTER_KEYFRAME_ID = "bingo-scatter-keyframes";
let scatterKeyframesInjected = false;

function injectScatterKeyframes(): void {
  if (scatterKeyframesInjected) return;
  if (typeof document === "undefined") return;
  if (document.getElementById(SCATTER_KEYFRAME_ID) !== null) {
    scatterKeyframesInjected = true;
    return;
  }
  const style = document.createElement("style");
  style.id = SCATTER_KEYFRAME_ID;
  style.textContent = `
    @keyframes bingo-scatter {
      0%   { transform: translate(-50%, -50%) translate(0px, 0px); opacity: 1; }
      100% { transform: translate(-50%, -50%) translate(var(--tx), var(--ty)); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
  scatterKeyframesInjected = true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

interface ParticleDef {
  angle:    ParticleAngle;
  distance: number;
  color:    string;
  tx:       number;  // final x offset in px
  ty:       number;  // final y offset in px
}

function buildParticles(): ParticleDef[] {
  return PARTICLE_ANGLES_DEG.map((deg, i): ParticleDef => {
    const rad = degToRad(deg);
    const distance = PARTICLE_DISTANCES[i];
    return {
      angle:    deg,
      distance,
      color:    PARTICLE_COLORS[i % 2],
      tx:       Math.cos(rad) * distance,
      ty:       Math.sin(rad) * distance,
    };
  });
}

// Pre-built at module level — stable, never changes
const PARTICLES: ParticleDef[] = buildParticles();

// ─── Root component ───────────────────────────────────────────────────────────

export function BingoSquareAnimation({ onComplete }: GameplayAnimationProps) {
  const cancelledRef = useRef<boolean>(false);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Origin resolved from DOM; kept in a ref (no state) so no re-render fires.
  // All layers use initial/animate with Framer controls — no state needed.
  const originRef = useRef<{ x: number; y: number }>({
    x: typeof window !== "undefined" ? window.innerWidth  / 2 : 0,
    y: typeof window !== "undefined" ? window.innerHeight / 2 : 0,
  });

  const glowControls  = useAnimationControls();
  const labelControls = useAnimationControls();

  useEffect(() => {
    // ── 0. Inject scatter @keyframes once ──────────────────────────────────
    injectScatterKeyframes();

    // ── 1. Resolve burst origin ─────────────────────────────────────────────
    if (typeof document !== "undefined") {
      const square = document.querySelector<HTMLElement>(".bingo-square-pop");
      if (square !== null) {
        const rect = square.getBoundingClientRect();
        originRef.current = {
          x: rect.left + rect.width  / 2,
          y: rect.top  + rect.height / 2,
        };
      }
    }

    // ── 2. Layer 1 — radial glow expands and fades (500ms) ─────────────────
    void glowControls.start({
      width:   ["0px", "120px"],
      height:  ["0px", "120px"],
      opacity: [0.9, 0],
      transition: { duration: 0.5, ease: "easeOut" },
    });

    // ── 3. Layer 2 — label spring in, hold 600ms, float out ────────────────
    void (async (): Promise<void> => {
      // Spring entrance
      await labelControls.start({
        scale:   [0, 1.2, 1],
        opacity: [0, 1,   1],
        transition: {
          duration: 0.3,
          ease:     "easeOut",
          times:    [0, 0.6, 1],
        },
      });

      // Hold for 600ms before exit
      await new Promise<void>((resolve) => {
        holdTimerRef.current = setTimeout(resolve, 600);
      });

      if (cancelledRef.current) return;

      // Float up and out
      await labelControls.start({
        y:       -30,
        opacity: 0,
        transition: { duration: 0.25, ease: "easeIn" },
      });
    })();

    // ── 4. Lifecycle ────────────────────────────────────────────────────────
    timerRef.current = setTimeout(() => {
      if (!cancelledRef.current) {
        onComplete();
      }
    }, 950);

    return () => {
      cancelledRef.current = true;
      if (timerRef.current     !== null) clearTimeout(timerRef.current);
      if (holdTimerRef.current !== null) clearTimeout(holdTimerRef.current);
      glowControls.stop();
      labelControls.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { x, y } = originRef.current;

  return (
    <>
      {/* ── LAYER 1: Radial glow shockwave ───────────────────────────────────── */}
      <motion.div
        animate={glowControls}
        style={{
          position:        "fixed",
          left:            x,
          top:             y,
          // translate(-50%,-50%) centres the expanding circle on the origin.
          // Framer animates width/height directly; the static translate string
          // is merged into Framer's transform pipeline without conflict because
          // we are not animating x/y motion values — only layout properties.
          transform:       "translate(-50%, -50%)",
          width:           0,
          height:          0,
          borderRadius:    "9999px",
          backgroundColor: "rgba(249,115,22,0.60)", // #f97316 at 60%
          pointerEvents:   "none",
          willChange:      "transform, opacity",
          zIndex:          0,
        }}
      />

      {/* ── LAYER 2: "BINGO HIT!" floating label ─────────────────────────────── */}
      <motion.div
        animate={labelControls}
        initial={{ scale: 0, opacity: 0, y: 0, x: "-50%" }}
        style={{
          position:      "fixed",
          left:          x,
          top:           y - 50,       // 50px above origin
          // x: "-50%" in initial/animate tells Framer Motion to offset by half
          // the element's own width — correct centering on the origin point.
          color:         "#facc15",
          fontWeight:    900,
          fontSize:      "0.875rem",   // text-sm
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          textShadow:    "0 0 12px rgba(250,204,21,0.9)",
          pointerEvents: "none",
          willChange:    "transform, opacity",
          whiteSpace:    "nowrap",
          userSelect:    "none",
          zIndex:        1,
        }}
      >
        BINGO HIT!
      </motion.div>

      {/* ── LAYER 3: Particle scatter (CSS animation + Framer opacity) ───────── */}
      {PARTICLES.map((p: ParticleDef) => (
        <div
          key={p.angle}
          style={{
            position:        "fixed",
            left:            x,
            top:             y,
            width:           "8px",
            height:          "8px",
            borderRadius:    "9999px",
            backgroundColor: p.color,
            pointerEvents:   "none",
            willChange:      "transform, opacity",
            zIndex:          1,
            // CSS custom properties consumed by @keyframes bingo-scatter
            ["--tx" as string]: `${p.tx}px`,
            ["--ty" as string]: `${p.ty}px`,
            // Pure CSS animation drives both transform travel and opacity fade,
            // satisfying "zero React state / all visual via Framer or CSS"
            animationName:           "bingo-scatter",
            animationDuration:       "450ms",
            animationTimingFunction: "ease-out",
            animationFillMode:       "forwards",
          }}
        />
      ))}
    </>
  );
}