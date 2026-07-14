import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, getStripeWebhookSecret, mapStripeSubscriptionStatus } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendWelcomeEmail } from "@/lib/email/sendWelcomeEmail";

// Stripe requires the raw request body to verify the signature — force the
// Node.js runtime so the body is not transformed.
export const runtime = "nodejs";

/**
 * POST /api/webhooks/stripe — Stripe event sink. This is the source of truth for
 * billing_subscriptions.status: Checkout completion, subscription changes, and
 * invoice results all flow through here. Signature-verified against
 * STRIPE_WEBHOOK_SECRET; unverified requests are rejected.
 */
export async function POST(request: Request) {
  if (!stripe || !supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server not configured." }, { status: 500 });
  }
  const webhookSecret = getStripeWebhookSecret();
  if (!webhookSecret) {
    return NextResponse.json({ ok: false, error: "Webhook not configured." }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ ok: false, error: "Missing signature." }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: `Invalid signature: ${error instanceof Error ? error.message : "unknown"}` },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          await upsertSubscription(sub);
          await maybeSendWelcomeEmail(sub);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await upsertSubscription(sub, event.type === "customer.subscription.deleted");
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await recordInvoice(invoice, event.type === "invoice.paid" ? "paid" : "failed");
        break;
      }
      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break;
    }
  } catch (error) {
    // Return 500 so Stripe retries on transient DB failures.
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Handler failed." },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}

/**
 * Upsert a billing_subscriptions row from a Stripe subscription. venueId/ownerId
 * ride on the subscription metadata (set at Checkout via subscription_data).
 */
async function upsertSubscription(sub: Stripe.Subscription, forceCancelled = false): Promise<void> {
  if (!supabaseAdmin) return;

  const venueId = sub.metadata?.venueId?.trim();
  const ownerId = sub.metadata?.ownerId?.trim();
  if (!venueId || !ownerId) return;

  const item = sub.items.data[0];
  const price = item?.price;
  const status = forceCancelled ? "cancelled" : mapStripeSubscriptionStatus(sub.status);
  const periodEndUnix = item?.current_period_end ?? null;
  const periodStartUnix = item?.current_period_start ?? null;

  const { error } = await supabaseAdmin
    .from("billing_subscriptions")
    .upsert(
      {
        venue_id: venueId,
        owner_id: ownerId,
        stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        stripe_subscription_id: sub.id,
        stripe_price_id: price?.id ?? null,
        plan_type: price?.nickname ?? "monthly",
        amount_cents: price?.unit_amount ?? 0,
        status,
        current_period_start: periodStartUnix ? new Date(periodStartUnix * 1000).toISOString() : null,
        current_period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
        // Keeps the "cancellation scheduled" flag in sync with Stripe's own value —
        // covers the owner reversing a scheduled cancellation from Stripe's customer
        // portal, not just our own DELETE route setting it.
        cancel_at_period_end: forceCancelled ? false : sub.cancel_at_period_end,
        // Clear the welcome-email flag on cancellation so a later resubscribe (a fresh
        // Stripe subscription id) is treated as first-time activation again, not skipped.
        ...(forceCancelled ? { welcome_email_sent_at: null } : {}),
      },
      { onConflict: "venue_id" }
    );
  // Surfaced (not swallowed) so a schema/DB problem 500s and Stripe retries,
  // instead of silently leaving billing_subscriptions out of sync.
  if (error) throw new Error(`upsertSubscription failed: ${error.message}`);
}

/**
 * Send the one-time partner welcome email on first-time subscription activation.
 * Only called from checkout.session.completed (not customer.subscription.updated),
 * and guarded by welcome_email_sent_at so a Stripe webhook retry never re-sends it.
 * Never throws — an email failure must not fail the webhook or block billing sync.
 */
async function maybeSendWelcomeEmail(sub: Stripe.Subscription): Promise<void> {
  if (!supabaseAdmin) return;

  const venueId = sub.metadata?.venueId?.trim();
  const ownerId = sub.metadata?.ownerId?.trim();
  if (!venueId || !ownerId) return;

  try {
    const { data: subscriptionRow } = await supabaseAdmin
      .from("billing_subscriptions")
      .select("welcome_email_sent_at, amount_cents")
      .eq("venue_id", venueId)
      .maybeSingle<{ welcome_email_sent_at: string | null; amount_cents: number }>();
    if (!subscriptionRow || subscriptionRow.welcome_email_sent_at) return;

    const [{ data: venue }, { data: owner }] = await Promise.all([
      supabaseAdmin.from("venues").select("name").eq("id", venueId).maybeSingle<{ name: string }>(),
      supabaseAdmin
        .from("venue_owners")
        .select("name, email")
        .eq("id", ownerId)
        .maybeSingle<{ name: string; email: string }>(),
    ]);
    if (!venue || !owner) return;

    const sent = await sendWelcomeEmail({
      toEmail: owner.email,
      ownerName: owner.name,
      venueName: venue.name,
      planAmountCents: subscriptionRow.amount_cents,
    });
    if (!sent) return;

    await supabaseAdmin
      .from("billing_subscriptions")
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq("venue_id", venueId);
  } catch {
    // Best-effort — the subscription is already synced by upsertSubscription above.
  }
}

/**
 * Record a Stripe invoice into billing_invoices, deduped by stripe_invoice_id.
 * Resolves the owning subscription row by its Stripe subscription id.
 */
async function recordInvoice(invoice: Stripe.Invoice, status: "paid" | "failed"): Promise<void> {
  if (!supabaseAdmin) return;
  if (!invoice.id) return;

  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return;

  const { data: row } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("id, venue_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle<{ id: string; venue_id: string }>();

  if (!row) return;

  const amountCents = status === "paid" ? invoice.amount_paid : invoice.amount_due;
  const chargedAtUnix = invoice.status_transitions?.paid_at ?? invoice.created;

  const { error } = await supabaseAdmin.from("billing_invoices").upsert(
    {
      subscription_id: row.id,
      venue_id: row.venue_id,
      description: invoice.description ?? "Subscription",
      amount_cents: amountCents ?? 0,
      status,
      stripe_invoice_id: invoice.id,
      charged_at: chargedAtUnix ? new Date(chargedAtUnix * 1000).toISOString() : new Date().toISOString(),
    },
    { onConflict: "stripe_invoice_id" }
  );
  if (error) throw new Error(`recordInvoice failed: ${error.message}`);
}

/** Read the subscription id off an invoice across SDK field-shape variations. */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
  if (typeof parent === "string") return parent;
  if (parent && typeof parent === "object") return parent.id;
  return null;
}
