const STORAGE_KEY = "tp:category-blitz-test-mode";

function normalizeBoolean(value: string | undefined): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function readBrowserToggle(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return normalizeBoolean(window.localStorage.getItem(STORAGE_KEY) ?? "");
  } catch {
    return false;
  }
}

// Used by skipRound (lib/categoryBlitz.ts) to gate the dev-only button in the UI.
// The actual skip-round security boundary is the session's own DB column
// (read fresh every call), not this client toggle — see skipRound's docstring.
export function isCategoryBlitzTestModeEnabled(): boolean {
  if (normalizeBoolean(process.env.NEXT_PUBLIC_CATEGORY_BLITZ_TEST_MODE)) {
    return true;
  }
  return readBrowserToggle();
}

export function setCategoryBlitzTestMode(enabled: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (enabled) {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore storage failures (private browsing, quota, etc.)
  }
}

/**
 * Server-side-only toggle that bypasses the <3-player scoring gate so a solo
 * tester can verify grading/leaderboard end-to-end without needing two other
 * participants. Set `CATEGORY_BLITZ_ALLOW_SOLO_SCORING=true` in your .env.local.
 *
 * When enabled:
 * - `insufficientPlayers` in scoreRound evaluates to false regardless of count
 * - `buildResults` shows real answer reasons instead of "insufficient_players"
 *
 * Never enabled in production — this is a dev/test convenience flag only.
 */
export function isCategoryBlitzSoloScoringEnabled(): boolean {
  return normalizeBoolean(process.env.CATEGORY_BLITZ_ALLOW_SOLO_SCORING);
}
