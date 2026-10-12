import "server-only";

import {
  ADD_VENUE_MESSAGES,
  ADMIN_ATTACH_MESSAGES,
  isMultiVenueBillingEnabled,
  type AddVenueFailureCode,
  type AdminAttachFailureCode,
  type AdminAttachMode,
  type AdminAttachPreview,
} from "@/lib/multiVenueBilling";
import { OFFLINE_BILLING_METHOD } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  addVenueInputFromBody,
  ensureOwnerLink,
  errorText,
  loadAddVenueContext,
  quoteVenueAddition,
  startVenueAddition,
  venueAdditionInFlight,
  type AddVenueOutcome,
} from "@/lib/venueAddition";
import {
  addVenueToBill,
  billMembershipOf,
  billMemberships,
  billedVenueCountFromRows,
  isBilledMembership,
  loadBillingForVenue,
  loadBillingForVenues,
} from "@/lib/venueBilling";
import { isPlaceholderVenueRow } from "@/lib/venueClaim";
import { settleStaleVenueChangesForBill } from "@/lib/venueRemoval";
import { monthlyTotalCents } from "@/lib/venuePricing";

/**
 * Admin: give an EXISTING venue (one an admin activated) to a partner who already has an account —
 * "Add to their bill" or "Free / comped" (docs/multi-venue-volume-billing-plan.md Phase 6, plan §2
 * row 7). Called only by `POST /api/admin/billing` (`action: "attach-venue"`).
 *
 *   comped → the `venue_owner_venues` link only. The venue is on no bill and never will be by this.
 *   bill, card bill → the partner's own "Add a venue" flow (lib/venueAddition.ts) with the venue
 *     passed in (`adminAttachVenue`): same advisory-locked ledger, same prorated charge on the card
 *     on file (`pending_if_incomplete`), same completion (membership, link, "Venue added" email).
 *     Nothing about the money logic is re-implemented here.
 *   bill, check-billed (offline) bill → membership row (`role 'admin'`) + link; no Stripe. The
 *     offline amount is the admin's to set — the graduated total is returned as a suggestion.
 *
 * Every refusal happens BEFORE anything is written. The venue must be visible, a real venue (not a
 * (0,0) room), not another partner's, and never billed before (its own subscription, or a past
 * membership — those are the partner's "Add back", or support's call).
 */

const LOG = "[AdminVenueAttach]";

export type AdminAttachArgs = {
  venueId: string;
  ownerId: string;
  mode: AdminAttachMode;
  preview: boolean;
  /** Card bill only: the add's idempotency key (one per Confirm, re-sent on a retry). */
  clientKey?: string;
  /** Card bill only: from the preview's quote. */
  prorationDate?: unknown;
  /** Card bill only: the preview quote's `thisVenueCents` (a changed price is refused `quote_changed`). */
  quotedVenueCents?: unknown;
};

export type AdminAttachOutcome =
  | { ok: true; httpStatus: 200; kind: "preview"; preview: AdminAttachPreview }
  | { ok: true; httpStatus: 200; kind: "comped"; venueId: string }
  | {
      ok: true;
      httpStatus: 200;
      kind: "offline_attached";
      venueId: string;
      billedVenueCount: number;
      suggestedMonthlyCents: number;
      currentMonthlyCents: number;
    }
  | { ok: true; httpStatus: 200; kind: "already_on_bill"; venueId: string }
  | ({ kind: "card_add" } & Extract<AddVenueOutcome, { ok: true }>)
  | { ok: false; httpStatus: number; code: AdminAttachFailureCode | AddVenueFailureCode; error: string; [key: string]: unknown };

const refuse = (code: AdminAttachFailureCode, httpStatus = 409): AdminAttachOutcome => ({
  ok: false,
  httpStatus,
  code,
  error: ADMIN_ATTACH_MESSAGES[code],
});

const failed = (error: string): AdminAttachOutcome => ({
  ok: false,
  httpStatus: 500,
  code: "invalid_request",
  error,
});

type VenueRow = {
  id: string;
  name: string | null;
  hidden: boolean | null;
  latitude: number | null;
  longitude: number | null;
};

type OwnerBillRow = {
  id: string;
  venue_id: string;
  owner_id: string | null;
  status: string;
  billing_method: string | null;
  amount_cents: number | null;
};

