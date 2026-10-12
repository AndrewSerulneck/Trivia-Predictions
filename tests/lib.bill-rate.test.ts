import { describe, expect, it } from "vitest";

import {
  billRateFromMirror,
  billRateFromPrice,
  GRADUATED_PRICE_LOOKUP_KEY,
  GRADUATED_RATE,
  CUSTOM_PER_VENUE_LOOKUP_PREFIX,
  rateBreakdown,
  rateMonthlyTotalCents,
  rateVenuePriceCents,
  unratedPriceRefusal,
} from "@/lib/venuePricing";

/**
 * Multi-venue billing Phase 6 — a bill's RATE (Andrew, 2026-10-11: a negotiated custom rate on a
 * chain is a PER-VENUE rate: rate × venues, no bands; coupons still apply on top).
 */

const IDS = { graduatedPriceId: "price_graduated", listPriceId: "price_list_100" };
const flat = (overrides: Record<string, unknown> = {}) => ({
  id: "price_custom_7000",
  lookup_key: "custom_monthly_7000",
  billing_scheme: "per_unit",
  unit_amount: 7000,
  currency: "usd",
  recurring: { interval: "month", interval_count: 1 },
  ...overrides,
});

describe("rate math", () => {
  it("graduated = the bands; per-venue = rate × venues", () => {
    expect(rateMonthlyTotalCents(GRADUATED_RATE, 3)).toBe(25000);
    expect(rateVenuePriceCents(GRADUATED_RATE, 2)).toBe(7500);
    const custom = { kind: "per_venue", unitAmountCents: 7000 } as const;
    expect(rateMonthlyTotalCents(custom, 3)).toBe(21000);
    expect(rateVenuePriceCents(custom, 1)).toBe(7000);
    expect(rateVenuePriceCents(custom, 16)).toBe(7000);
    expect(rateBreakdown(custom, 3)).toEqual([{ fromVenue: 1, toVenue: 3, venues: 3, unitAmountCents: 7000, subtotalCents: 21000 }]);
    expect(rateBreakdown(GRADUATED_RATE, 3).map((line) => [line.venues, line.unitAmountCents])).toEqual([
      [1, 10000],
      [2, 7500],
    ]);
  });

  it("refuses a venue count below 1", () => {
    expect(() => rateMonthlyTotalCents(GRADUATED_RATE, 0)).toThrow(RangeError);
    expect(() => rateBreakdown({ kind: "per_venue", unitAmountCents: 7000 }, 0)).toThrow(RangeError);
  });
});

describe("billRateFromPrice (a live Stripe item's Price)", () => {
  it("the graduated Price, by lookup key or configured id", () => {
    expect(billRateFromPrice({ id: "x", lookup_key: GRADUATED_PRICE_LOOKUP_KEY, billing_scheme: "tiered" }, IDS)).toEqual(GRADUATED_RATE);
    expect(billRateFromPrice({ id: "price_graduated", lookup_key: null, billing_scheme: "tiered" }, IDS)).toEqual(GRADUATED_RATE);
  });

  it("a flat monthly USD `custom_monthly_` price is a per-venue rate", () => {
    expect(CUSTOM_PER_VENUE_LOOKUP_PREFIX).toBe("custom_monthly_");
    expect(billRateFromPrice(flat(), IDS)).toEqual({ kind: "per_venue", unitAmountCents: 7000 });
  });

  // Phase 6.2 (review #3): only the Prices lib/billingCustomPrice.ts mints are a per-venue rate.
  it("any other flat price is NOT a per-venue rate", () => {
    // The old $100 list Price with no lookup key (a configured id or not).
    const list = flat({ id: "price_list_100", lookup_key: null, unit_amount: 10000 });
    expect(billRateFromPrice(list, IDS)).toBeNull();
    // STRIPE_PRICE_ID unset: the list-id guard can't fire, the prefix rule still refuses it.
    expect(billRateFromPrice(list, { graduatedPriceId: "price_graduated", listPriceId: "" })).toBeNull();
    // A hand-made flat monthly Price pasted into the admin form, with or without a lookup key.
    expect(billRateFromPrice(flat({ id: "price_pasted", lookup_key: null }), IDS)).toBeNull();
    expect(billRateFromPrice(flat({ id: "price_pasted", lookup_key: "partner_special" }), IDS)).toBeNull();
    expect(billRateFromPrice(flat({ id: "price_pasted", lookup_key: "xcustom_monthly_7000" }), IDS)).toBeNull();
  });

  it("refuses the old flat list price, foreign tiers, yearly, non-USD, and no amount", () => {
    expect(billRateFromPrice(flat({ id: "price_list_100", lookup_key: null, unit_amount: 10000 }), IDS)).toBeNull();
    expect(billRateFromPrice({ id: "price_t", lookup_key: null, billing_scheme: "tiered", unit_amount: null }, IDS)).toBeNull();
    expect(billRateFromPrice(flat({ recurring: { interval: "year", interval_count: 1 } }), IDS)).toBeNull();
    expect(billRateFromPrice(flat({ recurring: { interval: "month", interval_count: 3 } }), IDS)).toBeNull();
    expect(billRateFromPrice(flat({ currency: "eur" }), IDS)).toBeNull();
    expect(billRateFromPrice(flat({ unit_amount: null }), IDS)).toBeNull();
    expect(billRateFromPrice(null, IDS)).toBeNull();
  });
});

