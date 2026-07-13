import type { StoryRenderSpec, StoryTextBlock } from "./contracts";

export type StoryCanvasErrorCode =
  | "missing-video-dimensions"
  | "invalid-source-dimensions"
  | "missing-2d-context"
  | "asset-load-failed"
  | "canvas-export-failed"
  | "unsupported-canvas";

export interface StoryCanvasErrorOptions {
  code: StoryCanvasErrorCode;
  message: string;
  cause?: unknown;
}

export interface CoverCropRect {
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
  dx: number;
  dy: number;
  dWidth: number;
  dHeight: number;
  scale: number;
}

export interface RenderStoryImageInput {
  source: CanvasImageSource;
  spec: StoryRenderSpec;
  exportMirrored?: boolean;
  outputType?: string;
  quality?: number;
}

interface SourceDimensions {
  width: number;
  height: number;
  kind: "video" | "image";
}

const DEFAULT_OUTPUT_TYPE = "image/png";

export class StoryCanvasRenderError extends Error {
  readonly code: StoryCanvasErrorCode;
  readonly cause?: unknown;

  constructor({ code, message, cause }: StoryCanvasErrorOptions) {
    super(message);
    this.name = "StoryCanvasRenderError";
    this.code = code;
    this.cause = cause;
  }
}

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function readNumber(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function getSourceDimensions(source: CanvasImageSource): SourceDimensions {
  if ("videoWidth" in source || "videoHeight" in source) {
    const width = readNumber((source as { videoWidth?: unknown }).videoWidth);
    const height = readNumber((source as { videoHeight?: unknown }).videoHeight);
    if (!isFinitePositive(width) || !isFinitePositive(height)) {
      throw new StoryCanvasRenderError({
        code: "missing-video-dimensions",
        message: "The video source does not have usable frame dimensions yet.",
      });
    }
    return { width, height, kind: "video" };
  }

  if ("naturalWidth" in source || "naturalHeight" in source) {
    const width = readNumber((source as { naturalWidth?: unknown }).naturalWidth);
    const height = readNumber((source as { naturalHeight?: unknown }).naturalHeight);
    if (isFinitePositive(width) && isFinitePositive(height)) {
      return { width, height, kind: "image" };
    }
  }

  const width = readNumber((source as { width?: unknown }).width);
  const height = readNumber((source as { height?: unknown }).height);
  if (!isFinitePositive(width) || !isFinitePositive(height)) {
    throw new StoryCanvasRenderError({
      code: "invalid-source-dimensions",
      message: "The image source does not have usable dimensions.",
    });
  }

  return { width, height, kind: "image" };
}

export function calculateCoverCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): CoverCropRect {
  if (
    !isFinitePositive(sourceWidth) ||
    !isFinitePositive(sourceHeight) ||
    !isFinitePositive(targetWidth) ||
    !isFinitePositive(targetHeight)
  ) {
    throw new StoryCanvasRenderError({
      code: "invalid-source-dimensions",
      message: "Cover crop dimensions must all be positive finite numbers.",
    });
  }

  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const sWidth = targetWidth / scale;
  const sHeight = targetHeight / scale;

  return {
    sx: (sourceWidth - sWidth) / 2,
    sy: (sourceHeight - sHeight) / 2,
    sWidth,
    sHeight,
    dx: 0,
    dy: 0,
    dWidth: targetWidth,
    dHeight: targetHeight,
    scale,
  };
}

function createExportCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    throw new StoryCanvasRenderError({
      code: "unsupported-canvas",
      message: "Canvas rendering requires a browser document.",
    });
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    throw new StoryCanvasRenderError({
      code: "missing-2d-context",
      message: "Unable to create a 2D canvas context.",
    });
  }
  return context;
}

function loadFrameAsset(src: string): Promise<HTMLImageElement> {
  if (typeof Image === "undefined") {
    return Promise.reject(new StoryCanvasRenderError({
      code: "asset-load-failed",
      message: "Image loading is unavailable in this environment.",
    }));
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new StoryCanvasRenderError({
      code: "asset-load-failed",
      message: `Failed to load story frame asset: ${src}`,
    }));
    image.src = src;
  });
}

