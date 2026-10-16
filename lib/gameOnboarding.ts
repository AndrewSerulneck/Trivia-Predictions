import type { VenueGameKey } from "@/lib/venueGameCards";

/**
 * A game's tutorial cards show at most once every 24 hours (Andrew, 2026-10-16).
 *
 * The clock starts when the player FINISHES the cards — taps Play (or Join for
 * Category Blitz) on the last card (Andrew, 2026-10-16, Q1). Backing out of the
 * cards doesn't count, and neither does playing the game: a skip straight into
 * the game never records a showing, or someone who plays every day would never
 * see the cards again. It is per game and per browser — not per venue — so a
 * guest who moves to another bar the same night does not flip through the same
 * cards again. Browser-only (localStorage): no request, no database row.
 */
export const TUTORIAL_REPEAT_AFTER_MS = 24 * 60 * 60 * 1000;

/** Set on the server-rendered cards' wrapper by `tutorialSkipScript` so they never paint when they'll be skipped. */
export const TUTORIAL_SKIP_ATTRIBUTE = "data-tutorial-skip";

/** Before 2026-10-16 the key was per venue: `tp_onboarding_<game>_<venueId>`. */
const LEGACY_KEY_PREFIX = "tp_onboarding_";

export const tutorialSeenStorageKey = (gameKey: VenueGameKey): string => `tp_tutorial_seen_${gameKey}`;

const removeLegacyKeys = (): void => {
  try {
    const legacy: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(LEGACY_KEY_PREFIX)) legacy.push(key);
    }
    for (const key of legacy) localStorage.removeItem(key);
  } catch {
    // Leftovers are harmless; nothing reads them any more.
  }
};

/** Record that the player just finished `gameKey`'s tutorial cards. */
export const markTutorialSeen = (gameKey: VenueGameKey, now: number = Date.now()): void => {
  try {
    localStorage.setItem(tutorialSeenStorageKey(gameKey), String(now));
  } catch {
    // localStorage unavailable — the cards simply show again next time
  }
  // Runs at most once a day per game, so the sweep costs nothing that matters.
  removeLegacyKeys();
};

/** True when the player finished `gameKey`'s tutorial cards within the last 24 hours. */
export const hasSeenTutorialRecently = (gameKey: VenueGameKey, now: number = Date.now()): boolean => {
  try {
    const raw = localStorage.getItem(tutorialSeenStorageKey(gameKey));
    if (!raw) return false;
    const seenAt = Number(raw);
    if (!Number.isFinite(seenAt)) return false;
    const elapsed = now - seenAt;
    // A timestamp in the future (the phone's clock moved back) must not hide
    // the cards indefinitely — treat it as not seen.
    return elapsed >= 0 && elapsed < TUTORIAL_REPEAT_AFTER_MS;
  } catch {
    return false;
  }
};

/**
 * Inline script for the server-rendered cards' wrapper (placed as its first
 * child). It runs before the first paint, applies the same 24-hour test as
 * `hasSeenTutorialRecently`, and marks the wrapper so CSS hides it — the cards
 * never flash for a player who is about to skip them. The component's effect
 * then makes the real decision. Pinned against `hasSeenTutorialRecently` by
 * tests/game-tutorial-once-a-day.test.ts.
 */
export const tutorialSkipScript = (gameKey: VenueGameKey): string =>
  `(function(){try{var p=document.currentScript&&document.currentScript.parentElement;` +
  `var r=localStorage.getItem(${JSON.stringify(tutorialSeenStorageKey(gameKey))});if(!p||!r)return;` +
  `var e=Date.now()-Number(r);if(e>=0&&e<${TUTORIAL_REPEAT_AFTER_MS})p.setAttribute(${JSON.stringify(TUTORIAL_SKIP_ATTRIBUTE)},"")` +
  `}catch(_){}})()`;
