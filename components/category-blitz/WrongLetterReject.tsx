"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

interface WrongLetterRejectProps {
  children: ReactNode;
}

const WrongLetterReject = ({ children }: WrongLetterRejectProps) => {
  const reduce = useReducedMotion() ?? false;

  return (
    <motion.div
      className={`rounded-[inherit] ${!reduce ? "tp-reject-flash" : ""}`}
      initial={reduce ? false : { x: 0 }}
      animate={
        reduce ? {} : { x: [0, -6, 6, -4, 4, -2, 2, 0] }
      }
      transition={
        reduce ? undefined : { duration: 0.25, ease: "easeInOut" }
      }
    >
      {children}
    </motion.div>
  );
};

export default WrongLetterReject;
