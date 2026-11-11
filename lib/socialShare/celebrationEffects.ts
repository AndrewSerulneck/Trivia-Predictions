import { fnv1aHash } from "@/lib/hash";
import type { StoryEffectLayers, StoryShapeBlock } from "./contracts";

/**
 * Celebration effects on a share picture (docs/share-win-celebration-plan.md Phase 1): Fireworks,
 * Lasers, Confetti and Clapping hands, each switched on by the guest. Drawn vector art only (never
 * an emoji or a logo), as `StoryShapeBlock`s for the one renderer (storyCanvas.ts).
 *
 * Two steps, both pure:
 * - `planCelebration(stage)` places everything once for a picture: where each burst, beam, piece of
 *   confetti and pair of hands goes. It places ALL four effects every time,
 *   so switching one effect on never moves another (fireworks avoid the hands). Seeded: the same picture always gets the same plan.
 * - `celebrationLayers(plan, effects, t)` draws the chosen effects at time `t` (seconds). The still
 *   picture is the hero moment, `CELEBRATION_HERO_T`; an animated Story (Phase 2) draws earlier `t`s.
 *
 * Nothing is placed over the picture's content: the design hands over its `keepOut` rectangles
 * (headline, stats, username, logo, QR, venue panel, gift card) and, on a selfie, the face. Lasers sit
 * behind the design (the renderer's `effects.behind`), so they may pass under words but never over them.
 * Colours come from the game's registry entry; no game id is named here.
 */

export type CelebrationEffect = "fireworks" | "lasers" | "confetti" | "clapping";

export const CELEBRATION_EFFECT_ORDER: readonly CelebrationEffect[] = ["fireworks", "lasers", "confetti", "clapping"];

/** The moment the still picture shows. The animated Story (celebrationVideo.ts) reaches it, then holds. */
export const CELEBRATION_HERO_T = 3.5;

/** How far a laser sways either side in the animated Story (radians). */
const LASER_SWAY = 0.1;

export interface EffectRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CelebrationPalette {
  primary: string;
  secondary: string;
  /** The game's light text colour. */
  light: string;
  gold: string;
}

/** What a design tells the effects about its picture. */
export interface CelebrationStage {
  width: number;
  height: number;
  /** Instagram's overlays on a Story (top / bottom px). */
  safeTop: number;
  safeBottom: number;
  /** The picture's content: nothing in the middle or front layer may cover these. */
  keepOut: EffectRect[];
  /** A selfie's face: lasers avoid it too. */
  face: EffectRect | null;
  palette: CelebrationPalette;
  /** Seeds the placement: the same seed and stage always give the same plan. */
  seed: string;
}

interface Burst {
  cx: number;
  cy: number;
  r: number;
  rays: number;
  colors: readonly [string, string];
  /** Radians. */
  spin: number;
}

interface Beam {
  ox: number;
  oy: number;
  /** Radians, clockwise from pointing right. */
  angle: number;
  length: number;
  color: string;
  /** +1 / -1: which way it sways in the video. */
  sway: number;
}

interface Piece {
  x: number;
  y: number;
  kind: "strip" | "dot";
  /** Strip length / dot radius. */
  size: number;
  rot: number;
  color: string;
  fall: number;
  spin: number;
}

interface Clap {
  cx: number;
  cy: number;
  /** The pair's width in px. */
  size: number;
  tilt: number;
}

export interface CelebrationPlan {
  bursts: Burst[];
  beams: Beam[];
  pieces: Piece[];
  claps: Clap[];
  palette: CelebrationPalette;
  /** The stage's content boxes: confetti still falling in hides behind them (an animated Story). */
  keepOut: EffectRect[];
}

/** The guest's choice, cleaned: known effects only, no repeats, in chip order. */
export const normalizeCelebrationEffects = (effects: readonly string[] | null | undefined): CelebrationEffect[] =>
  CELEBRATION_EFFECT_ORDER.filter((effect) => (effects ?? []).includes(effect));

