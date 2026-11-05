import {
  basketballArt,
  circlePath,
  displayWord,
  emptyBlocks,
  font,
  fromBottom,
  linear,
  linePath,
  pathShape,
  rectShape,
  scaleY,
  strokeOf,
  textLine,
  trophyArt,
  radial,
  type Blocks,
} from "@/lib/promo/promoArt";
import { faded, pointAlong, polylineUpTo, progress } from "@/lib/promo/promoMotion";
import { easeBack } from "@/lib/promo/promoReel";
import type { PromoTheme, ReelMotionFrame } from "@/lib/promo/promoThemeTypes";

// March Madness: bracket lines closing in from both sides, a hardwood court with a basketball; the
// prize is a trophy plaque. Canvas → March Madness. No tournament or league mark (G6).
// Reel (Phase 3): two winners advance through the bracket, one from each side, and meet at a trophy;
// the bracket lights up again as the prize is revealed.

const ORANGE = "#FB923C";
const NIGHT = "#0A1230";

/** One side's bracket (16 → 1 on the Post's 0–650 band), mirrored for the right. */
const bracketPath = (sy: (y: number) => number, mirror: boolean): string => {
  const x = (value: number) => (mirror ? 1080 - value : value);
  const parts: string[] = [];
  for (const [y1, y2] of [[90, 170], [250, 330], [410, 490], [570, 650]]) {
    parts.push(`M ${x(0)} ${sy(y1)} H ${x(90)} V ${sy(y2)} H ${x(0)}`);
  }
  for (const [y1, y2] of [[130, 290], [450, 610]]) parts.push(`M ${x(90)} ${sy(y1)} H ${x(170)} V ${sy(y2)} H ${x(90)}`);
  parts.push(`M ${x(170)} ${sy(210)} H ${x(250)}`, `M ${x(170)} ${sy(530)} H ${x(250)}`);
  parts.push(`M ${x(250)} ${sy(210)} H ${x(300)} V ${sy(530)} H ${x(250)}`);
  return parts.join(" ");
};

type Point = readonly [number, number];

/** A winner's run through one side's bracket (Post coordinates), to the bracket's inner end. */
const LEFT_RUN: readonly Point[] = [[0, 90], [90, 90], [90, 130], [170, 130], [170, 210], [250, 210], [300, 210], [300, 370]];
const RIGHT_RUN: readonly Point[] = [[0, 650], [90, 650], [90, 610], [170, 610], [170, 530], [250, 530], [300, 530], [300, 370]].map(
  ([x, y]) => [1080 - x, y] as const,
);
/** The last step, from the bracket's inner end to beside the trophy. */
const FINAL_GAP = 85;
const TROPHY_Y = 370;
const RUN = { from: 0.2, duration: 1.8 } as const;
const FINAL = { from: 2.0, duration: 0.3 } as const;
const TROPHY_AT = 2.3;

const runsFor = (height: number) => {
  const sy = scaleY(height);
  const place = (points: readonly Point[]) => points.map(([x, y]) => [x, sy(y)] as const);
  const y = sy(TROPHY_Y);
  return {
    runs: [place(LEFT_RUN), place(RIGHT_RUN)],
    finals: [
      [[300, y], [540 - FINAL_GAP, y]],
      [[780, y], [540 + FINAL_GAP, y]],
    ] as const,
    trophyY: y,
  };
};

const glowLine = (d: string): Blocks["shapes"][number] =>
  pathShape(d, { stroke: strokeOf(ORANGE, 10, { cap: "round", join: "round" }), shadowColor: "rgba(251, 146, 60, 0.9)", shadowBlur: 22 });

const reelMotion = ({ t, plan, stage, settle }: ReelMotionFrame): Blocks => {
  const { runs, finals, trophyY } = runsFor(stage.height);
  const shapes: Blocks["shapes"] = [];
  // 1. The winners advance (title beat), then clear away as the title moves up for "when".
  const intro = 1 - progress(t, 2.85, 0.5);
  if (intro > 0.005) {
    const run = progress(t, RUN.from, RUN.duration);
    const last = progress(t, FINAL.from, FINAL.duration);
    const drawn: Blocks["shapes"] = [];
    runs.forEach((points, index) => {
      if (run > 0) drawn.push(glowLine(polylineUpTo(points, run)));
      if (last > 0) drawn.push(glowLine(polylineUpTo(finals[index], last)));
      if (run > 0 && last < 1) {
        const [x, y] = last > 0 ? pointAlong(finals[index], last) : pointAlong(points, run);
        drawn.push(...basketballArt({ x, y, rotate: t * 400 * (index === 0 ? 1 : -1), scale: 0.6 }));
      }
    });
    const pop = progress(t, TROPHY_AT, 0.4);
    if (pop > 0) {
      const scale = 1.1 * easeBack(pop);
      drawn.push(
        pathShape(circlePath(540, trophyY, 200), {
          fill: radial(540, trophyY, 200, [
            [0, "rgba(251, 191, 36, 0.55)"],
            [1, "rgba(251, 191, 36, 0)"],
          ]),
          opacity: Math.min(1, pop * 2),
        }),
        ...trophyArt(540 - 70 * scale, trophyY - 75 * scale, scale),
      );
    }
    shapes.push(...faded({ shapes: drawn, text: [] }, intro).shapes);
  }
  // 2. The whole run lights up again on the prize (or as the end card arrives), then settles away.
  const reveal = plan.prize ? plan.prize[0] : plan.end[0];
  const again = t >= reveal ? Math.max(0.3, 1 - (t - reveal) / 1.2) * (1 - settle) : 0;
  if (again > 0.005) {
    const all = [...runs, ...finals].map((points) => glowLine(polylineUpTo(points, 1)));
    shapes.push(...faded({ shapes: all, text: [] }, again).shapes);
  }
  return shapes.length ? { shapes, text: [] } : emptyBlocks();
};

