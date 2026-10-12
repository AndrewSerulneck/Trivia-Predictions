import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getStripeGraduatedPriceId, OFFLINE_BILLING_METHOD } from "@/lib/stripe";
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
import { setCustomPrice, setStandardPrice, type CustomPriceRow } from "@/lib/billingCustomPrice";
import { attachVenueToOwner } from "@/lib/adminVenueAttach";
import type { AdminPartnerBill, AdminRemovedFrom } from "@/lib/adminBillView";
import { isPlaceholderVenueRow } from "@/lib/venueClaim";
import {
  billMembershipsForBills,
  billedVenueCountFromRows,
  hasLeftBill,
  isBilledMembership,
  loadBillingForVenue,
  loadBillingForVenues,
  bringAnchorHome,
  refusesOwnBill,
  rejoinBillOf,
  unbilledVenueStates,
  type BillMembership,
  type UnbilledVenueState,
} from "@/lib/venueBilling";
import { ADMIN_GRANT_ON_PARTNER_BILL_MESSAGES, ON_PARTNER_BILL_CODE, onPartnerBillMessageKey } from "@/lib/multiVenueBilling";
import { billRateFromMirror, monthlyTotalCents, rateBreakdown, rateMonthlyTotalCents } from "@/lib/venuePricing";
import { settleStaleVenueChangesForBill } from "@/lib/venueRemoval";

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
  id: string;
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
  stripe_price_id: string | null;
  stripe_price_lookup_key: string | null;
  quantity: number | null;
  owner_id: string | null;
};

/**
 * Multi-venue billing Phase 6 — what the admin list shows about the BILL a venue is on (shape and
 * formatting in lib/adminBillView.ts). Every number is computed here from lib/venuePricing.ts.
 */
type PartnerBill = AdminPartnerBill;

/** The greyed "Grant offline" note for a venue that must not open its own bill (the POST's own wording), or null. */
const grantBlockedMessage = (state: UnbilledVenueState | undefined): string | null =>
  refusesOwnBill(state) ? ADMIN_GRANT_ON_PARTNER_BILL_MESSAGES[onPartnerBillMessageKey(state, "admin")] : null;

