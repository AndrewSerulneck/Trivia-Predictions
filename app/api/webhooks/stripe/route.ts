import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, getStripeWebhookSecret, mapStripeSubscriptionStatus } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendWelcomeEmail } from "@/lib/email/sendWelcomeEmail";
import {
  CLEARED_MIRROR,
  discountCouponRef,
  discountMirrorFromStripe,
  resolveDiscountCoupon,
  type DiscountMirror,
} from "@/lib/billingDiscounts";

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
          // Checkout completion is an intentional new subscription, so no
          // stale-id guard — a card takeover of a previously-offline venue is
          // legitimate. But a session can complete with the payment NOT actually
          // settled (`payment_status: 'unpaid'`, subscription still `incomplete`),
          // and that must not mint a billing row. upsertSubscription decides;
          // the followers only run after a write that really happened.
          const result = await upsertSubscription(sub);
          await runFirstSyncFollowers(result, sub);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const isDeleted = event.type === "customer.subscription.deleted";
        // Guarded against stale events: only apply if sub.id still matches the
        // venue's current stripe_subscription_id (see upsertSubscription). A
        // late/retried event for an old, already-replaced subscription must not
        // clobber a newer offline grant or a newer card subscription.
        const result = await upsertSubscription(sub, {
          forceCancelled: isDeleted,
          guardStaleSubscriptionId: true,
        });
        // This branch is the OTHER way a venue's row can first come to track a
        // paid subscription: when a signup needs a second step (3-D Secure, or
        // any card that settles after the session closes),
        // checkout.session.completed arrives while the subscription is still
        // `incomplete` and the creation gate correctly writes nothing — the row
        // is born here instead. Before this, the welcome email was wired to the
        // checkout event alone, so a partner who completed 3-D Secure got a
        // correct billing row and no email, ever, silently.
        //
        // Never on the deleted branch: a cancellation is not an activation.
        if (!isDeleted) await runFirstSyncFollowers(result, sub);
        break;
      }
      case "customer.discount.created":
      case "customer.discount.updated":
      case "customer.discount.deleted": {
        // Stripe emits these when a coupon is attached, changes, expires on its
        // own, or is detached — including from the Stripe Dashboard, which never
        // touches our admin route. Without them the mirror keeps advertising a
        // discount that no longer exists.
        const discount = event.data.object as Stripe.Discount;
        await syncDiscountFromEvent(discount, event.type === "customer.discount.deleted");
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

type UpsertOptions = {
  /** Force status='cancelled' (customer.subscription.deleted). */
  forceCancelled?: boolean;
  /**
   * Only apply if sub.id matches the venue's current stripe_subscription_id.
   * Set for customer.subscription.updated/.deleted so a stale/retried event for
   * an old subscription can't overwrite a newer offline grant or card sub. Left
   * off for checkout.session.completed, which is an intentional new subscription.
   */
  guardStaleSubscriptionId?: boolean;
};

/**
 * Stripe statuses that mean this subscription is a partner who is actually
 * paying us: the first invoice settled (`active`), or the agreement is
 * established and Stripe is holding it open to bill (`trialing`). Everything
 * else on a subscription we do not already track is an unfinished signup —
 * `incomplete` (first payment never completed), `incomplete_expired` (it timed
 * out), `canceled`/`paused` (over before we ever mirrored it).
 */
const ESTABLISHED_STRIPE_STATUSES = new Set(["active", "trialing"]);

type UpsertResult = {
  /** The mirror was actually written, as opposed to a deliberately-skipped event. */
  applied: boolean;
  /**
   * The write is the first time this venue's row has pointed at THIS Stripe
   * subscription — either the row was created, or it was re-pointed from an
   * older subscription (a resubscribe, or a card takeover of an offline venue).
   *
   * This, not "the row was created", is the moment the followers hang off:
   *   - The welcome email must still fire for a RESUBSCRIBER, whose row already
   *     exists (the delete branch clears welcome_email_sent_at on purpose so
   *     they are welcomed again). Gating on creation alone would silence it.
   *   - recordInvoice resolves rows BY stripe_subscription_id, so this is
   *     exactly the window in which an earlier invoice.paid for this
   *     subscription found no row and was dropped.
   *
   * Implies the subscription is `active`/`trialing`: the creation gate below
   * refuses any first sync that isn't.
   */
  isFirstSyncForSubscription: boolean;
};

/** Nothing was written, so no follower should run. */
const SKIPPED: UpsertResult = { applied: false, isFirstSyncForSubscription: false };

/**
 * Upsert a billing_subscriptions row from a Stripe subscription. venueId/ownerId
 * ride on the subscription metadata (set at Checkout via subscription_data).
 *
 * Returns whether the mirror was actually written (so the caller can tell a real
 * sync apart from a deliberately-skipped event) and whether that write was this
 * subscription's first — see UpsertResult.
 */
async function upsertSubscription(
  sub: Stripe.Subscription,
  options: UpsertOptions = {}
): Promise<UpsertResult> {
  if (!supabaseAdmin) return SKIPPED;

  const { forceCancelled = false, guardStaleSubscriptionId = false } = options;

  const venueId = sub.metadata?.venueId?.trim();
  const ownerId = sub.metadata?.ownerId?.trim();
  if (!venueId || !ownerId) return SKIPPED;

  const { data: existing } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("stripe_subscription_id")
    .eq("venue_id", venueId)
    .maybeSingle<{ stripe_subscription_id: string | null }>();

  // Stale-event guard: a customer.subscription.updated/.deleted event only applies
  // when it targets the venue's CURRENT subscription. Stripe retries for ~3 days,
  // so a late event for an old, already-cancelled/replaced subscription can arrive
  // after the venue has been re-granted offline access (stripe_subscription_id
  // nulled) or moved to a new card subscription (different id). In either case the
  // event is stale — ignore it (the caller returns 200 so Stripe stops retrying)
  // rather than let it silently revoke the grant or revert status.
  //
  // Only skip on an actual MISMATCH (a row exists and references a different
  // subscription) — not on absence. Every subscription created through this
  // app's Checkout flow already carries venueId/ownerId metadata (required just
  // to reach this point, see the guard above), so there's no reason to distrust
  // an update/delete event just because checkout.session.completed hasn't
  // landed yet (redelivery order isn't guaranteed) or was missed outright.
  // Treating "no row yet" as stale would silently drop a legitimate first sync.
  if (guardStaleSubscriptionId && existing && existing.stripe_subscription_id !== sub.id) return SKIPPED;

  // CREATION GATE (docs/billing-code-review-fixes-plan.md Phase 8). A
  // billing_subscriptions row is the record of a partner who PAYS us, so it may
  // only come into existence for a subscription Stripe reports as paid-for. A
  // signup that is interrupted — card declined at the last step, tab closed,
  // 3-D Secure abandoned — must leave no trace at all, so the partner's next
  // visit shows the normal "No subscription yet" screen instead of a `past_due`
  // row with no card behind it to "update".
  //
  // The gate is on CREATION ONLY, never on updates: once this subscription is
  // the one the row tracks, every later state change is mirrored verbatim,
  // including a renewal going `past_due`. That is what makes `past_due` mean
  // exactly one thing — an established subscriber whose card failed.
  //
  // Note this does NOT reintroduce the missed-webhook bug the stale guard above
  // is careful about. That guard's worry is a legitimate first sync arriving as
  // customer.subscription.updated because checkout.session.completed was missed
  // or reordered; such a subscription is `active`, so it still creates the row.
  // What is refused is only an unpaid attempt — which is precisely the row we
  // never wanted. The same test covers both (see
  // tests/api.webhooks.stripe-unfinished-signup.test.ts).
  const alreadyTracked = Boolean(existing) && existing?.stripe_subscription_id === sub.id;
  if (!alreadyTracked && !ESTABLISHED_STRIPE_STATUSES.has(sub.status)) return SKIPPED;

  // Read the discount off THIS event's subscription object rather than trusting
  // whatever our last admin action wrote — this path is exactly what catches
  // drift (a repeating coupon that ran out, or a dashboard edit). A cancelled
  // subscription has no live discount, so force-clear on the delete event.
  const discountMirror = forceCancelled ? { ...CLEARED_MIRROR } : await resolveDiscountMirror(sub);

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
        // A real Stripe subscription always bills by card — reassert this even on
        // conflict-update so a venue previously granted offline access that now
        // subscribes by card is correctly reclassified as card-billed.
        billing_method: "stripe",
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
        // Omitted entirely when Stripe's discount state couldn't be determined, so
        // an unreadable payload leaves the mirror as-is instead of wrongly clearing it.
        ...(discountMirror ?? {}),
      },
      { onConflict: "venue_id" }
    );
  // Surfaced (not swallowed) so a schema/DB problem 500s and Stripe retries,
  // instead of silently leaving billing_subscriptions out of sync.
  if (error) throw new Error(`upsertSubscription failed: ${error.message}`);
  return { applied: true, isFirstSyncForSubscription: !alreadyTracked };
}

