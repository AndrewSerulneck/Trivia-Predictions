// Venue TV screen — brand identity tokens.
//
// The across-the-room "follow-along" display is a broadcast surface, not the
// mobile app, but it must still read as unmistakably Hightop. These constants
// mirror the design tokens in `app/globals.css` (`--ht-*`, `--ht-game-*`) so the
// TV screen stays loyal to the brand palette while leaning into more color than
// the mobile chrome. Kept as a plain module (no `server-only`) because the venue
// screen's animated panels are client components.
//
// Per-game identity follows the canonical game gradients:
//   • Live Trivia  → broadcast cyan → blue → violet  (`--ht-game-live`)
//   • Category Blitz → fuchsia → magenta → violet     (`--ht-game-blitz`)
// (The screen previously used emerald for Category Blitz, which did not match
// the brand's Blitz identity — these tokens are the source of truth now.)

export type VenueScreenMode = "live-trivia" | "category-blitz" | "idle";

/**
 * Shared framer-motion easing curve for the venue TV's Tv*.tsx panels — a
 * gentle decelerate used across nearly every entrance/exit transition on this
 * surface. Import this instead of re-declaring a local `EASE`/`ease` copy so
 * all panels move identically and a future tweak only needs one edit.
 */
export const SCREEN_EASE = [0.16, 1, 0.3, 1] as const;

/** Raw brand hexes reused across the screen (subset of `app/globals.css`). */
export const SCREEN_COLORS = {
  canvas: "#020617",
  surface: "#0f172a",
  cyan200: "#a5f3fc",
  cyan300: "#67e8f9",
  cyan400: "#22d3ee",
  cyan500: "#06b6d4",
  sky500: "#0ea5e9",
  blue600: "#2563eb",
  amber200: "#fde68a",
  amber300: "#fcd34d",
  amber400: "#fbbf24",
  amber500: "#f59e0b",
  fuchsia200: "#f5d0fe",
  fuchsia300: "#f0abfc",
  fuchsia400: "#e879f9",
  fuchsia500: "#d946ef",
  magenta600: "#a21caf",
  lime400: "#a3e635",
  lime500: "#84cc16",
  violet400: "#a78bfa",
  violet500: "#8b5cf6",
  violet600: "#7c3aed",
  emerald300: "#6ee7b7",
  white: "#ffffff",
} as const;

export type VenueScreenTheme = {
  /** Full-bleed background gradient for the game's stage. */
  stageGradient: string;
  /** Two ambient radial washes layered over the base canvas. */
  ambientA: string;
  ambientB: string;
  /** Primary accent (eyebrows, borders, key numerals). */
  accent: string;
  /** Secondary accent (chips, highlights). */
  accentSoft: string;
  /** Hero glow color used behind big focal elements (letter, question). */
  glow: string;
  /** rgba tint for accent-tinted surfaces, e.g. chips. */
  accentTint: string;
  /** rgba border for accent-edged cards. */
  accentBorder: string;
};

const LIVE_TRIVIA_THEME: VenueScreenTheme = {
  stageGradient:
    "radial-gradient(120% 90% at 8% 0%, rgba(14,165,233,0.30), transparent 46%), radial-gradient(120% 90% at 100% 100%, rgba(124,58,237,0.32), transparent 44%), linear-gradient(135deg, #020617 0%, #0b1830 48%, #050b1c 100%)",
  ambientA: "rgba(14,165,233,0.30)",
  ambientB: "rgba(124,58,237,0.32)",
  accent: SCREEN_COLORS.cyan300,
  accentSoft: SCREEN_COLORS.amber300,
  glow: SCREEN_COLORS.cyan400,
  accentTint: "rgba(34,211,238,0.12)",
  accentBorder: "rgba(103,232,249,0.26)",
};

