// The Share to social Reel's timeline and sound cues (docs/partner-social-promo-plan.md §4.1, D17, D21).
// Pure: no canvas, no audio. lib/promo/promoReelRender.ts draws and mixes from these.
//
// Beats (the Phase 0 test page, version 5, that Andrew approved):
//   title + applause → when → drumroll → prize reveal + crowd + ka-ching → END CARD, held still.
// With no prize shown there is no drumroll or reveal, and the Reel is 10 s instead of 15 s.
// The end card is the Post/Story picture (lib/promo/promoEndCard.ts): the Reel's rows glide into it,
// then the last REEL_HOLD_S seconds are that exact picture. Nothing fades out at the end; only the
// music fades over the last second.

export type ReelWindow = readonly [start: number, end: number];

export type ReelPlan = {
  durationS: number;
  title: ReelWindow;
  when: ReelWindow;
  /** The drumroll; null without a prize. */
  roll: ReelWindow | null;
  /** The prize reveal; null without a prize. */
  prize: ReelWindow | null;
  /** The end card: its rows arrive at end[0] and settle REEL_SETTLE_S later. */
  end: ReelWindow;
};

export const REEL_FPS = 30;
export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;
export const REEL_SAMPLE_RATE = 48_000;
/**
 * H.264 at 6 Mbps, a key frame every 2 s (Phase 0). AAC at 128 kbps: Meta's Reel spec for API publishing
 * ("audio bitrate 128 kbps", ig-user/media reference, read 2026-11-04); Phase 0 used 160 kbps.
 */
export const REEL_VIDEO_BITRATE = 6_000_000;
export const REEL_AUDIO_BITRATE = 128_000;
/** How long the end card's rows take to glide into place. */
export const REEL_SETTLE_S = 0.6;
/** The music fades over the last second (D21: it never dips before that). */
export const REEL_MUSIC_FADE_S = 1;

export const reelPlan = (withPrize: boolean): ReelPlan =>
  withPrize
    ? { durationS: 15, title: [0, 3], when: [3, 6.5], roll: [6.5, 7.5], prize: [7.5, 11.5], end: [11.5, 15] }
    : { durationS: 10, title: [0, 3], when: [3, 6.5], roll: null, prize: null, end: [6.5, 10] };

/** From here to the last frame, every frame is the end card itself. */
export const reelHoldStartS = (plan: ReelPlan): number => plan.end[0] + REEL_SETTLE_S;

/** The cover frame for Instagram's `thumb_offset` (Phase 5): the held end card. */
export const reelCoverMs = (plan: ReelPlan): number => Math.round(reelHoldStartS(plan) * 1000);

export const reelFrameCount = (plan: ReelPlan): number => Math.round(plan.durationS * REEL_FPS);

/**
 * One sound effect: play `soundId` from `offsetS` into the sound, at `atS` in the Reel, for at most
 * `durationS` (never past the Reel's end or the sound's own end), at `gain`, with linear fades.
 */
export type ReelSfxCue = {
  soundId: string;
  atS: number;
  offsetS: number;
  durationS: number;
  gain: number;
  fadeInS: number;
  fadeOutS: number;
};

/** The approved sound design (D18, D21). Every design shares it today. */
export const reelSfxCues = (plan: ReelPlan): ReelSfxCue[] => {
  // Opening: applause as the title lands. No whistle.
  const cues: ReelSfxCue[] = [
    { soundId: "applause-cheer", atS: 0, offsetS: 0, durationS: 3, gain: 0.75, fadeInS: 0.02, fadeOutS: 1.2 },
  ];
  if (plan.roll) {
    cues.push({ soundId: "drumroll", atS: plan.roll[0], offsetS: 0, durationS: plan.roll[1] - plan.roll[0], gain: 1, fadeInS: 0, fadeOutS: 0 });
  }
  if (plan.prize) {
    const reveal = plan.prize[0];
    cues.push(
      // The stadium crowd swells in just before the reveal; its loudest stretch lands ~1.5 s after it.
      { soundId: "stadium-crowd", atS: Math.max(0, reveal - 0.3), offsetS: 0, durationS: 4.4, gain: 0.45, fadeInS: 0.4, fadeOutS: 1.3 },
      // Applause and cheer right on the reveal, fading on its own.
      { soundId: "applause-cheer", atS: Math.max(0, reveal - 0.02), offsetS: 0, durationS: 6, gain: 1, fadeInS: 0.02, fadeOutS: 1.2 },
      { soundId: "ka-ching", atS: reveal + 0.1, offsetS: 0, durationS: 1.2, gain: 1, fadeInS: 0, fadeOutS: 0 },
    );
  }
  return cues;
};

// ── Easing (shared by the frame drawer) ──

export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
export const easeOut = (x: number): number => 1 - Math.pow(1 - clamp01(x), 3);
/** Overshoots a little past 1 before settling: the "pop". */
export const easeBack = (x: number): number => {
  const k = clamp01(x);
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
};
export const lerp = (from: number, to: number, k: number): number => from + (to - from) * k;

/** Seeded randomness, so every Reel looks and sounds the same. */
export const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};
