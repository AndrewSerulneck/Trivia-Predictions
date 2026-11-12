// The venue display's effect engine (docs/venue-display-hype-and-intro-stinger-plan.md §4 Phase 0).
// One canvas, one requestAnimationFrame loop for every canvas effect on the screen. FxProvider owns one engine
// per page load; panels reach it through useFx().
//
// Cost rules it enforces (plan §3): the loop runs only while something is drawing and stops when the tab is
// hidden; the canvas shrinks to 1×1 when idle (no full-screen layer, no backing memory); ambient-only frames
// draw at ~30 fps; glows are baked into sprites once (fxSprites.ts), never blurred per frame; a frame-time watchdog steps the tier
// down full → lite → off. Fail open: an emitter that throws is dropped, never the screen.

import { getFxSprite } from "@/components/venue-screen/fx/fxSprites";
import { isEmitterAlive, type FxDrawOp, type FxEmitter } from "@/components/venue-screen/fx/fxEmitters";
import { createFxGate, type FxGateDecision } from "@/components/venue-screen/fx/fxGate";
import {
  createFrameWatchdog,
  fxBackingScale,
  fxDensity,
  initialFxTier,
  lowerFxTier,
  type FxTier,
} from "@/components/venue-screen/fx/fxQuality";

/** `off`: quality tier is off (reduced motion / slow device); the key is still claimed. */
export type FxFireResult = FxGateDecision | "off" | "error";

/** Ambient-only frames (twinkle fields) draw at most this often. */
export const FX_AMBIENT_FRAME_MS = 33;

export type FxEngine = {
  /** Fire a one-off effect under an identity key (see fxGate.ts). `build` gets the tier's particle density. */
  fire: (key: string, build: (density: number) => FxEmitter) => FxFireResult;
  /** Start an ambient effect (not keyed); returns its stop function. No-op when the tier is off. */
  startAmbient: (build: (density: number) => FxEmitter) => () => void;
  tier: () => FxTier;
  /** From now on new keys play (FxProvider calls this a beat after the intro stinger). */
  arm: () => void;
  /** Bind to the canvas element; returns the detach function. Browser only. */
  attach: (canvas: HTMLCanvasElement) => () => void;
  /** Live emitter count (tests, debugging). */
  liveCount: () => number;
};

type Live = { emitter: FxEmitter; start: number; ambient: boolean };

