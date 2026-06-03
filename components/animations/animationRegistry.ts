import type { ComponentType } from "react";
import type { AnimationType, GameplayAnimationProps } from "@/types/animation";
import { BingoSquareAnimation } from "@/components/animations/BingoSquareAnimation";
import { BingoWinAnimation } from "@/components/animations/BingoWinAnimation";
import { SpeedTriviaCorrectAnimation } from "@/components/animations/SpeedTriviaCorrectAnimation";
import { SpeedTriviaWrongAnimation } from "@/components/animations/SpeedTriviaWrongAnimation";
import { LiveTriviaCorrectAnimation } from "@/components/animations/LiveTriviaCorrectAnimation";
import { LiveTriviaWrongAnimation } from "@/components/animations/LiveTriviaWrongAnimation";
import { FantasyScoreUpAnimation } from "@/components/animations/FantasyScoreUpAnimation";

export type AnimationComponent = ComponentType<GameplayAnimationProps>;

/**
 * Add new gameplay animations by creating a file in /components/animations
 * and registering it here — AnimationOverlay picks them up automatically.
 */
export const ANIMATION_REGISTRY: Record<AnimationType, AnimationComponent> = {
  BINGO_SQUARE: BingoSquareAnimation,
  BINGO_WIN: BingoWinAnimation,
  SPEED_TRIVIA_CORRECT: SpeedTriviaCorrectAnimation,
  SPEED_TRIVIA_WRONG: SpeedTriviaWrongAnimation,
  LIVE_TRIVIA_CORRECT: LiveTriviaCorrectAnimation,
  LIVE_TRIVIA_WRONG: LiveTriviaWrongAnimation,
  FANTASY_SCORE_UP: FantasyScoreUpAnimation,
};
