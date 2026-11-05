import {
  circlePath,
  deg,
  emptyBlocks,
  displayWord,
  ellipseGlow,
  font,
  linePath,
  pathShape,
  rectShape,
  scaleY,
  solid,
  strokeOf,
  textLine,
  glyph,
  type Blocks,
} from "@/lib/promo/promoArt";
import { faded, progress } from "@/lib/promo/promoMotion";
import { easeBack, seededRandom } from "@/lib/promo/promoReel";
import type { PromoTheme, ReelMotionFrame } from "@/lib/promo/promoThemeTypes";

// Super Bowl Squares: a tilted grid on green, confetti, and the squares board itself with one "?"
// square lit up; the prize card has a dark WIN tile. Canvas → Super Bowl Squares. No league mark (G6).
// Reel (Phase 3): the backdrop grid's squares fill in, claimed one by one, then the "?" square lights up.

const AMBER = "#FBBF24";
const BOARD = "#0B1220";
const DIGIT_CELL = "#1E293B";
const OPEN_CELL = "#F1F5F9";

const TOP_DIGITS = [7, 3, 0, 9, 4, 1, 8, 6, 2, 5];
const SIDE_DIGITS = [4, 0, 7];
/** Claimed squares on the sample board, "row-column". */
const CLAIMED: Record<string, string> = {
  "0-1": "#2563EB",
  "0-4": "#DB2777",
  "0-8": "#7C3AED",
  "1-0": "#0891B2",
  "1-3": "#2563EB",
  "1-6": "#DB2777",
  "1-9": "#0891B2",
  "2-2": "#7C3AED",
  "2-5": "#2563EB",
  "2-7": "#0891B2",
};
const LIT = "1-4";

/** [x, y (Post), w, h, colour, degrees]. */
const CONFETTI: readonly (readonly [number, number, number, number, string, number])[] = [
  [83, 157, 26, 14, AMBER, 30],
  [973, 217, 26, 14, "#4ADE80", -25],
  [191, 426, 22, 12, "#F8FAFC", 60],
  [891, 436, 22, 12, AMBER, 15],
  [53, 987, 26, 14, "#4ADE80", -40],
  [1023, 967, 26, 14, "#F8FAFC", 35],
];
const DOTS: readonly (readonly [number, number, number, string, number])[] = [
  [250, 90, 8, "#F8FAFC", 0.7],
  [830, 110, 7, AMBER, 1],
  [990, 640, 7, "#4ADE80", 1],
  [80, 650, 7, AMBER, 1],
];

const GRID = 140;
const GRID_TURN = deg(-12);
/** The backdrop grid's lines: vertical every GRID from GRID_X0, horizontal from gridY0(height). */
const GRID_X0 = -600;
const gridY0 = (height: number): number => -Math.ceil((height / 2 + 500) / GRID) * GRID + 60;

type Cell = { x: number; y: number };

/** The grid's squares on screen, in the order they are claimed (from the middle out), and the "?" square. */
const cellsFor = (width: number, height: number): { claimed: Cell[]; lit: Cell } => {
  const cos = Math.cos(GRID_TURN);
  const sin = Math.sin(GRID_TURN);
  const cells: Cell[] = [];
  for (let col = 0; col < 9; col += 1) {
    for (let y0 = gridY0(height); y0 + GRID <= height / 2 + 500; y0 += GRID) {
      const cx = GRID_X0 + col * GRID + GRID / 2;
      const cy = y0 + GRID / 2;
      const x = width / 2 + cx * cos - cy * sin;
      const y = height / 2 + cx * sin + cy * cos;
      if (x > 60 && x < width - 60 && y > 300 && y < height - 260) cells.push({ x, y });
    }
  }
  const distance = (cell: Cell, x: number, y: number) => Math.hypot(cell.x - x, cell.y - y);
  // The "?" square: below the title, where the claimed squares end up.
  const lit = cells.reduce((best, cell) => (distance(cell, width / 2, height * 0.74) < distance(best, width / 2, height * 0.74) ? cell : best));
  const random = seededRandom(7);
  const claimed = cells
    .filter((cell) => cell !== lit)
    .map((cell) => ({ cell, key: distance(cell, width / 2, height / 2) + random() * 260 }))
    .sort((a, b) => a.key - b.key)
    .slice(0, 30)
    .map(({ cell }) => cell);
  return { claimed, lit };
};