const membershipState = (row: BillMembership | undefined, nowMs: number): PartnerBill["venueState"] =>
  !row || isBilledMembership(row) ? "billed" : hasLeftBill(row, nowMs) ? "removed" : "leaving";

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

  if (searchParams.get("resource") === "attach-options") {
    return attachOptions();
  }

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
    // The bill covering each venue (lib/venueBilling.ts) — its own, or a multi-venue bill.
    const billing = await loadBillingForVenues<SubscriptionRow>(
      venueIds,
      "id, venue_id, plan_type, billing_method, status, amount_cents, current_period_start, current_period_end, stripe_subscription_id, cancel_at_period_end, stripe_coupon_id, discount_label, discount_percent_off, discount_amount_off_cents, discount_ends_at, stripe_price_id, stripe_price_lookup_key, quantity, owner_id"
    );
    if (!billing.ok) {
      return NextResponse.json({ ok: false, error: billing.error }, { status: 500 });
    }
    for (const [venueId, row] of billing.byVenue) subByVenue.set(venueId, row);
  }

  // Every bill's membership rows in ONE read (Phase 6), for the per-bill venue count and band line.
  const billIds = Array.from(new Set(Array.from(subByVenue.values()).map((row) => row.id)));
  const memberships = await billMembershipsForBills(billIds);
  if (!memberships.ok) {
    return NextResponse.json({ ok: false, error: memberships.error }, { status: 500 });
  }
  const nowMs = Date.now();
  // Names of EVERY linked venue, taken before the search filter below: a bill's anchor venue may be a
  // row the search hides, and its name must not depend on what was typed (Phase 6.4, review #6).
  const venueNameById = new Map((links ?? []).map((link) => [link.venue_id, link.venues?.display_name ?? link.venues?.name ?? link.venue_id]));
  const graduatedPriceId = getStripeGraduatedPriceId();
  const billOf = (venueId: string, sub: SubscriptionRow): PartnerBill => {
    const rows = memberships.byBill.get(sub.id) ?? [];
    const billed = Math.max(1, billedVenueCountFromRows(sub.venue_id, rows));
    const leaving = rows.filter((row) => !isBilledMembership(row) && !hasLeftBill(row, nowMs)).length;
    const isOffline = sub.billing_method === OFFLINE_BILLING_METHOD;
    const rate = billRateFromMirror(sub, graduatedPriceId);
    return {
      id: sub.id,
      isAnchor: sub.venue_id === venueId,
      anchorVenueId: sub.venue_id,
      anchorVenueName: venueNameById.get(sub.venue_id) ?? null,
      billedVenueCount: billed,
      leavingVenueCount: leaving,
      // No rate (a flat Price that isn't a custom_monthly_ one, Phase 6.8): no per-venue math — the bill's amount as it is.
      rate: rate ? rate.kind : "unrated",
      breakdown: rate ? rateBreakdown(rate, billed).map((line) => ({ venues: line.venues, unitAmountCents: line.unitAmountCents })) : [],
      monthlyListCents: isOffline || !rate ? sub.amount_cents : rateMonthlyTotalCents(rate, billed),
      stripeQuantity: !isOffline && typeof sub.quantity === "number" && sub.quantity !== billed ? sub.quantity : null,
      suggestedOfflineCents: isOffline ? monthlyTotalCents(billed) : null,
      venueState: membershipState(
        rows.find((row) => row.venue_id === venueId),
        nowMs
      ),
    };
  };
  // Venues no live bill covers: removed from a bill, comped (free on a paying partner's account), or
  // simply unbilled — one shared classifier (lib/venueBilling.ts, Phase 6.3). A removed venue is
  // never "Comped". One membership read + two bill reads for the whole list.
  const uncovered = (links ?? [])
    .map((link) => link.venue_id)
    .filter((venueId) => {
      const sub = subByVenue.get(venueId);
      return !sub || sub.status === "cancelled";
    });
  const ownerIdByVenue = new Map((links ?? []).map((link) => [link.venue_id, link.owner_id]));
  const unbilled = await unbilledVenueStates(uncovered, ownerIdByVenue);
  if (!unbilled.ok) {
    return NextResponse.json({ ok: false, error: unbilled.error }, { status: 500 });
  }
  const removedFrom = (venueId: string, sub: SubscriptionRow | null): AdminRemovedFrom | null => {
    const state = unbilled.byVenue.get(venueId);
    if (sub || state?.kind !== "removed") return null;
    return {
      anchorVenueId: state.anchorVenueId,
      anchorVenueName: state.anchorVenueId ? (venueNameById.get(state.anchorVenueId) ?? null) : null,
      removedAt: state.removedAt,
    };
  };

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
        bill: sub ? billOf(link.venue_id, sub) : null,
        comped: !sub && unbilled.byVenue.get(link.venue_id)?.kind === "comped",
        // Phase 6.7: its own bill was cancelled (so `sub` is that dead bill) and the partner pays on another.
        lapsed: unbilled.byVenue.get(link.venue_id)?.kind === "lapsed",
        removedFrom: removedFrom(link.venue_id, sub),
        // Phase 6.5: "Grant offline" would open the partner a second bill (POST refuses it too).
        grantOfflineBlocked: refusesOwnBill(unbilled.byVenue.get(link.venue_id)),
        grantOfflineBlockedMessage: grantBlockedMessage(unbilled.byVenue.get(link.venue_id)),
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

/**
 * GET ?resource=attach-options — what the "Link a venue to a partner" sheet offers (Phase 6, 6.4):
 *   `venues` — visible, real (not a (0,0) room) venues that are either linked to NO partner yet
 *     (`ownerId: null`) or linked to exactly one partner and COMPED there (`ownerId` = that partner,
 *     found with the shared classifier `unbilledVenueStates`, never re-derived) — the second kind can
 *     only be moved onto that same partner's bill; plus (Phase 6.7) venues of one partner whose old bill
 *     ended (`state` "lapsed", or "removed" from a bill) while that partner pays on another — also only
 *     back onto that partner's bill, and hidden ones only if we hid them (`rehidden_at`);
 *   `owners` — EVERY partner account (`id, email, name`), so the Partner dropdown never depends on the
 *     list's search box.
 * Three bounded reads, plus the classifier's reads for the few linked venues. The server re-checks
 * everything on submit.
 */
