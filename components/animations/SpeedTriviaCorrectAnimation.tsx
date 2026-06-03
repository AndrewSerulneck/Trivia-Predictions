"use client";

import { GameplayAnimationBurst } from "@/components/animations/GameplayAnimationBurst";
import type { GameplayAnimationProps } from "@/types/animation";

export function SpeedTriviaCorrectAnimation({ onComplete }: GameplayAnimationProps) {
  return <GameplayAnimationBurst label="Correct" tone="success" onComplete={onComplete} />;
}
