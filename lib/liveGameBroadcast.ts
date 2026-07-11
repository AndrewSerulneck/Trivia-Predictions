import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Send a broadcast event on an arbitrary Supabase Realtime channel. Shared core
 * for every live/scheduled game's per-venue channel (see categoryBlitzBroadcast.ts,
 * liveTriviaBroadcast.ts) so each new game doesn't reimplement the null-client
 * guard and `.channel().send()` boilerplate.
 *
 * Callers MUST `await` this. `.send()` on an unsubscribed channel falls back to
 * a REST call under the hood — a genuine HTTP request, not a fire-and-forget
 * local write. Discarding the promise (the previous `void`-and-forget shape)
 * left it racing the enclosing API route's response: in a serverless function
 * the runtime can freeze the instance the moment the response is sent, killing
 * the still-in-flight HTTP request before it ever leaves the process. Verified
 * via a real browser + websocket capture — the un-awaited send never reached a
 * subscribed client, while the identical payload sent with `await` arrived
 * immediately.
 */
export async function broadcastOnChannel(channelName: string, event: string, payload: Record<string, unknown>): Promise<void> {
  if (!supabaseAdmin) return;
  await supabaseAdmin.channel(channelName).send({
    type: "broadcast",
    event,
    payload,
  });
}
