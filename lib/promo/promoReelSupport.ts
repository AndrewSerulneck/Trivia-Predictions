import { REEL_FPS, REEL_HEIGHT, REEL_VIDEO_BITRATE, REEL_WIDTH } from "@/lib/promo/promoReel";

// Can this browser make a Reel? A cheap check that loads nothing, so the sheet can hide "Reel" without
// downloading the video library (plan §4.3: no VideoEncoder → offer Post / Story only; never WebM).
// The codec string is the one Mediabunny builds for 1080×1920 H.264 High at 6 Mbps (level 4.0).
// The library re-checks when it encodes, and the sound encoder falls back to its WebAssembly add-on.

export const REEL_AVC_CODEC = "avc1.640028";

export const canMakeReel = async (): Promise<boolean> => {
  if (typeof window === "undefined") return false;
  if (typeof VideoEncoder !== "function" || typeof OfflineAudioContext !== "function") return false;
  try {
    const result = await VideoEncoder.isConfigSupported({
      codec: REEL_AVC_CODEC,
      width: REEL_WIDTH,
      height: REEL_HEIGHT,
      bitrate: REEL_VIDEO_BITRATE,
      framerate: REEL_FPS,
    });
    return result.supported === true;
  } catch {
    return false;
  }
};
