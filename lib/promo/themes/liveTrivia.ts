import {
  circlePath,
  deg,
  displayWord,
  ellipseGlow,
  font,
  fromBottom,
  glyph,
  linear,
  linePath,
  pathShape,
  polygonPath,
  radial,
  rectShape,
  scaleY,
  solid,
  strokeOf,
  textLine,
} from "@/lib/promo/promoArt";
import { flash, faded, progress } from "@/lib/promo/promoMotion";
import type { PromoTheme, ReelMotionFrame } from "@/lib/promo/promoThemeTypes";

// Live Trivia: a stage under spotlights, a marquee sign, floating question marks; the prize is a
// ticket stub. Canvas: "Share to Social Game Themes" → Live Trivia (docs/game-themes-plan.md).
// Reel (Phase 3): a buzzer flash as the title lands (and on the prize), two searchlights sweeping the stage.

const CYAN = "#22D3EE";
const AMBER = "#FBBF24";
const PINK = "#F472B6";

/** [centre x, centre y (Post), size, colour, opacity, degrees]. */
const QUESTION_MARKS: readonly (readonly [number, number, number, string, number, number])[] = [
  [108, 278, 150, PINK, 0.55, -18],
  [978, 234, 190, CYAN, 0.45, 16],
  [68, 801, 110, AMBER, 0.45, 12],
  [1005, 778, 120, PINK, 0.45, -14],
  [208, 136, 70, AMBER, 0.5, 20],
  [858, 1089, 90, CYAN, 0.35, -8],
  [140, 1122, 80, "#FFFFFF", 0.18, -22],
];

const SPARKS: readonly (readonly [number, number, number])[] = [
  [300, 230, 5],
  [790, 140, 6],
  [880, 560, 4],
  [170, 600, 5],
  [960, 1000, 5],
];

/** A searchlight from above the frame: [pivot x, colour, phase, sweep speed]. */
const SEARCHLIGHTS: readonly (readonly [number, string, number, number])[] = [
  [170, "rgba(255, 255, 255, 0.2)", 0, 1.25],
  [910, "rgba(34, 211, 238, 0.2)", 2.1, 1.05],
];

const reelMotion = ({ t, plan, stage, settle }: ReelMotionFrame) => {
  const { width, height } = stage;
  const beams = SEARCHLIGHTS.map(([x, color, phase, speed], index) => {
    // Swings across the stage and back; the left one leans right, the right one left.
    const lean = index === 0 ? -0.2 : 0.2;
    const angle = lean + 0.32 * Math.sin(t * speed + phase);
    return pathShape(polygonPath([[-36, 0], [36, 0], [330, 2400], [-330, 2400]]), {
      fill: linear(0, 0, 0, 2400, [
        [0, color],
        [1, "rgba(255, 255, 255, 0)"],
      ]),
      transform: { x, y: -60, rotate: angle },
    });
  });
  // The buzzer: two quick flashes as the title lands, one more as the prize is revealed.
  const buzz = Math.max(
    0.45 * flash(t, 0.08, 0.04, 0.22),
    0.35 * flash(t, 0.36, 0.04, 0.3),
    plan.prize ? 0.4 * flash(t, plan.prize[0], 0.03, 0.35) : 0,
  );
  const lights = faded({ shapes: beams, text: [] }, progress(t, 0, 0.5) * (1 - settle));
  return {
    shapes: [
      ...lights.shapes,
      ...(buzz > 0.005 ? [rectShape(0, 0, width, height, 0, { fill: solid("#E0F7FF"), opacity: buzz })] : []),
    ],
    text: [],
  };
};

