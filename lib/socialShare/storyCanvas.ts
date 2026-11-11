import type { StoryBlocks, StoryEffectLayers, StoryFill, StoryImageBlock, StoryRenderSpec, StoryShapeBlock, StoryTextBlock, StoryTransform } from "./contracts";

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

/** Canvas `letterSpacing` where the browser has it (Safari 18.4+, Chrome 99+); a no-op elsewhere. */
function setLetterSpacing(context: CanvasRenderingContext2D, px: number | undefined): void {
  if (!px) return;
  const spaced = context as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in spaced) spaced.letterSpacing = `${px}px`;
}

function drawTextBlock(context: CanvasRenderingContext2D, sourceBlock: StoryTextBlock): void {
  context.save();
  setLetterSpacing(context, sourceBlock.letterSpacing);
  const block = fitTextBlock(context, sourceBlock);
  context.font = block.font;
  context.fillStyle = block.color;
  context.textAlign = block.align ?? "left";
  context.textBaseline = block.baseline ?? "alphabetic";
  if (block.opacity != null) context.globalAlpha *= block.opacity;
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

  // Letter spacing is added after every letter, the last one too: shift centred/right text back.
  const spacing = block.letterSpacing ?? 0;
  const align = block.align ?? "left";
  const shift = align === "center" ? spacing / 2 : align === "right" || align === "end" ? spacing : 0;
  let x = block.x + shift;
  let y = startY;
  if (block.rotate) {
    const pivotY = block.centerY ?? block.y;
    context.translate(block.x, pivotY);
    context.rotate(block.rotate);
    x = shift;
    y = startY - pivotY;
  }

  if (block.strokeColor && block.strokeWidth && block.strokeWidth > 0) {
    context.strokeStyle = block.strokeColor;
    context.lineWidth = block.strokeWidth;
    context.lineJoin = "round";
    lines.forEach((line, index) => {
      context.strokeText(line, x, y + lineHeight * index, block.maxWidth);
    });
  }

  lines.forEach((line, index) => {
    context.fillText(line, x, y + lineHeight * index, block.maxWidth);
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

function applyTransform(context: CanvasRenderingContext2D, transform: StoryTransform): void {
  context.translate(transform.x, transform.y);
  if (transform.rotate) context.rotate(transform.rotate);
  const scale = transform.scale ?? 1;
  const scaleY = transform.scaleY ?? scale;
  if (scale !== 1 || scaleY !== 1) context.scale(scale, scaleY);
}

const canDrawPaths = (): boolean => typeof Path2D !== "undefined";

function drawShape(context: CanvasRenderingContext2D, shape: StoryShapeBlock): void {
  if ((shape.path || shape.clip) && !canDrawPaths()) return;
  context.save();
  if (shape.opacity != null) context.globalAlpha *= shape.opacity;
  if (shape.composite) context.globalCompositeOperation = shape.composite;
  if (shape.transform) applyTransform(context, shape.transform);
  if (shape.clip) context.clip(new Path2D(shape.clip));
  if (shape.shadowColor) {
    context.shadowColor = shape.shadowColor;
    context.shadowBlur = shape.shadowBlur ?? 0;
    context.shadowOffsetY = shape.shadowOffsetY ?? 0;
  }
  const path = shape.path ? new Path2D(shape.path) : null;
  if (!path) roundedRectPath(context, shape.x, shape.y, shape.width, shape.height, shape.radius ?? 0);
  if (shape.fill) {
    context.fillStyle = fillStyleOf(context, shape.fill);
    if (path) context.fill(path);
    else context.fill();
  }
  if (shape.stroke) {
    // One shadow per shape, as a CSS box-shadow: the fill cast it already.
    if (shape.fill) context.shadowColor = "transparent";
    context.strokeStyle = shape.stroke.color;
    context.lineWidth = shape.stroke.width;
    context.lineCap = shape.stroke.cap ?? "butt";
    context.lineJoin = shape.stroke.join ?? "miter";
    if (shape.stroke.dash) context.setLineDash(shape.stroke.dash);
    if (path) context.stroke(path);
    else context.stroke();
  }
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
export function resolveCanvasFont(font: string): string {
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
export async function loadCanvasFonts(fonts: string[]): Promise<void> {
  const faces = typeof document !== "undefined" ? (document as Document & { fonts?: FontFaceSet }).fonts : undefined;
  if (!faces || typeof faces.load !== "function") return;
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2500));
  await Promise.race([
    Promise.all([...new Set(fonts)].map((font) => faces.load(font).catch(() => []))).then(() => undefined),
    timeout,
  ]);
}

/** A spec's decoration layer: its shapes, then its text (fonts already resolved). */
function paintBackdrop(context: CanvasRenderingContext2D, backdrop: StoryBlocks): void {
  for (const shape of backdrop.shapes) drawShape(context, shape);
  for (const block of backdrop.textBlocks) drawTextBlock(context, block);
}

const resolveBlocks = (blocks: readonly StoryTextBlock[]): StoryTextBlock[] =>
  blocks.map((block) => ({ ...block, font: resolveCanvasFont(block.font) }));

/**
 * Draws ready-made design blocks onto a canvas you already have, synchronously: no photo, frame or
 * images, fonts already loaded and resolved (`resolveCanvasFont`). The Share to social Reel draws its
 * end card with these every frame (lib/promo/promoReelRender.ts), so its last frame is the very
 * layout `renderStoryImage` draws for the Post/Story picture.
 */
export function paintStoryBlocks(
  context: CanvasRenderingContext2D,
  blocks: {
    background?: StoryFill | null;
    width?: number;
    height?: number;
    backdrop?: StoryBlocks | null;
    shapes?: readonly StoryShapeBlock[];
    textBlocks?: readonly StoryTextBlock[];
  }
): void {
  if (blocks.background && blocks.width && blocks.height) {
    context.fillStyle = fillStyleOf(context, blocks.background);
    context.fillRect(0, 0, blocks.width, blocks.height);
  }
  if (blocks.backdrop) paintBackdrop(context, blocks.backdrop);
  for (const shape of blocks.shapes ?? []) drawShape(context, shape);
  for (const block of blocks.textBlocks ?? []) drawTextBlock(context, block);
}

/**
 * A still copy of a camera frame, so the selfie can be redrawn (new effects) after the camera moves on.
 * Same pixels as the video at that moment; `renderStoryImage` crops and mirrors it as it would the video.
 */
export function snapshotStorySource(source: CanvasImageSource): HTMLCanvasElement {
  const { width, height } = getSourceDimensions(source);
  const canvas = createExportCanvas(width, height);
  getCanvasContext(canvas).drawImage(source, 0, 0, width, height);
  return canvas;
}

/**
 * A picture split into the layers the celebration effects slot between, each painted synchronously once
 * its images and fonts are loaded. `renderStoryImage` paints them once for a still; an animated Story
 * (lib/socialShare/celebrationVideo.ts) caches each layer and paints the moving effects between them.
 */
export interface StoryPainter {
  width: number;
  height: number;
  /** The photo (cropped, mirrored if asked) or the spec's background. */
  paintBase: (context: CanvasRenderingContext2D) => void;
  /** The frame artwork, the backdrop and the shapes. */
  paintDesign: (context: CanvasRenderingContext2D) => void;
  /** The images (QR, logo) and the words. */
  paintContent: (context: CanvasRenderingContext2D) => void;
}

/** Loads what a spec needs (images, fonts) and returns its painter. The spec's own `effects` are ignored. */
export async function prepareStoryPainter({
  source,
  spec,
  exportMirrored = false,
}: Pick<RenderStoryImageInput, "source" | "spec" | "exportMirrored">): Promise<StoryPainter> {
  const crop = source
    ? (() => {
        const dimensions = getSourceDimensions(source);
        return calculateCoverCrop(dimensions.width, dimensions.height, spec.width, spec.height);
      })()
    : null;
  const textBlocks = resolveBlocks(spec.textBlocks);
  const backdrop = spec.backdrop ? { shapes: spec.backdrop.shapes, textBlocks: resolveBlocks(spec.backdrop.textBlocks) } : null;
  const imageBlocks = spec.images ?? [];
  const sources = [...new Set([...(spec.frameAssetUrl ? [spec.frameAssetUrl] : []), ...imageBlocks.map((block) => block.src)])];
  const [loaded] = await Promise.all([
    Promise.all(sources.map(async (src) => [src, await loadImageAsset(src)] as const)),
    loadCanvasFonts([...textBlocks, ...(backdrop?.textBlocks ?? [])].map((block) => block.font)),
  ]);
  const images = new Map(loaded);

  return {
    width: spec.width,
    height: spec.height,
    paintBase: (context) => {
      if (source && crop) {
        drawCoverSource(context, source, crop, exportMirrored);
      } else if (spec.background) {
        context.fillStyle = fillStyleOf(context, spec.background);
        context.fillRect(0, 0, spec.width, spec.height);
      }
    },
    paintDesign: (context) => {
      if (spec.frameAssetUrl) {
        const frameImage = images.get(spec.frameAssetUrl);
        if (frameImage) context.drawImage(frameImage, 0, 0, spec.width, spec.height);
      }
      if (backdrop) paintBackdrop(context, backdrop);
      for (const shape of spec.shapes ?? []) drawShape(context, shape);
    },
    paintContent: (context) => {
      for (const block of imageBlocks) {
        const image = images.get(block.src);
        if (image) drawImageBlock(context, block, image);
      }
      for (const textBlock of textBlocks) drawTextBlock(context, textBlock);
    },
  };
}

/** Effect shapes (one layer of `StoryEffectLayers`), drawn as the still picture draws them. */
export function paintEffectShapes(context: CanvasRenderingContext2D, shapes: readonly StoryShapeBlock[]): void {
  for (const shape of shapes) drawShape(context, shape);
}

/**
 * The one drawing order: photo/background, `effects.behind`, frame + backdrop + shapes, `effects.middle`,
 * images + text, `effects.front`.
 */
export function paintStoryPicture(context: CanvasRenderingContext2D, painter: StoryPainter, effects: StoryEffectLayers | null | undefined): void {
  painter.paintBase(context);
  paintEffectShapes(context, effects?.behind ?? []);
  painter.paintDesign(context);
  paintEffectShapes(context, effects?.middle ?? []);
  painter.paintContent(context);
  paintEffectShapes(context, effects?.front ?? []);
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
  const painter = await prepareStoryPainter({ source, spec, exportMirrored });
  context.clearRect(0, 0, spec.width, spec.height);
  paintStoryPicture(context, painter, spec.effects);
  return exportCanvasBlob(canvas, outputType, quality);
}
