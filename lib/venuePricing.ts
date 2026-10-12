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

import { formatCentsShort } from "@/lib/merchPricing";

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

/** "$100 / $75 / $60 / $45" — each band's per-venue price, built from `VENUE_PRICE_TIERS` so a price change can never leave a label behind. */
export const venuePriceBandsLabel = (): string => VENUE_PRICE_TIERS.map((tier) => formatCentsShort(tier.unitAmountCents)).join(" / ");

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

/**
 * The Stripe Price this module describes, as `prices.create` tier params (Phase 2,
 * scripts/create-graduated-price.cjs). `"inf"` is Stripe's spelling of "no upper bound".
 */
export type StripeGraduatedTierParam = { up_to: number | "inf"; unit_amount: number };

export const graduatedStripeTiers = (): StripeGraduatedTierParam[] =>
  VENUE_PRICE_TIERS.map((tier) => ({ up_to: tier.upTo ?? "inf", unit_amount: tier.unitAmountCents }));

/** The fields of a Stripe Price (retrieved with `expand: ["tiers"]`) the live check reads. */
export type GraduatedPriceShape = {
  active?: boolean | null;
  currency?: string | null;
  type?: string | null;
  billing_scheme?: string | null;
  tiers_mode?: string | null;
  lookup_key?: string | null;
  recurring?: { interval?: string | null; interval_count?: number | null } | null;
  tiers?: Array<{
    up_to: number | null;
    unit_amount: number | null;
    flat_amount?: number | null;
  }> | null;
};

/**
 * Everything about a live Stripe Price that disagrees with `VENUE_PRICE_TIERS` (plan §4.2: "a
 * test asserts the live Price's tiers equal it"). Empty = the Price bills exactly what this
 * module — and therefore the webhook's `amount_cents` mirror and every display — says it does.
 * `tiers` must be present: a Price retrieved without `expand: ["tiers"]` is reported, not trusted.
 */
export const graduatedPriceProblems = (price: GraduatedPriceShape): string[] => {
  const problems: string[] = [];
  if (price.active !== true) problems.push("price is not active");
  if (price.currency !== "usd") problems.push(`currency is ${price.currency ?? "missing"}, expected usd`);
  if (price.type !== "recurring") problems.push(`type is ${price.type ?? "missing"}, expected recurring`);
  if (price.recurring?.interval !== "month" || (price.recurring?.interval_count ?? 1) !== 1) {
    problems.push("does not bill every 1 month");
  }
  if (price.billing_scheme !== "tiered") problems.push(`billing_scheme is ${price.billing_scheme ?? "missing"}, expected tiered`);
  if (price.tiers_mode !== "graduated") problems.push(`tiers_mode is ${price.tiers_mode ?? "missing"}, expected graduated`);
  if (price.lookup_key !== GRADUATED_PRICE_LOOKUP_KEY) {
    problems.push(`lookup_key is ${price.lookup_key ?? "missing"}, expected ${GRADUATED_PRICE_LOOKUP_KEY}`);
  }
  if (!Array.isArray(price.tiers)) {
    problems.push("tiers missing (retrieve the Price with expand: [\"tiers\"])");
    return problems;
  }
  if (price.tiers.length !== VENUE_PRICE_TIERS.length) {
    problems.push(`has ${price.tiers.length} tiers, expected ${VENUE_PRICE_TIERS.length}`);
    return problems;
  }
  VENUE_PRICE_TIERS.forEach((expected, index) => {
    const actual = price.tiers?.[index];
    if (!actual) return;
    if (actual.up_to !== expected.upTo) {
      problems.push(`tier ${index + 1} up_to is ${actual.up_to ?? "inf"}, expected ${expected.upTo ?? "inf"}`);
    }
    if (actual.unit_amount !== expected.unitAmountCents) {
      problems.push(`tier ${index + 1} unit_amount is ${actual.unit_amount}, expected ${expected.unitAmountCents}`);
    }
    if ((actual.flat_amount ?? 0) !== 0) {
      problems.push(`tier ${index + 1} has a flat fee of ${actual.flat_amount}`);
    }
  });
  return problems;
};

// --- The bill's RATE: graduated bands, or an admin's negotiated per-venue price -----------------

/**
 * How a bill is priced (multi-venue billing Phase 6; Andrew, 2026-10-11: "per-venue rate").
 *
 *   - `graduated`: the four bands above (every self-serve bill).
 *   - `per_venue`: an admin's negotiated rate (lib/billingCustomPrice.ts): the subscription item sits
 *     on a flat `custom_monthly_<cents>` Price and the bill is that price × venues — no bands. On a
 *     1-venue bill this is exactly the custom rate that existed before multi-venue billing. Venues
 *     added or removed later are billed at the same per-venue price; a coupon still applies on top
 *     of the whole bill (plan §2 rows 3 and 6).
 */
export type BillRate = { kind: "graduated" } | { kind: "per_venue"; unitAmountCents: number };

export const GRADUATED_RATE: BillRate = { kind: "graduated" };

/** Lookup-key prefix of every negotiated per-venue Price (lib/billingCustomPrice.ts mints them). */
export const CUSTOM_PER_VENUE_LOOKUP_PREFIX = "custom_monthly_";

/** A bill's monthly list total (before discounts) at `venueCount` venues. */
export const rateMonthlyTotalCents = (rate: BillRate, venueCount: number): number => {
  assertVenueCount(venueCount);
  return rate.kind === "graduated" ? monthlyTotalCents(venueCount) : rate.unitAmountCents * venueCount;
};

