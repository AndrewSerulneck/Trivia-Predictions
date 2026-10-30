import { NextResponse } from "next/server";
import {
  isVenueMessageId,
  readVenueMessage,
  reportVenueMessage,
  VenueMessagesUnavailableError,
} from "@/lib/push/venueMessages";
import { isSessionEnforced, resolveRequestUserId } from "@/lib/serverSession";

// A partner's message, for the player who tapped its push (docs/native-app-store-plan.md Phase 5.5).
//   GET  — the message, for a player of that bar only (anyone else: 404, the same as no message).
//   POST — report it. Enough distinct reports pause the bar's messages (lib/push/venueMessages.ts).
// The player is the SIGNED session's. 503 without SESSION_SECRET: the dev server shares the
// production database, so an unverified player must never file a report. Not flag-gated on purpose:
// a message already sent can always be read and reported.

type Params = { params: Promise<{ messageId: string }> };

const NO_STORE = { "Cache-Control": "no-store" };
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

const resolvePlayer = (request: Request): { userId: string } | { response: Response } => {
  if (!isSessionEnforced()) {
    console.error("[VenueMessage] session-not-enforced");
    return { response: json({ ok: false, error: "Messages are unavailable right now." }, 503) };
  }
  const { userId, forbidden } = resolveRequestUserId(request, null);
  if (forbidden) return { response: json({ ok: false, error: "Forbidden." }, 403) };
  if (!userId) return { response: json({ ok: false, error: "Please sign in again." }, 401) };
  return { userId };
};

export async function GET(request: Request, { params }: Params) {
  const { messageId } = await params;
  if (!isVenueMessageId(messageId)) return json({ ok: false, error: "Message not found." }, 404);
  const player = resolvePlayer(request);
  if ("response" in player) return player.response;
  try {
    const message = await readVenueMessage(messageId, player.userId);
    if (!message) return json({ ok: false, error: "Message not found." }, 404);
    return json({ ok: true, message });
  } catch (error) {
    console.error("[VenueMessage] read-failed", error instanceof Error ? error.message : error);
    return json({ ok: false, error: "Couldn't load that message." }, error instanceof VenueMessagesUnavailableError ? 503 : 500);
  }
}

export async function POST(request: Request, { params }: Params) {
  const { messageId } = await params;
  if (!isVenueMessageId(messageId)) return json({ ok: false, error: "Message not found." }, 404);
  const player = resolvePlayer(request);
  if ("response" in player) return player.response;
  try {
    const result = await reportVenueMessage(messageId, player.userId);
    if (result.outcome === "not_found") return json({ ok: false, error: "Message not found." }, 404);
    return json({ ok: true, outcome: result.outcome });
  } catch (error) {
    console.error("[VenueMessage] report-failed", error instanceof Error ? error.message : error);
    return json({ ok: false, error: "Couldn't send that. Try again." }, error instanceof VenueMessagesUnavailableError ? 503 : 500);
  }
}
