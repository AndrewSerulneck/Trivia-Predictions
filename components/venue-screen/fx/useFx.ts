"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { FxContext } from "@/components/venue-screen/fx/FxCanvas";
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
  tier: () => FxTier;
};

const isElement = (value: unknown): value is Element =>
  typeof Element !== "undefined" && value instanceof Element;

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
