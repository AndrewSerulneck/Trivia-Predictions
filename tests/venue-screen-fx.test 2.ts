import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  combineEmitters,
  createBurst,
  createShockwave,
  createShower,
  createTwinkleField,
  isEmitterAlive,
  scaleCount,
  seedFromKey,
  type FxEmitter,
} from "@/components/venue-screen/fx/fxEmitters";
import { createFxEngine } from "@/components/venue-screen/fx/fxEngine";
import { createFxGate } from "@/components/venue-screen/fx/fxGate";
import { wallClockDelayS, wallClockElapsedS } from "@/components/venue-screen/fx/fxClock";
import {
  FX_FRAME_BUDGET_MS,
  FX_TIER_HOLD_MS,
  FX_WATCHDOG_WINDOW_MS,
  createFrameWatchdog,
  fxBackingScale,
  fxDensity,
  fxTierRetryDelayMs,
  initialFxTier,
  lowerFxTier,
  raiseFxTier,
} from "@/components/venue-screen/fx/fxQuality";

// Venue display effects engine — docs/venue-display-hype-and-intro-stinger-plan.md §4 Phase 0 and §8.

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const at = { x: 960, y: 540 };
const area = { x: 0, y: 0, w: 1920, h: 1080 };

const emitters = (): Array<[string, () => FxEmitter]> => [
  ["burst", () => createBurst({ at, size: 600, seed: 7 })],
  ["burst+shockwave", () => combineEmitters(createShockwave({ at, size: 600 }), createBurst({ at, size: 600, seed: 7 }))],
  ["shower", () => createShower({ area, seed: 7 })],
  ["shockwave", () => createShockwave({ at, size: 600 })],
  ["finite twinkle field", () => createTwinkleField({ area, seed: 7, duration: 12 })],
];

describe("emitters are deterministic", () => {
  it.each(emitters())("%s: same seed, same frame", (_name, make) => {
    for (const t of [0.05, 0.3, 0.9, 1.4, 2.5]) expect(make().frame(t)).toEqual(make().frame(t));
  });

  it("a different key gives a different burst", () => {
    const a = createBurst({ at, size: 600, seed: seedFromKey("game-1:3:reveal") }).frame(0.4);
    const b = createBurst({ at, size: 600, seed: seedFromKey("game-1:4:reveal") }).frame(0.4);
    expect(a).not.toEqual(b);
  });

  it("seedFromKey is stable and unsigned 32-bit", () => {
    expect(seedFromKey("roundId-1")).toBe(seedFromKey("roundId-1"));
    expect(seedFromKey("x")).toBeGreaterThanOrEqual(0);
    expect(seedFromKey("x")).toBeLessThan(2 ** 32);
  });

  it("emitter sources never read a clock or Math.random", () => {
    const code = read("components/venue-screen/fx/fxEmitters.ts").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/Math\.random|Date\.now|performance\.now|document\.|window\./);
  });
});

