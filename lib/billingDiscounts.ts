import "server-only";
import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripe, OFFLINE_BILLING_METHOD } from "@/lib/stripe";

/**
 * Phase 2 of docs/billing-discounts-plan.md — the Stripe discount helpers that
 * every later phase (admin route, admin UI, webhook sync) builds on.
 *
 * Three of the four discount types are Stripe **Coupons** and live here:
 *   N free months  → percent_off: 100, duration: repeating, duration_in_months: N
 *   Percent off    → percent_off: X,   duration: once | repeating | forever
 *   Fixed $ off    → amount_off: X (cents), currency: usd, same durations
 * The fourth (permanent custom price) is NOT a coupon — it is a Price swap on the
 * subscription item — and deliberately does not appear in this module.
 *
 * Return shape mirrors lib/billing.ts's CancelResult so routes stay uniform.
 *
 * THE OFFLINE CARVE-OUT IS LOAD-BEARING. A check-billed row has no Stripe
 * objects at all (see BillingMethod in lib/stripe.ts), so there is nothing to
 * attach a coupon to. Those rows take a local path instead.
 *
 * THE OFFLINE PATH IS MIRROR-ONLY: it never rewrites amount_cents. That column
 * stays the partner's list rate and the mirror carries the discount, so every
 * reader computes the net the same way it does for a Stripe row. Writing the net
 * back into amount_cents (the original Phase 2 design) broke four ways at once —
 * `duration` became unenforceable, a second apply compounded off the already-
 * reduced number, removal had nothing to restore from, and the next grant-manual
 * silently overwrote the discount while the mirror still advertised it. The one
 * exception is free_months, which is not a rate change at all: it pushes
 * current_period_end forward and mirrors only a label + end date.
 */

export type DiscountDuration = "once" | "repeating" | "forever";

/**
 * The three coupon-backed grant types. `free_months` is modeled separately from
 * `percent_off` even though it compiles down to a 100%-off repeating coupon,
 * because that is how an admin thinks about it and how the audit trail
 * (billing_discount_grants.discount_type) records it.
 */
export type DiscountSpec =
  | { type: "free_months"; months: number }
  | {
      type: "percent_off";
      percentOff: number;
      duration: DiscountDuration;
      durationInMonths?: number | null;
    }
  | {
      type: "amount_off";
      amountOffCents: number;
      duration: DiscountDuration;
      durationInMonths?: number | null;
    };

/**
 * Only the columns these helpers read; keeps call sites from over-selecting.
 *
 * `billing_method` — not `stripe_subscription_id == null` — is what decides the
 * offline path, matching the checkout route's guard. The two disagree for a
 * card-billed row whose subscription id hasn't landed yet, and routing that row
 * into the local path would quietly rewrite the wrong partner's billing.
 */
export type DiscountableSubscriptionRow = {
  id: string;
  billing_method: string;
  stripe_subscription_id: string | null;
  amount_cents: number;
  current_period_end: string | null;
};

export type ApplyDiscountResult =
  | {
      ok: true;
      /** "stripe" = coupon attached at Stripe; "local" = offline row adjusted in our DB only. */
      mode: "stripe" | "local";
      couponId: string | null;
      label: string;
      endsAt: string | null;
    }
  | { ok: false; status: number; error: string };

export type RemoveDiscountResult =
  | { ok: true; mode: "stripe" | "local" }
  // `stripeCode` is Stripe's error code when the failure came from the API, so a
  // caller can tell "the subscription is already gone" from a real failure
  // without re-throwing. Null for our own failures (config, DB).
  | { ok: false; status: number; error: string; stripeCode?: string | null };

const COUPON_CURRENCY = "usd";

/** Guards against a fat-fingered "60 free months"; Stripe caps repeating coupons well above this. */
const MAX_FREE_MONTHS = 36;

/* -------------------------------------------------------------------------- */
/* Validation — runs before any Stripe call, always                            */
/* -------------------------------------------------------------------------- */

