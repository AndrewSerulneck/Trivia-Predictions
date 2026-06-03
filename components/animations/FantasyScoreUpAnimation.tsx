"use client";

import { GameplayAnimationBurst } from "@/components/animations/GameplayAnimationBurst";
import type { GameplayAnimationProps } from "@/types/animation";

export function FantasyScoreUpAnimation({ onComplete }: GameplayAnimationProps) {
  return <GameplayAnimationBurst label="Score Up" tone="gold" onComplete={onComplete} />;
}
