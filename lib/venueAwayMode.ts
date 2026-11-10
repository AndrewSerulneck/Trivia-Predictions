// Away mode: Venue Home when the player isn't at the bar (docs/cancelled-prizes-pick-windows-away-mode-plan.md,
// Phase C1). The page stays readable (games and their times, prizes, leaderboard, directions), but nothing
// is played from it: every play control reads AWAY_PLAY_LABEL, and a tap re-checks location once and opens
// the game only if the player turns out to be there. Client-safe; only the auto-open stamp touches storage.

export const AWAY_PLAY_LABEL = "Play at the bar";

/**
 * Runs `play` only when the player is at the bar. Away, it re-checks location once (a tap, never a timer)
 * and plays only if that check passes. Returns whether `play` ran.
 */
export const playWhenPresent = async (
  isAway: boolean,
  recheckLocation: () => Promise<boolean>,
  play: () => void
): Promise<boolean> => {
  if (isAway) {
    const here = await recheckLocation().catch(() => false);
    if (!here) return false;
  }
  play();
  return true;
};

/**
 * Google Maps directions to the bar's geofence centre (the point a check-in is measured from), with the
 * place id when the bar has one so the pin carries its name. Opens the Maps app on phones that have it.
 */
export const venueDirectionsUrl = (venue: {
  latitude: number;
  longitude: number;
  placeId?: string | null;
}): string | null => {
  if (!Number.isFinite(venue.latitude) || !Number.isFinite(venue.longitude)) return null;
  const params = new URLSearchParams({ api: "1", destination: `${venue.latitude},${venue.longitude}` });
  const placeId = (venue.placeId ?? "").trim();
  if (placeId) params.set("destination_place_id", placeId);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
};

// A push or link to a bar the player isn't at opens it view-only by itself, at most once a minute per tab
// (Phase R3). Two website tabs on different bars would otherwise keep switching each other back. The stamp
// is per tab (sessionStorage); opening a bar clears sessionStorage, so the join flow writes it AFTER that clear.
const AWAY_AUTO_OPEN_KEY = "ht:away-auto-open-at";
export const AWAY_AUTO_OPEN_MIN_GAP_MS = 60_000;

/**
 * The bar a `/?v=X` link should open by itself: X, when it is one of the player's away bars AND this sign-in's
 * list was built from a real location (`listBuilt`). A failed or timed-out check commits no list, so every recent
 * bar looks "away" and the bar the player is standing in would open view-only (Phase R9). Null = don't open.
 */
export const awayAutoOpenTarget = <T extends { id: string }>(params: {
  venueParam: string | null | undefined;
  awayVenues: readonly T[];
  listBuilt: boolean;
}): T | null => {
  if (!params.venueParam || !params.listBuilt) return null;
  return params.awayVenues.find((item) => item.id === params.venueParam) ?? null;
};

/** Whether this tab may open a bar automatically now. No storage = allowed (the page's ref still limits it). */
export const awayAutoOpenAllowed = (nowMs: number): boolean => {
  if (typeof window === "undefined") return true;
  try {
    const lastAt = Number(window.sessionStorage.getItem(AWAY_AUTO_OPEN_KEY) ?? 0);
    if (!Number.isFinite(lastAt) || lastAt <= 0) return true;
    const elapsed = nowMs - lastAt;
    return elapsed < 0 || elapsed >= AWAY_AUTO_OPEN_MIN_GAP_MS;
  } catch {
    return true;
  }
};

/** Records an automatic open in this tab. Call only after the session clear. */
export const markAwayAutoOpen = (nowMs: number): void => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(AWAY_AUTO_OPEN_KEY, String(nowMs));
  } catch {
    // No sessionStorage: nothing to record.
  }
};
