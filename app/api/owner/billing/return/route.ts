// DEPRECATED (SlimCD): superseded by the Stripe billing flow — POST /api/owner/billing/checkout,
// POST /api/owner/billing/portal, and the webhook /api/webhooks/stripe. Retained only
// for any legacy subscriptions created before the Stripe cutover; no new code should
// call this route. Slated for removal once no active SlimCD subscriptions remain.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkSession } from "@/lib/slimcd";

function getBaseUrl(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

function redirectToBilling(request: Request, query: string): Response {
  const base = getBaseUrl(request);
  return NextResponse.redirect(`${base}/owner/billing?${query}`, { status: 302 });
}

const SUBSCRIPTION_DEFAULT_CENTS = 10000;

/**
 * SlimCD redirects the user's browser here after they complete (or abandon) the
 * hosted payment page. We verify the session server-side via CheckSession — the
 * browser carries nothing we trust except the opaque sessionid.
 *
 * Security properties enforced here:
 *  - Approval is read from CheckSession (SlimCD server), never from query params.
 *  - venueId/ownerId come back inside the session `variables` (SlimCD-held, not
 *    browser-supplied) and are re-validated against venue_owner_venues before any
 *    write, so a replayed/forged redirect cannot bind a card to a foreign venue.
 *  - Idempotency: the SlimCD `gateid` (transaction ticket) is stable across
 *    replays of a completed session. We refuse to write a second invoice for a
 *    ticket we've already recorded, so a double redirect (back button, retry)
 *    cannot double-charge the books.
 */
export async function GET(request: Request) {
  if (!supabaseAdmin) {
    return redirectToBilling(request, "error=server");
  }

  const { searchParams } = new URL(request.url);
  const sessionId = (searchParams.get("sessionid") ?? searchParams.get("SessionID") ?? "").trim();

  if (!sessionId) {
    return redirectToBilling(request, "error=missing-session");
  }

  let check;
  try {
    check = await checkSession(sessionId);
  } catch {
    return redirectToBilling(request, "error=check-failed");
  }

  if (!check.completed) {
    return redirectToBilling(request, "error=incomplete");
  }
  if (!check.approved) {
    return redirectToBilling(request, "error=payment-declined");
  }
  if (!check.gateid) {
    return redirectToBilling(request, "error=no-token");
  }

  const gateid = check.gateid;
  // In production, metadata round-trips through SlimCD's var1..var4 session fields.
  // In dev-stub mode (sessionid starts with STUBSESS), it travels as URL params —
  // module-level Maps don't survive between Next.js dev requests, so URL params are
  // the reliable channel. In production, sessionids never start with STUBSESS so
  // URL params are never used for metadata (no security risk).
  const isStubSession = sessionId.startsWith("STUBSESS");
  const venueId = check.variables.venueId ?? (isStubSession ? (searchParams.get("venueId") ?? "") : "");
  const ownerId = check.variables.ownerId ?? (isStubSession ? (searchParams.get("ownerId") ?? "") : "");
  const intent = check.variables.intent ?? (isStubSession ? (searchParams.get("intent") ?? "") : "");
  const amountCentsStr = check.variables.amountCents ?? (isStubSession ? (searchParams.get("amountCents") ?? "") : "");

  if (!venueId || !ownerId || !intent) {
    return redirectToBilling(request, "error=missing-metadata");
  }

  // Trust boundary: confirm the owner named in the session metadata actually owns
  // this venue. venue_owner_venues is the same source of truth requireOwnerAuth uses.
  const { data: ownership, error: ownershipError } = await supabaseAdmin
    .from("venue_owner_venues")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("venue_id", venueId)
    .maybeSingle<{ id: string }>();

  if (ownershipError) {
    return redirectToBilling(request, "error=db");
  }
  if (!ownership) {
    return redirectToBilling(request, "error=ownership");
  }

  // ----- Card update -------------------------------------------------------
  // Naturally idempotent: re-applying the same gateid token is a no-op.
  if (intent === "update_card") {
    const { data: sub } = await supabaseAdmin
      .from("billing_subscriptions")
      .select("id")
      .eq("venue_id", venueId)
      .eq("owner_id", ownerId)
      .maybeSingle<{ id: string }>();

    if (!sub) {
      return redirectToBilling(request, "error=no-subscription");
    }

    const { error } = await supabaseAdmin
      .from("billing_subscriptions")
      .update({ slimcd_recurring_token: gateid })
      .eq("id", sub.id);

    if (error) {
      return redirectToBilling(request, "error=db");
    }

    return redirectToBilling(request, "success=card-updated");
  }

  // ----- New subscription --------------------------------------------------
  if (intent !== "subscribe") {
    return redirectToBilling(request, "error=unknown-intent");
  }

  const amountCents = Number(amountCentsStr) > 0 ? Number(amountCentsStr) : SUBSCRIPTION_DEFAULT_CENTS;

  // Idempotency guard: if we've already booked an invoice for this exact SlimCD
  // ticket, this is a duplicate redirect. Short-circuit to success without
  // writing anything a second time.
  const { data: priorInvoice } = await supabaseAdmin
    .from("billing_invoices")
    .select("id")
    .eq("slimcd_ticket", gateid)
    .maybeSingle<{ id: string }>();

  if (priorInvoice) {
    return redirectToBilling(request, "success=subscribed");
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  // Atomic upsert keyed on the unique venue_id constraint. Reactivates a
  // cancelled/past_due row or inserts a new one without a select-then-write race.
  const { data: subscription, error: subError } = await supabaseAdmin
    .from("billing_subscriptions")
    .upsert(
      {
        venue_id: venueId,
        owner_id: ownerId,
        slimcd_recurring_token: gateid,
        plan_type: "subscription",
        amount_cents: amountCents,
        status: "active" as const,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
      },
      { onConflict: "venue_id" }
    )
    .select("id")
    .single<{ id: string }>();

  if (subError || !subscription) {
    // The card was charged but we could not persist the subscription. Flag it
    // distinctly so support can reconcile; this is not a payment failure.
    return redirectToBilling(request, "error=db&payment=ok");
  }

  const { error: invoiceError } = await supabaseAdmin.from("billing_invoices").insert({
    subscription_id: subscription.id,
    venue_id: venueId,
    description: "Hightop Challenge subscription — initial charge",
    amount_cents: amountCents,
    status: "paid",
    slimcd_ticket: gateid,
    charged_at: now.toISOString(),
  });

  if (invoiceError) {
    // 23505 = unique violation on uq_billing_invoices_slimcd_ticket: a concurrent
    // redirect already booked this exact ticket. That is success, not a failure.
    if (invoiceError.code === "23505") {
      return redirectToBilling(request, "success=subscribed");
    }
    // Otherwise the subscription is active and the card was charged, but the
    // invoice record failed to write. A replay self-heals: the upsert is
    // idempotent and the gateid guard above retries the insert on the next hit.
    return redirectToBilling(request, "success=subscribed&invoice=pending");
  }

  return redirectToBilling(request, "success=subscribed");
}
