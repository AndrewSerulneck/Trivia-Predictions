import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminAuth } from "@/lib/adminAuth";
import { OFFLINE_BILLING_METHOD } from "@/lib/stripe";
import { cancelSubscription } from "@/lib/billing";
import {
  applyDiscountToSubscription,
  removeDiscountFromSubscription,
  CLEARED_MIRROR,
  hasAtMostTwoDecimals,
  hasDiscountMirror,
  removalIsMootAtStripe,
  type DiscountSpec,
  type DiscountableSubscriptionRow,
} from "@/lib/billingDiscounts";
import { setCustomPrice, type CustomPriceRow } from "@/lib/billingCustomPrice";

/**
 * Admin-only manual billing controls (Phase 1 of the check/offline-payment plan).
 *
 * Entitlement in this app is a `billing_subscriptions` row with status='active'
 * — the Stripe flow just automates writing that row. For a partner who pays by
 * check (or any offline method), an admin grants the same active row directly,
 * with an explicit admin-set paid-through date and no Stripe/SlimCD token.
 *
 * A tokenless row is inert to every automated billing job: the Stripe webhook is
 * keyed on stripe_subscription_id (null here) and the renewal cron skips rows
 * with no recurring token. Access simply stays active until current_period_end,
 * after which the admin re-grants when the next check clears.
 *
 * billing_method is set to OFFLINE_BILLING_METHOD (see lib/stripe.ts) so the row
 * is identifiable as offline and excluded from billing automation.
 */

type OwnerLinkRow = {
  owner_id: string;
  venue_id: string;
  venue_owners: { email: string; name: string } | null;
  venues: { id: string; name: string; display_name: string | null } | null;
};

type SubscriptionRow = {
  venue_id: string;
  plan_type: string;
  billing_method: string;
  status: string;
  amount_cents: number;
  current_period_start: string | null;
  current_period_end: string | null;
  stripe_subscription_id: string | null;
  cancel_at_period_end: boolean | null;
  stripe_coupon_id: string | null;
  discount_label: string | null;
  // numeric(5,2) at the DB — supabase-js can return this as a string; coerce
  // at the read site below, never pass it through raw.
  discount_percent_off: number | string | null;
  discount_amount_off_cents: number | null;
  discount_ends_at: string | null;
};

/**
 * GET /api/admin/billing — list every venue-owner link with its current
 * subscription state, so an admin can see who is billed how and grant/revoke
 * offline access. Optional ?search= filters by venue name or owner email.
 */
export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim().toLowerCase();

  const { data: links, error: linkError } = await supabaseAdmin
    .from("venue_owner_venues")
    .select(
      "owner_id, venue_id, venue_owners ( email, name ), venues ( id, name, display_name )"
    )
    .returns<OwnerLinkRow[]>();

  if (linkError) {
    return NextResponse.json({ ok: false, error: linkError.message }, { status: 500 });
  }

  const venueIds = (links ?? []).map((l) => l.venue_id);
  const subByVenue = new Map<string, SubscriptionRow>();
  if (venueIds.length > 0) {
    const { data: subs, error: subError } = await supabaseAdmin
      .from("billing_subscriptions")
      .select(
        "venue_id, plan_type, billing_method, status, amount_cents, current_period_start, current_period_end, stripe_subscription_id, cancel_at_period_end, stripe_coupon_id, discount_label, discount_percent_off, discount_amount_off_cents, discount_ends_at"
      )
      .in("venue_id", venueIds)
      .returns<SubscriptionRow[]>();
    if (subError) {
      return NextResponse.json({ ok: false, error: subError.message }, { status: 500 });
    }
    for (const s of subs ?? []) subByVenue.set(s.venue_id, s);
  }

  const partners = (links ?? [])
    .map((link) => {
      const sub = subByVenue.get(link.venue_id) ?? null;
      const venueName = link.venues?.display_name ?? link.venues?.name ?? link.venue_id;
      return {
        venueId: link.venue_id,
        venueName,
        ownerId: link.owner_id,
        ownerEmail: link.venue_owners?.email ?? "",
        ownerName: link.venue_owners?.name ?? "",
        subscription: sub
          ? {
              status: sub.status,
              planType: sub.plan_type,
              amountCents: sub.amount_cents,
              currentPeriodStart: sub.current_period_start,
              currentPeriodEnd: sub.current_period_end,
              isManual: sub.billing_method === OFFLINE_BILLING_METHOD,
              isStripe: Boolean(sub.stripe_subscription_id),
              cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
              discount: sub.discount_label
                ? {
                    label: sub.discount_label,
                    percentOff: sub.discount_percent_off == null ? null : Number(sub.discount_percent_off),
                    amountOffCents: sub.discount_amount_off_cents,
                    endsAt: sub.discount_ends_at,
                  }
                : null,
            }
          : null,
      };
    })
    .filter((p) => {
      if (!search) return true;
      return (
        p.venueName.toLowerCase().includes(search) ||
        p.ownerEmail.toLowerCase().includes(search) ||
        p.ownerName.toLowerCase().includes(search)
      );
    })
    .sort((a, b) => a.venueName.localeCompare(b.venueName));

  return NextResponse.json({ ok: true, partners });
}

