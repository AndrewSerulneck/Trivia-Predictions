import type { StoryRenderSpec, StoryShapeBlock, StoryTextBlock } from "@/lib/socialShare/contracts";
import { SHARE_PLAY_LINE } from "@/lib/socialShare/copyPresets";
import { STORY_SHARE_SIZES } from "@/lib/socialShare/shareDesigns";
import { font, rectShape, shadowed, solid, textLine, type Blocks } from "@/lib/promo/promoArt";
import { prizePanelRow } from "@/lib/promo/promoPrizePanel";
import type { PromoPrize } from "@/lib/promo/promoPrizes";
import type { PromoWhen } from "@/lib/promo/promoSubjects";
import type { PromoTemplate } from "@/lib/promo/promoTemplates";
import { promoThemeFor } from "@/lib/promo/promoThemes";
import type { MeasureText, PromoTheme, ThemeRow, ThemeStage } from "@/lib/promo/promoThemeTypes";

export type { MeasureText } from "@/lib/promo/promoThemeTypes";
export { withAlpha } from "@/lib/promo/promoArt";

// THE END CARD (docs/partner-social-promo-plan.md §4.1, D17/D19): one still picture that says it all —
// the game, when, the prize panel (prize + how to win), the venue and "Play on Hightop Challenge".
// It is the Post (1080×1350), the Story (1080×1920), and the frame a Reel ends on and holds
// (lib/promo/promoReelRender.ts animates its rows into place, then holds this exact picture).
// NO QR code: viewers are already on their phones (D19).
//
// Each game wears its own look (docs/game-themes-plan.md Phase 2): background, backdrop artwork, the
// styled title, a prize panel shaped like an object from the game, colours. All of it comes from the
// game's theme (lib/promo/promoThemes.ts); this file never names a game.
//
// Pure: it builds a StoryRenderSpec for the one share renderer (lib/socialShare/storyCanvas.ts). Text
// widths come from `measure`, injected so this runs in tests; the browser passes a real canvas measure
// (lib/promo/promoRender.ts). Everything is stacked, then centred inside Instagram's safe zone.

export type PromoFormat = "post" | "story";

export const PROMO_FORMATS: readonly PromoFormat[] = ["post", "story"];

export type PromoEndCardInput = {
  format: PromoFormat;
  template: Pick<PromoTemplate, "game" | "titleLines" | "accent">;
  when: PromoWhen;
  /** Null when the partner unticked the bar name. */
  venueName: string | null;
  /** One line, "1010 Pacific St · Brooklyn, NY"; null when unticked or the venue has none. */
  venueAddress?: string | null;
  /** Without "@"; null when the venue has none or the partner unticked it. */
  instagramHandle: string | null;
  /** 0 = no prize panel. More than 3 shows the first 3 and "+ more prizes". */
  prizes: readonly Pick<PromoPrize, "headline" | "howToWin">[];
  measure: MeasureText;
};

/**
 * Every face the end card uses, so the renderer can load them before measuring (the size doesn't
 * matter to the font loader, only weight and style).
 */
export const PROMO_END_CARD_FONTS: readonly string[] = [font(700, 40), font(800, 40), font(900, 40), font(900, 40, true)];

const WHITE = "#FFFFFF";
const CONTENT_WIDTH = 960;

/**
 * The small "follow us" tag in the bottom-right corner (Andrew, 2026-11-04): small and faint so the bar
 * stays the star. Kept clear of the stack by reserving FOLLOW_RESERVE at the bottom of the safe zone.
 */
export const PROMO_FOLLOW_LINE = "Follow @thehightopchallenge";
const FOLLOW_PX = 34; // = STORY_TEXT_FLOOR_PX, the smallest text a share picture may have.
const FOLLOW_RESERVE = 64;
const FOLLOW_MARGIN_X = 56;

export type PromoEndCardRowId = "brand" | "title" | "when" | "art" | "prize" | "venue" | "cta" | "follow";

/** A row of the stack: its height, and the blocks it draws once its top is known. */
type Row = ThemeRow & { id: PromoEndCardRowId; gapAfter: number };

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
  /** The rows in the order drawn (the background and the backdrop are not rows). */
  groups: PromoEndCardGroup[];
  /** What the theme's backdrop (and its Reel motion) was given: the size, safe zone and rows. */
  stage: ThemeStage;
};

const line = (text: string, centerY: number, fontString: string, color: string, options: Partial<StoryTextBlock> = {}): StoryTextBlock =>
  textLine(text, 540, centerY, fontString, color, options);

const row = (id: PromoEndCardRowId, themed: ThemeRow, gapAfter: number): Row => ({ id, gapAfter, ...themed });

