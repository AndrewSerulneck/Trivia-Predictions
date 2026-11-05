import {
  displayWord,
  font,
  footballArt,
  glyph,
  linear,
  linePath,
  pathShape,
  radial,
  rectShape,
  soccerBallArt,
  solid,
  strokeOf,
  type Blocks,
} from "@/lib/promo/promoArt";
import { progress, quadAt } from "@/lib/promo/promoMotion";
import { easeOut, lerp } from "@/lib/promo/promoReel";
import type { PromoTheme, ReelMotionFrame, ThemeStage } from "@/lib/promo/promoThemeTypes";

// Pick 'Em (college + more): a mowed football field from above, a football and a soccer ball
// (game-themes-plan G3: more than one sport); the prize is a scoreboard. Canvas → Pick 'Em (college).
// Reel (Phase 3): a football is thrown across the field and a soccer ball bounces by; as the end card
// settles both fly into their places above the title (the beats run on the field without them).

const GOLD = "#FACC15";
const NAVY = "#0B1220";
const STRIPE = 112;

/** The title row's top, so the balls sit just above its letters (the Post mockup's title starts at 252). */
const titleTopOf = (stage: ThemeStage): number => stage.rows.find((row) => row.id === "title")?.top ?? 252;

type Ball = { x: number; y: number };

/** The football and soccer ball's places in the picture: just above the title's letters, smaller when the band is short. */
const ballPlaces = (stage: ThemeStage) => {
  // The balls sit in the band above the title's letters (~21 px under the row's top), shrinking
  // when the band is short: the soccer ball clear of the letters, the football's tip just touching.
  const lettersTop = titleTopOf(stage) + 21;
  const k = Math.min(1, Math.max(0.45, (lettersTop - 12) / 172));
  const soccer: Ball = { x: 130 - 30 * (1 - k), y: Math.max(86 * k + 8, lettersTop - 86 * k - 4) };
  const football: Ball = { x: 920 + 40 * (1 - k), y: Math.max(90 * k + 8, lettersTop - 70 * k) };
  return { k, soccer, football };
};

const SOCCER_TURN = 14;
const FOOTBALL_TURN = -28;
const FOOTBALL_FILL = radial(-14, -11, 61, [
  [0, "#B45309"],
  [1, "#78350F"],
]);

/**
 * The two balls with their speed lines. `at` moves them (the Reel's fly-in); without it they stand
 * where the picture has them, and these are exactly the backdrop's ball blocks.
 */
const ballsOf = (
  stage: ThemeStage,
  at?: { soccer: Ball; football: Ball; soccerTurn: number; lines: number },
): Blocks => {
  const place = ballPlaces(stage);
  const { k } = place;
  const soccer = at?.soccer ?? place.soccer;
  const football = at?.football ?? place.football;
  const lineOpacity = at && at.lines < 0.999 ? at.lines : undefined;
  /** Speed lines behind a ball, drawn relative to its centre on the mockup and scaled with it. */
  const motion = (ball: Ball, from: Ball, lines: readonly (readonly [number, number, number, number])[], widthPx: number) =>
    pathShape(lines.map(([x1, y1, x2, y2]) => linePath(x1 - from.x, y1 - from.y, x2 - from.x, y2 - from.y)).join(" "), {
      stroke: strokeOf("rgba(255, 255, 255, 0.5)", widthPx, { cap: "round" }),
      transform: { x: ball.x, y: ball.y, scale: k },
      ...(lineOpacity !== undefined ? { opacity: lineOpacity } : {}),
    });
  return {
    shapes: [
      motion(football, { x: 920, y: 230 }, [[700, 300, 790, 262], [690, 340, 800, 296], [720, 372, 790, 344]], 8),
      motion(soccer, { x: 130, y: 150 }, [[232, 196, 300, 222], [222, 226, 280, 250]], 7),
      ...soccerBallArt({ ...soccer, rotate: at?.soccerTurn ?? SOCCER_TURN, scale: (86 / 30) * k }),
      ...footballArt({ ...football, rotate: FOOTBALL_TURN, scale: (128 / 48) * k }, FOOTBALL_FILL),
    ],
    text: [],
  };
};

/** The mowed field with its yard lines and numbers: the backdrop without the balls. */
const fieldOf = (stage: ThemeStage): Blocks => {
  const { width, height } = stage;
  const yardLines: number[] = [];
  for (let y = STRIPE; y < height; y += STRIPE * 2) yardLines.push(y);
  // Field numbers on the yard lines in the top part, 50 in the middle: "4 0 · 5 0 · 4 0" on the Post.
  const numbered = yardLines.filter((y) => y >= STRIPE * 3 && y <= height - 560);
  const mid = (numbered.length - 1) / 2;
  const label = (index: number) => {
    const tens = Math.max(1, 5 - Math.round(Math.abs(index - mid)));
    return `${tens} 0`;
  };
  return {
    shapes: [
      ...yardLines.map((y) => rectShape(0, y, width, STRIPE, 0, { fill: solid("#15803D") })),
      pathShape(yardLines.map((y) => linePath(0, y, width, y)).join(" "), { stroke: strokeOf("rgba(255, 255, 255, 0.4)", 6) }),
      pathShape(
        yardLines
          .filter((y) => y + 136 < height)
          .flatMap((y) => [linePath(360, y + 88, 360, y + 136), linePath(720, y + 88, 720, y + 136)])
          .join(" "),
        { stroke: strokeOf("rgba(255, 255, 255, 0.3)", 5) },
      ),
      rectShape(0, 0, width, height, 0, {
        fill: linear(0, 0, 0, height, [
          [0, "rgba(3, 20, 10, 0.7)"],
          [0.35, "rgba(3, 20, 10, 0.25)"],
          [0.7, "rgba(3, 20, 10, 0.3)"],
          [1, "rgba(3, 20, 10, 0.75)"],
        ]),
      }),
    ],
    text: numbered.flatMap((y, index) => [
      glyph(label(index), 70, y, 72, "#FFFFFF", { rotate: 90, opacity: 0.32 }),
      glyph(label(index), 1010, y, 72, "#FFFFFF", { rotate: -90, opacity: 0.32 }),
    ]),
  };
};