type PostBody = {
  action?: "grant-manual" | "revoke" | "apply-discount" | "remove-discount" | "set-custom-price";
  venueId?: string;
  paidThroughDate?: string; // YYYY-MM-DD, inclusive; access ends end-of-day
  /**
   * The venue's LIST rate — the recurring rate before any discount — NOT the
   * amount on the check. See the grant-manual handler for why the two are
   * separate fields.
   */
  amountDollars?: number;
  /**
   * What the partner actually paid on this occasion, for the invoice/audit
   * record only. Defaults to amountDollars when the two are the same (no
   * discount in play).
   */
  amountReceivedDollars?: number;
  memo?: string;
  force?: boolean;
  discountType?: "free_months" | "percent_off" | "amount_off";
  months?: number;
  percentOff?: number;
  amountOffCents?: number;
  duration?: "once" | "repeating" | "forever";
  durationInMonths?: number;
  reason?: string;
  stripePriceId?: string;
};

/**
 * POST /api/admin/billing — grant or revoke offline/manual access for a venue.
 *
 *   action: "grant-manual" — upsert an active manual subscription (paid through
 *            the given date) and record a paid invoice for the audit trail.
 *   action: "revoke"       — mark the subscription cancelled.
 *   action: "apply-discount" / "remove-discount" — coupon-backed discounts.
 *   action: "set-custom-price" — negotiated permanent rate (a Price swap, not a
 *            discount; see lib/billingCustomPrice.ts).
 */
