import "server-only";

import { broadcastOnChannel } from "@/lib/liveGameBroadcast";

/** Channel name all players in a venue subscribe to for session/schedule events. */
export function categoryBlitzChannelName(venueId: string): string {
  return `category-blitz-session:${venueId}`;
}

/** Callers must `await` this — see liveGameBroadcast.ts's broadcastOnChannel. */
export async function broadcastCategoryBlitz(venueId: string, event: string, payload: Record<string, unknown>): Promise<void> {
  await broadcastOnChannel(categoryBlitzChannelName(venueId), event, payload);
}
