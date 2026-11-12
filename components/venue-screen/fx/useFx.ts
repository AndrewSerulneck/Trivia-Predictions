"use client";

import { useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FxContext } from "@/components/venue-screen/fx/FxCanvas";
import type { FxGateDecision } from "@/components/venue-screen/fx/fxGate";
import type { FxEngine, FxFireResult } from "@/components/venue-screen/fx/fxEngine";
import {
  combineEmitters,
  createBurst,
  createShockwave,
  createShower,
  createTwinkleField,
  seedFromKey,
  type FxPoint,
  type FxRect,
} from "@/components/venue-screen/fx/fxEmitters";
import type { FxTier } from "@/components/venue-screen/fx/fxQuality";
import { STINGER_SEED } from "@/components/venue-screen/stingerTimeline";

// Panels fire canvas effects through this hook (docs/venue-display-hype-and-intro-stinger-plan.md §4 Phase 0, §8).
//
//   const fx = useFx();
//   useEffect(() => { fx.burst({ key: `${gameId}:${round}:reveal`, at: answerRef.current }); }, [fx, gameId, round]);
//
// Every one-off effect needs a stable identity `key`: the same key never fires twice in a page load, so a poll
// tick can't re-fire it, and keys present when the page loaded never play (see fxGate.ts). Fire from an effect,
// never during render. Ambient effects (`twinkles`) aren't keyed; they stop when the calling component unmounts.
// Outside an <FxProvider> every call is a no-op.

/** Where an effect is centred: a viewport point, or an element (its centre; its smaller side sets the size). */
export type FxAnchor = FxPoint | Element | null | undefined;
/** A viewport rect or an element's box; omitted = the whole viewport. */
export type FxArea = FxRect | Element | null | undefined;

export type FxBurstOptions = {
  key: string;
  at?: FxAnchor;
  /** CSS px; default from the anchor element, else 30 % of the viewport's short side. */
  size?: number;
  coins?: number;
  sparks?: number;
  sparkColors?: readonly string[];
  gravity?: boolean;
  /** Add the stinger's shockwave ring behind the burst. */
  shockwave?: boolean;
};

export type FxShowerOptions = {
  key: string;
  area?: FxArea;
  kind?: "coins" | "confetti" | "mixed";
  colors?: readonly string[];
  count?: number;
  pieceSize?: number;
  duration?: number;
};

export type FxShockwaveOptions = {
  key: string;
  at?: FxAnchor;
  size?: number;
  coreColor?: string;
  glowColor?: string;
};

export type FxTwinkleOptions = {
  area?: FxArea;
  count?: number;
  starSize?: number;
  colors?: readonly string[];
  seed?: number;
};

export type FxApi = {
  burst: (options: FxBurstOptions) => FxFireResult;
  shower: (options: FxShowerOptions) => FxFireResult;
  shockwave: (options: FxShockwaveOptions) => FxFireResult;
  /** Ambient twinkle field until the returned stop() or the component unmounts. */
  twinkles: (options?: FxTwinkleOptions) => () => void;
  /** Claim a CSS moment's identity key (see useFxMoment). Outside a provider: always "swallow". */
  moment: (key: string) => FxGateDecision;
  /** Remember a value per scope for the page's life; returns the previous one (undefined the first time). */
  remember: (scope: string, value: string) => string | undefined;
  tier: () => FxTier;
};

const isElement = (value: unknown): value is Element =>
  typeof Element !== "undefined" && value instanceof Element;

/** A point inside an element, as fractions of its box (0.16, 0.5 = just right of its left edge), for a burst beside a row's name. */
export const pointIn = (el: Element | null, fx: number, fy = 0.5): FxPoint | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width * fx, y: r.top + r.height * fy };
};

/** The 2304×1296 stage's scale in this viewport (same maths as ViewportFitCanvas), for sizing a moment to the stage. */
export const stageScale = (): number => Math.min(window.innerWidth / 2304, window.innerHeight / 1296);

const viewportRect = (): FxRect => ({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });

export const resolveFxAnchor = (at: FxAnchor, size?: number): { point: FxPoint; size: number } => {
  if (isElement(at)) {
    const r = at.getBoundingClientRect();
    return { point: { x: r.left + r.width / 2, y: r.top + r.height / 2 }, size: size ?? Math.min(r.width, r.height) };
  }
  const fallbackSize = size ?? Math.min(window.innerWidth, window.innerHeight) * 0.3;
  if (at) return { point: at, size: fallbackSize };
  return { point: { x: window.innerWidth / 2, y: window.innerHeight / 2 }, size: fallbackSize };
};

