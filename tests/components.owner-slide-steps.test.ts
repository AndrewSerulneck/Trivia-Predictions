// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { SlideSteps } from "@/components/owner/sheet/SlideSteps";
import { STEP_OUT_MS } from "@/components/owner/sheet/sheetMotion";

// docs/partner-dashboard-app-redesign-plan.md Phase 1: SlideSteps derives the
// slide direction from step order, runs exit THEN entrance (never two steps on
// screen), and moves focus to the new step's heading. No JSX (the repo's
// vitest glob is *.test.ts) — createElement stands in.

const STEPS = ["game", "when", "repeat", "review"] as const;
type Step = (typeof STEPS)[number];

const renderStep = (step: Step) =>
  createElement(
    "div",
    null,
    createElement("h3", null, `Heading ${step}`),
    createElement("button", { type: "button" }, `Action ${step}`)
  );

const view = (current: Step) => createElement(SlideSteps<Step>, { steps: STEPS, current, renderStep });

const stepEl = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-step]");

const setReducedMotion = (reduce: boolean) => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduce && query.includes("reduce"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
};

describe("SlideSteps", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setReducedMotion(false);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders the current step with no animation and does not steal focus on mount", () => {
    const { container } = render(view("game"));
    const el = stepEl(container);
    expect(el?.dataset.step).toBe("game");
    expect(el?.dataset.stepPhase).toBe("idle");
    expect(el?.className).toBe("");
    expect(document.activeElement).toBe(document.body);
  });

  it("forward: the old step leaves to the left, inert, then the new one enters from the right", () => {
    const { container, rerender } = render(view("game"));
    rerender(view("when"));

    let el = stepEl(container);
    expect(el?.dataset.step).toBe("game");
    expect(el?.dataset.stepPhase).toBe("leaving");
    expect(el?.dataset.stepDirection).toBe("forward");
    expect(el?.className).toContain("animate-tp-step-out-left");
    expect(el?.hasAttribute("inert")).toBe(true);
    expect(container.querySelectorAll("[data-step]")).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(STEP_OUT_MS);
    });

    el = stepEl(container);
    expect(el?.dataset.step).toBe("when");
    expect(el?.dataset.stepPhase).toBe("entering");
    expect(el?.className).toContain("animate-tp-step-in-right");
    expect(el?.hasAttribute("inert")).toBe(false);
    expect(document.activeElement?.textContent).toBe("Heading when");
  });

  it("backward: leaves to the right and enters from the left", () => {
    const { container, rerender } = render(view("review"));
    rerender(view("when"));
    expect(stepEl(container)?.className).toContain("animate-tp-step-out-right");
    expect(stepEl(container)?.dataset.stepDirection).toBe("backward");
    act(() => {
      vi.advanceTimersByTime(STEP_OUT_MS);
    });
    expect(stepEl(container)?.className).toContain("animate-tp-step-in-left");
  });

  it("a second change mid-exit retargets without a second exit", () => {
    const { container, rerender } = render(view("game"));
    rerender(view("when"));
    rerender(view("repeat"));
    expect(stepEl(container)?.dataset.step).toBe("game");
    act(() => {
      vi.advanceTimersByTime(STEP_OUT_MS);
    });
    expect(stepEl(container)?.dataset.step).toBe("repeat");
  });

  it("drops the entrance class once the animation ends (no lingering transform)", () => {
    const { container, rerender } = render(view("game"));
    rerender(view("when"));
    act(() => {
      vi.advanceTimersByTime(STEP_OUT_MS);
    });
    const el = stepEl(container) as HTMLElement;
    // jsdom has no AnimationEvent, so React listens for the webkit-prefixed
    // name there; real browsers get the unprefixed one. Fire both.
    act(() => {
      el.dispatchEvent(new Event("animationend", { bubbles: true }));
      el.dispatchEvent(new Event("webkitAnimationEnd", { bubbles: true }));
    });
    expect(stepEl(container)?.className).toBe("");
    expect(stepEl(container)?.dataset.stepPhase).toBe("idle");
  });

  it("reduced motion swaps instantly and still focuses the heading", () => {
    setReducedMotion(true);
    const { container, rerender } = render(view("game"));
    rerender(view("when"));
    const el = stepEl(container);
    expect(el?.dataset.step).toBe("when");
    expect(el?.className).toBe("");
    expect(document.activeElement?.textContent).toBe("Heading when");
  });
});
