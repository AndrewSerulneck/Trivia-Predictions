export type PlayerPanel = 0 | 1 | 2;
const key = (venueId: string) => `tp:player-view:v1:${encodeURIComponent(venueId)}`;

/** Read after mount, before carousel positioning; never during SSR hydration. */
export function readPlayerPanel(venueId: string): PlayerPanel {
  try {
    const value = window.sessionStorage.getItem(key(venueId));
    return value === "1" ? 1 : value === "2" ? 2 : 0;
  } catch {
    return 0;
  }
}

export function savePlayerPanel(venueId: string, panel: PlayerPanel): void {
  try {
    window.sessionStorage.setItem(key(venueId), String(panel));
  } catch {
    // Storage restrictions must not prevent navigation.
  }
}
