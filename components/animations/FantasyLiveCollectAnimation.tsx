"use client";

import { useEffect } from "react";
import type { GameplayAnimationProps } from "@/types/animation";

// Replace this file with the output from Prompt 10 (FantasyLiveCollectAnimation).
// Developer note: add data-fantasy-live-collect attribute to the collect points button in FantasyHome.tsx.
export function FantasyLiveCollectAnimation({ onComplete }: GameplayAnimationProps) {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, 700);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return null;
}