const CLAIM_COLOURS = ["#2563EB", "#DB2777", "#7C3AED", "#0891B2"];
const CLAIM_FROM = 0.25;
const CLAIM_EVERY = 0.06;
const LIGHT_AT = 2.2;

const square = (cell: Cell, scale: number, options: Parameters<typeof rectShape>[5]) =>
  rectShape(-62, -62, 124, 124, 14, { ...options, transform: { x: cell.x, y: cell.y, rotate: GRID_TURN, scale } });

const reelMotion = ({ t, stage }: ReelMotionFrame): Blocks => {
  // The squares clear away as the "when" beat starts.
  const shown = 1 - progress(t, 2.9, 0.6);
  if (shown <= 0.005) return emptyBlocks();
  const { claimed, lit } = cellsFor(stage.width, stage.height);
  const shapes = claimed.flatMap((cell, index) => {
    const pop = progress(t, CLAIM_FROM + index * CLAIM_EVERY, 0.2);
    return pop > 0 ? [square(cell, 0.4 + 0.6 * easeBack(pop), { fill: solid(CLAIM_COLOURS[index % CLAIM_COLOURS.length]), opacity: 0.55 * Math.min(1, pop * 3) })] : [];
  });
  const light = progress(t, LIGHT_AT, 0.3);
  const text: Blocks["text"] = [];
  if (light > 0) {
    const scale = 0.5 + 0.6 * easeBack(light);
    const glow = 0.6 + 0.4 * Math.sin((t - LIGHT_AT) * 9);
    shapes.push(square(lit, scale, { fill: solid(AMBER), shadowColor: `rgba(251, 191, 36, ${glow})`, shadowBlur: 60 }));
    text.push(glyph("?", lit.x, lit.y, 104 * scale, BOARD, { rotate: -12 }));
  }
  return faded({ shapes, text }, shown);
};

