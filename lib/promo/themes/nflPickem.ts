import {
  circlePath,
  displayWord,
  emptyBlocks,
  font,
  footballArt,
  fromBottom,
  linear,
  linePath,
  pathShape,
  polygonPath,
  rectShape,
  scaleY,
  solid,
  strokeOf,
  textLine,
  radial,
  type Blocks,
} from "@/lib/promo/promoArt";
import { flash, faded } from "@/lib/promo/promoMotion";
import type { PromoTheme, ReelMotionFrame } from "@/lib/promo/promoThemeTypes";

// NFL Pick 'Em: a stadium at night, light towers and their beams over the turf; footballs, not helmets
// (game-themes-plan G3), and no league mark (G6). The prize card has a red WIN bar. Canvas → NFL Pick 'Em.
// Reel (Phase 3): the stadium starts dark and the light towers clunk on, one then the other, with camera
// flashes in the stands through the beats.

const BLUE = "#2563EB";
const LIGHT_BLUE = "#93C5FD";

const BULB_ROWS = [96, 138];

const tower = (x: number, poleX: number) => ({
  shapes: [
    rectShape(x, 70, 170, 96, 10, { fill: solid("#1E293B") }),
    pathShape(BULB_ROWS.flatMap((y) => [0, 1, 2, 3].map((i) => circlePath(x + 30 + i * 36, y, 13))).join(" "), { fill: solid("#F8FAFC") }),
    rectShape(poleX, 166, 14, 300, 0, { fill: solid("#1E293B") }),
  ],
});

const CROWD: readonly (readonly [number, number, number])[] = [
  [90, 610, 3],
  [240, 560, 4],
  [400, 530, 3],
  [620, 525, 4],
  [790, 550, 3],
  [960, 600, 4],
  [330, 600, 3],
  [700, 590, 3],
];

/** The bulb banks' centres (the towers' heads), and when each switches on. */
const TOWERS: readonly { x: number; y: number; on: number }[] = [
  { x: 125, y: 118, on: 0.3 },
  { x: 955, y: 118, on: 0.72 },
];

/** A light switching on: a flicker (on, off, on), then on for good. */
const lit = (t: number, at: number): number => {
  if (t < at) return 0;
  if (t < at + 0.06) return 1;
  if (t < at + 0.12) return 0.25;
  return 1;
};

/** Spots in the stands (Post coordinates) where a camera flashes, in turn. */
const FLASH_SPOTS: readonly (readonly [number, number])[] = [
  [180, 590],
  [760, 545],
  [450, 520],
  [960, 610],
  [300, 560],
  [640, 600],
  [90, 640],
  [860, 575],
  [540, 535],
];
const FLASH_EVERY = 0.23;

const reelMotion = ({ t, stage, settle }: ReelMotionFrame): Blocks => {
  const { width, height } = stage;
  const fade = 1 - settle;
  if (fade <= 0.005) return emptyBlocks();
  const [left, right] = TOWERS.map((tower) => lit(t, tower.on));
  const shade = (on: number) => `rgba(2, 6, 23, ${0.8 * (1 - on)})`;
  const dark =
    left < 1 || right < 1
      ? [
          rectShape(0, 0, width, height, 0, {
            fill: linear(0, 0, width, 0, [
              [0, shade(left)],
              [0.5, shade((left + right) / 2)],
              [1, shade(right)],
            ]),
          }),
        ]
      : [];
  const flares = TOWERS.map((tower, index) => {
    const on = index === 0 ? left : right;
    const burst = flash(t, tower.on, 0.02, 0.7);
    return pathShape(circlePath(0, 0, 320), {
      fill: radial(0, 0, 320, [
        [0, "rgba(240, 249, 255, 0.95)"],
        [0.22, "rgba(147, 197, 253, 0.4)"],
        [1, "rgba(147, 197, 253, 0)"],
      ]),
      transform: { x: tower.x, y: tower.y, scale: 0.75 + 0.35 * burst },
      opacity: on * (0.4 + 0.6 * burst + 0.06 * Math.sin(t * 5 + index)),
    });
  });
  const standsDy = scaleY(height)(560) - 560;
  const index = Math.floor(t / FLASH_EVERY);
  const [fx, fy] = FLASH_SPOTS[index % FLASH_SPOTS.length];
  const pop = right >= 1 ? flash(t, index * FLASH_EVERY, 0.02, 0.16) : 0;
  const camera = pop > 0.01
    ? [pathShape(circlePath(0, 0, 40), {
        fill: radial(0, 0, 40, [
          [0, "rgba(255, 255, 255, 1)"],
          [0.3, "rgba(255, 255, 255, 0.6)"],
          [1, "rgba(255, 255, 255, 0)"],
        ]),
        transform: { x: fx, y: fy + standsDy, scale: 0.6 + 0.4 * pop },
        opacity: pop,
      })]
    : [];
  return { shapes: [...dark, ...faded({ shapes: [...flares, ...camera], text: [] }, fade).shapes], text: [] };
};

