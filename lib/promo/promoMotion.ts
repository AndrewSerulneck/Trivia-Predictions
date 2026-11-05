import type { StoryShapeBlock, StoryTextBlock } from "@/lib/socialShare/contracts";
import { clamp01 } from "@/lib/promo/promoReel";
import { emptyBlocks, type Blocks } from "@/lib/promo/promoArt";

// Helpers for each game's Reel motion (docs/game-themes-plan.md Phase 3). Pure: a theme's
// `reel.motion` builds blocks for one frame from these; lib/promo/promoReelRender.ts paints them.

/** 0 before `start`, 1 after `start + duration`, linear between. */
export const progress = (t: number, start: number, duration: number): number => clamp01((t - start) / duration);

/** A quick flash: rises over `rise`, then decays over `decay` (0 outside). */
export const flash = (t: number, at: number, rise: number, decay: number): number => {
  if (t < at || t > at + rise + decay) return 0;
  if (t < at + rise) return (t - at) / rise;
  return Math.pow(1 - (t - at - rise) / decay, 2);
};

/** Multiplies every block's opacity by `alpha`; nothing at all once it is (about) 0. */
export const faded = (blocks: Blocks, alpha: number): Blocks => {
  if (alpha <= 0.005) return emptyBlocks();
  if (alpha >= 0.999) return blocks;
  const times = <T extends StoryShapeBlock | StoryTextBlock>(block: T): T => ({ ...block, opacity: (block.opacity ?? 1) * alpha });
  return { shapes: blocks.shapes.map(times), text: blocks.text.map(times) };
};

type Point = readonly [number, number];

const lengthOf = (points: readonly Point[]): number =>
  points.reduce((sum, point, index) => (index === 0 ? 0 : sum + Math.hypot(point[0] - points[index - 1][0], point[1] - points[index - 1][1])), 0);

/** Where a point travelling at constant speed along `points` is after `k` (0…1) of the way. */
export const pointAlong = (points: readonly Point[], k: number): Point => {
  const target = lengthOf(points) * clamp01(k);
  let walked = 0;
  for (let index = 1; index < points.length; index += 1) {
    const [x1, y1] = points[index - 1];
    const [x2, y2] = points[index];
    const step = Math.hypot(x2 - x1, y2 - y1);
    if (walked + step >= target && step > 0) {
      const f = (target - walked) / step;
      return [x1 + (x2 - x1) * f, y1 + (y2 - y1) * f];
    }
    walked += step;
  }
  return points[points.length - 1];
};

/** SVG path data for the first `k` (0…1) of the polyline, by length: a line being drawn. */
export const polylineUpTo = (points: readonly Point[], k: number): string => {
  if (points.length < 2 || k <= 0) return "";
  const target = lengthOf(points) * clamp01(k);
  const parts = [`M ${points[0][0]} ${points[0][1]}`];
  let walked = 0;
  for (let index = 1; index < points.length; index += 1) {
    const [x1, y1] = points[index - 1];
    const [x2, y2] = points[index];
    const step = Math.hypot(x2 - x1, y2 - y1);
    if (walked + step >= target) {
      const f = step > 0 ? (target - walked) / step : 1;
      parts.push(`L ${x1 + (x2 - x1) * f} ${y1 + (y2 - y1) * f}`);
      break;
    }
    parts.push(`L ${x2} ${y2}`);
    walked += step;
  }
  return parts.join(" ");
};

/** A point on a quadratic curve from `a` to `b` bending through control point `c`. */
export const quadAt = (a: Point, c: Point, b: Point, k: number): Point => {
  const u = 1 - k;
  return [u * u * a[0] + 2 * u * k * c[0] + k * k * b[0], u * u * a[1] + 2 * u * k * c[1] + k * k * b[1]];
};
