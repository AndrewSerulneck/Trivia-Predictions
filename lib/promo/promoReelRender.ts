import type { StoryTextBlock } from "@/lib/socialShare/contracts";
import { loadCanvasFonts, paintStoryBlocks, resolveCanvasFont } from "@/lib/socialShare/storyCanvas";
import {
  buildPromoEndCardLayout,
  PROMO_END_CARD_FONTS,
  type PromoEndCardGroup,
  type PromoEndCardInput,
} from "@/lib/promo/promoEndCard";
import {
  clamp01,
  easeBack,
  easeOut,
  lerp,
  REEL_AUDIO_BITRATE,
  REEL_FPS,
  REEL_HEIGHT,
  REEL_MUSIC_FADE_S,
  REEL_SAMPLE_RATE,
  REEL_SETTLE_S,
  REEL_VIDEO_BITRATE,
  REEL_WIDTH,
  reelFrameCount,
  reelHoldStartS,
  reelPlan,
  reelSfxCues,
  seededRandom,
  type ReelPlan,
} from "@/lib/promo/promoReel";
import { measurePromoText } from "@/lib/promo/promoRender";
import { promoSoundFor, type PromoSound } from "@/lib/promo/promoSounds";
import { PROMO_SYNTHS, type SynthKit } from "@/lib/promo/promoSynth";
import { promoThemeFor } from "@/lib/promo/promoThemes";

// Browser-only: the Share to social Reel (docs/partner-social-promo-plan.md Phase 2, §4.1, §4.3).
// A port of the approved Phase 0 test page (version 5): frames drawn on a canvas, the sound mixed with
// Web Audio offline, both encoded on the partner's device (H.264 + AAC in MP4 via Mediabunny, loaded
// only when a Reel is made). No server work and no recurring cost (D6).
//
// The Reel ends on the END CARD: the same layout as the Post/Story picture (buildPromoEndCardLayout).
// Its title and prize card are animated from the beats into their end-card places, the other rows fade
// in, and from reelHoldStartS() on every frame is the end card itself, painted once and held. The beats
// play over the game's own background and backdrop (docs/game-themes-plan.md Phase 2), painted once,
// with the game's own motion on top (Phase 3: theme.reel.motion, vector blocks per frame). This file
// never names a game: what moves, and how, lives in the theme.

export type ReelInput = Omit<PromoEndCardInput, "format" | "measure"> & {
  /** A music sound id, or null for "No music" (the sound effects stay). */
  musicId: string | null;
};

export type ReelScene = {
  plan: ReelPlan;
  /** Draws the frame at `t` seconds, in 1080×1920 units (scale the context for a smaller canvas). */
  draw: (context: CanvasRenderingContext2D, t: number) => void;
  /** The mixed sound for the whole Reel. Mixed once, then reused (preview and file). */
  mix: () => Promise<AudioBuffer>;
};

export class ReelUnsupportedError extends Error {
  constructor() {
    super("This browser can't make video.");
    this.name = "ReelUnsupportedError";
  }
}

const W = REEL_WIDTH;
const H = REEL_HEIGHT;
const BODY = "var(--ht-font-body), Arial, sans-serif";
const font = (weight: number, px: number): string => `${weight} ${px}px ${BODY}`;
const BEAT_FONTS = [font(800, 92), font(900, 150), font(700, 64)];
const CONFETTI = ["#8B5CF6", "#FFFFFF", "#FACC15"];
/** Where the brand line sits during the beats: the top of Instagram's safe zone, as on the test page. */
const BRAND_BEAT_Y = 290;