export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as PostBody;
  const venueId = (body.venueId ?? "").trim();
  if (!venueId) {
    return NextResponse.json({ ok: false, error: "Venue is required." }, { status: 400 });
  }

  if (body.action === "revoke") {
    const { data: existing } = await supabaseAdmin
      .from("billing_subscriptions")
      .select("id, stripe_subscription_id")
      .eq("venue_id", venueId)
      .maybeSingle<{ id: string; stripe_subscription_id: string | null }>();
    if (!existing) {
      return NextResponse.json({ ok: false, error: "No subscription found for this venue." }, { status: 404 });
    }
    // Revoke through the shared helper: a card-billed venue's live Stripe
    // subscription must be cancelled at Stripe (cancel_at_period_end), not just
    // flipped in our DB — otherwise Stripe keeps charging the customer monthly
    // while the dashboard shows no access. A tokenless offline row flips
    // status='cancelled' directly (today's behavior).
    const result = await cancelSubscription(existing);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "apply-discount") {
    return handleApplyDiscount(venueId, body, auth.adminUsername);
  }

  if (body.action === "remove-discount") {
    return handleRemoveDiscount(venueId);
  }

  if (body.action === "set-custom-price") {
    return handleSetCustomPrice(venueId, body, auth.adminUsername);
  }

  if (body.action !== "grant-manual") {
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  }

  // Resolve the owner linked to this venue — billing_subscriptions.owner_id is
  // NOT NULL, so the venue must already have a registered owner account. If it
  // doesn't, the partner needs to complete /owner/register first.
  const { data: link } = await supabaseAdmin
    .from("venue_owner_venues")
    .select("owner_id")
    .eq("venue_id", venueId)
    .limit(1)
    .maybeSingle<{ owner_id: string }>();

  if (!link) {
    return NextResponse.json(
      { ok: false, error: "This venue has no owner account yet. The partner must register first." },
      { status: 409 }
    );
  }

  // Guard against orphaning a live Stripe subscription: the client only disables
  // "Grant offline" for an active card ("hasActiveCard"), so a past_due card sub
  // can still reach this endpoint. Converting it to offline would null out
  // stripe_subscription_id/customer_id/price_id below, orphaning a subscription
  // that's still in dunning — Stripe would keep collecting and the app could no
  // longer cancel or reconcile it. Require the admin to cancel it first (or pass
  // force:true to cancel-then-convert in one call).
  // The discount_* columns are NOT decorative here: hasDiscountMirror() below
  // reads them to decide whether the detach is worth attempting at all. Drop
  // them from this select and every row reads as "no discount", making the skip
  // unconditional and re-arming the orphaned-coupon bug the detach exists for.
  const { data: existingSub } = await supabaseAdmin
    .from("billing_subscriptions")
    .select(
      "id, billing_method, stripe_subscription_id, status, amount_cents, current_period_end, stripe_coupon_id, discount_label, discount_percent_off, discount_amount_off_cents, discount_ends_at"
    )
    .eq("venue_id", venueId)
    .maybeSingle<{
      id: string;
      billing_method: string;
      stripe_subscription_id: string | null;
      status: string;
      amount_cents: number;
      current_period_end: string | null;
      stripe_coupon_id: string | null;
      discount_label: string | null;
      discount_percent_off: number | null;
      discount_amount_off_cents: number | null;
      discount_ends_at: string | null;
    }>();

  // Everything below this line can mutate Stripe (force-cancel, discount
  // detach); nothing below it may return 400 for bad input. Validate
  // paidThroughDate here, before either mutation, so a malformed/past date
  // never leaves a partner's subscription force-cancelled or their coupon
  // detached with no way to retry back to the original state.
  const dateStr = (body.paidThroughDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ ok: false, error: "A valid paid-through date is required." }, { status: 400 });
  }
  const periodEnd = new Date(`${dateStr}T23:59:59.000Z`);
  if (Number.isNaN(periodEnd.getTime()) || periodEnd.getTime() <= Date.now()) {
    return NextResponse.json({ ok: false, error: "Paid-through date must be in the future." }, { status: 400 });
  }

  if (
    existingSub?.stripe_subscription_id &&
    (existingSub.status === "active" || existingSub.status === "past_due")
  ) {
    if (!body.force) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This venue has a live Stripe subscription. Cancel it first (Revoke), then grant offline access.",
        },
        { status: 409 }
      );
    }
    const cancelResult = await cancelSubscription(existingSub);
    if (!cancelResult.ok) {
      return NextResponse.json({ ok: false, error: cancelResult.error }, { status: cancelResult.status });
    }
  }

  // Detach any live Stripe coupon before the row goes tokenless below — otherwise
  // a card partner's discount label/percent survives the conversion to offline
  // and keeps mispricing the owner page (the discount mirror is about to be
  // cleared in our DB either way, but only this call actually removes it at
  // Stripe). cancel_at_period_end above does NOT do this: the subscription
  // stays active with its coupon attached until the period ends.
  //
  // Two rows are skipped outright, because for them the detach cannot prevent
  // anything and can only fail:
  //
  //   - No discount recorded. Nothing to orphan. (This is most rows — the
  //     detach used to run unconditionally, so a plain churned card partner
  //     with no discount at all could not be converted to check billing.)
  //   - status === 'cancelled'. cancelSubscription() retains
  //     stripe_subscription_id on purpose so the mirror stays reconcilable, so
  //     this row still looks Stripe-backed — but Stripe rejects any update on a
  //     canceled subscription, and a canceled subscription bills nothing, so an
  //     attached coupon is inert. Note the force-cancel branch above does NOT
  //     land here: it schedules cancel_at_period_end, leaving the subscription
  //     active with its coupon live, which is precisely the case to detach.
  if (
    existingSub?.stripe_subscription_id &&
    existingSub.status !== "cancelled" &&
    hasDiscountMirror(existingSub)
  ) {
    const removeResult = await removeDiscountFromSubscription(existingSub);
    // Fail closed on a real Stripe error — leaving a live coupon attached to a
    // subscription we're about to stop tracking is the failure this guards.
    // The exception is a failure that proves there is nothing left to orphan
    // (subscription already gone or already canceled at Stripe); blocking the
    // admin on that would strand the venue with no way to convert it.
    if (!removeResult.ok && !removalIsMootAtStripe(removeResult)) {
      return NextResponse.json({ ok: false, error: removeResult.error }, { status: removeResult.status });
    }
  }

  // TWO DIFFERENT NUMBERS, ON PURPOSE.
  //
  // `amount_cents` on the subscription is the venue's LIST rate — what they are
  // billed per cycle before any discount. Every reader of that column (notably
  // the owner page's effectiveAmountCents) subtracts the discount mirror from
  // it to get the net, exactly as it does for a card row. Writing an
  // already-discounted number here makes the owner page discount it a second
  // time ($100 received + 25% off rendered as "$75 was $100").
  //
  // The invoice, by contrast, is a record of a payment that really happened, and
  // the partner sees it in their payment history. That one gets what the check
  // was actually for. When there's no discount the two are equal, and the admin
  // UI pre-fills the second box from the first so it stays one keystroke.
  const amountCents = Math.round(Math.max(0, Number(body.amountDollars ?? 0)) * 100);
  const receivedCents =
    body.amountReceivedDollars == null
      ? amountCents
      : Math.round(Math.max(0, Number(body.amountReceivedDollars)) * 100);
  const memo = (body.memo ?? "").trim() || "Manual/check payment";
  const now = new Date();

  const { data: subscription, error: subError } = await supabaseAdmin
    .from("billing_subscriptions")
    .upsert(
      {
        venue_id: venueId,
        owner_id: link.owner_id,
        plan_type: "subscription",
        billing_method: OFFLINE_BILLING_METHOD,
        // List rate, not the check amount — see the comment above.
        amount_cents: amountCents,
        status: "active" as const,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
        // Explicitly clear any processor ids so this row stays inert to the
        // Stripe webhook even if it previously had them.
        stripe_customer_id: null,
        stripe_subscription_id: null,
        stripe_price_id: null,
        // A discount mirror from a prior card subscription must not survive the
        // conversion — the coupon it referenced is gone (detached above) and
        // amount_cents already carries the offline list rate verbatim.
        ...CLEARED_MIRROR,
      },
      { onConflict: "venue_id" }
    )
    .select("id")
    .single<{ id: string }>();

  if (subError || !subscription) {
    return NextResponse.json({ ok: false, error: subError?.message ?? "Failed to grant access." }, { status: 500 });
  }

  const { error: invoiceError } = await supabaseAdmin.from("billing_invoices").insert({
    subscription_id: subscription.id,
    venue_id: venueId,
    description: `Offline payment — ${memo} (paid through ${dateStr})`,
    // What was actually collected, which is what the partner should see in
    // their payment history — not the list rate above.
    amount_cents: receivedCents,
    status: "paid",
  });
  if (invoiceError) {
    // The access grant succeeded; the invoice is only an audit record. Report
    // success but note the bookkeeping gap so support can reconcile.
    return NextResponse.json({ ok: true, warning: "Access granted, but the invoice record failed to save." });
  }

  return NextResponse.json({ ok: true });
}

