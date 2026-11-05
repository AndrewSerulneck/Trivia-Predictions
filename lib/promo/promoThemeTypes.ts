import type { StoryFill } from "@/lib/socialShare/contracts";
import type { Blocks, TextShadow } from "@/lib/promo/promoArt";
import type { ReelPlan } from "@/lib/promo/promoReel";

// The shape of one game's Share to social look (docs/game-themes-plan.md Phase 2). The registry is
// lib/promo/promoThemes.ts; the end card (lib/promo/promoEndCard.ts) reads a theme and never names a game.

/** Width of `text` drawn in `font` (a canvas font string), in px. */
export type MeasureText = (text: string, font: string) => number;

/** A row of the end card's stack: its height, and its blocks once its top is known. */
export type ThemeRow = { height: number; draw: (top: number) => Blocks };

/** The picture and where the stack's rows landed, so backdrop artwork can sit around them. */
export type ThemeStage = {
  width: number;
  height: number;
  safeTop: number;
  safeBottom: number;
  rows: readonly { id: string; top: number; height: number }[];
};

/** A prize panel's WIN label + prize + how to win. "header": a WIN bar on top, centred text. */
export type PrizeHeaderLayout = {
  kind: "header";
  height: number;
  fill: string;
  labelColor: string;
  /** A dot each side of WIN (the scoreboard). */
  dots?: boolean;
};

/** "side": an object on the left (ticket stub, WIN tile, trophy), left-aligned text beside it. */
export type PrizeSideLayout = {
  kind: "side";
  /** The left column, from the card's inner edge. */
  width: number;
  /** Between the column and the text. */
  gap: number;
  /** Right and vertical padding. */
  pad: number;
  padY: number;
  minHeight: number;
  /** Draws the left column; `x` is the card's inner left edge. */
  draw: (x: number, top: number, height: number) => Blocks;
  /** WIN above the prize, in the text column (the trophy plaque). */
  inlineLabel?: { color: string; letterSpacing: number };
};

export type PrizePanelTheme = {
  fill: string;
  radius: number;
  border?: { color: string; width: number };
  shadowColor: string;
  /** Radius of the ticket's side notches. */
  notch?: number;
  headline: { color: string; px: number };
  how: { color: string; weight: number };
  layout: PrizeHeaderLayout | PrizeSideLayout;
};

/** One frame of the Reel, as a theme's motion sees it (docs/game-themes-plan.md Phase 3). */
export type ReelMotionFrame = {
  /** Seconds into the Reel. */
  t: number;
  plan: ReelPlan;
  /** The Story end card: its size, safe zone and where each row lands. */
  stage: ThemeStage;
  /** 0 through the beats, easing to 1 as the end card settles (from plan.end[0], REEL_SETTLE_S long). */
  settle: number;
};

/**
 * The game's own Reel motion, drawn over the backdrop and under the beats on every frame before the
 * end card is held. Vector blocks only, like the picture. Once `settle` is 1 the beat backdrop plus the
 * motion must be the picture's backdrop, so the held end card (the still picture) follows seamlessly.
 */
export type ThemeReel = {
  /** The backdrop during the beats, when the motion moves part of it (Pick 'Em's balls fly in). Default: the backdrop. */
  beatBackdrop?: (stage: ThemeStage) => Blocks;
  motion: (frame: ReelMotionFrame) => Blocks;
};

export type PromoTheme = {
  /** Painted first, under the backdrop. */
  background: (width: number, height: number) => StoryFill;
  /** Decoration behind the stack: may run outside the safe zone, never carries content. */
  backdrop: (stage: ThemeStage) => Blocks;
  brand: { color: string; gap: { ideal: number; min: number } };
  /** The game's name, styled. `lines` come from the template (a theme never rewords the name). */
  title: (lines: readonly string[], scale: number, measure: MeasureText) => ThemeRow;
  when: { timeColor: string; shadow?: TextShadow };
  /** A sample of the game between "when" and the prize: always (Squares board) or only without a prize. */
  art?: { show: "always" | "without-prize"; row: (scale: number, measure: MeasureText) => ThemeRow };
  prize: PrizePanelTheme;
  venue: { addressColor: string; handleColor: string; shadow?: TextShadow };
  /** "Play on Hightop Challenge": a pill with a glow, or a solid `drop` edge under it. */
  cta: { fill: string; text: string; glow?: string; drop?: string };
  followColor: string;
  /** The Reel's per-game motion (buzzer flash, dice tumble, balls flying, lights on, …). */
  reel: ThemeReel;
};