export const resolveFxArea = (area: FxArea): FxRect => {
  if (isElement(area)) {
    const r = area.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }
  return area ?? viewportRect();
};

const off = (): FxFireResult => "off";

export const NOOP_FX: FxApi = {
  burst: off,
  shower: off,
  shockwave: off,
  twinkles: () => () => undefined,
  moment: () => "swallow",
  remember: () => undefined,
  tier: () => "off",
};

const buildApi = (engine: FxEngine, ambientStops: Set<() => void>): FxApi => ({
  burst: (o) => {
    try {
      const { point, size } = resolveFxAnchor(o.at, o.size);
      return engine.fire(o.key, (density) => {
        const burst = createBurst({
          at: point, size, seed: seedFromKey(o.key), coins: o.coins, sparks: o.sparks, sparkColors: o.sparkColors,
          gravity: o.gravity, density,
        });
        return o.shockwave ? combineEmitters(createShockwave({ at: point, size }), burst) : burst;
      });
    } catch {
      return "error";
    }
  },
  shower: (o) => {
    try {
      const area = resolveFxArea(o.area);
      return engine.fire(o.key, (density) =>
        createShower({
          area, seed: seedFromKey(o.key), kind: o.kind, colors: o.colors, count: o.count, pieceSize: o.pieceSize,
          duration: o.duration, density,
        }),
      );
    } catch {
      return "error";
    }
  },
  shockwave: (o) => {
    try {
      const { point, size } = resolveFxAnchor(o.at, o.size);
      return engine.fire(o.key, () =>
        createShockwave({ at: point, size, coreColor: o.coreColor, glowColor: o.glowColor }),
      );
    } catch {
      return "error";
    }
  },
  twinkles: (o = {}) => {
    try {
      const area = resolveFxArea(o.area);
      const stopEngine = engine.startAmbient((density) =>
        createTwinkleField({
          area, seed: o.seed ?? STINGER_SEED, count: o.count, starSize: o.starSize, colors: o.colors, density,
        }),
      );
      const stop = () => {
        stopEngine();
        ambientStops.delete(stop);
      };
      ambientStops.add(stop);
      return stop;
    } catch {
      return () => undefined;
    }
  },
  moment: (key) => engine.claim(key),
  remember: (scope, value) => engine.remember(scope, value),
  tier: () => engine.tier(),
});

export const useFx = (): FxApi => {
  const engine = useContext(FxContext);
  // This component's ambient effects, stopped when it unmounts.
  const [ambientStops] = useState(() => new Set<() => void>());

  useEffect(
    () => () => {
      for (const stop of [...ambientStops]) stop();
    },
    [ambientStops],
  );

  return useMemo(() => (engine ? buildApi(engine, ambientStops) : NOOP_FX), [engine, ambientStops]);
};

/**
 * True once, and only if `key` is a moment that happens while someone is watching: the same gate as `burst`
 * (never twice per page load, never for what was already on screen at load or under the intro stinger).
 * Use it to mount a one-shot CSS moment; `null` = nothing to claim yet.
 */
export const useFxMoment = (key: string | null | undefined): boolean => {
  const fx = useFx();
  const [played, setPlayed] = useState<string | null>(null);
  useEffect(() => {
    if (!key) return undefined;
    // Claimed in a timer callback (not the effect body): a panel unmounted in the same tick never claims the key.
    const id = window.setTimeout(() => {
      if (fx.moment(key) === "play") setPlayed(key);
    }, 0);
    return () => window.clearTimeout(id);
  }, [fx, key]);
  return Boolean(key) && played === key;
};

/** While `active` (a moment this panel claimed), runs `fire` once after `delayMs`; cleared if the panel goes away first. */
export const useFxAt = (active: boolean, delayMs: number, fire: (fx: FxApi) => void): void => {
  const fx = useFx();
  const fireRef = useRef(fire);
  useEffect(() => {
    fireRef.current = fire;
  });
  useEffect(() => {
    if (!active) return undefined;
    const id = window.setTimeout(() => fireRef.current(fx), delayMs);
    return () => window.clearTimeout(id);
  }, [fx, active, delayMs]);
};

const subscribeNothing = () => () => undefined;
const fullTier = (): FxTier => "full";

/** The effects quality tier, re-rendering when it changes. "full" on the server and outside an FxProvider. */
export const useFxTier = (): FxTier => {
  const engine = useContext(FxContext);
  return useSyncExternalStore(engine ? engine.subscribeTier : subscribeNothing, engine ? engine.tier : fullTier, fullTier);
};
