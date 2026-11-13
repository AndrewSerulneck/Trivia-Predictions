// The venue display's effect engine (docs/venue-display-hype-and-intro-stinger-plan.md §4 Phase 0).
// One canvas, one requestAnimationFrame loop for every canvas effect on the screen. FxProvider owns one engine
// per page load; panels reach it through useFx().
//
// Cost rules it enforces (plan §3): the loop runs only while something is drawing and stops when the tab is
// hidden; the canvas shrinks to 1×1 when idle (no full-screen layer, no backing memory); ambient-only frames
// draw at ~30 fps; glows are baked into sprites once (fxSprites.ts), never blurred per frame; a frame-time watchdog steps the tier
// down full → lite → off, one tier per slow spell, and retries one tier up later with backoff (Phase 6: a single slow
// spell used to switch effects off for the rest of the night). Fail open: an emitter that throws is dropped, never the screen.

import { getFxSprite } from "@/components/venue-screen/fx/fxSprites";
import { isEmitterAlive, type FxDrawOp, type FxEmitter } from "@/components/venue-screen/fx/fxEmitters";
import { createFxGate, type FxGateDecision } from "@/components/venue-screen/fx/fxGate";
import {
  createFrameWatchdog,
  fxBackingScale,
  fxDensity,
  fxTierRetryDelayMs,
  FX_TIER_HOLD_MS,
  initialFxTier,
  lowerFxTier,
  raiseFxTier,
  type FxTier,
} from "@/components/venue-screen/fx/fxQuality";

/** `off`: quality tier is off (reduced motion / slow device); the key is still claimed. */
export type FxFireResult = FxGateDecision | "off" | "error";

/** Ambient-only frames (twinkle fields) draw at most this often. */
export const FX_AMBIENT_FRAME_MS = 33;

export type FxEngine = {
  /** Fire a one-off effect under an identity key (see fxGate.ts). `build` gets the tier's particle density. */
  fire: (key: string, build: (density: number) => FxEmitter) => FxFireResult;
  /** Start an ambient effect (not keyed); returns its stop function. Draws nothing while the tier is off; restarts when it's back. */
  startAmbient: (build: (density: number) => FxEmitter) => () => void;
  /** Claim a moment's identity key without drawing canvas particles (CSS moments); same gate as `fire`. */
  claim: (key: string) => FxGateDecision;
  /** Remember `value` under `scope` for the page's life; returns the value it replaced (undefined the first time). */
  remember: (scope: string, value: string) => string | undefined;
  tier: () => FxTier;
  /** Listen for tier changes (e.g. the watchdog dropping to `off`); returns the unsubscribe function. */
  subscribeTier: (listener: () => void) => () => void;
  /** From now on new keys play (FxProvider calls this a beat after the intro stinger). */
  arm: () => void;
  /** Bind to the canvas element; returns the detach function. Browser only. */
  attach: (canvas: HTMLCanvasElement) => () => void;
  /** Live emitter count (tests, debugging). */
  liveCount: () => number;
};

type Live = { emitter: FxEmitter; start: number; ambient: boolean };

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());
type Ambient = { build: (density: number) => FxEmitter; item: Live | null };

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
  const memory = new Map<string, string>();
  const watchdog = createFrameWatchdog();
  let tier: FxTier = "full";
  /** The best tier this device / motion preference allows; watchdog retries never go above it. */
  let ceiling: FxTier = "full";
  let drops = 0;
  let holdUntil = 0;
  let retryTimer = 0;
  const ambients = new Set<Ambient>();
  const tierListeners = new Set<() => void>();
  const notifyTier = () => {
    for (const listener of tierListeners) listener();
  };
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

  const clearRetry = () => {
    if (retryTimer) window.clearTimeout(retryTimer);
    retryTimer = 0;
  };

  const setTier = (next: FxTier) => {
    if (next === tier) return;
    const wasOff = tier === "off";
    tier = next;
    notifyTier();
    if (tier === "off") {
      live = [];
      for (const ambient of ambients) ambient.item = null;
      stopLoop();
      hide();
      return;
    }
    if (shown) fit();
    if (wasOff) for (const ambient of ambients) startAmbientItem(ambient);
  };

  // Climb back one tier at a time after a watchdog drop; a device that is really too slow drops again (one tier per
  // slow spell) and the next retry waits twice as long, capped at FX_TIER_RETRY_MAX_MS.
  const scheduleRetry = () => {
    clearRetry();
    if (tier === ceiling) return;
    retryTimer = window.setTimeout(() => {
      retryTimer = 0;
      setTier(raiseFxTier(tier, ceiling));
      scheduleRetry();
    }, fxTierRetryDelayMs(drops));
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
    if (frameMs && now >= holdUntil && watchdog.sample(frameMs, now)) {
      const lower = lowerFxTier(tier);
      drops += 1;
      holdUntil = now + FX_TIER_HOLD_MS;
      watchdog.reset();
      setTier(lower);
      scheduleRetry();
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

  const startAmbientItem = (ambient: Ambient) => {
    if (tier === "off") return;
    try {
      ambient.item = { emitter: ambient.build(fxDensity(tier)), start: now(), ambient: true };
    } catch {
      ambient.item = null;
      return;
    }
    add(ambient.item);
  };

  // Rebuild every ambient effect at the current tier and viewport: on attach (ambients started by child components'
  // effects, which run before attach, were built before the real tier was known) and on resize (fields are laid out
  // for the viewport they started in).
  const restartAmbients = () => {
    live = live.filter((item) => !item.ambient);
    for (const ambient of ambients) {
      ambient.item = null;
      startAmbientItem(ambient);
    }
  };

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
      const ambient: Ambient = { build, item: null };
      ambients.add(ambient);
      startAmbientItem(ambient);
      return () => {
        ambients.delete(ambient);
        const { item } = ambient;
        if (item) live = live.filter((entry) => entry !== item);
        ambient.item = null;
      };
    },
    claim: (key) => gate.decide(key),
    remember: (scope, value) => {
      const previous = memory.get(scope);
      memory.set(scope, value);
      return previous;
    },
    tier: () => tier,
    subscribeTier: (listener) => {
      tierListeners.add(listener);
      return () => {
        tierListeners.delete(listener);
      };
    },
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
      ceiling = ctx ? pickTier() : "off";
      if (tier !== ceiling) {
        tier = ceiling;
        notifyTier();
      }

      const onMotion = () => {
        ceiling = ctx ? pickTier() : "off";
        drops = 0;
        clearRetry();
        setTier(ceiling);
      };
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
        restartAmbients();
      };
      visible = !document.hidden;
      motionQuery?.addEventListener?.("change", onMotion);
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("resize", onResize);
      restartAmbients();
      ensureLoop();

      return () => {
        stopLoop();
        clearRetry();
        motionQuery?.removeEventListener?.("change", onMotion);
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("resize", onResize);
        live = [];
        for (const ambient of ambients) ambient.item = null;
        canvas = null;
        ctx = null;
        shown = false;
      };
    },
  };
};