// ── The Reel ──

/** The pass: thrown from off the bottom-left, over the field, out to the right. */
const PASS = { from: 0.15, duration: 1.35, a: [-200, 1520], c: [520, 220], b: [1300, 760] } as const;
/** The soccer ball: kicked in from the right, bouncing along the bottom and out to the left. */
const KICK = { from: 1.15, duration: 1.5, y: 1580, hop: 170 } as const;

const passingFootball = (t: number): Blocks => {
  const k = progress(t, PASS.from, PASS.duration);
  if (k <= 0 || k >= 1) return { shapes: [], text: [] };
  const [x, y] = quadAt(PASS.a, PASS.c, PASS.b, k);
  const [nx, ny] = quadAt(PASS.a, PASS.c, PASS.b, Math.min(1, k + 0.01));
  const heading = Math.atan2(ny - y, nx - x);
  return {
    shapes: [
      pathShape([linePath(-150, -16, -80, -12), linePath(-175, 6, -90, 4), linePath(-140, 26, -86, 20)].join(" "), {
        stroke: strokeOf("rgba(255, 255, 255, 0.55)", 9, { cap: "round" }),
        transform: { x, y, rotate: heading },
      }),
      ...footballArt({ x, y, rotate: (heading * 180) / Math.PI, scale: 2.3 }, FOOTBALL_FILL),
    ],
    text: [],
  };
};

const kickedSoccerBall = (t: number): Blocks => {
  const k = progress(t, KICK.from, KICK.duration);
  if (k <= 0 || k >= 1) return { shapes: [], text: [] };
  const x = lerp(1260, -180, k);
  const y = KICK.y - Math.abs(Math.sin(k * Math.PI * 2.5)) * KICK.hop * (1 - 0.5 * k);
  return { shapes: soccerBallArt({ x, y, rotate: -k * 1000, scale: 86 / 30 }), text: [] };
};

const reelMotion = ({ t, stage, settle }: ReelMotionFrame): Blocks => {
  const pass = passingFootball(t);
  const kick = kickedSoccerBall(t);
  if (settle <= 0) return { shapes: [...pass.shapes, ...kick.shapes], text: [] };
  // The end card settles: both balls fly into their places, the soccer ball still spinning.
  const { soccer, football } = ballPlaces(stage);
  const k = easeOut(settle);
  return ballsOf(stage, {
    football: { x: lerp(football.x - 640, football.x, k), y: lerp(football.y + 420, football.y, k) },
    soccer: { x: lerp(soccer.x + 560, soccer.x, k), y: lerp(soccer.y + 320, soccer.y, k) },
    soccerTurn: SOCCER_TURN + 540 * (1 - k),
    lines: k,
  });
};

export const pickemTheme: PromoTheme = {
  background: () => solid("#166534"),
  backdrop: (stage) => {
    const field = fieldOf(stage);
    return { shapes: [...field.shapes, ...ballsOf(stage).shapes], text: field.text };
  },
  brand: { color: "rgba(255, 255, 255, 0.7)", gap: { ideal: 150, min: 24 } },
  title: (lines, scale) => {
    const s = scale;
    // 200, not the mockup's 230: at 230 "PICK 'EM" runs edge to edge on one line.
    const px = 200 * s;
    const lineH = Math.round(px * 0.95);
    const words = lines.length === 1 ? [lines[0]] : [...lines];
    const swooshGap = 6 * s;
    const swooshH = 40 * s;
    const textH = lineH * words.length;
    return {
      height: textH + swooshGap + swooshH,
      draw: (top) => ({
        shapes: [
          pathShape("M 10 28 Q 380 4 750 22", {
            stroke: strokeOf(GOLD, 16, { cap: "round" }),
            transform: { x: 540 - 380 * s, y: top + textH + swooshGap, scale: s },
          }),
        ],
        text: words.flatMap((word, index) =>
          displayWord(word, top + lineH * index + lineH / 2, font(900, px, true), "#FFFFFF", {
            drop: { color: "#052E16", offset: 10 * s },
            glow: { color: "rgba(0, 0, 0, 0.5)", blur: 40, offsetY: 18 },
          }),
        ),
      }),
    };
  },
  when: { timeColor: GOLD, shadow: { color: "rgba(0, 0, 0, 0.5)", blur: 16, offsetY: 4 } },
  prize: {
    fill: NAVY,
    radius: 28,
    border: { color: GOLD, width: 6 },
    shadowColor: "rgba(0, 0, 0, 0.5)",
    headline: { color: "#FFFFFF", px: 86 },
    how: { color: GOLD, weight: 800 },
    layout: { kind: "header", height: 68, fill: GOLD, labelColor: NAVY, dots: true },
  },
  venue: { addressColor: "rgba(255, 255, 255, 0.8)", handleColor: GOLD, shadow: { color: "rgba(0, 0, 0, 0.5)", blur: 16, offsetY: 4 } },
  cta: { fill: GOLD, text: NAVY, drop: "#A16207" },
  followColor: "rgba(255, 255, 255, 0.5)",
  reel: { beatBackdrop: fieldOf, motion: reelMotion },
};