/**
 * action: "apply-discount" — validates the request server-side (the real
 * safety net against a fat-fingered "1000% off"; lib/billingDiscounts.ts
 * trusts its caller), applies it via lib/billingDiscounts.ts, and records the
 * grant in billing_discount_grants for the audit trail.
 */
async function handleApplyDiscount(
  venueId: string,
  body: PostBody,
  adminUsername: string
): Promise<NextResponse> {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  const discountType = body.discountType;
  if (discountType !== "free_months" && discountType !== "percent_off" && discountType !== "amount_off") {
    return NextResponse.json({ ok: false, error: "A valid discount type is required." }, { status: 400 });
  }

  let spec: DiscountSpec;
  if (discountType === "free_months") {
    const months = Number(body.months);
    if (!(Number.isInteger(months) && months > 0)) {
      return NextResponse.json(
        { ok: false, error: "Free months must be a positive whole number." },
        { status: 400 }
      );
    }
    spec = { type: "free_months", months };
  } else {
    const duration = body.duration;
    if (duration !== "once" && duration !== "repeating" && duration !== "forever") {
      return NextResponse.json({ ok: false, error: "A valid discount duration is required." }, { status: 400 });
    }
    if (duration === "repeating" && !(Number.isInteger(body.durationInMonths) && (body.durationInMonths as number) > 0)) {
      return NextResponse.json(
        { ok: false, error: "A repeating discount needs a whole number of months." },
        { status: 400 }
      );
    }
    const durationInMonths = duration === "repeating" ? (body.durationInMonths as number) : null;
    if (discountType === "percent_off") {
      const percentOff = Number(body.percentOff);
      if (!(percentOff > 0) || percentOff > 100) {
        return NextResponse.json(
          { ok: false, error: "Percent off must be greater than 0 and no more than 100." },
          { status: 400 }
        );
      }
      if (!hasAtMostTwoDecimals(percentOff)) {
        return NextResponse.json(
          { ok: false, error: "Percent off allows at most 2 decimal places." },
          { status: 400 }
        );
      }
      spec = { type: "percent_off", percentOff, duration, durationInMonths };
    } else {
      const amountOffCents = Number(body.amountOffCents);
      if (!(Number.isInteger(amountOffCents) && amountOffCents > 0)) {
        return NextResponse.json(
          { ok: false, error: "Amount off must be a positive whole number of cents." },
          { status: 400 }
        );
      }
      spec = { type: "amount_off", amountOffCents, duration, durationInMonths };
    }
  }

  const { data: row, error: rowError } = await supabaseAdmin
    .from("billing_subscriptions")
    // billing_method decides the offline path (see DiscountableSubscriptionRow) —
    // dropping it here would route every row down the Stripe branch.
    .select("id, billing_method, stripe_subscription_id, amount_cents, current_period_end")
    .eq("venue_id", venueId)
    .maybeSingle<DiscountableSubscriptionRow>();

  if (rowError || !row) {
    return NextResponse.json({ ok: false, error: "No subscription found for this venue." }, { status: 404 });
  }

  const result = await applyDiscountToSubscription(row, spec);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  const grantRow: Record<string, unknown> = {
    venue_id: venueId,
    subscription_id: row.id,
    granted_by: adminUsername,
    discount_type: discountType,
    reason: (body.reason ?? "").trim() || null,
  };
  if (spec.type === "free_months") grantRow.free_months = spec.months;
  if (spec.type === "percent_off") grantRow.percent_off = spec.percentOff;
  if (spec.type === "amount_off") grantRow.amount_off_cents = spec.amountOffCents;

  const { error: grantError } = await supabaseAdmin.from("billing_discount_grants").insert(grantRow);
  if (grantError) {
    // The discount is already live (Stripe or local mirror); the grant row is
    // only the audit record. Report success but note the bookkeeping gap.
    return NextResponse.json({ ...result, ok: true, warning: "Discount applied, but the audit record failed to save." });
  }

  return NextResponse.json({ ...result, ok: true });
}

