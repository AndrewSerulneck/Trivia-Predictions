import {
  CARD_SHADOW,
  deg,
  displayWord,
  ellipseGlow,
  font,
  glyph,
  pathShape,
  polygonPath,
  rectShape,
  scaleY,
  solid,
  textLine,
  type Blocks,
} from "@/lib/promo/promoArt";
import { PRIZE_PANEL_WIDTH, PRIZE_PANEL_X } from "@/lib/promo/promoPrizePanel";
import { faded, progress } from "@/lib/promo/promoMotion";
import { easeOut, lerp } from "@/lib/promo/promoReel";
import type { PromoTheme, ReelMotionFrame } from "@/lib/promo/promoThemeTypes";

// Category Blitz: letter tiles on green felt, lightning bolts; no prizes, so the picture shows a sample
// round card (a letter, three blank categories, the 3:00 timer). Canvas → Category Blitz.
// Reel (Phase 3): a letter die tumbles in and lands on B, then becomes the round card's B tile.

const GREEN = "#4ADE80";
const CREAM = "#FEF9E7";
const INK = "#065F46";
const DARK = "#04190F";
const BOLT = "#FDE047";

/** [x, y (Post), half size, corner, degrees, opacity, tile, letter, letter colour]. */
const SCATTERED: readonly (readonly [number, number, number, number, number, number, string, string, string])[] = [
  [110, 250, 60, 22, -16, 0.55, CREAM, "S", INK],
  [975, 210, 70, 26, 14, 0.5, CREAM, "M", INK],
  [60, 760, 50, 18, 10, 0.35, CREAM, "T", INK],
  [1025, 760, 52, 18, -12, 0.35, CREAM, "P", INK],
  [150, 1210, 56, 20, 18, 0.3, GREEN, "C", DARK],
  [940, 1190, 48, 18, -20, 0.3, GREEN, "R", DARK],
  [250, 90, 36, 14, 8, 0.25, GREEN, "A", DARK],
];

const BOLTS: readonly { points: readonly (readonly [number, number])[]; opacity: number }[] = [
  { points: [[905, 470], [845, 610], [900, 610], [860, 720], [975, 560], [915, 560], [960, 470]], opacity: 0.8 },
  { points: [[150, 430], [110, 520], [145, 520], [120, 590], [195, 488], [158, 488], [188, 430]], opacity: 0.55 },
];

const TILE_TURNS = [-4, 3, -2, 4, -3, 2, -4, 3];

/** A letter tile turned about its centre, with the solid edge under it (CSS `box-shadow: 0 Npx 0`). */
const tile = (
  cx: number,
  cy: number,
  w: number,
  h: number,
  corner: number,
  rotate: number,
  colors: { tile: string; edge: string; letter: string },
  letter: string,
  letterPx: number,
  edge: number,
): Blocks => {
  const transform = { x: cx, y: cy, rotate: deg(rotate) };
  return {
    shapes: [
      rectShape(-w / 2, -h / 2 + edge, w, h, corner, { fill: solid(colors.edge), transform }),
      rectShape(-w / 2, -h / 2, w, h, corner, { fill: solid(colors.tile), transform }),
    ],
    text: [textLine(letter, cx, cy, font(900, letterPx), colors.letter, { rotate: deg(rotate), maxWidth: w * 1.4, fitMinPx: undefined })],
  };
};

const CATEGORIES = ["A drink", "A movie", "A city"];

const ROUND_LETTER = "B";
const ROUND_TILE = { tile: GREEN, edge: "#15803D", letter: DARK } as const;
const ROUND_TILE_TURN = -6;
const PILL_LIFT = 30;

/** The sample round card's measurements at `scale` (the end card's fit level), shared by the card and the Reel's die. */
const roundCard = (scale: number) => {
  const s = Math.max(0.8, scale);
  const pad = 34 * s;
  const tileSize = 190 * s;
  const cardH = pad * 2 + tileSize;
  return { s, tileSize, cardH, height: PILL_LIFT + cardH };
};

/** The round card's letter tile, from the row's top and height: where the Reel's die lands. */
const roundTileOf = (rowTop: number, rowHeight: number) => {
  const s = (rowHeight - PILL_LIFT) / 258; // = roundCard(s).height, solved for s.
  const { tileSize, cardH } = roundCard(s);
  return { cx: PRIZE_PANEL_X + 40 + tileSize / 2, cy: rowTop + PILL_LIFT + cardH / 2, size: tileSize, s };
};

