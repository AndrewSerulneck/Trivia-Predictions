import type { StoryShareGameType } from "./shareGames";

export type { StoryShareGameType } from "./shareGames";

export type StoryShareTemplateVariant =
  | "default"
  | "champion"
  | "top3"
  | "funny"
  | "minimal";

export type StoryShareFallbackMode =
  | "web-share"
  | "download"
  | "deep-link"
  | "copy-only";

export type CameraPermissionState =
  | "unknown"
  | "prompt"
  | "granted"
  | "denied"
  | "unsupported";

export type StoryCameraErrorCode =
  | "permission-denied"
  | "no-camera"
  | "insecure-context"
  | "unsupported-browser"
  | "unknown";

export interface StoryCameraSessionError {
  code: StoryCameraErrorCode;
  message: string;
  name?: string;
  cause?: unknown;
}

export interface StoryCameraSession {
  stream: MediaStream;
  constraints: MediaStreamConstraints;
  usedFallback: boolean;
  stop: () => void;
}

export type StorySharePipelineStatus =
  | "shared"
  | "unsupported"
  | "canceled"
  | "failed";

export interface StoryShareFileInput {
  blob: Blob;
  fileName?: string;
  fileType?: string;
}

export interface StoryShareRequest extends StoryShareFileInput {
  title?: string;
  text?: string;
  url?: string;
}

export interface StorySharePipelineResult {
  status: StorySharePipelineStatus;
  fallbackRecommended: boolean;
  file?: File;
  reason?: string;
  error?: unknown;
}

export type StorySaveImageStatus = "saved" | "unsupported" | "failed";

export interface StorySaveImageRequest extends StoryShareFileInput {
  objectUrl?: string;
}

export interface StorySaveImageResult {
  status: StorySaveImageStatus;
  reason?: string;
  error?: unknown;
}

export type StoryExternalAppTarget = "instagram" | "facebook";

export interface StoryExternalAppOption {
  target: StoryExternalAppTarget;
  label: string;
  appName: string;
  deepLinkUrl: string;
  webFallbackUrl: string;
  likelyAvailable: boolean;
  canAttachImage: false;
  guidance: string;
}

export type StoryExternalAppOpenStatus = "opened" | "unsupported" | "failed";

export interface StoryExternalAppOpenResult {
  status: StoryExternalAppOpenStatus;
  reason?: string;
  error?: unknown;
}

/**
 * A prize won, as the share picture shows it — the fields of `PrizeCardFace`
 * (lib/prizeCardFace.ts) the picture needs, never a coupon code, QR or card number.
 */
export interface StorySharePrize {
  headline: string;
  headlineKind: "amount" | "phrase";
  label: "GIFT CARD" | "PRIZE";
}

export interface StorySharePayload {
  gameType: StoryShareGameType;
  venueId: string;
  venueName: string | null;
  /** "1010 Pacific St" / "Brooklyn, NY" (shareVenue.ts); null = the picture shows the name only. */
  venueAddress?: StoryShareVenueAddress | null;
  /**
   * The bar's Instagram handle without the "@", only when the venue shows it (Phase 9e). Set by
   * `applyShareVenue` alone — never by a screen.
   */
  venueInstagram?: string | null;
  /** Set only for a prize win: the picture leads with the prize (Andrew's "off my tab" line). */
  prize?: StorySharePrize | null;
  userId: string;
  username: string;
  title: string;
  subtitle?: string | null;
  funnyCaption?: string | null;
  finalRank?: number | null;
  finalPoints?: number | null;
  correctRate?: number | null;
  isChampion?: boolean;
  achievedAtIso: string;
}

export interface StoryShareCapabilitySnapshot {
  hasMediaDevices: boolean;
  hasFrontCamera: boolean;
  canWebShare: boolean;
  canShareFiles: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isStandalone: boolean;
  instagramDeepLinkLikely: boolean;
  facebookDeepLinkLikely: boolean;
}

export interface StoryTextBlock {
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  font: string;
  color: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  lineHeight?: number;
  maxLines?: number;
  /** Shrink the font (in 4px steps, never below this) until the text fits `maxLines` untruncated. */
  fitMinPx?: number;
  /** Centre the wrapped lines vertically on this y instead of starting at `y`. */
  centerY?: number;
  /** Radians, clockwise, about (`x`, `centerY` ?? `y`). */
  rotate?: number;
  /** Extra px between letters (canvas `letterSpacing`; ignored where a browser lacks it). */
  letterSpacing?: number;
  /** 0–1. */
  opacity?: number;
}