/**
 * The discounts carried on a subscription payload, normalized across shapes:
 * the current `discounts` array (of ids when unexpanded, objects when expanded)
 * and the legacy singular `discount` field. Returns null when the payload says
 * nothing at all about discounts — "unknown", which callers must not read as
 * "none", or a webhook from an older API version would silently wipe a live
 * discount out of the mirror.
 */
function subscriptionDiscountEntries(
  sub: Stripe.Subscription
): Array<string | Stripe.Discount> | null {
  if (Array.isArray(sub.discounts)) return sub.discounts;
  const legacy = (sub as unknown as { discount?: Stripe.Discount | null }).discount;
  if (legacy !== undefined) return legacy ? [legacy] : [];
  return null;
}

/**
 * Resolve a subscription's current discount into the mirror columns, or null to
 * mean "leave the mirror alone". Only one discount can be attached to a
 * subscription (see lib/billingDiscounts.ts), so the first entry is the truth.
 */
async function resolveDiscountMirror(sub: Stripe.Subscription): Promise<DiscountMirror | null> {
  const entries = subscriptionDiscountEntries(sub);
  if (entries === null) return null;
  if (entries.length === 0) return { ...CLEARED_MIRROR };

  const first = entries[0];
  if (typeof first !== "string") {
    return discountMirrorFromStripe(first, await resolveDiscountCoupon(first));
  }

  // Unexpanded — the payload gives discount ids only, and the coupon
  // amounts/end date live on the object. One retrieve, only when a discount
  // actually exists.
  if (!stripe) return null;
  try {
    const expanded = await stripe.subscriptions.retrieve(sub.id, {
      expand: ["discounts.source.coupon"],
    });
    const discount = expanded.discounts?.[0];
    if (!discount) return { ...CLEARED_MIRROR };
    if (typeof discount === "string") return null;
    return discountMirrorFromStripe(discount, await resolveDiscountCoupon(discount));
  } catch {
    // Stripe unreachable — keep the existing mirror rather than guessing.
    return null;
  }
}