/** action: "remove-discount" — clears the active discount for a venue. */
async function handleRemoveDiscount(venueId: string): Promise<NextResponse> {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  const { data: row, error: rowError } = await supabaseAdmin
    .from("billing_subscriptions")
    // billing_method decides the offline path (see DiscountableSubscriptionRow) —
    // dropping it here would route every row down the Stripe branch.
    .select("id, billing_method, stripe_subscription_id, amount_cents, current_period_end")
    .eq("venue_id", venueId)
    .maybeSingle<DiscountableSubscriptionRow>();

  if (rowError || !row) {
    return NextResponse.json({ ok: false, error: "No subscription found for this venue." }, { status: 404 });
  }

  const result = await removeDiscountFromSubscription(row);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ...result, ok: true });
}

/**
 * action: "set-custom-price" — put this venue on a negotiated permanent rate by
 * swapping a Stripe Price onto their subscription item. NOT a discount (see
 * lib/billingCustomPrice.ts); it is recorded in the same audit table under
 * discount_type 'custom_price' so all money-given-away lives in one trail.
 */
async function handleSetCustomPrice(
  venueId: string,
  body: PostBody,
  adminUsername: string
): Promise<NextResponse> {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  const priceId = (body.stripePriceId ?? "").trim();
  if (!priceId) {
    return NextResponse.json({ ok: false, error: "A Stripe price id is required." }, { status: 400 });
  }

  const { data: row, error: rowError } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("id, stripe_subscription_id, amount_cents")
    .eq("venue_id", venueId)
    .maybeSingle<CustomPriceRow>();

  if (rowError || !row) {
    return NextResponse.json({ ok: false, error: "No subscription found for this venue." }, { status: 404 });
  }

  const result = await setCustomPrice(row, priceId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  const { error: grantError } = await supabaseAdmin.from("billing_discount_grants").insert({
    venue_id: venueId,
    subscription_id: row.id,
    granted_by: adminUsername,
    discount_type: "custom_price",
    custom_price_cents: result.amountCents,
    reason: (body.reason ?? "").trim() || null,
  });
  if (grantError) {
    // The price is already swapped at Stripe; the grant row is only the audit
    // record. Same non-fatal treatment as apply-discount above.
    return NextResponse.json({
      ...result,
      ok: true,
      warning: result.warning ?? "Rate changed, but the audit record failed to save.",
    });
  }

  return NextResponse.json({ ...result, ok: true });
}
