import { isMultiVenueBillingEnabled, type VenueBillChangeAction } from "@/lib/multiVenueBilling";
import { rateLimit } from "@/lib/rateLimit";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { isValidClientKey } from "@/lib/venueAddition";
import {
  changeRateLimitRefusal,
  loadVenueChangeContext,
  startVenueChange,
  venueChangeResponse,
} from "@/lib/venueRemoval";

/** Small JSON body: a venue id, a key and an action. */
const MAX_BODY_BYTES = 2048;

/**
 * POST /api/owner/venues/remove — a partner takes a venue off their bill at the end of the paid
 * month (`action: "remove"`, the default), or changes their mind before then (`action: "undo"`)
 * (docs/multi-venue-volume-billing-plan.md §4.4, Phase 5). No money moves either way: Stripe's
 * quantity changes with no proration, and the venue stays live until the period it was paid for ends.
 *
 * Gate order: flag (404 when off) → owner session → owner rate limit → body → the bill → the change.
 * Every decision lives in lib/venueRemoval.ts; this file only parses and answers.
 *
 * Body: `{ venueId, idempotencyKey, action? }`. `idempotencyKey` is generated once per tap and
 * re-sent on a retry: the same key always means the same change.
 *
 * Answers: 200 `{ ok: true, change }` or `{ ok: false, code, error }`.
 */
export async function POST(request: Request) {
  if (!isMultiVenueBillingEnabled()) {
    return new Response(JSON.stringify({ ok: false, error: "Not found." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  const limit = await rateLimit(request, "venueChangeOwner", { identity: auth.ownerId, ignoreIp: true });
  if (!limit.allowed) {
    return venueChangeResponse(changeRateLimitRefusal(limit), {
      "Retry-After": String(Math.max(1, limit.retryAfterSeconds)),
    });
  }

  const invalid = (error = "Something about that request wasn't right. Please refresh and try again.") =>
    venueChangeResponse({ ok: false, httpStatus: 400, code: "invalid_request", error });

  const raw = await request.text().catch(() => "");
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return invalid("That request was too large.");
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch {
    body = {};
  }

  const venueId = typeof body.venueId === "string" ? body.venueId.trim() : "";
  const clientKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  const action: VenueBillChangeAction | null =
    body.action === undefined || body.action === "remove" ? "remove" : body.action === "undo" ? "undo" : null;
  if (!venueId || !isValidClientKey(clientKey) || !action) return invalid();

  const loaded = await loadVenueChangeContext(auth, venueId, action);
  if (!loaded.ok) return venueChangeResponse(loaded);

  return venueChangeResponse(await startVenueChange({ auth, context: loaded.context, action, clientKey }));
}