export interface StoryShareVenueAddress {
  /** "1010 Pacific St" — the street only, never the full formatted address. */
  street: string | null;
  /** "Brooklyn, NY". */
  locality: string | null;
}

export interface StoryGradientStop {
  offset: number;
  color: string;
}

export type StoryFill =
  | { kind: "solid"; color: string }
  | { kind: "linear"; x0: number; y0: number; x1: number; y1: number; stops: StoryGradientStop[] }
  | { kind: "radial"; cx: number; cy: number; r: number; stops: StoryGradientStop[] };

export interface StoryStroke {
  color: string;
  width: number;
  cap?: CanvasLineCap;
  join?: CanvasLineJoin;
  /** As canvas `setLineDash`: [0.1, 29] with a round cap draws dots. */
  dash?: number[];
}

/** Draws a block at translate(x, y) · rotate · scale: its own coordinates are then local to (x, y). */
export interface StoryTransform {
  x: number;
  y: number;
  /** Radians, clockwise. */
  rotate?: number;
  scale?: number;
  /** Vertical scale, when it differs from `scale` (an elliptical glow). */
  scaleY?: number;
}

/**
 * A rounded rect, or any SVG path (`path`), filled and/or stroked. The game-themed Share to social
 * pictures (docs/game-themes-plan.md Phase 2) draw all their artwork with these, as vectors: no
 * rasterised SVG, so no font trap and nothing to load before a Reel frame is painted.
 */
export interface StoryShapeBlock {
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
  /** Absent: stroke only. */
  fill?: StoryFill;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetY?: number;
  /** SVG path data, drawn instead of the rounded rect (x/y/width/height are then unused). */
  path?: string;
  stroke?: StoryStroke;
  transform?: StoryTransform;
  /** 0–1. */
  opacity?: number;
  /** SVG path data the shape is clipped to, in the shape's own coordinates. */
  clip?: string;
}

export interface StoryImageBlock {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rounded-corner clip. */
  radius?: number;
  /** false for the QR code: whole-module scaling, never blurred. */
  smoothing?: boolean;
}

/**
 * One picture. Drawn in this order: the photo (or `background`), the frame, the backdrop, shapes, images,
 * then text — one renderer for every design and size (lib/socialShare/storyCanvas.ts).
 */
export interface StoryRenderSpec {
  width: number;
  height: number;
  mirrorPreview: boolean;
  /** The selfie frame artwork; null on the ready-made designs. */
  frameAssetUrl: string | null;
  /** Painted when there is no photo (the ready-made designs). */
  background?: StoryFill | null;
  /**
   * Decoration behind everything else (a game theme's spotlights, field, letter tiles): painted after
   * the background and frame, before `shapes`. Not content, so it may run outside the safe zone.
   */
  backdrop?: StoryBlocks | null;
  shapes?: StoryShapeBlock[];
  images?: StoryImageBlock[];
  textBlocks: StoryTextBlock[];
}

export interface StoryBlocks {
  shapes: StoryShapeBlock[];
  textBlocks: StoryTextBlock[];
}

export interface StoryShareFrameCaptureInput<FrameSource = unknown> {
  source: FrameSource;
  spec: StoryRenderSpec;
  exportMirrored?: boolean;
  outputType?: string;
  quality?: number;
}

export interface StorySharePlatformAdapter<
  FrameSource = unknown,
  CameraSession = unknown
> {
  id: string;
  detectCapabilities: () => StoryShareCapabilitySnapshot;
  getCameraPermissionState: () => Promise<CameraPermissionState>;
  requestFrontCameraSession: () => Promise<CameraSession>;
  captureFrame: (input: StoryShareFrameCaptureInput<FrameSource>) => Promise<Blob>;
  /** A ready-made design: no photo, the spec's own background. */
  renderDesign: (spec: StoryRenderSpec) => Promise<Blob>;
  createShareFile: (input: StoryShareFileInput) => File;
  canShareFile: (file: File) => boolean;
  shareImage: (request: StoryShareRequest) => Promise<StorySharePipelineResult>;
  saveImage: (request: StorySaveImageRequest) => StorySaveImageResult;
  getExternalAppOptions: (
    capabilities?: Pick<
      StoryShareCapabilitySnapshot,
      "isIOS" | "isAndroid" | "instagramDeepLinkLikely" | "facebookDeepLinkLikely"
    >
  ) => StoryExternalAppOption[];
  openExternalApp: (option: StoryExternalAppOption) => StoryExternalAppOpenResult;
}