export const liveTriviaTheme: PromoTheme = {
  background: () => solid("#0B0826"),
  backdrop: ({ width, height }) => {
    const sy = scaleY(height);
    const beam = (stops: number) => [
      [0, `rgba(255, 255, 255, ${stops})`],
      [1, "rgba(255, 255, 255, 0)"],
    ] as const;
    const stageY = fromBottom(height)(1330);
    return {
      shapes: [
        ellipseGlow(width, height, { cx: 0.5, cy: 0, rx: 1.2, ry: 0.7 }, [
          [0, "#3B1D8F"],
          [0.48, "#1C1257"],
          [1, "#0B0826"],
        ]),
        pathShape(polygonPath([[60, 0], [170, 0], [640, height], [160, height]]), { fill: linear(60, 0, 408, height, beam(0.28)) }),
        pathShape(polygonPath([[910, 0], [1020, 0], [920, height], [440, height]]), { fill: linear(1020, 0, 672, height, beam(0.28)) }),
        pathShape(circlePath(0, 0, 640), {
          fill: radial(0, 0, 640, [
            [0, "rgba(34, 211, 238, 0.35)"],
            [1, "rgba(34, 211, 238, 0)"],
          ]),
          transform: { x: 540, y: stageY, scale: 1, scaleY: 170 / 640 },
        }),
        pathShape(SPARKS.map(([x, y, r]) => circlePath(x, sy(y), r)).join(" "), { fill: solid(AMBER) }),
      ],
      text: QUESTION_MARKS.map(([x, y, size, color, opacity, rotate]) => glyph("?", x, sy(y), size, color, { rotate, opacity })),
    };
  },
  brand: { color: "rgba(255, 255, 255, 0.6)", gap: { ideal: 28, min: 24 } },
  title: (lines, scale, measure) => {
    const s = scale;
    const bigPx = 196 * s;
    const bigH = Math.round(bigPx * 0.95);
    if (lines.length === 1) {
      return {
        height: bigH,
        draw: (top) => ({ shapes: [], text: displayWord(lines[0], top + bigH / 2, font(900, bigPx), CYAN, { drop: { color: "#0E7490", offset: 8 * s }, glow: { color: "rgba(34, 211, 238, 0.55)", blur: 40 } }) }),
      };
    }
    const [sign, big] = lines;
    const signPx = 118 * s;
    const signSpacing = 10 * s;
    const signFont = font(900, signPx);
    const boxW = Math.min(960, Math.max(470 * s, measure(sign, signFont) + signSpacing * sign.length + 130 * s));
    const boxH = 168 * s;
    const gap = 4 * s;
    return {
      height: boxH + gap + bigH,
      draw: (top) => {
        const x = 540 - boxW / 2;
        const inset = 8 * s;
        const box = { x: x + inset, y: top + inset, w: boxW - 2 * inset, h: boxH - 2 * inset };
        return {
          shapes: [
            rectShape(box.x, box.y, box.w, box.h, 34 * s, { fill: solid("#2A0F4D"), stroke: strokeOf(AMBER, 6 * s) }),
            // The marquee's bulbs: a dotted line of round dots around the sign.
            rectShape(box.x, box.y, box.w, box.h, 34 * s, { stroke: strokeOf("#FEF3C7", 13 * s, { cap: "round", dash: [0.1, 29 * s] }) }),
          ],
          text: [
            textLine(sign, 540, top + boxH / 2, signFont, PINK, {
              letterSpacing: signSpacing,
              shadowColor: "rgba(244, 114, 182, 0.7)",
              shadowBlur: 28,
              maxWidth: boxW - 60 * s,
              fitMinPx: 56,
            }),
            ...displayWord(big, top + boxH + gap + bigH / 2, font(900, bigPx), CYAN, {
              drop: { color: "#0E7490", offset: 8 * s },
              glow: { color: "rgba(34, 211, 238, 0.55)", blur: 40 },
              letterSpacing: 2 * s,
            }),
          ],
        };
      },
    };
  },
  when: { timeColor: AMBER },
  prize: {
    fill: AMBER,
    radius: 28,
    notch: 26,
    shadowColor: "rgba(0, 0, 0, 0.4)",
    headline: { color: "#0F172A", px: 86 },
    how: { color: "#3F3A1F", weight: 700 },
    layout: {
      kind: "side",
      width: 150,
      gap: 44,
      pad: 44,
      padY: 38,
      minHeight: 226,
      draw: (x, top, height) => ({
        shapes: [pathShape(linePath(x + 150, top + 20, x + 150, top + height - 20), { stroke: strokeOf("rgba(15, 23, 42, 0.35)", 5, { dash: [14, 10] }) })],
        text: [textLine("WIN", x + 75, top + height / 2, font(900, 58), "#0F172A", { rotate: deg(-90), letterSpacing: 8, maxWidth: height - 40, fitMinPx: undefined })],
      }),
    },
  },
  venue: { addressColor: "rgba(255, 255, 255, 0.75)", handleColor: CYAN },
  cta: { fill: CYAN, text: "#0B0826", glow: "rgba(34, 211, 238, 0.5)" },
  followColor: "rgba(255, 255, 255, 0.4)",
  reel: { motion: reelMotion },
};
