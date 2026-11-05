import type { StoryFill, StoryShapeBlock, StoryStroke, StoryTextBlock, StoryTransform } from "@/lib/socialShare/contracts";
import { STORY_TEXT_FLOOR_PX } from "@/lib/socialShare/shareDesigns";

// Drawing helpers for the game-themed Share to social pictures (docs/game-themes-plan.md Phase 2).
// Pure: they build StoryShapeBlock / StoryTextBlock data for the one share renderer
// (lib/socialShare/storyCanvas.ts). Coordinates are the 1080-wide picture's pixels. Artwork is generic
// (balls, boards, courts): never a team's, league's or event's mark (game-themes-plan G6).

export type Blocks = { shapes: StoryShapeBlock[]; text: StoryTextBlock[] };

export const emptyBlocks = (): Blocks => ({ shapes: [], text: [] });

export const mergeBlocks = (...parts: readonly Blocks[]): Blocks => ({
  shapes: parts.flatMap((part) => part.shapes),
  text: parts.flatMap((part) => part.text),
});

export const BODY_FONT = "var(--ht-font-body), Arial, sans-serif";

/** A canvas font string in Nunito. `italic` is drawn oblique (the app loads Nunito's upright face only). */
export const font = (weight: number, px: number, italic = false): string =>
  `${italic ? "italic " : ""}${weight} ${Math.round(px)}px ${BODY_FONT}`;

export const deg = (degrees: number): number => (degrees * Math.PI) / 180;

