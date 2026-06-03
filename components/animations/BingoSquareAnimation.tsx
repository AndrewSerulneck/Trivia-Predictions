"use client";

import { GameplayAnimationBurst } from "@/components/animations/GameplayAnimationBurst";
import type { GameplayAnimationProps } from "@/types/animation";

export function BingoSquareAnimation({ onComplete }: GameplayAnimationProps) {
  return <GameplayAnimationBurst label="Square Hit" tone="success" onComplete={onComplete} />;
}
