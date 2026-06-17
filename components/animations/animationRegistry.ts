import type { ComponentType } from "react";
import type { AnimationType, GameplayAnimationProps } from "@/types/animation";
import { BingoSquareAnimation } from "@/components/animations/BingoSquareAnimation";
import { BingoWinAnimation } from "@/components/animations/BingoWinAnimation";
import { BingoNearWinAnimation } from "@/components/animations/BingoNearWinAnimation";
import { SpeedTriviaCorrectAnimation } from "@/components/animations/SpeedTriviaCorrectAnimation";
import { SpeedTriviaWrongAnimation } from "@/components/animations/SpeedTriviaWrongAnimation";
import { SpeedTriviaRoundCompleteAnimation } from "@/components/animations/SpeedTriviaRoundCompleteAnimation";
import { LiveTriviaCorrectAnimation } from "@/components/animations/LiveTriviaCorrectAnimation";
import { LiveTriviaWrongAnimation } from "@/components/animations/LiveTriviaWrongAnimation";
import { LiveTriviaStreakAnimation } from "@/components/animations/LiveTriviaStreakAnimation";
import { LiveTriviaRoundBreakAnimation } from "@/components/animations/LiveTriviaRoundBreakAnimation";
import { LiveTriviaCategoryAnnouncementAnimation } from "@/components/animations/LiveTriviaCategoryAnnouncementAnimation";
import { FantasyScoreUpAnimation } from "@/components/animations/FantasyScoreUpAnimation";
import { FantasyLiveCollectAnimation } from "@/components/animations/FantasyLiveCollectAnimation";
import { LiveTriviaChampionAnimation } from "@/components/animations/LiveTriviaChampionAnimation";

export type AnimationComponent = ComponentType<GameplayAnimationProps>;

/**
 * Add new gameplay animations by creating a file in /components/animations
 * and registering it here — AnimationOverlay picks them up automatically.
 */
export const ANIMATION_REGISTRY: Record<AnimationType, AnimationComponent> = {
  BINGO_SQUARE: BingoSquareAnimation,
  BINGO_WIN: BingoWinAnimation,
  BINGO_NEAR_WIN: BingoNearWinAnimation,
  SPEED_TRIVIA_CORRECT: SpeedTriviaCorrectAnimation,
  SPEED_TRIVIA_WRONG: SpeedTriviaWrongAnimation,
  SPEED_TRIVIA_ROUND_COMPLETE: SpeedTriviaRoundCompleteAnimation,
  LIVE_TRIVIA_CORRECT: LiveTriviaCorrectAnimation,
  LIVE_TRIVIA_WRONG: LiveTriviaWrongAnimation,
  LIVE_TRIVIA_STREAK: LiveTriviaStreakAnimation,
  LIVE_TRIVIA_ROUND_BREAK: LiveTriviaRoundBreakAnimation,
  LIVE_TRIVIA_NEXT_CATEGORY: LiveTriviaCategoryAnnouncementAnimation,
  FANTASY_SCORE_UP: FantasyScoreUpAnimation,
  FANTASY_LIVE_COLLECT: FantasyLiveCollectAnimation,
  LIVE_TRIVIA_CHAMPION: LiveTriviaChampionAnimation,
};
