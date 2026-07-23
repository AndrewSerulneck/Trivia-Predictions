import "server-only";
import Stripe from "stripe";

/**
 * Server-side Stripe integration for the Partner Dashboard billing surface.
 *
 * Migrated from SlimCD (see lib/slimcd.ts — deprecated). Stripe is the source of
 * truth for subscription status; the webhook at /api/webhooks/stripe keeps our
 * billing_subscriptions / billing_invoices tables in sync.
 *
 * Required env (added to .env.local + Vercel by the operator — never by tooling):
 *   STRIPE_SECRET_KEY      — sk_live_… / sk_test_…
 *   STRIPE_WEBHOOK_SECRET  — whsec_… (from the webhook endpoint / `stripe listen`)
 *   STRIPE_PRICE_ID        — price_… for the monthly subscription
 */

const secretKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";

/**
 * Shared Stripe client, or null when the secret key is not configured. Route
 * handlers must null-check and return a 500 (mirrors the supabaseAdmin pattern).
 */
export const stripe: Stripe | null = secretKey ? new Stripe(secretKey) : null;

export function getStripePriceId(): string {
  return process.env.STRIPE_PRICE_ID?.trim() ?? "";
}

export function getStripeWebhookSecret(): string {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
}

/**
 * billing_subscriptions.billing_method domain. 'stripe' = card-billed via Stripe
 * (the default); 'offline' = paid by check/other offline method and granted by an
 * admin (see app/api/admin/billing). Offline rows carry NO Stripe or SlimCD token
 * and are excluded by billing automation on this explicit dimension, so they can
 * never be auto-billed or auto-cancelled even if a token is later attached.
 */
export type BillingMethod = "stripe" | "offline";

export const OFFLINE_BILLING_METHOD: BillingMethod = "offline";

/** Our billing_subscriptions.status domain. */
export type BillingStatus = "active" | "past_due" | "cancelled";

/**
 * Map a Stripe subscription status onto our three-value billing status.
 * Pure + exported so it can be unit-tested without hitting Stripe.
 *
 * Stripe statuses: active, trialing, past_due, unpaid, canceled, incomplete,
 * incomplete_expired, paused.
 */
export function mapStripeSubscriptionStatus(stripeStatus: string): BillingStatus {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
    case "paused":
      return "cancelled";
    default:
      return "past_due";
  }
}
