import "server-only";
import type Stripe from "stripe";

import { createAdminVenue } from "@/lib/admin";
import { DEFAULT_VENUE_COUNTRY } from "@/lib/adminVenueForm";
import { effectiveAmountCents, type DisplayDiscount } from "@/lib/billingDisplay";
import { sendVenueAddedEmail } from "@/lib/email/sendVenueAddedEmail";
import {
  ADD_VENUE_MESSAGES,
  type AddVenueFailureCode,
  type AddVenueQuote,
} from "@/lib/multiVenueBilling";
import { findNearbyVenue, venueAddressLabel } from "@/lib/nearbyVenue";
import type { RateLimitResult } from "@/lib/rateLimit";
import type { OwnerAuthContext } from "@/lib/requireOwnerAuth";
import { BLANK_SIGNUP_DRAFT, signupStepIssue, type SignupDraft } from "@/lib/selfServeSignup";
import { getStripeGraduatedPriceId, getStripePriceId, stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { addVenueToBill, billMembershipOf, hasLeftBill, isBilledMembership, loadBillingForVenues, venueIdsEverBilled } from "@/lib/venueBilling";
import { isAdminHiddenVenueRow, isPlaceholderVenueRow } from "@/lib/venueClaim";
import {
  billRateFromMirror,
  billRateFromPrice,
  GRADUATED_PRICE_LOOKUP_KEY,
  rateMonthlyTotalCents,
  rateVenuePriceCents,
  type BillRate,
} from "@/lib/venuePricing";

/**
 * Partner self-serve "Add a venue" — the server half (docs/multi-venue-volume-billing-plan.md §4.1,
 * §4.3, Phase 3). The ONE home of the add flow; the two routes
 * (`app/api/owner/venues/add/route.ts`, `…/add/quote/route.ts`), the Stripe webhook's `invoice.paid`
 * and the daily `/api/cron/billing` all call into this file and decide nothing themselves.
 *
 * MONEY RULES (Andrew, plan §2):
 *   - Charge now, prorated, on the card already on file. The venue goes live ONLY after that
 *     charge succeeds. Stripe does both halves for us: the quantity update is sent with
 *     `payment_behavior: "pending_if_incomplete"` + `proration_behavior: "always_invoice"`, so Stripe
 *     invoices the marginal band price for the rest of the period and applies the new quantity
 *     ONLY if that invoice is paid. A decline or a 3-D Secure challenge leaves the subscription
 *     exactly as it was, with a `pending_update` that Stripe discards (and whose invoice it voids)
 *     23 hours later at most.
 *   - A decline is final for this attempt: we void the invoice (which is how Stripe cancels a
 *     pending update), delete the hidden venue we created, and tell the partner to update their
 *     card. Voiding first matters — an open invoice could still be paid later, applying the new
 *     quantity to a venue that no longer exists.
 *   - 3-D Secure: the ledger row waits in `requires_action` and the partner gets Stripe's hosted
 *     invoice page. Whoever sees the invoice paid first — the webhook, a retry of the same request,
 *     or the daily reconciler — completes the add; all of them converge on one outcome.
 *
 * THE LEDGER (`billing_venue_additions`, Phase 1 migration) is written BEFORE anything else, via
 * the advisory-locked `claim_venue_addition` RPC (Phase 3 migration): one add in flight per bill,
 * one row per idempotency key. The Stripe idempotency key IS the ledger key, so a request that is
 * retried can never charge twice. Every later step is idempotent on its own (membership upsert,
 * filtered reveal UPDATE, status-guarded ledger UPDATE, claim-then-send email stamp), which is what
 * lets the route and the webhook both run completion safely.
 *
 * THE HIDDEN VENUE is created with `hidden = true` AND `self_serve_created_at` AND
 * `checkout_started_at` in ONE insert, before Stripe is called, and is linked to the partner
 * (`venue_owner_venues`) only when the charge succeeds. That combination makes it
 * (a) invisible to players, (b) revealable by the completion path and the daily reveal repair once
 * it is on a bill, and (c) reapable by the abandoned-signup sweep's 7-day tier if this flow ever
 * loses track of it — never "hidden, unpaid and un-sweepable". 7 days is far longer than Stripe's
 * 23-hour pending-update expiry, so the sweep can never delete a venue whose payment is still able
 * to land.
 *
 * NOT FLAG-GATED here. The routes check `isMultiVenueBillingEnabled()`; completion and
 * reconciliation must finish any add already under way whatever the flag says.
 */

const LOG = "[VenueAddition]";

/**
 * A `pending` ledger row younger than this may still be inside the request that created it (a slow
 * Stripe call — stripe-node times out at 80 s, a Vercel function at 300 s). Older = that request
 * is gone, and the row is reconciled from Stripe's own state.
 */
export const VENUE_ADDITION_LEASE_MS = 10 * 60 * 1000;

/** Rows the daily reconciler looks at per run. Each costs one or two Stripe reads. */
export const VENUE_ADDITION_RECONCILE_LIMIT = 20;

/** How far back a client-supplied `prorationDate` (from the quote) may be honoured. */
const PRORATION_DATE_MAX_AGE_SECONDS = 15 * 60;

/** Client idempotency keys: a UUID or similar, never free text. */
const CLIENT_KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

// --- Types ---------------------------------------------------------------------------------------

type AdditionStatus = "pending" | "paid" | "failed" | "requires_action";

export type VenueAdditionRow = {
  id: string;
  idempotency_key: string;
  owner_id: string | null;
  subscription_id: string | null;
  venue_id: string | null;
  venue_name: string | null;
  status: AdditionStatus;
  stripe_invoice_id: string | null;
  quantity_before: number | null;
  quantity_after: number | null;
  amount_due_cents: number | null;
  failure_reason: string | null;
  venue_added_email_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

const ADDITION_COLUMNS =
  "id, idempotency_key, owner_id, subscription_id, venue_id, venue_name, status, stripe_invoice_id, " +
  "quantity_before, quantity_after, amount_due_cents, failure_reason, venue_added_email_sent_at, created_at, updated_at";

const LEDGER = "billing_venue_additions";

/** The `billing_subscriptions` columns this flow reads. */
type BillRow = {
  id: string;
  venue_id: string;
  owner_id: string | null;
  status: string;
  billing_method: string | null;
  stripe_subscription_id: string | null;
  cancel_at_period_end: boolean | null;
  discount_label: string | null;
  discount_percent_off: number | null;
  discount_amount_off_cents: number | null;
  /** Mirror columns (webhook / lib/billingCustomPrice.ts) — read for the rate in the email only. */
  stripe_price_id: string | null;
  amount_cents: number | null;
  quantity: number | null;
};

const BILL_COLUMNS =
  "id, venue_id, owner_id, status, billing_method, stripe_subscription_id, cancel_at_period_end, " +
  "discount_label, discount_percent_off, discount_amount_off_cents, stripe_price_id, amount_cents, quantity";

/** A refusal or failure, already shaped for the route to return. */
export type AddVenueRefusal = {
  ok: false;
  httpStatus: number;
  code: AddVenueFailureCode;
  error: string;
  additionId?: string;
  hostedInvoiceUrl?: string | null;
  venue?: { id: string; name: string; address: string };
};

export type AddVenueOutcome =
  | {
      ok: true;
      httpStatus: 200;
      status: "paid";
      additionId: string;
      venueId: string | null;
      chargedTodayCents: number | null;
    }
  | { ok: true; httpStatus: 202; status: "requires_action"; additionId: string; hostedInvoiceUrl: string | null }
  | { ok: true; httpStatus: 202; status: "processing"; additionId: string }
  | AddVenueRefusal;

const refuse = (
  code: AddVenueFailureCode,
  httpStatus: number,
  extra: Omit<Partial<AddVenueRefusal>, "ok" | "code" | "httpStatus"> = {}
): AddVenueRefusal => ({ ok: false, httpStatus, code, ...extra, error: extra.error ?? ADD_VENUE_MESSAGES[code] });

/** Everything about the partner's bill that the quote and the add both need. */
export type AddVenueContext = {
  ownerId: string;
  bill: BillRow;
  subscription: Stripe.Subscription;
  item: Stripe.SubscriptionItem;
  /** How the bill is priced: the graduated bands, or an admin's negotiated per-venue rate (Phase 6). */
  rate: BillRate;
};

// --- Small helpers -------------------------------------------------------------------------------

export const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

type StripeErrorShape = { type?: string; statusCode?: number; code?: string; decline_code?: string; message?: string };

export const asStripeError = (error: unknown): StripeErrorShape =>
  typeof error === "object" && error !== null ? (error as StripeErrorShape) : {};

/**
 * Did Stripe definitely NOT apply the request? A 4xx (card error, invalid request, auth,
 * permission, rate limit, idempotency) is a refusal Stripe made before doing anything. A 5xx or a
 * connection failure is AMBIGUOUS: the request may have been applied, so nothing may be undone on
 * its strength — the row waits for its lease and is reconciled from Stripe's real state.
 */
export const isDefinitiveStripeRejection = (error: unknown): boolean => {
  const shape = asStripeError(error);
  if (shape.type === "StripeConnectionError" || shape.type === "StripeAPIError") return false;
  return typeof shape.statusCode === "number" && shape.statusCode >= 400 && shape.statusCode < 500;
};

export const isoFromUnix = (seconds: number | null | undefined): string | null =>
  typeof seconds === "number" && Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;

const idOf = (value: string | { id: string } | null | undefined): string | null =>
  typeof value === "string" ? value : value?.id ?? null;

export const discountOf = (bill: Pick<BillRow, "discount_percent_off" | "discount_amount_off_cents">): DisplayDiscount | null =>
  bill.discount_percent_off != null || bill.discount_amount_off_cents != null
    ? { percentOff: bill.discount_percent_off, amountOffCents: bill.discount_amount_off_cents }
    : null;

/** The bill's monthly total at `venueCount` venues on `rate`, after its discount — what the Billing page shows. */
const monthlyTotalAfterDiscount = (
  rate: BillRate,
  venueCount: number,
  bill: Pick<BillRow, "discount_percent_off" | "discount_amount_off_cents">
): number => effectiveAmountCents({ amountCents: rateMonthlyTotalCents(rate, venueCount), discount: discountOf(bill) });

/** The rate a subscription item's Price bills at (lib/venuePricing.ts `billRateFromPrice`), with this environment's ids. */
export const billRateOfItem = (item: Stripe.SubscriptionItem | null | undefined): BillRate | null =>
  billRateFromPrice(item?.price ?? null, {
    graduatedPriceId: getStripeGraduatedPriceId(),
    listPriceId: getStripePriceId(),
  });

/** Is this Stripe Price the graduated multi-venue Price (plan §4.1)? */
export const isGraduatedPrice = (price: Stripe.Price | null | undefined): boolean => {
  if (!price) return false;
  if (price.lookup_key === GRADUATED_PRICE_LOOKUP_KEY) return true;
  const configured = getStripeGraduatedPriceId();
  return configured !== "" && price.id === configured;
};

/** The one subscription item, or null when there is not exactly one. */
export const soleItem = (subscription: Stripe.Subscription): Stripe.SubscriptionItem | null => {
  const items = subscription.items?.data ?? [];
  return items.length === 1 ? items[0] : null;
};

export const itemQuantity = (subscription: Stripe.Subscription): number | null => {
  const quantity = soleItem(subscription)?.quantity;
  return typeof quantity === "number" && Number.isInteger(quantity) ? quantity : null;
};

/** Is a line on a preview/invoice a proration (current API shape, then the legacy flag)? */
const isProrationLine = (line: Stripe.InvoiceLineItem): boolean => {
  const nested = (line as unknown as { parent?: { subscription_item_details?: { proration?: boolean } | null } | null })
    .parent?.subscription_item_details?.proration;
  if (typeof nested === "boolean") return nested;
  return (line as unknown as { proration?: boolean }).proration === true;
};

/**
 * "Charged today" from a preview made with `proration_behavior: "always_invoice"`. Verified live
 * 2026-10-11 (read-only preview of Pacific Street): that preview holds ONLY the proration lines, so
 * its `amount_due` is the charge. If Stripe ever folds the next period in as well, sum the
 * proration lines instead of trusting the total.
 */
export const prorationDueCents = (preview: Pick<Stripe.Invoice, "amount_due" | "lines">): number => {
  const lines = preview.lines?.data ?? [];
  if (lines.every(isProrationLine)) return Math.max(0, preview.amount_due ?? 0);
  return Math.max(
    0,
    lines.filter(isProrationLine).reduce((sum, line) => sum + (line.amount ?? 0), 0)
  );
};

/**
 * A client `prorationDate` from the quote, if it is recent enough to honour: inside the current
 * period, not in the future (beyond a minute of clock skew), at most 15 minutes old. Anything
 * else is ignored and Stripe prorates at "now" — the few cents a stale quote could shift are not
 * worth a refusal, and a far-past date must never be accepted (it would shrink the charge).
 */
export const acceptableProrationDate = (
  value: unknown,
  periodStartSeconds: number | null | undefined,
  nowMs: number
): number | null => {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  const nowSeconds = Math.floor(nowMs / 1000);
  if (value > nowSeconds + 60) return null;
  if (value < nowSeconds - PRORATION_DATE_MAX_AGE_SECONDS) return null;
  if (typeof periodStartSeconds === "number" && value < periodStartSeconds) return null;
  return value;
};

export const isValidClientKey = (value: unknown): value is string =>
  typeof value === "string" && CLIENT_KEY_PATTERN.test(value);

/** The ledger key. Scoped to the owner so two partners' client keys can never collide. */
export const additionIdempotencyKey = (ownerId: string, clientKey: string): string =>
  `venue-add:${ownerId}:${clientKey}`;

// --- Input ---------------------------------------------------------------------------------------

/** What the partner typed on the add screens (address + map area) — signup's shape, minus the account. */
export type AddVenueInput = Pick<
  SignupDraft,
  "venueName" | "street" | "city" | "state" | "zipCode" | "placeId" | "latitude" | "longitude" | "radius"
>;

/**
 * `null`, or the reason this input cannot become a venue. The SAME rules signup applies to its
 * address and geofence screens (`signupStepIssue` in lib/selfServeSignup.ts — lengths, the
 * 50–200 m radius, a real pin), plus the two server-side checks signup makes: a name that can
 * produce a venue id, and never the (0, 0) placeholder point.
 */
export const addVenueInputIssue = (input: AddVenueInput): string | null => {
  const draft: SignupDraft = { ...BLANK_SIGNUP_DRAFT, ...input };
  const issue = signupStepIssue("address", draft) ?? signupStepIssue("geofence", draft);
  if (issue) return issue;
  if (!/[a-z0-9]/i.test(draft.venueName)) return "Add at least one letter or number to the venue name.";
  if (isPlaceholderVenueRow({ latitude: draft.latitude, longitude: draft.longitude })) {
    return "Set the pin — tap “Use my current location” while you're standing in the venue.";
  }
  return null;
};

/**
 * The request body as `AddVenueInput`, normalised exactly as POST /api/owner/signup normalises
 * the same fields (trimmed; state upper-cased). Coordinates go through explicit type guards
 * because `Number(null)` and `Number("")` are both 0 — the (0, 0) trap signup's `coordinate()`
 * documents; an unset pin must stay `null` so the geofence rule rejects it.
 */
export const addVenueInputFromBody = (body: Record<string, unknown>): AddVenueInput => {
  const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
  const coordinate = (value: unknown): number | null => {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };
  return {
    venueName: text(body.venueName),
    street: text(body.street),
    city: text(body.city),
    state: text(body.state).toUpperCase(),
    zipCode: text(body.zipCode),
    placeId: text(body.placeId),
    latitude: coordinate(body.latitude),
    longitude: coordinate(body.longitude),
    radius: typeof body.radius === "number" ? body.radius : Number(body.radius),
  };
};

/** A denied rate-limit claim as a refusal: 429, or 503 when the limiter itself is down (it fails closed). */
export const rateLimitRefusal = (result: RateLimitResult): AddVenueRefusal =>
  result.unavailable ? refuse("stripe_unavailable", 503) : refuse("rate_limited", 429);

/** JSON answer for an add / quote outcome or refusal. `no-store`: billing state, never cached. */
export const addVenueResponse = (
  outcome: AddVenueOutcome | { ok: true; httpStatus: 200; quote: AddVenueQuote },
  headers: Record<string, string> = {}
): Response => {
  const { httpStatus, ...body } = outcome;
  return new Response(JSON.stringify(body), {
    status: httpStatus,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
};

// --- Ledger I/O ------------------------------------------------------------------------------------

const readAdditionById = async (id: string): Promise<VenueAdditionRow | null> => {
  const { data, error } = await supabaseAdmin!
    .from(LEDGER)
    .select(ADDITION_COLUMNS)
    .eq("id", id)
    .maybeSingle<VenueAdditionRow>();
  if (error) throw new Error(`addition-read-failed: ${error.message}`);
  return data ?? null;
};

const readAdditionByKey = async (key: string): Promise<VenueAdditionRow | null> => {
  const { data, error } = await supabaseAdmin!
    .from(LEDGER)
    .select(ADDITION_COLUMNS)
    .eq("idempotency_key", key)
    .maybeSingle<VenueAdditionRow>();
  if (error) throw new Error(`addition-read-failed: ${error.message}`);
  return data ?? null;
};

/** Update a ledger row ONLY while it is in one of `fromStatuses`. Returns the new row, or null if it had moved on. */
const updateAddition = async (
  id: string,
  fromStatuses: readonly AdditionStatus[],
  patch: Partial<Omit<VenueAdditionRow, "id" | "idempotency_key" | "created_at" | "updated_at">>
): Promise<VenueAdditionRow | null> => {
  const { data, error } = await supabaseAdmin!
    .from(LEDGER)
    .update(patch)
    .eq("id", id)
    .in("status", [...fromStatuses])
    .select(ADDITION_COLUMNS)
    .returns<VenueAdditionRow[]>();
  if (error) throw new Error(`addition-write-failed: ${error.message}`);
  return (data ?? [])[0] ?? null;
};

const readBill = async (billId: string): Promise<BillRow | null> => {
  const { data, error } = await supabaseAdmin!
    .from("billing_subscriptions")
    .select(BILL_COLUMNS)
    .eq("id", billId)
    .maybeSingle<BillRow>();
  if (error) throw new Error(`bill-read-failed: ${error.message}`);
  return data ?? null;
};

// --- Context: which bill, and is it healthy? -----------------------------------------------------

/**
 * The partner's bill and its live Stripe subscription, or the reason they cannot add a venue to
 * it right now (plan §2: only an active card bill — not past_due, not cancelling, not
 * check-billed — and, from Phase 2's handoff, only one on the graduated Price; a custom-rate bill
 * waits for Phase 6).
 *
 * `preferredVenueId` is the venue the dashboard has selected; its bill is the one added to. With
 * none, the owner's single bill is used (and an owner with several separate bills must pick).
 */
export async function loadAddVenueContext(
  auth: OwnerAuthContext,
  preferredVenueId: string | null
): Promise<{ ok: true; context: AddVenueContext } | AddVenueRefusal> {
  if (!supabaseAdmin || !stripe) return refuse("stripe_unavailable", 503, { error: "Server configuration error." });

  const preferred = preferredVenueId?.trim() || null;
  if (preferred && !auth.venueIds.includes(preferred)) return refuse("forbidden", 403);

  const billing = await loadBillingForVenues<BillRow>(auth.venueIds, BILL_COLUMNS);
  if (!billing.ok) {
    console.error(`${LOG} bill-read-failed owner=${auth.ownerId}: ${billing.error}`);
    return refuse("stripe_unavailable", 503, { error: "Something went wrong. Please try again." });
  }

  let bill: BillRow | null = null;
  if (preferred) {
    bill = billing.byVenue.get(preferred) ?? null;
    if (!bill) return refuse("no_bill", 409);
    if (bill.owner_id !== auth.ownerId) return refuse("not_bill_owner", 403);
  } else {
    const all = Array.from(new Map(Array.from(billing.byVenue.values()).map((row) => [row.id, row])).values());
    const own = all.filter((row) => row.owner_id === auth.ownerId);
    if (own.length === 0) return all.length > 0 ? refuse("not_bill_owner", 403) : refuse("no_bill", 409);
    const live = own.filter((row) => row.status !== "cancelled");
    const candidates = live.length > 0 ? live : own;
    if (candidates.length > 1) return refuse("multiple_bills", 409);
    bill = candidates[0];
  }

  // Healthy-bill rule (plan §2). Deliberately STRICTER than classifyBillingRow's "live": a
  // past_due card is still a paying customer for visibility, but it must not take on more venues.
  if (bill.billing_method === "offline") return refuse("offline_bill", 409);
  if (bill.status !== "active") return refuse("bill_not_active", 409);
  if (bill.cancel_at_period_end) return refuse("cancel_scheduled", 409);
  if (!bill.stripe_subscription_id) return refuse("billing_state", 409);

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(bill.stripe_subscription_id);
  } catch (error) {
    console.error(`${LOG} subscription-read-failed bill=${bill.id}: ${errorText(error)}`);
    return refuse("stripe_unavailable", 503);
  }

  const checked = checkAddableSubscription(subscription);
  if (!checked.ok) return refuse(checked.code, 409);

  return { ok: true, context: { ownerId: auth.ownerId, bill, subscription, item: checked.item, rate: checked.rate } };
}

/**
 * The Stripe half of the healthy-bill rule, and the bill's rate — run on the context's read, and
 * again on the read `startVenueAddition` takes after its claim.
 */
const checkAddableSubscription = (
  subscription: Stripe.Subscription
): { ok: true; item: Stripe.SubscriptionItem; rate: BillRate } | { ok: false; code: AddVenueFailureCode } => {
  if (subscription.status !== "active") return { ok: false, code: "bill_not_active" };
  if (subscription.cancel_at_period_end || subscription.cancel_at) return { ok: false, code: "cancel_scheduled" };
  // Pending updates (and so this whole flow) need an automatically charged card subscription.
  if (subscription.collection_method !== "charge_automatically") return { ok: false, code: "billing_state" };
  // A schedule phase change would discard our pending update (Stripe docs, "Pending updates").
  if (subscription.schedule) return { ok: false, code: "billing_state" };

  const item = soleItem(subscription);
  if (!item) return { ok: false, code: "billing_state" };
  // The graduated bands, or (Phase 6, Andrew 2026-10-11) an admin's negotiated per-venue rate — a
  // flat `custom_monthly_<cents>` Price (lib/billingCustomPrice.ts), billed per venue. Anything else
  // (the old flat list Price, a hand-built Stripe price) needs a person.
  const rate = billRateOfItem(item);
  if (!rate) return { ok: false, code: "billing_state" };
  if (typeof item.quantity !== "number" || !Number.isInteger(item.quantity) || item.quantity < 1) {
    return { ok: false, code: "billing_state" };
  }
  return { ok: true, item, rate };
};

/**
 * Why the subscription as Stripe has it NOW — read after the claim — can't take this add, or its
 * item. Beyond the healthy-bill rule: the same item on the SAME Price the context priced (an admin's
 * rate change landing in between would charge a rate the partner was never shown), the venue count
 * the claim was sized from, and no other pending update (a new items update would void it).
 */
const postClaimCheck = (
  context: AddVenueContext,
  live: Stripe.Subscription,
  quantityBefore: number
): { ok: true; item: Stripe.SubscriptionItem } | { ok: false; issue: string } => {
  const checked = checkAddableSubscription(live);
  if (!checked.ok) return { ok: false, issue: checked.code };
  const { item } = checked;
  if (item.id !== context.item.id) return { ok: false, issue: "item-changed" };
  if (item.price?.id !== context.item.price?.id) return { ok: false, issue: "price-changed" };
  if (live.pending_update) return { ok: false, issue: "pending-update" };
  if (item.quantity !== quantityBefore) return { ok: false, issue: "quantity-drift" };
  return { ok: true, item };
};

// --- Quote ---------------------------------------------------------------------------------------

/**
 * What adding one venue to this bill costs (plan §2: "This venue: $75/mo · New monthly total:
 * $175 · Charged today: $37.50"). The "today" figure is Stripe's own preview, priced at
 * `prorationDate`, which the add sends back so the charge matches it to the cent.
 * One Stripe call (`invoices.createPreview`) — made only when the partner opens the review step.
 */
export async function quoteVenueAddition(
  context: AddVenueContext,
  nowMs: number = Date.now()
): Promise<{ ok: true; quote: AddVenueQuote } | AddVenueRefusal> {
  if (!stripe || !supabaseAdmin) return refuse("stripe_unavailable", 503);

  // Another add on this bill still waiting (most often a 3-D Secure the partner hasn't finished)
  // would refuse the add anyway — say so on the review screen, before they press Pay, with the
  // link to finish it. Dead attempts are settled first so they never block.
  let inFlight: ReconcileState | null = null;
  try {
    const settled = await settleStaleAdditionsForBill(context.bill.id, nowMs);
    const { data, error } = await supabaseAdmin
      .from(LEDGER)
      .select(ADDITION_COLUMNS)
      .eq("subscription_id", context.bill.id)
      .in("status", ["pending", "requires_action"])
      .limit(1)
      .returns<VenueAdditionRow[]>();
    if (error) throw new Error(error.message);
    const row = (data ?? [])[0];
    if (row) inFlight = settled.get(row.id) ?? { state: "in_flight", row };
  } catch (error) {
    console.error(`${LOG} quote-ledger-read-failed bill=${context.bill.id}: ${errorText(error)}`);
    return refuse("stripe_unavailable", 503, { error: "Something went wrong. Please try again." });
  }
  if (inFlight) {
    return refuse("addition_in_progress", 409, {
      additionId: inFlight.row.id,
      hostedInvoiceUrl: inFlight.state === "requires_action" ? inFlight.hostedInvoiceUrl : null,
    });
  }

  const currentVenueCount = context.item.quantity as number;
  const nowSeconds = Math.floor(nowMs / 1000);
  const periodStart = context.item.current_period_start;
  const prorationDate = typeof periodStart === "number" ? Math.max(nowSeconds, periodStart) : nowSeconds;

  let dueTodayCents: number;
  try {
    const preview = await stripe.invoices.createPreview({
      subscription: context.subscription.id,
      subscription_details: {
        items: [{ id: context.item.id, quantity: currentVenueCount + 1 }],
        proration_behavior: "always_invoice",
        proration_date: prorationDate,
      },
    });
    dueTodayCents = prorationDueCents(preview);
  } catch (error) {
    console.error(`${LOG} quote-preview-failed bill=${context.bill.id}: ${errorText(error)}`);
    return refuse("stripe_unavailable", 503);
  }

  const venueCount = currentVenueCount + 1;
  return {
    ok: true,
    quote: {
      currentVenueCount,
      venueNumber: venueCount,
      thisVenueCents: rateVenuePriceCents(context.rate, venueCount),
      newMonthlyListCents: rateMonthlyTotalCents(context.rate, venueCount),
      newMonthlyTotalCents: monthlyTotalAfterDiscount(context.rate, venueCount, context.bill),
      dueTodayCents,
      prorationDate,
      currentPeriodEnd: isoFromUnix(context.item.current_period_end),
      discountLabel: context.bill.discount_label ?? null,
    },
  };
}

// --- Stripe invoice inspection -------------------------------------------------------------------

type InvoiceState =
  | { kind: "paid"; amountPaidCents: number }
  | { kind: "void" }
  | { kind: "requires_action"; hostedInvoiceUrl: string | null; amountDueCents: number }
  | { kind: "declined"; reason: string; amountDueCents: number; hostedInvoiceUrl: string | null }
  | { kind: "unknown"; detail: string };

/** The invoice's newest PaymentIntent (API 2026-06-24: `invoice.payments[].payment.payment_intent`). */
const latestPaymentIntent = (invoice: Stripe.Invoice): Stripe.PaymentIntent | null => {
  const payments = [...(invoice.payments?.data ?? [])].sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  for (const payment of payments) {
    const intent = payment.payment?.payment_intent;
    if (intent && typeof intent === "object") return intent;
  }
  return null;
};

const declineReason = (intent: Stripe.PaymentIntent | null): string => {
  const failure = intent?.last_payment_error;
  return failure?.decline_code || failure?.code || (intent ? `payment_intent_${intent.status}` : "no_payment_attempt");
};

/** What Stripe says about the invoice an add created. Never throws (an unreachable Stripe is `unknown`). */
async function inspectInvoice(invoiceId: string): Promise<InvoiceState> {
  if (!stripe) return { kind: "unknown", detail: "stripe-unconfigured" };
  let invoice: Stripe.Invoice;
  try {
    invoice = await stripe.invoices.retrieve(invoiceId, { expand: ["payments.data.payment.payment_intent"] });
  } catch (error) {
    return { kind: "unknown", detail: `invoice-read-failed: ${errorText(error)}` };
  }
  return classifyInvoice(invoice);
}

export const classifyInvoice = (invoice: Stripe.Invoice): InvoiceState => {
  if (invoice.status === "paid") return { kind: "paid", amountPaidCents: invoice.amount_paid ?? 0 };
  if (invoice.status === "void" || invoice.status === "uncollectible") return { kind: "void" };
  if (invoice.status !== "open") return { kind: "unknown", detail: `invoice-status-${invoice.status ?? "null"}` };

  const intent = latestPaymentIntent(invoice);
  const amountDueCents = invoice.amount_due ?? 0;
  switch (intent?.status) {
    case "requires_action":
    case "requires_confirmation":
    case "processing":
    case "succeeded": // settling; the invoice flips to paid in a moment
      return { kind: "requires_action", hostedInvoiceUrl: invoice.hosted_invoice_url ?? null, amountDueCents };
    default:
      // requires_payment_method / canceled / no attempt at all (no usable card on file).
      return {
        kind: "declined",
        reason: declineReason(intent),
        amountDueCents,
        hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      };
  }
};

// --- Venue cleanup -------------------------------------------------------------------------------

/**
 * Delete the hidden venue an add created, after a definitive failure. Guarded like the signup
 * sweep: only a hidden, self-serve-stamped venue that has NEVER been on any bill. Anything else is
 * left alone and logged. Deleting the venue cascades its `venue_owner_venues` link and nulls the
 * ledger row's `venue_id` (ON DELETE SET NULL — the money history survives).
 */
async function deleteUnbilledAddedVenue(venueId: string): Promise<boolean> {
  const billed = await venueIdsEverBilled([venueId]);
  if (!billed.ok) {
    console.error(`${LOG} venue-cleanup-skipped venue=${venueId}: ${billed.error}`);
    return false;
  }
  if (billed.venueIds.has(venueId)) {
    // Expected for a declined "Add back" (Phase 5): the venue is the partner's own, with billing
    // history. Anything else here is drift worth a look.
    console.warn(`${LOG} venue-cleanup-skipped venue=${venueId} — it has billing history; kept`);
    return false;
  }
  const { data, error } = await supabaseAdmin!
    .from("venues")
    .delete()
    .eq("id", venueId)
    .eq("hidden", true)
    .not("self_serve_created_at", "is", null)
    .select("id")
    .returns<{ id: string }[]>();
  if (error) {
    console.error(`${LOG} venue-cleanup-failed venue=${venueId}: ${error.message}`);
    return false;
  }
  return (data ?? []).length > 0;
}

// --- Completion ----------------------------------------------------------------------------------

/**
 * The add was paid. Put the venue on the bill, show it to players, mark the ledger paid, send the
 * "Venue added" email once. Every step is idempotent, so the route, the webhook and the reconciler
 * may all call this for the same row (and in any order).
 *
 * Returns `ok: false` (never throws) when a step that matters failed — the ledger row is then left
 * as it was so the next caller retries. A reveal failure does NOT count: the daily reveal repair
 * (lib/venueVisibilitySync.ts) reveals any hidden self-serve venue on a live bill.
 */
async function completeAddition(
  row: VenueAdditionRow,
  invoice: { invoiceId: string | null; amountPaidCents: number | null }
): Promise<{ ok: true; row: VenueAdditionRow } | { ok: false; error: string }> {
  const paidPatch = {
    status: "paid" as const,
    failure_reason: null,
    ...(invoice.invoiceId ? { stripe_invoice_id: invoice.invoiceId } : {}),
    ...(invoice.amountPaidCents !== null ? { amount_due_cents: invoice.amountPaidCents } : {}),
  };

  if (!row.venue_id || !row.subscription_id) {
    // Paid for a venue that no longer exists (or a row with no bill). Should be impossible: the
    // venue is deleted only after its invoice is void. Recorded, never silently dropped — an
    // admin refunds or re-creates by hand.
    console.error(
      `${LOG} paid-but-venue-missing addition=${row.id} invoice=${invoice.invoiceId ?? row.stripe_invoice_id ?? "?"} — needs an admin`
    );
    const updated = await updateAddition(row.id, ["pending", "requires_action", "failed"], {
      ...paidPatch,
      failure_reason: "paid-but-venue-missing",
    });
    return { ok: true, row: updated ?? row };
  }

  const membership = await addVenueToBill(row.subscription_id, row.venue_id, "added");
  if (!membership.ok) {
    console.error(`${LOG} membership-write-failed addition=${row.id} venue=${row.venue_id}: ${membership.error}`);
    return { ok: false, error: membership.error };
  }

  if (row.owner_id) {
    const link = await ensureOwnerLink(row.owner_id, row.venue_id);
    if (!link.ok) {
      console.error(`${LOG} link-venue-failed addition=${row.id} venue=${row.venue_id}: ${link.error}`);
      return { ok: false, error: link.error };
    }
  }

  // Live to players the moment payment succeeds (plan §2 decision 8). Same filters as the
  // webhook's maybeRevealVenue: only a hidden, self-serve-stamped, non-(0,0) row; `rehidden_at`
  // is cleared in the same write (standing rule: whatever un-hides a venue clears it).
  const reveal = await supabaseAdmin!
    .from("venues")
    .update({ hidden: false, rehidden_at: null })
    .eq("id", row.venue_id)
    .eq("hidden", true)
    .not("self_serve_created_at", "is", null)
    .or("latitude.neq.0,longitude.neq.0")
    .select("id")
    .returns<{ id: string }[]>();
  if (reveal.error) {
    console.error(`${LOG} reveal-failed venue=${row.venue_id}: ${reveal.error.message} — the daily reveal repair will retry`);
  }
  // "Add back" (Phase 5) of a venue that is not self-serve-made (e.g. admin-activated): the daily
  // removal job hid it and stamped `rehidden_at` ("we hid this"), so un-hide exactly that — never a
  // venue an admin hid on purpose (no stamp). A brand-new venue has no stamp, so this is a no-op.
  const restore = await supabaseAdmin!
    .from("venues")
    .update({ hidden: false, rehidden_at: null })
    .eq("id", row.venue_id)
    .eq("hidden", true)
    .not("rehidden_at", "is", null)
    .or("latitude.neq.0,longitude.neq.0")
    .select("id")
    .returns<{ id: string }[]>();
  if (restore.error) {
    console.error(`${LOG} restore-failed venue=${row.venue_id}: ${restore.error.message}`);
  }

  const updated = await updateAddition(row.id, ["pending", "requires_action", "failed"], paidPatch);
  const finalRow = updated ?? (await readAdditionById(row.id)) ?? row;
  if (updated) {
    console.log(
      `${LOG} venue-added addition=${row.id} venue=${row.venue_id} bill=${row.subscription_id} ` +
        `quantity=${row.quantity_before ?? "?"}→${row.quantity_after ?? "?"}`
    );
  }
  await sendVenueAddedEmailOnce(finalRow);
  return { ok: true, row: finalRow };
}

/**
 * Give the partner the venue (`venue_owner_venues`) — on payment, never before. Idempotent: the
 * table is UNIQUE (venue_id) and (owner_id, venue_id), so a second completion's insert is a 23505,
 * which is fine when the existing link is this owner's and an error otherwise.
 */
export async function ensureOwnerLink(ownerId: string, venueId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const inserted = await supabaseAdmin!.from("venue_owner_venues").insert({ owner_id: ownerId, venue_id: venueId });
  if (!inserted.error) return { ok: true };
  if ((inserted.error as { code?: string }).code !== "23505") return { ok: false, error: inserted.error.message };
  const existing = await supabaseAdmin!
    .from("venue_owner_venues")
    .select("owner_id")
    .eq("venue_id", venueId)
    .returns<{ owner_id: string }[]>();
  if (existing.error) return { ok: false, error: existing.error.message };
  const owners = (existing.data ?? []).map((link) => link.owner_id);
  return owners.length > 0 && owners.every((owner) => owner === ownerId)
    ? { ok: true }
    : { ok: false, error: "venue-linked-to-another-owner" };
}

/**
 * The "Venue added" email, at most once per add. CLAIM-THEN-SEND: the stamp is taken first with a
 * conditional UPDATE (so the route and the webhook can't both send), and released again if the
 * send fails (so a later completion can retry). Never throws — an email problem must never undo
 * or fail a paid add.
 */
async function sendVenueAddedEmailOnce(row: VenueAdditionRow): Promise<void> {
  if (row.status !== "paid" || row.venue_added_email_sent_at || !row.owner_id || !row.subscription_id) return;
  const stamp = new Date().toISOString();
  try {
    const claimed = await supabaseAdmin!
      .from(LEDGER)
      .update({ venue_added_email_sent_at: stamp })
      .eq("id", row.id)
      .is("venue_added_email_sent_at", null)
      .select("id")
      .returns<{ id: string }[]>();
    if (claimed.error || (claimed.data ?? []).length === 0) return;

    const [owner, bill] = await Promise.all([
      supabaseAdmin!
        .from("venue_owners")
        .select("name, email")
        .eq("id", row.owner_id)
        .maybeSingle<{ name: string | null; email: string | null }>(),
      readBill(row.subscription_id),
    ]);
    const venueCount = row.quantity_after ?? 0;
    // The rate from our mirror (no Stripe call): graduated bands, or the bill's per-venue rate.
    const rate = bill ? billRateFromMirror(bill, getStripeGraduatedPriceId()) : null;
    const sent =
      Boolean(owner.data?.email) && bill !== null && rate !== null && venueCount >= 1
        ? await sendVenueAddedEmail({
            toEmail: owner.data?.email ?? "",
            ownerName: owner.data?.name ?? "",
            venueName: row.venue_name ?? "",
            venueCount,
            thisVenueCents: rateVenuePriceCents(rate, venueCount),
            newMonthlyTotalCents: monthlyTotalAfterDiscount(rate, venueCount, bill),
            chargedTodayCents: row.amount_due_cents,
          })
        : false;

    if (!sent) {
      await supabaseAdmin!
        .from(LEDGER)
        .update({ venue_added_email_sent_at: null })
        .eq("id", row.id)
        .eq("venue_added_email_sent_at", stamp);
    }
  } catch (error) {
    console.error(`${LOG} venue-added-email-failed addition=${row.id}: ${errorText(error)}`);
  }
}

// --- Failure -------------------------------------------------------------------------------------

/**
 * End an add that will not be paid: void its invoice (Stripe's way of cancelling a pending
 * update) when asked, delete the hidden venue, mark the ledger `failed`.
 *
 * If the void fails, the invoice is re-read: already void → carry on; PAID → it is completed
 * instead (the partner paid; they get the venue); anything else → the venue is KEPT (still
 * hidden and sweepable) and the row is marked failed with `void-failed`, because deleting a venue
 * whose invoice can still be paid is how a partner ends up charged for nothing.
 */
async function failAddition(
  row: VenueAdditionRow,
  reason: string,
  options: { voidInvoice: boolean }
): Promise<{ state: "failed"; row: VenueAdditionRow } | { state: "paid"; row: VenueAdditionRow }> {
  let keepVenue = false;
  let finalReason = reason;

  if (options.voidInvoice && row.stripe_invoice_id && stripe) {
    try {
      await stripe.invoices.voidInvoice(row.stripe_invoice_id);
    } catch (error) {
      const after = await inspectInvoice(row.stripe_invoice_id);
      if (after.kind === "paid") {
        const completed = await completeAddition(row, {
          invoiceId: row.stripe_invoice_id,
          amountPaidCents: after.amountPaidCents,
        });
        if (completed.ok) return { state: "paid", row: completed.row };
        keepVenue = true;
      } else if (after.kind !== "void") {
        keepVenue = true;
        finalReason = `${reason}; void-failed`;
        console.error(
          `${LOG} void-failed addition=${row.id} invoice=${row.stripe_invoice_id}: ${errorText(error)} — venue kept (hidden, sweepable)`
        );
      }
    }
  }

  if (row.venue_id && !keepVenue) await deleteUnbilledAddedVenue(row.venue_id);

  const updated = await updateAddition(row.id, ["pending", "requires_action"], {
    status: "failed",
    failure_reason: finalReason.slice(0, 500),
  });
  console.warn(`${LOG} addition-failed addition=${row.id} reason=${finalReason}`);
  return { state: "failed", row: updated ?? (await readAdditionById(row.id)) ?? row };
}

// --- Reconciliation ------------------------------------------------------------------------------

export type ReconcileState =
  | { state: "paid"; row: VenueAdditionRow }
  | { state: "failed"; row: VenueAdditionRow }
  | { state: "requires_action"; row: VenueAdditionRow; hostedInvoiceUrl: string | null }
  | { state: "in_flight"; row: VenueAdditionRow }
  | { state: "unknown"; row: VenueAdditionRow; detail: string };

/**
 * Bring a ledger row up to date with what Stripe knows. Terminal rows are returned as they are; a
 * `pending` row inside its lease is left to the request that owns it. Otherwise:
 *
 *   - with an invoice id: paid → complete; void → fail; open + 3-D Secure → requires_action;
 *     open + declined → fail (voiding it) for a `pending` row, but a `requires_action` row keeps
 *     waiting — the partner may still be on Stripe's page trying another card, and Stripe voids
 *     it at expiry anyway.
 *   - without one (the request died around the Stripe call): read the subscription. The new
 *     quantity applied with no pending update → it was paid; a pending update → its invoice is
 *     the add's, carry on as above; the old quantity and no pending update → it never reached
 *     Stripe (or was discarded): fail. Any other quantity is drift: failed, venue kept, logged.
 */
export async function reconcileAddition(row: VenueAdditionRow, nowMs: number = Date.now()): Promise<ReconcileState> {
  if (row.status === "paid") return { state: "paid", row };
  if (row.status === "failed") return { state: "failed", row };
  if (row.status === "pending" && nowMs - Date.parse(row.updated_at) < VENUE_ADDITION_LEASE_MS) {
    return { state: "in_flight", row };
  }
  if (!stripe) return { state: "unknown", row, detail: "stripe-unconfigured" };

  let current = row;
  if (!current.stripe_invoice_id) {
    if (!current.subscription_id) return failAddition(current, "no-bill", { voidInvoice: false });
    const bill = await readBill(current.subscription_id);
    if (!bill?.stripe_subscription_id) return failAddition(current, "bill-has-no-subscription", { voidInvoice: false });

    let subscription: Stripe.Subscription;
    try {
      subscription = await stripe.subscriptions.retrieve(bill.stripe_subscription_id);
    } catch (error) {
      return { state: "unknown", row: current, detail: `subscription-read-failed: ${errorText(error)}` };
    }
    const quantity = itemQuantity(subscription);
    const latestInvoiceId = idOf(subscription.latest_invoice);

    if (!subscription.pending_update && quantity === current.quantity_after) {
      // With pending_if_incomplete the new quantity only exists once the invoice is paid; read it
      // only for the amount (the email's "charged today").
      const paid = latestInvoiceId ? await inspectInvoice(latestInvoiceId) : null;
      const completed = await completeAddition(current, {
        invoiceId: latestInvoiceId,
        amountPaidCents: paid?.kind === "paid" ? paid.amountPaidCents : null,
      });
      return completed.ok ? { state: "paid", row: completed.row } : { state: "unknown", row: current, detail: completed.error };
    }
    if (!subscription.pending_update && quantity === current.quantity_before) {
      return failAddition(current, "stripe-update-not-applied", { voidInvoice: false });
    }
    if (!subscription.pending_update || quantity !== current.quantity_before || !latestInvoiceId) {
      console.error(
        `${LOG} reconcile-quantity-drift addition=${current.id} stripeQuantity=${quantity ?? "?"} ` +
          `expected=${current.quantity_before ?? "?"}→${current.quantity_after ?? "?"} pendingUpdate=${Boolean(subscription.pending_update)}`
      );
      const updated = await updateAddition(current.id, ["pending", "requires_action"], {
        status: "failed",
        failure_reason: "reconcile-quantity-drift",
      });
      return { state: "failed", row: updated ?? current };
    }
    const stamped = await updateAddition(current.id, ["pending", "requires_action"], { stripe_invoice_id: latestInvoiceId });
    current = stamped ?? { ...current, stripe_invoice_id: latestInvoiceId };
  }

  const invoiceId = current.stripe_invoice_id as string;
  const invoice = await inspectInvoice(invoiceId);
  switch (invoice.kind) {
    case "paid": {
      const completed = await completeAddition(current, { invoiceId, amountPaidCents: invoice.amountPaidCents });
      return completed.ok ? { state: "paid", row: completed.row } : { state: "unknown", row: current, detail: completed.error };
    }
    case "void":
      return failAddition(current, "invoice-void", { voidInvoice: false });
    case "requires_action": {
      const updated =
        current.status === "requires_action"
          ? current
          : await updateAddition(current.id, ["pending"], {
              status: "requires_action",
              amount_due_cents: invoice.amountDueCents,
            });
      return { state: "requires_action", row: updated ?? current, hostedInvoiceUrl: invoice.hostedInvoiceUrl };
    }
    case "declined":
      if (current.status === "requires_action") {
        return { state: "requires_action", row: current, hostedInvoiceUrl: invoice.hostedInvoiceUrl };
      }
      return failAddition(current, `card_declined: ${invoice.reason}`, { voidInvoice: true });
    default:
      return { state: "unknown", row: current, detail: invoice.detail };
  }
}

/** A reconcile result as the route's answer. */
const outcomeFromState = (result: ReconcileState): AddVenueOutcome => {
  const { row } = result;
  switch (result.state) {
    case "paid":
      return {
        ok: true,
        httpStatus: 200,
        status: "paid",
        additionId: row.id,
        venueId: row.venue_id,
        chargedTodayCents: row.amount_due_cents,
      };
    case "requires_action":
      return { ok: true, httpStatus: 202, status: "requires_action", additionId: row.id, hostedInvoiceUrl: result.hostedInvoiceUrl };
    case "in_flight":
      return { ok: true, httpStatus: 202, status: "processing", additionId: row.id };
    case "unknown":
      return refuse("payment_unconfirmed", 503, { additionId: row.id });
    case "failed":
      return refusalForFailedRow(row);
  }
};

/** The failure codes a ledger row can record as `refused:<code>` (refusals made after the claim). */
const RECORDED_REFUSALS: readonly AddVenueFailureCode[] = [
  "venue_already_yours",
  "venue_exists",
  "venue_unavailable",
  "billing_state",
];

/** A `failed` row as the answer to a retry of the same request. */
const refusalForFailedRow = (row: VenueAdditionRow): AddVenueRefusal => {
  const reason = row.failure_reason ?? "";
  if (reason.startsWith("card_declined")) return refuse("card_declined", 402, { additionId: row.id });
  const recorded = RECORDED_REFUSALS.find((code) => reason === `refused:${code}`);
  return recorded ? refuse(recorded, 409, { additionId: row.id }) : refuse("addition_failed", 409, { additionId: row.id });
};

// --- The add -------------------------------------------------------------------------------------

type ClaimRpcRow = {
  outcome: "claimed" | "existing" | "busy" | "key_conflict" | "not_owner" | "no_bill" | "invalid";
  addition_id: string | null;
  addition_status: AdditionStatus | null;
  addition_invoice_id: string | null;
};

const isMissingFunction = (error: { code?: string; message?: string }): boolean =>
  error.code === "PGRST202" || error.code === "42883" || (error.message ?? "").includes("claim_venue_addition");

async function claimAddition(
  key: string,
  ownerId: string,
  billId: string,
  venueName: string
): Promise<{ ok: true; claim: ClaimRpcRow } | AddVenueRefusal> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await supabaseAdmin!.rpc("claim_venue_addition", {
      p_idempotency_key: key,
      p_owner_id: ownerId,
      p_subscription_id: billId,
      p_venue_name: venueName,
    });
    if (error) {
      // A unique violation means the same key was claimed on another bill's lock at the same
      // moment; the second pass reads it back as `existing` / `key_conflict`.
      if ((error as { code?: string }).code === "23505" && attempt === 0) continue;
      if (isMissingFunction(error)) {
        console.error(`${LOG} claim_venue_addition-missing — apply supabase/migrations/20261011153607_venue_addition_claim.sql`);
      } else {
        console.error(`${LOG} claim-failed bill=${billId}: ${error.message}`);
      }
      return refuse("stripe_unavailable", 503, { error: "Something went wrong. Please try again." });
    }
    const row = (Array.isArray(data) ? data[0] : data) as ClaimRpcRow | null;
    if (!row || typeof row.outcome !== "string") {
      console.error(`${LOG} claim-malformed-response bill=${billId}`);
      return refuse("stripe_unavailable", 503, { error: "Something went wrong. Please try again." });
    }
    return { ok: true, claim: row };
  }
  return refuse("stripe_unavailable", 503, { error: "Something went wrong. Please try again." });
}

/**
 * Settle any add on this bill that has been in flight longer than it should — so a partner who
 * comes back after a crash or an expired 3-D Secure isn't blocked by (or told "you already have")
 * the venue their own dead attempt left behind. At most a handful of rows; usually none.
 */
async function settleStaleAdditionsForBill(billId: string, nowMs: number): Promise<Map<string, ReconcileState>> {
  const settled = new Map<string, ReconcileState>();
  const { data, error } = await supabaseAdmin!
    .from(LEDGER)
    .select(ADDITION_COLUMNS)
    .eq("subscription_id", billId)
    .in("status", ["pending", "requires_action"])
    .order("created_at", { ascending: true })
    .limit(5)
    .returns<VenueAdditionRow[]>();
  if (error) throw new Error(`addition-read-failed: ${error.message}`);
  for (const row of data ?? []) {
    if (row.status === "pending" && nowMs - Date.parse(row.updated_at) < VENUE_ADDITION_LEASE_MS) continue;
    settled.set(row.id, await reconcileAddition(row, nowMs));
  }
  return settled;
}

export type StartVenueAdditionArgs = {
  auth: OwnerAuthContext;
  context: AddVenueContext;
  /** The new venue's details. Ignored for an "Add back" (`readdVenueId`). */
  input: AddVenueInput;
  /**
   * "Add back" (Phase 5): put one of the partner's own venues, taken off THIS bill earlier, back on
   * it — same charge, same ledger, same completion; no new venue is created.
   */
  readdVenueId?: string | null;
  /**
   * Admin "Add to their bill" (Phase 6, lib/adminVenueAttach.ts): an EXISTING venue an admin
   * activated, already vetted by that module (visible, unowned or this owner's, never billed). Same
   * charge, ledger and completion as an Add back — no venue is created, and the partner is linked
   * to it only once paid. A declined charge never deletes it (`deleteUnbilledAddedVenue` only
   * deletes hidden, self-serve-stamped venues).
   */
  adminAttachVenue?: { id: string; name: string } | null;
  clientKey: string;
  /** From the quote; honoured only if recent (see `acceptableProrationDate`). */
  prorationDate: unknown;
  nowMs?: number;
};

/**
 * May this venue be added BACK to this bill? Only the partner's own venue, whose membership row is
 * on this same bill and has left it (taken off, or past its `remove_at`). A venue still set to leave
 * is an Undo (free), not an add; one on another bill, or never billed (e.g. a test venue linked to
 * the partner), is not addable here.
 */
async function readdableVenue(
  auth: OwnerAuthContext,
  billId: string,
  venueId: string,
  nowMs: number
): Promise<{ ok: true; venue: { id: string; name: string } } | AddVenueRefusal> {
  if (!auth.venueIds.includes(venueId)) return refuse("forbidden", 403);
  const membership = await billMembershipOf(venueId);
  if (!membership.ok) throw new Error(membership.error);
  const row = membership.row;
  if (!row || row.subscription_id !== billId) return refuse("venue_unavailable", 409);
  if (isBilledMembership(row)) return refuse("venue_already_yours", 409);
  if (!hasLeftBill(row, nowMs)) return refuse("readd_use_undo", 409);

  const { data, error } = await supabaseAdmin!
    .from("venues")
    .select("id, name")
    .eq("id", venueId)
    .maybeSingle<{ id: string; name: string | null }>();
  if (error) throw new Error(`venue-read-failed: ${error.message}`);
  if (!data) return refuse("venue_unavailable", 409);
  return { ok: true, venue: { id: data.id, name: (data.name ?? "").trim() || data.id } };
}

/**
 * Add a venue to the partner's bill (plan §4.3). The caller has already checked the flag, the
 * session, the rate limit, the input (`addVenueInputIssue`, skipped for an Add back) and the bill
 * (`loadAddVenueContext`).
 */
export async function startVenueAddition(args: StartVenueAdditionArgs): Promise<AddVenueOutcome> {
  const { auth, context, input } = args;
  const nowMs = args.nowMs ?? Date.now();
  if (!supabaseAdmin || !stripe) return refuse("stripe_unavailable", 503, { error: "Server configuration error." });
  if (!isValidClientKey(args.clientKey)) return refuse("invalid_request", 400);

  const key = additionIdempotencyKey(auth.ownerId, args.clientKey);

  try {
    // 1. This exact request again (double-tap, retry, a poll after 3-D Secure): answer with the
    //    row it already started — BEFORE the duplicate-address check, which would otherwise find
    //    the very venue this request created.
    const previous = await readAdditionByKey(key);
    if (previous) {
      if (previous.owner_id !== auth.ownerId) return refuse("invalid_request", 400);
      return outcomeFromState(await reconcileAddition(previous, nowMs));
    }

    // 1b. Add back / admin attach: which existing venue (checked before anything is claimed).
    let readd: { id: string; name: string } | null = args.adminAttachVenue ?? null;
    if (!readd && args.readdVenueId) {
      const checked = await readdableVenue(auth, context.bill.id, args.readdVenueId, nowMs);
      if (!checked.ok) return checked;
      readd = checked.venue;
    }

    // 2. Clear out this bill's dead attempts first (see settleStaleAdditionsForBill).
    const settled = await settleStaleAdditionsForBill(context.bill.id, nowMs);

    // 3. Claim (advisory-locked; one add in flight per bill; same key → same row). Claimed BEFORE
    //    the duplicate-address check on purpose: a double-tap whose twin has already created its
    //    venue must come back as "that same add", never as "you already have a venue there".
    const claimed = await claimAddition(key, auth.ownerId, context.bill.id, readd ? readd.name : input.venueName.trim());
    if (!claimed.ok) return claimed;
    const { claim } = claimed;
    switch (claim.outcome) {
      case "claimed":
        break;
      case "existing": {
        const existing = claim.addition_id ? await readAdditionById(claim.addition_id) : null;
        if (!existing) return refuse("addition_failed", 409);
        return outcomeFromState(await reconcileAddition(existing, nowMs));
      }
      case "busy": {
        const other = claim.addition_id ? settled.get(claim.addition_id) : undefined;
        return refuse("addition_in_progress", 409, {
          additionId: claim.addition_id ?? undefined,
          hostedInvoiceUrl: other?.state === "requires_action" ? other.hostedInvoiceUrl : null,
        });
      }
      case "not_owner":
        return refuse("not_bill_owner", 403);
      case "key_conflict":
        return refuse("invalid_request", 400);
      default:
        return refuse("no_bill", 409);
    }

    let row = claim.addition_id ? await readAdditionById(claim.addition_id) : null;
    if (!row || row.quantity_before === null || row.quantity_after === null) {
      return refuse("addition_failed", 409);
    }

    // 4. Re-read Stripe now that the bill is claimed (Phase 6.1). Remove / Undo and the admin's
    //    price swap claim under the same lock, so nothing else can move this subscription until
    //    this row is closed: this read — not the pre-claim context — is what the charge is checked
    //    against and made from (`postClaimCheck`). Refuse rather than "fix".
    let live: Stripe.Subscription;
    try {
      live = await stripe.subscriptions.retrieve(context.subscription.id);
    } catch (error) {
      console.error(`${LOG} subscription-reread-failed addition=${row.id}: ${errorText(error)}`);
      await failAddition(row, "subscription-read-failed", { voidInvoice: false });
      return refuse("stripe_unavailable", 503, { additionId: row.id });
    }
    const checked = postClaimCheck(context, live, row.quantity_before);
    if (!checked.ok) {
      console.error(
        `${LOG} refused-after-claim addition=${row.id} bill=${context.bill.id} issue=${checked.issue} ` +
          `stripe=${itemQuantity(live) ?? "?"} billed=${row.quantity_before} pendingUpdate=${Boolean(live.pending_update)}`
      );
      await failAddition(row, "refused:billing_state", { voidInvoice: false });
      return refuse("billing_state", 409, { additionId: row.id });
    }
    const liveItem = checked.item;

    // 5–6 (Add back). The venue already exists and is the partner's: record it, skip the address
    //    scan and the venue insert. It stays as it is (hidden by the removal job) until paid.
    if (readd) {
      const recorded = await updateAddition(row.id, ["pending"], { venue_id: readd.id });
      row = recorded ?? { ...row, venue_id: readd.id };
    } else {
      // 5. Never a second venue row at an address we already hold (same scan and predicates as
      //    signup — lib/nearbyVenue.ts, lib/venueClaim.ts).
      const latitude = input.latitude as number;
      const longitude = input.longitude as number;
      const nearby = await findNearbyVenue(latitude, longitude);
      if (nearby) {
        const venue = { id: nearby.id, name: (nearby.name ?? "").trim() || nearby.id, address: venueAddressLabel(nearby) };
        const code: AddVenueFailureCode = auth.venueIds.includes(nearby.id)
          ? "venue_already_yours"
          : isAdminHiddenVenueRow(nearby)
            ? "venue_unavailable"
            : "venue_exists";
        await failAddition(row, `refused:${code}`, { voidInvoice: false });
        return refuse(code, 409, { venue, additionId: row.id });
      }

      // 6. The venue: hidden, and stamped in the same insert (reveal + sweep).
      const stampedAt = new Date(nowMs).toISOString();
      let venueId: string;
      try {
        const venue = await createAdminVenue({
          name: input.venueName.trim(),
          street: input.street.trim(),
          city: input.city.trim(),
          state: input.state.trim().toUpperCase(),
          zipCode: input.zipCode.trim(),
          country: DEFAULT_VENUE_COUNTRY,
          placeId: input.placeId.trim(),
          latitude,
          longitude,
          radius: input.radius,
          hidden: true,
          selfServeCreatedAt: stampedAt,
          checkoutStartedAt: stampedAt,
        });
        venueId = venue.id;
      } catch (error) {
        console.error(`${LOG} create-venue-failed addition=${row.id}: ${errorText(error)}`);
        await failAddition(row, "create-venue-failed", { voidInvoice: false });
        return refuse("addition_failed", 500);
      }

      // NOT linked to the partner yet: the `venue_owner_venues` row is written by completeAddition,
      // once the charge has succeeded, so a partner never sees (or configures) a venue they have not
      // paid for — and a declined / abandoned add has no link to undo.
      const recorded = await updateAddition(row.id, ["pending"], { venue_id: venueId });
      row = recorded ?? { ...row, venue_id: venueId };
    }

    // 7. Charge: Stripe applies quantity n + 1 ONLY if the prorated invoice is paid.
    const prorationDate = acceptableProrationDate(args.prorationDate, liveItem.current_period_start, nowMs);
    let updated: Stripe.Subscription;
    try {
      updated = await stripe.subscriptions.update(
        context.subscription.id,
        {
          items: [{ id: liveItem.id, quantity: row.quantity_after as number }],
          proration_behavior: "always_invoice",
          payment_behavior: "pending_if_incomplete",
          ...(prorationDate !== null ? { proration_date: prorationDate } : {}),
          expand: ["latest_invoice"],
        },
        { idempotencyKey: row.idempotency_key }
      );
    } catch (error) {
      const shape = asStripeError(error);
      if (isDefinitiveStripeRejection(error)) {
        const declined = shape.type === "StripeCardError";
        const result = await failAddition(
          row,
          declined ? `card_declined: ${shape.decline_code ?? shape.code ?? "card_error"}` : `stripe-rejected: ${shape.code ?? shape.type ?? "unknown"}`,
          { voidInvoice: false }
        );
        if (result.state === "paid") return outcomeFromState(result);
        if (!declined) console.error(`${LOG} stripe-update-rejected addition=${row.id}: ${shape.message ?? ""}`);
        return declined ? refuse("card_declined", 402, { additionId: row.id }) : refuse("addition_failed", 502, { additionId: row.id });
      }
      // Ambiguous — it may have gone through. Leave the row pending; its lease runs out and it is
      // reconciled from Stripe (a retry of this same request, the next add, or the daily cron).
      console.error(`${LOG} stripe-update-ambiguous addition=${row.id}: ${shape.message ?? errorText(error)}`);
      return refuse("payment_unconfirmed", 503, { additionId: row.id });
    }

    // 8. Read the outcome.
    const invoiceObject = typeof updated.latest_invoice === "object" ? updated.latest_invoice : null;
    const invoiceId = idOf(updated.latest_invoice);
    if (invoiceId) {
      const stamped = await updateAddition(row.id, ["pending"], { stripe_invoice_id: invoiceId });
      row = stamped ?? { ...row, stripe_invoice_id: invoiceId };
    }

    if (!updated.pending_update && itemQuantity(updated) === row.quantity_after) {
      const completed = await completeAddition(row, {
        invoiceId,
        amountPaidCents: invoiceObject?.status === "paid" ? invoiceObject.amount_paid ?? null : null,
      });
      if (!completed.ok) return { ok: true, httpStatus: 202, status: "processing", additionId: row.id };
      return outcomeFromState({ state: "paid", row: completed.row });
    }

    if (updated.pending_update && invoiceId) {
      const invoice = await inspectInvoice(invoiceId);
      if (invoice.kind === "requires_action") {
        const waiting = await updateAddition(row.id, ["pending"], {
          status: "requires_action",
          amount_due_cents: invoice.amountDueCents,
        });
        console.log(`${LOG} requires-action addition=${row.id} invoice=${invoiceId}`);
        return {
          ok: true,
          httpStatus: 202,
          status: "requires_action",
          additionId: (waiting ?? row).id,
          hostedInvoiceUrl: invoice.hostedInvoiceUrl,
        };
      }
      if (invoice.kind === "declined") {
        const result = await failAddition(row, `card_declined: ${invoice.reason}`, { voidInvoice: true });
        return result.state === "paid" ? outcomeFromState(result) : refuse("card_declined", 402, { additionId: row.id });
      }
      if (invoice.kind === "paid") {
        const completed = await completeAddition(row, { invoiceId, amountPaidCents: invoice.amountPaidCents });
        if (completed.ok) return outcomeFromState({ state: "paid", row: completed.row });
      }
    }

    // Anything else (no invoice, an unexpected quantity) is left pending for reconciliation.
    console.error(
      `${LOG} stripe-update-unexpected addition=${row.id} pendingUpdate=${Boolean(updated.pending_update)} ` +
        `quantity=${itemQuantity(updated) ?? "?"} invoice=${invoiceId ?? "none"}`
    );
    return { ok: true, httpStatus: 202, status: "processing", additionId: row.id };
  } catch (error) {
    // A database read/write failed somewhere above. Whatever was claimed stays in the ledger and
    // is reconciled later; nothing here is undone on a guess.
    console.error(`${LOG} add-failed owner=${auth.ownerId}: ${errorText(error)}`);
    return refuse("addition_failed", 500, { error: "Something went wrong. Please try again." });
  }
}

// --- Webhook + cron entry points -----------------------------------------------------------------

/** Invoices that can never be an add's proration invoice: monthly renewals and first invoices. */
const NEVER_AN_ADDITION_INVOICE = new Set<string>(["subscription_cycle", "subscription_create"]);

/**
 * `invoice.paid` (app/api/webhooks/stripe/route.ts): if this invoice belongs to an add, finish it.
 * An add's invoice is a proration invoice from a subscription update; renewals and first invoices
 * are skipped without a query. (Skip-list rather than "only `subscription_update`" on purpose: a
 * mislabelled add invoice must still be completed here, not a day later by the cron.)
 * THROWS on a database failure, so the webhook 500s and Stripe retries.
 */
export async function completeVenueAdditionForInvoice(
  invoice: Pick<Stripe.Invoice, "id" | "billing_reason" | "amount_paid">
): Promise<void> {
  if (!supabaseAdmin || !invoice.id) return;
  if (invoice.billing_reason && NEVER_AN_ADDITION_INVOICE.has(invoice.billing_reason)) return;

  const { data, error } = await supabaseAdmin
    .from(LEDGER)
    .select(ADDITION_COLUMNS)
    .eq("stripe_invoice_id", invoice.id)
    .maybeSingle<VenueAdditionRow>();
  if (error) throw new Error(`venue-addition lookup failed: ${error.message}`);
  const row = data ?? null;
  if (!row) return;

  if (row.status === "paid") {
    await sendVenueAddedEmailOnce(row);
    return;
  }
  const completed = await completeAddition(row, { invoiceId: invoice.id, amountPaidCents: invoice.amount_paid ?? null });
  if (!completed.ok) throw new Error(`venue-addition completion failed: ${completed.error}`);
}

export type VenueAdditionReconcileResult = {
  dryRun: boolean;
  scanned: number;
  paid: number;
  failed: number;
  waiting: number;
  errors: string[];
};

/**
 * Daily (`/api/cron/billing`): settle every add stuck past its lease — a 3-D Secure the partner
 * never finished (Stripe voids it at 23 h → we delete the hidden venue), a request that died
 * mid-charge, a webhook that never came. One bounded ledger read; one or two Stripe reads per row
 * found (normally zero rows).
 */
export async function reconcileStaleVenueAdditions(
  options: { dryRun?: boolean; nowMs?: number } = {}
): Promise<VenueAdditionReconcileResult> {
  const dryRun = options.dryRun ?? false;
  const nowMs = options.nowMs ?? Date.now();
  const result: VenueAdditionReconcileResult = { dryRun, scanned: 0, paid: 0, failed: 0, waiting: 0, errors: [] };
  if (!supabaseAdmin) {
    result.errors.push("supabase-admin-unconfigured");
    return result;
  }

  const { data, error } = await supabaseAdmin
    .from(LEDGER)
    .select(ADDITION_COLUMNS)
    .in("status", ["pending", "requires_action"])
    .lt("updated_at", new Date(nowMs - VENUE_ADDITION_LEASE_MS).toISOString())
    .order("updated_at", { ascending: true })
    .limit(VENUE_ADDITION_RECONCILE_LIMIT)
    .returns<VenueAdditionRow[]>();
  if (error) {
    result.errors.push(`addition-read-failed: ${error.message}`);
    return result;
  }

  for (const row of data ?? []) {
    result.scanned += 1;
    if (dryRun) {
      console.log(`${LOG} reconcile DRY RUN addition=${row.id} status=${row.status} updated=${row.updated_at}`);
      continue;
    }
    try {
      const settled = await reconcileAddition(row, nowMs);
      if (settled.state === "paid") result.paid += 1;
      else if (settled.state === "failed") result.failed += 1;
      else {
        result.waiting += 1;
        if (settled.state === "unknown") result.errors.push(`addition=${row.id}: ${settled.detail}`);
      }
    } catch (rowError) {
      result.errors.push(`addition=${row.id}: ${errorText(rowError)}`);
    }
  }
  return result;
}
