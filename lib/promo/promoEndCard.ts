import type { StoryRenderSpec, StoryShapeBlock, StoryTextBlock } from "@/lib/socialShare/contracts";
import { SHARE_PLAY_LINE } from "@/lib/socialShare/copyPresets";
import { STORY_SHARE_SIZES, STORY_TEXT_FLOOR_PX } from "@/lib/socialShare/shareDesigns";
import type { PromoPrize } from "@/lib/promo/promoPrizes";
import type { PromoWhen } from "@/lib/promo/promoSubjects";
import type { PromoTemplate } from "@/lib/promo/promoTemplates";

// THE END CARD (docs/partner-social-promo-plan.md §4.1, D17/D19): one still picture that says it all —
// the game, when, the prize panel (prize + how to win), the venue and "Play on Hightop Challenge".
// It is the Post (1080×1350), the Story (1080×1920), and the frame a Reel ends on and holds
// (lib/promo/promoReelRender.ts animates its rows into place, then holds this exact picture).
// NO QR code: viewers are already on their phones (D19).
//
// Pure: it builds a StoryRenderSpec for the one share renderer (lib/socialShare/storyCanvas.ts). Text
// widths come from `measure`, injected so this runs in tests; the browser passes a real canvas measure
// (lib/promo/promoRender.ts). Everything is stacked, then centred inside Instagram's safe zone.

export type PromoFormat = "post" | "story";

export const PROMO_FORMATS: readonly PromoFormat[] = ["post", "story"];

/** Width of `text` drawn in `font` (a canvas font string), in px. */
export type MeasureText = (text: string, font: string) => number;

export type PromoEndCardInput = {
  format: PromoFormat;
  template: Pick<PromoTemplate, "titleLines" | "accent">;
  when: PromoWhen;
  /** Null when the venue hides its name on shared pictures. */
  venueName: string | null;
  /** Without "@"; null when the venue has none or hides it. */
  instagramHandle: string | null;
  /** 0 = no prize panel. More than 3 shows the first 3 and "+ more prizes". */
  prizes: readonly Pick<PromoPrize, "headline" | "howToWin">[];
  measure: MeasureText;
};

const BODY = "var(--ht-font-body), Arial, sans-serif";
const font = (weight: number, px: number): string => `${weight} ${px}px ${BODY}`;

/** Every font the end card uses, so the renderer can load them before measuring. */
export const PROMO_END_CARD_FONTS: readonly string[] = [
  font(900, 34),
  font(900, 118),
  font(800, 64),
  font(900, 64),
  font(800, 84),
  font(900, 84),
  font(800, 56),
  font(900, 56),
  font(700, 36),
  font(700, 40),
  font(900, 56),
  font(800, 40),
];

const WHITE = "#FFFFFF";
export const PROMO_NAVY_TOP = "#0D1A3A";
export const PROMO_NAVY_BOTTOM = "#060B1A";
/** The background glow, top-right, as on the approved Reel. The Reel's moving glow settles here. */
export const PROMO_GLOW = {
  x: 0.78,
  y: 0.16,
  r: 900,
  stops: [
    { offset: 0, color: "rgba(34, 211, 238, 0.30)" },
    { offset: 0.35, color: "rgba(139, 92, 246, 0.18)" },
    { offset: 1, color: "rgba(0, 0, 0, 0)" },
  ],
} as const;
const CARD_INK = "#0F172A";
const CARD_MUTED = "#475569";
const CARD_LABEL = "#64748B";
const BRAND_TEXT = "rgba(255, 255, 255, 0.55)";
const CONTENT_WIDTH = 960;
const CARD_WIDTH = 840;
const CARD_TEXT_WIDTH = CARD_WIDTH - 96;
const MAX_LISTED_PRIZES = 3;

