"use client";

import { motion } from "framer-motion";
import { SCREEN_EASE as EASE } from "@/lib/venueScreenBrand";

/** One countdown character; it flips in when its value changes (transform + opacity only). */
export const FlipChar = ({ char, flip }: { char: string; flip: boolean }) => (
  <motion.span
    key={char}
    className="inline-block"
    initial={flip ? { opacity: 0, rotateX: -80, y: -10 } : false}
    animate={{ opacity: 1, rotateX: 0, y: 0 }}
    transition={{ duration: 0.35, ease: EASE }}
    style={{ transformPerspective: 400 }}
  >
    {char}
  </motion.span>
);