const CATEGORY_BLITZ_THEME: VenueScreenTheme = {
  stageGradient:
    "radial-gradient(120% 90% at 6% 0%, rgba(217,70,239,0.30), transparent 46%), radial-gradient(120% 90% at 100% 100%, rgba(124,58,237,0.32), transparent 44%), linear-gradient(135deg, #06021a 0%, #1b0b2e 48%, #0a0518 100%)",
  ambientA: "rgba(217,70,239,0.30)",
  ambientB: "rgba(124,58,237,0.34)",
  accent: SCREEN_COLORS.fuchsia300,
  accentSoft: SCREEN_COLORS.lime400,
  glow: SCREEN_COLORS.fuchsia400,
  accentTint: "rgba(217,70,239,0.14)",
  accentBorder: "rgba(240,171,252,0.28)",
};

const IDLE_THEME: VenueScreenTheme = {
  stageGradient:
    "radial-gradient(120% 90% at 12% 0%, rgba(6,182,212,0.20), transparent 48%), radial-gradient(120% 90% at 100% 100%, rgba(245,158,11,0.16), transparent 46%), linear-gradient(135deg, #020617 0%, #0a1428 52%, #020617 100%)",
  ambientA: "rgba(6,182,212,0.20)",
  ambientB: "rgba(245,158,11,0.16)",
  accent: SCREEN_COLORS.cyan300,
  accentSoft: SCREEN_COLORS.amber300,
  glow: SCREEN_COLORS.cyan400,
  accentTint: "rgba(34,211,238,0.10)",
  accentBorder: "rgba(103,232,249,0.22)",
};

const THEMES: Record<VenueScreenMode, VenueScreenTheme> = {
  "live-trivia": LIVE_TRIVIA_THEME,
  "category-blitz": CATEGORY_BLITZ_THEME,
  idle: IDLE_THEME,
};

/**
 * The brand theme for a screen mode. A venue may override the two ambient wash
 * colors via its screen branding (screenBrandPrimary/Secondary); pass those to
 * tint the stage toward the venue's colors while keeping the game identity.
 */
export function getVenueScreenTheme(
  mode: VenueScreenMode,
  overrides?: { primary?: string | null; secondary?: string | null },
): VenueScreenTheme {
  const base = THEMES[mode] ?? IDLE_THEME;
  if (!overrides?.primary && !overrides?.secondary) return base;
  const ambientA = overrides.primary ? withAlpha(overrides.primary, 0.28) : base.ambientA;
  const ambientB = overrides.secondary ? withAlpha(overrides.secondary, 0.24) : base.ambientB;
  return {
    ...base,
    ambientA,
    ambientB,
    stageGradient: `radial-gradient(120% 90% at 8% 0%, ${ambientA}, transparent 46%), radial-gradient(120% 90% at 100% 100%, ${ambientB}, transparent 44%), linear-gradient(135deg, #020617 0%, #0b1830 48%, #050b1c 100%)`,
  };
}

/** Podium accent for a leaderboard rank (1=gold, 2=silver, 3=bronze). */
export type PodiumAccent = {
  ring: string;
  text: string;
  glow: string;
  label: string | null;
};

const PODIUM: Record<number, PodiumAccent> = {
  1: { ring: "rgba(252,211,77,0.6)", text: SCREEN_COLORS.amber300, glow: "rgba(245,158,11,0.35)", label: "1st" },
  2: { ring: "rgba(203,213,225,0.5)", text: "#e2e8f0", glow: "rgba(148,163,184,0.28)", label: "2nd" },
  3: { ring: "rgba(216,154,79,0.5)", text: "#e0a869", glow: "rgba(216,154,79,0.28)", label: "3rd" },
};

export function getPodiumAccent(rank: number): PodiumAccent | null {
  return PODIUM[rank] ?? null;
}

/** Convert a #rgb/#rrggbb hex + 0–1 alpha to an rgba() string. */
export function withAlpha(hexColor: string, alpha: number): string {
  const normalized = /^#[0-9a-f]{3}$/i.test(hexColor)
    ? `#${hexColor[1]}${hexColor[1]}${hexColor[2]}${hexColor[2]}${hexColor[3]}${hexColor[3]}`
    : hexColor;
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(normalized);
  if (!match) return hexColor;
  const r = parseInt(match[1], 16);
  const g = parseInt(match[2], 16);
  const b = parseInt(match[3], 16);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
