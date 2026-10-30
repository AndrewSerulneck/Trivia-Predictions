// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, useEffect, useState, type ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";
import type { DieStage } from "@/lib/categoryBlitzLetterDie";

// docs/category-blitz-letter-die-plan.md Phase 3: the die runs a whole roll from the
// session's countdown + letter, buzzes only through triggerAnimation, and the
// haptic-only animation types never reach the overlay queue.

const playHapticMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/nativeHaptics", async () => {
  const actual = await vi.importActual<typeof import("@/lib/nativeHaptics")>("@/lib/nativeHaptics");
  return { ...actual, playHaptic: playHapticMock };
});

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return { ...actual, useReducedMotion: () => {
      reduceMotionFlag.reads += 1;
      return reduceMotionFlag.value;
    },
  };
});
const reduceMotionFlag = vi.hoisted(() => ({ value: false, reads: 0 }));

import LetterDieRoll, { type LetterDieRollProps } from "@/components/category-blitz/LetterDieRoll";
import {
  AnimationTriggerProvider,
  useAnimationOverlayState,
  useAnimationTrigger,
} from "@/components/animations/AnimationTriggerProvider";
import { hapticForAnimation, isHapticOnlyAnimation } from "@/lib/nativeHaptics";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const T0 = 1_700_000_000_000;
beforeEach(() => {
  reduceMotionFlag.value = false;
  playHapticMock.mockReset();
  vi.useFakeTimers({ now: T0, toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  window.matchMedia = ((query: string) => ({
    matches: query.includes("reduce") ? reduceMotionFlag.value : false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const wrap = (children: ReactNode) => createElement(AnimationTriggerProvider, null, children);
const die = (props: LetterDieRollProps) => wrap(createElement(LetterDieRoll, props));
const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};
const overlay = () => document.querySelector("[data-category-blitz-letter-die]");
const kinds = () => playHapticMock.mock.calls.map((c) => c[0]);

describe("LetterDieRoll", () => {
  it("rolls: idle → tumbling (light buzz per bounce) → lands on the letter (one strong buzz) → done", async () => {
    const stages: DieStage[] = [];
    const onDone = vi.fn();
    const base = { roundStartedAtMs: null, onStageChange: (s: DieStage) => stages.push(s), onDone };
    const view = render(die({ ...base, letter: null, nextRoundStartsIn: 9 }));
    await advance(50);
    expect(overlay()).toBeNull();

    view.rerender(die({ ...base, letter: null, nextRoundStartsIn: 4 }));
    await advance(50);
    expect(overlay()).not.toBeNull();
    expect(document.body.textContent).toContain("Rolling the letter");

    await advance(1600); // bounces at 520, 1040, 1560 ms
    expect(kinds()).toEqual(["tap", "tap", "tap"]);

    const arrivedAt = Date.now();
    view.rerender(die({ ...base, letter: "m", nextRoundStartsIn: 0, roundStartedAtMs: arrivedAt }));
    await advance(4000);
    expect(kinds().filter((k) => k === "thud")).toHaveLength(1);
    expect(kinds().filter((k) => k !== "tap" && k !== "thud")).toEqual([]);
    expect(stages).toEqual(["tumbling", "landing", "holding", "flying", "done"]);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith({ flew: true });
    expect(overlay()).toBeNull();
  });

  it("shows the real letter on the held tile", async () => {
    const view = render(die({ letter: null, nextRoundStartsIn: 3, roundStartedAtMs: null }));
    await advance(700);
    view.rerender(die({ letter: "s", nextRoundStartsIn: 0, roundStartedAtMs: Date.now() }));
    await advance(520 + 1100 + 300); // wait for the impact, land + settle, into the hold
    expect(document.body.textContent).toContain("Round letter: S");
    const glyphs = [...document.querySelectorAll("[data-category-blitz-letter-die] span")].map((s) => s.textContent);
    expect(glyphs.filter((g) => g === "S").length).toBeGreaterThanOrEqual(1);
  });

  it("opened mid-round: no die, done at once without flying", async () => {
    const onDone = vi.fn();
    render(die({ letter: "A", nextRoundStartsIn: null, roundStartedAtMs: T0 - 10_000, onDone }));
    await advance(100);
    expect(overlay()).toBeNull();
    expect(onDone).toHaveBeenCalledWith({ flew: false });
    expect(playHapticMock).not.toHaveBeenCalled();
  });

  it("tab hidden during the roll skips straight to done", async () => {
    const onDone = vi.fn();
    render(die({ letter: null, nextRoundStartsIn: 4, roundStartedAtMs: null, onDone }));
    await advance(100);
    expect(overlay()).not.toBeNull();
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(50);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    expect(overlay()).toBeNull();
    expect(onDone).toHaveBeenCalledWith({ flew: false });
  });

  it("Reduce Motion: a still ? tile, then the letter, no cube", async () => {
    reduceMotionFlag.value = true;
    const view = render(die({ letter: null, nextRoundStartsIn: 4, roundStartedAtMs: null }));
    await advance(100);
    expect(overlay()?.textContent).toContain("?");
    expect(document.querySelectorAll("[data-category-blitz-letter-die] .bg-black")).toHaveLength(0);
    view.rerender(die({ letter: "t", nextRoundStartsIn: 0, roundStartedAtMs: Date.now() }));
    await advance(100);
    expect(overlay()?.textContent).toContain("T");
    await advance(2000);
    expect(overlay()).toBeNull();
  });
});

describe("Phase 11.3", () => {
  const glyphs = () =>
    [...document.querySelectorAll("[data-category-blitz-letter-die] span.font-black")]
      .filter((s) => s.className.includes("text-[104px]"))
      .map((s) => s.textContent ?? "");

  it("a: no letter on the die changes at landing, and no two faces show the same letter", async () => {
    // Exactly six usable letters: every face already shows one, so the real letter is always
    // visible somewhere (front or not) when it arrives, and there are no spare fillers.
    const usableLetters = ["A", "B", "C", "D", "E", "F"];
    const view = render(die({ letter: null, nextRoundStartsIn: 4, roundStartedAtMs: null, usableLetters }));
    await advance(50); // the stage change renders when this act ends, which starts the frame loop
    await advance(650);
    const before = glyphs();
    expect([...before].sort()).toEqual(usableLetters);
    view.rerender(die({ letter: "c", nextRoundStartsIn: 0, roundStartedAtMs: Date.now(), usableLetters }));
    for (let i = 0; i < 40; i += 1) {
      await advance(50); // through the hop, landing, settle and into the hold
      expect(glyphs()).toEqual(before);
    }
    expect(document.body.textContent).toContain("Round letter: C");
    expect(glyphs().filter((g) => g === "C")).toHaveLength(1);
  });

  it("b: Reduce Motion holds for DIE_HOLD_MS and never buzzes", async () => {
    reduceMotionFlag.value = true;
    const view = render(die({ letter: null, nextRoundStartsIn: 4, roundStartedAtMs: null }));
    await advance(100);
    view.rerender(die({ letter: "t", nextRoundStartsIn: 0, roundStartedAtMs: Date.now() }));
    await advance(3000);
    expect(playHapticMock).not.toHaveBeenCalled();
  });

  it("d: a parent re-render with unchanged props does not re-render the die", async () => {
    const control = { tick: () => undefined as void };
    const Parent = () => {
      const [, setN] = useState(0);
      useEffect(() => {
        control.tick = () => setN((v) => v + 1);
      }, []);
      return createElement(LetterDieRoll, { letter: null, nextRoundStartsIn: 4, roundStartedAtMs: null });
    };
    render(wrap(createElement(Parent)));
    await advance(300);
    const settled = reduceMotionFlag.reads; // the die reads it once per render
    for (let i = 0; i < 5; i += 1) {
      await act(async () => control.tick());
    }
    expect(reduceMotionFlag.reads).toBe(settled);
  });
});

describe("haptic-only animation types", () => {
  it("map to a light and a strong buzz", () => {
    expect(hapticForAnimation("CATEGORY_BLITZ_DIE_BOUNCE")).toBe("tap");
    expect(hapticForAnimation("CATEGORY_BLITZ_DIE_LAND")).toBe("thud");
    expect(isHapticOnlyAnimation("CATEGORY_BLITZ_DIE_LAND")).toBe(true);
    expect(isHapticOnlyAnimation("CATEGORY_BLITZ_MODE_FLIP")).toBe(false);
  });

  it("buzz without queueing an overlay animation", async () => {
    const seen: {
      api: ReturnType<typeof useAnimationTrigger> | null;
      active: ReturnType<typeof useAnimationOverlayState>["active"];
    } = { api: null, active: null };
    const Probe = () => {
      const api = useAnimationTrigger();
      const { active } = useAnimationOverlayState();
      useEffect(() => {
        seen.api = api;
        seen.active = active;
      });
      return null;
    };
    render(wrap(createElement(Probe)));
    await act(async () => {
      seen.api?.triggerAnimation("CATEGORY_BLITZ_DIE_BOUNCE");
      seen.api?.triggerAnimation("CATEGORY_BLITZ_DIE_LAND");
    });
    expect(kinds()).toEqual(["tap", "thud"]);
    expect(seen.active).toBeNull();
  });
});

// Phase 10: the static face/core placement classes can't drift from the motion lib.
describe("10.1 placement classes", () => {
  type M = number[][];
  const rot = (axis: "X" | "Y", deg: number): M => {
    const c = Math.cos((deg * Math.PI) / 180);
    const s = Math.sin((deg * Math.PI) / 180);
    // CSS rotateX / rotateY as 3×3 row-major matrices.
    return axis === "X" ? [[1, 0, 0], [0, c, -s], [0, s, c]] : [[c, 0, s], [0, 1, 0], [-s, 0, c]];
  };
  const fromCss = (cssMatrix3d: string): M => {
    const v = cssMatrix3d.replace("matrix3d(", "").replace(")", "").split(",").map(Number);
    // column-major 4×4 → 3×3 row-major
    return [[v[0], v[4], v[8]], [v[1], v[5], v[9]], [v[2], v[6], v[10]]];
  };
  const parse = (cls: string) => {
    const m = /rotate([XY])\((-?\d+)deg\)_translateZ\(([\d.]+)px\)/.exec(cls);
    if (!m) throw new Error(`bad class ${cls}`);
    return { axis: m[1] as "X" | "Y", deg: Number(m[2]), z: Number(m[3]) };
  };

  it("each class rotates exactly like cssRotation(FACE_ORIENTATIONS[i]) and pushes out half the edge", async () => {
    const { FACE_PLACEMENT_CLASSES, CORE_PLACEMENT_CLASSES } = await import("@/components/category-blitz/LetterDieRoll");
    const { FACE_ORIENTATIONS, cssRotation, DIE_SIZE_PX } = await import("@/lib/categoryBlitzDieMotion");
    expect(FACE_PLACEMENT_CLASSES).toHaveLength(FACE_ORIENTATIONS.length);
    expect(CORE_PLACEMENT_CLASSES).toHaveLength(FACE_ORIENTATIONS.length);
    FACE_ORIENTATIONS.forEach((q, i) => {
      const want = fromCss(cssRotation(q));
      for (const [cls, z] of [[FACE_PLACEMENT_CLASSES[i], DIE_SIZE_PX / 2], [CORE_PLACEMENT_CLASSES[i], 78.5]] as const) {
        const got = parse(cls);
        expect(got.z).toBe(z);
        const have = rot(got.axis, got.deg);
        have.forEach((row, r) => row.forEach((x, c) => expect(x).toBeCloseTo(want[r][c], 6)));
      }
    });
  });
});

describe("10.3 filler swaps", () => {
  const faceLetters = () =>
    [...document.querySelectorAll("[data-category-blitz-letter-die] span.text-\\[104px\\]")].map((s) => s.textContent ?? "");

  it("after many swaps no two faces show the same letter, and none shows the incoming letter", async () => {
    const view = render(die({ letter: null, nextRoundStartsIn: 4, roundStartedAtMs: null }));
    await advance(100); // mount, then the first frame fills the faces
    for (let i = 0; i < 12; i += 1) {
      await advance(250);
      const letters = faceLetters();
      expect(letters).toHaveLength(6);
      expect(new Set(letters).size).toBe(6);
    }
    // The letter is known but the tumble has not reached the landing yet: swaps avoid it.
    view.rerender(die({ letter: "q", nextRoundStartsIn: 3, roundStartedAtMs: null }));
    for (let i = 0; i < 4; i += 1) {
      await advance(60);
      const letters = faceLetters();
      expect(new Set(letters).size).toBe(6);
      if (document.querySelector("[data-category-blitz-letter-die]")) expect(letters.filter((l) => l === "Q").length).toBeLessThanOrEqual(1);
    }
  });
});