export const withAlpha = (hex: string, alpha: number): string => {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// ── Fills ──

type Stops = readonly (readonly [number, string])[];

const stopsOf = (stops: Stops) => stops.map(([offset, color]) => ({ offset, color }));

export const solid = (color: string): StoryFill => ({ kind: "solid", color });

export const linear = (x0: number, y0: number, x1: number, y1: number, stops: Stops): StoryFill => ({
  kind: "linear",
  x0,
  y0,
  x1,
  y1,
  stops: stopsOf(stops),
});

export const radial = (cx: number, cy: number, r: number, stops: Stops): StoryFill => ({ kind: "radial", cx, cy, r, stops: stopsOf(stops) });

// ── Paths (SVG path data) ──

const n = (value: number): string => String(Math.round(value * 100) / 100);

export const circlePath = (cx: number, cy: number, r: number): string => ellipsePath(cx, cy, r, r);

export const ellipsePath = (cx: number, cy: number, rx: number, ry: number): string =>
  `M ${n(cx - rx)} ${n(cy)} A ${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)} A ${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)} Z`;

export const polygonPath = (points: readonly (readonly [number, number])[]): string =>
  `${points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${n(x)} ${n(y)}`).join(" ")} Z`;

export const linePath = (x1: number, y1: number, x2: number, y2: number): string => `M ${n(x1)} ${n(y1)} L ${n(x2)} ${n(y2)}`;

export const roundedRectPath = (x: number, y: number, width: number, height: number, radius: number): string => {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  return [
    `M ${n(x + r)} ${n(y)}`,
    `H ${n(x + width - r)}`,
    `A ${n(r)} ${n(r)} 0 0 1 ${n(x + width)} ${n(y + r)}`,
    `V ${n(y + height - r)}`,
    `A ${n(r)} ${n(r)} 0 0 1 ${n(x + width - r)} ${n(y + height)}`,
    `H ${n(x + r)}`,
    `A ${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + height - r)}`,
    `V ${n(y + r)}`,
    `A ${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}`,
    "Z",
  ].join(" ");
};

/** A rounded rect with only its top corners rounded (a card's header bar). */
export const topRoundedRectPath = (x: number, y: number, width: number, height: number, radius: number): string => {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  return [
    `M ${n(x)} ${n(y + height)}`,
    `V ${n(y + r)}`,
    `A ${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}`,
    `H ${n(x + width - r)}`,
    `A ${n(r)} ${n(r)} 0 0 1 ${n(x + width)} ${n(y + r)}`,
    `V ${n(y + height)}`,
    "Z",
  ].join(" ");
};

/** A ticket: a rounded rect with a half-round notch bitten out of each side, centred on `notchY`. */
export const ticketPath = (x: number, y: number, width: number, height: number, radius: number, notchR: number): string => {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const cy = y + height / 2;
  return [
    `M ${n(x + r)} ${n(y)}`,
    `H ${n(x + width - r)}`,
    `A ${n(r)} ${n(r)} 0 0 1 ${n(x + width)} ${n(y + r)}`,
    `V ${n(cy - notchR)}`,
    `A ${n(notchR)} ${n(notchR)} 0 0 0 ${n(x + width)} ${n(cy + notchR)}`,
    `V ${n(y + height - r)}`,
    `A ${n(r)} ${n(r)} 0 0 1 ${n(x + width - r)} ${n(y + height)}`,
    `H ${n(x + r)}`,
    `A ${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + height - r)}`,
    `V ${n(cy + notchR)}`,
    `A ${n(notchR)} ${n(notchR)} 0 0 0 ${n(x)} ${n(cy - notchR)}`,
    `V ${n(y + r)}`,
    `A ${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}`,
    "Z",
  ].join(" ");
};

// ── Shapes ──

type ShapeOptions = {
  fill?: StoryFill;
  stroke?: StoryStroke;
  transform?: StoryTransform;
  opacity?: number;
  clip?: string;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetY?: number;
};

/** Any path, filled and/or stroked. */
export const pathShape = (d: string, options: ShapeOptions): StoryShapeBlock => ({ x: 0, y: 0, width: 0, height: 0, path: d, ...options });

/** A rounded rect. */
export const rectShape = (x: number, y: number, width: number, height: number, radius: number, options: ShapeOptions): StoryShapeBlock => ({
  x,
  y,
  width,
  height,
  radius,
  ...options,
});

export const strokeOf = (color: string, width: number, extra: Partial<StoryStroke> = {}): StoryStroke => ({ color, width, ...extra });

/** A soft drop shadow, as the mockups' `box-shadow: 0 18px 40px`. */
export const CARD_SHADOW = { shadowColor: "rgba(0, 0, 0, 0.45)", shadowBlur: 40, shadowOffsetY: 18 } as const;

// ── Text ──

/** One centred line, vertically centred on `centerY`. */
export const textLine = (
  text: string,
  x: number,
  centerY: number,
  fontString: string,
  color: string,
  options: Partial<StoryTextBlock> = {},
): StoryTextBlock => ({
  text,
  x,
  y: centerY,
  centerY,
  maxWidth: 960,
  font: fontString,
  color,
  align: "center",
  baseline: "alphabetic",
  maxLines: 1,
  fitMinPx: STORY_TEXT_FLOOR_PX,
  ...options,
});

/** A text shadow (glow or soft). */
export type TextShadow = { color: string; blur: number; offsetY?: number };

export const shadowed = (shadow: TextShadow | undefined): Partial<StoryTextBlock> =>
  shadow ? { shadowColor: shadow.color, shadowBlur: shadow.blur, shadowOffsetY: shadow.offsetY ?? 0 } : {};

/**
 * A big display word with the mockups' two text-shadows: a solid "extrusion" `drop` px below in
 * `dropColor`, then the word itself with a soft `glow`. Two blocks, drop first.
 */
export const displayWord = (
  text: string,
  centerY: number,
  fontString: string,
  color: string,
  options: { drop?: { color: string; offset: number }; glow?: TextShadow; letterSpacing?: number; fitMinPx?: number } = {},
): StoryTextBlock[] => {
  const common: Partial<StoryTextBlock> = { letterSpacing: options.letterSpacing, fitMinPx: options.fitMinPx ?? 56 };
  return [
    ...(options.drop ? [textLine(text, 540, centerY + options.drop.offset, fontString, options.drop.color, common)] : []),
    textLine(text, 540, centerY, fontString, color, { ...common, ...shadowed(options.glow) }),
  ];
};

/** A decoration glyph ("?", a yard number): its centre at (x, y), turned by `rotate` degrees. */
export const glyph = (
  text: string,
  x: number,
  y: number,
  px: number,
  color: string,
  options: { rotate?: number; opacity?: number; weight?: number } = {},
): StoryTextBlock =>
  textLine(text, x, y, font(options.weight ?? 900, px), color, {
    rotate: options.rotate ? deg(options.rotate) : undefined,
    opacity: options.opacity,
    maxWidth: px * 4,
    fitMinPx: undefined,
  });

// ── Sport balls (the Phase 1 geometry, components/game-themes/sportBalls.tsx, as canvas paths) ──

type Placement = { x: number; y: number; rotate?: number; scale?: number };

const placed = ({ x, y, rotate = 0, scale = 1 }: Placement): StoryTransform => ({ x, y, rotate: deg(rotate), scale });

/** An American football, 96 × 58 at scale 1. */
export const footballArt = (place: Placement, fill: StoryFill = solid("#92400E")): StoryShapeBlock[] => {
  const transform = placed(place);
  const white = (width: number) => strokeOf("#FFFFFF", width, { cap: "round" });
  return [
    pathShape(ellipsePath(0, 0, 48, 29), { fill, transform }),
    pathShape("M -36 -17 Q -44 0 -36 17", { stroke: white(4), transform }),
    pathShape("M 36 -17 Q 44 0 36 17", { stroke: white(4), transform }),
    pathShape(linePath(-17, 0, 17, 0), { stroke: white(3.5), transform }),
    pathShape([-10, -3, 4, 11].map((x) => `M ${x} -5 L ${x} 5`).join(" "), { stroke: white(3), transform }),
  ];
};

const PATCH = "M 0 -9 L 8.6 -2.8 L 5.3 7.3 L -5.3 7.3 L -8.6 -2.8 Z";
const PATCHES: readonly { x: number; y: number; r: number }[] = [
  { x: 17, y: -24, r: 36 },
  { x: 28, y: 9, r: 108 },
  { x: 0, y: 29, r: 180 },
  { x: -28, y: 9, r: 252 },
  { x: -17, y: -24, r: 324 },
];

/** Moves path data by (dx, dy) after turning it `r` degrees: plain M/L/Z paths only. */
const turnPath = (d: string, dx: number, dy: number, r: number): string => {
  const c = Math.cos(deg(r));
  const s = Math.sin(deg(r));
  return d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_m, xs: string, ys: string) => {
    const x = Number(xs);
    const y = Number(ys);
    return `${n(x * c - y * s + dx)} ${n(x * s + y * c + dy)}`;
  });
};

/** A soccer ball, radius 30 at scale 1. */
export const soccerBallArt = (place: Placement): StoryShapeBlock[] => {
  const transform = placed(place);
  const ink = solid("#0F172A");
  const ball = circlePath(0, 0, 30);
  const patches = [
    "M 0 -10.5 L 10 -3.3 L 6.2 8.5 L -6.2 8.5 L -10 -3.3 Z",
    ...PATCHES.map((patch) => turnPath(PATCH, patch.x, patch.y, patch.r)),
  ].join(" ");
  return [
    pathShape(ball, { fill: solid("#F8FAFC"), transform }),
    pathShape(patches, { fill: ink, clip: ball, transform }),
    pathShape(
      [
        [0, -10.5, 0, -21],
        [10, -3.3, 20, -6.5],
        [6.2, 8.5, 12.5, 17],
        [-6.2, 8.5, -12.5, 17],
        [-10, -3.3, -20, -6.5],
      ]
        .map(([x1, y1, x2, y2]) => linePath(x1, y1, x2, y2))
        .join(" "),
      { stroke: strokeOf("#0F172A", 1.6, { cap: "round" }), transform },
    ),
    pathShape(ball, { stroke: strokeOf("rgba(15, 23, 42, 0.25)", 1.4), transform }),
  ];
};

/** A basketball, radius 42 at scale 1, lit from the top-left. */
export const basketballArt = (place: Placement, opacity?: number): StoryShapeBlock[] => {
  const transform = placed(place);
  return [
    pathShape(circlePath(0, 0, 42), {
      fill: radial(-10, -13, 60, [
        [0, "#FB923C"],
        [1, "#C2410C"],
      ]),
      transform,
      opacity,
    }),
    pathShape("M -42 0 L 42 0 M 0 -42 L 0 42 M -30 -30 Q -11 0 -30 30 M 30 -30 Q 11 0 30 30", {
      stroke: strokeOf("#431407", 2),
      transform,
      opacity,
    }),
  ];
};

/** A gold trophy, 140 × 150 with its top-left at (x, y). */
export const trophyArt = (x: number, y: number, scale = 1): StoryShapeBlock[] => {
  const transform: StoryTransform = { x, y, scale };
  const gold = solid("#FBBF24");
  return [
    pathShape("M 30 10 H 110 V 50 C 110 82 92 100 70 100 C 48 100 30 82 30 50 Z", { fill: gold, transform }),
    pathShape("M 30 22 H 8 V 40 C 8 58 20 68 34 70 M 110 22 H 132 V 40 C 132 58 120 68 106 70", {
      stroke: strokeOf("#FBBF24", 9),
      transform,
    }),
    rectShape(60, 98, 20, 22, 0, { fill: solid("#F59E0B"), transform }),
    rectShape(36, 118, 68, 24, 6, { fill: gold, transform }),
  ];
};

// ── Backdrop helpers ──

/** The mockups are drawn 1350 tall (the Post): `y` placed proportionally on a picture `height` tall. */
export const scaleY = (height: number) => (y: number): number => (y * height) / 1350;

/** A mockup `y` measured from the Post's bottom edge, kept that far from this picture's bottom. */
export const fromBottom = (height: number) => (y: number): number => height - (1350 - y);

/**
 * CSS `radial-gradient(ellipse rx ry at cx cy, …)` over the whole picture, as one shape: the fractions
 * are of the picture's width (cx, rx) and height (cy, ry), as in CSS.
 */
export const ellipseGlow = (
  width: number,
  height: number,
  at: { cx: number; cy: number; rx: number; ry: number },
  stops: Stops,
): StoryShapeBlock => {
  const cx = width * at.cx;
  const cy = height * at.cy;
  const rx = width * at.rx;
  const squash = (height * at.ry) / rx;
  return rectShape(-cx, -cy / squash, width, height / squash, 0, {
    fill: radial(0, 0, rx, stops),
    transform: { x: cx, y: cy, scale: 1, scaleY: squash },
  });
};
