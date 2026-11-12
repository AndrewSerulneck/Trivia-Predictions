"use client";

import { useEffect, useRef } from "react";
import {
  STINGER_HARD_STOP_MS,
  STINGER_LOGO_TIMEOUT_MS,
  TAG_A,
  TAG_B,
  T_HIT,
  T_IN,
  T_REVEAL_END,
  T_SHINE,
  T_TAG,
  easeIn,
  easeInOut,
  easeOut,
  exitProgress,
  prog,
  spring,
  stageAlpha,
  stingerGeometry,
  stingerParticles,
  taglineAlpha,
  type StingerGeometry,
  type StingerParticles,
} from "@/components/venue-screen/stingerTimeline";
import { SCREEN_COLORS } from "@/lib/venueScreenBrand";
import { loadCanvasFonts, resolveCanvasFont } from "@/lib/socialShare/storyCanvas";

/* ------------------------------------------------------------------ *
 * <TvIntroStinger />
 * The "Explosion" ad stinger (logo bursts in with coins, "IT'S GAME TIME."),
 * played over the venue display every time it opens, then the navy stage
 * fades away to reveal the live screen underneath (~4.3 s).
 *
 * Port of `stinger.html` from Andrew's ad library: same timeline, seed,
 * particle counts, spring and colours. Differences: sized from the viewport,
 * glows pre-rendered to sprites once (no per-frame shadowBlur), and the exit
 * reveals the screen instead of fading to navy.
 *
 * Fail open: the overlay unmounts at STINGER_HARD_STOP_MS regardless, is
 * skipped when the logo can't decode within STINGER_LOGO_TIMEOUT_MS, and any
 * drawing error ends it early. The screen and its poll loop run underneath.
 * ------------------------------------------------------------------ */

export const STINGER_LOGO_SRC = "/brand/web/htc-logo-1254.webp";
/** Impact lands 0.30 s into the file (T_HIT), so it starts with the first animation frame. */
export const STINGER_SOUND_SRC = "/brand/web/htc-stinger-boom-v1.m4a";

/** Shine file's sound starts at its first sample; it plays when the tagline starts (T_TAG). */
export const STINGER_SHINE_SRC = "/brand/web/htc-stinger-shine-v1.m4a";

const makeAudio = (src: string): HTMLAudioElement | null => {
  try {
    const audio = new Audio(src);
    audio.preload = "auto";
    return audio;
  } catch {
    return null;
  }
};

/** Best-effort: TV browsers usually block unprompted sound; any failure stays silent. */
const playStingerSound = (audio: HTMLAudioElement | null) => {
  if (!audio) return;
  try {
    const played = audio.play();
    if (played && typeof played.catch === "function") played.catch(() => undefined);
  } catch {
    // Silent fallback.
  }
};

/** Backing-store cap: keeps the full-screen fills affordable on TV sticks at 4K. */
const MAX_CANVAS_LONG_SIDE = 2880;
const TAG_FONT = (size: number) => resolveCanvasFont(`900 ${Math.round(size)}px var(--ht-font-body)`);

type Ctx = CanvasRenderingContext2D;
type Sprite = { canvas: HTMLCanvasElement; half: number; unit: number };

const makeCanvas = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
};