/** The mirror columns a discount event needs to read back before it writes. */
const DISCOUNT_MIRROR_SELECT =
  "id, stripe_coupon_id, discount_label, discount_percent_off, discount_amount_off_cents, discount_ends_at";

type DiscountMirrorRow = DiscountMirror & { id: string };

/**
 * May a `customer.discount.deleted` event clear this row's mirror?
 *
 * Only if the coupon that died is the one we are mirroring. Stripe retries
 * webhooks for ~3 days, and applying a discount over an existing one REPLACES it
 * (lib/billingDiscounts.ts — one discount per subscription), emitting a delete
 * for the old coupon alongside a create for the new. A retried or reordered
 * delete for the *replaced* coupon must not wipe the *replacement*, or the
 * partner's page shows full price against a discounted invoice.
 *
 * The two ambiguous cases, decided explicitly rather than by omission:
 *
 * - **The row mirrors no coupon id.** Either there is nothing to clear, or it is
 *   a locally-applied offline discount — `stripe_coupon_id === null` with a label
 *   is exactly what marks one (see docs/billing-open-issues-plan.md, DISCOUNT Ph2
 *   note 5). A Stripe delete has no authority over a discount Stripe never held,
 *   so both readings say "don't touch it".
 * - **The event's own coupon is unresolvable** (no `source.coupon`, no legacy
 *   `coupon`). We cannot prove the mirrored coupon is the one that died, so we
 *   leave the mirror alone. This direction is self-repairing: the accompanying
 *   `customer.subscription.updated` re-syncs the mirror from the subscription's
 *   own discount state, which is authoritative. Clearing on a guess is not
 *   self-repairing — nothing re-creates a discount we blanked.
 */
