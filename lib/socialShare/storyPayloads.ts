import type { StoryRenderSpec, StoryShareGameType, StorySharePayload, StoryShareTemplateVariant } from "./contracts";
import { resolveStoryCaptionPreset, truncateStoryCaption } from "./copyPresets";
import { getStoryFrameAssetUrl, resolveStoryShareTemplateVariant } from "./storyAssets";

export interface BuildGameStorySharePayloadInput {
  venueId: string;
  venueName?: string | null;
  userId: string;
  username: string;
  finalRank?: number | null;
  finalPoints?: number | null;
  correctRate?: number | null;
  isChampion?: boolean;
  achievedAtIso?: string;
  subtitle?: string | null;
  funnyCaption?: string | null;
}

export interface PreparedStorySharePayload {
  payload: StorySharePayload;
  templateVariant: StoryShareTemplateVariant;
  frameAssetUrl: string;
  gameLabel: string;
  headline: string;
  subheadline: string;
  caption: string | null;
  stats: StoryShareStat[];
  visual: StoryShareVisualTheme;
  renderSpec: StoryRenderSpec;
}

export interface StoryShareStat {
  label: string;
  value: string;
}

export interface StoryShareVisualTheme {
  gameType: StoryShareGameType;
  primaryColor: string;
  secondaryColor: string;
  textSecondaryColor: string;
  championColor: string;
  previewClassName: string;
  badgeLabel: string;
  ctaLabel: string;
  faceSafeZoneHint: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface PrepareStorySharePayloadOptions {
  templateVariant?: StoryShareTemplateVariant | null;
  width?: number;
  height?: number;
  mirrorPreview?: boolean;
}

const DEFAULT_STORY_WIDTH = 1080;
const DEFAULT_STORY_HEIGHT = 1920;
const CANVAS_TEXT_SHADOW = "rgba(0, 0, 0, 0.44)";
const CANVAS_TEXT_STROKE = "rgba(2, 6, 23, 0.72)";

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeString(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function rankLabel(rank: number | null | undefined): string | null {
  if (rank == null || !Number.isFinite(rank) || rank < 1) {
    return null;
  }
  const wholeRank = Math.trunc(rank);
  const mod100 = wholeRank % 100;
  const suffix = mod100 >= 11 && mod100 <= 13
    ? "th"
    : wholeRank % 10 === 1
    ? "st"
    : wholeRank % 10 === 2
    ? "nd"
    : wholeRank % 10 === 3
    ? "rd"
    : "th";
  return `${wholeRank}${suffix}`;
}

function pointsLabel(points: number | null | undefined): string | null {
  if (points == null || !Number.isFinite(points)) {
    return null;
  }
  return `${Math.trunc(points).toLocaleString("en-US")} pts`;
}

function displayUsername(username: string): string {
  const normalized = normalizeString(username) ?? "player";
  const withoutAt = normalized.replace(/^@+/, "");
  return `@${withoutAt}`;
}

function displayVenueName(venueName: string | null | undefined): string {
  return normalizeString(venueName) ?? "Hightop";
}

function percentLabel(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function getGameLabel(gameType: StoryShareGameType): string {
  return gameType === "live-trivia" ? "Live Trivia" : "Category Blitz";
}

function getDefaultTitle(gameType: StoryShareGameType, isChampion?: boolean): string {
  if (isChampion) {
    return gameType === "live-trivia" ? "Trivia Champion" : "Blitz Champion";
  }
  return gameType === "live-trivia" ? "Live Trivia Victory" : "Category Blitz Run";
}

function getDefaultSubtitle(gameType: StoryShareGameType, venueName: string | null): string {
  const gameLabel = getGameLabel(gameType);
  return venueName ? `${gameLabel} at ${venueName}` : gameLabel;
}

function buildStats(payload: StorySharePayload): StoryShareStat[] {
  const stats: StoryShareStat[] = [];
  const rank = rankLabel(payload.finalRank);
  const points = pointsLabel(payload.finalPoints);
  const correctRate = percentLabel(payload.correctRate);

  if (rank) {
    stats.push({ label: "Rank", value: rank });
  }
  if (points) {
    stats.push({ label: "Score", value: points });
  }
  if (correctRate) {
    stats.push({ label: "Correct", value: correctRate });
  }

  return stats;
}

function buildCaption(payload: StorySharePayload, variant: StoryShareTemplateVariant): string | null {
  const funnyCaption = normalizeString(payload.funnyCaption);
  if (funnyCaption) {
    return truncateStoryCaption(funnyCaption);
  }
  return resolveStoryCaptionPreset(payload);
}

function getVisualTheme(
  gameType: StoryShareGameType,
  variant: StoryShareTemplateVariant
): StoryShareVisualTheme {
  const isChampion = variant === "champion";
  if (gameType === "category-blitz") {
    return {
      gameType,
      primaryColor: "#EC4899",
      secondaryColor: "#84CC16",
      textSecondaryColor: "#FCE7F3",
      championColor: "#F59E0B",
      previewClassName: isChampion ? "tp-story-theme-blitz tp-story-theme-champion" : "tp-story-theme-blitz",
      badgeLabel: isChampion ? "Blitz Champion" : "Category Blitz",
      ctaLabel: "Play Category Blitz",
      faceSafeZoneHint: { x: 240, y: 430, width: 600, height: 700 },
    };
  }

  return {
    gameType,
    primaryColor: "#8B5CF6",
    secondaryColor: "#06B6D4",
    textSecondaryColor: "#E9D5FF",
    championColor: "#F59E0B",
    previewClassName: isChampion ? "tp-story-theme-live tp-story-theme-champion" : "tp-story-theme-live",
    badgeLabel: isChampion ? "Trivia Champion" : "Live Trivia",
    ctaLabel: "Play at Hightop",
    faceSafeZoneHint: { x: 240, y: 560, width: 600, height: 800 },
  };
}

function buildRenderSpec(
  prepared: Omit<PreparedStorySharePayload, "renderSpec">,
  options: Required<Pick<PrepareStorySharePayloadOptions, "width" | "height" | "mirrorPreview">>
): StoryRenderSpec {
  const rank = rankLabel(prepared.payload.finalRank);
  const points = pointsLabel(prepared.payload.finalPoints);
  const correctRate = percentLabel(prepared.payload.correctRate);
  const username = displayUsername(prepared.payload.username);
  const venueName = displayVenueName(prepared.payload.venueName);
  const isChampion = prepared.templateVariant === "champion";
  const primary = prepared.visual.primaryColor;
  const secondary = prepared.visual.secondaryColor;
  const champion = prepared.visual.championColor;
  const textSecondary = prepared.visual.textSecondaryColor;
  const rankText = rank ? `${isChampion ? "CHAMPION  " : ""}${rank.toUpperCase()} PLACE` : prepared.headline.toUpperCase();
  const scoreText = points ?? prepared.gameLabel;
  const caption = prepared.caption ? truncateStoryCaption(prepared.caption) : null;
  const commonReadableText = {
    strokeColor: CANVAS_TEXT_STROKE,
    strokeWidth: 7,
    shadowColor: CANVAS_TEXT_SHADOW,
    shadowBlur: 8,
    shadowOffsetY: 3,
  };

  const sharedTopBlocks = [
    {
      text: "HIGHTOP",
      x: options.width / 2,
      y: 82,
      maxWidth: 520,
      font: "900 40px Inter, Geist, Arial, sans-serif",
      color: "rgba(255, 255, 255, 0.78)",
      align: "center" as CanvasTextAlign,
      baseline: "alphabetic" as CanvasTextBaseline,
    },
  ];

  const textBlocks = prepared.payload.gameType === "category-blitz"
    ? [
        ...sharedTopBlocks,
        {
          text: prepared.visual.badgeLabel.toUpperCase(),
          x: 76,
          y: 148,
          maxWidth: 760,
          font: "900 38px Inter, Geist, Arial, sans-serif",
          color: secondary,
          align: "left" as CanvasTextAlign,
          baseline: "alphabetic" as CanvasTextBaseline,
          ...commonReadableText,
        },
        {
          text: rankText,
          x: 96,
          y: 1358,
          maxWidth: 888,
          font: `italic 900 ${isChampion ? 82 : 68}px Inter, Geist, Arial, sans-serif`,
          color: isChampion ? champion : "#FFFFFF",
          align: "left" as CanvasTextAlign,
          baseline: "alphabetic" as CanvasTextBaseline,
          ...commonReadableText,
        },
        {
          text: scoreText,
          x: 96,
          y: 1430,
          maxWidth: 888,
          font: "700 54px SF Mono, Monaco, Consolas, monospace",
          color: primary,
          align: "left" as CanvasTextAlign,
          baseline: "alphabetic" as CanvasTextBaseline,
          ...commonReadableText,
        },
        ...(correctRate
          ? [{
              text: `${correctRate} CORRECT`,
              x: 96,
              y: 1492,
              maxWidth: 888,
              font: "700 34px SF Mono, Monaco, Consolas, monospace",
              color: secondary,
              align: "left" as CanvasTextAlign,
              baseline: "alphabetic" as CanvasTextBaseline,
              ...commonReadableText,
            }]
          : []),
        ...(caption
          ? [{
              text: caption,
              x: 96,
              y: 1668,
              maxWidth: 820,
              font: "700 36px Inter, Geist, Arial, sans-serif",
              color: "#FFFFFF",
              align: "left" as CanvasTextAlign,
              baseline: "alphabetic" as CanvasTextBaseline,
              lineHeight: 44,
              maxLines: 2,
              ...commonReadableText,
            }]
          : []),
        {
          text: `${username}  -  ${venueName}`,
          x: 96,
          y: 1796,
          maxWidth: 888,
          font: "600 32px Inter, Geist, Arial, sans-serif",
          color: textSecondary,
          align: "left" as CanvasTextAlign,
          baseline: "alphabetic" as CanvasTextBaseline,
          ...commonReadableText,
        },
      ]
    : [
        ...sharedTopBlocks,
    {
          text: rankText,
          x: options.width / 2,
          y: 178,
      maxWidth: 888,
          font: `900 ${isChampion ? 86 : 72}px Inter, Geist, Arial, sans-serif`,
          color: isChampion ? champion : "#FFFFFF",
          align: "center" as CanvasTextAlign,
      baseline: "alphabetic" as CanvasTextBaseline,
          ...commonReadableText,
    },
    {
          text: scoreText,
          x: options.width / 2,
          y: 250,
      maxWidth: 888,
          font: "700 58px SF Mono, Monaco, Consolas, monospace",
          color: primary,
          align: "center" as CanvasTextAlign,
      baseline: "alphabetic" as CanvasTextBaseline,
          ...commonReadableText,
    },
        {
          text: username,
          x: 96,
          y: 1488,
          maxWidth: 888,
          font: "700 38px Inter, Geist, Arial, sans-serif",
          color: "#FFFFFF",
          align: "left" as CanvasTextAlign,
          baseline: "alphabetic" as CanvasTextBaseline,
          ...commonReadableText,
        },
        {
          text: venueName,
          x: 96,
          y: 1542,
          maxWidth: 888,
          font: "500 30px Inter, Geist, Arial, sans-serif",
          color: textSecondary,
          align: "left" as CanvasTextAlign,
          baseline: "alphabetic" as CanvasTextBaseline,
          ...commonReadableText,
        },
        ...(correctRate
      ? [{
              text: `${correctRate} CORRECT`,
          x: 96,
              y: 1624,
          maxWidth: 888,
              font: "700 34px SF Mono, Monaco, Consolas, monospace",
              color: secondary,
          align: "left" as CanvasTextAlign,
          baseline: "alphabetic" as CanvasTextBaseline,
              ...commonReadableText,
        }]
      : []),
        ...(caption
          ? [{
              text: caption,
              x: 96,
              y: 1710,
              maxWidth: 820,
              font: "700 38px Inter, Geist, Arial, sans-serif",
              color: "#FFFFFF",
              align: "left" as CanvasTextAlign,
              baseline: "alphabetic" as CanvasTextBaseline,
              lineHeight: 46,
              maxLines: 2,
              ...commonReadableText,
            }]
          : []),
        {
          text: prepared.visual.ctaLabel.toUpperCase(),
          x: options.width / 2,
          y: 1840,
          maxWidth: 720,
          font: "700 24px Inter, Geist, Arial, sans-serif",
          color: "rgba(255, 255, 255, 0.72)",
          align: "center" as CanvasTextAlign,
          baseline: "alphabetic" as CanvasTextBaseline,
        },
      ];

  return {
    width: options.width,
    height: options.height,
    mirrorPreview: options.mirrorPreview,
    frameAssetUrl: prepared.frameAssetUrl,
    textBlocks,
  };
}

export function buildLiveTriviaStorySharePayload(input: BuildGameStorySharePayloadInput): StorySharePayload {
  const venueName = normalizeString(input.venueName);
  const isChampion = input.isChampion ?? input.finalRank === 1;
  return {
    gameType: "live-trivia",
    venueId: input.venueId,
    venueName,
    userId: input.userId,
    username: input.username,
    title: getDefaultTitle("live-trivia", isChampion),
    subtitle: input.subtitle ?? getDefaultSubtitle("live-trivia", venueName),
    funnyCaption: input.funnyCaption ?? null,
    finalRank: input.finalRank ?? null,
    finalPoints: input.finalPoints ?? null,
    correctRate: input.correctRate ?? null,
    isChampion,
    achievedAtIso: input.achievedAtIso ?? nowIso(),
  };
}

export function buildCategoryBlitzStorySharePayload(input: BuildGameStorySharePayloadInput): StorySharePayload {
  const venueName = normalizeString(input.venueName);
  const isChampion = input.isChampion ?? input.finalRank === 1;
  return {
    gameType: "category-blitz",
    venueId: input.venueId,
    venueName,
    userId: input.userId,
    username: input.username,
    title: getDefaultTitle("category-blitz", isChampion),
    subtitle: input.subtitle ?? getDefaultSubtitle("category-blitz", venueName),
    funnyCaption: input.funnyCaption ?? null,
    finalRank: input.finalRank ?? null,
    finalPoints: input.finalPoints ?? null,
    correctRate: input.correctRate ?? null,
    isChampion,
    achievedAtIso: input.achievedAtIso ?? nowIso(),
  };
}

export function prepareStorySharePayload(
  payload: StorySharePayload,
  options: PrepareStorySharePayloadOptions = {}
): PreparedStorySharePayload {
  const templateVariant = resolveStoryShareTemplateVariant(payload, options.templateVariant);
  const frameAssetUrl = getStoryFrameAssetUrl(payload.gameType, templateVariant);
  const gameLabel = getGameLabel(payload.gameType);
  const stats = buildStats(payload);
  const headline = normalizeString(payload.title) ?? getDefaultTitle(payload.gameType, payload.isChampion);
  const subheadline = normalizeString(payload.subtitle) ?? getDefaultSubtitle(payload.gameType, payload.venueName);
  const caption = buildCaption(payload, templateVariant);
  const visual = getVisualTheme(payload.gameType, templateVariant);
  const preparedWithoutRenderSpec = {
    payload,
    templateVariant,
    frameAssetUrl,
    gameLabel,
    headline,
    subheadline,
    caption,
    stats,
    visual,
  };

  return {
    ...preparedWithoutRenderSpec,
    renderSpec: buildRenderSpec(preparedWithoutRenderSpec, {
      width: options.width ?? DEFAULT_STORY_WIDTH,
      height: options.height ?? DEFAULT_STORY_HEIGHT,
      mirrorPreview: options.mirrorPreview ?? true,
    }),
  };
}
