import { NextResponse } from "next/server";
import { isPartnerMessagesEnabled, PARTNER_MESSAGE_COPY } from "@/lib/partnerMessageRules";
import { getVenueMessageStatus, sendVenueMessage, VenueMessagesUnavailableError } from "@/lib/push/venueMessages";
import { requireOwnerAuth, type OwnerAuthContext } from "@/lib/requireOwnerAuth";

// The Partner Dashboard's "Message your players" (docs/native-app-store-plan.md Phase 5.5).
//   GET  ?venueId=            — messages left today, paused or not, the last few sent.
//   POST { venueId, text }    — send one (lib/push/venueMessages.ts); answers once it is recorded,
//                               the pushes go after the reply.
// 404 while NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED is off. Owner auth and "this venue is yours" come
// before any read or write. Website only: /owner is a web-only link-out in the app.

const NO_STORE = { "Cache-Control": "no-store" };
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

const REFUSALS: Record<string, { status: number; error: string }> = {
  empty: { status: 400, error: PARTNER_MESSAGE_COPY.problems.empty },
  too_long: { status: 400, error: PARTNER_MESSAGE_COPY.problems.too_long },
  link: { status: 400, error: PARTNER_MESSAGE_COPY.problems.link },
  words: { status: 400, error: PARTNER_MESSAGE_COPY.problems.words },
  paused: { status: 403, error: PARTNER_MESSAGE_COPY.paused },
  capped: { status: 429, error: PARTNER_MESSAGE_COPY.remaining(0) },
  no_audience: { status: 409, error: PARTNER_MESSAGE_COPY.noAudience },
  unknown_venue: { status: 404, error: "Venue not found." },
  not_configured: { status: 503, error: "Messages are unavailable right now." },
};

const authorize = async (
  request: Request,
  venueId: string,
): Promise<{ auth: OwnerAuthContext } | { response: Response }> => {
  let auth: OwnerAuthContext;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return { response: response as Response };
  }
  if (!venueId) return { response: json({ ok: false, error: "venueId is required." }, 400) };
  if (!auth.venueIds.includes(venueId)) {
    return { response: json({ ok: false, error: "You do not have access to this venue." }, 403) };
  }
  return { auth };
};

export async function GET(request: Request) {
  if (!isPartnerMessagesEnabled()) return json({ ok: false, error: "Not found." }, 404);
  const venueId = new URL(request.url).searchParams.get("venueId")?.trim() ?? "";
  const gate = await authorize(request, venueId);
  if ("response" in gate) return gate.response;
  try {
    return json({ ok: true, status: await getVenueMessageStatus(venueId) });
  } catch (error) {
    console.error("[OwnerMessages] status-failed", error instanceof Error ? error.message : error);
    return json({ ok: false, error: "Couldn't load your messages." }, error instanceof VenueMessagesUnavailableError ? 503 : 500);
  }
}

export async function POST(request: Request) {
  if (!isPartnerMessagesEnabled()) return json({ ok: false, error: "Not found." }, 404);
  const body = (await request.json().catch(() => ({}))) as { venueId?: unknown; text?: unknown };
  const venueId = typeof body.venueId === "string" ? body.venueId.trim() : "";
  const gate = await authorize(request, venueId);
  if ("response" in gate) return gate.response;
  if (typeof body.text !== "string" || body.text.length > 2000) {
    return json({ ok: false, error: PARTNER_MESSAGE_COPY.problems.too_long }, 400);
  }
  try {
    const result = await sendVenueMessage({ venueId, ownerId: gate.auth.ownerId, text: body.text });
    if (!result.ok) {
      const refusal = REFUSALS[result.reason];
      return json({ ok: false, code: result.reason, error: refusal.error }, refusal.status);
    }
    // Recorded and queued: whatever happens reading the status, the reply is a success (Phase 10.2).
    let status: Awaited<ReturnType<typeof getVenueMessageStatus>> | null = null;
    try {
      status = await getVenueMessageStatus(venueId);
    } catch (error) {
      console.error("[OwnerMessages] status-after-send-failed", error instanceof Error ? error.message : error);
    }
    return json({ ok: true, messageId: result.messageId, devices: result.devices, status });
  } catch (error) {
    console.error("[OwnerMessages] send-failed", error instanceof Error ? error.message : error);
    return json({ ok: false, error: "Couldn't send your message. Try again." }, 500);
  }
}
