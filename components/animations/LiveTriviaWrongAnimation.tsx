"use client";

import { GameplayAnimationBurst } from "@/components/animations/GameplayAnimationBurst";
import type { GameplayAnimationProps } from "@/types/animation";

export function LiveTriviaWrongAnimation({ onComplete }: GameplayAnimationProps) {
  return <GameplayAnimationBurst label="Wrong" tone="error" onComplete={onComplete} />;
}
