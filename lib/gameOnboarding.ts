import { getVenueId } from "@/lib/storage";
import type { VenueGameKey } from "@/lib/venueGameCards";

export const ONBOARDING_STALE_MS = 7 * 24 * 60 * 60 * 1000;

function onboardingStorageKey(gameKey: VenueGameKey, venueId: string): string {
  return `tp_onboarding_${gameKey}_${venueId}`;
}

export function markOnboardingComplete(gameKey: VenueGameKey): void {
  try {
    const venueId = getVenueId()?.trim() ?? "";
    if (!venueId) return;
    localStorage.setItem(onboardingStorageKey(gameKey, venueId), String(Date.now()));
  } catch {
    // localStorage unavailable — silently skip
  }
}

/** True when this browser recorded playing `gameKey` at this venue within ONBOARDING_STALE_MS. */
export function hasRecentOnboarding(gameKey: VenueGameKey): boolean {
  try {
    const venueId = getVenueId()?.trim() ?? "";
    if (!venueId) return false;
    const raw = localStorage.getItem(onboardingStorageKey(gameKey, venueId));
    if (!raw) return false;
    const timestamp = Number(raw);
    if (!Number.isFinite(timestamp)) return false;
    return Date.now() - timestamp < ONBOARDING_STALE_MS;
  } catch {
    return false;
  }
}
