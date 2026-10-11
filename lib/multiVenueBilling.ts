// Multi-venue volume billing — the partner-facing "Add a venue" switch and its client contract.
// docs/multi-venue-volume-billing-plan.md §2 (planner defaults) and Phase 3.
//
// Pure and dependency-free so the Partner Dashboard (Phase 4) can import it: no `server-only`,
// only a NEXT_PUBLIC_* `process.env` read (inlined at build time). Same reversible convention as
// `isSelfServeSignupEnabled()` in lib/selfServeSignup.ts.
//
// What the flag gates: the "+ Add a venue" entry point and the two partner routes
// (`GET /api/owner/venues/add/quote`, `POST /api/owner/venues/add`), which 404 when it is off.
// What it deliberately does NOT gate: finishing an add that is already under way. The Stripe
// webhook (`invoice.paid`) and the daily `/api/cron/billing` reconciler complete or clean up
// existing `billing_venue_additions` rows whatever the flag says — once a partner's card has been
// asked for money, turning the flag off must not strand the payment or the venue. With the flag
// off and no rows, both are inert.

import { isSelfServeSignupEnabled } from "@/lib/selfServeSignup";

const truthy = (value: string | undefined): boolean => {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
};

/**
 * Master flag for partner self-serve "Add a venue". Off (the default) = no entry point and the
 * add/quote routes 404. The single reader — do not read
 * `process.env.NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED` anywhere else. A `NEXT_PUBLIC_*` value is
 * inlined at build time, so changing it needs a redeploy.
 */
export const isMultiVenueBillingEnabled = (): boolean =>
  truthy(process.env.NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED);

/**
 * Whether the Partner Dashboard shows "+ Add a venue". Needs the master flag AND the self-serve signup
 * flag, because the add sheet reuses the signup wizard's address search and map (`/api/signup/places`,
 * `/api/signup/maps-key`), which 404 while signup is off — a half-working sheet is worse than no entry
 * point. Both are `NEXT_PUBLIC_*` (inlined at build), so this is safe to call from a client component.
 */
export const isAddVenueAvailable = (): boolean => isMultiVenueBillingEnabled() && isSelfServeSignupEnabled();

// --- Client contract (Phase 4 renders these) ---------------------------------------------------

/** `GET /api/owner/venues/add/quote` → `{ ok: true, quote }`. Money is integer cents. */
export type AddVenueQuote = {
  /** Venues on the bill now. */
  currentVenueCount: number;
  /** The number the new venue would be (currentVenueCount + 1) — decides its band. */
  venueNumber: number;
  /** The new venue's own monthly band price (lib/venuePricing.ts `nextVenuePriceCents`). */
  thisVenueCents: number;
  /** The bill's monthly list total after the add, before any discount. */
  newMonthlyListCents: number;
  /** What the partner will pay per month after the add — the list total with their discount. */
  newMonthlyTotalCents: number;
  /** What Stripe would charge today for the rest of the current period (Stripe's own preview). */
  dueTodayCents: number;
  /**
   * The instant the preview was priced at (unix seconds). Sent back with the add so Stripe
   * prorates at the same second and the charge equals `dueTodayCents` exactly.
   */
  prorationDate: number;
  /** When the current paid period ends (ISO), i.e. what "the rest of this month" runs to. */
  currentPeriodEnd: string | null;
  /** The bill's discount label, if any (it applies to the whole bill — plan §2 decision 3). */
  discountLabel: string | null;
};

/** The outcome statuses `POST /api/owner/venues/add` answers with. */
export type AddVenueStatus = "paid" | "requires_action" | "processing";

/**
 * Why an add was refused or failed — the `code` on a non-OK answer. Stable strings; Phase 4 may
 * branch on them (e.g. `card_declined` → link to Billing; `addition_in_progress` → "finish the
 * other one first").
 */
export const ADD_VENUE_FAILURE_CODES = [
  "forbidden",
  "invalid_request",
  "rate_limited",
  "no_bill",
  "multiple_bills",
  "not_bill_owner",
  "offline_bill",
  "bill_not_active",
  "cancel_scheduled",
  "custom_rate",
  "billing_state",
  "addition_in_progress",
  "venue_already_yours",
  "venue_exists",
  "venue_unavailable",
  "readd_use_undo",
  "card_declined",
  "payment_unconfirmed",
  "addition_failed",
  "stripe_unavailable",
] as const;

export type AddVenueFailureCode = (typeof ADD_VENUE_FAILURE_CODES)[number];

/** Where partners write when an add needs a human (same address the signup flow uses). */
export const PARTNER_SUPPORT_EMAIL = "partnerships@hightopchallenge.com";

