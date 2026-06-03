export type AnimationType =
  | "BINGO_SQUARE"
  | "BINGO_WIN"
  | "SPEED_TRIVIA_CORRECT"
  | "SPEED_TRIVIA_WRONG"
  | "LIVE_TRIVIA_CORRECT"
  | "LIVE_TRIVIA_WRONG"
  | "FANTASY_SCORE_UP";

export type GameplayAnimationProps = {
  onComplete: () => void;
};
