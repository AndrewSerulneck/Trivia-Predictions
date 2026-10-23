import { APP_DOWNLOAD_DISPLAY_URL } from "@/lib/appDownloadLink";
import { PRIZE_CARD_PICTURE } from "@/lib/themeTokens";
import { SHARE_PLAY_LINE, SHARE_SCAN_LINE } from "./copyPresets";
import type {
  StoryFill,
  StoryImageBlock,
  StoryRenderSpec,
  StoryShapeBlock,
  StoryTextBlock,
} from "./contracts";
import { storyShareGame } from "./shareGames";
import { SHARE_QR_MODULES, SHARE_QR_SRC } from "./shareQr";
import { getStoryFrameAssetUrl } from "./storyAssets";
import type { PreparedStorySharePayload as PreparedPayload } from "./storyPayloads";

/** What a layout reads: everything prepared except the picture it is building. */
type PreparedStorySharePayload = Omit<PreparedPayload, "renderSpec">;

/**
 * The share pictures' layouts (docs/native-app-store-plan.md Phase 9b): three ready-made
 * designs that need no camera, plus the optional selfie, each at Story (1080×1920) and feed
 * post (1080×1350) size. One spec builder, drawn by the one renderer (storyCanvas.ts).
 *
 * Every design carries the bar (name + street + city, no directions) and the app (a QR to
 * `hightopchallenge.com/app` + "Play on Hightop Challenge"). On a Story the QR and venue
 * panel stay inside Instagram's safe zone (clear of the top 250 and bottom 340 px).
 * No text is smaller than STORY_TEXT_FLOOR_PX (the app's 12px floor at phone width).
 * No game id is named here — what differs per game is its registry entry (shareGames.ts).
 */

export type StoryShareSize = "story" | "post";
export type StoryShareDesign = "spotlight" | "card" | "night" | "selfie";

export interface StoryShareSizeSpec {
  width: number;
  height: number;
  /** Instagram's overlays (profile row / reply bar) cover these on a Story. */
  safeTop: number;
  safeBottom: number;
}

export const STORY_SHARE_SIZES: Record<StoryShareSize, StoryShareSizeSpec> = {
  story: { width: 1080, height: 1920, safeTop: 250, safeBottom: 340 },
  post: { width: 1080, height: 1350, safeTop: 64, safeBottom: 64 },
};

export const STORY_SHARE_SIZE_ORDER: readonly StoryShareSize[] = ["story", "post"];

/**
 * 12px on a 390px-wide phone showing a 1080px-wide picture is 33.2px; 34 rounds up.
 * tests/share-designs.test.ts fails on any text below it.
 */
export const STORY_TEXT_FLOOR_PX = 34;

const LOGO_SRC = "/brand/web/htc-logo-192.webp";
/** The QR drawn at a whole 6px per module, never smoothed. */
const QR_SIZE = SHARE_QR_MODULES * 6;
const MARGIN = 64;
const PANEL_PAD = 48;
const WHITE = "#FFFFFF";
const SOFT_WHITE = "rgba(255, 255, 255, 0.82)";
const NIGHT_BACKGROUND = "#020617";
const CARD_BACKGROUND = ["#0B1022", "#111827"] as const;

const DISPLAY = "var(--ht-font-display), Georgia, serif";
const BODY = "var(--ht-font-body), Arial, sans-serif";

const displayFont = (px: number): string => `400 ${px}px ${DISPLAY}`;
const bodyFont = (weight: number, px: number): string => `${weight} ${px}px ${BODY}`;

const text = (block: Omit<StoryTextBlock, "baseline"> & { baseline?: CanvasTextBaseline }): StoryTextBlock => ({
  align: "left",
  baseline: "alphabetic",
  ...block,
});

