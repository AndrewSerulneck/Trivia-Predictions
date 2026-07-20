import "server-only";

import { broadcastOnChannel } from "@/lib/liveGameBroadcast";
import { categoryBlitzChannelName } from "@/lib/categoryBlitzShared";

/**
 * Channel name all players in a room subscribe to for session/schedule events.
 * Re-exported from the shared module so server broadcasts and client
 * subscriptions resolve the identical (hashed) name — see categoryBlitzShared.
 */
export { categoryBlitzChannelName };

/** Callers must `await` this — see liveGameBroadcast.ts's broadcastOnChannel. */
export async function broadcastCategoryBlitz(venueId: string, event: string, payload: Record<string, unknown>): Promise<void> {
  await broadcastOnChannel(categoryBlitzChannelName(venueId), event, payload);
}
