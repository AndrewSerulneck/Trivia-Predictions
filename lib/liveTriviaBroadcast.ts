import "server-only";

import { broadcastOnChannel } from "@/lib/liveGameBroadcast";

/** Channel name all players in a venue subscribe to for Live Trivia schedule events. */
export function liveTriviaChannelName(venueId: string): string {
  return `live-trivia-session:${venueId}`;
}

/** Callers must `await` this — see liveGameBroadcast.ts's broadcastOnChannel. */
export async function broadcastLiveTrivia(venueId: string, event: string, payload: Record<string, unknown>): Promise<void> {
  await broadcastOnChannel(liveTriviaChannelName(venueId), event, payload);
}
