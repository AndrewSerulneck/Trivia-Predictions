"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import {
  SIGNUP_CONTENT_DELAY,
  SIGNUP_ITEM_RISE,
  signupStaggerDelay,
  signupTransition,
} from "@/components/signup/signupMotion";

// Partner Self-Serve Signup — staggered content entrance.
//
// Phase 3 (docs/partner-self-serve-signup-plan.md §4): "content enters staggered
// ~40 ms per element, never all at once." Wrap a step's blocks in
// <SignupStagger> and each direct <SignupStaggerItem> fades + rises in turn.
//
// The container carries `initial`/`animate`; framer-motion propagates those
// variant NAMES to the items, so an item needs no props of its own. That is the
// whole reason this is two components rather than a delay prop each screen has
// to count out by hand.
//
// Under `prefers-reduced-motion` the stagger interval collapses to 0 and the
// rise to 0 — everything fades in together, once, quickly.

type SignupStaggerProps = {
  children: ReactNode;
  className?: string;
  /** Held back until the step's own slide is roughly landed. */
  delay?: number;
};

export function SignupStagger({ children, className = "", delay = SIGNUP_CONTENT_DELAY }: SignupStaggerProps) {
  const reduce = useReducedMotion() ?? false;

  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="shown"
      variants={{
        hidden: {},
        shown: {
          transition: {
            delayChildren: reduce ? 0 : delay,
            staggerChildren: signupStaggerDelay(reduce),
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

type SignupStaggerItemProps = {
  children: ReactNode;
  className?: string;
};

export function SignupStaggerItem({ children, className = "" }: SignupStaggerItemProps) {
  const reduce = useReducedMotion() ?? false;

  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: reduce ? 0 : SIGNUP_ITEM_RISE },
        shown: { opacity: 1, y: 0, transition: signupTransition(reduce) },
      }}
    >
      {children}
    </motion.div>
  );
}
