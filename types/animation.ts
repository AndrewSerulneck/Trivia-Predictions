export type AnimationType =
  | "BINGO_SQUARE"
  | "BINGO_WIN"
  | "BINGO_NEAR_WIN"
  | "SPEED_TRIVIA_CORRECT"
  | "SPEED_TRIVIA_WRONG"
  | "SPEED_TRIVIA_ROUND_COMPLETE"
  | "LIVE_TRIVIA_CORRECT"
  | "LIVE_TRIVIA_WRONG"
  | "LIVE_TRIVIA_STREAK"
  | "LIVE_TRIVIA_ROUND_BREAK"
  | "FANTASY_SCORE_UP"
  | "FANTASY_LIVE_COLLECT";

export type GameplayAnimationProps = {
  onComplete: () => void;
};
