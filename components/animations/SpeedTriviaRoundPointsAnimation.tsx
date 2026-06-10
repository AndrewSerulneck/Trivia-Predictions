"use client";

import { useEffect, useState } from "react";

export interface RoundPointsAddedAnimationProps {
  pointsEarned: number; // e.g. 8 — points earned this round
  totalBefore: number; // e.g. 142 — total before this round
  totalAfter: number; // e.g. 150 — server-confirmed total after
  onComplete?: () => void; // fires when animation finishes
}

// Phase machine:
//   0 = mounted, badge hidden (pre-pop)
//   1 = badge popped in (Phase 1)
//   2 = badge flying up + total counting (Phase 2)
//   3 = total settles + pulses, badge faded out (Phase 3)
type Phase = 0 | 1 | 2 | 3;

export const RoundPointsAddedAnimation = ({
  pointsEarned,
  totalBefore,
  totalAfter,
  onComplete,
}: RoundPointsAddedAnimationProps) => {
  const [phase, setPhase] = useState<Phase>(0);
  const [displayTotal, setDisplayTotal] = useState<number>(totalBefore);
  const [pulseSettled, setPulseSettled] = useState<boolean>(false);

  // ─── Phase sequencing ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const schedule = (fn: () => void, ms: number): void => {
      const id = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timers.push(id);
    };

    // Phase 1 — pop the badge in almost immediately (next tick so the
    // pre-pop "hidden" state paints first and the transition runs).
    schedule(() => setPhase(1), 30);
    // Phase 2 — badge flies up; total begins counting.
    schedule(() => setPhase(2), 600);
    // Phase 3 — total settles + pulses, badge gone.
    schedule(() => setPhase(3), 1400);
    // Pulse settle — bump to scale-110 at phase 3, then ease back to rest.
    schedule(() => setPulseSettled(true), 1700);
    // Complete at end of phase 3.
    schedule(() => {
      if (onComplete) onComplete();
    }, 2000);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [onComplete]);

  // ─── Count-up ticker (Phase 2) ──────────────────────────────────────────────
  // Steps displayTotal from totalBefore → totalAfter across ~800ms,
  // synchronized with the flying-number phase. Pure state + timers,
  // no inline styles needed.
  useEffect(() => {
    if (phase < 2) return;

    const diff = totalAfter - totalBefore;
    if (diff === 0) {
      setDisplayTotal(totalAfter);
      return;
    }

    const DURATION_MS = 800;
    // Cap the number of steps so large diffs don't spawn excessive timers.
    const steps = Math.min(Math.abs(diff), 30);
    const stepMs = DURATION_MS / steps;

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    for (let i = 1; i <= steps; i += 1) {
      const id = setTimeout(() => {
        if (cancelled) return;
        const progress = i / steps;
        const value = Math.round(totalBefore + diff * progress);
        setDisplayTotal(i === steps ? totalAfter : value);
      }, stepMs * i);
      timers.push(id);
    }

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [phase, totalBefore, totalAfter]);

  // ─── Derived class fragments ────────────────────────────────────────────────

  // Badge: hidden (scale-50, opacity-0) → popped (scale-100, opacity-100) →
  // flying (translate up + fade) → gone (opacity-0).
  const badgeMotion =
    phase === 0
      ? "scale-50 opacity-0 translate-y-0"
      : phase === 1
      ? "scale-100 opacity-100 translate-y-0"
      : phase === 2
      ? "scale-90 opacity-0 -translate-y-24"
      : "scale-90 opacity-0 -translate-y-24";

  // Total: settles with a single pulse bounce in Phase 3 — bumps to
  // scale-110 when phase 3 begins, then eases back to rest once settled.
  const totalMotion = phase === 3 && !pulseSettled ? "scale-110" : "scale-100";

  return (
    <div className="relative flex w-full flex-col items-center justify-center gap-6 py-8">
      {/* ── Total Points (on top) ──────────────────────────────────────────── */}
      <div className="flex flex-col items-center">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Total Points</p>
        <p
          className={[
            "mt-1 text-5xl font-black tabular-nums text-white",
            "transition-transform duration-300 ease-out",
            totalMotion,
          ].join(" ")}
        >
          {displayTotal}
        </p>
      </div>

      {/* ── Earned-points badge (below, flies upward) ──────────────────────── */}
      <div className="flex h-16 items-center justify-center">
        <span
          className={[
            "inline-flex items-center justify-center rounded-full px-6 py-2",
            "bg-amber-500/20 text-2xl font-black tabular-nums text-amber-400",
            "ring-1 ring-inset ring-amber-400/40",
            "transition-all duration-700 ease-out",
            badgeMotion,
          ].join(" ")}
        >
          +{pointsEarned}
        </span>
      </div>
    </div>
  );
};