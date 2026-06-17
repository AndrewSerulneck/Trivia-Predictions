"use client";

import React, { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import type { GameplayAnimationProps } from "@/types/animation";

const PARTICLE_COLORS = [
  "bg-amber-400",
  "bg-yellow-300",
  "bg-rose-400",
  "bg-sky-400",
  "bg-green-400",
  "bg-violet-400",
] as const;

const CONFETTI_COLORS = [...PARTICLE_COLORS, "bg-white"] as const;

interface FireworkData {
  id: number;
  top: number;
  left: number;
  color: string;
  delay: number;
  rays: number;
}

interface ConfettiData {
  id: number;
  left: number;
  color: string;
  delay: number;
  duration: number;
  rotateEnd: number;
  isCircle: boolean;
  drift: number;
}

const FIREWORK_COUNT = 15;
const CONFETTI_COUNT = 60;
const TOTAL_DURATION_MS = 6000;

export const LiveTriviaChampionAnimation: React.FC<GameplayAnimationProps> = ({ onComplete }) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, TOTAL_DURATION_MS);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const fireworks = useMemo<FireworkData[]>(() => {
    return Array.from({ length: FIREWORK_COUNT }, (_, i) => ({
      id: i,
      top: Math.random() * 70 + 5,
      left: Math.random() * 80 + 10,
      color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
      delay: Math.random() * 1.2,
      rays: Math.floor(Math.random() * 5) + 8,
    }));
  }, []);

  const confetti = useMemo<ConfettiData[]>(() => {
    return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: Math.random() * 2.5,
      duration: Math.random() * 1.5 + 2.5,
      rotateEnd: Math.random() * 360 + 360,
      isCircle: Math.random() > 0.5,
      drift: (Math.random() - 0.5) * 120,
    }));
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden pointer-events-none">
      {/* Phase 1: white flash */}
      <motion.div
        className="absolute inset-0 bg-white"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 0.3, times: [0, 0.4, 1], ease: "easeOut" }}
      />

      {/* Phase 3: confetti rain */}
      {confetti.map((piece) => (
        <motion.div
          key={`confetti-${piece.id}`}
          className={`absolute top-0 ${piece.color} ${
            piece.isCircle ? "w-[6px] h-[6px] rounded-full" : "w-[4px] h-[12px] rounded-sm"
          }`}
          initial={{ y: -100, x: 0, rotate: 0, opacity: 0 }}
          animate={{
            y: ["-100px", "110vh"],
            x: [0, piece.drift],
            rotate: [0, piece.rotateEnd],
            opacity: [0, 1, 1, 1],
          }}
          style={{ left: `${piece.left}%` }}
          transition={{
            duration: piece.duration,
            delay: piece.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}

      {/* Phase 2: fireworks */}
      {fireworks.map((fw) => (
        <motion.div
          key={`firework-${fw.id}`}
          className="absolute"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.5, 1], opacity: [0, 1, 0.8] }}
          style={{ top: `${fw.top}%`, left: `${fw.left}%` }}
          transition={{
            duration: 0.8,
            delay: 0.2 + fw.delay,
            ease: "easeOut",
            repeat: Infinity,
            repeatDelay: 1.2,
          }}
        >
          {Array.from({ length: fw.rays }, (_, rayIndex) => (
            <motion.div
              key={`ray-${fw.id}-${rayIndex}`}
              className={`absolute left-0 top-0 w-[1px] h-[40px] origin-top ${fw.color}`}
              style={{ rotate: (360 / fw.rays) * rayIndex }}
            />
          ))}
        </motion.div>
      ))}

      {/* Phase 4: trophy + text badge */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <motion.div
            className="text-[80px] leading-none"
            initial={{ y: -200, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.5 }}
          >
            🏆
          </motion.div>

          <motion.div
            className="mt-4 flex flex-col items-center bg-black/70 backdrop-blur-sm rounded-2xl px-8 py-6"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
          >
            <motion.p
              className="font-bold tracking-widest text-amber-400 text-3xl text-center"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.7 }}
            >
              CONGRATULATIONS
            </motion.p>

            <motion.p
              className="text-white text-lg text-center mt-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.1, duration: 0.4 }}
            >
              YOU&apos;RE TODAY&apos;S
            </motion.p>

            <motion.p
              className="font-bold text-white text-2xl tracking-wide text-center mt-1"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 12, delay: 1.4 }}
            >
              LIVE TRIVIA WINNER!
            </motion.p>
          </motion.div>
        </div>
      </div>
    </div>
  );
};