describe("unratedPriceRefusal (why an unrated item needs a person)", () => {
  const ids = { listPriceId: "price_list_100" };
  it("a hand-set flat monthly USD price is a custom rate", () => {
    expect(unratedPriceRefusal(flat({ id: "price_pasted", lookup_key: null }), ids)).toBe("custom_rate");
    expect(unratedPriceRefusal(flat({ id: "price_pasted", lookup_key: "partner_special" }), ids)).toBe("custom_rate");
  });

  it("the list price and every non-flat shape is a billing-state problem", () => {
    expect(unratedPriceRefusal(flat({ id: "price_list_100", lookup_key: null, unit_amount: 10000 }), ids)).toBe("billing_state");
    expect(unratedPriceRefusal({ id: "price_t", lookup_key: null, billing_scheme: "tiered", unit_amount: null }, ids)).toBe("billing_state");
    expect(unratedPriceRefusal(flat({ recurring: { interval: "year", interval_count: 1 } }), ids)).toBe("billing_state");
    expect(unratedPriceRefusal(flat({ currency: "eur" }), ids)).toBe("billing_state");
    expect(unratedPriceRefusal(null, ids)).toBe("billing_state");
  });
});

describe("billRateFromMirror (our billing_subscriptions columns, no Stripe call)", () => {
  it("offline (no price) and the graduated price read as graduated", () => {
    expect(billRateFromMirror({ stripe_price_id: null, amount_cents: 15000, quantity: null }, "price_graduated")).toEqual(GRADUATED_RATE);
    expect(billRateFromMirror({ stripe_price_id: "price_graduated", amount_cents: 25000, quantity: 3 }, "price_graduated")).toEqual(
      GRADUATED_RATE
    );
  });

  it("a custom_monthly_ price reads as per-venue: amount ÷ venues", () => {
    const custom = { stripe_price_id: "price_custom_7000", stripe_price_lookup_key: "custom_monthly_7000" };
    expect(billRateFromMirror({ ...custom, amount_cents: 21000, quantity: 3 }, "price_graduated")).toEqual({
      kind: "per_venue",
      unitAmountCents: 7000,
    });
    // Old rows without the quantity mirror are 1 venue.
    expect(billRateFromMirror({ ...custom, amount_cents: 7000, quantity: null }, "price_graduated")).toEqual({
      kind: "per_venue",
      unitAmountCents: 7000,
    });
    // A custom key wins over a coincidental band match, even with no graduated id configured.
    expect(billRateFromMirror({ ...custom, stripe_price_lookup_key: "custom_monthly_10000", amount_cents: 10000, quantity: 1 }, "")).toEqual({
      kind: "per_venue",
      unitAmountCents: 10000,
    });
    expect(billRateFromMirror({ ...custom, amount_cents: 0, quantity: 1 }, "price_graduated")).toBeNull();
  });

  it("Phase 6.8 (review 6.5 #3): any other flat price has NO rate — the same rule charges use", () => {
    // The old list Price, a hand-pasted Price, and a row whose key isn't mirrored yet.
    for (const key of ["hightop_venue_monthly", "my_price", null, undefined]) {
      expect(billRateFromMirror({ stripe_price_id: "price_list_100", stripe_price_lookup_key: key, amount_cents: 20000, quantity: 2 }, "price_graduated")).toBeNull();
      // …and billRateFromPrice agrees for the same Price.
      expect(billRateFromPrice(flat({ id: "price_list_100", lookup_key: key, unit_amount: 10000 }), IDS)).toBeNull();
    }
    // A key with the prefix in the middle is not a custom rate.
    expect(billRateFromMirror({ stripe_price_id: "price_x", stripe_price_lookup_key: "old_custom_monthly_7000", amount_cents: 7000, quantity: 1 }, "price_graduated")).toBeNull();
  });

  it("Phase 6.9: a graduated key left stale by a price swap does not show bands for a bill Stripe charges differently", () => {
    // The old app swapped the id to a $90 custom rate but left the backfilled graduated key.
    const stale = { stripe_price_id: "price_custom_9000", stripe_price_lookup_key: GRADUATED_PRICE_LOOKUP_KEY, quantity: 1 };
    expect(billRateFromMirror({ ...stale, amount_cents: 9000 }, "price_graduated")).toBeNull();
    // The configured graduated id always wins, whatever the key says.
    expect(billRateFromMirror({ ...stale, stripe_price_id: "price_graduated", stripe_price_lookup_key: "custom_monthly_9000", amount_cents: 10000 }, "price_graduated")).toEqual(GRADUATED_RATE);
  });

  it("the graduated Price is recognised by its lookup key even when its id is not this environment's", () => {
    expect(
      billRateFromMirror(
        { stripe_price_id: "price_other_env", stripe_price_lookup_key: GRADUATED_PRICE_LOOKUP_KEY, amount_cents: 17500, quantity: 2 },
        "price_graduated"
      )
    ).toEqual(GRADUATED_RATE);
  });

  it("with no graduated id configured, an amount that matches the bands is graduated; anything else has no rate", () => {
    expect(billRateFromMirror({ stripe_price_id: "price_x", amount_cents: 17500, quantity: 2 }, "")).toEqual(GRADUATED_RATE);
    expect(billRateFromMirror({ stripe_price_id: "price_x", amount_cents: 14000, quantity: 2 }, "")).toBeNull();
  });
});