/** A stable key for a choice ("fireworks+lasers"; "" = none). */
export const celebrationEffectsKey = (effects: readonly string[] | null | undefined): string =>
  normalizeCelebrationEffects(effects).join("+");

// ── Seeded randomness ──

const seededRandom = (seed: string): (() => number) => {
  let state = fnv1aHash(seed) || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const between = (random: () => number, min: number, max: number): number => min + random() * (max - min);

// ── Geometry ──

const n1 = (value: number): string => (Math.round(value * 10) / 10).toString();

const circleHitsRect = (cx: number, cy: number, r: number, rect: EffectRect, pad: number): boolean => {
  const nearestX = Math.max(rect.x - pad, Math.min(cx, rect.x + rect.width + pad));
  const nearestY = Math.max(rect.y - pad, Math.min(cy, rect.y + rect.height + pad));
  return (cx - nearestX) ** 2 + (cy - nearestY) ** 2 < r * r;
};

const rectsOverlap = (a: EffectRect, b: EffectRect, pad: number): boolean =>
  a.x < b.x + b.width + pad && b.x < a.x + a.width + pad && a.y < b.y + b.height + pad && b.y < a.y + a.height + pad;

/** How far along a ray (from x,y at `angle`, up to `limit`) it first enters the rect, sampled every 8 px; null = never. */
const distanceToRect = (x: number, y: number, angle: number, limit: number, rect: EffectRect, pad: number): number | null => {
  for (let along = 0; along <= limit; along += 8) {
    const px = x + Math.cos(angle) * along;
    const py = y + Math.sin(angle) * along;
    if (px >= rect.x - pad && px <= rect.x + rect.width + pad && py >= rect.y - pad && py <= rect.y + rect.height + pad) return along;
  }
  return null;
};

/** A beam's light has faded to nothing this far along it (see `laserBlocks`). */
const LASER_VISIBLE = 0.8;

const circlePath = (cx: number, cy: number, r: number): string =>
  `M${n1(cx - r)} ${n1(cy)}a${n1(r)} ${n1(r)} 0 1 0 ${n1(r * 2)} 0a${n1(r)} ${n1(r)} 0 1 0 ${n1(-r * 2)} 0Z`;

/** A stadium from (x1,y1) to (x2,y2), `r` wide each side. */
const capsulePath = (x1: number, y1: number, x2: number, y2: number, r: number): string => {
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = (-(y2 - y1) / length) * r;
  const ny = ((x2 - x1) / length) * r;
  return `M${n1(x1 + nx)} ${n1(y1 + ny)}L${n1(x2 + nx)} ${n1(y2 + ny)}A${n1(r)} ${n1(r)} 0 0 0 ${n1(x2 - nx)} ${n1(y2 - ny)}L${n1(x1 - nx)} ${n1(y1 - ny)}A${n1(r)} ${n1(r)} 0 0 0 ${n1(x1 + nx)} ${n1(y1 + ny)}Z`;
};

const roundRectPath = (x: number, y: number, w: number, h: number, r: number): string =>
  `M${n1(x + r)} ${n1(y)}H${n1(x + w - r)}A${n1(r)} ${n1(r)} 0 0 1 ${n1(x + w)} ${n1(y + r)}V${n1(y + h - r)}A${n1(r)} ${n1(r)} 0 0 1 ${n1(x + w - r)} ${n1(y + h)}H${n1(x + r)}A${n1(r)} ${n1(r)} 0 0 1 ${n1(x)} ${n1(y + h - r)}V${n1(y + r)}A${n1(r)} ${n1(r)} 0 0 1 ${n1(x + r)} ${n1(y)}Z`;

const withAlpha = (hex: string, alpha: number): string => {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// ── Placement ──

const GRID = 24;
/** Clear space kept between an effect and the content it avoids. */
const CONTENT_GAP = 20;

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** A random free centre for something `halfW` × `halfH` from its centre, inside `bounds`, or null. */
const findSpot = (
  bounds: Bounds,
  halfW: number,
  halfH: number,
  blocked: (cx: number, cy: number) => boolean,
  random: () => number
): { cx: number; cy: number } | null => {
  const free: Array<{ cx: number; cy: number }> = [];
  for (let cy = bounds.minY + halfH; cy <= bounds.maxY - halfH; cy += GRID) {
    for (let cx = bounds.minX + halfW; cx <= bounds.maxX - halfW; cx += GRID) {
      if (!blocked(cx, cy)) free.push({ cx, cy });
    }
  }
  return free.length > 0 ? free[Math.floor(random() * free.length)] : null;
};

const BURST_RADII = [170, 150, 130, 115, 100, 88, 76, 64];
/** How far a burst of radius `r` reaches: its sparkles sit just past the rays. */
const burstReach = (r: number): number => r * 1.1 + rayWidth(r);
const rayWidth = (r: number): number => Math.max(4, r / 22);

/** The hand pair's art, local units (see `handPairBlocks`): 252 wide, 280 tall, centred on (0, -125). */
const CLAP_ART = { width: 252, height: 280, centerY: -125 } as const;
/** Its box once tilted up to ±0.14 rad. */
const CLAP_BOX = { width: 292, height: 314 } as const;
const MAX_CLAP_TILT = 0.14;
/** The pair's untilted art width in px, largest first. */
const CLAP_SIZES = [200, 180, 160, 140, 124, 108, 92, 80];

const clapBox = (clap: Pick<Clap, "cx" | "cy" | "size">): EffectRect => {
  const width = (clap.size * CLAP_BOX.width) / CLAP_ART.width;
  const height = (clap.size * CLAP_BOX.height) / CLAP_ART.width;
  return { x: clap.cx - width / 2, y: clap.cy - height / 2, width, height };
};

const planBursts = (stage: CelebrationStage, random: () => number, palette: CelebrationPalette, claps: Clap[] = []): Burst[] => {
  const bursts: Burst[] = [];
  const colorPairs: ReadonlyArray<readonly [string, string]> = [
    [palette.gold, palette.light],
    [palette.primary, palette.secondary],
    [palette.secondary, palette.gold],
    [palette.light, palette.primary],
  ];
  // Mostly inside Instagram's frame, a burst may reach into the top band. When nothing fits there, a
  // burst may sit in the top or bottom band and run off the side, as real fireworks do.
  const inside: Bounds = { minX: 8, maxX: stage.width - 8, minY: stage.safeTop * 0.4, maxY: stage.height - stage.safeBottom * 0.55 };
  const maxBursts = stage.height > 1500 ? 4 : 3;
  for (let index = 0; index < maxBursts; index += 1) {
    let placed = false;
    // A big burst at the edge beats a small one squeezed in.
    for (const r of BURST_RADII) {
      for (const edge of [false, true]) {
        const reach = burstReach(r);
        const overhang = edge ? reach * 0.35 : 0;
        const bounds = edge ? { minX: -overhang, maxX: stage.width + overhang, minY: 0, maxY: stage.height } : inside;
        const spot = findSpot(bounds, reach, reach, (cx, cy) =>
          stage.keepOut.some((rect) => circleHitsRect(cx, cy, reach, rect, CONTENT_GAP)) ||
          claps.some((clap) => circleHitsRect(cx, cy, reach, clapBox(clap), 8)) ||
          bursts.some((burst) => Math.hypot(burst.cx - cx, burst.cy - cy) < burstReach(burst.r) + reach + 16), random);
        if (!spot) continue;
        bursts.push({
          ...spot,
          r,
          rays: 14 + Math.floor(random() * 5),
          colors: colorPairs[index % colorPairs.length],
          spin: random() * Math.PI,
        });
        placed = true;
        break;
      }
      if (placed) break;
    }
    if (!placed) break;
  }
  return bursts;
};

const planClaps = (stage: CelebrationStage, random: () => number, bursts: Burst[] = []): Clap[] => {
  const claps: Clap[] = [];
  // Hands sit in front of everything, so they stay inside Instagram's frame when they can.
  const strict: Bounds = { minX: 12, maxX: stage.width - 12, minY: stage.safeTop, maxY: stage.height - stage.safeBottom };
  const loose: Bounds = { minX: 8, maxX: stage.width - 8, minY: stage.safeTop * 0.4, maxY: stage.height - stage.safeBottom * 0.55 };
  for (let index = 0; index < 2; index += 1) {
    let placed = false;
    // Only the first pair may fall back to the edges Instagram covers.
    for (const bounds of index === 0 ? [strict, loose] : [strict]) {
      for (const size of CLAP_SIZES) {
        const { width, height } = clapBox({ cx: 0, cy: 0, size });
        const spot = findSpot(bounds, width / 2, height / 2, (cx, cy) => {
          const box = clapBox({ cx, cy, size });
          return stage.keepOut.some((rect) => rectsOverlap(box, rect, CONTENT_GAP)) ||
            bursts.some((burst) => circleHitsRect(burst.cx, burst.cy, burstReach(burst.r), box, 8)) ||
            claps.some((clap) => rectsOverlap(box, clapBox(clap), 48));
        }, random);
        if (!spot) continue;
        claps.push({ ...spot, size, tilt: between(random, -MAX_CLAP_TILT, MAX_CLAP_TILT) });
        placed = true;
        break;
      }
      if (placed) break;
    }
    if (!placed) break;
  }
  return claps;
};

const planBeams = (stage: CelebrationStage, random: () => number, palette: CelebrationPalette): Beam[] => {
  const beams: Beam[] = [];
  const originY = stage.safeTop * 0.55;
  const length = Math.hypot(stage.width, stage.height) * 0.8;
  const colors = [palette.secondary, palette.primary, palette.light, palette.secondary, palette.primary];
  for (const side of [-1, 1] as const) {
    const ox = side < 0 ? -12 : stage.width + 12;
    [10, 22, 34, 46, 58].forEach((degrees, index) => {
      const down = ((degrees + between(random, -3, 3)) * Math.PI) / 180;
      const angle = side < 0 ? down : Math.PI - down;
      // Over a selfie a beam fades out before the face, wherever it sways to in the animated Story: it is
      // shortened, or left out if that leaves a stub.
      const face = stage.face;
      const reaches = face
        ? [angle - LASER_SWAY, angle, angle + LASER_SWAY].flatMap((swayed) => distanceToRect(ox, originY, swayed, length * LASER_VISIBLE, face, 24) ?? [])
        : [];
      const reach = reaches.length > 0 ? Math.min(...reaches) : null;
      const beamLength = reach == null ? length : reach / LASER_VISIBLE;
      if (beamLength < 260) return;
      beams.push({ ox, oy: originY, angle, length: beamLength, color: colors[index], sway: index % 2 === 0 ? 1 : -1 });
    });
  }
  return beams;
};

const pieceReach = (piece: Pick<Piece, "kind" | "size">): number => (piece.kind === "strip" ? piece.size / 2 + 4 : piece.size + 2);

const planPieces = (stage: CelebrationStage, random: () => number, palette: CelebrationPalette): Piece[] => {
  const pieces: Piece[] = [];
  const colors = [palette.gold, palette.primary, palette.secondary, palette.light, "#FFFFFF"];
  const target = stage.height > 1500 ? 96 : 72;
  for (let attempt = 0; attempt < target * 6 && pieces.length < target; attempt += 1) {
    // Denser near the top, as if falling.
    const x = random() * stage.width;
    const y = stage.height * random() ** 1.35;
    const kind = random() < 0.68 ? "strip" : "dot";
    const size = kind === "strip" ? between(random, 18, 30) : between(random, 5, 9);
    const reach = pieceReach({ kind, size });
    if (stage.keepOut.some((rect) => circleHitsRect(x, y, reach, rect, 14))) continue;
    if (pieces.some((piece) => Math.hypot(piece.x - x, piece.y - y) < 30)) continue;
    pieces.push({
      x,
      y,
      kind,
      size,
      rot: random() * Math.PI,
      color: colors[Math.floor(random() * colors.length)],
      fall: between(random, 220, 380),
      spin: between(random, -4, 4),
    });
  }
  return pieces;
};

/**
 * Hands and fireworks never overlap. Hands go first (they are the front layer and need the most room);
 * if that leaves no room for a burst, fireworks go first instead; only when neither order fits both do
 * the fireworks go behind the hands.
 */
const planClapsAndBursts = (stage: CelebrationStage): { claps: Clap[]; bursts: Burst[] } => {
  const handsFirst = (() => {
    const random = seededRandom(`${stage.seed}:hands`);
    const claps = planClaps(stage, random);
    return { claps, bursts: planBursts(stage, random, stage.palette, claps) };
  })();
  if (handsFirst.bursts.length > 0 || handsFirst.claps.length === 0) return handsFirst;
  const random = seededRandom(`${stage.seed}:fireworks`);
  const bursts = planBursts(stage, random, stage.palette);
  const claps = planClaps(stage, random, bursts);
  if (claps.length > 0) return { claps, bursts };
  return { claps: handsFirst.claps, bursts };
};

const PLAN_CACHE_LIMIT = 48;
const planCache = new Map<string, CelebrationPlan>();

/** Where every effect goes on this picture. Pure and seeded; the last few plans are remembered. */
export const planCelebration = (stage: CelebrationStage): CelebrationPlan => {
  const key = JSON.stringify(stage);
  const cached = planCache.get(key);
  if (cached) return cached;
  const random = seededRandom(stage.seed);
  const { claps, bursts } = planClapsAndBursts(stage);
  const plan: CelebrationPlan = {
    bursts,
    claps,
    beams: planBeams(stage, random, stage.palette),
    pieces: planPieces(stage, random, stage.palette),
    palette: stage.palette,
    keepOut: stage.keepOut,
  };
  if (planCache.size >= PLAN_CACHE_LIMIT) planCache.delete(planCache.keys().next().value as string);
  planCache.set(key, plan);
  return plan;
};

// ── Drawing ──

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const easeOut = (value: number): number => 1 - (1 - value) ** 3;

/** When each burst launches (s); it rises for `FIREWORK_RISE`, then opens over `FIREWORK_OPEN`. */
const fireworkLaunch = (index: number): number => 0.2 + 0.55 * index;
const FIREWORK_RISE = 0.35;
const FIREWORK_OPEN = 1;

/** A rising spark with a fading tail, inside the burst's own space (it never crosses content). */
const launchBlocks = (burst: Burst, rise: number): StoryShapeBlock[] => {
  const from = burstReach(burst.r) * 0.9;
  const headY = burst.cy + from * (1 - easeOut(rise));
  const tail = Math.min(from * 0.5, burst.r * 0.6);
  const width = rayWidth(burst.r);
  return [
    {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      path: capsulePath(burst.cx, headY, burst.cx, Math.min(burst.cy + from, headY + tail), width * 0.45),
      fill: {
        kind: "linear",
        x0: burst.cx,
        y0: headY,
        x1: burst.cx,
        y1: headY + tail,
        stops: [
          { offset: 0, color: withAlpha(burst.colors[0], 0.9) },
          { offset: 1, color: withAlpha(burst.colors[0], 0) },
        ],
      },
    },
    { x: 0, y: 0, width: 0, height: 0, path: circlePath(burst.cx, headY, width * 0.9), fill: { kind: "solid", color: "#FFFFFF" } },
  ];
};

/** Fireworks: rays from a bright centre, sparkles at the tips. Each burst launches, rises, then opens, staggered. */
const fireworksBlocks = (plan: CelebrationPlan, t: number): StoryShapeBlock[] => {
  const blocks: StoryShapeBlock[] = [];
  plan.bursts.forEach((burst, index) => {
    const launch = fireworkLaunch(index);
    if (t >= CELEBRATION_HERO_T) {
      // The still picture: every burst fully open.
    } else if (t < launch) {
      return;
    } else if (t < launch + FIREWORK_RISE) {
      blocks.push(...launchBlocks(burst, (t - launch) / FIREWORK_RISE));
      return;
    }
    const grow = t >= CELEBRATION_HERO_T ? 1 : easeOut(clamp01((t - launch - FIREWORK_RISE) / FIREWORK_OPEN));
    if (grow <= 0) return;
    const r = burst.r * grow;
    const width = rayWidth(burst.r) * Math.max(grow, 0.5);
    const rays: [string, string] = ["", ""];
    let tips = "";
    let inner = "";
    for (let i = 0; i < burst.rays; i += 1) {
      const angle = burst.spin + (i / burst.rays) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const reach = i % 2 === 0 ? 1 : 0.84;
      rays[i % 2] += `M${n1(burst.cx + cos * r * 0.3)} ${n1(burst.cy + sin * r * 0.3)}L${n1(burst.cx + cos * r * reach)} ${n1(burst.cy + sin * r * reach)}`;
      if (i % 2 === 0) tips += circlePath(burst.cx + cos * r * 1.1, burst.cy + sin * r * 1.1, width);
      const half = angle + Math.PI / burst.rays;
      inner += circlePath(burst.cx + Math.cos(half) * r * 0.55, burst.cy + Math.sin(half) * r * 0.55, width * 0.5);
    }
    blocks.push({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      path: circlePath(burst.cx, burst.cy, r * 0.72),
      fill: {
        kind: "radial",
        cx: burst.cx,
        cy: burst.cy,
        r: r * 0.72,
        stops: [
          { offset: 0, color: withAlpha(burst.colors[0], 0.42) },
          { offset: 1, color: withAlpha(burst.colors[0], 0) },
        ],
      },
      composite: "lighter",
    });
    rays.forEach((path, ray) => {
      blocks.push({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        path,
        stroke: { color: burst.colors[ray], width, cap: "round" },
        shadowColor: withAlpha(burst.colors[ray], 0.8),
        shadowBlur: width * 2.5,
      });
    });
    blocks.push(
      { x: 0, y: 0, width: 0, height: 0, path: tips, fill: { kind: "solid", color: "#FFFFFF" } },
      { x: 0, y: 0, width: 0, height: 0, path: inner, fill: { kind: "solid", color: burst.colors[1] }, opacity: 0.9 }
    );
  });
  return blocks;
};

/** Lasers: thin beams with a glow and a white core, fanning in from the top corners. */
const laserBlocks = (plan: CelebrationPlan, t: number): StoryShapeBlock[] => {
  const blocks: StoryShapeBlock[] = [];
  const fadeIn = clamp01(t / 0.6);
  if (fadeIn <= 0) return blocks;
  for (const beam of plan.beams) {
    // Sways, then settles into the still picture's angle by the hero moment.
    const settle = clamp01((CELEBRATION_HERO_T - t) / 1.2);
    const angle = beam.angle + Math.sin((t - CELEBRATION_HERO_T) * 1.6) * LASER_SWAY * beam.sway * settle;
    const L = beam.length;
    const transform = { x: beam.ox, y: beam.oy, rotate: angle };
    const fade = (alpha: number) => ({
      kind: "linear" as const,
      x0: 0,
      y0: 0,
      x1: L,
      y1: 0,
      stops: [
        { offset: 0, color: withAlpha(beam.color, alpha) },
        { offset: 0.4, color: withAlpha(beam.color, alpha * 0.45) },
        { offset: LASER_VISIBLE, color: withAlpha(beam.color, 0) },
      ],
    });
    const wedge = (start: number, end: number) => `M0 ${n1(-start)}L${n1(L)} ${n1(-end)}L${n1(L)} ${n1(end)}L0 ${n1(start)}Z`;
    blocks.push(
      { x: 0, y: 0, width: 0, height: 0, path: wedge(10, 34), fill: fade(0.14), transform, composite: "lighter", opacity: fadeIn },
      { x: 0, y: 0, width: 0, height: 0, path: wedge(3, 7), fill: fade(0.62), transform, composite: "lighter", opacity: fadeIn },
      {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        path: wedge(1, 2),
        fill: { kind: "linear", x0: 0, y0: 0, x1: L * 0.6, y1: 0, stops: [{ offset: 0, color: "rgba(255, 255, 255, 0.7)" }, { offset: 1, color: "rgba(255, 255, 255, 0)" }] },
        transform,
        composite: "lighter",
        opacity: fadeIn,
      }
    );
  }
  // A soft glow where the beams start.
  for (const side of [...new Set(plan.beams.map((beam) => beam.ox))]) {
    const oy = plan.beams.find((beam) => beam.ox === side)?.oy ?? 0;
    blocks.push({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      path: circlePath(side, oy, 150),
      fill: { kind: "radial", cx: side, cy: oy, r: 150, stops: [{ offset: 0, color: "rgba(255, 255, 255, 0.5)" }, { offset: 1, color: "rgba(255, 255, 255, 0)" }] },
      composite: "lighter",
      opacity: fadeIn,
    });
  }
  return blocks;
};

/** Seconds of fall still to come `before` s ahead of the hero moment: it slows to rest over the last 0.6 s. */
const CONFETTI_SETTLE = 0.6;
const fallStill = (before: number): number =>
  before >= CONFETTI_SETTLE ? before - CONFETTI_SETTLE / 2 : (before * before) / (2 * CONFETTI_SETTLE);

/**
 * Confetti: strips and dots, one path per colour. Before the hero moment it is still falling in, and
 * a piece passing a word, the QR, the panel or a face is hidden there, as if it fell behind it.
 */
const confettiBlocks = (plan: CelebrationPlan, t: number): StoryShapeBlock[] => {
  const before = fallStill(Math.max(0, CELEBRATION_HERO_T - t));
  const byColor = new Map<string, string>();
  for (const piece of plan.pieces) {
    const y = piece.y - before * piece.fall;
    if (y < -40) continue;
    if (before > 0 && plan.keepOut.some((rect) => circleHitsRect(piece.x, y, pieceReach(piece), rect, 4))) continue;
    const rot = piece.rot + before * piece.spin;
    let path: string;
    if (piece.kind === "dot") {
      path = circlePath(piece.x, y, piece.size);
    } else {
      const halfL = piece.size / 2;
      const halfW = piece.size * 0.2;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const corner = (along: number, across: number) => `${n1(piece.x + cos * along - sin * across)} ${n1(y + sin * along + cos * across)}`;
      path = `M${corner(-halfL, -halfW)}L${corner(halfL, -halfW)}L${corner(halfL, halfW)}L${corner(-halfL, halfW)}Z`;
    }
    byColor.set(piece.color, (byColor.get(piece.color) ?? "") + path);
  }
  return [...byColor.entries()].map(([color, path]) => ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    path,
    fill: { kind: "solid" as const, color },
    opacity: 0.95,
  }));
};

