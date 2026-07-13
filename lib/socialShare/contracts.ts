export type StoryShareGameType = "live-trivia" | "category-blitz";

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

export interface StorySharePayload {
  gameType: StoryShareGameType;
  venueId: string;
  venueName: string | null;
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
}

export interface StoryRenderSpec {
  width: number;
  height: number;
  mirrorPreview: boolean;
  frameAssetUrl: string;
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
