import type { StoryShapeBlock, StoryTextBlock } from "@/lib/socialShare/contracts";
import type { PromoPrize } from "@/lib/promo/promoPrizes";
import {
  circlePath,
  font,
  pathShape,
  rectShape,
  solid,
  textLine,
  ticketPath,
  topRoundedRectPath,
} from "@/lib/promo/promoArt";
import type { MeasureText, PrizeSideLayout, PrizePanelTheme, ThemeRow } from "@/lib/promo/promoThemeTypes";

// The prize panel on a game-themed end card (docs/game-themes-plan.md Phase 2): one engine, styled per
// game as an object that fits it (a ticket stub for trivia, a scoreboard for Pick 'Em, a trophy plaque
// for March Madness). Prizes only come in through `prizes` (partner-social-promo-plan D13).

type Prize = Pick<PromoPrize, "headline" | "howToWin">;

export const PRIZE_PANEL_WIDTH = 860;
const X = 540 - PRIZE_PANEL_WIDTH / 2;
/** More prizes than fit end in "+ n more": 3 listed, or 2 when the picture is tight. */
export const MAX_LISTED_PRIZES = 3;
const LABEL = "WIN";

/** How many lines `text` wraps to at `maxWidth` (by words), capped at `maxLines`. */
export const lineCount = (measure: MeasureText, text: string, fontString: string, maxWidth: number, maxLines: number): number => {
  const words = text.split(/\s+/).filter(Boolean);
  let lines = 1;
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && measure(next, fontString) > maxWidth) {
      lines += 1;
      current = word;
    } else {
      current = next;
    }
  }
  return Math.min(lines, maxLines);
};

/** The card itself: border, fill (a ticket when it has notches) and its shadow. */
const cardShapes = (theme: PrizePanelTheme, top: number, height: number): StoryShapeBlock[] => {
  const shadow = { shadowColor: theme.shadowColor, shadowBlur: 40, shadowOffsetY: 18 };
  if (theme.notch) {
    return [pathShape(ticketPath(X, top, PRIZE_PANEL_WIDTH, height, theme.radius, theme.notch), { fill: solid(theme.fill), ...shadow })];
  }
  const border = theme.border;
  if (!border) return [rectShape(X, top, PRIZE_PANEL_WIDTH, height, theme.radius, { fill: solid(theme.fill), ...shadow })];
  const b = border.width;
  return [
    rectShape(X, top, PRIZE_PANEL_WIDTH, height, theme.radius, { fill: solid(border.color), ...shadow }),
    rectShape(X + b, top + b, PRIZE_PANEL_WIDTH - 2 * b, height - 2 * b, theme.radius - b, { fill: solid(theme.fill) }),
  ];
};

type Item = { headline: StoryTextBlock; how: StoryTextBlock; height: number };

type TextColumn = { x: number; width: number; align: "center" | "left" };

/** One prize, big: the headline (up to 2 lines) and how to win (up to 2 lines) under it. */
const bigPrize = (theme: PrizePanelTheme, prize: Prize, column: TextColumn, measure: MeasureText) => {
  const px = theme.headline.px;
  const headLineH = Math.round(px * 1.07);
  const headFont = font(900, px);
  const howFont = font(theme.how.weight, 40);
  const headLines = lineCount(measure, prize.headline, headFont, column.width, 2);
  const howLines = lineCount(measure, prize.howToWin, howFont, column.width, 2);
  const gap = 8;
  const height = headLineH * headLines + gap + 50 * howLines;
  const at = (top: number): StoryTextBlock[] => [
    textLine(prize.headline, column.x, top + (headLineH * headLines) / 2, headFont, theme.headline.color, {
      align: column.align,
      maxWidth: column.width,
      maxLines: 2,
      lineHeight: headLineH,
      fitMinPx: 48,
    }),
    textLine(prize.howToWin, column.x, top + headLineH * headLines + gap + (50 * howLines) / 2, howFont, theme.how.color, {
      align: column.align,
      maxWidth: column.width,
      maxLines: 2,
      lineHeight: 50,
    }),
  ];
  return { height, at };
};

