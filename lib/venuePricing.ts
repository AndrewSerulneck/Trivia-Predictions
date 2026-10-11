/**
 * Multi-venue volume pricing — the ONE home of the price bands
 * (docs/multi-venue-volume-billing-plan.md §1, §4.2).
 *
 * Pure: no Supabase, no Stripe client, no `server-only` — the Partner Dashboard can import it
 * to show "This venue: $75/mo". Money is integer cents everywhere.
 *
 * GRADUATED, not volume: each band is priced on its own, so adding a venue never makes the
 * total go down and never costs more than the next band's price. Stripe computes real invoices
 * from the live graduated Price (lookup key below); this module must agree with it, and the
 * Phase 2 script that creates that Price reads `VENUE_PRICE_TIERS` from here.
 *
 * A price change is a NEW lookup key (`…_v2`) and a deliberate migration of subscribers —
 * never an edit of these numbers in place (Stripe does not allow editing a Price's tiers, so
 * changing them here alone would only make our display disagree with what Stripe charges).
 */

export type VenuePriceTier = {
  /** Inclusive upper bound of the band in venues; null = no upper bound. */
  upTo: number | null;
  /** Price per venue per month in this band, in cents. */
  unitAmountCents: number;
};

/** The Stripe Price lookup key for these exact tiers. Bump the suffix for any change. */
export const GRADUATED_PRICE_LOOKUP_KEY = "hightop_venue_graduated_monthly_v1";

/** The list price of a single venue — what every 1-venue bill costs before discounts. */
export const ANCHOR_VENUE_PRICE_CENTS = 10000;

/** 1st $100 · 2nd–5th $75 · 6th–15th $60 · 16th and up $45 (Andrew, 2026-10-11). */
export const VENUE_PRICE_TIERS: readonly VenuePriceTier[] = [
  { upTo: 1, unitAmountCents: ANCHOR_VENUE_PRICE_CENTS },
  { upTo: 5, unitAmountCents: 7500 },
  { upTo: 15, unitAmountCents: 6000 },
  { upTo: null, unitAmountCents: 4500 },
];

const assertVenueCount = (venueCount: number): void => {
  if (!Number.isInteger(venueCount) || venueCount < 1) {
    throw new RangeError(`venue count must be a whole number of at least 1 (got ${venueCount})`);
  }
};

export type TierBreakdownLine = {
  /** First venue number in this band (1-based). */
  fromVenue: number;
  /** Last venue number in this band that is actually billed. */
  toVenue: number;
  /** How many venues fall in this band. */
  venues: number;
  unitAmountCents: number;
  subtotalCents: number;
};

/**
 * Graduated total for `quantity` units over any tier list. Shared by our own tiers and by the
 * Stripe webhook, which passes a Price's own tiers when the payload carries them.
 * `quantity` 0 is a legitimate Stripe value (a bill with nothing on it) and totals 0.
 */
export const graduatedTotalCents = (tiers: readonly VenuePriceTier[], quantity: number): number => {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new RangeError(`quantity must be a whole number of at least 0 (got ${quantity})`);
  }
  let total = 0;
  let previousUpTo = 0;
  for (const tier of tiers) {
    if (quantity <= previousUpTo) break;
    const bandTop = tier.upTo === null ? quantity : Math.min(quantity, tier.upTo);
    total += (bandTop - previousUpTo) * tier.unitAmountCents;
    if (tier.upTo === null) break;
    previousUpTo = tier.upTo;
  }
  return total;
};

/** Monthly list total for a bill with `venueCount` venues, before any discount. */
export const monthlyTotalCents = (venueCount: number): number => {
  assertVenueCount(venueCount);
  return graduatedTotalCents(VENUE_PRICE_TIERS, venueCount);
};

/** The per-venue band price of venue number `venueNumber` (1-based). */
export const venuePriceCents = (venueNumber: number): number => {
  assertVenueCount(venueNumber);
  const tier = VENUE_PRICE_TIERS.find((t) => t.upTo === null || venueNumber <= t.upTo);
  // The last tier is unbounded, so `find` always succeeds.
  return (tier ?? VENUE_PRICE_TIERS[VENUE_PRICE_TIERS.length - 1]).unitAmountCents;
};