const ctx2d = (c: HTMLCanvasElement): Ctx => {
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
const glowStarSprite = (color: string, unit: number): Sprite => {
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
const coinSprite = (unit: number): Sprite => {
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

/** The logo at size L with its cyan glow baked in. */
const logoGlowSprite = (logo: HTMLImageElement, L: number): Sprite => {
  const half = L * 0.5 + L * 0.2;
  const canvas = makeCanvas(half * 2, half * 2);
  const ctx = ctx2d(canvas);
  ctx.shadowColor = "rgba(34, 211, 238, 0.45)";
  ctx.shadowBlur = L * 0.08;
  ctx.drawImage(logo, half - L / 2, half - L / 2, L, L);
  return { canvas, half, unit: L };
};

/** Only the tagline's drop shadow (text drawn off-canvas, shadow offset back on). */
const taglineShadowSprite = (font: string, size: number, W: number): { canvas: HTMLCanvasElement; y0: number; x0: number } => {
  const pad = size * 1.2;
  const canvas = makeCanvas(W, size + pad * 2);
  const ctx = ctx2d(canvas);
  ctx.font = font;
  ctx.textBaseline = "middle";
  setTracking(ctx, size * 0.06);
  const gap = size * 0.32;
  const wa = ctx.measureText(TAG_A).width;
  const wb = ctx.measureText(TAG_B).width;
  const x0 = W / 2 - (wa + gap + wb) / 2 + (size * 0.06) / 2;
  const off = W * 2;
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = size * 0.35;
  ctx.shadowOffsetX = off;
  ctx.shadowOffsetY = size * 0.06;
  ctx.fillStyle = "#000";
  const y = canvas.height / 2;
  ctx.fillText(TAG_A, x0 - off, y);
  ctx.fillText(TAG_B, x0 + wa + gap - off, y);
  return { canvas, y0: canvas.height / 2, x0: 0 };
};

const setTracking = (ctx: Ctx, px: number) => {
  const spaced = ctx as Ctx & { letterSpacing?: string };
  if ("letterSpacing" in ctx) spaced.letterSpacing = `${px}px`;
};

type Scene = {
  W: number;
  H: number;
  g: StingerGeometry;
  parts: StingerParticles;
  coin: Sprite;
  sparkCyan: Sprite;
  sparkGold: Sprite;
  twinkle: Sprite;
  logo: Sprite;
  logoImg: HTMLImageElement;
  shine: HTMLCanvasElement;
  font: string;
  tagShadow: { canvas: HTMLCanvasElement; y0: number; x0: number };
};

const buildScene = (W: number, H: number, logoImg: HTMLImageElement): Scene => {
  const g = stingerGeometry(W, H);
  const { L } = g;
  const font = TAG_FONT(g.tagSize);
  return {
    W,
    H,
    g,
    parts: stingerParticles(L),
    coin: coinSprite(L * 0.052 * 1.8),
    sparkCyan: glowStarSprite("#67e8f9", L * 0.024),
    sparkGold: glowStarSprite("#fde68a", L * 0.024),
    twinkle: glowStarSprite("#ffffff", L * 0.042),
    logo: logoGlowSprite(logoImg, L),
    logoImg,
    shine: makeCanvas(L, L),
    font,
    tagShadow: taglineShadowSprite(font, g.tagSize, W),
  };
};

const drawSprite = (ctx: Ctx, s: Sprite, x: number, y: number, r: number, alpha: number) => {
  if (alpha <= 0 || r <= 0) return;
  const k = r / s.unit;
  ctx.globalAlpha = alpha;
  ctx.drawImage(s.canvas, x - s.half * k, y - s.half * k, s.half * 2 * k, s.half * 2 * k);
};

const drawBackground = (ctx: Ctx, sc: Scene, t: number, reduced: boolean) => {
  const { W, H, g } = sc;
  const stage = stageAlpha(t);
  if (stage <= 0) return;
  const exitP = exitProgress(t);
  ctx.globalAlpha = stage;
  ctx.fillStyle = SCREEN_COLORS.canvas;
  ctx.fillRect(0, 0, W, H);
  if (reduced) return;

  const R = Math.hypot(W, H) * 0.6;
  const bloom = easeOut(prog(t, 0, 0.45)) * (1 - 0.35 * exitP);
  const bg = ctx.createRadialGradient(g.CX, g.CY, 0, g.CX, g.CY, R);
  bg.addColorStop(0, `rgba(8, 145, 178, ${0.55 * bloom})`);
  bg.addColorStop(0.35, `rgba(30, 58, 138, ${0.35 * bloom})`);
  bg.addColorStop(1, "rgba(2, 6, 23, 0)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const rayA = easeOut(prog(t, 0.15, 0.8)) * (1 - exitP);
  if (rayA > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(g.CX, g.CY);
    ctx.rotate(t * 0.22);
    const n = 18;
    const len = R * 1.1;
    const rg = ctx.createRadialGradient(0, 0, g.L * 0.15, 0, 0, len);
    rg.addColorStop(0, `rgba(34, 211, 238, ${0.3 * rayA})`);
    rg.addColorStop(0.5, `rgba(59, 130, 246, ${0.1 * rayA})`);
    rg.addColorStop(1, "rgba(59, 130, 246, 0)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const w = (Math.PI / n) * 0.55;
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, len, a0 - w, a0 + w);
      ctx.closePath();
    }
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = stage;
  }

  const v = ctx.createRadialGradient(g.CX, g.CY, Math.min(W, H) * 0.35, g.CX, g.CY, Math.hypot(W, H) * 0.62);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
};

const drawShockwave = (ctx: Ctx, sc: Scene, t: number) => {
  const { g, W, H } = sc;
  const p = prog(t, T_HIT, T_HIT + 0.65);
  if (p > 0 && p < 1) {
    const e = easeOut(p);
    const radius = g.L * (0.35 + e * 0.95);
    const core = g.L * 0.03 * (1 - p) + 1;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // Glow stand-in for the ad's blurred ring: a wide faint stroke under the core.
    ctx.strokeStyle = `rgba(34, 211, 238, ${0.28 * (1 - p)})`;
    ctx.lineWidth = core + g.L * 0.05;
    ctx.beginPath();
    ctx.arc(g.CX, g.CY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(165, 243, 252, ${0.75 * (1 - p)})`;
    ctx.lineWidth = core;
    ctx.stroke();
    ctx.restore();
  }
  const f = 1 - prog(t, T_HIT, T_HIT + 0.28);
  if (f > 0 && t >= T_HIT) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const fg = ctx.createRadialGradient(g.CX, g.CY, 0, g.CX, g.CY, g.L * 0.9);
    fg.addColorStop(0, `rgba(255,255,255,${0.55 * f})`);
    fg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
};

const drawParticles = (ctx: Ctx, sc: Scene, t: number, front: boolean) => {
  const dt = t - T_HIT;
  if (dt <= 0) return;
  const { g, parts } = sc;
  const grav = g.L * 1.1;
  const drag = 1.6;
  const travel = (sp: number) => (sp / drag) * (1 - Math.exp(-drag * dt));
  if (front) {
    const s = sc.coin;
    for (const c of parts.coins) {
      if (dt > c.life) continue;
      const d = c.off + travel(c.sp);
      const x = g.CX + Math.cos(c.a) * d;
      const y = g.CY + Math.sin(c.a) * d + 0.5 * grav * dt * dt;
      const fade = 1 - prog(dt, c.life - 0.35, c.life);
      if (fade <= 0) continue;
      const r = c.r * (1 + dt * 0.4);
      const k = r / s.unit;
      const squash = Math.max(0.08, Math.abs(Math.cos(c.ph + c.spin * dt)));
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(x, y);
      ctx.rotate(c.tilt);
      ctx.scale(squash * k, k);
      ctx.drawImage(s.canvas, -s.half, -s.half);
      ctx.restore();
    }
  } else {
    for (const sp of parts.sparks) {
      if (dt > sp.life) continue;
      const d = sp.off + travel(sp.sp);
      const x = g.CX + Math.cos(sp.a) * d;
      const y = g.CY + Math.sin(sp.a) * d + 0.3 * grav * dt * dt;
      drawSprite(ctx, sp.gold ? sc.sparkGold : sc.sparkCyan, x, y, sp.r * (1 - (dt / sp.life) * 0.5), 1 - dt / sp.life);
    }
    ctx.globalAlpha = 1;
  }
};

const drawLogo = (ctx: Ctx, sc: Scene, t: number, reduced: boolean) => {
  const tau = t - T_IN;
  if (tau <= 0) return;
  const { g } = sc;
  const L = g.L;
  const ex = easeIn(exitProgress(t));

  if (reduced) {
    const alpha = easeOut(prog(tau, 0, 0.4)) * (1 - ex);
    if (alpha <= 0) return;
    ctx.globalAlpha = alpha;
    ctx.drawImage(sc.logo.canvas, g.CX - sc.logo.half, g.CY - sc.logo.half);
    ctx.globalAlpha = 1;
    return;
  }

  let s = spring(tau);
  const rot = -0.28 * Math.exp(-7.5 * tau) * Math.cos(13.5 * tau);
  const fadeIn = easeOut(prog(tau, 0, 0.12));
  const idle = prog(t, 1.0, 1.6);
  const fy = Math.sin((t - 1.0) * 2.4) * L * 0.006 * idle;
  s *= 1 + Math.sin((t - 1.0) * 2.4 + 1.2) * 0.006 * idle;
  s *= 1 + ex * 0.45;
  const alpha = fadeIn * (1 - ex);
  if (alpha <= 0) return;

  const sd = t - T_HIT;
  const shake = sd > 0 ? L * 0.014 * Math.exp(-10 * sd) : 0;
  const sx = shake * Math.sin(sd * 71);
  const sy = shake * Math.cos(sd * 53);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(g.CX + sx, g.CY + fy + sy);
  ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.drawImage(sc.logo.canvas, -sc.logo.half, -sc.logo.half);

  const sp = prog(t, T_SHINE, T_SHINE + 0.6);
  if (sp > 0 && sp < 1) {
    // Shine masked to the logo (stinger.html sweeps across a 1.4 L box offset by 0.2 L).
    const S = L * 1.4;
    const o = (S - L) / 2;
    const sctx = ctx2d(sc.shine);
    sctx.globalCompositeOperation = "source-over";
    sctx.clearRect(0, 0, sc.shine.width, sc.shine.height);
    sctx.drawImage(sc.logoImg, 0, 0, L, L);
    sctx.globalCompositeOperation = "source-in";
    const pos = -S * 0.6 + easeInOut(sp) * S * 1.9 - o;
    const sg = sctx.createLinearGradient(pos, -o, pos + S * 0.35, S * 0.35 - o);
    sg.addColorStop(0, "rgba(255,255,255,0)");
    sg.addColorStop(0.5, "rgba(255,255,255,0.65)");
    sg.addColorStop(1, "rgba(255,255,255,0)");
    sctx.fillStyle = sg;
    sctx.fillRect(0, 0, L, L);
    ctx.drawImage(sc.shine, -L / 2, -L / 2, L, L);
  }
  ctx.restore();

  for (const tw of sc.parts.twinkles) {
    const p = prog(t, tw.t0, tw.t0 + 0.5);
    if (p <= 0 || p >= 1) continue;
    const a = Math.sin(p * Math.PI);
    drawSprite(ctx, sc.twinkle, g.CX + tw.x * s + sx, g.CY + tw.y * s + fy + sy, tw.r * a, a * (1 - ex));
  }
  ctx.globalAlpha = 1;
};

const drawTagline = (ctx: Ctx, sc: Scene, t: number, reduced: boolean) => {
  const alpha = taglineAlpha(t);
  if (alpha <= 0) return;
  const { g, W } = sc;
  const size = g.tagSize;
  const p = reduced ? 1 : easeOut(prog(t, T_TAG, T_TAG + 0.55));
  const ex = reduced ? 0 : easeIn(exitProgress(t));
  const y = g.tagY + (1 - p) * size * 0.8 - ex * size * 0.4;

  ctx.save();
  ctx.globalAlpha = alpha;
  const sh = sc.tagShadow;
  ctx.drawImage(sh.canvas, sh.x0, y - sh.y0);
  ctx.font = sc.font;
  ctx.textBaseline = "middle";
  const track = size * (0.06 + (1 - p) * 0.25);
  setTracking(ctx, track);
  const gap = size * 0.32;
  const wa = ctx.measureText(TAG_A).width;
  const wb = ctx.measureText(TAG_B).width;
  const x0 = W / 2 - (wa + gap + wb) / 2 + track / 2;
  ctx.textAlign = "left";
  ctx.fillStyle = "#f8fafc";
  ctx.fillText(TAG_A, x0, y);
  ctx.fillStyle = SCREEN_COLORS.amber300;
  ctx.fillText(TAG_B, x0 + wa + gap, y);
  ctx.restore();
};

export const renderStingerFrame = (ctx: Ctx, sc: Scene, t: number, reduced: boolean) => {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, sc.W, sc.H);
  drawBackground(ctx, sc, t, reduced);
  ctx.globalAlpha = 1;
  if (!reduced) {
    drawShockwave(ctx, sc, t);
    drawParticles(ctx, sc, t, false);
  }
  drawLogo(ctx, sc, t, reduced);
  if (!reduced) drawParticles(ctx, sc, t, true);
  ctx.globalAlpha = 1;
  drawTagline(ctx, sc, t, reduced);
};

const canvasSize = (): { W: number; H: number; cssW: number; cssH: number } => {
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;
  let k = Math.min(window.devicePixelRatio || 1, 2);
  const longSide = Math.max(cssW, cssH) * k;
  if (longSide > MAX_CANVAS_LONG_SIDE) k *= MAX_CANVAS_LONG_SIDE / longSide;
  return { W: Math.max(1, Math.round(cssW * k)), H: Math.max(1, Math.round(cssH * k)), cssW, cssH };
};

const loadLogo = (src: string, timeoutMs: number): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    const timer = window.setTimeout(() => resolve(null), timeoutMs);
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
    const decoded = typeof img.decode === "function" ? img.decode() : new Promise<void>((ok) => (img.onload = () => ok()));
    decoded.then(
      () => {
        window.clearTimeout(timer);
        resolve(img.naturalWidth > 0 ? img : null);
      },
      () => {
        window.clearTimeout(timer);
        resolve(null);
      },
    );
  });

export function TvIntroStinger({ onDone }: { onDone: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    let finished = false;
    let raf = 0;
    let skipTimer = 0;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.cancelAnimationFrame(raf);
      onDoneRef.current();
    };
    // Fail open: never hold the screen longer than this, whatever happens below.
    const hardStop = window.setTimeout(finish, STINGER_HARD_STOP_MS);

    // Skip: fade the server-rendered navy cover away, then unmount.
    const skip = () => {
      const root = rootRef.current;
      if (root) {
        root.style.transition = "opacity 300ms ease-out";
        root.style.opacity = "0";
      }
      skipTimer = window.setTimeout(finish, 320);
    };

    const reduced =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let scene: Scene | null = null;
    let logoImg: HTMLImageElement | null = null;
    let start = 0;
    const audio = makeAudio(STINGER_SOUND_SRC);
    const shine = makeAudio(STINGER_SHINE_SRC);
    let shinePlayed = false;

    const fit = () => {
      const canvas = canvasRef.current;
      if (!canvas || !logoImg) return;
      const { W, H, cssW, cssH } = canvasSize();
      canvas.width = W;
      canvas.height = H;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      scene = buildScene(W, H, logoImg);
    };

    const tick = (now: number) => {
      if (finished) return;
      try {
        const canvas = canvasRef.current;
        if (!canvas || !scene) throw new Error("stinger canvas missing");
        if (!start) {
          start = now;
          // The canvas now paints the navy stage itself, so it can fade to reveal the screen.
          if (rootRef.current) rootRef.current.style.background = "transparent";
          playStingerSound(audio);
        }
        const t = (now - start) / 1000;
        if (!shinePlayed && t >= T_TAG) {
          shinePlayed = true;
          playStingerSound(shine);
        }
        if (t >= T_REVEAL_END) {
          finish();
          return;
        }
        renderStingerFrame(ctx2d(canvas), scene, t, reduced);
        raf = window.requestAnimationFrame(tick);
      } catch {
        finish();
      }
    };

    void (async () => {
      const began = performance.now();
      // Tagline font loads alongside the logo; it's waited on only within the logo's window.
      const fonts = loadCanvasFonts([TAG_FONT(48)]);
      const img = await loadLogo(STINGER_LOGO_SRC, STINGER_LOGO_TIMEOUT_MS);
      if (finished) return;
      if (!img) {
        skip();
        return;
      }
      const left = Math.max(0, STINGER_LOGO_TIMEOUT_MS - (performance.now() - began));
      await Promise.race([fonts, new Promise<void>((resolve) => window.setTimeout(resolve, left))]);
      if (finished) return;
      logoImg = img;
      try {
        fit();
      } catch {
        skip();
        return;
      }
      raf = window.requestAnimationFrame(tick);
    })();

    const onResize = () => {
      try {
        fit();
      } catch {
        finish();
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      finished = true;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(hardStop);
      window.clearTimeout(skipTimer);
      window.removeEventListener("resize", onResize);
      for (const clip of [audio, shine]) {
        try {
          clip?.pause();
        } catch {
          // Nothing to stop.
        }
      }
    };
  }, []);

  // Server-rendered navy cover so the live screen never flashes before the stinger starts.
  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      data-testid="tv-intro-stinger"
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 80, background: SCREEN_COLORS.canvas }}
    >
      <canvas ref={canvasRef} className="absolute left-0 top-0 block" />
    </div>
  );
}