const brandRow = (theme: PromoTheme, gapAfter: number): Row => ({
  id: "brand",
  height: 44,
  gapAfter,
  draw: (top) => ({ shapes: [], text: [line("HIGHTOP CHALLENGE", top + 22, font(900, 34), theme.brand.color, { letterSpacing: 6 })] }),
});

/**
 * "Every Thursday · 8 PM": the days in white and the time in the theme's colour, on one line at the
 * largest size that fits (`px`, then 64, then 56). Too long even then: the days on one line, the time under it.
 */
const whenRow = (input: PromoEndCardInput, theme: PromoTheme, px: number, gapAfter: number): Row => {
  const { days, time } = input.when;
  const shadow = shadowed(theme.when.shadow);
  const lineH = (size: number) => Math.round(size * 1.15);
  if (!time) {
    return {
      id: "when",
      height: lineH(px),
      gapAfter,
      draw: (top) => ({ shapes: [], text: [line(days, top + lineH(px) / 2, font(800, px), WHITE, shadow)] }),
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
      gapAfter,
      draw: (top) => ({
        shapes: [],
        text: [
          line(days, top + lineH(small) / 2, font(800, small), WHITE, shadow),
          line(time, top + lineH(small) * 1.5, font(900, small), theme.when.timeColor, shadow),
        ],
      }),
    };
  }
  const w = widths(size);
  return {
    id: "when",
    height: lineH(size),
    gapAfter,
    draw: (top) => {
      const centerY = top + lineH(size) / 2;
      const x0 = 540 - (w.lead + w.time) / 2;
      return {
        shapes: [],
        text: [
          line(lead, centerY, font(800, size), WHITE, { x: x0, align: "left", maxWidth: w.lead + 4, fitMinPx: undefined, ...shadow }),
          line(time, centerY, font(900, size), theme.when.timeColor, {
            x: x0 + w.lead,
            align: "left",
            maxWidth: w.time + 4,
            fitMinPx: undefined,
            ...shadow,
          }),
        ],
      };
    },
  };
};

const venueRow = (input: PromoEndCardInput, theme: PromoTheme, gapAfter: number): Row | null => {
  const venueName = input.venueName;
  const address = input.venueAddress ?? null;
  const handle = input.instagramHandle;
  if (!venueName && !address && !handle) return null;
  const nameH = venueName ? 74 : 0;
  const addressH = address ? 50 : 0;
  const handleH = handle ? 52 : 0;
  const shadow = shadowed(theme.venue.shadow);
  return {
    id: "venue",
    height: nameH + addressH + handleH,
    gapAfter,
    draw: (top) => ({
      shapes: [],
      text: [
        ...(venueName ? [line(venueName, top + nameH / 2, font(900, 64), WHITE, shadow)] : []),
        ...(address ? [line(address, top + nameH + addressH / 2, font(700, 40), theme.venue.addressColor, shadow)] : []),
        ...(handle ? [line(`@${handle}`, top + nameH + addressH + handleH / 2, font(800, 40), theme.venue.handleColor, shadow)] : []),
      ],
    }),
  };
};

/** Bottom-right, inside the safe zone, below the stack's reserved strip. */
const followGroup = (theme: PromoTheme, size: { width: number; height: number; safeBottom: number }): PromoEndCardGroup => {
  const top = size.height - size.safeBottom - FOLLOW_RESERVE + (FOLLOW_RESERVE - FOLLOW_PX) / 2;
  const centerY = top + FOLLOW_PX / 2;
  return {
    id: "follow",
    top,
    height: FOLLOW_PX,
    shapes: [],
    text: [
      line(PROMO_FOLLOW_LINE, centerY, font(700, FOLLOW_PX), theme.followColor, {
        x: size.width - FOLLOW_MARGIN_X,
        align: "right",
        maxWidth: size.width - FOLLOW_MARGIN_X * 2,
      }),
    ],
  };
};

const ctaRow = (theme: PromoTheme, measure: MeasureText): Row => {
  const ctaFont = font(900, 42);
  const width = Math.min(CONTENT_WIDTH, measure(SHARE_PLAY_LINE, ctaFont) + 104);
  const height = 92;
  return {
    id: "cta",
    height,
    gapAfter: 0,
    draw: (top) => {
      const x = 540 - width / 2;
      const { fill, text, glow, drop } = theme.cta;
      return {
        shapes: [
          ...(drop ? [rectShape(x, top + 8, width, height, height / 2, { fill: solid(drop) })] : []),
          rectShape(x, top, width, height, height / 2, { fill: solid(fill), ...(glow ? { shadowColor: glow, shadowBlur: 36 } : {}) }),
        ],
        text: [line(SHARE_PLAY_LINE, top + height / 2, ctaFont, text, { maxWidth: width - 48 })],
      };
    },
  };
};

