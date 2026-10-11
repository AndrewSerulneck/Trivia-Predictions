import { isMultiVenueBillingEnabled } from "@/lib/multiVenueBilling";
import { rateLimit } from "@/lib/rateLimit";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { addVenueResponse, loadAddVenueContext, quoteVenueAddition, rateLimitRefusal } from "@/lib/venueAddition";

/**
 * GET /api/owner/venues/add/quote?venueId=… — what adding one more venue to the partner's bill
 * would cost: this venue's band price, the new monthly total (list and after their discount), and
 * what Stripe would charge today for the rest of the period, from Stripe's own preview
 * (docs/multi-venue-volume-billing-plan.md §2 and §4.3, Phase 3). Read-only: nothing is created
 * or charged. Fetched once when the "Review & pay" step opens — never on dashboard load.
 *
 * Refuses (same codes as the add itself) when the bill can't take a venue right now — so the
 * review step can explain why before the partner fills anything else in.
 */
export async function GET(request: Request) {
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

  const limit = await rateLimit(request, "venueQuoteOwner", { identity: auth.ownerId, ignoreIp: true });
  if (!limit.allowed) {
    return addVenueResponse(rateLimitRefusal(limit), { "Retry-After": String(Math.max(1, limit.retryAfterSeconds)) });
  }

  const venueId = new URL(request.url).searchParams.get("venueId")?.trim() || null;
  const loaded = await loadAddVenueContext(auth, venueId);
  if (!loaded.ok) return addVenueResponse(loaded);

  const quoted = await quoteVenueAddition(loaded.context);
  if (!quoted.ok) return addVenueResponse(quoted);
  return addVenueResponse({ ok: true, httpStatus: 200, quote: quoted.quote });
}