/**
 * What adding one more venue to a bill that has `currentVenueCount` venues costs per month.
 * Equal to `monthlyTotalCents(n + 1) - monthlyTotalCents(n)`.
 */
export const nextVenuePriceCents = (currentVenueCount: number): number => {
  if (!Number.isInteger(currentVenueCount) || currentVenueCount < 1) {
    throw new RangeError(`current venue count must be a whole number of at least 1 (got ${currentVenueCount})`);
  }
  return venuePriceCents(currentVenueCount + 1);
};

/** "1 × $100 · 3 × $75" — the bands a bill of `venueCount` venues actually uses. */
export const tierBreakdown = (venueCount: number): TierBreakdownLine[] => {
  assertVenueCount(venueCount);
  const lines: TierBreakdownLine[] = [];
  let previousUpTo = 0;
  for (const tier of VENUE_PRICE_TIERS) {
    if (venueCount <= previousUpTo) break;
    const toVenue = tier.upTo === null ? venueCount : Math.min(venueCount, tier.upTo);
    const venues = toVenue - previousUpTo;
    lines.push({
      fromVenue: previousUpTo + 1,
      toVenue,
      venues,
      unitAmountCents: tier.unitAmountCents,
      subtotalCents: venues * tier.unitAmountCents,
    });
    if (tier.upTo === null) break;
    previousUpTo = tier.upTo;
  }
  return lines;
};

/**
 * The minimal shape of a Stripe subscription item this module reads — structural, so the module
 * stays free of the Stripe SDK and can be unit-tested with plain objects.
 */
export type BillableItemShape = {
  quantity?: number | null;
  price?: {
    unit_amount?: number | null;
    billing_scheme?: string | null;
    tiers_mode?: string | null;
    tiers?: Array<{ up_to: number | null; unit_amount: number | null; flat_amount?: number | null }> | null;
  } | null;
};

const itemQuantity = (item: BillableItemShape): number => {
  const quantity = item.quantity;
  return typeof quantity === "number" && Number.isInteger(quantity) && quantity >= 0 ? quantity : 1;
};

/**
 * One item's monthly list amount in cents, before discounts.
 *
 *   - Flat ("per_unit") price: `unit_amount × quantity`. Every subscription before Phase 2 is
 *     this with quantity 1, i.e. exactly the `price.unit_amount` the webhook always mirrored.
 *   - Tiered price: Stripe sets `unit_amount` to NULL (plan §7 trap 1 — mirroring it would show
 *     every chain as $0). Uses the Price's own tiers when the payload carries them (Stripe only
 *     includes them when expanded), else `VENUE_PRICE_TIERS` — the only tiered Price this app
 *     creates, and Phase 2 checks the live Price's tiers equal it.
 */
export const billableItemMonthlyCents = (item: BillableItemShape): number => {
  const quantity = itemQuantity(item);
  const price = item.price ?? null;
  if (!price) return 0;

  if (price.billing_scheme !== "tiered") {
    return (typeof price.unit_amount === "number" ? price.unit_amount : 0) * quantity;
  }

  const tiers: VenuePriceTier[] | null = Array.isArray(price.tiers) && price.tiers.length > 0
    ? price.tiers.map((tier) => ({ upTo: tier.up_to, unitAmountCents: tier.unit_amount ?? 0 }))
    : null;
  const flatFees = Array.isArray(price.tiers) ? price.tiers.some((tier) => (tier.flat_amount ?? 0) !== 0) : false;

  if (!tiers || flatFees) {
    // No tiers in the payload (the usual webhook case), or tiers with flat fees this app never
    // creates: price by our own bands rather than guess.
    return graduatedTotalCents(VENUE_PRICE_TIERS, quantity);
  }
  if (price.tiers_mode === "volume") {
    if (quantity === 0) return 0;
    const tier = tiers.find((t) => t.upTo === null || quantity <= t.upTo) ?? tiers[tiers.length - 1];
    return tier.unitAmountCents * quantity;
  }
  return graduatedTotalCents(tiers, quantity);
};

/** Sum over every item on a subscription (today there is always exactly one). */
export const subscriptionMonthlyCents = (items: readonly BillableItemShape[]): number =>
  items.reduce((sum, item) => sum + billableItemMonthlyCents(item), 0);