export const withAlpha = (hex: string, alpha: number): string => {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export type PromoEndCardRowId = "brand" | "title" | "when" | "prize" | "venue" | "cta";

/** A row of the stack: its height, and the blocks it draws once its top is known. */
type Row = {
  id: PromoEndCardRowId;
  height: number;
  gapAfter: number;
  draw: (top: number) => { shapes: StoryShapeBlock[]; text: StoryTextBlock[] };
};

/** One drawn row: where it landed and its blocks. The Reel moves these as a unit. */
export type PromoEndCardGroup = {
  id: PromoEndCardRowId;
  top: number;
  height: number;
  shapes: StoryShapeBlock[];
  text: StoryTextBlock[];
};

export type PromoEndCardLayout = {
  spec: StoryRenderSpec;
  /** The rows in the order drawn (the glow and the background are not rows). */
  groups: PromoEndCardGroup[];
};

const line = (
  text: string,
  centerY: number,
  fontString: string,
  color: string,
  options: Partial<StoryTextBlock> = {},
): StoryTextBlock => ({
  text,
  x: 540,
  y: centerY,
  centerY,
  maxWidth: CONTENT_WIDTH,
  font: fontString,
  color,
  align: "center",
  baseline: "alphabetic",
  maxLines: 1,
  fitMinPx: STORY_TEXT_FLOOR_PX,
  ...options,
});

/** How many lines `text` wraps to at `maxWidth` (by words), capped at `maxLines`. */
const lineCount = (measure: MeasureText, text: string, fontString: string, maxWidth: number, maxLines: number): number => {
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

const brandRow = (): Row => ({
  id: "brand",
  height: 44,
  gapAfter: 36,
  draw: (top) => ({ shapes: [], text: [line("HIGHTOP CHALLENGE", top + 22, font(900, 34), BRAND_TEXT)] }),
});

const titleRow = (template: PromoEndCardInput["template"], titlePx: number): Row => {
  const lineHeight = Math.round(titlePx * 0.95);
  const lines = template.titleLines;
  return {
    id: "title",
    height: lineHeight * lines.length,
    gapAfter: 40,
    draw: (top) => ({
      shapes: [],
      text: lines.map((text, index) =>
        line(text, top + lineHeight * index + lineHeight / 2, font(900, titlePx), lines.length === 2 && index === 1 ? WHITE : template.accent, {
          fitMinPx: 64,
        }),
      ),
    }),
  };
};

/**
 * "Every Thursday · 8 PM": the days in white and the time in the accent, on one line at the largest
 * size that fits (`px`, then 64, then 56). Too long even then: the days on one line, the time under it.
 */
const whenRow = (input: PromoEndCardInput, px: number): Row => {
  const { days, time } = input.when;
  const lineH = (size: number) => Math.round(size * 1.15);
  if (!time) {
    return {
      id: "when",
      height: lineH(px),
      gapAfter: 40,
      draw: (top) => ({ shapes: [], text: [line(days, top + lineH(px) / 2, font(800, px), WHITE)] }),
    };
  }
  const lead = `${days} · `;
  const widths = (size: number) => ({ lead: input.measure(lead, font(800, size)), time: input.measure(time, font(900, size)) });
  const size = [px, 64, 56].find((candidate) => {
    const w = widths(candidate);
    return w.lead + w.time <= CONTENT_WIDTH;
  });
  if (size === undefined) {
    const small = 56;
    return {
      id: "when",
      height: lineH(small) * 2,
      gapAfter: 40,
      draw: (top) => ({
        shapes: [],
        text: [
          line(days, top + lineH(small) / 2, font(800, small), WHITE),
          line(time, top + lineH(small) * 1.5, font(900, small), input.template.accent),
        ],
      }),
    };
  }
  const w = widths(size);
  return {
    id: "when",
    height: lineH(size),
    gapAfter: 40,
    draw: (top) => {
      const centerY = top + lineH(size) / 2;
      const x0 = 540 - (w.lead + w.time) / 2;
      return {
        shapes: [],
        text: [
          line(lead, centerY, font(800, size), WHITE, { x: x0, align: "left", maxWidth: w.lead + 4, fitMinPx: undefined }),
          line(time, centerY, font(900, size), input.template.accent, {
            x: x0 + w.lead,
            align: "left",
            maxWidth: w.time + 4,
            fitMinPx: undefined,
          }),
        ],
      };
    },
  };
};

const prizeCardShapes = (top: number, height: number): StoryShapeBlock[] => {
  const x = 540 - CARD_WIDTH / 2;
  return [
    {
      x,
      y: top,
      width: CARD_WIDTH,
      height,
      radius: 44,
      fill: { kind: "linear", x0: x, y0: top, x1: x + CARD_WIDTH, y1: top + height, stops: [{ offset: 0, color: "#FFFFFF" }, { offset: 1, color: "#F1F5F9" }] },
      shadowColor: "rgba(34, 211, 238, 0.45)",
      shadowBlur: 80,
    },
    {
      x,
      y: top,
      width: CARD_WIDTH,
      height,
      radius: 44,
      fill: {
        kind: "radial",
        cx: x + CARD_WIDTH,
        cy: top,
        r: CARD_WIDTH * 0.7,
        stops: [
          { offset: 0, color: "rgba(34, 211, 238, 0.28)" },
          { offset: 0.4, color: "rgba(139, 92, 246, 0.16)" },
          { offset: 1, color: "rgba(255, 255, 255, 0)" },
        ],
      },
    },
  ];
};

/** One prize: WIN / the prize, big / how to win. */
const singlePrizeRow = (prize: PromoEndCardInput["prizes"][number], measure: MeasureText): Row => {
  const headlineLines = lineCount(measure, prize.headline, font(900, 84), CARD_TEXT_WIDTH, 2);
  const howLines = lineCount(measure, prize.howToWin, font(700, 40), CARD_TEXT_WIDTH, 2);
  const pad = 44;
  const winH = 50;
  const headlineH = 92 * headlineLines;
  const howH = 50 * howLines;
  const height = pad + winH + 12 + headlineH + 16 + howH + pad;
  return {
    id: "prize",
    height,
    gapAfter: 44,
    draw: (top) => {
      const winY = top + pad + winH / 2;
      const headlineY = top + pad + winH + 12 + headlineH / 2;
      const howY = top + pad + winH + 12 + headlineH + 16 + howH / 2;
      return {
        shapes: prizeCardShapes(top, height),
        text: [
          line("WIN", winY, font(900, 40), CARD_LABEL),
          line(prize.headline, headlineY, font(900, 84), CARD_INK, { maxWidth: CARD_TEXT_WIDTH, maxLines: 2, lineHeight: 92, fitMinPx: 48 }),
          line(prize.howToWin, howY, font(700, 40), CARD_MUTED, { maxWidth: CARD_TEXT_WIDTH, maxLines: 2, lineHeight: 50 }),
        ],
      };
    },
  };
};

/** Two or more prizes: WIN, then each prize on its own line with its how-to-win under it. */
const prizeListRow = (prizes: PromoEndCardInput["prizes"]): Row => {
  const listed = prizes.slice(0, MAX_LISTED_PRIZES);
  const more = prizes.length - listed.length;
  const pad = 40;
  const itemH = 56 + 8 + 44;
  const itemGap = 26;
  const moreH = more > 0 ? 70 : 0;
  const height = pad + 50 + 16 + listed.length * itemH + (listed.length - 1) * itemGap + moreH + pad;
  return {
    id: "prize",
    height,
    gapAfter: 44,
    draw: (top) => {
      const text: StoryTextBlock[] = [line("WIN", top + pad + 25, font(900, 40), CARD_LABEL)];
      listed.forEach((prize, index) => {
        const itemTop = top + pad + 50 + 16 + index * (itemH + itemGap);
        text.push(line(prize.headline, itemTop + 28, font(900, 56), CARD_INK, { maxWidth: CARD_TEXT_WIDTH, fitMinPx: 40 }));
        text.push(line(prize.howToWin, itemTop + 56 + 8 + 22, font(700, 36), CARD_MUTED, { maxWidth: CARD_TEXT_WIDTH }));
      });
      if (more > 0) {
        text.push(line(`+ ${more} more prize${more === 1 ? "" : "s"}`, top + height - pad - 25, font(800, 40), CARD_MUTED));
      }
      return { shapes: prizeCardShapes(top, height), text };
    },
  };
};

const venueRow = (venueName: string | null, handle: string | null, accent: string): Row | null => {
  if (!venueName && !handle) return null;
  const nameH = venueName ? 64 : 0;
  const handleH = handle ? 50 : 0;
  return {
    id: "venue",
    height: nameH + handleH,
    gapAfter: 44,
    draw: (top) => ({
      shapes: [],
      text: [
        ...(venueName ? [line(venueName, top + nameH / 2, font(900, 56), WHITE)] : []),
        ...(handle ? [line(`@${handle}`, top + nameH + handleH / 2, font(700, 40), accent)] : []),
      ],
    }),
  };
};

const ctaRow = (accent: string, measure: MeasureText): Row => {
  const width = Math.min(CONTENT_WIDTH, measure(SHARE_PLAY_LINE, font(800, 40)) + 96);
  const height = 88;
  return {
    id: "cta",
    height,
    gapAfter: 0,
    draw: (top) => {
      const x = 540 - width / 2;
      return {
        // A 3px accent outline: the outline colour, the navy pill on it, then the accent tint.
        shapes: [
          { x: x - 3, y: top - 3, width: width + 6, height: height + 6, radius: 47, fill: { kind: "solid", color: withAlpha(accent, 0.55) } },
          { x, y: top, width, height, radius: 44, fill: { kind: "solid", color: "#0E1B38" } },
          { x, y: top, width, height, radius: 44, fill: { kind: "solid", color: withAlpha(accent, 0.16) } },
        ],
        text: [line(SHARE_PLAY_LINE, top + height / 2, font(800, 40), WHITE, { maxWidth: width - 48 })],
      };
    },
  };
};

const stackHeight = (rows: readonly Row[]): number =>
  rows.reduce((sum, row, index) => sum + row.height + (index < rows.length - 1 ? row.gapAfter : 0), 0);

export const buildPromoEndCardLayout = (input: PromoEndCardInput): PromoEndCardLayout => {
  const size = STORY_SHARE_SIZES[input.format];
  const available = size.height - size.safeTop - size.safeBottom;
  const hasPrize = input.prizes.length > 0;
  const prizeRow = !hasPrize
    ? null
    : input.prizes.length === 1
      ? singlePrizeRow(input.prizes[0], input.measure)
      : prizeListRow(input.prizes);
  const venue = venueRow(input.venueName, input.instagramHandle, input.template.accent);

  // Try the full stack, then drop the brand line, then shrink the title, until it fits the safe zone.
  const build = (withBrand: boolean, titlePx: number): Row[] =>
    [
      withBrand ? brandRow() : null,
      titleRow(input.template, titlePx),
      whenRow(input, hasPrize ? 64 : 84),
      prizeRow,
      venue,
      ctaRow(input.template.accent, input.measure),
    ].filter((row): row is Row => row !== null);
  const attempts: Row[][] = [build(true, 118), build(false, 118), build(false, 96), build(false, 80)];
  const rows = attempts.find((candidate) => stackHeight(candidate) <= available) ?? attempts[attempts.length - 1];

  let top = size.safeTop + Math.max(0, (available - stackHeight(rows)) / 2);
  const shapes: StoryShapeBlock[] = [
    {
      x: 0,
      y: 0,
      width: size.width,
      height: size.height,
      fill: {
        kind: "radial",
        cx: size.width * PROMO_GLOW.x,
        cy: size.height * PROMO_GLOW.y,
        r: PROMO_GLOW.r,
        stops: PROMO_GLOW.stops.map((stop) => ({ ...stop })),
      },
    },
  ];
  const textBlocks: StoryTextBlock[] = [];
  const groups: PromoEndCardGroup[] = [];
  for (const row of rows) {
    const drawn = row.draw(top);
    shapes.push(...drawn.shapes);
    textBlocks.push(...drawn.text);
    groups.push({ id: row.id, top, height: row.height, ...drawn });
    top += row.height + row.gapAfter;
  }

  const spec: StoryRenderSpec = {
    width: size.width,
    height: size.height,
    mirrorPreview: false,
    frameAssetUrl: null,
    background: {
      kind: "linear",
      x0: 0,
      y0: 0,
      x1: 0,
      y1: size.height,
      stops: [
        { offset: 0, color: PROMO_NAVY_TOP },
        { offset: 1, color: PROMO_NAVY_BOTTOM },
      ],
    },
    shapes,
    images: [],
    textBlocks,
  };
  return { spec, groups };
};

export const buildPromoEndCardSpec = (input: PromoEndCardInput): StoryRenderSpec => buildPromoEndCardLayout(input).spec;
