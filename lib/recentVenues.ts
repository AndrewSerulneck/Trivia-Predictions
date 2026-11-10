// "Your bars" (docs/cancelled-prizes-pick-windows-away-mode-plan.md, D6 + Phase C1). Pure and client-safe:
// the server picks which bars a player sees, and the sign-in list splits them into "join" and "view only".
//
// A bar stays on a player's list for 90 days after their last check-in there, then drops off, so the list
// stays short. A check-in is a location check that passed at the bar (joining, or the 15-minute presence
// check): `venue_presence_sessions.last_verified_at`, which a failed check never erases (lib/venuePresence.ts).

export const RECENT_VENUE_WINDOW_DAYS = 90;
const RECENT_VENUE_WINDOW_MS = RECENT_VENUE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export type RecentVenue = { venueId: string; lastCheckedInAt: string | null };

/**
 * The bars a player sees, newest check-in first. One row per bar (a player has one profile per bar, but the
 * latest time wins if rows repeat). `requestedVenueId` (the bar a push or link asked for) is kept even when
 * its check-in is older than 90 days, or missing: the player has a profile there, and that link must land.
 */
export const selectRecentVenues = (
  rows: ReadonlyArray<{ venueId: string; lastVerifiedAt: string | null }>,
  nowMs: number,
  requestedVenueId?: string | null
): RecentVenue[] => {
  const latest = new Map<string, number | null>();
  for (const row of rows) {
    const venueId = row.venueId.trim();
    if (!venueId) continue;
    const parsed = row.lastVerifiedAt ? Date.parse(row.lastVerifiedAt) : Number.NaN;
    const time = Number.isFinite(parsed) ? parsed : null;
    const previous = latest.get(venueId);
    if (previous === undefined || (time !== null && (previous === null || time > previous))) {
      latest.set(venueId, time);
    }
  }
  const requested = (requestedVenueId ?? "").trim();
  return [...latest.entries()]
    .filter(([venueId, time]) => venueId === requested || (time !== null && nowMs - time <= RECENT_VENUE_WINDOW_MS))
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    .map(([venueId, time]) => ({ venueId, lastCheckedInAt: time === null ? null : new Date(time).toISOString() }));
};

/**
 * The "Your bars" rows on the sign-in list: the player's recent bars that are NOT in range. Bars in range are
 * already in the normal list, where a tap joins as a full player. `venues` is the visible-venue list the page
 * already read, so a hidden or deleted bar never shows.
 */
export const awayRecentVenues = <V extends { id: string }>(
  recent: ReadonlyArray<RecentVenue>,
  venues: ReadonlyArray<V>,
  inRange: ReadonlyArray<{ id: string }>
): V[] => {
  const byId = new Map(venues.map((venue) => [venue.id, venue] as const));
  const inRangeIds = new Set(inRange.map((venue) => venue.id));
  return recent
    .filter((entry) => !inRangeIds.has(entry.venueId))
    .map((entry) => byId.get(entry.venueId))
    .filter((venue): venue is V => Boolean(venue));
};