// One open hand, palm out, fingers up; local units, wrist at (0, 0). Thumb on the left.
const HAND_PARTS: readonly string[] = [
  roundRectPath(-42, -112, 84, 116, 36),
  capsulePath(-31, -96, -31, -168, 10),
  capsulePath(-10, -100, -10, -180, 10),
  capsulePath(11, -98, 11, -172, 10),
  capsulePath(31, -88, 31, -150, 9),
  capsulePath(-34, -36, -70, -86, 11),
];
const HAND_OUTLINE_PATH = HAND_PARTS.join("");
const HAND_OUTLINE = "#0F172A";
const HAND_FILL = "#FFFFFF";

/** A pair of clapping hands, tips meeting, with motion lines, centred on the spot (art box: `CLAP_ART`). */
const handPairBlocks = (clap: Clap, accent: string, t: number): StoryShapeBlock[] => {
  const s = clap.size / CLAP_ART.width;
  const cos = Math.cos(clap.tilt);
  const sin = Math.sin(clap.tilt);
  /** Pair-local point → canvas: rotate by the tilt about the art's centre, scale, move to the spot. */
  const place = (x: number, y: number) => {
    const dy = y - CLAP_ART.centerY;
    return { x: clap.cx + (x * cos - dy * sin) * s, y: clap.cy + (x * sin + dy * cos) * s };
  };
  const open = Math.abs(Math.sin((t - CELEBRATION_HERO_T) * Math.PI * 2.4)) * 0.16;
  const hand = (side: -1 | 1): StoryShapeBlock[] => {
    const lean = 0.3 - open;
    const wrist = place(side * 66, 0);
    const transform = { x: wrist.x, y: wrist.y, rotate: clap.tilt + (side < 0 ? lean : -lean), scale: side < 0 ? s : -s, scaleY: s };
    // Outline every part, then fill each on its own: one combined path would cancel where parts overlap.
    return [
      { x: 0, y: 0, width: 0, height: 0, path: HAND_OUTLINE_PATH, stroke: { color: HAND_OUTLINE, width: 14, join: "round" }, transform },
      ...HAND_PARTS.map((path): StoryShapeBlock => ({ x: 0, y: 0, width: 0, height: 0, path, fill: { kind: "solid", color: HAND_FILL }, transform })),
    ];
  };
  let lines = "";
  for (const degrees of [-150, -120, -90, -60, -30]) {
    const angle = (degrees * Math.PI) / 180;
    const from = 34 + open * 40;
    lines += `M${n1(Math.cos(angle) * from)} ${n1(-196 + Math.sin(angle) * from)}L${n1(Math.cos(angle) * (from + 30))} ${n1(-196 + Math.sin(angle) * (from + 30))}`;
  }
  const origin = place(0, 0);
  return [
    ...hand(-1),
    ...hand(1),
    {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      path: lines,
      stroke: { color: accent, width: 10, cap: "round" },
      transform: { x: origin.x, y: origin.y, rotate: clap.tilt, scale: s },
      shadowColor: "rgba(0, 0, 0, 0.35)",
      shadowBlur: 6,
    },
  ];
};

