// Pre-rendered effect sprites for the venue display (docs/venue-display-hype-and-intro-stinger-plan.md §4 Phase 0).
// Every glow is baked in once here, so per-frame drawing never uses `shadowBlur` (too slow on TV sticks).
// Shared by the intro stinger (exact-size sprites per scene) and the fx engine (cached fixed-size sprites).
// Browser-only: these draw to <canvas>.

import type { FxSpriteId } from "@/components/venue-screen/fx/fxEmitters";

export type Ctx = CanvasRenderingContext2D;
/** A square sprite: `half` is half its canvas side, `unit` is the radius it was drawn at (scale = r / unit). */
export type Sprite = { canvas: HTMLCanvasElement; half: number; unit: number };

export const makeCanvas = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
};

export const ctx2d = (c: HTMLCanvasElement): Ctx => {
  const context = c.getContext("2d");
  if (!context) throw new Error("2d context unavailable");
  return context;
};

const starPath = (ctx: Ctx, r: number) => {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 === 0 ? r : r * 0.22;
    const ang = (i * Math.PI) / 4 - Math.PI / 2;
    ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
  }
  ctx.closePath();
};

/** 4-point star with its glow baked in (stinger.html star4: shadowBlur = r × 2.2). */
export const glowStarSprite = (color: string, unit: number): Sprite => {
  const half = unit * 3.6;
  const canvas = makeCanvas(half * 2, half * 2);
  const ctx = ctx2d(canvas);
  ctx.translate(half, half);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = unit * 2.2;
  starPath(ctx, unit);
  ctx.fill();
  return { canvas, half, unit };
};

/** Gold coin face (stinger.html coin(), no squash — squash/tilt are applied per frame). */
export const coinSprite = (unit: number): Sprite => {
  const half = unit + 2;
  const canvas = makeCanvas(half * 2, half * 2);
  const ctx = ctx2d(canvas);
  ctx.translate(half, half);
  const r = unit;
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, "#fff3b0");
  g.addColorStop(0.45, "#fbbf24");
  g.addColorStop(1, "#b45309");
  ctx.fillStyle = "#92400e";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.86, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 248, 200, 0.85)";
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r * 0.5 : r * 0.22;
    const ang = (i * Math.PI) / 5 - Math.PI / 2;
    ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
  }
  ctx.closePath();
  ctx.fill();
  return { canvas, half, unit };
};

/** A confetti chip (2 × 1.1 units) with a light top edge; flip and spin are applied per frame. */
export const confettiSprite = (color: string, unit: number): Sprite => {
  const half = unit * 1.2;
  const canvas = makeCanvas(half * 2, half * 2);
  const ctx = ctx2d(canvas);
  ctx.translate(half, half);
  const w = unit * 2;
  const h = unit * 1.1;
  ctx.fillStyle = color;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, "rgba(255,255,255,0.45)");
  g.addColorStop(0.5, "rgba(255,255,255,0)");
  g.addColorStop(1, "rgba(0,0,0,0.18)");
  ctx.fillStyle = g;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  return { canvas, half, unit };
};

/*
 * Fixed-size sprite cache for the fx engine. Units are big enough that a burst sized for a 4K TV
 * (backing store capped at 2880 px, see fxBackingScale) rarely scales a sprite up more than ~2×.
 * Colours are bounded by the game palettes, so the cache stays small (≈ a few MB at most).
 */
export const FX_SPRITE_UNITS = { coin: 96, spark: 28, twinkle: 40, confetti: 22 } as const;

const cache = new Map<FxSpriteId, Sprite>();

const buildFxSprite = (id: FxSpriteId): Sprite => {
  if (id === "coin") return coinSprite(FX_SPRITE_UNITS.coin);
  const sep = id.indexOf(":");
  const kind = id.slice(0, sep);
  const color = id.slice(sep + 1);
  if (kind === "spark") return glowStarSprite(color, FX_SPRITE_UNITS.spark);
  if (kind === "twinkle") return glowStarSprite(color, FX_SPRITE_UNITS.twinkle);
  return confettiSprite(color, FX_SPRITE_UNITS.confetti);
};

/** The cached sprite for an id, built on first use. */
export const getFxSprite = (id: FxSpriteId): Sprite => {
  let sprite = cache.get(id);
  if (!sprite) {
    sprite = buildFxSprite(id);
    cache.set(id, sprite);
  }
  return sprite;
};