const stackHeight = (rows: readonly Row[]): number =>
  rows.reduce((sum, entry, index) => sum + entry.height + (index < rows.length - 1 ? entry.gapAfter : 0), 0);

/**
 * Tighter and tighter until the stack fits the safe zone: smaller title and art and gaps, then two
 * listed prizes instead of three, then no brand line, and last of all no sample art (the Squares board).
 */
const FIT_LEVELS = [
  { brand: true, title: 1, art: 1, gaps: 1, listed: 3, showArt: true },
  { brand: true, title: 0.88, art: 0.9, gaps: 0.75, listed: 3, showArt: true },
  { brand: true, title: 0.88, art: 0.9, gaps: 0.75, listed: 2, showArt: true },
  { brand: true, title: 0.78, art: 0.8, gaps: 0.6, listed: 2, showArt: true },
  { brand: false, title: 0.78, art: 0.8, gaps: 0.6, listed: 2, showArt: true },
  { brand: false, title: 0.7, art: 0.75, gaps: 0.5, listed: 2, showArt: true },
  { brand: false, title: 0.7, art: 0.75, gaps: 0.5, listed: 2, showArt: false },
] as const;

export const buildPromoEndCardLayout = (input: PromoEndCardInput): PromoEndCardLayout => {
  const theme = promoThemeFor(input.template.game);
  const size = STORY_SHARE_SIZES[input.format];
  const available = size.height - size.safeTop - size.safeBottom - FOLLOW_RESERVE;
  const hasPrize = input.prizes.length > 0;
  const showArt = theme.art !== undefined && (theme.art.show === "always" || !hasPrize);

  const build = (level: (typeof FIT_LEVELS)[number]): Row[] => {
    const gap = (px: number) => Math.round(px * level.gaps);
    const prize = prizePanelRow(theme.prize, input.prizes, input.measure, level.listed);
    const art = showArt && level.showArt && theme.art ? theme.art.row(level.art, input.measure) : null;
    return [
      level.brand ? brandRow(theme, gap(theme.brand.gap.min)) : null,
      row("title", theme.title(input.template.titleLines, level.title, input.measure), gap(22)),
      whenRow(input, theme, hasPrize || art ? 64 : 84, gap(36)),
      art ? row("art", art, gap(30)) : null,
      prize ? row("prize", prize, gap(38)) : null,
      venueRow(input, theme, gap(32)),
      ctaRow(theme, input.measure),
    ].filter((entry): entry is Row => entry !== null);
  };
  const attempts = FIT_LEVELS.map(build);
  const rows = attempts.find((candidate) => stackHeight(candidate) <= available) ?? attempts[attempts.length - 1];

  // Room to spare: first the gap under the brand line opens towards the theme's ideal (artwork sits
  // there on some themes), then the stack is centred.
  let spare = Math.max(0, available - stackHeight(rows));
  const brand = rows[0]?.id === "brand" ? rows[0] : null;
  if (brand) {
    const grow = Math.min(spare, Math.max(0, theme.brand.gap.ideal - brand.gapAfter));
    brand.gapAfter += grow;
    spare -= grow;
  }

  let top = size.safeTop + spare / 2;
  const shapes: StoryShapeBlock[] = [];
  const textBlocks: StoryTextBlock[] = [];
  const groups: PromoEndCardGroup[] = [];
  for (const entry of rows) {
    const drawn: Blocks = entry.draw(top);
    shapes.push(...drawn.shapes);
    textBlocks.push(...drawn.text);
    groups.push({ id: entry.id, top, height: entry.height, ...drawn });
    top += entry.height + entry.gapAfter;
  }
  const follow = followGroup(theme, size);
  textBlocks.push(...follow.text);
  groups.push(follow);

  const stage: ThemeStage = {
    width: size.width,
    height: size.height,
    safeTop: size.safeTop,
    safeBottom: size.safeBottom,
    rows: groups.map(({ id, top: rowTop, height }) => ({ id, top: rowTop, height })),
  };
  const backdrop = theme.backdrop(stage);

  const spec: StoryRenderSpec = {
    width: size.width,
    height: size.height,
    mirrorPreview: false,
    frameAssetUrl: null,
    background: theme.background(size.width, size.height),
    backdrop: { shapes: backdrop.shapes, textBlocks: backdrop.text },
    shapes,
    images: [],
    textBlocks,
  };
  return { spec, groups, stage };
};

export const buildPromoEndCardSpec = (input: PromoEndCardInput): StoryRenderSpec => buildPromoEndCardLayout(input).spec;