function deletedCouponOwnsMirror(row: DiscountMirrorRow, deletedCouponId: string | null): boolean {
  if (!deletedCouponId) return false;
  if (!row.stripe_coupon_id) return false;
  return row.stripe_coupon_id === deletedCouponId;
}

/**
 * Sync the mirror from a customer.discount.* event. These arrive without the
 * subscription object, so the row is resolved by the discount's own subscription
 * id (falling back to the customer id for a customer-level discount).
 *
 * Matching on stripe_subscription_id is the ownership guard: an offline row
 * (token null) or a venue that has since moved to a different subscription simply
 * doesn't match, so nothing is touched. A `deleted` event adds a SECOND condition
 * on top of it — the coupon identity check above — it does not replace it.
 */
async function syncDiscountFromEvent(discount: Stripe.Discount, removed: boolean): Promise<void> {
  if (!supabaseAdmin) return;

  const subscriptionId = discount.subscription;
  const customerId =
    typeof discount.customer === "string" ? discount.customer : discount.customer?.id ?? null;
  if (!subscriptionId && !customerId) return;

  // Resolve the target row(s) first. A delete has to compare coupons before it
  // wipes anything, and running both paths through the same resolution keeps the
  // subscription-keyed and customer-keyed cases from drifting apart.
  const select = supabaseAdmin.from("billing_subscriptions").select(DISCOUNT_MIRROR_SELECT);
  const { data: matched } = subscriptionId
    ? await select.eq("stripe_subscription_id", subscriptionId).returns<DiscountMirrorRow[]>()
    : await select.eq("stripe_customer_id", customerId as string).returns<DiscountMirrorRow[]>();
  let rows = matched ?? [];

  // Customer-level discount. Checkout scopes a Stripe customer to one venue, so
  // this should resolve to exactly one row — but the write is unfiltered by
  // subscription, so confirm that before letting it fan out across every venue
  // sharing a customer and overwrite a sibling's own subscription-level mirror.
  if (!subscriptionId && rows.length !== 1) return;
  if (rows.length === 0) return;

  if (removed) {
    // The id is enough for the identity check, and the ref carries it whether the
    // payload expanded the coupon or not — so no retrieve, and a Stripe outage
    // can't turn "which coupon died" into "unknown" and cause a wrong clear.
    const ref = discountCouponRef(discount);
    const deletedCouponId = typeof ref === "string" ? ref : ref?.id ?? null;
    const stale = rows.filter((row) => !deletedCouponOwnsMirror(row, deletedCouponId));
    for (const row of stale) {
      // A stale delete arriving at all is worth seeing — it means Stripe replayed
      // an event for a coupon we have already moved past.
      console.warn(
        `[stripe-webhook] ignoring customer.discount.deleted for coupon ${deletedCouponId ?? "unknown"}: row ${row.id} mirrors ${row.stripe_coupon_id ?? "no Stripe coupon"}`
      );
    }
    rows = rows.filter((row) => deletedCouponOwnsMirror(row, deletedCouponId));
    if (rows.length === 0) return;
  }

  const mirror = removed
    ? { ...CLEARED_MIRROR }
    : discountMirrorFromStripe(discount, await resolveDiscountCoupon(discount));

  for (const row of rows) {
    const { error } = await supabaseAdmin
      .from("billing_subscriptions")
      .update(mirror)
      .eq("id", row.id);
    if (error) throw new Error(`syncDiscountFromEvent failed: ${error.message}`);
  }
}

