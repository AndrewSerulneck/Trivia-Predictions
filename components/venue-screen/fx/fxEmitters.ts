// Pure, deterministic effect emitters for the venue display (docs/venue-display-hype-and-intro-stinger-plan.md
// §4 Phase 0). Each emitter is `(tSeconds) → draw list`: no DOM, no clock, no Math.random, so frames are
// unit-testable (tests/venue-screen-fx.test.ts) and two TVs firing the same key draw the same burst.
// Coordinates are CSS pixels in the viewport; FxCanvas scales them to its backing store.
// Physics and look follow the ad stinger (`stingerTimeline.ts`): same RNG, drag, gravity and colours.

import { easeOut, prog, rng } from "@/components/venue-screen/stingerTimeline";

export type FxPoint = { x: number; y: number };
export type FxRect = { x: number; y: number; w: number; h: number };

/** Sprite ids: `coin`, or a kind plus a CSS colour (`spark:#67e8f9`). Built once and cached (fxSprites.ts). */
export type FxSpriteId = "coin" | `spark:${string}` | `twinkle:${string}` | `confetti:${string}`;

export type FxSpriteOp = {
  kind: "sprite";
  sprite: FxSpriteId;
  x: number;
  y: number;
  /** Radius in CSS px (the sprite is scaled by r / its unit). */
  r: number;
  alpha: number;
  rotation: number;
  /** Horizontal squash for coin spin / confetti flip (1 = none). */
  squashX: number;
};

export type FxRingOp = {
  kind: "ring";
  x: number;
  y: number;
  radius: number;
  /** Bright core stroke width. */
  core: number;
  /** Faint wide stroke under the core, standing in for a blurred glow. */
  glow: number;
  coreColor: string;
  glowColor: string;
  alpha: number;
};

export type FxDrawOp = FxSpriteOp | FxRingOp;

export type FxEmitter = {
  /** Seconds. `Infinity` for ambient emitters, which run until stopped. */
  duration: number;
  frame: (t: number) => FxDrawOp[];
};

/** The ad's colours (plan §1 decision 6). */
export const FX_COLORS = {
  cyan: "#67e8f9",
  gold: "#fde68a",
  white: "#ffffff",
  ringCore: "rgba(165, 243, 252, 0.75)",
  ringGlow: "rgba(34, 211, 238, 0.28)",
} as const;

/** Stinger mix: 70 % cyan, 30 % gold sparks. */
export const FX_DEFAULT_SPARKS: readonly string[] = [
  FX_COLORS.cyan, FX_COLORS.cyan, FX_COLORS.cyan, FX_COLORS.cyan, FX_COLORS.cyan, FX_COLORS.cyan, FX_COLORS.cyan,
  FX_COLORS.gold, FX_COLORS.gold, FX_COLORS.gold,
];