export const squaresTheme: PromoTheme = {
  background: () => solid("#03180E"),
  backdrop: ({ width, height }) => {
    const sy = scaleY(height);
    const reach = height / 2 + 500;
    const grid: string[] = [];
    for (let offset = -Math.ceil(reach / 140) * 140 + 60; offset <= reach; offset += 140) grid.push(linePath(-900, offset, 900, offset));
    for (let offset = -600; offset <= 660; offset += 140) grid.push(linePath(offset, -reach, offset, reach));
    return {
      shapes: [
        ellipseGlow(width, height, { cx: 0.5, cy: 0.45, rx: 1, ry: 0.7 }, [
          [0, "#0E4D2E"],
          [0.55, "#06301C"],
          [1, "#03180E"],
        ]),
        pathShape(grid.join(" "), { stroke: strokeOf("rgba(255, 255, 255, 0.07)", 3), transform: { x: width / 2, y: height / 2, rotate: deg(-12) } }),
        ...CONFETTI.map(([x, y, w, h, color, rotate]) => rectShape(-w / 2, -h / 2, w, h, 3, { fill: solid(color), transform: { x, y: sy(y), rotate: deg(rotate) } })),
        ...DOTS.map(([x, y, r, color, opacity]) => pathShape(circlePath(x, sy(y), r), { fill: solid(color), opacity })),
      ],
      text: [],
    };
  },
  brand: { color: "rgba(255, 255, 255, 0.6)", gap: { ideal: 24, min: 20 } },
  title: (lines, scale) => {
    const s = scale;
    const bigPx = 182 * s;
    const bigH = Math.round(bigPx * 0.95);
    const big = (top: number, word: string) =>
      displayWord(word, top + bigH / 2, font(900, bigPx), AMBER, {
        drop: { color: "#92400E", offset: 8 * s },
        glow: { color: "rgba(251, 191, 36, 0.4)", blur: 40 },
      });
    if (lines.length === 1) return { height: bigH, draw: (top) => ({ shapes: [], text: big(top, lines[0]) }) };
    const smallPx = 96 * s;
    return {
      height: smallPx + bigH,
      draw: (top) => ({
        shapes: [],
        text: [
          textLine(lines[0], 540, top + smallPx / 2, font(900, smallPx), "#FFFFFF", { letterSpacing: 6 * s, fitMinPx: 48 }),
          ...big(top + smallPx, lines[1]),
        ],
      }),
    };
  },
  when: { timeColor: AMBER },
  art: {
    show: "always",
    row: (scale) => {
      const s = Math.max(0.75, scale);
      const pad = 14 * s;
      const gap = 4 * s;
      const cols = 11;
      const cellW = (722 * s - gap * (cols - 1)) / cols;
      const cellH = 60 * s;
      const boardW = 722 * s + pad * 2;
      const boardH = pad * 2 + cellH * 4 + gap * 3;
      return {
        height: boardH,
        draw: (top) => {
          const left = 540 - boardW / 2 + pad;
          const shapes = [rectShape(540 - boardW / 2, top, boardW, boardH, 24 * s, { fill: solid(BOARD), shadowColor: "rgba(0, 0, 0, 0.5)", shadowBlur: 40, shadowOffsetY: 18 })];
          const text: Blocks["text"] = [];
          const digitFont = font(900, Math.max(34, 34 * s));
          for (let row = 0; row < 4; row += 1) {
            for (let col = 0; col < cols; col += 1) {
              const x = left + col * (cellW + gap);
              const y = top + pad + row * (cellH + gap);
              const cx = x + cellW / 2;
              const cy = y + cellH / 2;
              if (row === 0 && col === 0) continue;
              const digit = row === 0 ? TOP_DIGITS[col - 1] : col === 0 ? SIDE_DIGITS[row - 1] : null;
              if (digit !== null) {
                shapes.push(rectShape(x, y, cellW, cellH, 8 * s, { fill: solid(DIGIT_CELL) }));
                text.push(textLine(String(digit), cx, cy, digitFont, AMBER, { maxWidth: cellW, fitMinPx: undefined }));
                continue;
              }
              const key = `${row - 1}-${col - 1}`;
              if (key === LIT) {
                shapes.push(rectShape(x, y, cellW, cellH, 8 * s, { fill: solid(AMBER), shadowColor: "rgba(251, 191, 36, 0.9)", shadowBlur: 24 }));
                text.push(textLine("?", cx, cy, digitFont, BOARD, { maxWidth: cellW, fitMinPx: undefined }));
                continue;
              }
              shapes.push(rectShape(x, y, cellW, cellH, 8 * s, { fill: solid(CLAIMED[key] ?? OPEN_CELL) }));
            }
          }
          return { shapes, text };
        },
      };
    },
  },
  prize: {
    fill: AMBER,
    radius: 28,
    shadowColor: "rgba(0, 0, 0, 0.4)",
    headline: { color: "#0F172A", px: 76 },
    how: { color: "#422006", weight: 700 },
    layout: {
      kind: "side",
      width: 160,
      gap: 32,
      pad: 40,
      padY: 26,
      minHeight: 172,
      draw: (x, top, height) => ({
        shapes: [rectShape(x + 40, top + (height - 120) / 2, 120, 120, 24, { fill: solid("#0F172A") })],
        text: [textLine("WIN", x + 100, top + height / 2, font(900, 40), AMBER, { letterSpacing: 4, maxWidth: 110, fitMinPx: undefined })],
      }),
    },
  },
  venue: { addressColor: "rgba(255, 255, 255, 0.75)", handleColor: AMBER },
  cta: { fill: "#4ADE80", text: "#03180E", drop: "#166534" },
  followColor: "rgba(255, 255, 255, 0.4)",
  reel: { motion: reelMotion },
};