const clappingBlocks = (plan: CelebrationPlan, t: number): StoryShapeBlock[] =>
  plan.claps.flatMap((clap) => handPairBlocks(clap, plan.palette.gold, t));

/**
 * The chosen effects at time `t`, in the renderer's three layers. From the hero moment on it is the
 * still picture, held (an animated Story's last 1.5 s).
 */
export const celebrationLayers = (
  plan: CelebrationPlan,
  effects: readonly CelebrationEffect[],
  time: number = CELEBRATION_HERO_T
): StoryEffectLayers => {
  const t = Math.min(Math.max(0, time), CELEBRATION_HERO_T);
  const on = new Set(normalizeCelebrationEffects(effects));
  return {
    behind: on.has("lasers") ? laserBlocks(plan, t) : [],
    middle: [...(on.has("confetti") ? confettiBlocks(plan, t) : []), ...(on.has("fireworks") ? fireworksBlocks(plan, t) : [])],
    front: on.has("clapping") ? clappingBlocks(plan, t) : [],
  };
};

/** Where an effect landed, for tests and the visual check. Bursts are circles; the rest are boxes. */
export const celebrationFootprint = (plan: CelebrationPlan) => ({
  fireworks: plan.bursts.map((burst) => ({ cx: burst.cx, cy: burst.cy, r: burstReach(burst.r) })),
  confetti: plan.pieces.map((piece): EffectRect => {
    const reach = pieceReach(piece);
    return { x: piece.x - reach, y: piece.y - reach, width: reach * 2, height: reach * 2 };
  }),
  clapping: plan.claps.map(clapBox),
});
