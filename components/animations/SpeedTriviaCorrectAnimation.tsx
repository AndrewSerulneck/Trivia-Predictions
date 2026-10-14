"use client";

import { useEffect, useInsertionEffect, useMemo, useRef } from "react";
import { motion, useAnimationControls } from "framer-motion";
import type { GameplayAnimationProps } from "@/types/animation";

// ─── Prop type (extends base with optional pointsLabel) ───────────────────────

interface SpeedTriviaCorrectAnimationProps extends GameplayAnimationProps {
  /** Overrides the chip text. Normally omitted: the chip shows `payload.pointsAwarded`. */
  pointsLabel?: string;
}

/** The chip shows the server's real award, never a guess. `null` (no chip) while the answer is
 *  still saving, and for a zero award. */
export function speedTriviaPointsLabel(pointsAwarded: number | undefined): string | null {
  if (pointsAwarded === undefined || !Number.isFinite(pointsAwarded) || pointsAwarded <= 0) return null;
  const points = Math.round(pointsAwarded);
  return `+${points} ${points === 1 ? "pt" : "pts"}`;
}

// ─── Timing (ms from mount) ───────────────────────────────────────────────────
// Slowed 2026-10-13 (Andrew: the points took a while to appear and only flashed briefly).
const POINTS_REVEAL_DELAY_MS   = 120;  // the points' beat after the pop, when the number is already in
const POINTS_MIN_VISIBLE_MS    = 1500; // once shown, the points stay on screen at least this long
const MIN_EXIT_AT_MS           = 2000; // the pill never leaves earlier than this
const MAX_EXIT_AT_MS           = 3200; // ...nor later, even if the server never answers
const EXIT_DURATION_MS         = 400;

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
    const distance = 110 + Math.random() * 80; // 110–190px: starts hidden behind the pill, bursts out past its edge

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
  payload,
  pointsLabel,
}: SpeedTriviaCorrectAnimationProps) {
  const label = pointsLabel ?? speedTriviaPointsLabel(payload?.pointsAwarded);
  // The server has answered (even with zero points) — no point waiting for a chip that won't come.
  const settled = pointsLabel !== undefined || payload?.pointsAwarded !== undefined;
  const cancelledRef     = useRef<boolean>(false);
  const mountedAtRef     = useRef<number>(Date.now());
  const pointsShownAtRef = useRef<number | null>(null);
  const settledRef       = useRef<boolean>(settled);
  const wakeHoldRef      = useRef<(() => void) | null>(null);
  const holdTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef     = useRef<boolean>(false);
  const onCompleteRef    = useRef(onComplete);
  onCompleteRef.current  = onComplete;

  // Inject CSS keyframes before first paint
  useInsertionEffect(() => {
    injectScatterKeyframes();
  }, []);

  // Stable particles — generated once per mount
  const particles = useMemo<Particle[]>(() => generateParticles(), []);

  const badgeControls  = useAnimationControls();
  const pointsControls = useAnimationControls();
  const shineControls  = useAnimationControls();

  useEffect(() => {
    const finish = (): void => {
      if (completedRef.current || cancelledRef.current) return;
      completedRef.current = true;
      onCompleteRef.current();
    };

    // When the pill may leave: on its minimum beat, after the points have had their time on screen,
    // and never past the cap. Waiting on an unsettled server stretches toward the cap.
    const exitAt = (): number => {
      const shownAt = pointsShownAtRef.current;
      if (shownAt !== null) return Math.min(MAX_EXIT_AT_MS, Math.max(MIN_EXIT_AT_MS, shownAt + POINTS_MIN_VISIBLE_MS));
      return settledRef.current ? MIN_EXIT_AT_MS : MAX_EXIT_AT_MS;
    };

    // ── Pill: spring in → hold until the points have been seen → exit ──────
    void (async (): Promise<void> => {
      await badgeControls.start({
        scale:   1.15,
        opacity: 1,
        y:       0,
        transition: { type: "spring", stiffness: 380, damping: 20, mass: 0.8 },
      });
      await badgeControls.start({
        scale: 1.0,
        transition: { duration: 0.12, ease: "easeOut" },
      });
      // Hold. A late points label wakes this so the deadline is re-read.
      for (;;) {
        if (cancelledRef.current) return;
        const remaining = exitAt() - (Date.now() - mountedAtRef.current);
        if (remaining <= 0) break;
        await new Promise<void>((resolve) => {
          wakeHoldRef.current = resolve;
          holdTimerRef.current = setTimeout(resolve, remaining);
        });
        if (holdTimerRef.current !== null) clearTimeout(holdTimerRef.current);
        wakeHoldRef.current = null;
      }
      if (cancelledRef.current) return;
      // Exit upward (the points are inside the pill, so they leave with it)
      await badgeControls.start({
        y:       -40,
        opacity: 0,
        transition: { duration: EXIT_DURATION_MS / 1000, ease: "easeIn" },
      });
      finish();
    })();

    // ── Shine: one light sweep across the pill once it has popped ──────────
    void shineControls.start({
      x: "360%",
      transition: { delay: 0.28, duration: 0.7, ease: "easeOut" },
    });

    // Safety net in case an animation promise never resolves.
    const lifecycleTimer = setTimeout(finish, MAX_EXIT_AT_MS + EXIT_DURATION_MS + 300);

    return () => {
      cancelledRef.current = true;
      clearTimeout(lifecycleTimer);
      if (holdTimerRef.current !== null) clearTimeout(holdTimerRef.current);
      wakeHoldRef.current?.();
      badgeControls.stop();
      pointsControls.stop();
      shineControls.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    settledRef.current = settled;
    wakeHoldRef.current?.();
  }, [settled]);

  // ── Points: revealed inside the pill once the real number is known — on its usual beat after
  //    the pop if the server already answered, otherwise the moment the number lands. ──
  useEffect(() => {
    if (label === null) return;
    const elapsedMs = Date.now() - mountedAtRef.current;
    const delayMs   = Math.max(0, POINTS_REVEAL_DELAY_MS - elapsedMs);
    if (pointsShownAtRef.current === null) pointsShownAtRef.current = elapsedMs + delayMs;
    wakeHoldRef.current?.();
    void pointsControls.start({
      opacity: 1,
      y:       0,
      scale:   1,
      transition: {
        delay:    delayMs / 1000,
        duration: 0.4,
        ease:     [0.22, 1, 0.36, 1],
      },
    });
  }, [label, pointsControls]);

  return (
    <>
      {/* ── LAYER 1: Glow pill — one unit holding ✓ CORRECT and the points.
          Near-opaque dark fill guarantees contrast over the bright trivia screen and the green
          feedback flash; the "pop" comes from the glowing rim and the shine. ── */}
      <div className="pointer-events-none fixed inset-0 z-[2] flex items-center justify-center">
        <motion.div
          animate={badgeControls}
          initial={{ scale: 0, opacity: 0, y: 20 }}
          className="relative rounded-[28px] border-[3px] border-[#34d399] bg-[rgba(4,20,14,0.94)] px-[34px] pb-3 pt-3.5 text-center shadow-[inset_0_0_0_1px_rgba(167,243,208,0.35),0_0_28px_rgba(52,211,153,0.75),0_0_64px_rgba(52,211,153,0.4),0_10px_30px_rgba(0,0,0,0.55)] will-change-transform"
        >
          {/* Shine sweep, clipped to the pill */}
          <div className="absolute inset-0 overflow-hidden rounded-[25px]">
            <motion.div
              animate={shineControls}
              initial={{ x: "-160%" }}
              className="absolute -bottom-[20%] -top-[20%] left-0 w-2/5 -skew-x-[18deg] bg-gradient-to-r from-transparent via-white/30 to-transparent"
            />
          </div>

          <div className="relative select-none whitespace-nowrap text-[26px] font-black uppercase leading-tight tracking-[0.12em] text-[#d1fae5] [text-shadow:0_0_12px_rgba(52,211,153,0.6)]">
            <span className="text-[#34d399]">✓</span> Correct
          </div>

          <motion.span
            animate={pointsControls}
            initial={{ opacity: 0, y: 8, scale: 0.85 }}
            className="relative mt-0.5 block select-none text-[22px] font-black leading-tight tracking-[0.06em] text-[#fde047]"
          >
            {/* Placeholder keeps the pill's height fixed (no jump) while the points are still hidden */}
            {label ?? "+2 pts"}
          </motion.span>
        </motion.div>
      </div>
      {/* ── LAYER 2: Particle scatter (behind the card) (pure CSS animation) ───────────────────── */}
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