/** Two or more prizes: each on its own line with how to win under it; more than 3 ends "+ n more". */
const prizeList = (theme: PrizePanelTheme, prizes: readonly Prize[], column: TextColumn, maxListed: number) => {
  const listed = prizes.slice(0, maxListed);
  const more = prizes.length - listed.length;
  const itemH = 56 + 8 + 44;
  const itemGap = 22;
  const moreH = more > 0 ? 62 : 0;
  const height = listed.length * itemH + (listed.length - 1) * itemGap + moreH;
  const at = (top: number): StoryTextBlock[] => {
    const items: Item[] = listed.map((prize, index) => {
      const itemTop = top + index * (itemH + itemGap);
      return {
        headline: textLine(prize.headline, column.x, itemTop + 28, font(900, 56), theme.headline.color, {
          align: column.align,
          maxWidth: column.width,
          fitMinPx: 40,
        }),
        how: textLine(prize.howToWin, column.x, itemTop + 56 + 8 + 22, font(700, 36), theme.how.color, {
          align: column.align,
          maxWidth: column.width,
        }),
        height: itemH,
      };
    });
    return [
      ...items.flatMap((item) => [item.headline, item.how]),
      ...(more > 0
        ? [textLine(`+ ${more} more prize${more === 1 ? "" : "s"}`, column.x, top + height - 25, font(800, 40), theme.how.color, {
            align: column.align,
            maxWidth: column.width,
          })]
        : []),
    ];
  };
  return { height, at };
};

const content = (theme: PrizePanelTheme, prizes: readonly Prize[], column: TextColumn, measure: MeasureText, maxListed: number) =>
  prizes.length === 1 ? bigPrize(theme, prizes[0], column, measure) : prizeList(theme, prizes, column, maxListed);

const headerPanel = (
  theme: PrizePanelTheme,
  layout: Extract<PrizePanelTheme["layout"], { kind: "header" }>,
  prizes: readonly Prize[],
  measure: MeasureText,
  maxListed: number,
): ThemeRow => {
  const b = theme.border?.width ?? 0;
  const padTop = 26;
  const padBottom = 32;
  const column: TextColumn = { x: 540, width: PRIZE_PANEL_WIDTH - 2 * b - 80, align: "center" };
  const body = content(theme, prizes, column, measure, maxListed);
  const height = 2 * b + layout.height + padTop + body.height + padBottom;
  return {
    height,
    draw: (top) => {
      const innerX = X + b;
      const innerW = PRIZE_PANEL_WIDTH - 2 * b;
      const labelY = top + b + layout.height / 2;
      const labelFont = font(900, 44);
      const shapes = [
        ...cardShapes(theme, top, height),
        pathShape(topRoundedRectPath(innerX, top + b, innerW, layout.height, Math.max(0, theme.radius - b)), { fill: solid(layout.fill) }),
      ];
      if (layout.dots) {
        const half = (measure(LABEL, labelFont) + 30) / 2 + 22 + 8;
        shapes.push(pathShape(`${circlePath(540 - half, labelY, 8)} ${circlePath(540 + half, labelY, 8)}`, { fill: solid(layout.labelColor) }));
      }
      return {
        shapes,
        text: [textLine(LABEL, 540, labelY, labelFont, layout.labelColor, { letterSpacing: 10 }), ...body.at(top + b + layout.height + padTop)],
      };
    },
  };
};

const sidePanel = (theme: PrizePanelTheme, layout: PrizeSideLayout, prizes: readonly Prize[], measure: MeasureText, maxListed: number): ThemeRow => {
  const b = theme.border?.width ?? 0;
  const textX = X + b + layout.width + layout.gap;
  const column: TextColumn = { x: textX, width: X + PRIZE_PANEL_WIDTH - b - layout.pad - textX, align: "left" };
  const body = content(theme, prizes, column, measure, maxListed);
  const labelH = layout.inlineLabel ? 50 + 6 : 0;
  const height = Math.max(layout.minHeight, 2 * b + 2 * layout.padY + labelH + body.height);
  return {
    height,
    draw: (top) => {
      const contentTop = top + (height - labelH - body.height) / 2;
      const side = layout.draw(X + b, top, height);
      const label = layout.inlineLabel;
      return {
        shapes: [...cardShapes(theme, top, height), ...side.shapes],
        text: [
          ...side.text,
          ...(label
            ? [textLine(LABEL, textX, contentTop + 25, font(900, 40), label.color, { align: "left", letterSpacing: label.letterSpacing, maxWidth: column.width })]
            : []),
          ...body.at(contentTop + labelH),
        ],
      };
    },
  };
};

/** The prize panel row: null without prizes. */
export const prizePanelRow = (
  theme: PrizePanelTheme,
  prizes: readonly Prize[],
  measure: MeasureText,
  maxListed: number = MAX_LISTED_PRIZES,
): ThemeRow | null => {
  if (prizes.length === 0) return null;
  return theme.layout.kind === "header"
    ? headerPanel(theme, theme.layout, prizes, measure, maxListed)
    : sidePanel(theme, theme.layout, prizes, measure, maxListed);
};

/** The panel's left edge, for a theme's own card in the same column (Category Blitz's round card). */
export const PRIZE_PANEL_X = X;