const createCanvas = (width: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

const context2d = (canvas: HTMLCanvasElement): CanvasRenderingContext2D => {
  const context = canvas.getContext("2d");
  if (!context) throw new ReelUnsupportedError();
  return context;
};

const resolveText = (blocks: readonly StoryTextBlock[]): StoryTextBlock[] =>
  blocks.map((block) => ({ ...block, font: resolveCanvasFont(block.font) }));

const resolveGroup = (group: PromoEndCardGroup): PromoEndCardGroup => ({ ...group, text: resolveText(group.text) });

type Placement = { cy: number; scale: number; rotate?: number; alpha: number; dy?: number };

/** Draws a row of the end card moved as a unit: centred on `cy`, scaled and turned about its centre. */
const drawGroup = (context: CanvasRenderingContext2D, group: PromoEndCardGroup, place: Placement) => {
  if (place.alpha <= 0.005) return;
  context.save();
  context.globalAlpha = clamp01(place.alpha);
  context.translate(W / 2, place.cy + (place.dy ?? 0));
  if (place.rotate) context.rotate(place.rotate);
  context.scale(place.scale, place.scale);
  context.translate(-W / 2, -(group.top + group.height / 2));
  paintStoryBlocks(context, { shapes: group.shapes, textBlocks: group.text });
  context.restore();
};

const centreOf = (group: PromoEndCardGroup): number => group.top + group.height / 2;

const beatLine = (text: string, centerY: number, fontString: string, color: string, extra: Partial<StoryTextBlock> = {}): StoryTextBlock => ({
  text,
  x: W / 2,
  y: centerY,
  centerY,
  maxWidth: 960,
  font: resolveCanvasFont(fontString),
  color,
  align: "center",
  baseline: "alphabetic",
  maxLines: 1,
  fitMinPx: 40,
  // The beats sit on busy game backdrops (a field, a court): a soft shadow keeps them readable.
  shadowColor: "rgba(0, 0, 0, 0.55)",
  shadowBlur: 18,
  shadowOffsetY: 4,
  ...extra,
});

// ── Sound ──

const decoded = new Map<string, Promise<AudioBuffer>>();

/** Fetches and decodes a sound file once per page (the file itself is cached forever by name). */
const loadSound = (sound: PromoSound): Promise<AudioBuffer> | null => {
  if (sound.audio.kind !== "file") return null;
  const file = sound.audio.file;
  const cached = decoded.get(file);
  if (cached) return cached;
  const loading = (async () => {
    const response = await fetch(file);
    if (!response.ok) throw new Error(`Sound ${sound.id}: HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    return new OfflineAudioContext(2, 1, REEL_SAMPLE_RATE).decodeAudioData(bytes);
  })();
  decoded.set(file, loading);
  loading.catch(() => decoded.delete(file));
  return loading;
};

const mixReel = async (plan: ReelPlan, musicId: string | null): Promise<AudioBuffer> => {
  const cues = reelSfxCues(plan);
  const music = musicId ? promoSoundFor(musicId) : null;
  const used = [...new Set([...cues.map((cue) => cue.soundId), ...(music ? [music.id] : [])])].map(promoSoundFor);
  const buffers = new Map<string, AudioBuffer>();
  await Promise.all(
    used.map(async (sound) => {
      const loading = loadSound(sound);
      if (loading) buffers.set(sound.id, await loading);
    }),
  );

  const off = new OfflineAudioContext(2, Math.ceil(plan.durationS * REEL_SAMPLE_RATE), REEL_SAMPLE_RATE);
  const random = seededRandom(42);
  const noise = off.createBuffer(1, REEL_SAMPLE_RATE * 2, REEL_SAMPLE_RATE);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i += 1) samples[i] = random() * 2 - 1;
  const kit: SynthKit = { context: off, noise, random };

  // A gentle limiter so the crowd + music + ka-ching never clip.
  const limiter = off.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  limiter.connect(off.destination);
  const master = off.createGain();
  master.gain.value = 0.9;
  master.connect(limiter);

  /** A recorded clip at `at` in the Reel, read from `offset` in the file, with linear fades. */
  const clip = (buffer: AudioBuffer, at: number, offset: number, length: number, peak: number, fadeIn: number, fadeOut: number, out: AudioNode) => {
    const duration = Math.min(length, plan.durationS - at, buffer.duration - offset);
    if (duration <= 0) return;
    const source = off.createBufferSource();
    source.buffer = buffer;
    const gain = off.createGain();
    gain.gain.setValueAtTime(fadeIn > 0 ? 0 : peak, at);
    if (fadeIn > 0) gain.gain.linearRampToValueAtTime(peak, at + Math.min(fadeIn, duration));
    if (fadeOut > 0 && duration > fadeIn + fadeOut) {
      gain.gain.setValueAtTime(peak, at + duration - fadeOut);
      gain.gain.linearRampToValueAtTime(0, at + duration);
    }
    source.connect(gain).connect(out);
    source.start(at, offset, duration);
  };

  if (music) {
    // Full level throughout, faded only over the last second (D21).
    const bus = off.createGain();
    bus.gain.setValueAtTime(music.gain, 0);
    bus.gain.setValueAtTime(music.gain, plan.durationS - REEL_MUSIC_FADE_S);
    bus.gain.linearRampToValueAtTime(0.0001, plan.durationS);
    bus.connect(master);
    if (music.audio.kind === "synth") PROMO_SYNTHS[music.audio.synth](kit, bus, 0, plan.durationS);
    else {
      const buffer = buffers.get(music.id);
      if (buffer) clip(buffer, 0, 0, plan.durationS, 1, 0.02, 0, bus);
    }
  }

  const sfx = off.createGain();
  sfx.connect(master);
  for (const cue of cues) {
    const sound = promoSoundFor(cue.soundId);
    if (sound.audio.kind === "synth") {
      const level = off.createGain();
      level.gain.value = cue.gain * sound.gain;
      level.connect(sfx);
      PROMO_SYNTHS[sound.audio.synth](kit, level, cue.atS, cue.durationS);
    } else {
      const buffer = buffers.get(sound.id);
      if (buffer) clip(buffer, cue.atS, cue.offsetS, cue.durationS, cue.gain * sound.gain, cue.fadeInS, cue.fadeOutS, sfx);
    }
  }
  return off.startRendering();
};

// ── The scene ──

/** Loads the fonts and sounds a Reel needs and lays out its end card. Then draw any frame, or mix. */
export const prepareReel = async (input: ReelInput): Promise<ReelScene> => {
  const plan = reelPlan(input.prizes.length > 0);
  const theme = promoThemeFor(input.template.game);
  await loadCanvasFonts([...PROMO_END_CARD_FONTS, ...BEAT_FONTS].map(resolveCanvasFont));
  const layout = buildPromoEndCardLayout({ ...input, format: "story", measure: measurePromoText });
  const groups = new Map(layout.groups.map((group) => [group.id, resolveGroup(group)]));
  const title = groups.get("title");
  const prize = groups.get("prize") ?? null;
  const arriving = (["when", "art", "venue", "cta", "follow"] as const).flatMap((id) => groups.get(id) ?? []);
  const brand = groups.get("brand") ?? null;
  if (!title) throw new Error("The end card has no title.");

  // The game's background + backdrop, painted once: every beat frame starts from it.
  const backdrop = layout.spec.backdrop
    ? { shapes: layout.spec.backdrop.shapes, textBlocks: resolveText(layout.spec.backdrop.textBlocks) }
    : null;
  const stage = createCanvas(W, H);
  paintStoryBlocks(context2d(stage), { background: layout.spec.background, width: W, height: H, backdrop });

  // During the beats the game's motion may own part of the backdrop (Pick 'Em's balls fly in): then the
  // beats start from the theme's beat backdrop, also painted once.
  const beatBlocks = theme.reel.beatBackdrop?.(layout.stage) ?? null;
  const beatStage = beatBlocks ? createCanvas(W, H) : stage;
  if (beatBlocks) {
    paintStoryBlocks(context2d(beatStage), {
      background: layout.spec.background,
      width: W,
      height: H,
      backdrop: { shapes: beatBlocks.shapes, textBlocks: resolveText(beatBlocks.text) },
    });
  }
  // The motion's fonts resolve once each, not every frame (resolveCanvasFont reads the page's style).
  const fonts = new Map<string, string>();
  const motionFont = (fontString: string): string => {
    let resolved = fonts.get(fontString);
    if (resolved === undefined) {
      resolved = resolveCanvasFont(fontString);
      fonts.set(fontString, resolved);
    }
    return resolved;
  };

  // The end card, painted once: the held frames copy it.
  const endCard = createCanvas(W, H);
  const endContext = context2d(endCard);
  endContext.drawImage(stage, 0, 0, W, H);
  paintStoryBlocks(endContext, { shapes: layout.spec.shapes, textBlocks: resolveText(layout.spec.textBlocks) });

  // How big the title can be on its own beat: as on the test page (~210 px), never wider than the frame.
  // Measured across the whole row, shapes too: Category Blitz spells its first word in letter tiles.
  const measureContext = context2d(createCanvas(8, 8));
  let titleLeft = Infinity;
  let titleRight = -Infinity;
  for (const block of title.text) {
    measureContext.font = block.font;
    const width = measureContext.measureText(block.text).width;
    const left = block.align === "center" ? block.x - width / 2 : block.align === "right" ? block.x - width : block.x;
    titleLeft = Math.min(titleLeft, left);
    titleRight = Math.max(titleRight, left + width);
  }
  for (const shape of title.shapes) {
    if (shape.path || shape.width <= 0) continue; // Paths (a swoosh, a ball) carry no box: the words and cards set the width.
    const x = shape.transform?.x ?? 0;
    const scale = shape.transform?.scale ?? 1;
    titleLeft = Math.min(titleLeft, x + shape.x * scale);
    titleRight = Math.max(titleRight, x + (shape.x + shape.width) * scale);
  }
  const titleWidth = Math.max(1, titleRight - titleLeft);
  const titleBig = Math.min(1.75, 1000 / titleWidth);
  const titleMid = 1 + (titleBig - 1) * 0.4;
  const prizeBig = prize ? Math.min(1.15, 700 / prize.height) : 1;

  const { days, time } = input.when;
  const accent = input.template.accent;
  const timeColor = theme.when.timeColor;
  // Days too long for one line at 92 px ("Every Monday & Thursday") take two, moved up clear of the time.
  measureContext.font = resolveCanvasFont(font(800, 92));
  const daysTwoLines = measureContext.measureText(days).width > 960;
  const whenBeat: StoryTextBlock[] = time
    ? [
        beatLine(days, daysTwoLines ? 790 : 850, font(800, 92), "#FFFFFF", { maxLines: 2, lineHeight: 104, fitMinPx: 56 }),
        beatLine(time, 1000, font(900, 150), timeColor, { fitMinPx: 80 }),
        ...(input.venueName ? [beatLine(`at ${input.venueName}`, 1130, font(700, 64), "rgba(255, 255, 255, 0.8)")] : []),
      ]
    : [
        beatLine(days, 900, font(800, 92), "#FFFFFF", { maxLines: 2, lineHeight: 104, fitMinPx: 56 }),
        ...(input.venueName ? [beatLine(`at ${input.venueName}`, 1070, font(700, 64), "rgba(255, 255, 255, 0.8)")] : []),
      ];

  const holdFrom = reelHoldStartS(plan);

  const draw = (context: CanvasRenderingContext2D, t: number) => {
    if (t >= holdFrom) {
      context.drawImage(endCard, 0, 0, W, H);
      return;
    }
    const settle = easeOut((t - plan.end[0]) / REEL_SETTLE_S);

    // Background: the game's own look, with moving light bars that fade as the end card settles.
    context.drawImage(beatStage, 0, 0, W, H);
    const bars = 0.06 * (1 - settle);
    if (bars > 0.001) {
      context.save();
      context.globalAlpha = bars;
      context.fillStyle = "#FFFFFF";
      for (let i = 0; i < 6; i += 1) {
        const x = ((i * 260 + t * 120) % (W + 600)) - 300;
        context.save();
        context.translate(x, 0);
        context.rotate(0.35);
        context.fillRect(0, -200, 70, H + 400);
        context.restore();
      }
      context.restore();
    }

    // The game's own motion (lights, dice, balls, squares, bracket), under the beats' rows.
    const motion = theme.reel.motion({ t, plan, stage: layout.stage, settle: Math.max(0, settle) });
    if (motion.shapes.length || motion.text.length) {
      paintStoryBlocks(context, {
        shapes: motion.shapes,
        textBlocks: motion.text.map((block) => ({ ...block, font: motionFont(block.font) })),
      });
    }

    // The brand line sits at the top during the beats (clear of the title), then joins the end card.
    if (brand) drawGroup(context, brand, { cy: lerp(BRAND_BEAT_Y, centreOf(brand), settle), scale: 1, alpha: 1 });

    // Beat 1: the title pops in big; it moves up for the next beats, then settles into the end card.
    const titleIn = easeBack((t - 0.1) / 0.6);
    const toTop = easeOut((t - plan.when[0]) / 0.6);
    const titleScale = settle > 0 ? lerp(titleMid, 1, settle) : lerp(titleBig, titleMid, toTop) * (0.4 + 0.6 * titleIn);
    const titleY = settle > 0 ? lerp(520, centreOf(title), settle) : lerp(860, 520, toTop);
    drawGroup(context, title, { cy: titleY, scale: titleScale, alpha: clamp01(titleIn) });

    // Beat 2: when (and where), big.
    if (t >= plan.when[0]) {
      const leaveAt = plan.prize ? plan.prize[0] : plan.end[0];
      const shown = easeOut((t - plan.when[0]) / 0.5) * (t >= leaveAt ? 1 - easeOut((t - leaveAt) / 0.3) : 1);
      if (shown > 0.01) {
        context.save();
        context.globalAlpha = shown;
        context.translate(0, 60 * (1 - shown));
        paintStoryBlocks(context, { textBlocks: whenBeat });
        context.restore();
      }
    }

    // The drumroll: a pulsing ring.
    if (plan.roll && t >= plan.roll[0] && t < plan.roll[1]) {
      const k = (t - plan.roll[0]) / (plan.roll[1] - plan.roll[0]);
      context.save();
      context.strokeStyle = accent;
      context.globalAlpha = 0.5 + 0.5 * Math.sin(t * 40);
      context.lineWidth = 10 + 20 * k;
      context.beginPath();
      context.arc(W / 2, 1020, 120 + 200 * k, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }

    // Beat 3: the prize card pops in big with confetti, then shrinks into its end-card place.
    if (plan.prize && prize && t >= plan.prize[0]) {
      const pop = easeBack((t - plan.prize[0]) / 0.5);
      drawGroup(context, prize, {
        cy: lerp(1020, centreOf(prize), settle),
        scale: lerp(prizeBig * pop, 1, settle),
        rotate: -0.03 * (1 - settle),
        alpha: clamp01((t - plan.prize[0]) / 0.12),
      });
      const k = t - plan.prize[0];
      if (k < 1.6) {
        const random = seededRandom(11);
        const colours = [accent, ...CONFETTI];
        for (let i = 0; i < 70; i += 1) {
          const angle = random() * Math.PI * 2;
          const speed = 500 + random() * 900;
          const x = W / 2 + Math.cos(angle) * speed * k;
          const y = 1020 + Math.sin(angle) * speed * k + 600 * k * k;
          context.save();
          context.globalAlpha = clamp01(1 - k / 1.6);
          context.fillStyle = colours[i % colours.length];
          context.translate(x, y);
          context.rotate(k * 8 + i);
          context.fillRect(-10, -5, 20, 10);
          context.restore();
        }
      }
    }

    // Beat 4: the end card's other rows arrive (when, venue + handle, the call to action).
    if (t >= plan.end[0]) {
      const shown = easeOut((t - plan.end[0]) / 0.5);
      for (const group of arriving) drawGroup(context, group, { cy: centreOf(group), scale: 1, alpha: shown, dy: 60 * (1 - shown) });
    }
  };

  let mixed: Promise<AudioBuffer> | null = null;
  const mix = () => {
    if (!mixed) {
      mixed = mixReel(plan, input.musicId);
      mixed.catch(() => {
        mixed = null;
      });
    }
    return mixed;
  };

  return { plan, draw, mix };
};

// ── Preview: plays live on a canvas with the mixed sound ──

/**
 * Plays the Reel on `canvas` (any size; drawn scaled) with sound through `audio`. Create `audio` in the
 * tap handler itself, before any await, or iPhones stay silent. Returns a stop function.
 */
export const playReelPreview = async (
  scene: ReelScene,
  canvas: HTMLCanvasElement,
  audio: AudioContext | null,
  onEnded: () => void,
): Promise<() => void> => {
  const context = context2d(canvas);
  let source: AudioBufferSourceNode | null = null;
  let frame = 0;
  let stopped = false;
  const stop = () => {
    stopped = true;
    if (frame) cancelAnimationFrame(frame);
    try {
      source?.stop();
    } catch {
      // Already stopped.
    }
  };
  if (audio) {
    try {
      const buffer = await scene.mix();
      if (stopped) return stop;
      await audio.resume().catch(() => undefined);
      source = audio.createBufferSource();
      source.buffer = buffer;
      source.connect(audio.destination);
      source.start();
    } catch {
      source = null; // A silent preview beats none.
    }
  }
  const startedAt = performance.now();
  const scale = canvas.width / W;
  const tick = () => {
    if (stopped) return;
    const t = (performance.now() - startedAt) / 1000;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    scene.draw(context, Math.min(t, scene.plan.durationS - 0.001));
    if (t < scene.plan.durationS) frame = requestAnimationFrame(tick);
    else onEnded();
  };
  tick();
  return stop;
};

// ── The MP4 ──

/** Makes the Reel file: H.264 + AAC in MP4, 1080×1920 at 30 fps. `onProgress` gets 0…1. */
export const encodeReel = async (
  scene: ReelScene,
  { onProgress, signal }: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<Blob> => {
  const abortIfNeeded = () => {
    if (signal?.aborted) throw new DOMException("Reel cancelled.", "AbortError");
  };
  const mb = await import("mediabunny");
  abortIfNeeded();
  if (!(await mb.canEncodeVideo("avc", { width: W, height: H, bitrate: REEL_VIDEO_BITRATE }))) throw new ReelUnsupportedError();
  if (!(await mb.canEncodeAudio("aac", { numberOfChannels: 2, sampleRate: REEL_SAMPLE_RATE }))) {
    // Phase 0 never needed it (Mac Chrome and iPhone have AAC built in), but older browsers might.
    const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
    registerAacEncoder();
  }
  onProgress?.(0.02);
  const sound = await scene.mix();
  abortIfNeeded();

  const canvas = createCanvas(W, H);
  const context = context2d(canvas);
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const video = new mb.CanvasSource(canvas, { codec: "avc", bitrate: REEL_VIDEO_BITRATE, keyFrameInterval: 2 });
  output.addVideoTrack(video, { frameRate: REEL_FPS });
  const audioTrack = new mb.AudioBufferSource({ codec: "aac", bitrate: REEL_AUDIO_BITRATE });
  output.addAudioTrack(audioTrack);

  try {
    await output.start();
    await audioTrack.add(sound);
    const frames = reelFrameCount(scene.plan);
    for (let i = 0; i < frames; i += 1) {
      abortIfNeeded();
      scene.draw(context, i / REEL_FPS);
      await video.add(i / REEL_FPS, 1 / REEL_FPS);
      if (i % 10 === 0) {
        onProgress?.(0.05 + 0.9 * (i / frames));
        // Let the page breathe (progress bar, taps) between batches.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    onProgress?.(0.97);
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => undefined);
    throw error;
  }
  if (!target.buffer) throw new Error("The Reel came out empty.");
  onProgress?.(1);
  return new Blob([target.buffer], { type: "video/mp4" });
};