/**
 * The partner-facing sentence for each failure code — ONE home for this copy, so the routes and
 * the Phase 4 screens can never word the same refusal two ways. Phase 7 polishes the wording.
 * (Validation messages come from lib/selfServeSignup.ts's shared rules instead, verbatim.)
 */
export const ADD_VENUE_MESSAGES: Record<AddVenueFailureCode, string> = {
  forbidden: "You do not have access to this venue.",
  invalid_request: "Something about that request wasn't right. Please start again.",
  rate_limited: "Too many tries in a short time. Please wait a few minutes and try again.",
  no_bill: "Start a subscription in Billing before adding another venue.",
  multiple_bills: "Choose which venue's bill to add this venue to, then try again.",
  not_bill_owner: "Only the partner who pays for this account can add a venue to it.",
  offline_bill: `Your account is billed by check. Email ${PARTNER_SUPPORT_EMAIL} and we'll add the venue for you.`,
  bill_not_active: "Your subscription isn't active right now. Check Billing (and your card), then add the venue.",
  cancel_scheduled: "Your subscription is set to cancel. Resume it in Billing, then add the venue.",
  custom_rate: `Your account has a custom rate. Email ${PARTNER_SUPPORT_EMAIL} and we'll add the venue for you.`,
  billing_state: `Your bill needs a quick check from us before you can add a venue. Email ${PARTNER_SUPPORT_EMAIL}.`,
  addition_in_progress: "You're already adding a venue. Finish that one first.",
  venue_already_yours: "That venue is already on your account.",
  venue_exists: `We already have a venue at this address. Email ${PARTNER_SUPPORT_EMAIL} and we'll move it onto your bill.`,
  venue_unavailable: `That venue isn't available to add. Email ${PARTNER_SUPPORT_EMAIL} and we'll set it up for you.`,
  readd_use_undo: "That venue is still on your bill until the end of this period. Tap Undo instead — there's nothing to pay.",
  card_declined: "Your card was declined. Update it in Billing, then try again.",
  payment_unconfirmed: "We couldn't confirm the payment yet. Check back in a few minutes before trying again.",
  addition_failed: "We couldn't add that venue. Please try again.",
  stripe_unavailable: "Billing is temporarily unavailable. Please try again in a moment.",
};

// --- Remove / Undo (Phase 5) -------------------------------------------------------------------

/** `POST /api/owner/venues/remove` body `action`. */
export type VenueBillChangeAction = "remove" | "undo";

/** A successful Remove / Undo: `{ ok: true, change }`. */
export type VenueBillChangeResult = {
  action: VenueBillChangeAction;
  venueId: string;
  /** Remove: when the venue leaves the bill (ISO, the end of the paid period). Undo: null. */
  removeAt: string | null;
  /** Venues billed from the next renewal on, after this change. */
  billedVenueCount: number;
};

/**
 * Why a Remove / Undo was refused — the `code` on a non-OK answer. Some are shared with "Add a
 * venue" (same bill rules); the rest are specific to taking a venue off.
 */
export const VENUE_CHANGE_FAILURE_CODES = [
  "forbidden",
  "invalid_request",
  "rate_limited",
  "no_bill",
  "not_bill_owner",
  "offline_bill",
  "bill_not_active",
  "cancel_scheduled",
  "custom_rate",
  "billing_state",
  "addition_in_progress",
  "change_in_progress",
  "not_on_bill",
  "already_leaving",
  "not_leaving",
  "too_late",
  "last_venue",
  "needs_support",
  "change_unconfirmed",
  "change_failed",
  "stripe_unavailable",
] as const;

export type VenueChangeFailureCode = (typeof VENUE_CHANGE_FAILURE_CODES)[number];

/** The partner-facing sentence for each Remove / Undo refusal (one home, like ADD_VENUE_MESSAGES). */
export const VENUE_CHANGE_MESSAGES: Record<VenueChangeFailureCode, string> = {
  forbidden: "You do not have access to this venue.",
  invalid_request: "Something about that request wasn't right. Please refresh and try again.",
  rate_limited: "Too many tries in a short time. Please wait a few minutes and try again.",
  no_bill: "This venue isn't on a subscription.",
  not_bill_owner: "Only the partner who pays for this account can change which venues are on it.",
  offline_bill: `Your account is billed by check. Email ${PARTNER_SUPPORT_EMAIL} to change your venues.`,
  bill_not_active: "Your subscription isn't active right now, so its venues can't be changed.",
  cancel_scheduled: "Your subscription is set to cancel. Resume it first if you want to change its venues.",
  custom_rate: `Your account has a custom rate. Email ${PARTNER_SUPPORT_EMAIL} to change your venues.`,
  billing_state: `Your bill needs a quick check from us before its venues can change. Email ${PARTNER_SUPPORT_EMAIL}.`,
  addition_in_progress: "You're adding a venue right now. Finish that first, then try again.",
  change_in_progress: "Another change to your venues is still going through. Try again in a minute.",
  not_on_bill: "That venue isn't on your bill.",
  already_leaving: "That venue is already set to leave your bill.",
  not_leaving: "That venue isn't set to leave your bill.",
  too_late: "That venue has already left your bill. Add it back to start paying for it again.",
  last_venue: "This is the only venue on your bill. To stop paying, cancel your subscription instead.",
  needs_support: `We can't take that venue off automatically. Email ${PARTNER_SUPPORT_EMAIL} and we'll do it for you.`,
  change_unconfirmed: "We couldn't confirm the change yet. Refresh in a minute before trying again.",
  change_failed: "We couldn't make that change. Please try again.",
  stripe_unavailable: "Billing is temporarily unavailable. Please try again in a moment.",
};

