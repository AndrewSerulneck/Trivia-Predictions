// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  AnimationTriggerProvider,
  useAnimationOverlayState,
  useAnimationTrigger,
} from "@/components/animations/AnimationTriggerProvider";
import { speedTriviaPointsLabel } from "@/components/animations/SpeedTriviaCorrectAnimation";

// docs/speed-trivia-feedback-animations-plan.md Phase 3: the Correct badge shows the points the
// server actually awarded (Challenge multiplier included), never a hard-coded "+2 pts".
// createElement, not JSX (the test glob is *.test.ts).

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(AnimationTriggerProvider, null, children);

const useBoth = () => ({ ...useAnimationTrigger(), ...useAnimationOverlayState() });

describe("speedTriviaPointsLabel", () => {
  it("shows no chip until the real number is known", () => {
    expect(speedTriviaPointsLabel(undefined)).toBeNull();
  });

  it("shows the real award, multiplier included", () => {
    expect(speedTriviaPointsLabel(2)).toBe("+2 pts");
    expect(speedTriviaPointsLabel(6)).toBe("+6 pts");
    expect(speedTriviaPointsLabel(1)).toBe("+1 pt");
  });

  it("shows no chip for a zero or invalid award", () => {
    expect(speedTriviaPointsLabel(0)).toBeNull();
    expect(speedTriviaPointsLabel(Number.NaN)).toBeNull();
  });
});

describe("updateAnimationPayload", () => {
  afterEach(() => cleanup());

  it("merges late data into the playing animation", () => {
    const { result } = renderHook(useBoth, { wrapper });
    let id = 0;
    act(() => {
      id = result.current.triggerAnimation("SPEED_TRIVIA_CORRECT");
    });
    expect(result.current.active?.payload?.pointsAwarded).toBeUndefined();
    act(() => result.current.updateAnimationPayload(id, { pointsAwarded: 6 }));
    expect(result.current.active?.id).toBe(id);
    expect(result.current.active?.payload?.pointsAwarded).toBe(6);
  });

  it("patches a queued animation and ignores a finished one", () => {
    const { result } = renderHook(useBoth, { wrapper });
    let first = 0;
    let second = 0;
    act(() => {
      first = result.current.triggerAnimation("SPEED_TRIVIA_WRONG");
      second = result.current.triggerAnimation("SPEED_TRIVIA_CORRECT");
    });
    act(() => result.current.updateAnimationPayload(second, { pointsAwarded: 4 }));
    act(() => result.current.completeAnimation(first));
    expect(result.current.active?.id).toBe(second);
    expect(result.current.active?.payload?.pointsAwarded).toBe(4);

    act(() => result.current.completeAnimation(second));
    const before = result.current.active;
    act(() => result.current.updateAnimationPayload(second, { pointsAwarded: 9 }));
    expect(result.current.active).toBe(before);
  });
});

describe("dismissAnimation", () => {
  afterEach(() => cleanup());

  it("removes the playing animation and starts the next one", () => {
    const { result } = renderHook(useBoth, { wrapper });
    let first = 0;
    let second = 0;
    act(() => {
      first = result.current.triggerAnimation("SPEED_TRIVIA_CORRECT");
      second = result.current.triggerAnimation("SPEED_TRIVIA_WRONG");
    });
    act(() => result.current.dismissAnimation(first));
    expect(result.current.active?.id).toBe(second);
    act(() => result.current.dismissAnimation(second));
    expect(result.current.active).toBeNull();
  });

  it("removes a queued animation without touching the playing one", () => {
    const { result } = renderHook(useBoth, { wrapper });
    let first = 0;
    let second = 0;
    act(() => {
      first = result.current.triggerAnimation("SPEED_TRIVIA_WRONG");
      second = result.current.triggerAnimation("SPEED_TRIVIA_CORRECT");
    });
    act(() => result.current.dismissAnimation(second));
    expect(result.current.active?.id).toBe(first);
    act(() => result.current.completeAnimation(first));
    expect(result.current.active).toBeNull();
  });
});

describe("TriviaGame wiring", () => {
  const source = readFileSync("components/trivia/TriviaGame.tsx", "utf8");

  it("hands the server's pointsAwarded to the Correct badge", () => {
    expect(source).toMatch(/correctAnimationId = triggerAnimation\("SPEED_TRIVIA_CORRECT"\)/);
    expect(source).toMatch(/updateAnimationPayload\(correctAnimationId, \{ pointsAwarded \}\)/);
  });

  it("removes the Correct pill and the green flash on Next Question", () => {
    const body = source.slice(source.indexOf("const nextQuestion = () => {"));
    expect(body.slice(0, 600)).toMatch(/dismissAnimation\(correctAnimationIdRef\.current\)/);
    expect(body.slice(0, 600)).toMatch(/setFeedbackFlash\(null\)/);
  });
});