// ── The Reel's die ──

const DIE = 200;
const FLOOR_Y = 1500;
const ENTRY = { t: 0, x: -160, y: 980 };
/** Where it hits the floor: [time s, x]; it hops less after each hit and rests at the last. */
const IMPACTS: readonly (readonly [number, number])[] = [
  [0.5, 200],
  [0.95, 360],
  [1.32, 470],
  [1.6, 540],
];
const HOPS = [240, 120, 50];
/** The face that comes up at each hit: the last is the round's letter. */
const FACES = ["S", "R", "M", "T", ROUND_LETTER];
const SPIN_RAD = 7 * Math.PI;

const dieAt = (t: number): { x: number; y: number; turn: number; face: string } => {
  const rest = IMPACTS[IMPACTS.length - 1];
  const turn = ROUND_TILE_TURN + (SPIN_RAD * (180 / Math.PI)) * (1 - easeOut(t / rest[0]));
  const hits = IMPACTS.filter(([at]) => t >= at).length;
  const face = FACES[hits];
  if (t < IMPACTS[0][0]) {
    const k = t / IMPACTS[0][0];
    return { x: lerp(ENTRY.x, IMPACTS[0][1], k), y: lerp(ENTRY.y, FLOOR_Y, k * k), turn, face };
  }
  if (t >= rest[0]) return { x: rest[1], y: FLOOR_Y, turn: ROUND_TILE_TURN, face };
  const index = hits - 1;
  const [from, x1] = IMPACTS[index];
  const [to, x2] = IMPACTS[index + 1];
  const k = (t - from) / (to - from);
  return { x: lerp(x1, x2, k), y: FLOOR_Y - HOPS[index] * 4 * k * (1 - k), turn, face };
};

const reelMotion = ({ t, stage, settle }: ReelMotionFrame): Blocks => {
  if (settle >= 0.999) return { shapes: [], text: [] };
  const die = dieAt(t);
  const art = stage.rows.find((row) => row.id === "art");
  const target = art ? roundTileOf(art.top, art.height) : null;
  // As the end card settles the die flies into the round card's tile (or fades if there is no card).
  const k = target ? easeOut(settle) : 0;
  const size = target ? lerp(DIE, target.size, k) : DIE;
  const x = target ? lerp(die.x, target.cx, k) : die.x;
  const y = target ? lerp(die.y, target.cy, k) : die.y;
  const edge = target ? lerp(12, 10 * target.s, k) : 12;
  const blocks = tile(x, y, size, size, size * 0.18, die.turn, ROUND_TILE, die.face, size * 0.79, edge);
  return faded(blocks, progress(t, 0, 0.12) * (target ? 1 : 1 - settle));
};

