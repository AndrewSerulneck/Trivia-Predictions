import { REEL_FPS, REEL_VIDEO_BITRATE } from "@/lib/promo/promoReel";
import { canEncodeStoryVideo } from "@/lib/promo/promoReelSupport";
import { CELEBRATION_HERO_T } from "./celebrationEffects";
import type { StoryEffectLayers, StoryRenderSpec } from "./contracts";
import { paintEffectShapes, prepareStoryPainter } from "./storyCanvas";

/**
 * The animated Story (docs/share-win-celebration-plan.md Phase 2): a silent 5 s, 1080×1920, 30 fps MP4
 * (H.264) made on the guest's phone, where the effects they switched on move. Nothing is uploaded and
 * nothing recurring is spent; Mediabunny (the partner Reel's encoder) loads only when a video is made.
 *
 * The picture itself never moves: its three layers (photo or background; frame + shapes; QR + words) are
 * painted once, and each frame paints the effects between them in the still picture's order
 * (storyCanvas.ts `paintStoryPicture`). From `CELEBRATION_HERO_T` on every frame IS the still picture.
 */

export const CELEBRATION_VIDEO_FPS = REEL_FPS;
/** The still picture is held this long at the end. */
export const CELEBRATION_VIDEO_HOLD_S = 1.5;
export const CELEBRATION_VIDEO_SECONDS = CELEBRATION_HERO_T + CELEBRATION_VIDEO_HOLD_S;
export const CELEBRATION_VIDEO_FRAMES = Math.round(CELEBRATION_VIDEO_SECONDS * CELEBRATION_VIDEO_FPS);
export const CELEBRATION_VIDEO_TYPE = "video/mp4";

/** Cheap (loads nothing): can this browser make the video? No → the sheet never offers Animated (never WebM). */
export const canMakeCelebrationVideo = (): Promise<boolean> => canEncodeStoryVideo();

export class CelebrationVideoUnsupportedError extends Error {
  constructor() {
    super("This browser can't make video.");
    this.name = "CelebrationVideoUnsupportedError";
  }
}

export interface CelebrationVideoInput {
  /** The picture without effects (`buildShareDesignAnimation`). */
  spec: StoryRenderSpec;
  /** The effects at `t` seconds. */
  effectsAt: (t: number) => StoryEffectLayers;
  /** The selfie's still copy; absent for a ready-made design. */
  source?: CanvasImageSource | null;
}

const layerCanvas = (width: number, height: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new CelebrationVideoUnsupportedError();
  return { canvas, context };
};

/** Makes the MP4. `onProgress` gets 0…1; aborting `signal` stops it with an AbortError. */
export const encodeCelebrationVideo = async (
  { spec, effectsAt, source = null }: CelebrationVideoInput,
  { onProgress, signal }: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}
): Promise<Blob> => {
  const abortIfNeeded = () => {
    if (signal?.aborted) throw new DOMException("Video cancelled.", "AbortError");
  };
  const { width, height } = spec;
  const [mb, painter] = await Promise.all([import("mediabunny"), prepareStoryPainter({ source, spec })]);
  abortIfNeeded();
  if (!(await mb.canEncodeVideo("avc", { width, height, bitrate: REEL_VIDEO_BITRATE }))) throw new CelebrationVideoUnsupportedError();
  abortIfNeeded();
  onProgress?.(0.03);

  const base = layerCanvas(width, height);
  const design = layerCanvas(width, height);
  const content = layerCanvas(width, height);
  const frame = layerCanvas(width, height);
  painter.paintBase(base.context);
  painter.paintDesign(design.context);
  painter.paintContent(content.context);

  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const video = new mb.CanvasSource(frame.canvas, { codec: "avc", bitrate: REEL_VIDEO_BITRATE, keyFrameInterval: 2 });
  output.addVideoTrack(video, { frameRate: CELEBRATION_VIDEO_FPS });

  const paintFrame = (t: number) => {
    const effects = effectsAt(t);
    const context = frame.context;
    context.clearRect(0, 0, width, height);
    context.drawImage(base.canvas, 0, 0);
    paintEffectShapes(context, effects.behind);
    context.drawImage(design.canvas, 0, 0);
    paintEffectShapes(context, effects.middle);
    context.drawImage(content.canvas, 0, 0);
    paintEffectShapes(context, effects.front);
  };

  try {
    await output.start();
    let painted = -1;
    for (let i = 0; i < CELEBRATION_VIDEO_FRAMES; i += 1) {
      abortIfNeeded();
      const t = i / CELEBRATION_VIDEO_FPS;
      // The held frames are all the still picture: paint it once.
      const moment = Math.min(t, CELEBRATION_HERO_T);
      if (moment !== painted) {
        paintFrame(moment);
        painted = moment;
      }
      await video.add(t, 1 / CELEBRATION_VIDEO_FPS);
      if (i % 10 === 0) {
        onProgress?.(0.05 + 0.9 * (i / CELEBRATION_VIDEO_FRAMES));
        // Let the page breathe (progress bar, Cancel) between batches.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    abortIfNeeded();
    onProgress?.(0.97);
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => undefined);
    throw error;
  } finally {
    // Four full-size canvases: hand their memory back now (iPhones cap total canvas memory).
    for (const layer of [base, design, content, frame]) {
      layer.canvas.width = 0;
      layer.canvas.height = 0;
    }
  }
  if (!target.buffer) throw new Error("The video came out empty.");
  onProgress?.(1);
  return new Blob([target.buffer], { type: CELEBRATION_VIDEO_TYPE });
};
