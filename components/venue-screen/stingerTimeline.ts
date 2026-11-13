// Intro stinger timeline — a port of the "Explosion" ad stinger (`stinger.html` in Andrew's ad
// library). Pure and DOM-free so the timing rules are unit-testable
// (tests/venue-screen-intro-stinger-contract.test.ts).
//
// Standing rule (Andrew, 2026-10-26): "IT'S GAME TIME." never shows before T_TAG (2.15 s).

/** Logo starts its spring arrival. */
export const T_IN = 0.18;
/** First full-size moment: shockwave, flash, coin + spark burst. */
export const T_HIT = 0.3;
/** Diagonal shine sweep across the logo. */
export const T_SHINE = 1.15;
/** Tagline starts — never earlier (Andrew, 2026-10-26). */
export const T_TAG = 2.15;
/** Exit begins: logo pushes toward camera and fades. */
export const T_OUT = 3.4;
/** Logo and tagline fully gone. */
export const T_END = 3.95;
/**
 * Web-only exit: instead of the ad's fade to navy, the navy stage fades away over the live
 * screen underneath, finishing here. The overlay unmounts at this point.
 */
export const T_REVEAL_END = 4.3;

/** Hard stop, counted from the animation's first frame: the overlay unmounts by now no matter what (fail open). */
export const STINGER_HARD_STOP_MS = 5_000;
/** Skip the stinger entirely when the logo can't decode within this window. */
export const STINGER_LOGO_TIMEOUT_MS = 1_500;
/**
 * No-JS fail-safe: the server-rendered navy cover fades itself out by CSS this long after load (tailwind
 * `animate-stinger-cover-failsafe`), so a TV whose scripts never run still shows the screen. Later than the latest
 * hard stop (logo wait + STINGER_HARD_STOP_MS), so it never cuts a running stinger.
 */
export const STINGER_COVER_FAILSAFE_MS = 7_000;

export const STINGER_SEED = 20261026;
export const STINGER_COIN_COUNT = 34;
export const STINGER_SPARK_COUNT = 46;
export const STINGER_TWINKLE_COUNT = 9;

export const TAG_A = "IT’S";
export const TAG_B = "GAME TIME.";

export const clamp = (x: number, a = 0, b = 1): number => Math.max(a, Math.min(b, x));
export const prog = (t: number, a: number, b: number): number => clamp((t - a) / (b - a));
export const easeOut = (p: number): number => 1 - Math.pow(1 - p, 3);
export const easeIn = (p: number): number => p * p * p;
export const easeInOut = (p: number): number =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

/** Damped spring for the logo's arrival (0 → 1 with overshoot). */
export const spring = (tau: number): number =>
  tau <= 0 ? 0 : 1 - Math.exp(-7.5 * tau) * Math.cos(13.5 * tau);

/** Seeded RNG copied verbatim from stinger.html (mulberry32-style). */
export const rng = (seed: number): (() => number) => {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
};

/** 0 → 1 over the exit (T_OUT → T_END). */
export const exitProgress = (t: number): number => prog(t, T_OUT, T_END);

/** Tagline opacity at time t. Zero for every t < T_TAG. */
export const taglineAlpha = (t: number): number => {
  if (t < T_TAG) return 0;
  return easeOut(prog(t, T_TAG, T_TAG + 0.55)) * (1 - easeIn(exitProgress(t)));
};

/** Opacity of the navy stage (and its bloom/rays/vignette): 1 until T_OUT, then fades to reveal the screen. */
export const stageAlpha = (t: number): number => 1 - easeInOut(prog(t, T_OUT, T_REVEAL_END));

export type StingerGeometry = {
  /** Logo size in device pixels. */
  L: number;
  CX: number;
  CY: number;
  tagSize: number;
  tagY: number;
};

/** Layout from stinger.html, sized from the actual canvas instead of a fixed 1920×1080. */
export const stingerGeometry = (W: number, H: number): StingerGeometry => {
  const portrait = H > W;
  const L = Math.min(W, H) * (portrait ? 0.86 : 0.64);
  const CY = portrait ? H * 0.43 : H * 0.44;
  const tagSize = L * (portrait ? 0.085 : 0.082);
  return { L, CX: W / 2, CY, tagSize, tagY: CY + L * 0.5 + tagSize * (portrait ? 1.5 : 1.05) };
};

export type StingerCoin = {
  a: number; sp: number; r: number; spin: number; ph: number; off: number; life: number; tilt: number;
};
export type StingerSpark = { a: number; sp: number; r: number; off: number; life: number; gold: boolean };
export type StingerTwinkle = { x: number; y: number; t0: number; r: number };
export type StingerParticles = { coins: StingerCoin[]; sparks: StingerSpark[]; twinkles: StingerTwinkle[] };

/** Deterministic particles, same draw order as stinger.html so the burst matches the ad. */
export const stingerParticles = (L: number): StingerParticles => {
  const rand = rng(STINGER_SEED);
  const coins = Array.from({ length: STINGER_COIN_COUNT }, () => {
    const a = rand() * Math.PI * 2;
    const sp = L * (0.9 + rand() * 1.6);
    return {
      a, sp, r: L * (0.022 + rand() * 0.03), spin: 6 + rand() * 10, ph: rand() * 6.28,
      off: L * (0.08 + rand() * 0.18), life: 1.1 + rand() * 0.7, tilt: rand() * 0.8 - 0.4,
    };
  });
  const sparks = Array.from({ length: STINGER_SPARK_COUNT }, () => {
    const a = rand() * Math.PI * 2;
    return {
      a, sp: L * (1.1 + rand() * 2.0), r: L * (0.008 + rand() * 0.016),
      off: L * (0.05 + rand() * 0.2), life: 0.6 + rand() * 0.7, gold: rand() >= 0.7,
    };
  });
  const twinkles = Array.from({ length: STINGER_TWINKLE_COUNT }, () => {
    const a = rand() * Math.PI * 2;
    const d = L * (0.18 + rand() * 0.3);
    return { x: Math.cos(a) * d, y: Math.sin(a) * d * 0.95, t0: 1.45 + rand() * 1.8, r: L * (0.022 + rand() * 0.02) };
  });
  return { coins, sparks, twinkles };
};

/** Whether `intro=0` (dashboard thumbnail only) asks to skip the stinger. */
export const isIntroDisabled = (value: string | string[] | undefined): boolean => {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "0";
};

/** The dashboard thumbnail's screen URL: same screen, no intro stinger. The Expand view never uses this. */
export const withIntroDisabled = (url: string): string =>
  url ? `${url}${url.includes("?") ? "&" : "?"}intro=0` : url;
