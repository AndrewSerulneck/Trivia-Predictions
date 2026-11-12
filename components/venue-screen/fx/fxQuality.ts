// Effect quality tiers for the venue display (docs/venue-display-hype-and-intro-stinger-plan.md §4 Phase 0).
// Pure: FxCanvas keeps the tier in a ref (no re-renders) and feeds frame times to the watchdog.
//
//   full — every particle, backing store up to 2× DPR
//   lite — half the particles, backing store at 1× (cheaper fills on TV sticks)
//   off  — no canvas effects at all (reduced motion, or a device too slow even for lite)

export type FxTier = "full" | "lite" | "off";

/** Drop a tier when the rolling average frame time exceeds this (≈ 36 fps). */
export const FX_FRAME_BUDGET_MS = 28;
/** Rolling window the average is taken over. */
export const FX_WATCHDOG_WINDOW_MS = 1_000;
/** Frame gaps longer than this are a hidden tab or a stall, not a slow draw: ignored. */
export const FX_FRAME_GAP_IGNORE_MS = 250;
/** Backing-store cap (same as the intro stinger): keeps fills affordable at 4K. */
export const FX_MAX_CANVAS_LONG_SIDE = 2_880;

export const initialFxTier = ({
  hardwareConcurrency,
  reducedMotion,
}: {
  hardwareConcurrency?: number | null;
  reducedMotion: boolean;
}): FxTier => {
  if (reducedMotion) return "off";
  if (typeof hardwareConcurrency === "number" && hardwareConcurrency > 0 && hardwareConcurrency <= 2) return "lite";
  return "full";
};

export const lowerFxTier = (tier: FxTier): FxTier => (tier === "full" ? "lite" : "off");

/** Particle multiplier for emitters. */
export const fxDensity = (tier: FxTier): number => (tier === "full" ? 1 : tier === "lite" ? 0.5 : 0);

/** Canvas backing pixels per CSS pixel: DPR (max 2) in full, 1 in lite, capped so the long side ≤ 2880. */
export const fxBackingScale = (cssW: number, cssH: number, dpr: number, tier: FxTier): number => {
  let k = Math.min(Math.max(dpr || 1, 1), tier === "full" ? 2 : 1);
  const longSide = Math.max(cssW, cssH) * k;
  if (longSide > FX_MAX_CANVAS_LONG_SIDE) k *= FX_MAX_CANVAS_LONG_SIDE / longSide;
  return k;
};

export type FrameWatchdog = {
  /** Feed one frame's duration; true when the last second averaged over budget (window then restarts). */
  sample: (frameMs: number, nowMs: number) => boolean;
  reset: () => void;
};

export const createFrameWatchdog = ({
  budgetMs = FX_FRAME_BUDGET_MS,
  windowMs = FX_WATCHDOG_WINDOW_MS,
  minSamples = 5,
}: { budgetMs?: number; windowMs?: number; minSamples?: number } = {}): FrameWatchdog => {
  let samples: Array<{ at: number; ms: number }> = [];
  let windowStart: number | null = null;
  return {
    sample: (frameMs, nowMs) => {
      if (!(frameMs > 0) || frameMs > FX_FRAME_GAP_IGNORE_MS) return false;
      if (windowStart === null) windowStart = nowMs - frameMs;
      samples.push({ at: nowMs, ms: frameMs });
      samples = samples.filter((s) => s.at > nowMs - windowMs);
      // Judge only once a full window has been watched, so one slow first frame can't drop a tier.
      if (nowMs - windowStart < windowMs || samples.length < minSamples) return false;
      const avg = samples.reduce((sum, s) => sum + s.ms, 0) / samples.length;
      if (avg <= budgetMs) return false;
      samples = [];
      windowStart = null;
      return true;
    },
    reset: () => {
      samples = [];
      windowStart = null;
    },
  };
};