export const categoryBlitzTheme: PromoTheme = {
  background: () => solid(DARK),
  backdrop: ({ width, height }) => {
    const sy = scaleY(height);
    return {
      shapes: [
        ellipseGlow(width, height, { cx: 0.5, cy: 0.3, rx: 1.1, ry: 0.8 }, [
          [0, "#0F5132"],
          [0.55, "#083323"],
          [1, DARK],
        ]),
        ...SCATTERED.map(([x, y, half, corner, rotate, opacity, fill]) =>
          rectShape(-half, -half, half * 2, half * 2, corner, { fill: solid(fill), opacity, transform: { x, y: sy(y), rotate: deg(rotate) } }),
        ),
        ...BOLTS.map(({ points, opacity }) => {
          const dy = sy(points[0][1]) - points[0][1];
          return pathShape(polygonPath(points.map(([x, y]) => [x, y + dy] as const)), { fill: solid(BOLT), opacity });
        }),
      ],
      text: SCATTERED.map(([x, y, half, , rotate, opacity, , letter, color]) => glyph(letter, x, sy(y), half * 1.53, color, { rotate, opacity })),
    };
  },
  brand: { color: "rgba(255, 255, 255, 0.6)", gap: { ideal: 40, min: 24 } },
  title: (lines, scale) => {
    const s = scale;
    const bigPx = 210 * s;
    const bigH = Math.round(bigPx * 0.95);
    const big = (top: number, word: string) =>
      displayWord(word, top + bigH / 2, font(900, bigPx, true), GREEN, {
        drop: { color: "#166534", offset: 8 * s },
        glow: { color: "rgba(74, 222, 128, 0.45)", blur: 40 },
        letterSpacing: 4 * s,
      });
    if (lines.length === 1) return { height: bigH, draw: (top) => ({ shapes: [], text: big(top, lines[0]) }) };
    const letters = [...lines[0].replace(/\s+/g, "")];
    const gap = 10 * s;
    const tileW = Math.min(98 * s, (960 - gap * (letters.length - 1)) / letters.length);
    const tileH = tileW * (108 / 98);
    const rowW = letters.length * tileW + (letters.length - 1) * gap;
    const between = 14 * s;
    return {
      height: tileH + between + bigH,
      draw: (top) => {
        const tiles = letters.map((letter, index) =>
          tile(
            540 - rowW / 2 + index * (tileW + gap) + tileW / 2,
            top + tileH / 2,
            tileW,
            tileH,
            tileW * 0.18,
            TILE_TURNS[index % TILE_TURNS.length],
            { tile: CREAM, edge: "#A7C4B3", letter: INK },
            letter,
            tileW * 0.82,
            8 * s,
          ),
        );
        return {
          shapes: tiles.flatMap((part) => part.shapes),
          text: [...tiles.flatMap((part) => part.text), ...big(top + tileH + between, lines[1])],
        };
      },
    };
  },
  when: { timeColor: BOLT },
  art: {
    show: "without-prize",
    row: (scale, measure) => {
      const { s, tileSize, cardH, height } = roundCard(scale);
      return {
        height,
        draw: (rowTop) => {
          const top = rowTop + PILL_LIFT;
          const x = PRIZE_PANEL_X;
          const big = tile(x + 40 + tileSize / 2, top + cardH / 2, tileSize, tileSize, 34 * s, ROUND_TILE_TURN, ROUND_TILE, ROUND_LETTER, 150 * s, 10 * s);
          const textX = x + 40 + tileSize + 36;
          const right = x + PRIZE_PANEL_WIDTH - 40;
          const lineGap = 66 * s;
          const categoryFont = font(800, 40);
          const rows = CATEGORIES.map((category, index) => {
            const cy = top + cardH / 2 + (index - 1) * lineGap;
            const start = textX + measure(category, categoryFont) + 14;
            return {
              text: textLine(category, textX, cy, categoryFont, "#0F172A", { align: "left", maxWidth: right - textX }),
              line: rectShape(start, cy + 14, Math.max(0, right - start), 4, 2, { fill: solid("#94A3B8") }),
            };
          });
          const timer = "3:00";
          const timerFont = font(900, 40);
          const pillW = measure(timer, timerFont) + 52;
          const pillCx = x + PRIZE_PANEL_WIDTH + 18 - pillW / 2;
          const pillCy = rowTop + 36;
          return {
            shapes: [
              rectShape(x, top, PRIZE_PANEL_WIDTH, cardH, 30, { fill: solid(CREAM), ...CARD_SHADOW, shadowColor: "rgba(0, 0, 0, 0.4)" }),
              ...big.shapes,
              ...rows.map((row) => row.line),
              rectShape(-pillW / 2, -36, pillW, 72, 36, { fill: solid(BOLT), transform: { x: pillCx, y: pillCy, rotate: deg(6) } }),
            ],
            text: [
              ...big.text,
              ...rows.map((row) => row.text),
              textLine(timer, pillCx, pillCy, timerFont, DARK, { rotate: deg(6), maxWidth: pillW, fitMinPx: undefined }),
            ],
          };
        },
      };
    },
  },
  // Category Blitz has no prizes today (promoTemplates prizeGameTypes: []); a cream scorecard if it ever does.
  prize: {
    fill: CREAM,
    radius: 30,
    shadowColor: "rgba(0, 0, 0, 0.4)",
    headline: { color: "#0F172A", px: 86 },
    how: { color: "#166534", weight: 800 },
    layout: { kind: "header", height: 66, fill: GREEN, labelColor: DARK },
  },
  venue: { addressColor: "rgba(255, 255, 255, 0.75)", handleColor: GREEN },
  cta: { fill: GREEN, text: DARK, drop: "#166534" },
  followColor: "rgba(255, 255, 255, 0.4)",
  reel: { motion: reelMotion },
};
