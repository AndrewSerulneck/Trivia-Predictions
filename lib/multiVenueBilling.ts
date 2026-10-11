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
  card_declined: "Your card was declined. Update it in Billing, then try again.",
  payment_unconfirmed: "We couldn't confirm the payment yet. Check back in a few minutes before trying again.",
  addition_failed: "We couldn't add that venue. Please try again.",
  stripe_unavailable: "Billing is temporarily unavailable. Please try again in a moment.",
};