/**
 * The two things that must happen the moment a venue's row first comes to track a
 * paid Stripe subscription, wherever that write happened — checkout.session.completed
 * on a card that settled immediately, or customer.subscription.updated on one that
 * needed 3-D Secure. Wiring either of these to a single event type is what made
 * them one-sided; hanging both off the write itself is what keeps them symmetric.
 */
async function runFirstSyncFollowers(result: UpsertResult, sub: Stripe.Subscription): Promise<void> {
  if (!result.applied || !result.isFirstSyncForSubscription) return;
  await maybeSendWelcomeEmail(sub);
  await backfillSubscriptionInvoices(sub);
}

/**
 * Send the one-time partner welcome email on first-time subscription activation.
 * Only called for a write that really happened AND is this subscription's first
 * sync — so an unfinished signup, which now writes no row at all, can no longer
 * welcome someone who never paid, and a later state change on an established row
 * can't re-trigger it. It is additionally guarded by welcome_email_sent_at (and by
 * the row lookup below, which finds nothing when there is no row) so a Stripe
 * webhook retry never re-sends it — that idempotency is what makes it safe to call
 * this from both webhook entry points.
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
 * Hard cap on the backfill below. At first sync a subscription has one invoice
 * (two if Stripe already retried), so this is a safety rail, not a page size —
 * it exists so a subscription with a long history imported from elsewhere can
 * never turn this into an unbounded replay on a webhook request.
 */
const INVOICE_BACKFILL_LIMIT = 10;

/**
 * Record any invoice that was already paid before the row existed.
 *
 * recordInvoice resolves its row BY stripe_subscription_id, so an invoice.paid
 * arriving in the window between "signup started" and "row created" — which is
 * exactly what happens when a card needs 3-D Secure — found nothing and returned.
 * Stripe never replays it, so that first charge was permanently missing from the
 * partner's payment history. Reading it back at first sync self-heals that, at
 * the cost of one API call on a rare path.
 *
 * The alternative (500 so Stripe retries recordInvoice) was rejected: it would
 * make a legitimately-unmatchable invoice retry for three days, and 500 in this
 * route means "transient DB failure", which that is not.
 *
 * recordInvoice upserts on stripe_invoice_id, so re-recording the invoice the
 * live event already landed is a no-op rather than a duplicate.
 */
async function backfillSubscriptionInvoices(sub: Stripe.Subscription): Promise<void> {
  if (!stripe) return;

  let invoices: Stripe.ApiList<Stripe.Invoice>;
  try {
    invoices = await stripe.invoices.list({ subscription: sub.id, limit: INVOICE_BACKFILL_LIMIT });
  } catch {
    // Best-effort: Stripe being unreachable must not fail the webhook, or the
    // billing row we just wrote correctly gets retried for no reason.
    return;
  }

  // Only settled invoices. A failed/open invoice on a subscription that is now
  // established is noise, and the live invoice.payment_failed event covers the
  // case where it matters.
  for (const invoice of invoices.data) {
    if (invoice.status === "paid") await recordInvoice(invoice, "paid");
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

  // No row for this subscription: either we track nothing about it at all, or
  // the row hasn't been created yet (an unfinished signup, or one still in
  // 3-D Secure). Dropping it is right for the first case and safe for the
  // second — backfillSubscriptionInvoices re-reads it from Stripe the moment
  // the row comes into existence. Returning 500 to force a Stripe retry would
  // make the genuinely-untracked case retry for three days.
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

/**
 * Read the subscription id off an invoice across SDK field-shape variations.
 * As of API version 2026-06-24 the id lives at `invoice.parent.subscription_details.subscription`
 * — `invoice.subscription` is `undefined` on this account, which silently
 * dropped every invoice.paid/invoice.payment_failed event (verified against a
 * live payload; billing-run-log.md's DISCOUNT Phase 10 section). Older API
 * versions are kept as a fallback.
 */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const nested = (
    invoice as unknown as {
      parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
    }
  ).parent?.subscription_details?.subscription;
  if (typeof nested === "string") return nested;
  if (nested && typeof nested === "object") return nested.id;

  const legacy = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object") return legacy.id;

  return null;
}