async function attachOptions(): Promise<NextResponse> {
  const [venues, links, owners] = await Promise.all([
    supabaseAdmin!
      .from("venues")
      .select("id, name, hidden, rehidden_at, latitude, longitude")
      .order("name", { ascending: true })
      .limit(1000)
      .returns<
        Array<{
          id: string;
          name: string | null;
          hidden: boolean | null;
          rehidden_at: string | null;
          latitude: number | null;
          longitude: number | null;
        }>
      >(),
    supabaseAdmin!.from("venue_owner_venues").select("venue_id, owner_id").returns<{ venue_id: string; owner_id: string }[]>(),
    supabaseAdmin!
      .from("venue_owners")
      .select("id, email, name")
      .order("email", { ascending: true })
      .limit(1000)
      .returns<Array<{ id: string; email: string | null; name: string | null }>>(),
  ]);
  const readError = venues.error ?? links.error ?? owners.error;
  if (readError) {
    return NextResponse.json({ ok: false, error: readError.message }, { status: 500 });
  }
  const ownersByVenue = new Map<string, string[]>();
  for (const link of links.data ?? []) ownersByVenue.set(link.venue_id, [...(ownersByVenue.get(link.venue_id) ?? []), link.owner_id]);
  // Hidden venues are offered only when WE hid them (`rehidden_at`: removed from a bill, or lapsed) and only as a
  // rejoin below — the server's own rule (lib/adminVenueAttach.ts); an admin-hidden venue stays refused.
  const eligible = (venues.data ?? []).filter((venue) => (!venue.hidden || venue.rehidden_at) && !isPlaceholderVenueRow(venue));
  const soleOwnerByVenue = new Map(
    eligible.flatMap((venue) => {
      const linked = ownersByVenue.get(venue.id) ?? [];
      return linked.length === 1 ? [[venue.id, linked[0]] as const] : [];
    })
  );
  const states = await unbilledVenueStates(Array.from(soleOwnerByVenue.keys()), soleOwnerByVenue);
  if (!states.ok) {
    return NextResponse.json({ ok: false, error: states.error }, { status: 500 });
  }
  const options = eligible.flatMap<{ id: string; name: string; ownerId: string | null; state: "unlinked" | "comped" | "lapsed" | "removed" }>(
    (venue) => {
      const name = (venue.name ?? "").trim() || venue.id;
      if (!ownersByVenue.has(venue.id)) return venue.hidden ? [] : [{ id: venue.id, name, ownerId: null, state: "unlinked" }];
      const owner = soleOwnerByVenue.get(venue.id);
      const state = states.byVenue.get(venue.id);
      if (!owner || !state) return [];
      // Comped venues are visible ones; a rejoin is a venue whose bill history the partner's live bill can take back.
      if (state.kind === "comped") return venue.hidden ? [] : [{ id: venue.id, name, ownerId: owner, state: "comped" }];
      if ((state.kind === "lapsed" || state.kind === "removed") && rejoinBillOf(state)) {
        return [{ id: venue.id, name, ownerId: owner, state: state.kind }];
      }
      return [];
    }
  );
  return NextResponse.json({
    ok: true,
    venues: options,
    owners: (owners.data ?? []).map((owner) => ({ id: owner.id, email: owner.email ?? "", name: owner.name ?? "" })),
  });
}

type PostBody = {
  action?:
    | "grant-manual"
    | "revoke"
    | "apply-discount"
    | "remove-discount"
    | "set-custom-price"
    | "set-standard-price"
    | "attach-venue";
  /** attach-venue: the partner account to give the venue to. */
  ownerId?: string;
  /** attach-venue: "bill" (Add to their bill) or "comped" (Free). */
  mode?: string;
  /** attach-venue: true = say what would happen, change nothing. */
  preview?: boolean;
  /** attach-venue (card bill): one key per Confirm; re-sent on a retry. */
  idempotencyKey?: string;
  /** attach-venue (card bill): from the preview's quote. */
  prorationDate?: number;
  /** attach-venue (card bill): the preview quote's `thisVenueCents`; a changed price is refused. */
  quotedVenueCents?: number;
  venueId?: string;
  paidThroughDate?: string; // YYYY-MM-DD, inclusive; what the check covers — offline access never lapses on its own (2026-10-11)
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
 * Admin billing actions are per VENUE, but a venue can sit on another venue's multi-venue bill
 * (docs/multi-venue-volume-billing-plan.md). Acting on it from a non-anchor venue would revoke,
 * discount or reprice the whole chain's bill by accident — or, for grant-manual, open a second
 * bill for a venue that is already billed. Until Phase 6 builds chain-aware admin tools these
 * actions refuse anything but the bill's anchor venue. (No venue is on a chain yet, so today this
 * never fires.)
 */
