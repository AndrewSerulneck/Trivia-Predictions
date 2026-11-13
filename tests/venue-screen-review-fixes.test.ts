import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bracketRowKeys } from "@/components/venue-screen/BracketTvScreen";
import { createTwinkleField } from "@/components/venue-screen/fx/fxEmitters";
import { createFxEngine } from "@/components/venue-screen/fx/fxEngine";
import {
  STINGER_COVER_FAILSAFE_MS,
  STINGER_HARD_STOP_MS,
  STINGER_LOGO_TIMEOUT_MS,
  T_REVEAL_END,
} from "@/components/venue-screen/stingerTimeline";

// Fixes from the PR #12 code review (docs/venue-display-hype-and-intro-stinger-plan_PHASE_6_HANDOFF.md).

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

type Listener = () => void;

/** Minimal browser globals for attaching the engine in node. */
const stubBrowser = ({ reducedMotion }: { reducedMotion: boolean }) => {
  const windowListeners = new Map<string, Listener>();
  let motionListener: Listener | null = null;
  const motion = {
    matches: reducedMotion,
    addEventListener: (_: string, fn: Listener) => {
      motionListener = fn;
    },
    removeEventListener: () => undefined,
  };
  vi.stubGlobal("window", {
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    matchMedia: () => motion,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => undefined,
    setTimeout: () => 1,
    clearTimeout: () => undefined,
    addEventListener: (type: string, fn: Listener) => windowListeners.set(type, fn),
    removeEventListener: () => undefined,
  });
  vi.stubGlobal("document", { hidden: false, addEventListener: () => undefined, removeEventListener: () => undefined });
  vi.stubGlobal("navigator", { hardwareConcurrency: 8 });
  const canvas = { width: 1, height: 1, style: {}, getContext: () => ({}) } as unknown as HTMLCanvasElement;
  return {
    canvas,
    setMotion: (reduce: boolean) => {
      motion.matches = reduce;
      motionListener?.();
    },
    resize: (w: number, h: number) => {
      (window as unknown as { innerWidth: number }).innerWidth = w;
      (window as unknown as { innerHeight: number }).innerHeight = h;
      windowListeners.get("resize")?.();
    },
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ambient effects started before attach (StageTwinkles with intro=0)", () => {
  it("are rebuilt at the attached tier and never duplicated when the tier comes back", () => {
    const browser = stubBrowser({ reducedMotion: true });
    const engine = createFxEngine();
    const densities: number[] = [];
    const stop = engine.startAmbient((density) => {
      densities.push(density);
      return createTwinkleField({ area: { x: 0, y: 0, w: 100, h: 100 }, seed: 1, density });
    });
    expect(engine.liveCount()).toBe(1);

    engine.attach(browser.canvas);
    expect(engine.tier()).toBe("off");
    expect(engine.liveCount()).toBe(0);

    browser.setMotion(false);
    expect(engine.tier()).toBe("full");
    expect(engine.liveCount()).toBe(1);

    stop();
    expect(engine.liveCount()).toBe(0);
  });

  it("resize re-lays the field out once, not on top of the old one", () => {
    const browser = stubBrowser({ reducedMotion: false });
    const engine = createFxEngine();
    let builds = 0;
    engine.startAmbient((density) => {
      builds += 1;
      return createTwinkleField({ area: { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }, seed: 1, density });
    });
    engine.attach(browser.canvas);
    const afterAttach = builds;
    browser.resize(3840, 2160);
    expect(builds).toBe(afterAttach + 1);
    expect(engine.liveCount()).toBe(1);
  });
});

describe("intro stinger fail-safes", () => {
  it("the hard stop is re-armed from the first animation frame, so a slow logo can't cut the exit", () => {
    const stinger = read("components/venue-screen/TvIntroStinger.tsx");
    expect(stinger).toMatch(/let hardStop = window\.setTimeout\(finish, STINGER_LOGO_TIMEOUT_MS \+ STINGER_HARD_STOP_MS\)/);
    expect(stinger).toMatch(/start = now;\s*window\.clearTimeout\(hardStop\);\s*hardStop = window\.setTimeout\(finish, STINGER_HARD_STOP_MS\)/);
    expect(T_REVEAL_END * 1000).toBeLessThan(STINGER_HARD_STOP_MS);
  });

  it("the navy cover fades itself by CSS when scripts never run, after the latest possible hard stop", () => {
    expect(STINGER_COVER_FAILSAFE_MS).toBeGreaterThan(STINGER_LOGO_TIMEOUT_MS + STINGER_HARD_STOP_MS);
    expect(read("components/venue-screen/TvIntroStinger.tsx")).toContain("animate-stinger-cover-failsafe");
    const config = read("tailwind.config.ts");
    expect(config).toContain(`"stinger-cover-failsafe": "stinger-cover-failsafe 0.4s ease-out ${STINGER_COVER_FAILSAFE_MS / 1000}s forwards"`);
  });
});

describe("moments right after the stinger", () => {
  it("the fx gate arms as the stinger ends (once the mount settle has passed), not a second later", () => {
    const provider = read("components/venue-screen/fx/FxCanvas.tsx");
    expect(provider).toMatch(/const wait = FX_ARM_SETTLE_MS - \(performance\.now\(\) - mountedAt\);/);
    expect(provider).toMatch(/if \(wait <= 0\) \{\s*engine\.arm\(\);/);
  });

  it("a new leader isn't used up when the round break ends before the pop", () => {
    const roundBreak = read("components/venue-screen/TvRoundBreak.tsx");
    expect(roundBreak).toMatch(/if \(!popped\) fx\.remember\(`leader:\$\{gameId\}`, previous\);/);
  });
});

describe("layout and keys", () => {
  it("bracket rows get unique keys even when several players have no username", () => {
    const keys = bracketRowKeys(["Ann", "Player", "Bo", "Player", "Player"]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[0]).toBe("Ann");
    expect(keys[1]).toBe("Player");
  });

  it("the venue title's glow padding is fully cancelled by negative margins (no -my-* with mt-*)", () => {
    const client = read("components/venue-screen/VenueScreenClient.tsx");
    expect(client).toContain("-mx-12 -mb-6 -mt-4 truncate px-12 py-6");
    expect(client).not.toMatch(/-my-\d+ mt-\d/);
  });
});
