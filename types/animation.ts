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
  | "LIVE_TRIVIA_NEXT_CATEGORY"
  | "FANTASY_SCORE_UP"
  | "FANTASY_LIVE_COLLECT"
  | "LIVE_TRIVIA_CHAMPION"
  | "CATEGORY_BLITZ_CHAMPION"
  | "CATEGORY_BLITZ_MODE_FLIP";

export interface AnimationPayload {
  inputRect?: DOMRect | null;
  categoryName?: string;
  roundNumber?: number;
  /** Which full-screen flip treatment CategoryBlitzModeFlipTakeover should play
   *  (docs/category-blitz-mode-b-plan.md §4b) — dev-selectable via
   *  lib/categoryBlitzModes.ts until one variant is picked as the shipped default. */
  modeFlipVariant?: "card" | "splitFlap" | "overspin";
}

export type GameplayAnimationProps = {
  onComplete: () => void;
  payload?: AnimationPayload;
};
