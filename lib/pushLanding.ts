import type { PlayerPanel } from "@/lib/playerViewState";

// Where a venue push lands (docs/cancelled-prizes-pick-windows-away-mode-plan.md, Phase C2). Pure, shared by
// the server senders (lib/push/venueNews.ts, lib/push/gameReminders.ts) and the app's tap handler.
//
// A game push opens Venue Home on the Games screen, a prize push on the Prizes screen — never whichever screen
// the player last swiped to. Venue Home restores its last screen from sessionStorage (lib/playerViewState.ts),
// so the tap handler saves the push's screen there BEFORE navigating (a fallback). The trip through the
// sign-in list (`/?v=X`, which opens X view-only when the player isn't there) clears sessionStorage, so the
// screen rides in the URL instead: `signInListPath` keeps `?panel=` on the hop and the join flow puts it on
// the bar it opens (Phase R3). `VenuePanelFromUrl` reads `?panel=` on Venue Home, then drops it.

export const VENUE_PANEL_PARAM = "panel";

export type VenuePushPanel = "games" | "prizes";

const PANEL_INDEX: Record<VenuePushPanel, PlayerPanel> = { games: 0, prizes: 2 };

/** `/venue/{id}?panel=games` — the one way a push builds a Venue Home link. */
export const venuePushPath = (venueId: string, panel: VenuePushPanel): string =>
  `/venue/${encodeURIComponent(venueId)}?${VENUE_PANEL_PARAM}=${panel}`;

/** A `panel` value as a push screen name, or null. */
export const venuePushPanelFromValue = (value: string | null | undefined): VenuePushPanel | null => {
  const trimmed = (value ?? "").trim();
  return trimmed === "games" || trimmed === "prizes" ? trimmed : null;
};

/** The push screen name a query string asks for, or null. */
export const venuePushPanelFromSearch = (search: string): VenuePushPanel | null =>
  venuePushPanelFromValue(new URLSearchParams(search).get(VENUE_PANEL_PARAM));

/** The Venue Home screen a query string asks for, or null. */
export const venuePanelFromSearch = (search: string): PlayerPanel | null => {
  const panel = venuePushPanelFromSearch(search);
  return panel === null ? null : PANEL_INDEX[panel];
};

/** The Venue Home screen index for a push screen name. */
export const playerPanelForPushPanel = (panel: VenuePushPanel): PlayerPanel => PANEL_INDEX[panel];

/**
 * `/?v={id}`, plus `&panel=` when `search` carries one: every Venue Home redirect to the sign-in list goes
 * through this, so a push's screen survives the hop (away-mode plan Phase R3). Opening the bar clears all of
 * sessionStorage (`clearClientState`), so the URL is what carries the screen, not `savePlayerPanel`.
 */
export const signInListPath = (venueId: string, search: string): string =>
  withVenuePanel(`/?v=${encodeURIComponent(venueId)}`, venuePushPanelFromSearch(search));

/** `path` with `panel=` added when there is a screen to carry (`path` already has a query string). */
export const withVenuePanel = (path: string, panel: VenuePushPanel | null): string =>
  panel ? `${path}&${VENUE_PANEL_PARAM}=${panel}` : path;

/** The bar and screen a tapped push path points to, or null when it isn't a Venue Home landing. */
export const venuePushLanding = (path: string): { venueId: string; panel: PlayerPanel } | null => {
  const match = /^\/venue\/([^/?#]+)\/?(\?[^#]*)?/.exec(path);
  if (!match) return null;
  const panel = venuePanelFromSearch(match[2] ?? "");
  if (panel === null) return null;
  let venueId: string;
  try {
    venueId = decodeURIComponent(match[1]).trim();
  } catch {
    return null;
  }
  return venueId ? { venueId, panel } : null;
};
