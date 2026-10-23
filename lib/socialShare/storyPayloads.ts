import type {
  StoryRenderSpec,
  StoryShareGameType,
  StorySharePayload,
  StorySharePrize,
  StoryShareTemplateVariant,
  StoryShareVenueAddress,
} from "./contracts";
import { resolveStoryCaptionPreset, shareWinHeadline, shareWinText, truncateStoryCaption } from "./copyPresets";
import { buildShareDesignSpec, type StoryShareSize } from "./shareDesigns";
import { storyShareGame, type StoryShareResultField } from "./shareGames";
import { getStoryFrameAssetUrl, resolveStoryShareTemplateVariant } from "./storyAssets";

export interface BuildGameStorySharePayloadInput {
  venueId: string;
  venueName?: string | null;
  venueAddress?: StoryShareVenueAddress | null;
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

export interface BuildPrizeStorySharePayloadInput {
  venueId: string;
  venueName?: string | null;
  venueAddress?: StoryShareVenueAddress | null;
  userId: string;
  username: string;
  /** From `prizeCardFace(win, venueName)` — the card's headline, kind and label only. */
  prize: StorySharePrize;
  achievedAtIso?: string;
}

export interface PreparedStorySharePayload {
  payload: StorySharePayload;
  templateVariant: StoryShareTemplateVariant;
  /** The selfie frame (Story size); null when the game has none. */
  frameAssetUrl: string | null;
  gameLabel: string;
  headline: string;
  subheadline: string;
  /** Andrew's line, the headline of every picture: "I just won $15 off my tab at The Pour House!". */
  winLine: string;
  /** The words that travel with the picture to the share target. */
  shareText: string;
  /** "@ace". */
  displayUsername: string;
  caption: string | null;
  stats: StoryShareStat[];
  visual: StoryShareVisualTheme;
  /** The selfie picture at the prepared size (the camera flow captures into it). */
  renderSpec: StoryRenderSpec;
}

export interface StoryShareStat {
  field: StoryShareResultField;
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
  /** Story (1080×1920, the default) or feed post (1080×1350). */
  size?: StoryShareSize;
  mirrorPreview?: boolean;
}

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

function pointsLabel(points: number | null | undefined, unit: string): string | null {
  if (points == null || !Number.isFinite(points)) {
    return null;
  }
  return `${Math.trunc(points).toLocaleString("en-US")} ${unit}`;
}

function displayUsername(username: string): string {
  const normalized = normalizeString(username) ?? "player";
  const withoutAt = normalized.replace(/^@+/, "");
  return `@${withoutAt}`;
}

function percentLabel(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function getDefaultTitle(gameType: StoryShareGameType, isChampion?: boolean): string {
  const game = storyShareGame(gameType);
  return isChampion ? game.championTitle : game.runTitle;
}

function getDefaultSubtitle(gameType: StoryShareGameType, venueName: string | null): string {
  const gameLabel = storyShareGame(gameType).label;
  return venueName ? `${gameLabel} at ${venueName}` : gameLabel;
}

function buildStats(payload: StorySharePayload): StoryShareStat[] {
  const stats: StoryShareStat[] = [];
  const rank = rankLabel(payload.finalRank);
  const points = pointsLabel(payload.finalPoints, storyShareGame(payload.gameType).pointsUnit);
  const correctRate = percentLabel(payload.correctRate);

  if (rank) {
    stats.push({ field: "rank", label: "Rank", value: rank });
  }
  if (points) {
    stats.push({ field: "points", label: "Score", value: points });
  }
  if (correctRate) {
    stats.push({ field: "correct", label: "Correct", value: correctRate });
  }

  return stats;
}

function buildCaption(payload: StorySharePayload): string | null {
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
  const game = storyShareGame(gameType);
  return {
    gameType,
    primaryColor: game.colors.primary,
    secondaryColor: game.colors.secondary,
    textSecondaryColor: game.colors.textSecondary,
    championColor: game.colors.champion,
    previewClassName: isChampion ? `${game.previewClassName} tp-story-theme-champion` : game.previewClassName,
    badgeLabel: isChampion ? game.championBadgeLabel : game.badgeLabel,
    ctaLabel: game.ctaLabel,
    faceSafeZoneHint: game.faceSafeZoneHint,
  };
}

/** A game's share payload. Every game in the registry builds through this one function. */
export function buildStorySharePayload(
  gameType: StoryShareGameType,
  input: BuildGameStorySharePayloadInput
): StorySharePayload {
  const venueName = normalizeString(input.venueName);
  const isChampion = input.isChampion ?? input.finalRank === 1;
  return {
    gameType,
    venueId: input.venueId,
    venueName,
    venueAddress: input.venueAddress ?? null,
    prize: null,
    userId: input.userId,
    username: input.username,
    title: getDefaultTitle(gameType, isChampion),
    subtitle: input.subtitle ?? getDefaultSubtitle(gameType, venueName),
    funnyCaption: input.funnyCaption ?? null,
    finalRank: input.finalRank ?? null,
    finalPoints: input.finalPoints ?? null,
    correctRate: input.correctRate ?? null,
    isChampion,
    achievedAtIso: input.achievedAtIso ?? nowIso(),
  };
}

export function buildLiveTriviaStorySharePayload(input: BuildGameStorySharePayloadInput): StorySharePayload {
  return buildStorySharePayload("live-trivia", input);
}

export function buildCategoryBlitzStorySharePayload(input: BuildGameStorySharePayloadInput): StorySharePayload {
  return buildStorySharePayload("category-blitz", input);
}

/** A prize won: the picture leads with the prize, never a code, QR or card number. */
export function buildPrizeStorySharePayload(input: BuildPrizeStorySharePayloadInput): StorySharePayload {
  const venueName = normalizeString(input.venueName);
  return {
    gameType: "prize",
    venueId: input.venueId,
    venueName,
    venueAddress: input.venueAddress ?? null,
    prize: { headline: input.prize.headline, headlineKind: input.prize.headlineKind, label: input.prize.label },
    userId: input.userId,
    username: input.username,
    title: getDefaultTitle("prize", true),
    subtitle: getDefaultSubtitle("prize", venueName),
    funnyCaption: null,
    finalRank: null,
    finalPoints: null,
    correctRate: null,
    isChampion: true,
    achievedAtIso: input.achievedAtIso ?? nowIso(),
  };
}

export function prepareStorySharePayload(
  payload: StorySharePayload,
  options: PrepareStorySharePayloadOptions = {}
): PreparedStorySharePayload {
  const templateVariant = resolveStoryShareTemplateVariant(payload, options.templateVariant);
  const winLine = shareWinHeadline(payload);
  const prepared: Omit<PreparedStorySharePayload, "renderSpec"> = {
    payload,
    templateVariant,
    frameAssetUrl: getStoryFrameAssetUrl(payload.gameType, templateVariant),
    gameLabel: storyShareGame(payload.gameType).label,
    headline: normalizeString(payload.title) ?? getDefaultTitle(payload.gameType, payload.isChampion),
    subheadline: normalizeString(payload.subtitle) ?? getDefaultSubtitle(payload.gameType, payload.venueName),
    winLine,
    shareText: shareWinText(winLine, payload.venueInstagram),
    displayUsername: displayUsername(payload.username),
    caption: buildCaption(payload),
    stats: buildStats(payload),
    visual: getVisualTheme(payload.gameType, templateVariant),
  };
  return {
    ...prepared,
    renderSpec: buildShareDesignSpec(prepared, "selfie", options.size ?? "story", {
      mirrorPreview: options.mirrorPreview,
    }),
  };
}
