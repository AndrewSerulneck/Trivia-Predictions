"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState, type ReactNode } from "react";
import {
  SIGNUP_STEP_TRAVEL,
  signupTransition,
  type SignupDirection,
} from "@/components/signup/signupMotion";

// Partner Self-Serve Signup — the step swap.
//
// Phase 3 (docs/partner-self-serve-signup-plan.md §4). One directional slide +
// fade, `mode="wait"` so the outgoing screen is fully gone before the incoming
// one lands. Two screens on top of each other reads as a glitch on a 390px
// phone, and a wizard where the user answers one question at a time should
// never show two questions at once.
//
// DIRECTION IS DERIVED HERE, not passed in. The component remembers the last
// step index it rendered and compares — so "Back reverses the slide" is a
// property of the system, not something each of the six screens has to
// remember to wire. The derived direction is handed to AnimatePresence via
// `custom`, which is the only way the EXITING element (already unmounted from
// the render tree) can see the new direction for its exit variant.

type SignupStepTransitionProps = {
  /** 0-based index of the visible step. Drives both the key and the direction. */
  stepIndex: number;
  /** Optional stable identity if two indexes can render the same step. */
  stepKey?: string;
  children: ReactNode;
  className?: string;
};

const variants = {
  enter: (direction: SignupDirection) => ({
    opacity: 0,
    x: direction * SIGNUP_STEP_TRAVEL,
  }),
  center: { opacity: 1, x: 0 },
  exit: (direction: SignupDirection) => ({
    opacity: 0,
    x: direction * -SIGNUP_STEP_TRAVEL,
  }),
};

const reducedVariants = {
  enter: { opacity: 0, x: 0 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 0 },
};

export function SignupStepTransition({
  stepIndex,
  stepKey,
  children,
  className = "",
}: SignupStepTransitionProps) {
  const reduce = useReducedMotion() ?? false;

  // Index of the previously rendered step, adjusted DURING render when the prop
  // changes — React's documented "adjust state when a prop changes" pattern, not
  // an effect. An effect would commit one frame with the stale direction, which
  // is exactly the frame AnimatePresence reads when it starts the exit. (A ref
  // would be the obvious tool and is what the eslint `react-hooks/refs` rule
  // forbids reading during render — this is the sanctioned equivalent.)
  const [lastIndex, setLastIndex] = useState(stepIndex);
  const [direction, setDirection] = useState<SignupDirection>(1);
  if (stepIndex !== lastIndex) {
    setDirection(stepIndex < lastIndex ? -1 : 1);
    setLastIndex(stepIndex);
  }

  return (
    <AnimatePresence mode="wait" initial={false} custom={direction}>
      <motion.div
        key={stepKey ?? String(stepIndex)}
        custom={direction}
        variants={reduce ? reducedVariants : variants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={signupTransition(reduce)}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