const isPositiveInt = (value: number): boolean => Number.isInteger(value) && value > 0;

/** `discount_percent_off`/`percent_off` are `numeric(5,2)` — reject anything Postgres would silently round. */
export const hasAtMostTwoDecimals = (value: number): boolean => Math.round(value * 100) / 100 === value;

/**
 * Returns an error string, or null when the spec is legal. Exported so the admin
 * route (Phase 3) can reject bad input with the same rules the helpers enforce,
 * rather than re-deriving them and drifting.
 */
export function validateDiscountSpec(spec: DiscountSpec): string | null {
  if (spec.type === "free_months") {
    if (!isPositiveInt(spec.months) || spec.months > MAX_FREE_MONTHS) {
      return `Free months must be a whole number between 1 and ${MAX_FREE_MONTHS}.`;
    }
    return null;
  }

  if (spec.type === "percent_off") {
    if (!(spec.percentOff > 0) || spec.percentOff > 100) {
      return "Percent off must be greater than 0 and no more than 100.";
    }
    if (!hasAtMostTwoDecimals(spec.percentOff)) {
      return "Percent off allows at most 2 decimal places.";
    }
  } else {
    if (!isPositiveInt(spec.amountOffCents)) {
      return "Amount off must be a positive whole number of cents.";
    }
  }

  // A `repeating` coupon without duration_in_months is rejected by Stripe with a
  // generic error; catch it here so the admin sees something actionable.
  if (spec.duration === "repeating") {
    if (!isPositiveInt(spec.durationInMonths ?? 0)) {
      return "A repeating discount needs a whole number of months.";
    }
  } else if (spec.durationInMonths != null) {
    return "Only a repeating discount can specify a number of months.";
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Coupon shape                                                                */
/* -------------------------------------------------------------------------- */

const formatUsd = (cents: number): string =>
  `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;

const durationSuffix = (spec: Exclude<DiscountSpec, { type: "free_months" }>): string => {
  if (spec.duration === "once") return " for one month";
  if (spec.duration === "forever") return " forever";
  return ` for ${spec.durationInMonths} months`;
};

/** Human-readable, stored in billing_subscriptions.discount_label for display. */
export function describeDiscount(spec: DiscountSpec): string {
  if (spec.type === "free_months") {
    return spec.months === 1 ? "1 free month" : `${spec.months} free months`;
  }
  if (spec.type === "percent_off") {
    return `${spec.percentOff}% off${durationSuffix(spec)}`;
  }
  return `${formatUsd(spec.amountOffCents)} off${durationSuffix(spec)}`;
}

/**
 * The exact Stripe coupon parameters for a spec. Pure + exported so the mapping
 * (especially free_months → 100%-off repeating) is unit-testable without Stripe.
 */
export function couponParamsForSpec(spec: DiscountSpec): Stripe.CouponCreateParams {
  const name = describeDiscount(spec);

  if (spec.type === "free_months") {
    return {
      name,
      percent_off: 100,
      duration: "repeating",
      duration_in_months: spec.months,
    };
  }

  const base: Stripe.CouponCreateParams =
    spec.type === "percent_off"
      ? { name, percent_off: spec.percentOff }
      : { name, amount_off: spec.amountOffCents, currency: COUPON_CURRENCY };

  base.duration = spec.duration;
  if (spec.duration === "repeating") {
    base.duration_in_months = spec.durationInMonths ?? undefined;
  }
  return base;
}

/**
 * Deterministic coupon id per distinct spec. This IS the "reuse an equivalent
 * coupon" mechanism: two identical grants resolve to the same id, so the second
 * one retrieves the existing coupon instead of minting a duplicate. A lookup by
 * id is exact and costs one call — Stripe's coupon list endpoint has no filter
 * on percent_off/amount_off, so paging it would be both slower and fuzzier.
 */
export function couponIdForSpec(spec: DiscountSpec): string {
  if (spec.type === "free_months") {
    return `hc-free-${spec.months}mo`;
  }
  const tail = spec.duration === "repeating" ? `rep-${spec.durationInMonths}` : spec.duration;
  if (spec.type === "percent_off") {
    return `hc-pct-${String(spec.percentOff).replace(".", "-")}-${tail}`;
  }
  return `hc-amt-${spec.amountOffCents}-${COUPON_CURRENCY}-${tail}`;
}

const stripeErrorCode = (error: unknown): string | null =>
  typeof error === "object" && error !== null && "code" in error
    ? ((error as { code?: unknown }).code as string) ?? null
    : null;

/**
 * A retrieved coupon is only reusable if it still encodes the same discount.
 *
 * `name` counts: the webhook mirrors `coupon.name` into discount_label, so
 * reusing a same-math coupon under someone else's name would silently relabel
 * what the partner sees on their billing page the next time Stripe syncs.
 */
const couponMatchesSpec = (coupon: Stripe.Coupon, params: Stripe.CouponCreateParams): boolean =>
  coupon.valid &&
  (coupon.name ?? null) === (params.name ?? null) &&
  (coupon.percent_off ?? null) === (params.percent_off ?? null) &&
  (coupon.amount_off ?? null) === (params.amount_off ?? null) &&
  (coupon.currency ?? null) === (params.currency ?? null) &&
  coupon.duration === (params.duration ?? "once") &&
  (coupon.duration_in_months ?? null) === (params.duration_in_months ?? null);

export type CouponResult =
  | { ok: true; coupon: Stripe.Coupon; reused: boolean }
  | { ok: false; status: number; error: string };

/**
 * Fetch the coupon for this spec, creating it only if it doesn't already exist.
 * Repeated identical grants must not litter the Stripe account with duplicates —
 * coupons are permanent objects that show up in the dashboard forever.
 */
export async function createOrReuseCoupon(spec: DiscountSpec): Promise<CouponResult> {
  const invalid = validateDiscountSpec(spec);
  if (invalid) {
    return { ok: false, status: 400, error: invalid };
  }
  if (!stripe) {
    return { ok: false, status: 500, error: "Server configuration error." };
  }

  const params = couponParamsForSpec(spec);
  const id = couponIdForSpec(spec);

  let existing: Stripe.Coupon | null = null;
  try {
    existing = await stripe.coupons.retrieve(id);
  } catch (error) {
    if (stripeErrorCode(error) !== "resource_missing") {
      return {
        ok: false,
        status: 502,
        error: error instanceof Error ? error.message : "Failed to read coupon.",
      };
    }
  }

  if (existing && couponMatchesSpec(existing, params)) {
    return { ok: true, coupon: existing, reused: true };
  }

  // An id collision that doesn't match the spec (hand-created in the dashboard,
  // or an id scheme change) must not silently apply the wrong discount — fall
  // back to a Stripe-generated id rather than reusing or overwriting it. Coupon
  // amounts are immutable at Stripe, so there is no "fix it in place" option.
  const createParams: Stripe.CouponCreateParams = existing ? params : { ...params, id };

  try {
    const coupon = await stripe.coupons.create(createParams);
    return { ok: true, coupon, reused: false };
  } catch (error) {
    // Lost a race with a concurrent grant of the same spec — the other request
    // created exactly the coupon we wanted, so take it.
    if (stripeErrorCode(error) === "resource_already_exists") {
      try {
        const coupon = await stripe.coupons.retrieve(id);
        return { ok: true, coupon, reused: true };
      } catch {
        // fall through to the generic failure below
      }
    }
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : "Failed to create coupon.",
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Mirror columns                                                              */
/* -------------------------------------------------------------------------- */

export type DiscountMirror = {
  stripe_coupon_id: string | null;
  discount_label: string | null;
  discount_percent_off: number | null;
  discount_amount_off_cents: number | null;
  discount_ends_at: string | null;
};

export const CLEARED_MIRROR: DiscountMirror = {
  stripe_coupon_id: null,
  discount_label: null,
  discount_percent_off: null,
  discount_amount_off_cents: null,
  discount_ends_at: null,
};

/**
 * Is there any discount recorded for this row? Any one populated column counts:
 * a partially-written mirror still means "a coupon may be attached at Stripe",
 * and the only cost of being wrong in that direction is one redundant API call.
 *
 * Callers use this to skip a detach that has nothing to detach — a Stripe
 * `subscriptions.update` on a dead subscription throws, and a caller that is
 * merely tidying up (rather than acting on an admin's explicit "Remove
 * discount") should not be failed by it. Passing a row that simply didn't
 * SELECT the mirror columns reads as "no discount" — select them, or the skip
 * is silently unconditional.
 */
export const hasDiscountMirror = (row: Partial<DiscountMirror>): boolean =>
  (Object.keys(CLEARED_MIRROR) as (keyof DiscountMirror)[]).some((column) => row[column] != null);

/**
 * Did a failed `removeDiscountFromSubscription` fail because there is nothing
 * left at Stripe to detach? Both cases below mean the coupon cannot still be
 * billing anybody, which is the only thing the detach exists to prevent:
 *
 * - `resource_missing` — the subscription (or its discount) is gone entirely.
 * - a canceled subscription — Stripe refuses updates on one, and it bills
 *   nothing, so an attached coupon is inert. There is no error `code` for this,
 *   only the message, hence the text match.
 *
 * This is deliberately NOT applied inside the helper: an admin who clicks
 * "Remove discount" should still hear about any Stripe failure. Only callers
 * detaching as a side effect of another operation should swallow these.
 */
export const removalIsMootAtStripe = (failure: { error: string; stripeCode?: string | null }): boolean =>
  failure.stripeCode === "resource_missing" ||
  /cannot update a (?:subscription|canceled)/i.test(failure.error) ||
  /subscription.*(?:is |has been )?cancell?ed/i.test(failure.error);

/**
 * The coupon behind a Discount, as carried in the payload. In this API version it
 * lives at `discount.source.coupon` and is itself expandable, so it can arrive as
 * a bare id; older payloads put a full Coupon at `discount.coupon`. Returns the
 * id or the object, whichever the payload has.
 */
export function discountCouponRef(discount: Stripe.Discount): string | Stripe.Coupon | null {
  const fromSource = discount.source?.coupon;
  if (fromSource) return fromSource;
  const legacy = (discount as unknown as { coupon?: Stripe.Coupon | null }).coupon;
  return legacy ?? null;
}

/**
 * Resolve that reference to a full Coupon, retrieving it only when the payload
 * carried an id. Returns null if it can't be resolved — callers then keep the
 * ids/dates they do have rather than dropping the discount entirely.
 */
export async function resolveDiscountCoupon(discount: Stripe.Discount): Promise<Stripe.Coupon | null> {
  const ref = discountCouponRef(discount);
  if (!ref) return null;
  if (typeof ref !== "string") return ref;
  if (!stripe) return null;
  try {
    return await stripe.coupons.retrieve(ref);
  } catch {
    return null;
  }
}

/**
 * Build the mirror columns from a Stripe Discount + its resolved coupon. Used by
 * the webhook sync (Phase 6), which must read Stripe's own current state rather
 * than trust what our last admin action wrote — that's the whole point of the
 * sync: it catches discounts that expired on their own, or were changed/removed
 * directly in the Stripe Dashboard.
 *
 * The label prefers the coupon's `name` (we set it to describeDiscount() when we
 * create one, so ours round-trips) and falls back to the coupon id for coupons
 * created by hand in the dashboard with no name.
 */
export function discountMirrorFromStripe(
  discount: Stripe.Discount,
  coupon: Stripe.Coupon | null
): DiscountMirror {
  const ref = discountCouponRef(discount);
  const couponId = coupon?.id ?? (typeof ref === "string" ? ref : null);
  return {
    stripe_coupon_id: couponId,
    discount_label: coupon?.name ?? couponId,
    discount_percent_off: coupon?.percent_off ?? null,
    discount_amount_off_cents: coupon?.amount_off ?? null,
    discount_ends_at:
      typeof discount.end === "number" ? new Date(discount.end * 1000).toISOString() : null,
  };
}

/**
 * `discounts` on a subscription is an array of ids unless expanded; we expand it
 * on update so the real discount end date comes from Stripe rather than being
 * recomputed (and drifting) on our side.
 */
const readDiscountEnd = (subscription: Stripe.Subscription): string | null => {
  const first = subscription.discounts?.[0];
  if (!first || typeof first === "string" || typeof first.end !== "number") {
    return null;
  }
  return new Date(first.end * 1000).toISOString();
};

/** Month arithmetic that clamps rather than rolling over (Jan 31 + 1mo → Feb 28). */
const addMonths = (date: Date, months: number): Date => {
  const day = date.getUTCDate();
  const shifted = new Date(date.getTime());
  shifted.setUTCDate(1);
  shifted.setUTCMonth(shifted.getUTCMonth() + months);
  const daysInMonth = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)
  ).getUTCDate();
  shifted.setUTCDate(Math.min(day, daysInMonth));
  return shifted;
};

/* -------------------------------------------------------------------------- */
/* Apply / remove                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Attach a discount to a subscription. Stripe-backed rows get a real coupon;
 * tokenless offline/check-billed rows get the local adjustment described at the
 * top of this file. Never creates or cancels a subscription.
 */
export async function applyDiscountToSubscription(
  row: DiscountableSubscriptionRow,
  spec: DiscountSpec
): Promise<ApplyDiscountResult> {
  const invalid = validateDiscountSpec(spec);
  if (invalid) {
    return { ok: false, status: 400, error: invalid };
  }
  if (!supabaseAdmin) {
    return { ok: false, status: 500, error: "Server configuration error." };
  }

  const label = describeDiscount(spec);

  if (row.billing_method === OFFLINE_BILLING_METHOD) {
    return applyOfflineDiscount(row, spec, label);
  }

  // A card-billed row with no subscription id has nothing to attach a coupon to
  // and must NOT fall through to the local path — that would rewrite a real
  // Stripe partner's billing behind Stripe's back.
  if (!row.stripe_subscription_id) {
    return {
      ok: false,
      status: 400,
      error: "This venue has no active Stripe subscription to discount yet.",
    };
  }

  if (!stripe) {
    return { ok: false, status: 500, error: "Server configuration error." };
  }

  const couponResult = await createOrReuseCoupon(spec);
  if (!couponResult.ok) {
    return couponResult;
  }
  const { coupon } = couponResult;

  let updated: Stripe.Subscription;
  try {
    // Stripe allows only ONE coupon per subscription: a populated array REPLACES
    // whatever discount was there, it does not stack. (Plan's open question —
    // the admin UI must not imply stacking.)
    updated = await stripe.subscriptions.update(row.stripe_subscription_id, {
      discounts: [{ coupon: coupon.id }],
      expand: ["discounts"],
    });
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : "Failed to apply discount.",
    };
  }

  const endsAt = readDiscountEnd(updated);

  await supabaseAdmin
    .from("billing_subscriptions")
    .update({
      stripe_coupon_id: coupon.id,
      discount_label: label,
      discount_percent_off: coupon.percent_off,
      discount_amount_off_cents: coupon.amount_off,
      discount_ends_at: endsAt,
    } satisfies DiscountMirror)
    .eq("id", row.id);
  // Stripe is authoritative and the discount is already live there; the sync-back
  // webhook (Phase 6) repairs the mirror. Don't fail the request over this write.

  return { ok: true, mode: "stripe", couponId: coupon.id, label, endsAt };
}

/**
 * Offline/check-billed rows: no Stripe objects exist, so "applying a discount"
 * means writing our own mirror. See the file header — this path does NOT touch
 * amount_cents, which stays the partner's list rate.
 */
async function applyOfflineDiscount(
  row: DiscountableSubscriptionRow,
  spec: DiscountSpec,
  label: string
): Promise<ApplyDiscountResult> {
  if (!supabaseAdmin) {
    return { ok: false, status: 500, error: "Server configuration error." };
  }

  // Stripe expires a `once`/`repeating` coupon on its own schedule; nothing here
  // can. Accepting a duration we cannot honor would leave a "25% off for one
  // month" running forever, so refuse it rather than quietly misrepresent it.
  if (spec.type !== "free_months" && spec.duration !== "forever") {
    return {
      ok: false,
      status: 400,
      error:
        "An offline partner's discount has no billing cycle to expire on, so it must be Forever. Use Free months for a time-limited credit, or set their rate with Grant offline.",
    };
  }

  // No coupon exists — leaving stripe_coupon_id null is what marks this as a
  // locally-applied discount for every reader of the mirror.
  const payload: Record<string, unknown> = { ...CLEARED_MIRROR, discount_label: label };

  if (spec.type === "free_months") {
    // Push the paid-through date out; access simply continues to that date, the
    // same way an admin grant works for these rows. Deliberately no
    // discount_percent_off: this is a date extension, not a rate change, and
    // mirroring 100 here would make every surface render the partner's rate as
    // $0 with nothing to ever change it back.
    const from = row.current_period_end ? new Date(row.current_period_end) : new Date();
    const base = Number.isNaN(from.getTime()) || from.getTime() < Date.now() ? new Date() : from;
    const extended = addMonths(base, spec.months).toISOString();
    payload.current_period_end = extended;
    payload.discount_ends_at = extended;
  } else if (spec.type === "percent_off") {
    payload.discount_percent_off = spec.percentOff;
  } else {
    payload.discount_amount_off_cents = spec.amountOffCents;
  }

  const { error } = await supabaseAdmin
    .from("billing_subscriptions")
    .update(payload)
    .eq("id", row.id);

  // Unlike the Stripe path there is no other system holding the truth — if this
  // write fails, nothing happened at all, so surface it.
  if (error) {
    return { ok: false, status: 500, error: "Failed to apply discount." };
  }

  return {
    ok: true,
    mode: "local",
    couponId: null,
    label,
    endsAt: (payload.discount_ends_at as string | null) ?? null,
  };
}

/**
 * Remove the active discount. For a Stripe-backed row this detaches the coupon
 * at Stripe and clears the mirror; for an offline row there is only the mirror
 * to clear.
 *
 * Offline rows come back to their full list rate cleanly, because the offline
 * path never moved amount_cents in the first place. The one thing removal does
 * not undo is free months: those already pushed current_period_end out, and
 * clawing back access a partner was told they had would be wrong.
 */
export async function removeDiscountFromSubscription(
  row: DiscountableSubscriptionRow
): Promise<RemoveDiscountResult> {
  if (!supabaseAdmin) {
    return { ok: false, status: 500, error: "Server configuration error." };
  }

  const mode: "stripe" | "local" =
    row.billing_method === OFFLINE_BILLING_METHOD || !row.stripe_subscription_id
      ? "local"
      : "stripe";

  if (mode === "stripe" && row.stripe_subscription_id) {
    if (!stripe) {
      return { ok: false, status: 500, error: "Server configuration error." };
    }
    try {
      // An EMPTY ARRAY leaves the existing discounts untouched in this API
      // version — only the empty string clears them. Getting this wrong looks
      // like a successful removal while the partner keeps the discount.
      await stripe.subscriptions.update(row.stripe_subscription_id, { discounts: "" });
    } catch (error) {
      return {
        ok: false,
        status: 502,
        error: error instanceof Error ? error.message : "Failed to remove discount.",
        stripeCode: stripeErrorCode(error),
      };
    }
  }

  const { error } = await supabaseAdmin
    .from("billing_subscriptions")
    .update({ ...CLEARED_MIRROR })
    .eq("id", row.id);

  if (error && mode === "local") {
    return { ok: false, status: 500, error: "Failed to remove discount." };
  }

  return { ok: true, mode };
}
