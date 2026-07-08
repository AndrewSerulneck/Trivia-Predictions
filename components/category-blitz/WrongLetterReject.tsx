"use client";

import { motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";

interface WrongLetterRejectProps {
  /** Changes on every keystroke that should replay the reject shake; null when inactive. */
  shakeToken: string | null;
  children: ReactNode;
}

const shakeKeyframes = { x: [0, -6, 6, -4, 4, -2, 2, 0] };
const shakeTransition = { duration: 0.25, ease: "easeInOut" as const };

const WrongLetterReject = ({ shakeToken, children }: WrongLetterRejectProps) => {
  const reduce = useReducedMotion() ?? false;
  const controls = useAnimationControls();
  const lastToken = useRef<string | null>(null);

  useEffect(() => {
    const changed = shakeToken !== null && shakeToken !== lastToken.current;
    lastToken.current = shakeToken;
    if (changed && !reduce) {
      controls.start(shakeKeyframes, shakeTransition);
    }
  }, [shakeToken, reduce, controls]);

  return (
    <motion.div className="relative rounded-[inherit]" animate={controls} initial={{ x: 0 }}>
      {/* Flash overlay is keyed to replay per keystroke; it's decorative and absolutely
          positioned, so remounting it (unlike the input below) never costs focus. */}
      {shakeToken !== null && !reduce && (
        <span
          key={shakeToken}
          aria-hidden
          className="tp-reject-flash pointer-events-none absolute inset-0 rounded-[inherit]"
        />
      )}
      {children}
    </motion.div>
  );
};

export default WrongLetterReject;
