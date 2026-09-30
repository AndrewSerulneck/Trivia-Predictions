"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { stepDirection } from "@/lib/ownerSheetParams";
import { prefersReducedMotion, STEP_OUT_MS } from "@/components/owner/sheet/sheetMotion";

// One question per screen, sliding sideways (docs/partner-dashboard-app-redesign-plan.md §4d).
//
// SEQUENTIAL, not overlapping: the old step slides out (120ms), THEN the new one
// slides in (240ms). Two questions on screen at once reads as a glitch on a
// 390px phone — the same call the signup wizard made (SignupStepTransition's
// `mode="wait"`). Built on CSS keyframes in app/globals.css rather than
// framer-motion, per the plan's Tailwind-first rule.
//
// DIRECTION IS DERIVED, not passed: forward in `steps` order slides in from the
// right, backward from the left. A step that is not in `steps` (skipped, or a
// sub-screen like "history") counts as forward.
//
// RENDER PROP, not children. The outgoing step is rendered LIVE via
// `renderStep(leavingId)` for its 120ms exit — never a stale snapshot of an
// old React element — so the host just renders "step X from my current state".
// The outgoing step is `inert` while it leaves (no double-advance on a fast
// double tap, and screen readers skip it).
//
// FOCUS. After a change, focus moves to the new step's `[data-step-heading]`
// element (or its first h1–h3) so a screen reader announces the new question.
// The initial render does not steal focus — the sheet already focused itself.
//
// `prefers-reduced-motion`: the swap is instant, no exit phase at all.

export type SlideStepsProps<StepId extends string> = {
  /** Every step in flow order. Direction is derived from this. */
  steps: readonly StepId[];
  current: StepId;
  renderStep: (step: StepId) => ReactNode;
  className?: string;
};

type Direction = 1 | -1;

type SlideState<StepId extends string> = {
  /** The step on screen when nothing is leaving. */
  shown: StepId;
  /** Mid-exit step, or null. */
  leaving: StepId | null;
  /** Where we are heading; can change while a step is still leaving. */
  target: StepId;
  direction: Direction;
  /** Incoming step is still playing its entrance animation. */
  entering: boolean;
  /** Bumps on every arrival — restarts the CSS animation and triggers focus. */
  seq: number;
};

const ENTER_CLASS: Record<Direction, string> = {
  1: "animate-tp-step-in-right",
  [-1]: "animate-tp-step-in-left",
};

const EXIT_CLASS: Record<Direction, string> = {
  1: "animate-tp-step-out-left",
  [-1]: "animate-tp-step-out-right",
};

const focusStepHeading = (container: HTMLElement | null) => {
  if (!container) return;
  const heading =
    container.querySelector<HTMLElement>("[data-step-heading]") ??
    container.querySelector<HTMLElement>("h1, h2, h3");
  if (!heading) return;
  if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
};

export const SlideSteps = <StepId extends string>({
  steps,
  current,
  renderStep,
  className = "",
}: SlideStepsProps<StepId>) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<SlideState<StepId>>(() => ({
    shown: current,
    leaving: null,
    target: current,
    direction: 1,
    entering: false,
    seq: 0,
  }));

  // "Adjust state when a prop changes" — during render, not in an effect.
  if (current !== state.target) {
    const from = state.leaving ?? state.shown;
    const direction: Direction = stepDirection(steps, from, current) === -1 ? -1 : 1;
    if (prefersReducedMotion()) {
      setState({ shown: current, leaving: null, target: current, direction, entering: false, seq: state.seq + 1 });
    } else if (state.leaving !== null) {
      setState({ ...state, target: current, direction });
    } else {
      setState({ ...state, leaving: state.shown, target: current, direction, entering: false });
    }
  }

  const { leaving, seq } = state;

  useEffect(() => {
    if (leaving === null) return;
    const timer = window.setTimeout(() => {
      setState((prev) => ({
        shown: prev.target,
        leaving: null,
        target: prev.target,
        direction: prev.direction,
        entering: true,
        seq: prev.seq + 1,
      }));
    }, STEP_OUT_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  useEffect(() => {
    if (seq === 0) return;
    focusStepHeading(containerRef.current);
  }, [seq]);

  const visible = state.leaving ?? state.shown;
  const animationClass = state.leaving !== null
    ? EXIT_CLASS[state.direction]
    : state.entering
      ? ENTER_CLASS[state.direction]
      : "";

  return (
    <div className={`relative overflow-x-clip ${className}`}>
      <div
        key={`${visible}:${state.seq}`}
        ref={containerRef}
        data-step={visible}
        data-step-phase={state.leaving !== null ? "leaving" : state.entering ? "entering" : "idle"}
        data-step-direction={state.direction === 1 ? "forward" : "backward"}
        inert={state.leaving !== null}
        aria-hidden={state.leaving !== null ? true : undefined}
        onAnimationEnd={(event) => {
          // Drop the class once the entrance lands: its `both` fill would
          // otherwise leave a transform on this wrapper, which turns any
          // position:fixed popover inside a step into "fixed to this div".
          if (event.target === event.currentTarget && state.entering) {
            setState((prev) => ({ ...prev, entering: false }));
          }
        }}
        className={animationClass}
      >
        {renderStep(visible)}
      </div>
    </div>
  );
};