function drawCoverSource(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  crop: CoverCropRect,
  mirrored: boolean
): void {
  context.save();
  if (mirrored) {
    context.translate(crop.dWidth, 0);
    context.scale(-1, 1);
  }
  context.drawImage(
    source,
    crop.sx,
    crop.sy,
    crop.sWidth,
    crop.sHeight,
    crop.dx,
    crop.dy,
    crop.dWidth,
    crop.dHeight
  );
  context.restore();
}

function estimateTextWidth(context: CanvasRenderingContext2D, text: string): number {
  if (typeof context.measureText === "function") {
    return context.measureText(text).width;
  }
  const fontSizeMatch = context.font.match(/(\d+(?:\.\d+)?)px/);
  const fontSize = fontSizeMatch ? Number.parseFloat(fontSizeMatch[1]) : 32;
  return text.length * fontSize * 0.56;
}

function wrapTextBlockLines(context: CanvasRenderingContext2D, block: StoryTextBlock): string[] {
  const maxLines = block.maxLines ?? 1;
  if (maxLines <= 1) return [block.text];

  const words = block.text.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (estimateTextWidth(context, nextLine) <= block.maxWidth || !currentLine) {
      currentLine = nextLine;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;
    if (lines.length === maxLines) break;
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  if (lines.length === maxLines && words.length > 0) {
    const consumed = lines.join(" ").split(/\s+/).length;
    if (consumed < words.length) {
      lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.,!?;:]+$/, "")}...`;
    }
  }

  return lines.length > 0 ? lines : [block.text];
}

function drawTextBlock(context: CanvasRenderingContext2D, block: StoryTextBlock): void {
  context.save();
  context.font = block.font;
  context.fillStyle = block.color;
  context.textAlign = block.align ?? "left";
  context.textBaseline = block.baseline ?? "alphabetic";
  if (block.shadowColor) {
    context.shadowColor = block.shadowColor;
    context.shadowBlur = block.shadowBlur ?? 0;
    context.shadowOffsetX = block.shadowOffsetX ?? 0;
    context.shadowOffsetY = block.shadowOffsetY ?? 0;
  }

  const lines = wrapTextBlockLines(context, block);
  const lineHeight = block.lineHeight ?? 0;

  if (block.strokeColor && block.strokeWidth && block.strokeWidth > 0) {
    context.strokeStyle = block.strokeColor;
    context.lineWidth = block.strokeWidth;
    context.lineJoin = "round";
    lines.forEach((line, index) => {
      context.strokeText(line, block.x, block.y + lineHeight * index, block.maxWidth);
    });
  }

  lines.forEach((line, index) => {
    context.fillText(line, block.x, block.y + lineHeight * index, block.maxWidth);
  });
  context.restore();
}

function exportCanvasBlob(canvas: HTMLCanvasElement, outputType: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new StoryCanvasRenderError({
          code: "canvas-export-failed",
          message: "Canvas export did not produce an image blob.",
        }));
        return;
      }
      resolve(blob);
    }, outputType, quality);
  });
}

export async function renderStoryImage({
  source,
  spec,
  exportMirrored = false,
  outputType = DEFAULT_OUTPUT_TYPE,
  quality,
}: RenderStoryImageInput): Promise<Blob> {
  const canvas = createExportCanvas(spec.width, spec.height);
  const context = getCanvasContext(canvas);
  const dimensions = getSourceDimensions(source);
  const crop = calculateCoverCrop(dimensions.width, dimensions.height, spec.width, spec.height);
  const frameImage = await loadFrameAsset(spec.frameAssetUrl);

  context.clearRect(0, 0, spec.width, spec.height);
  drawCoverSource(context, source, crop, exportMirrored);
  context.drawImage(frameImage, 0, 0, spec.width, spec.height);
  for (const textBlock of spec.textBlocks) {
    drawTextBlock(context, textBlock);
  }

  return exportCanvasBlob(canvas, outputType, quality);
}
