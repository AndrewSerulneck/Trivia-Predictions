import "server-only";

import { isGlobalRoomEnabled } from "@/lib/categoryBlitzShared";

/**
 * The hidden venue id used as the pooled room when {@link isGlobalRoomEnabled}
 * is on. Seeded by migration `20260719120000_category_blitz_global_room_venue.sql`
 * with `venues.hidden = true`, so it never appears in `listVenues()` / any
 * join or venue-picker flow. The id is intentionally opaque (`hc-cbz-live`, not
 * "global-room") because it can surface client-side as the realtime channel
 * name — an inspecting user must not be able to infer that all venues share one
 * room. Kept in this `server-only`-guarded module (not `lib/categoryBlitzShared.ts`,
 * which client components import) so a future edit can't accidentally pull the
 * raw id into the client bundle.
 */
export const CATEGORY_BLITZ_GLOBAL_ROOM_VENUE_ID = "hc-cbz-live";

/**
 * Resolve which "room" a venue's Category Blitz gameplay runs in. This is the
 * single indirection point behind the global-room feature: with the flag off it
 * is the identity function (every venue is its own room — today's fully-isolated
 * behavior), and with it on every venue collapses onto the one shared hidden
 * room so there are always enough concurrent players.
 *
 * Apply this ONLY at Category Blitz gameplay boundaries (session drive/create,
 * round scoring, presence). Never near venue join, geofencing, or a user's
 * `users.venue_id` membership — those must always use the player's real venue.
 * Server-only by construction (see the `server-only` import above): a client
 * component that tries to import this module fails the build instead of
 * silently shipping the mapping.
 */
export const resolveCategoryBlitzRoomId = (venueId: string): string =>
  isGlobalRoomEnabled() ? CATEGORY_BLITZ_GLOBAL_ROOM_VENUE_ID : venueId;