export async function attachVenueToOwner(args: AdminAttachArgs): Promise<AdminAttachOutcome> {
  if (!supabaseAdmin) return failed("Server configuration error.");
  const venueId = args.venueId.trim();
  const ownerId = args.ownerId.trim();
  if (!venueId || !ownerId || (args.mode !== "bill" && args.mode !== "comped")) return refuse("invalid_request", 400);

  try {
    // 1. The venue: real, visible.
    const venueRead = await supabaseAdmin
      .from("venues")
      .select("id, name, hidden, latitude, longitude")
      .eq("id", venueId)
      .maybeSingle<VenueRow>();
    if (venueRead.error) return failed(`venue-read-failed: ${venueRead.error.message}`);
    const venueRow = venueRead.data;
    if (!venueRow) return refuse("venue_not_found", 404);
    if (isPlaceholderVenueRow(venueRow)) return refuse("venue_placeholder");
    if (venueRow.hidden) return refuse("venue_hidden");
    const venue = { id: venueRow.id, name: (venueRow.name ?? "").trim() || venueRow.id };

    // 2. The partner.
    const ownerRead = await supabaseAdmin
      .from("venue_owners")
      .select("id, email, name")
      .eq("id", ownerId)
      .maybeSingle<{ id: string; email: string | null; name: string | null }>();
    if (ownerRead.error) return failed(`owner-read-failed: ${ownerRead.error.message}`);
    if (!ownerRead.data) return refuse("owner_not_found", 404);
    const owner = { id: ownerRead.data.id, email: ownerRead.data.email ?? "", name: ownerRead.data.name ?? "" };

    // 3. Whose is it now? Never another partner's.
    const links = await supabaseAdmin
      .from("venue_owner_venues")
      .select("owner_id")
      .eq("venue_id", venueId)
      .returns<{ owner_id: string }[]>();
    if (links.error) return failed(`link-read-failed: ${links.error.message}`);
    const linkedOwners = (links.data ?? []).map((link) => link.owner_id);
    if (linkedOwners.some((id) => id !== ownerId)) return refuse("venue_has_owner");
    const alreadyLinked = linkedOwners.includes(ownerId);

    // 4. Billing history. Its own subscription → manage it there; a membership on this partner's
    //    bill that is still billed → already done (bill) / contradictory (comped); any other
    //    membership (left a bill, or another bill) → not this tool's call.
    const ownBill = await loadBillingForVenue<{ id: string; venue_id: string; status: string }>(venueId, "id");
    if (!ownBill.ok) return failed(ownBill.error);
    if (ownBill.row && ownBill.row.venue_id === venueId) return refuse("venue_has_own_bill");
    const membership = await billMembershipOf(venueId);
    if (!membership.ok) return failed(membership.error);
    // A card add for this venue still waiting on its payment (3-D Secure) has not linked it yet:
    // never comp it, or put it on another partner's bill, underneath that add. The same partner's
    // bill add goes on to `startVenueAddition`, which answers a re-ask of the same key from its row.
    const inFlight = await venueAdditionInFlight(venueId);
    if (!inFlight.ok) return failed(inFlight.error);
    if (inFlight.ownerId && (args.mode === "comped" || inFlight.ownerId !== ownerId)) return refuse("venue_add_in_flight");

    // 5. The partner's venues and bill.
    const ownerLinks = await supabaseAdmin
      .from("venue_owner_venues")
      .select("venue_id")
      .eq("owner_id", ownerId)
      .returns<{ venue_id: string }[]>();
    if (ownerLinks.error) return failed(`link-read-failed: ${ownerLinks.error.message}`);
    const ownerVenueIds = Array.from(new Set((ownerLinks.data ?? []).map((link) => link.venue_id)));

    const bills = await loadBillingForVenues<OwnerBillRow>(ownerVenueIds, "id, venue_id, owner_id, status, billing_method, amount_cents");
    if (!bills.ok) return failed(bills.error);
    const ownBills = Array.from(new Map(Array.from(bills.byVenue.values()).map((row) => [row.id, row])).values()).filter(
      (row) => row.owner_id === ownerId && row.status !== "cancelled"
    );

    if (membership.row) {
      const onTheirBill = ownBills.some((bill) => bill.id === membership.row?.subscription_id);
      if (onTheirBill && isBilledMembership(membership.row)) {
        if (args.mode === "comped") return refuse("on_bill");
        if (args.preview) return refuse("already_linked");
        // A retry after the membership landed but the link didn't (offline path): finish the link.
        const link = await ensureOwnerLink(ownerId, venueId);
        if (!link.ok) return failed(link.error);
        return { ok: true, httpStatus: 200, kind: "already_on_bill", venueId };
      }
      return refuse("venue_has_billing_history");
    }

    // --- Comped: the link, and nothing else. ---
    if (args.mode === "comped") {
      if (alreadyLinked) return refuse("already_linked");
      if (args.preview) {
        return { ok: true, httpStatus: 200, kind: "preview", preview: { venue, owner, mode: "comped", quote: null, offline: null } };
      }
      const link = await ensureOwnerLink(ownerId, venueId);
      if (!link.ok) return failed(link.error);
      console.log(`${LOG} comped venue=${venueId} owner=${ownerId}`);
      return { ok: true, httpStatus: 200, kind: "comped", venueId };
    }

    // --- Add to their bill. ---
    if (ownBills.length === 0) return addRefusal("no_bill");
    if (ownBills.length > 1) return addRefusal("multiple_bills");
    const bill = ownBills[0];

    if (bill.billing_method === OFFLINE_BILLING_METHOD) {
      const memberships = await billMemberships(bill.id);
      if (!memberships.ok) return failed(memberships.error);
      const before = billedVenueCountFromRows(bill.venue_id, memberships.rows);
      const after = before + 1;
      const offline = {
        billedVenueCountAfter: after,
        suggestedMonthlyCents: monthlyTotalCents(after),
        currentMonthlyCents: bill.amount_cents ?? 0,
      };
      if (args.preview) {
        return { ok: true, httpStatus: 200, kind: "preview", preview: { venue, owner, mode: "bill", quote: null, offline } };
      }
      const added = await addVenueToBill(bill.id, venueId, "admin");
      if (!added.ok) return failed(added.error);
      const link = await ensureOwnerLink(ownerId, venueId);
      if (!link.ok) return failed(link.error);
      console.log(`${LOG} offline-attached venue=${venueId} owner=${ownerId} bill=${bill.id} venues=${after}`);
      return {
        ok: true,
        httpStatus: 200,
        kind: "offline_attached",
        venueId,
        billedVenueCount: after,
        suggestedMonthlyCents: offline.suggestedMonthlyCents,
        currentMonthlyCents: offline.currentMonthlyCents,
      };
    }

    // Card bill: the partner's own add flow, charged to their card on file. Behind the same release
    // switch as the partner's own "Add a venue" until Phase 7's live test (comped / check-billed links
    // above never touch Stripe and stay available).
    if (!isMultiVenueBillingEnabled()) return refuse("card_add_switched_off");
    const auth = { ownerId, venueIds: ownerVenueIds };
    const context = await loadAddVenueContext(auth, bill.venue_id);
    if (!context.ok) return context;
    // As the partner's own add and quote routes do: a Remove / Undo / price swap that died mid-request
    // would otherwise keep this bill "busy" (every Check again) until the daily cron.
    await settleStaleVenueChangesForBill(context.context.bill.id);
    if (args.preview) {
      const quoted = await quoteVenueAddition(context.context);
      if (!quoted.ok) return quoted;
      return { ok: true, httpStatus: 200, kind: "preview", preview: { venue, owner, mode: "bill", quote: quoted.quote, offline: null } };
    }
    const outcome = await startVenueAddition({
      auth,
      context: context.context,
      input: addVenueInputFromBody({}),
      adminAttachVenue: venue,
      clientKey: args.clientKey ?? "",
      prorationDate: args.prorationDate,
      quotedVenueCents: args.quotedVenueCents,
    });
    if (!outcome.ok) return outcome;
    console.log(`${LOG} card-add venue=${venueId} owner=${ownerId} bill=${bill.id} status=${outcome.status}`);
    return { ...outcome, kind: "card_add" };
  } catch (error) {
    console.error(`${LOG} attach-failed venue=${venueId} owner=${ownerId}: ${errorText(error)}`);
    return failed("Something went wrong. Please try again.");
  }
}

const addRefusal = (code: AddVenueFailureCode): AdminAttachOutcome => ({
  ok: false,
  httpStatus: 409,
  code,
  error: ADD_VENUE_MESSAGES[code],
});