export const bracketTheme: PromoTheme = {
  background: (_width, height) =>
    linear(0, 0, 0, height, [
      [0, NIGHT],
      [0.6, "#111C46"],
      [1, NIGHT],
    ]),
  backdrop: ({ width, height }) => {
    const sy = scaleY(height);
    const floorTop = fromBottom(height)(880);
    const floorH = height - floorTop;
    const planks: string[] = [];
    for (let x = 90; x < width; x += 110) planks.push(linePath(x, floorTop, x, height));
    return {
      shapes: [
        pathShape(`${bracketPath(sy, false)} ${bracketPath(sy, true)}`, { stroke: strokeOf("rgba(251, 146, 60, 0.35)", 6, { cap: "round" }) }),
        rectShape(0, floorTop, width, floorH, 0, {
          fill: linear(0, 0, width, 0, [
            [0, "#B9773C"],
            [0.5, "#D4955A"],
            [1, "#B9773C"],
          ]),
        }),
        pathShape(planks.join(" "), { stroke: strokeOf("rgba(138, 85, 39, 0.45)", 3) }),
        pathShape(`M 60 ${height} L 60 ${height - 170} A 480 330 0 0 1 1020 ${height - 170} L 1020 ${height}`, {
          stroke: strokeOf("rgba(255, 255, 255, 0.55)", 10),
        }),
        rectShape(0, floorTop, width, floorH, 0, {
          fill: linear(0, floorTop, 0, height, [
            [0, "rgba(10, 18, 48, 1)"],
            [0.35, "rgba(10, 18, 48, 0.55)"],
            [1, "rgba(10, 18, 48, 0.35)"],
          ]),
        }),
        ...basketballArt({ x: 70, y: height - 60, scale: 150 / 42 }),
        ...basketballArt({ x: 1000, y: sy(300), scale: 46 / 42 }, 0.9),
      ],
      text: [],
    };
  },
  brand: { color: "rgba(255, 255, 255, 0.6)", gap: { ideal: 110, min: 24 } },
  title: (lines, scale) => {
    const s = scale;
    const bigPx = 180 * s;
    const bigH = Math.round(bigPx * 0.95);
    const big = (top: number, word: string) =>
      displayWord(word, top + bigH / 2, font(900, bigPx, true), ORANGE, {
        drop: { color: "#9A3412", offset: 8 * s },
        glow: { color: "rgba(251, 146, 60, 0.45)", blur: 40 },
      });
    if (lines.length === 1) return { height: bigH, draw: (top) => ({ shapes: [], text: big(top, lines[0]) }) };
    const smallPx = 136 * s;
    return {
      height: smallPx + bigH,
      draw: (top) => ({
        shapes: [],
        text: [
          textLine(lines[0], 540, top + smallPx / 2, font(900, smallPx), "#FFFFFF", { letterSpacing: 12 * s, fitMinPx: 56 }),
          ...big(top + smallPx, lines[1]),
        ],
      }),
    };
  },
  when: { timeColor: ORANGE, shadow: { color: "rgba(0, 0, 0, 0.6)", blur: 16, offsetY: 4 } },
  prize: {
    fill: NIGHT,
    radius: 28,
    border: { color: ORANGE, width: 6 },
    shadowColor: "rgba(0, 0, 0, 0.5)",
    headline: { color: "#FFFFFF", px: 80 },
    how: { color: "rgba(255, 255, 255, 0.8)", weight: 700 },
    layout: {
      kind: "side",
      width: 180,
      gap: 34,
      pad: 40,
      padY: 30,
      minHeight: 222,
      inlineLabel: { color: ORANGE, letterSpacing: 8 },
      draw: (x, top, height) => ({ shapes: trophyArt(x + 40, top + (height - 150) / 2), text: [] }),
    },
  },
  venue: { addressColor: "rgba(255, 255, 255, 0.85)", handleColor: "#FDBA74", shadow: { color: "rgba(0, 0, 0, 0.6)", blur: 16, offsetY: 4 } },
  cta: { fill: ORANGE, text: NIGHT, drop: "#9A3412" },
  followColor: "rgba(255, 255, 255, 0.55)",
  reel: { motion: reelMotion },
};