const drawOps = (ctx: CanvasRenderingContext2D, ops: FxDrawOp[]) => {
  for (const op of ops) {
    if (!(op.alpha > 0)) continue;
    if (op.kind === "ring") {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.min(1, op.alpha);
      ctx.beginPath();
      ctx.arc(op.x, op.y, op.radius, 0, Math.PI * 2);
      ctx.strokeStyle = op.glowColor;
      ctx.lineWidth = op.glow;
      ctx.stroke();
      ctx.strokeStyle = op.coreColor;
      ctx.lineWidth = op.core;
      ctx.stroke();
      ctx.restore();
      continue;
    }
    if (!(op.r > 0)) continue;
    const s = getFxSprite(op.sprite);
    const k = op.r / s.unit;
    ctx.globalAlpha = Math.min(1, op.alpha);
    if (op.rotation === 0 && op.squashX === 1) {
      ctx.drawImage(s.canvas, op.x - s.half * k, op.y - s.half * k, s.half * 2 * k, s.half * 2 * k);
    } else {
      ctx.save();
      ctx.translate(op.x, op.y);
      ctx.rotate(op.rotation);
      ctx.scale(op.squashX * k, k);
      ctx.drawImage(s.canvas, -s.half, -s.half);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
};

export const createFxEngine = (): FxEngine => {
  const gate = createFxGate();
  const watchdog = createFrameWatchdog();
  let tier: FxTier = "full";
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let scale = 1;
  let shown = false;
  let visible = true;
  let live: Live[] = [];
  let raf = 0;
  let lastFrame = 0;
  let lastDraw = 0;

  const fit = () => {
    if (!canvas) return;
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    scale = fxBackingScale(cssW, cssH, window.devicePixelRatio || 1, tier);
    canvas.width = Math.max(1, Math.round(cssW * scale));
    canvas.height = Math.max(1, Math.round(cssH * scale));
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
  };

  const show = () => {
    if (!canvas || shown) return;
    fit();
    canvas.style.visibility = "visible";
    shown = true;
  };

  // Idle: no full-screen layer to composite and no backing store held in memory.
  const hide = () => {
    if (!canvas || !shown) return;
    canvas.width = 1;
    canvas.height = 1;
    canvas.style.width = "0px";
    canvas.style.height = "0px";
    canvas.style.visibility = "hidden";
    shown = false;
  };

  const stopLoop = () => {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    lastFrame = 0;
  };

  const setTier = (next: FxTier) => {
    if (next === tier) return;
    tier = next;
    if (tier === "off") {
      live = [];
      stopLoop();
      hide();
      return;
    }
    if (shown) fit();
  };

  const draw = (now: number) => {
    if (!canvas || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const next: Live[] = [];
    for (const item of live) {
      const t = (now - item.start) / 1000;
      if (!isEmitterAlive(item.emitter, t)) continue;
      try {
        drawOps(ctx, item.emitter.frame(t));
        next.push(item);
      } catch {
        // Fail open: drop this effect only.
        ctx.globalAlpha = 1;
      }
    }
    live = next;
  };

  const loop = (now: number) => {
    raf = 0;
    if (!canvas || !ctx || !visible || tier === "off") return;
    const frameMs = lastFrame ? now - lastFrame : 0;
    lastFrame = now;
    if (frameMs && watchdog.sample(frameMs, now)) {
      const lower = lowerFxTier(tier);
      setTier(lower);
      if (lower === "off") return;
    }
    const ambientOnly = live.every((item) => item.ambient);
    if (!ambientOnly || now - lastDraw >= FX_AMBIENT_FRAME_MS - 2) {
      lastDraw = now;
      draw(now);
    }
    if (live.length) {
      raf = window.requestAnimationFrame(loop);
    } else {
      lastFrame = 0;
      hide();
    }
  };

  const ensureLoop = () => {
    if (!canvas || !ctx || !visible || raf || tier === "off" || !live.length) return;
    show();
    watchdog.reset();
    raf = window.requestAnimationFrame(loop);
  };

  const add = (item: Live) => {
    live.push(item);
    ensureLoop();
  };

  const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

  return {
    fire: (key, build) => {
      const decision = gate.decide(key);
      if (decision !== "play") return decision;
      if (tier === "off") return "off";
      try {
        add({ emitter: build(fxDensity(tier)), start: now(), ambient: false });
        return "play";
      } catch {
        return "error";
      }
    },
    startAmbient: (build) => {
      if (tier === "off") return () => undefined;
      let item: Live;
      try {
        item = { emitter: build(fxDensity(tier)), start: now(), ambient: true };
      } catch {
        return () => undefined;
      }
      add(item);
      return () => {
        live = live.filter((entry) => entry !== item);
      };
    },
    tier: () => tier,
    arm: () => gate.arm(),
    liveCount: () => live.length,
    attach: (element) => {
      canvas = element;
      try {
        ctx = element.getContext("2d");
      } catch {
        ctx = null;
      }
      const motionQuery =
        typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
      const pickTier = () =>
        initialFxTier({ hardwareConcurrency: navigator.hardwareConcurrency, reducedMotion: Boolean(motionQuery?.matches) });
      tier = ctx ? pickTier() : "off";

      const onMotion = () => setTier(ctx ? pickTier() : "off");
      const onVisibility = () => {
        visible = !document.hidden;
        if (!visible) {
          stopLoop();
          return;
        }
        // Finite effects whose time passed while hidden are dropped on the first frame back.
        ensureLoop();
      };
      const onResize = () => {
        if (shown) fit();
      };
      visible = !document.hidden;
      motionQuery?.addEventListener?.("change", onMotion);
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("resize", onResize);
      ensureLoop();

      return () => {
        stopLoop();
        motionQuery?.removeEventListener?.("change", onMotion);
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("resize", onResize);
        live = [];
        canvas = null;
        ctx = null;
        shown = false;
      };
    },
  };
};