export const nflPickemTheme: PromoTheme = {
  background: (_width, height) =>
    linear(0, 0, 0, height, [
      [0, "#050A1F"],
      [0.55, "#0B1A45"],
      [1, "#0A1636"],
    ]),
  backdrop: ({ width, height }) => {
    const sy = scaleY(height);
    const turfTop = fromBottom(height)(1060);
    const beamEnd = turfTop + 40;
    const beam = [
      [0, "rgba(224, 242, 254, 0.32)"],
      [1, "rgba(224, 242, 254, 0)"],
    ] as const;
    const standsDy = sy(560) - 560;
    return {
      shapes: [
        pathShape(polygonPath([[40, 150], [200, 120], [760, beamEnd], [200, beamEnd]]), { fill: linear(40, 120, 400, beamEnd, beam) }),
        pathShape(polygonPath([[880, 120], [1040, 150], [880, beamEnd], [320, beamEnd]]), { fill: linear(1040, 120, 680, beamEnd, beam) }),
        ...tower(40, 116).shapes,
        ...tower(870, 950).shapes,
        pathShape(`M 0 ${560 + standsDy} Q 540 ${430 + standsDy} 1080 ${560 + standsDy} L 1080 ${700 + standsDy} Q 540 ${590 + standsDy} 0 ${700 + standsDy} Z`, {
          fill: solid("#0F1F4D"),
          opacity: 0.8,
        }),
        pathShape(CROWD.map(([x, y, r]) => circlePath(x, y + standsDy, r)).join(" "), { fill: solid("#FFFFFF"), opacity: 0.55 }),
        pathShape(polygonPath([[250, turfTop], [830, turfTop], [width, height], [0, height]]), {
          fill: linear(0, turfTop, 0, height, [
            [0, "#15803D"],
            [1, "#052E16"],
          ]),
        }),
        pathShape(
          [
            linePath(215, turfTop + 40, 865, turfTop + 40),
            linePath(160, turfTop + 105, 920, turfTop + 105),
            linePath(90, turfTop + 190, 990, turfTop + 190),
          ].join(" "),
          { stroke: strokeOf("rgba(255, 255, 255, 0.35)", 5) },
        ),
        rectShape(0, turfTop, width, height - turfTop, 0, { fill: solid("#050A1F"), opacity: 0.35 }),
      ],
      text: [],
    };
  },
  brand: { color: "rgba(255, 255, 255, 0.6)", gap: { ideal: 150, min: 24 } },
  title: (lines, scale, measure) => {
    const s = scale;
    // 184, not the mockup's 200, so the italic "PICK 'EM" keeps a margin at both edges.
    const bigPx = 184 * s;
    const bigH = Math.round(bigPx * 0.95);
    const big = (top: number, word: string) =>
      displayWord(word, top + bigH / 2, font(900, bigPx, true), "#FFFFFF", {
        drop: { color: "#1E3A8A", offset: 10 * s },
        glow: { color: "rgba(96, 165, 250, 0.6)", blur: 40 },
      });
    if (lines.length === 1) return { height: bigH, draw: (top) => ({ shapes: [], text: big(top, lines[0]) }) };
    const badgePx = 96 * s;
    const badgeSpacing = 6 * s;
    const badgeFont = font(900, badgePx);
    const badgeW = Math.min(560, measure(lines[0], badgeFont) + badgeSpacing * lines[0].length + 76 * s);
    const badgeH = 112 * s;
    const rowH = 120 * s;
    const gap = 10 * s;
    return {
      height: rowH + gap + bigH,
      draw: (top) => {
        const cy = top + rowH / 2;
        const ballOffset = badgeW / 2 + 28 * s + 75 * s;
        return {
          shapes: [
            ...footballArt({ x: 540 - ballOffset, y: cy, rotate: -24, scale: 1.5 * s }),
            ...footballArt({ x: 540 + ballOffset, y: cy, rotate: 24, scale: 1.5 * s }),
            rectShape(540 - badgeW / 2, cy - badgeH / 2 + 8 * s, badgeW, badgeH, 26 * s, { fill: solid("#1E3A8A") }),
            rectShape(540 - badgeW / 2, cy - badgeH / 2, badgeW, badgeH, 26 * s, { fill: solid(BLUE) }),
          ],
          text: [
            textLine(lines[0], 540, cy, badgeFont, "#FFFFFF", { letterSpacing: badgeSpacing, maxWidth: badgeW - 40 * s, fitMinPx: 56 }),
            ...big(top + rowH + gap, lines[1]),
          ],
        };
      },
    };
  },
  when: { timeColor: LIGHT_BLUE, shadow: { color: "rgba(0, 0, 0, 0.6)", blur: 16, offsetY: 4 } },
  prize: {
    fill: "#FFFFFF",
    radius: 28,
    shadowColor: "rgba(0, 0, 0, 0.5)",
    headline: { color: "#0F172A", px: 86 },
    how: { color: "#1D4ED8", weight: 800 },
    layout: { kind: "header", height: 66, fill: "#DC2626", labelColor: "#FFFFFF" },
  },
  venue: { addressColor: "rgba(255, 255, 255, 0.8)", handleColor: LIGHT_BLUE, shadow: { color: "rgba(0, 0, 0, 0.6)", blur: 16, offsetY: 4 } },
  cta: { fill: "#FFFFFF", text: "#0B1A45", drop: BLUE },
  followColor: "rgba(255, 255, 255, 0.5)",
  reel: { motion: reelMotion },
};