/** What venue number `venueNumber` costs per month on this rate. */
export const rateVenuePriceCents = (rate: BillRate, venueNumber: number): number => {
  assertVenueCount(venueNumber);
  return rate.kind === "graduated" ? venuePriceCents(venueNumber) : rate.unitAmountCents;
};

/** "1 × $100 · 2 × $75" (graduated) or "3 × $70" (per-venue) as lines. */
export const rateBreakdown = (rate: BillRate, venueCount: number): TierBreakdownLine[] => {
  assertVenueCount(venueCount);
  if (rate.kind === "graduated") return tierBreakdown(venueCount);
  return [
    {
      fromVenue: 1,
      toVenue: venueCount,
      venues: venueCount,
      unitAmountCents: rate.unitAmountCents,
      subtotalCents: rate.unitAmountCents * venueCount,
    },
  ];
};

/** The fields of a Stripe Price `billRateFromPrice` reads. */
export type RatePriceShape = {
  id?: string | null;
  lookup_key?: string | null;
  billing_scheme?: string | null;
  unit_amount?: number | null;
  currency?: string | null;
  recurring?: { interval?: string | null; interval_count?: number | null } | null;
};

/** A flat (per-unit), monthly, USD Price with a positive whole-cent amount — the only shape a per-venue rate can have. */
const isFlatMonthlyUsdPrice = (price: RatePriceShape): price is RatePriceShape & { unit_amount: number } =>
  price.billing_scheme !== "tiered" &&
  typeof price.unit_amount === "number" &&
  Number.isInteger(price.unit_amount) &&
  price.unit_amount > 0 &&
  (!price.currency || price.currency === "usd") &&
  (!price.recurring || (price.recurring.interval === "month" && (price.recurring.interval_count ?? 1) === 1));

/**
 * The rate a subscription item's live Price bills at, or null when venues can't be added to or
 * removed from it automatically. `graduatedPriceId` / `listPriceId` are the configured Stripe ids
 * (lib/stripe.ts), passed in so this stays pure.
 *
 * A per-venue rate is ONLY a flat monthly USD Price whose lookup key starts with
 * `CUSTOM_PER_VENUE_LOOKUP_PREFIX` — the Prices lib/billingCustomPrice.ts mints (Phase 6.2, review
 * #3). Any other flat Price — the old $100 list Price (with or without `STRIPE_PRICE_ID` set), a
 * hand-pasted Price — is null: adding a venue to it would charge its flat amount instead of the band
 * price, so it needs a person (`unratedPriceRefusal` says which refusal).
 */
export const billRateFromPrice = (
  price: RatePriceShape | null | undefined,
  ids: { graduatedPriceId: string; listPriceId: string }
): BillRate | null => {
  if (!price) return null;
  if (price.lookup_key === GRADUATED_PRICE_LOOKUP_KEY) return GRADUATED_RATE;
  if (ids.graduatedPriceId && price.id === ids.graduatedPriceId) return GRADUATED_RATE;
  if (!price.lookup_key?.startsWith(CUSTOM_PER_VENUE_LOOKUP_PREFIX)) return null;
  if (!isFlatMonthlyUsdPrice(price)) return null;
  return { kind: "per_venue", unitAmountCents: price.unit_amount };
};

/**
 * Why a Price `billRateFromPrice` refused is refused, as the partner-facing code: `custom_rate` for
 * a flat monthly USD Price that isn't the list Price (an admin set a rate by hand — the partner's
 * true reason), `billing_state` for everything else (the old list Price, tiers we don't know,
 * yearly, foreign currency, no Price).
 */
export const unratedPriceRefusal = (
  price: RatePriceShape | null | undefined,
  ids: { listPriceId: string }
): "custom_rate" | "billing_state" => {
  if (!price) return "billing_state";
  if (ids.listPriceId && price.id === ids.listPriceId) return "billing_state";
  return isFlatMonthlyUsdPrice(price) ? "custom_rate" : "billing_state";
};

/** The `billing_subscriptions` mirror columns `billRateFromMirror` reads. */
export type RateMirrorShape = {
  stripe_price_id?: string | null;
  amount_cents?: number | null;
  quantity?: number | null;
};

/**
 * A bill's rate from our own mirror (no Stripe call) — for displays: the admin billing list, the
 * partner Billing page, the "Venue added" email. The webhook (and lib/billingCustomPrice.ts) write
 * `stripe_price_id`, `amount_cents` (= the whole bill) and `quantity` together.
 *
 *   - no Stripe price (offline / check bills), or the graduated Price → graduated;
 *   - graduated Price id unknown in this environment → graduated when the amount matches the bands;
 *   - otherwise a flat Price → its per-venue amount = `amount_cents / quantity`.
 */
export const billRateFromMirror = (row: RateMirrorShape, graduatedPriceId: string): BillRate => {
  const priceId = row.stripe_price_id ?? null;
  if (!priceId) return GRADUATED_RATE;
  if (graduatedPriceId && priceId === graduatedPriceId) return GRADUATED_RATE;
  const quantity = typeof row.quantity === "number" && Number.isInteger(row.quantity) && row.quantity >= 1 ? row.quantity : 1;
  const amount = typeof row.amount_cents === "number" && Number.isFinite(row.amount_cents) ? row.amount_cents : 0;
  if (!graduatedPriceId && amount === monthlyTotalCents(quantity)) return GRADUATED_RATE;
  if (amount <= 0) return GRADUATED_RATE;
  return { kind: "per_venue", unitAmountCents: Math.round(amount / quantity) };
};
