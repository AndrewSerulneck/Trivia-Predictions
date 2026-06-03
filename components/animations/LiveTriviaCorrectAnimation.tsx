"use client";

import { GameplayAnimationBurst } from "@/components/animations/GameplayAnimationBurst";
import type { GameplayAnimationProps } from "@/types/animation";

export function LiveTriviaCorrectAnimation({ onComplete }: GameplayAnimationProps) {
  return <GameplayAnimationBurst label="Correct" tone="success" onComplete={onComplete} />;
}
