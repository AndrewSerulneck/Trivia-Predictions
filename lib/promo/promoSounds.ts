// Share to social sounds (docs/partner-social-promo-plan.md §4.2, §6, D3, D7, D18, D21). One entry per
// sound. A Reel = the partner's music choice (or "No music") + the design's sound effects, which are
// always on (lib/promo/promoReel.ts `reelSfxCues`).
//
// Rules (tests/promo-coverage-contract.test.ts):
// - Every sound has a `license` with an allowed licence. Free libraries only: CC0, Pixabay, Mixkit, or
//   a sound Hightop made in code ("hightop-original": no file, nothing anyone else can claim).
// - A music FILE needs `contentIdChecked`: the date a test Reel with it ran 48 h on Hightop's own
//   Instagram unclaimed (§6 step 2).
// - Files are served from /promo/sounds, cached forever by name (next.config.ts): changed audio = a new
//   file name (-v2). Make files with `python3 scripts/convert-promo-sound.py`; originals and their
//   source pages live in data/promo-sounds/originals/.
// - A muted Reel reported by a partner: delete that track's entry. New Reels stop using it.

export type PromoSoundLicence = "cc0" | "pixabay" | "mixkit" | "hightop-original";

export const ALLOWED_PROMO_SOUND_LICENCES: readonly PromoSoundLicence[] = ["cc0", "pixabay", "mixkit", "hightop-original"];

export type PromoSoundLicense = {
  /** Who made it: "Pixabay (driken5482)", "Hightop Challenge". */
  source: string;
  licence: PromoSoundLicence;
  /** The page it was downloaded from; null for a sound made in code. */
  sourceUrl: string | null;
  /** YYYY-MM-DD; null for a sound made in code. */
  downloadedOn: string | null;
  /** YYYY-MM-DD the 48-hour Instagram test passed; null = not yet run. */
  contentIdChecked: string | null;
};

/** Sounds drawn in code by lib/promo/promoSynth.ts (one function each). */
export type PromoSynthId = "game-night-beat" | "drumroll" | "ka-ching";

export type PromoSoundAudio =
  | { kind: "file"; file: string; durationMs: number }
  | { kind: "synth"; synth: PromoSynthId };

export type PromoSound = {
  id: string;
  kind: "music" | "sfx";
  /** What the partner sees in the Sound picker (music only). */
  name: string;
  mood: string | null;
  audio: PromoSoundAudio;
  /** Music: its level under the sound effects. Sound effects take their level from each cue. */
  gain: number;
  license: PromoSoundLicense;
};

export const PROMO_SOUNDS: readonly PromoSound[] = [
  {
    id: "game-night-beat",
    kind: "music",
    name: "Game-night beat",
    mood: "upbeat",
    // The Phase 0 test tune Andrew approved (D20): 120 BPM, Am–F–C–G. Made in code, so it can't be claimed.
    audio: { kind: "synth", synth: "game-night-beat" },
    gain: 0.55,
    license: { source: "Hightop Challenge", licence: "hightop-original", sourceUrl: null, downloadedOn: null, contentIdChecked: null },
  },
  {
    id: "applause-cheer",
    kind: "sfx",
    name: "Applause and cheer",
    mood: null,
    // Trimmed from 0.95 s of the original, where the burst starts.
    audio: { kind: "file", file: "/promo/sounds/applause-cheer-v1.m4a", durationMs: 6100 },
    gain: 1,
    license: {
      source: "Pixabay (driken5482)",
      licence: "pixabay",
      sourceUrl: "https://pixabay.com/sound-effects/applause-cheer-236786/",
      downloadedOn: "2026-11-03",
      contentIdChecked: null,
    },
  },
  {
    id: "stadium-crowd",
    kind: "sfx",
    name: "Stadium crowd",
    mood: null,
    // Trimmed from 8.0 s of the original: the swell into its loudest stretch.
    audio: { kind: "file", file: "/promo/sounds/stadium-crowd-v1.m4a", durationMs: 4500 },
    gain: 1,
    license: {
      source: "Pixabay (vishiv)",
      licence: "pixabay",
      sourceUrl: "https://pixabay.com/sound-effects/crowd-cheering-in-stadium-435357/",
      downloadedOn: "2026-11-03",
      contentIdChecked: null,
    },
  },
  {
    id: "drumroll",
    kind: "sfx",
    name: "Drumroll",
    mood: null,
    audio: { kind: "synth", synth: "drumroll" },
    gain: 1,
    license: { source: "Hightop Challenge", licence: "hightop-original", sourceUrl: null, downloadedOn: null, contentIdChecked: null },
  },
  {
    id: "ka-ching",
    kind: "sfx",
    name: "Ka-ching",
    mood: null,
    audio: { kind: "synth", synth: "ka-ching" },
    gain: 1,
    license: { source: "Hightop Challenge", licence: "hightop-original", sourceUrl: null, downloadedOn: null, contentIdChecked: null },
  },
];

export const PROMO_MUSIC: readonly PromoSound[] = PROMO_SOUNDS.filter((sound) => sound.kind === "music");

/** The Sound picker's starting choice. */
export const DEFAULT_PROMO_MUSIC_ID: string = PROMO_MUSIC[0]?.id ?? "";

export const promoSoundFor = (id: string): PromoSound => {
  const sound = PROMO_SOUNDS.find((entry) => entry.id === id);
  if (!sound) throw new Error(`No Share to social sound ${id}.`);
  return sound;
};
