import type { StoryFill, StoryImageBlock, StoryRenderSpec, StoryShapeBlock, StoryTextBlock } from "./contracts";

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
  /** The selfie; absent for a ready-made design (the spec's `background` is painted instead). */
  source?: CanvasImageSource | null;
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

function loadImageAsset(src: string): Promise<HTMLImageElement> {
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
      message: `Failed to load story image asset: ${src}`,
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
  return wrapWords(context, block, maxLines).lines;
}

function wrapWords(
  context: CanvasRenderingContext2D,
  block: StoryTextBlock,
  maxLines: number
): { lines: string[]; truncated: boolean } {
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

  let truncated = false;
  if (lines.length === maxLines && words.length > 0) {
    const consumed = lines.join(" ").split(/\s+/).length;
    if (consumed < words.length) {
      truncated = true;
      lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.,!?;:]+$/, "")}...`;
    }
  }

  return { lines: lines.length > 0 ? lines : [block.text], truncated };
}

const FONT_PX = /(\d+(?:\.\d+)?)px/;

function fontPx(font: string): number | null {
  const match = font.match(FONT_PX);
  return match ? Number.parseFloat(match[1]) : null;
}

/**
 * `fitMinPx`: step the font down 4px at a time (never below the floor) until the text fits —
 * every word within `maxLines`, and a one-line block within `maxWidth`. Below the floor the
 * last line ends in "..." / fillText squeezes it, which beats text too small to read.
 */
function fitTextBlock(context: CanvasRenderingContext2D, block: StoryTextBlock): StoryTextBlock {
  const startPx = fontPx(block.font);
  const minPx = block.fitMinPx;
  if (minPx == null || startPx == null) return block;
  const maxLines = block.maxLines ?? 1;
  let px = startPx;
  let font = block.font;
  for (;;) {
    context.font = font;
    const fits = maxLines <= 1
      ? estimateTextWidth(context, block.text) <= block.maxWidth
      : !wrapWords(context, block, maxLines).truncated;
    const next = px - 4;
    if (fits || next < minPx) break;
    const scale = next / px;
    px = next;
    font = block.font.replace(FONT_PX, `${px}px`);
    block = { ...block, lineHeight: block.lineHeight ? block.lineHeight * scale : block.lineHeight };
  }
  return { ...block, font };
}

function drawTextBlock(context: CanvasRenderingContext2D, sourceBlock: StoryTextBlock): void {
  context.save();
  const block = fitTextBlock(context, sourceBlock);
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
  // centerY: the block's lines sit centred on it (alphabetic baselines, ~0.35em below centre).
  const startY = block.centerY == null
    ? block.y
    : block.centerY - (lineHeight * (lines.length - 1)) / 2 + (fontPx(block.font) ?? 0) * 0.35;

  if (block.strokeColor && block.strokeWidth && block.strokeWidth > 0) {
    context.strokeStyle = block.strokeColor;
    context.lineWidth = block.strokeWidth;
    context.lineJoin = "round";
    lines.forEach((line, index) => {
      context.strokeText(line, block.x, startY + lineHeight * index, block.maxWidth);
    });
  }

  lines.forEach((line, index) => {
    context.fillText(line, block.x, startY + lineHeight * index, block.maxWidth);
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

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function fillStyleOf(context: CanvasRenderingContext2D, fill: StoryFill): string | CanvasGradient {
  if (fill.kind === "solid") return fill.color;
  const gradient = fill.kind === "linear"
    ? context.createLinearGradient(fill.x0, fill.y0, fill.x1, fill.y1)
    : context.createRadialGradient(fill.cx, fill.cy, 0, fill.cx, fill.cy, fill.r);
  for (const stop of fill.stops) gradient.addColorStop(stop.offset, stop.color);
  return gradient;
}

function drawShape(context: CanvasRenderingContext2D, shape: StoryShapeBlock): void {
  context.save();
  if (shape.shadowColor) {
    context.shadowColor = shape.shadowColor;
    context.shadowBlur = shape.shadowBlur ?? 0;
    context.shadowOffsetY = shape.shadowOffsetY ?? 0;
  }
  context.fillStyle = fillStyleOf(context, shape.fill);
  roundedRectPath(context, shape.x, shape.y, shape.width, shape.height, shape.radius ?? 0);
  context.fill();
  context.restore();
}

function drawImageBlock(context: CanvasRenderingContext2D, block: StoryImageBlock, image: HTMLImageElement): void {
  context.save();
  if (block.radius) {
    roundedRectPath(context, block.x, block.y, block.width, block.height, block.radius);
    context.clip();
  }
  context.imageSmoothingEnabled = block.smoothing !== false;
  context.drawImage(image, block.x, block.y, block.width, block.height);
  context.restore();
}

/**
 * A font may name the app's next/font families as `var(--ht-font-display)` /
 * `var(--ht-font-body)` (never a literal family name — CLAUDE.md "Fonts"). Canvas can't read
 * CSS variables, so they are swapped for the computed value on <html>, which carries the
 * metric-matched fallback too. Outside the app (no variable set) the font's own fallback list wins.
 */
function resolveCanvasFont(font: string): string {
  if (!font.includes("var(")) return font;
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const style = root && typeof getComputedStyle === "function" ? getComputedStyle(root) : null;
  return font
    .replace(/var\((--[\w-]+)\)\s*,?\s*/g, (_match, name: string) => {
      const value = style?.getPropertyValue(name).trim();
      return value ? `${value}, ` : "";
    })
    .replace(/,\s*$/, "");
}

/** Waits (bounded) for the webfonts the text needs, so the first picture isn't in a fallback face. */
async function loadCanvasFonts(fonts: string[]): Promise<void> {
  const faces = typeof document !== "undefined" ? (document as Document & { fonts?: FontFaceSet }).fonts : undefined;
  if (!faces || typeof faces.load !== "function") return;
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2500));
  await Promise.race([
    Promise.all([...new Set(fonts)].map((font) => faces.load(font).catch(() => []))).then(() => undefined),
    timeout,
  ]);
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
  const crop = source
    ? (() => {
        const dimensions = getSourceDimensions(source);
        return calculateCoverCrop(dimensions.width, dimensions.height, spec.width, spec.height);
      })()
    : null;
  const textBlocks = spec.textBlocks.map((block) => ({ ...block, font: resolveCanvasFont(block.font) }));
  const imageBlocks = spec.images ?? [];
  const sources = [...new Set([...(spec.frameAssetUrl ? [spec.frameAssetUrl] : []), ...imageBlocks.map((block) => block.src)])];
  const [loaded] = await Promise.all([
    Promise.all(sources.map(async (src) => [src, await loadImageAsset(src)] as const)),
    loadCanvasFonts(textBlocks.map((block) => block.font)),
  ]);
  const images = new Map(loaded);

  context.clearRect(0, 0, spec.width, spec.height);
  if (source && crop) {
    drawCoverSource(context, source, crop, exportMirrored);
  } else if (spec.background) {
    context.fillStyle = fillStyleOf(context, spec.background);
    context.fillRect(0, 0, spec.width, spec.height);
  }
  if (spec.frameAssetUrl) {
    const frameImage = images.get(spec.frameAssetUrl);
    if (frameImage) context.drawImage(frameImage, 0, 0, spec.width, spec.height);
  }
  for (const shape of spec.shapes ?? []) {
    drawShape(context, shape);
  }
  for (const block of imageBlocks) {
    const image = images.get(block.src);
    if (image) drawImageBlock(context, block, image);
  }
  for (const textBlock of textBlocks) {
    drawTextBlock(context, textBlock);
  }

  return exportCanvasBlob(canvas, outputType, quality);
}
