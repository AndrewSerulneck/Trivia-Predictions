"use client";

import { GameplayAnimationBurst } from "@/components/animations/GameplayAnimationBurst";
import type { GameplayAnimationProps } from "@/types/animation";

export function BingoWinAnimation({ onComplete }: GameplayAnimationProps) {
  return <GameplayAnimationBurst label="Bingo!" tone="gold" onComplete={onComplete} />;
}