/** FNV-1a: a stable 32-bit seed from an effect's identity key. */
export const seedFromKey = (key: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/** Particle count for a quality density (1 full, 0.5 lite, 0 off). Never negative, never fractional. */
export const scaleCount = (n: number, density: number): number =>
  density <= 0 || n <= 0 ? 0 : Math.max(1, Math.round(n * Math.min(1, density)));

const pick = <T,>(list: readonly T[], r: number): T => list[Math.min(list.length - 1, Math.floor(r * list.length))];

const DRAG = 1.6;
const travel = (speed: number, t: number): number => (speed / DRAG) * (1 - Math.exp(-DRAG * t));

/* ------------------------------------------------------------------ burst */

export type BurstSpec = {
  at: FxPoint;
  /** Scale of the burst in CSS px (the stinger's logo size L). */
  size: number;
  seed: number;
  coins?: number;
  sparks?: number;
  sparkColors?: readonly string[];
  /** Coins and sparks fall (the stinger does); off for a flat radial pop. */
  gravity?: boolean;
  density?: number;
};

/** Coins and sparks flying out from a point, the stinger's T_HIT explosion. */
export const createBurst = (spec: BurstSpec): FxEmitter => {
  const { at, size: L, seed, gravity = true, density = 1 } = spec;
  const colors = spec.sparkColors?.length ? spec.sparkColors : FX_DEFAULT_SPARKS;
  const rand = rng(seed);
  const coins = Array.from({ length: scaleCount(spec.coins ?? 18, density) }, () => {
    const a = rand() * Math.PI * 2;
    return {
      a, sp: L * (0.9 + rand() * 1.6), r: L * (0.022 + rand() * 0.03), spin: 6 + rand() * 10, ph: rand() * 6.28,
      off: L * (0.08 + rand() * 0.18), life: 1.1 + rand() * 0.7, tilt: rand() * 0.8 - 0.4,
    };
  });
  const sparks = Array.from({ length: scaleCount(spec.sparks ?? 28, density) }, () => {
    const a = rand() * Math.PI * 2;
    return {
      a, sp: L * (1.1 + rand() * 2.0), r: L * (0.008 + rand() * 0.016), off: L * (0.05 + rand() * 0.2),
      life: 0.6 + rand() * 0.7, color: pick(colors, rand()),
    };
  });
  const grav = gravity ? L * 1.1 : 0;
  const duration = Math.max(0, ...coins.map((c) => c.life), ...sparks.map((s) => s.life));

  return {
    duration,
    frame: (t) => {
      const ops: FxDrawOp[] = [];
      if (t <= 0) return ops;
      for (const s of sparks) {
        if (t >= s.life) continue;
        const d = s.off + travel(s.sp, t);
        ops.push({
          kind: "sprite", sprite: `spark:${s.color}`,
          x: at.x + Math.cos(s.a) * d, y: at.y + Math.sin(s.a) * d + 0.3 * grav * t * t,
          r: s.r * (1 - (t / s.life) * 0.5), alpha: 1 - t / s.life, rotation: 0, squashX: 1,
        });
      }
      for (const c of coins) {
        if (t >= c.life) continue;
        const fade = 1 - prog(t, c.life - 0.35, c.life);
        if (fade <= 0) continue;
        const d = c.off + travel(c.sp, t);
        ops.push({
          kind: "sprite", sprite: "coin",
          x: at.x + Math.cos(c.a) * d, y: at.y + Math.sin(c.a) * d + 0.5 * grav * t * t,
          r: c.r * (1 + t * 0.4), alpha: fade, rotation: c.tilt,
          squashX: Math.max(0.08, Math.abs(Math.cos(c.ph + c.spin * t))),
        });
      }
      return ops;
    },
  };
};

/* ------------------------------------------------------------------ shower */

export type ShowerSpec = {
  /** Pieces fall from the top of this rect to its bottom. */
  area: FxRect;
  seed: number;
  count?: number;
  /** `coins`, `confetti` (in `colors`), or a mix. */
  kind?: "coins" | "confetti" | "mixed";
  colors?: readonly string[];
  /** Piece radius in CSS px. */
  pieceSize?: number;
  duration?: number;
  density?: number;
};

/** Coins and/or confetti raining down a rect, swaying and flipping, every piece gone by `duration`. */
export const createShower = (spec: ShowerSpec): FxEmitter => {
  const { area, seed, kind = "mixed", density = 1 } = spec;
  const duration = spec.duration ?? 3.2;
  const colors = spec.colors?.length ? spec.colors : [FX_COLORS.cyan, FX_COLORS.gold, FX_COLORS.white];
  const size = spec.pieceSize ?? Math.max(8, Math.min(area.w, area.h) * 0.018);
  const rand = rng(seed);
  const pieces = Array.from({ length: scaleCount(spec.count ?? 48, density) }, () => {
    const isCoin = kind === "coins" || (kind === "mixed" && rand() < 0.4);
    const delay = rand() * duration * 0.4;
    return {
      sprite: (isCoin ? "coin" : `confetti:${pick(colors, rand())}`) as FxSpriteId,
      x0: area.x + rand() * area.w,
      delay,
      // Crosses the rect in 75–95 % of the time it has left.
      fall: (area.h + size * 4) / ((duration - delay) * (0.75 + rand() * 0.2)),
      sway: size * (1 + rand() * 2),
      swayHz: 0.4 + rand() * 0.5,
      spin: 3 + rand() * 6,
      ph: rand() * 6.28,
      r: size * (isCoin ? 1.15 : 1) * (0.75 + rand() * 0.5),
      rot0: rand() * 6.28,
      rotSpeed: rand() * 4 - 2,
    };
  });

  return {
    duration,
    frame: (t) => {
      const ops: FxDrawOp[] = [];
      for (const p of pieces) {
        const lt = t - p.delay;
        if (lt <= 0) continue;
        const life = duration - p.delay;
        if (lt >= life) continue;
        const y = area.y - size * 2 + p.fall * lt;
        if (y > area.y + area.h + size * 2) continue;
        ops.push({
          kind: "sprite", sprite: p.sprite,
          x: p.x0 + Math.sin(p.ph + lt * p.swayHz * Math.PI * 2) * p.sway, y,
          r: p.r, alpha: 1 - prog(lt, life * 0.85, life),
          rotation: p.rot0 + p.rotSpeed * lt,
          squashX: Math.max(0.12, Math.abs(Math.cos(p.ph + p.spin * lt))),
        });
      }
      return ops;
    },
  };
};

/* ------------------------------------------------------------------ twinkle field */

export type TwinkleFieldSpec = {
  area: FxRect;
  seed: number;
  count?: number;
  /** Star radius in CSS px at full twinkle. */
  starSize?: number;
  colors?: readonly string[];
  /** Seconds; `Infinity` (default) = ambient, runs until stopped. */
  duration?: number;
  density?: number;
};

/** Each star's twinkle lasts this long within its own 3–6 s cycle. */
export const TWINKLE_ON_S = 0.7;
const FIELD_FADE_S = 1;

/** Sparse 4-point stars popping in and out at fixed spots; fades in over 1 s, and out over its last 1 s. */
export const createTwinkleField = (spec: TwinkleFieldSpec): FxEmitter => {
  const { area, seed, density = 1 } = spec;
  const duration = spec.duration ?? Infinity;
  const colors = spec.colors?.length ? spec.colors : [FX_COLORS.white, FX_COLORS.white, FX_COLORS.cyan, FX_COLORS.gold];
  const size = spec.starSize ?? Math.max(6, Math.min(area.w, area.h) * 0.012);
  const rand = rng(seed);
  const stars = Array.from({ length: scaleCount(spec.count ?? 14, density) }, () => ({
    x: area.x + rand() * area.w,
    y: area.y + rand() * area.h,
    period: 3 + rand() * 3,
    phase: rand() * 6,
    r: size * (0.6 + rand() * 0.8),
    color: pick(colors, rand()),
  }));

  return {
    duration,
    frame: (t) => {
      const ops: FxDrawOp[] = [];
      if (t <= 0 || t >= duration) return ops;
      const field = Math.min(easeOut(prog(t, 0, FIELD_FADE_S)), Number.isFinite(duration) ? 1 - prog(t, duration - FIELD_FADE_S, duration) : 1);
      if (field <= 0) return ops;
      for (const s of stars) {
        const local = (t + s.phase) % s.period;
        if (local >= TWINKLE_ON_S) continue;
        const a = Math.sin((local / TWINKLE_ON_S) * Math.PI);
        if (a <= 0) continue;
        ops.push({ kind: "sprite", sprite: `twinkle:${s.color}`, x: s.x, y: s.y, r: s.r * a, alpha: a * field, rotation: 0, squashX: 1 });
      }
      return ops;
    },
  };
};

/* ------------------------------------------------------------------ shockwave */

export type ShockwaveSpec = {
  at: FxPoint;
  /** Scale in CSS px (the stinger's L): the ring grows from 0.35 L to 1.3 L. */
  size: number;
  duration?: number;
  coreColor?: string;
  glowColor?: string;
};

/** The stinger's expanding ring at T_HIT. */
export const createShockwave = (spec: ShockwaveSpec): FxEmitter => {
  const { at, size: L } = spec;
  const duration = spec.duration ?? 0.65;
  return {
    duration,
    frame: (t) => {
      const p = t / duration;
      if (p <= 0 || p >= 1) return [];
      const core = L * 0.03 * (1 - p) + 1;
      return [{
        kind: "ring", x: at.x, y: at.y, radius: L * (0.35 + easeOut(p) * 0.95), core, glow: core + L * 0.05,
        coreColor: spec.coreColor ?? FX_COLORS.ringCore, glowColor: spec.glowColor ?? FX_COLORS.ringGlow, alpha: 1 - p,
      }];
    },
  };
};

/** Several emitters as one (drawn in order, so list the back layer first); lives as long as the longest. */
export const combineEmitters = (...emitters: FxEmitter[]): FxEmitter => ({
  duration: Math.max(0, ...emitters.map((e) => e.duration)),
  frame: (t) => emitters.flatMap((e) => (t < e.duration ? e.frame(t) : [])),
});

/** Whether an emitter still has frames to draw at t. */
export const isEmitterAlive = (emitter: FxEmitter, t: number): boolean => t < emitter.duration;
