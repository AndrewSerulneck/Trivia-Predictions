"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect } from "react";

// A number that counts to its new value when a poll changes it. First render shows the value as-is (no animation
// on mount or reload). Reduced motion: jumps.

type CountUpProps = {
  value: number;
  format?: (n: number) => string;
  className?: string;
};

const defaultFormat = (n: number): string => String(n);

export function CountUp({ value, format = defaultFormat, className }: CountUpProps) {
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(value);
  const text = useTransform(motionValue, (n) => format(Math.round(n)));

  useEffect(() => {
    if (reduceMotion) {
      motionValue.set(value);
      return undefined;
    }
    const controls = animate(motionValue, value, { duration: 0.9, ease: "easeOut" });
    return () => controls.stop();
  }, [value, reduceMotion, motionValue]);

  return <motion.span className={className}>{text}</motion.span>;
}
