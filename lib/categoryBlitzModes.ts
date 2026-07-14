import type { CategoryBlitzMode } from "@/types";

export type { CategoryBlitzMode };

/** The two Category Blitz-specific GAME_THEME keys (lib/themeTokens.ts) — kept
 *  narrower than the full GameThemeKey union so MODE_CONFIG[mode].themeKey
 *  indexes GAME_THEME to exactly the blitzStandard/blitzReverse token shape,
 *  not the union of every game's theme shape. */
export type CategoryBlitzThemeKey = "blitzStandard" | "blitzReverse";

export const MODE_CONFIG: Record<CategoryBlitzMode, {
  puckLabel: string;              // "Be Unique!" / "Blend In!" — the ONLY hero text shown to players
  rule: string;                   // one-line instruction shown in takeover + board header
  themeKey: CategoryBlitzThemeKey; // key into themeTokens GAME_THEME
}> = {
  standard: { puckLabel: "Be Unique!", rule: "Only unique answers earn points — be original.",      themeKey: "blitzStandard" },
  reverse:  { puckLabel: "Blend In!",  rule: "Match the crowd — popular answers win.", themeKey: "blitzReverse"  },
};

// Cadence knob — flip to a random-25% strategy later without touching startRound.
export const isReverseRound = (roundIndex: number) => roundIndex % 4 === 3;

// Points for one submission in a "reverse" round: 1 pt per player who gave the
// same normalized answer, uncapped.
export const reverseRoundPoints = (matchingPlayerCount: number): number => matchingPlayerCount;

// ── Full-screen mode-flip takeover — dev-selectable variant ──────────────────
// Three flip treatments are shipped side by side (docs/category-blitz-mode-b-plan.md
// §4b) while we pick a winner by feel in the live app, instead of guessing from
// a standalone prototype. Stored the same way categoryBlitzTestMode.ts stores its
// toggle — localStorage only, dev/testing convenience, never read server-side.
export type ModeFlipVariant = "card" | "splitFlap" | "overspin";
export const MODE_FLIP_VARIANTS: ModeFlipVariant[] = ["card", "splitFlap", "overspin"];
export const DEFAULT_MODE_FLIP_VARIANT: ModeFlipVariant = "card";

const MODE_FLIP_VARIANT_STORAGE_KEY = "tp:category-blitz-mode-flip-variant";

function isModeFlipVariant(value: string | null): value is ModeFlipVariant {
  return !!value && (MODE_FLIP_VARIANTS as string[]).includes(value);
}

export function getModeFlipTakeoverVariant(): ModeFlipVariant {
  if (typeof window === "undefined") return DEFAULT_MODE_FLIP_VARIANT;
  try {
    const stored = window.localStorage.getItem(MODE_FLIP_VARIANT_STORAGE_KEY);
    return isModeFlipVariant(stored) ? stored : DEFAULT_MODE_FLIP_VARIANT;
  } catch {
    return DEFAULT_MODE_FLIP_VARIANT;
  }
}

export function setModeFlipTakeoverVariant(variant: ModeFlipVariant): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MODE_FLIP_VARIANT_STORAGE_KEY, variant);
  } catch {
    // ignore storage failures (private browsing, quota, etc.)
  }
}
