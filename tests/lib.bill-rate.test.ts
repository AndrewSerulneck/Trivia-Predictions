import { describe, expect, it } from "vitest";

import {
  billRateFromMirror,
  billRateFromPrice,
  GRADUATED_PRICE_LOOKUP_KEY,
  GRADUATED_RATE,
  rateBreakdown,
  rateMonthlyTotalCents,
  rateVenuePriceCents,
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

  it("a flat monthly USD price is a per-venue rate", () => {
    expect(billRateFromPrice(flat(), IDS)).toEqual({ kind: "per_venue", unitAmountCents: 7000 });
    expect(billRateFromPrice(flat({ lookup_key: null, id: "price_pasted" }), IDS)).toEqual({ kind: "per_venue", unitAmountCents: 7000 });
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

describe("billRateFromMirror (our billing_subscriptions columns, no Stripe call)", () => {
  it("offline (no price) and the graduated price read as graduated", () => {
    expect(billRateFromMirror({ stripe_price_id: null, amount_cents: 15000, quantity: null }, "price_graduated")).toEqual(GRADUATED_RATE);
    expect(billRateFromMirror({ stripe_price_id: "price_graduated", amount_cents: 25000, quantity: 3 }, "price_graduated")).toEqual(
      GRADUATED_RATE
    );
  });

  it("a flat price reads as per-venue: amount ÷ venues", () => {
    expect(billRateFromMirror({ stripe_price_id: "price_custom_7000", amount_cents: 21000, quantity: 3 }, "price_graduated")).toEqual({
      kind: "per_venue",
      unitAmountCents: 7000,
    });
    // Old rows without the quantity mirror are 1 venue.
    expect(billRateFromMirror({ stripe_price_id: "price_custom_7000", amount_cents: 7000, quantity: null }, "price_graduated")).toEqual({
      kind: "per_venue",
      unitAmountCents: 7000,
    });
  });

  it("with no graduated id configured, an amount that matches the bands is graduated", () => {
    expect(billRateFromMirror({ stripe_price_id: "price_x", amount_cents: 17500, quantity: 2 }, "")).toEqual(GRADUATED_RATE);
    expect(billRateFromMirror({ stripe_price_id: "price_x", amount_cents: 14000, quantity: 2 }, "")).toEqual({
      kind: "per_venue",
      unitAmountCents: 7000,
    });
  });
});