// --- Billing page account view (Phase 5) -------------------------------------------------------

/**
 * One venue on (or recently off) a bill, as `GET /api/owner/billing` returns it in `account`.
 *   billed  — on the bill, and on the next renewal.
 *   leaving — on the bill until `removeAt` (the end of the paid period), then it drops off.
 *   removed — taken off; still the partner's venue, hidden from players, "Add back" re-adds it.
 */
export type BillAccountVenue = {
  id: string;
  name: string;
  state: "billed" | "leaving" | "removed";
  isAnchor: boolean;
  removeAt: string | null;
};

/** Money is integer cents; every figure is computed on the server from lib/venuePricing.ts. */
export type BillAccount = {
  venues: BillAccountVenue[];
  /** Venues on the next renewal (billed only). */
  billedVenueCount: number;
  /** "1 × $100 · 3 × $75" — the bands of the next renewal. */
  breakdown: Array<{ venues: number; unitAmountCents: number; subtotalCents: number }>;
  /** Next renewal's list total, before any discount. */
  nextMonthlyListCents: number;
  /** …and after the bill's discount. */
  nextMonthlyTotalCents: number;
};

// --- Admin: put an existing venue on a partner's account (Phase 6) ----------------------------

/**
 * How an admin gives an existing (already activated) venue to a partner who already has an account
 * (plan §2 row 7: "offer both"):
 *   bill   — "Add to their bill": a card bill is charged now, prorated, exactly like the partner's own
 *            "Add a venue" (lib/venueAddition.ts); a check-billed (offline) bill just gains the venue,
 *            and the admin updates the offline amount (a suggestion is returned).
 *   comped — "Free / comped": the partner gets the venue (dashboard, TV, games) and it is on NO bill.
 */
export type AdminAttachMode = "bill" | "comped";

export const ADMIN_ATTACH_FAILURE_CODES = [
  "invalid_request",
  "venue_not_found",
  "venue_hidden",
  "venue_placeholder",
  "owner_not_found",
  "venue_has_owner",
  "already_linked",
  "venue_has_own_bill",
  "venue_has_billing_history",
  "on_bill",
  "card_add_switched_off",
] as const;

export type AdminAttachFailureCode = (typeof ADMIN_ATTACH_FAILURE_CODES)[number];

/** Admin-facing sentences for the attach refusals (the card-bill refusals reuse ADD_VENUE_MESSAGES). */
export const ADMIN_ATTACH_MESSAGES: Record<AdminAttachFailureCode, string> = {
  invalid_request: "Pick a venue, a partner and Bill or Comped.",
  venue_not_found: "That venue doesn't exist.",
  venue_hidden: "That venue is hidden. Unhide it in Venues first, then link it.",
  venue_placeholder: "That is an internal room, not a real venue.",
  owner_not_found: "That partner account doesn't exist.",
  venue_has_owner: "That venue already belongs to a different partner.",
  already_linked: "That venue is already on this partner's account.",
  venue_has_own_bill: "That venue has its own subscription. Manage it from its own row.",
  venue_has_billing_history: "That venue has been on a bill before. The partner can use Add back in Billing, or ask support.",
  on_bill: "That venue is on this partner's bill already — it can't also be comped.",
  card_add_switched_off:
    "Charging a card for an added venue is switched off until multi-venue billing is released (NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED). Use Free (comped) for now.",
};

/** What "Add to their bill" / "Comped" would do, shown to the admin before Confirm. */
export type AdminAttachPreview = {
  venue: { id: string; name: string };
  owner: { id: string; email: string; name: string };
  mode: AdminAttachMode;
  /** Card bill: Stripe's own quote, as the partner would see it. */
  quote: AddVenueQuote | null;
  /** Check-billed bill: venues billed after the add, and the graduated total to suggest. */
  offline: { billedVenueCountAfter: number; suggestedMonthlyCents: number; currentMonthlyCents: number } | null;
};
