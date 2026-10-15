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
  reverse:  { puckLabel: "Majority Rules!",  rule: "More popular answers score more points this round!", themeKey: "blitzReverse"  },
};

// The ONE home of the Majority Rules cadence, for both engines (scheduled
// startRound and continuous startContinuousRound). roundIndex is 0-based within
// a session, so rounds 5, 10, 15… are Majority Rules — never random (Andrew,
// 2026-10-14, docs/category-blitz-how-to-play-plan.md §2).
export const MAJORITY_RULES_EVERY_N_ROUNDS = 5;
export const isReverseRound = (roundIndex: number) =>
  roundIndex % MAJORITY_RULES_EVERY_N_ROUNDS === MAJORITY_RULES_EVERY_N_ROUNDS - 1;

// Standard-round points for one valid answer nobody else gave.
export const POINTS_PER_UNIQUE_ANSWER = 2;

// Fewest session participants for a round to award any points (Majority Rules
// needs only a pair to match). Below this every answer scores 0.
export const minPlayersToScoreFor = (mode: CategoryBlitzMode | (string & {})): number => (mode === "reverse" ? 2 : 3);

// Points for one submission in a "reverse" round: 1 pt per player who gave the
// same normalized answer, uncapped.
export const reverseRoundPoints = (matchingPlayerCount: number): number => matchingPlayerCount;

// ── Full-screen mode-flip takeover — dev-selectable variant ──────────────────
// Three flip treatments are shipped side by side (docs/category-blitz-mode-b-plan.md
// §4b) while we pick a winner by feel in the live app, instead of guessing from
// a standalone prototype. Stored the same way categoryBlitzTestMode.ts stores its
// toggle — localStorage only, dev/testing convenience, never read server-side.
export type ModeFlipVariant = "card" | "splitFlap" | "overspin";

// Which way the full-screen takeover is turning — see
// docs/category-blitz-mode-flip-reverse-transition-plan.md. "toReverse" is the
// original standard→Majority Rules flip (magenta landing face); "toStandard"
// is the reverse→standard return flip (green landing face).
export type ModeFlipDirection = "toReverse" | "toStandard";
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