describe("no emitter outlives its life", () => {
  it.each(emitters())("%s: nothing drawn at or after its duration", (_name, make) => {
    const e = make();
    expect(Number.isFinite(e.duration)).toBe(true);
    expect(e.duration).toBeGreaterThan(0);
    expect(e.frame(0.25).length).toBeGreaterThan(0);
    for (const t of [e.duration, e.duration + 0.01, e.duration + 5]) {
      expect(isEmitterAlive(e, t)).toBe(false);
      expect(e.frame(t)).toEqual([]);
    }
  });

  it("burst draws nothing before it starts", () => {
    expect(createBurst({ at, size: 600, seed: 1 }).frame(0)).toEqual([]);
  });

  it("an ambient twinkle field runs until stopped", () => {
    const e = createTwinkleField({ area, seed: 1 });
    expect(e.duration).toBe(Infinity);
    expect(isEmitterAlive(e, 3 * 60 * 60)).toBe(true);
  });

  it("every drawn op is finite and in range", () => {
    for (const [, make] of emitters()) {
      const e = make();
      for (let t = 0.02; t < e.duration; t += 0.1) {
        for (const op of e.frame(t)) {
          expect(Number.isFinite(op.x) && Number.isFinite(op.y)).toBe(true);
          expect(op.alpha).toBeGreaterThan(0);
          expect(op.alpha).toBeLessThanOrEqual(1);
          if (op.kind === "sprite") expect(op.r).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("density follows the quality tier", () => {
  it("lite draws about half the particles, off draws none", () => {
    const count = (density: number) => createBurst({ at, size: 600, seed: 3, density }).frame(0.1).length;
    expect(count(0.5)).toBeLessThan(count(1));
    expect(count(0.5)).toBeGreaterThanOrEqual(Math.floor(count(1) / 2) - 1);
    expect(count(0)).toBe(0);
    expect(createBurst({ at, size: 600, seed: 3, density: 0 }).duration).toBe(0);
  });

  it("scaleCount", () => {
    expect(scaleCount(28, 1)).toBe(28);
    expect(scaleCount(28, 0.5)).toBe(14);
    expect(scaleCount(1, 0.5)).toBe(1);
    expect(scaleCount(28, 0)).toBe(0);
  });
});

describe("key dedupe (poll idempotency)", () => {
  it("swallows keys seen before arming, plays new keys after, never repeats", () => {
    const gate = createFxGate();
    expect(gate.decide("on-screen-at-load")).toBe("swallow");
    gate.arm();
    expect(gate.decide("on-screen-at-load")).toBe("duplicate");
    expect(gate.decide("lt:game:3:reveal")).toBe("play");
    for (let poll = 0; poll < 20; poll++) expect(gate.decide("lt:game:3:reveal")).toBe("duplicate");
    expect(gate.decide("lt:game:4:reveal")).toBe("play");
  });

  it("forgets the oldest keys past its cap", () => {
    const gate = createFxGate({ maxKeys: 3 });
    gate.arm();
    for (const k of ["a", "b", "c", "d"]) gate.decide(k);
    expect(gate.size()).toBe(3);
    expect(gate.decide("d")).toBe("duplicate");
    expect(gate.decide("a")).toBe("play");
  });

  it("the engine fires through the gate", () => {
    const engine = createFxEngine();
    const build = () => createShockwave({ at, size: 100 });
    expect(engine.fire("k1", build)).toBe("swallow");
    engine.arm();
    expect(engine.fire("k1", build)).toBe("duplicate");
    expect(engine.fire("k2", build)).toBe("play");
    expect(engine.fire("k2", build)).toBe("duplicate");
    expect(engine.liveCount()).toBe(1);
  });

  it("an effect whose builder throws is dropped, not thrown", () => {
    const engine = createFxEngine();
    engine.arm();
    expect(
      engine.fire("bad", () => {
        throw new Error("boom");
      }),
    ).toBe("error");
    expect(engine.liveCount()).toBe(0);
  });
});

describe("quality tiers", () => {
  it("starts full, lite on ≤ 2 cores, off with reduced motion", () => {
    expect(initialFxTier({ hardwareConcurrency: 8, reducedMotion: false })).toBe("full");
    expect(initialFxTier({ hardwareConcurrency: undefined, reducedMotion: false })).toBe("full");
    expect(initialFxTier({ hardwareConcurrency: 2, reducedMotion: false })).toBe("lite");
    expect(initialFxTier({ hardwareConcurrency: 8, reducedMotion: true })).toBe("off");
  });

  it("climbs back one tier at a time, never above the ceiling", () => {
    expect(raiseFxTier("off", "full")).toBe("lite");
    expect(raiseFxTier("lite", "full")).toBe("full");
    expect(raiseFxTier("full", "full")).toBe("full");
    expect(raiseFxTier("off", "lite")).toBe("lite");
    expect(raiseFxTier("lite", "lite")).toBe("lite");
    expect(raiseFxTier("off", "off")).toBe("off");
  });

  it("retries a watchdog drop after 1 min, doubling per drop, capped at 32 min", () => {
    expect([1, 2, 3, 6, 7, 20].map(fxTierRetryDelayMs)).toEqual([60_000, 120_000, 240_000, 1_920_000, 1_920_000, 1_920_000]);
    expect(FX_TIER_HOLD_MS).toBeGreaterThan(FX_WATCHDOG_WINDOW_MS);
  });

  it("engine: one tier per slow spell, retry scheduled, ambients restart after off (Phase 6 long run)", () => {
    const engine = read("components/venue-screen/fx/fxEngine.ts");
    expect(engine).toMatch(/now >= holdUntil && watchdog\.sample\(frameMs, now\)/);
    expect(engine).toMatch(/holdUntil = now \+ FX_TIER_HOLD_MS;/);
    expect(engine).toMatch(/setTier\(lower\);\s*scheduleRetry\(\);/);
    expect(engine).toMatch(/setTier\(raiseFxTier\(tier, ceiling\)\)/);
    expect(engine).toMatch(/if \(wasOff\) for \(const ambient of ambients\) startAmbientItem\(ambient\);/);
  });

  it("steps down full → lite → off", () => {
    expect(lowerFxTier("full")).toBe("lite");
    expect(lowerFxTier("lite")).toBe("off");
    expect(lowerFxTier("off")).toBe("off");
    expect([fxDensity("full"), fxDensity("lite"), fxDensity("off")]).toEqual([1, 0.5, 0]);
  });

  const feed = (frameMs: number, seconds: number, start = 0) => {
    const dog = createFrameWatchdog();
    let now = start;
    let drops = 0;
    while (now < start + seconds * 1000) {
      now += frameMs;
      if (dog.sample(frameMs, now)) drops += 1;
    }
    return drops;
  };

  it("watchdog holds at 60 fps and at exactly the budget", () => {
    expect(feed(16.7, 10)).toBe(0);
    expect(feed(FX_FRAME_BUDGET_MS, 10)).toBe(0);
  });

  it("watchdog drops once per slow second, not on the first slow frame", () => {
    const dog = createFrameWatchdog();
    expect(dog.sample(60, 60)).toBe(false);
    expect(feed(40, 1.0)).toBe(1);
    expect(feed(40, 3.05)).toBe(3);
  });

  it("watchdog ignores gaps from a hidden tab", () => {
    const dog = createFrameWatchdog();
    let now = 0;
    for (let i = 0; i < 100; i++) {
      now += 16;
      dog.sample(16, now);
    }
    now += 30_000;
    expect(dog.sample(30_000, now)).toBe(false);
    for (let i = 0; i < 100; i++) {
      now += 16;
      expect(dog.sample(16, now)).toBe(false);
    }
  });

  it("backing store: ≤ 2× DPR in full, 1× in lite, long side ≤ 2880", () => {
    expect(fxBackingScale(1920, 1080, 1, "full")).toBe(1);
    expect(fxBackingScale(960, 540, 3, "full")).toBe(2);
    expect(fxBackingScale(960, 540, 3, "lite")).toBe(1);
    expect(fxBackingScale(1920, 1080, 2, "full") * 1920).toBeCloseTo(2880);
    expect(fxBackingScale(3840, 2160, 1, "lite") * 3840).toBeCloseTo(2880);
  });
});

describe("wall clock", () => {
  it("phases loops from the wall clock", () => {
    expect(wallClockElapsedS(60_000, 125_000)).toBe(5);
    expect(wallClockDelayS(45_000, 6_000, 90_000)).toBe(6);
    expect(wallClockDelayS(45_000, 6_000, 96_500)).toBeCloseTo(44.5);
    expect(wallClockDelayS(45_000, 6_000, 96_000)).toBe(0);
  });
});

describe("engine contract (plan §3, §8)", () => {
  const fxDir = "components/venue-screen/fx";

  it("only the sprite builder uses shadowBlur (pre-rendered once)", () => {
    for (const file of ["fxEngine.ts", "fxEmitters.ts", "useFx.ts", "FxCanvas.tsx"]) {
      expect(read(`${fxDir}/${file}`)).not.toContain("shadowBlur");
    }
  });

  it("one rAF loop: the engine is the only fx module that requests frames", () => {
    for (const file of ["fxEmitters.ts", "useFx.ts", "FxCanvas.tsx", "fxSprites.ts", "BrandStage.tsx", "ShineSweep.tsx"]) {
      expect(read(`${fxDir}/${file}`)).not.toContain("requestAnimationFrame");
    }
    const engine = read(`${fxDir}/fxEngine.ts`);
    expect(engine).toContain("visibilitychange");
    expect(engine).toContain("cancelAnimationFrame");
  });

  it("the canvas never takes pointer events and sits below the intro stinger", () => {
    const canvas = read(`${fxDir}/FxCanvas.tsx`);
    expect(canvas).toContain("pointer-events-none");
    expect(canvas).toMatch(/FX_CANVAS_Z_INDEX = (\d+)/);
    const z = Number(/FX_CANVAS_Z_INDEX = (\d+)/.exec(canvas)?.[1]);
    expect(z).toBeLessThan(80);
  });

  it("CSS effects animate transform/opacity only", () => {
    for (const file of ["BrandStage.tsx", "ShineSweep.tsx"]) {
      const src = read(`${fxDir}/${file}`);
      expect(src).not.toMatch(/animate=\{[^}]*(filter|boxShadow|blur)/);
    }
  });
});
