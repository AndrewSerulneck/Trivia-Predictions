"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, FC } from "react";
import type { GameplayAnimationProps } from "@/types/animation";

// ─── Scoped keyframes + animation classes ─────────────────────────────────────
// Injected once via a <style> tag so the component stays self-contained
// (no edits to globals.css required). Prefixed `ltca-` to avoid collisions.
// Per-element timing that varies (particles) is fed in through CSS custom
// properties (--ltca-delay / --ltca-duration), which the spec permits.

const STYLE_BLOCK = `
@keyframes ltca-shimmer-sweep {
  0%   { transform: translateX(-130%) skewX(-18deg); opacity: 0; }
  35%  { opacity: 1; }
  100% { transform: translateX(130%) skewX(-18deg); opacity: 0; }
}
@keyframes ltca-particle-drift {
  0%   { transform: translateY(0) scale(0.6); opacity: 0; }
  20%  { opacity: 0.9; }
  80%  { opacity: 0.7; }
  100% { transform: translateY(-120px) scale(1); opacity: 0; }
}
.ltca-shimmer {
  animation: ltca-shimmer-sweep 600ms ease-out 1 forwards;
}
.ltca-particle {
  animation-name: ltca-particle-drift;
  animation-timing-function: ease-out;
  animation-iteration-count: infinite;
  animation-fill-mode: both;
  animation-duration: var(--ltca-duration, 2000ms);
  animation-delay: var(--ltca-delay, 0ms);
}
`;

// ─── Particle definitions (static, lightweight — 5 dots) ──────────────────────

interface Particle {
  leftClass: string;
  bottomClass: string;
  sizeClass: string;
  delayMs: number;
  durationMs: number;
}

const PARTICLES: Particle[] = [
  { leftClass: "left-[18%]", bottomClass: "bottom-[30%]", sizeClass: "h-1.5 w-1.5", delayMs: 300, durationMs: 1900 },
  { leftClass: "left-[38%]", bottomClass: "bottom-[22%]", sizeClass: "h-1 w-1", delayMs: 700, durationMs: 2100 },
  { leftClass: "left-[55%]", bottomClass: "bottom-[34%]", sizeClass: "h-2 w-2", delayMs: 500, durationMs: 2200 },
  { leftClass: "left-[72%]", bottomClass: "bottom-[26%]", sizeClass: "h-1 w-1", delayMs: 1000, durationMs: 1800 },
  { leftClass: "left-[85%]", bottomClass: "bottom-[32%]", sizeClass: "h-1.5 w-1.5", delayMs: 1300, durationMs: 2000 },
];

// ─── Component ────────────────────────────────────────────────────────────────

export const LiveTriviaCategoryAnnouncementAnimation: FC<GameplayAnimationProps> = ({
  onComplete,
  payload,
}) => {
  // Phase state machine driven by setTimeout. Each phase toggles transition
  // classes on the relevant elements.
  //   0 = mounted, background transparent
  //   1 = background visible + eyebrow slides in
  //   2 = category name slams in (scale-up + fade)
  //   3 = shimmer sweep across category
  //   4 = overlay fades out
  const [phase, setPhase] = useState<number>(0);

  const categoryName: string =
    typeof payload?.categoryName === "string" && payload.categoryName.length > 0
      ? payload.categoryName
      : "Coming Up Next";

  const eyebrow: string =
    typeof payload?.roundNumber === "number" ? `ROUND ${payload.roundNumber}` : "NEXT ROUND";

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const schedule = (fn: () => void, ms: number): void => {
      const id = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timers.push(id);
    };

    schedule(() => setPhase(1), 200);   // bg in + eyebrow up
    schedule(() => setPhase(2), 500);   // category slam-in
    schedule(() => setPhase(3), 1400);  // first shimmer sweep
    schedule(() => setPhase(4), 4500);  // second shimmer sweep (keeps it alive)
    schedule(() => setPhase(5), 7200);  // overlay fade-out
    schedule(() => onComplete(), 8000); // complete

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [onComplete]);

  const backgroundVisible = phase >= 1;
  const eyebrowVisible = phase >= 1;
  const categoryVisible = phase >= 2;
  const shimmerActive = phase === 3 || phase === 4;
  const fadingOut = phase >= 5;

  return (
    <div
      className={[
        "fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden",
        "bg-gradient-to-b from-[#1a0533] to-[#3b0764]",
        "transition-opacity duration-500 ease-out",
        backgroundVisible && !fadingOut ? "opacity-100" : "opacity-0",
      ].join(" ")}
    >
      {/* Scoped keyframes + animation classes */}
      <style>{STYLE_BLOCK}</style>

      {/* ── Particles (drift upward) ──────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {PARTICLES.map((p, i) => (
          <div
            key={i}
            className={["ltca-particle absolute rounded-full bg-white/80", p.leftClass, p.bottomClass, p.sizeClass].join(" ")}
            style={
              {
                "--ltca-duration": `${p.durationMs}ms`,
                "--ltca-delay": `${p.delayMs}ms`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      {/* ── Eyebrow: "NEXT ROUND" / "ROUND N" ─────────────────────────────────── */}
      <p
        className={[
          "text-sm font-bold uppercase tracking-widest text-purple-300",
          "transition-all duration-700 ease-out",
          eyebrowVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        ].join(" ")}
      >
        {eyebrow}
      </p>

      {/* ── Category name: slam-in + shimmer sweep ────────────────────────────── */}
      <div className="relative mt-3 overflow-hidden px-6">
        <h1
          className={[
            "text-center text-4xl font-black uppercase tracking-tight text-white md:text-6xl",
            "transition-all duration-500 ease-out",
            categoryVisible ? "scale-100 opacity-100" : "scale-75 opacity-0",
          ].join(" ")}
        >
          {categoryName}
        </h1>

        {/* Shimmer overlay — sweeps once when activated */}
        {shimmerActive ? (
          <span
            aria-hidden="true"
            className="ltca-shimmer pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
          />
        ) : null}
      </div>
    </div>
  );
};