const withAlpha = (hex: string, alpha: number): string => {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

interface DesignParts {
  background: StoryFill | null;
  frameAssetUrl: string | null;
  shapes: StoryShapeBlock[];
  images: StoryImageBlock[];
  textBlocks: StoryTextBlock[];
}

interface Frame {
  width: number;
  height: number;
  /** First y content may use. */
  top: number;
  /** Last y the venue panel may reach. */
  bottom: number;
}

const frameOf = (size: StoryShareSize): Frame => {
  const spec = STORY_SHARE_SIZES[size];
  return { width: spec.width, height: spec.height, top: spec.safeTop, bottom: spec.height - spec.safeBottom };
};

// ── The venue + app panel every design ends with ──

interface VenuePanel extends Pick<DesignParts, "shapes" | "images" | "textBlocks"> {
  /** The panel's top edge: content above must end before it. */
  top: number;
}

const venuePanel = (
  prepared: PreparedStorySharePayload,
  frame: Frame,
  options: { panelFill: string; accent: string; stroke?: boolean }
): VenuePanel => {
  const venueName = prepared.payload.venueName?.trim() || null;
  const address = prepared.payload.venueAddress ?? null;
  const addressLines = [address?.street, address?.locality].filter((line): line is string => Boolean(line?.trim()));

  // Text column, top to bottom (baselines measured from the panel top).
  const nameBaseline = 100;
  const addressBaselines = addressLines.map((_, index) => nameBaseline + 56 + index * 50);
  const lastAbove = addressBaselines.at(-1) ?? (venueName ? nameBaseline : 30);
  const playBaseline = lastAbove + 68;
  const urlBaseline = playBaseline + 50;
  const textHeight = urlBaseline + 44;

  const qrBlockHeight = QR_SIZE + 62;
  const panelHeight = Math.max(textHeight, qrBlockHeight + PANEL_PAD * 2);
  const x = MARGIN;
  const width = frame.width - MARGIN * 2;
  const top = frame.bottom - panelHeight;
  const textTop = top + (panelHeight - textHeight) / 2;
  const qrX = x + width - PANEL_PAD - QR_SIZE;
  const qrY = top + (panelHeight - qrBlockHeight) / 2;
  const textX = x + PANEL_PAD;
  const textWidth = qrX - 40 - textX;
  const readable = options.stroke
    ? { shadowColor: "rgba(0, 0, 0, 0.4)", shadowBlur: 6, shadowOffsetY: 2 }
    : {};

  const textBlocks: StoryTextBlock[] = [];
  if (venueName) {
    textBlocks.push(text({
      text: venueName,
      x: textX,
      y: textTop + nameBaseline,
      maxWidth: textWidth,
      font: displayFont(54),
      fitMinPx: 38,
      color: WHITE,
      ...readable,
    }));
  }
  addressLines.forEach((line, index) => {
    textBlocks.push(text({
      text: line,
      x: textX,
      y: textTop + addressBaselines[index],
      maxWidth: textWidth,
      font: bodyFont(600, 38),
      fitMinPx: STORY_TEXT_FLOOR_PX,
      color: SOFT_WHITE,
      ...readable,
    }));
  });
  textBlocks.push(
    text({
      text: SHARE_PLAY_LINE,
      x: textX,
      y: textTop + playBaseline,
      maxWidth: textWidth,
      font: bodyFont(800, 38),
      fitMinPx: STORY_TEXT_FLOOR_PX,
      color: options.accent,
      ...readable,
    }),
    text({
      text: APP_DOWNLOAD_DISPLAY_URL,
      x: textX,
      y: textTop + urlBaseline,
      maxWidth: textWidth,
      font: bodyFont(700, 36),
      fitMinPx: STORY_TEXT_FLOOR_PX,
      color: SOFT_WHITE,
      ...readable,
    }),
    text({
      text: SHARE_SCAN_LINE,
      x: qrX + QR_SIZE / 2,
      y: qrY + QR_SIZE + 50,
      maxWidth: QR_SIZE + 40,
      font: bodyFont(700, STORY_TEXT_FLOOR_PX),
      color: SOFT_WHITE,
      align: "center",
      ...readable,
    })
  );

  return {
    top,
    shapes: [{ x, y: top, width, height: panelHeight, radius: 40, fill: { kind: "solid", color: options.panelFill } }],
    images: [{ src: SHARE_QR_SRC, x: qrX, y: qrY, width: QR_SIZE, height: QR_SIZE, radius: 18, smoothing: false }],
    textBlocks,
  };
};

// ── What the picture says ──

const STAT_SUFFIX = { rank: " place", points: "", correct: " correct" } as const;

/** "1st place · 120 pts · 80% correct", only the fields the game's registry entry shows. */
const statsLine = (prepared: PreparedStorySharePayload): string | null => {
  const fields = storyShareGame(prepared.payload.gameType).resultFields;
  const parts = prepared.stats
    .filter((stat) => (fields as readonly string[]).includes(stat.field))
    .map((stat) => `${stat.value}${STAT_SUFFIX[stat.field]}`);
  return parts.length > 0 ? parts.join("  ·  ") : null;
};

/** The card's face: the prize (headline + label), or the game result for a game win. */
const cardFace = (prepared: PreparedStorySharePayload): { headline: string; kind: "amount" | "phrase"; label: string } => {
  const { payload } = prepared;
  if (payload.prize) return { headline: payload.prize.headline, kind: payload.prize.headlineKind, label: payload.prize.label };
  const game = storyShareGame(payload.gameType);
  const rank = prepared.stats.find((stat) => stat.field === "rank")?.value ?? null;
  if (rank) return { headline: rank, kind: "amount", label: game.label.toUpperCase() };
  return { headline: payload.isChampion ? game.championTitle : game.label, kind: "phrase", label: game.label.toUpperCase() };
};

const usernameBlock = (prepared: PreparedStorySharePayload, frame: Frame, y: number, extra: Partial<StoryTextBlock> = {}): StoryTextBlock =>
  text({
    text: prepared.displayUsername,
    x: frame.width / 2,
    y,
    maxWidth: frame.width - MARGIN * 2,
    font: bodyFont(700, 42),
    color: SOFT_WHITE,
    align: "center",
    ...extra,
  });

// ── The designs ──

/** Spotlight: the game's gradient, the logo, Andrew's line big. */
const spotlight = (prepared: PreparedStorySharePayload, frame: Frame): DesignParts => {
  const game = storyShareGame(prepared.payload.gameType);
  const panel = venuePanel(prepared, frame, { panelFill: "rgba(2, 6, 23, 0.42)", accent: game.colors.textSecondary });
  const logoSize = frame.height > 1500 ? 168 : 128;
  const logoY = frame.top + 8;
  const stats = statsLine(prepared);
  const usernameY = panel.top - 64;
  const statsY = usernameY - 62;
  const headlineTop = logoY + logoSize + 40;
  const headlineBottom = (stats ? statsY - 56 : usernameY - 64);

  return {
    background: {
      kind: "linear",
      x0: 0,
      y0: 0,
      x1: frame.width,
      y1: frame.height,
      stops: [
        { offset: 0, color: game.gradient[0] },
        { offset: 0.55, color: game.gradient[1] },
        { offset: 1, color: game.gradient[2] },
      ],
    },
    frameAssetUrl: null,
    shapes: [
      {
        x: 0,
        y: 0,
        width: frame.width,
        height: frame.height,
        fill: {
          kind: "radial",
          cx: frame.width * 0.85,
          cy: frame.height * 0.08,
          r: frame.width,
          stops: [
            { offset: 0, color: "rgba(255, 255, 255, 0.18)" },
            { offset: 1, color: "rgba(255, 255, 255, 0)" },
          ],
        },
      },
      ...panel.shapes,
    ],
    images: [{ src: LOGO_SRC, x: (frame.width - logoSize) / 2, y: logoY, width: logoSize, height: logoSize }, ...panel.images],
    textBlocks: [
      text({
        text: prepared.winLine,
        x: frame.width / 2,
        y: 0,
        centerY: (headlineTop + headlineBottom) / 2,
        maxWidth: frame.width - MARGIN * 2 - 32,
        font: displayFont(100),
        fitMinPx: 60,
        lineHeight: 112,
        maxLines: 4,
        color: WHITE,
        align: "center",
      }),
      ...(stats
        ? [text({
            text: stats,
            x: frame.width / 2,
            y: statsY,
            maxWidth: frame.width - MARGIN * 2,
            font: bodyFont(800, 44),
            fitMinPx: STORY_TEXT_FLOOR_PX,
            color: game.colors.textSecondary,
            align: "center",
          })]
        : []),
      usernameBlock(prepared, frame, usernameY),
      ...panel.textBlocks,
    ],
  };
};

/** Card: the prize's gift card (or the game result on the same card) on a dark stage. */
const card = (prepared: PreparedStorySharePayload, frame: Frame): DesignParts => {
  const game = storyShareGame(prepared.payload.gameType);
  const panel = venuePanel(prepared, frame, { panelFill: "rgba(255, 255, 255, 0.06)", accent: game.colors.textSecondary });
  const tall = frame.height > 1500;
  const cardWidth = tall ? 840 : 720;
  const cardHeight = Math.round(cardWidth / 1.586);
  const s = cardWidth / 840;
  const usernameY = panel.top - 56;
  const cardBottom = usernameY - 74;
  const cardY = cardBottom - cardHeight;
  const cardX = (frame.width - cardWidth) / 2;
  const face = cardFace(prepared);
  const venueName = prepared.payload.venueName?.trim() || null;
  const inset = 48 * s;

  const headlineBlock: StoryTextBlock = face.kind === "amount"
    ? text({
        text: face.headline,
        x: cardX + inset,
        y: cardY + cardHeight - (venueName ? 104 : 56) * s,
        maxWidth: cardWidth - inset * 2,
        font: displayFont(Math.round(180 * s)),
        fitMinPx: 80,
        color: PRIZE_CARD_PICTURE.text,
      })
    : text({
        text: face.headline,
        x: cardX + inset,
        y: 0,
        centerY: cardY + cardHeight * 0.58,
        maxWidth: cardWidth - inset * 2,
        font: displayFont(Math.round(80 * s)),
        fitMinPx: 44,
        lineHeight: Math.round(88 * s),
        maxLines: 2,
        color: PRIZE_CARD_PICTURE.text,
      });

  return {
    background: {
      kind: "linear",
      x0: 0,
      y0: 0,
      x1: 0,
      y1: frame.height,
      stops: [
        { offset: 0, color: CARD_BACKGROUND[0] },
        { offset: 1, color: CARD_BACKGROUND[1] },
      ],
    },
    frameAssetUrl: null,
    shapes: [
      {
        x: 0,
        y: 0,
        width: frame.width,
        height: frame.height,
        fill: {
          kind: "radial",
          cx: frame.width,
          cy: 0,
          r: frame.width * 1.1,
          stops: [
            { offset: 0, color: withAlpha(game.colors.primary, 0.4) },
            { offset: 1, color: withAlpha(game.colors.primary, 0) },
          ],
        },
      },
      {
        x: cardX,
        y: cardY,
        width: cardWidth,
        height: cardHeight,
        radius: 44 * s,
        shadowColor: PRIZE_CARD_PICTURE.shadow,
        shadowBlur: 60,
        shadowOffsetY: 24,
        fill: {
          kind: "linear",
          x0: cardX,
          y0: cardY,
          x1: cardX + cardWidth,
          y1: cardY + cardHeight,
          stops: [
            { offset: 0, color: PRIZE_CARD_PICTURE.baseFrom },
            { offset: 1, color: PRIZE_CARD_PICTURE.baseTo },
          ],
        },
      },
      {
        x: cardX,
        y: cardY,
        width: cardWidth,
        height: cardHeight,
        radius: 44 * s,
        fill: {
          kind: "radial",
          cx: cardX + cardWidth,
          cy: cardY,
          r: cardWidth * 0.6,
          stops: [
            { offset: 0, color: PRIZE_CARD_PICTURE.glowInner },
            { offset: 0.5, color: PRIZE_CARD_PICTURE.glowMid },
            { offset: 1, color: PRIZE_CARD_PICTURE.glowOuter },
          ],
        },
      },
      ...panel.shapes,
    ],
    images: [
      { src: LOGO_SRC, x: cardX + 40 * s, y: cardY + 36 * s, width: 120 * s, height: 120 * s },
      ...panel.images,
    ],
    textBlocks: [
      text({
        text: prepared.winLine,
        x: frame.width / 2,
        y: 0,
        centerY: (frame.top + cardY) / 2,
        maxWidth: frame.width - MARGIN * 2 - 32,
        font: displayFont(72),
        fitMinPx: 48,
        lineHeight: 84,
        maxLines: 3,
        color: WHITE,
        align: "center",
      }),
      text({
        text: face.label,
        x: cardX + cardWidth - inset,
        y: cardY + 92 * s,
        maxWidth: cardWidth * 0.55,
        font: bodyFont(800, STORY_TEXT_FLOOR_PX),
        color: PRIZE_CARD_PICTURE.labelText,
        align: "right",
      }),
      headlineBlock,
      ...(venueName
        ? [text({
            text: venueName.toUpperCase(),
            x: cardX + inset,
            y: cardY + cardHeight - 44 * s,
            maxWidth: cardWidth - inset * 2,
            font: bodyFont(800, STORY_TEXT_FLOOR_PX),
            color: PRIZE_CARD_PICTURE.venueText,
          })]
        : []),
      usernameBlock(prepared, frame, usernameY),
      ...panel.textBlocks,
    ],
  };
};

/** Night: near-black, one accent — the prize or the place huge, Andrew's line under it. */
const night = (prepared: PreparedStorySharePayload, frame: Frame): DesignParts => {
  const game = storyShareGame(prepared.payload.gameType);
  const accent = prepared.payload.isChampion && !prepared.payload.prize ? game.colors.champion : game.colors.primary;
  const panel = venuePanel(prepared, frame, { panelFill: "rgba(255, 255, 255, 0.06)", accent });
  const face = cardFace(prepared);
  const usernameY = panel.top - 64;
  const region = usernameY - 60 - frame.top;
  const heroY = frame.top + region * 0.28;
  const lineY = frame.top + region * 0.72;

  return {
    background: { kind: "solid", color: NIGHT_BACKGROUND },
    frameAssetUrl: null,
    shapes: [
      {
        x: 0,
        y: 0,
        width: frame.width,
        height: frame.height,
        fill: {
          kind: "radial",
          cx: 0,
          cy: frame.top,
          r: frame.width,
          stops: [
            { offset: 0, color: withAlpha(accent, 0.22) },
            { offset: 1, color: withAlpha(accent, 0) },
          ],
        },
      },
      ...panel.shapes,
    ],
    images: panel.images,
    textBlocks: [
      text({
        text: face.headline,
        x: frame.width / 2,
        y: 0,
        centerY: heroY,
        maxWidth: frame.width - MARGIN * 2,
        font: displayFont(face.kind === "amount" ? 260 : 120),
        fitMinPx: 72,
        lineHeight: face.kind === "amount" ? undefined : 132,
        maxLines: face.kind === "amount" ? 1 : 2,
        color: accent,
        align: "center",
      }),
      text({
        text: prepared.winLine,
        x: frame.width / 2,
        y: 0,
        centerY: lineY,
        maxWidth: frame.width - MARGIN * 2 - 32,
        font: bodyFont(800, 58),
        fitMinPx: 42,
        lineHeight: 70,
        maxLines: 3,
        color: WHITE,
        align: "center",
      }),
      usernameBlock(prepared, frame, usernameY),
      ...panel.textBlocks,
    ],
  };
};

/** Selfie: the photo, the game's frame (Story size only), Andrew's line on top, the panel below. */
const selfie = (prepared: PreparedStorySharePayload, frame: Frame, size: StoryShareSize): DesignParts => {
  const game = storyShareGame(prepared.payload.gameType);
  const panel = venuePanel(prepared, frame, { panelFill: "rgba(2, 6, 23, 0.55)", accent: game.colors.textSecondary, stroke: true });
  const readable = {
    strokeColor: "rgba(2, 6, 23, 0.72)",
    strokeWidth: 7,
    shadowColor: "rgba(0, 0, 0, 0.44)",
    shadowBlur: 8,
    shadowOffsetY: 3,
  };
  const stats = statsLine(prepared);
  const caption = prepared.caption;
  const usernameY = panel.top - 44;
  const statsY = usernameY - 58;
  const captionCenter = (stats ? statsY : usernameY) - 92;

  return {
    background: null,
    frameAssetUrl: size === "story" ? getStoryFrameAssetUrl(prepared.payload.gameType, prepared.templateVariant) : null,
    shapes: [
      {
        x: 0,
        y: 0,
        width: frame.width,
        height: frame.top + 460,
        fill: {
          kind: "linear",
          x0: 0,
          y0: 0,
          x1: 0,
          y1: frame.top + 460,
          stops: [
            { offset: 0, color: "rgba(2, 6, 23, 0.7)" },
            { offset: 1, color: "rgba(2, 6, 23, 0)" },
          ],
        },
      },
      {
        x: 0,
        y: panel.top - 360,
        width: frame.width,
        height: frame.height - (panel.top - 360),
        fill: {
          kind: "linear",
          x0: 0,
          y0: panel.top - 360,
          x1: 0,
          y1: frame.height,
          stops: [
            { offset: 0, color: "rgba(2, 6, 23, 0)" },
            { offset: 0.45, color: "rgba(2, 6, 23, 0.6)" },
            { offset: 1, color: "rgba(2, 6, 23, 0.8)" },
          ],
        },
      },
      ...panel.shapes,
    ],
    images: panel.images,
    textBlocks: [
      text({
        text: prepared.winLine,
        x: frame.width / 2,
        y: 0,
        centerY: frame.top + 140,
        maxWidth: frame.width - MARGIN * 2 - 32,
        font: displayFont(76),
        fitMinPx: 52,
        lineHeight: 88,
        maxLines: 3,
        color: WHITE,
        align: "center",
        ...readable,
      }),
      ...(caption
        ? [text({
            text: caption,
            x: frame.width / 2,
            y: 0,
            centerY: captionCenter,
            maxWidth: frame.width - MARGIN * 2 - 32,
            font: bodyFont(700, 40),
            lineHeight: 50,
            maxLines: 2,
            color: WHITE,
            align: "center",
            ...readable,
          })]
        : []),
      ...(stats
        ? [text({
            text: stats,
            x: frame.width / 2,
            y: statsY,
            maxWidth: frame.width - MARGIN * 2,
            font: bodyFont(800, 42),
            fitMinPx: STORY_TEXT_FLOOR_PX,
            color: game.colors.textSecondary,
            align: "center",
            ...readable,
          })]
        : []),
      usernameBlock(prepared, frame, usernameY, readable),
      ...panel.textBlocks,
    ],
  };
};

/** The ready-made designs a win offers, best first: a prize leads with its gift card. */
export const readyMadeDesignsFor = (prepared: Pick<PreparedStorySharePayload, "payload">): StoryShareDesign[] =>
  prepared.payload.prize ? ["card", "spotlight", "night"] : ["spotlight", "card", "night"];

/** THE picture for a design and size. */
export const buildShareDesignSpec = (
  prepared: PreparedStorySharePayload,
  design: StoryShareDesign,
  size: StoryShareSize,
  options: { mirrorPreview?: boolean } = {}
): StoryRenderSpec => {
  const frame = frameOf(size);
  const parts = design === "spotlight"
    ? spotlight(prepared, frame)
    : design === "card"
    ? card(prepared, frame)
    : design === "night"
    ? night(prepared, frame)
    : selfie(prepared, frame, size);
  return {
    width: frame.width,
    height: frame.height,
    mirrorPreview: options.mirrorPreview ?? true,
    ...parts,
  };
};
