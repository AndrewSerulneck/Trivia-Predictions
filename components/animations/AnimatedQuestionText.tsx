"use client";

import { motion } from "framer-motion";

// Live Trivia question reveal: each word fades + rises into place with a short
// stagger so a new question reads in like a sportscaster delivering it, instead
// of snapping onto the screen all at once.
export const AnimatedQuestionText = ({ text }: { text: string }) => {
  const words = text.split(" ");
  return (
    <>
      {words.map((word, wordIndex) => (
        <span key={`${wordIndex}-${word}`} className="inline-block whitespace-pre">
          <motion.span
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: wordIndex * 0.045, duration: 0.22 }}
            className="inline-block"
          >
            {word}
          </motion.span>
          {wordIndex < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
};