const notAnchorResponse = (row: { venue_id: string }, venueId: string): NextResponse | null =>
  row.venue_id === venueId
    ? null
    : NextResponse.json(
        {
          ok: false,
          error: `This venue is billed on a multi-venue bill opened for venue ${row.venue_id}. Manage billing from that venue.`,
          code: "not_bill_anchor",
        },
        { status: 409 }
      );

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
    const billing = await loadBillingForVenue<{
      id: string;
      venue_id: string;
      status: string;
      stripe_subscription_id: string | null;
    }>(venueId, "id, stripe_subscription_id");
    const existing = billing.ok ? billing.row : null;
    if (!existing) {
      return NextResponse.json({ ok: false, error: "No subscription found for this venue." }, { status: 404 });
    }
    const notAnchor = notAnchorResponse(existing, venueId);
    if (notAnchor) return notAnchor;
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

  if (body.action === "set-standard-price") {
    return handleSetStandardPrice(venueId, auth.adminUsername);
  }

  if (body.action === "attach-venue") {
    const mode = body.mode === "bill" || body.mode === "comped" ? body.mode : null;
    if (!mode) {
      return NextResponse.json({ ok: false, error: "Choose Add to their bill or Free (comped).", code: "invalid_request" }, { status: 400 });
    }
    const { httpStatus, ...outcome } = await attachVenueToOwner({
      venueId,
      ownerId: (body.ownerId ?? "").trim(),
      mode,
      preview: body.preview === true,
      clientKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
      prorationDate: body.prorationDate,
      quotedVenueCents: body.quotedVenueCents,
    });
    console.log(
      `[AdminBilling] attach-venue admin=${auth.adminUsername} venue=${venueId} owner=${body.ownerId ?? ""} mode=${mode} ` +
        `preview=${body.preview === true} result=${outcome.ok ? outcome.kind : outcome.code}`
    );
    return NextResponse.json(outcome, { status: httpStatus, headers: { "Cache-Control": "no-store" } });
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
  const existingBilling = await loadBillingForVenue<{
    id: string;
    venue_id: string;
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
  }>(
    venueId,
    "id, venue_id, billing_method, stripe_subscription_id, status, amount_cents, current_period_end, stripe_coupon_id, discount_label, discount_percent_off, discount_amount_off_cents, discount_ends_at"
  );
  if (!existingBilling.ok) {
    // Fail closed: without this answer the live-Stripe-subscription guard below is blind.
    return NextResponse.json({ ok: false, error: existingBilling.error }, { status: 500 });
  }
  const existingSub = existingBilling.row;
  if (existingSub) {
    const notAnchor = notAnchorResponse(existingSub, venueId);
    if (notAnchor) return notAnchor;
  }

  // One bill per partner (Phase 6.5): a venue taken off a bill, comped, or whose partner already
  // pays on another venue's bill must not get a bill of its own — the upsert below would open a
  // SECOND bill, and a partner with two bills can't Add a venue. A venue a live bill already covers
  // is not in the map (renewing its offline bill is fine). Fails closed.
  const unbilled = await unbilledVenueStates([venueId], new Map([[venueId, link.owner_id]]));
  if (!unbilled.ok) {
    console.error(`[AdminBilling] grant-manual-state-read-failed venue=${venueId}: ${unbilled.error}`);
    return NextResponse.json({ ok: false, error: "Couldn't check this venue's billing. Try again." }, { status: 500 });
  }
  const unbilledState = unbilled.byVenue.get(venueId);
  if (refusesOwnBill(unbilledState)) {
    const key = onPartnerBillMessageKey(unbilledState, "admin");
    console.warn(
      `[AdminBilling] grant-manual-refused-on-partner-bill admin=${auth.adminUsername} venue=${venueId} ` +
        `state=${unbilledState.kind} ownerBill=${unbilledState.ownerBillId ?? "none"}`
    );
    return NextResponse.json(
      { ok: false, error: ADMIN_GRANT_ON_PARTNER_BILL_MESSAGES[key], code: ON_PARTNER_BILL_CODE },
      { status: 409 }
    );
  }

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
        stripe_price_lookup_key: null,
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

  // Multi-venue billing Phase 6.6: if this re-opened an old bill whose anchor venue had rejoined
  // another (since cancelled) bill, bring its membership row home. Best-effort; the daily cron repairs.
  const anchorHome = await bringAnchorHome(subscription.id);
  if (!anchorHome.ok) console.error(`[AdminBilling] anchor-home-failed bill=${subscription.id}: ${anchorHome.error}`);

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

  const billing = await loadBillingForVenue<DiscountableSubscriptionRow & { venue_id: string; status: string }>(
    venueId,
    // billing_method decides the offline path (see DiscountableSubscriptionRow) —
    // dropping it here would route every row down the Stripe branch.
    "id, billing_method, stripe_subscription_id, amount_cents, current_period_end"
  );
  const row = billing.ok ? billing.row : null;

  if (!row) {
    return NextResponse.json({ ok: false, error: "No subscription found for this venue." }, { status: 404 });
  }
  const notAnchor = notAnchorResponse(row, venueId);
  if (notAnchor) return notAnchor;

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

  const billing = await loadBillingForVenue<DiscountableSubscriptionRow & { venue_id: string; status: string }>(
    venueId,
    // billing_method decides the offline path (see DiscountableSubscriptionRow) —
    // dropping it here would route every row down the Stripe branch.
    "id, billing_method, stripe_subscription_id, amount_cents, current_period_end"
  );
  const row = billing.ok ? billing.row : null;

  if (!row) {
    return NextResponse.json({ ok: false, error: "No subscription found for this venue." }, { status: 404 });
  }
  const notAnchor = notAnchorResponse(row, venueId);
  if (notAnchor) return notAnchor;

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
 *
 * Accepts exactly one of stripePriceId (pasted Price id, the escape hatch for
 * legacy/odd rates) or amountDollars (typed whole-dollar rate — reuses the same
 * PostBody field grant-manual uses for the list rate; band/integer validation
 * lives in lib/billingCustomPrice.ts's resolveMonthlyPriceForAmount, not here).
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
  // JSON gives amountDollars as number | string | null depending on how the
  // caller built the body — coerce the same way handleApplyDiscount coerces
  // percentOff, rather than trusting the declared PostBody type.
  const hasAmountDollars = body.amountDollars !== undefined && body.amountDollars !== null && body.amountDollars !== ("" as unknown);
  const amountDollars = hasAmountDollars ? Number(body.amountDollars) : NaN;

  if (priceId && hasAmountDollars) {
    return NextResponse.json(
      { ok: false, error: "Provide either a price id or a dollar amount, not both." },
      { status: 400 }
    );
  }
  if (!priceId && !hasAmountDollars) {
    return NextResponse.json(
      { ok: false, error: "A Stripe price id or a dollar amount is required." },
      { status: 400 }
    );
  }
  if (hasAmountDollars && !Number.isFinite(amountDollars)) {
    return NextResponse.json({ ok: false, error: "That dollar amount isn't a number." }, { status: 400 });
  }

  const billing = await loadBillingForVenue<CustomPriceRow & { venue_id: string; status: string }>(
    venueId,
    "id, owner_id, stripe_subscription_id, amount_cents"
  );
  const row = billing.ok ? billing.row : null;

  if (!row) {
    return NextResponse.json({ ok: false, error: "No subscription found for this venue." }, { status: 404 });
  }
  const notAnchor = notAnchorResponse(row, venueId);
  if (notAnchor) return notAnchor;

  // Clear this bill's dead claims first (an add / remove / swap that died mid-way, past its lease),
  // so they never block the swap — the same first step as the partner add / remove routes.
  await settleStaleVenueChangesForBill(row.id);
  const result = await setCustomPrice(row, priceId ? { priceId } : { amountDollars });
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

/**
 * action: "set-standard-price" — put a bill on a negotiated per-venue rate back onto the standard
 * graduated bands, keeping its venues (Phase 6). Recorded in the same audit table as the custom rate
 * (discount_type 'custom_price', custom_price_cents null = "back to standard").
 */
async function handleSetStandardPrice(venueId: string, adminUsername: string): Promise<NextResponse> {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }
  const billing = await loadBillingForVenue<CustomPriceRow & { venue_id: string; status: string }>(
    venueId,
    "id, owner_id, stripe_subscription_id, amount_cents"
  );
  const row = billing.ok ? billing.row : null;
  if (!row) {
    return NextResponse.json({ ok: false, error: "No subscription found for this venue." }, { status: 404 });
  }
  const notAnchor = notAnchorResponse(row, venueId);
  if (notAnchor) return notAnchor;

  await settleStaleVenueChangesForBill(row.id);
  const result = await setStandardPrice(row);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  const { error: grantError } = await supabaseAdmin.from("billing_discount_grants").insert({
    venue_id: venueId,
    subscription_id: row.id,
    granted_by: adminUsername,
    discount_type: "custom_price",
    custom_price_cents: null,
    reason: "Back to standard pricing",
  });
  return NextResponse.json({
    ...result,
    ok: true,
    ...(grantError ? { warning: result.warning ?? "Pricing changed, but the audit record failed to save." } : {}),
  });
}
