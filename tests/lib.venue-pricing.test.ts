import { describe, expect, it } from "vitest";
import {
  ANCHOR_VENUE_PRICE_CENTS,
  GRADUATED_PRICE_LOOKUP_KEY,
  VENUE_PRICE_TIERS,
  graduatedTotalCents,
  monthlyTotalCents,
  nextVenuePriceCents,
  tierBreakdown,
  venuePriceCents,
} from "@/lib/venuePricing";

// docs/multi-venue-volume-billing-plan.md §1 — every row of both tables, verbatim.
describe("venue pricing (graduated bands)", () => {
  it("prices each venue number by its band", () => {
    const perVenue: Array<[number, number]> = [
      [1, 10000],
      [2, 7500],
      [5, 7500],
      [6, 6000],
      [15, 6000],
      [16, 4500],
      [17, 4500],
      [500, 4500],
    ];
    for (const [venueNumber, cents] of perVenue) {
      expect(venuePriceCents(venueNumber), `venue #${venueNumber}`).toBe(cents);
    }
  });

  it("matches the plan's monthly-total table", () => {
    const totals: Array<[number, number]> = [
      [1, 10000],
      [2, 17500],
      [3, 25000],
      [5, 40000],
      [6, 46000],
      [10, 70000],
      [15, 100000],
      [16, 104500],
      [20, 122500],
      [30, 167500],
    ];
    for (const [venues, cents] of totals) {
      expect(monthlyTotalCents(venues), `${venues} venues`).toBe(cents);
    }
  });

  it("is graduated: adding a venue always adds exactly that venue's band price", () => {
    for (let n = 1; n <= 40; n++) {
      expect(monthlyTotalCents(n + 1) - monthlyTotalCents(n)).toBe(nextVenuePriceCents(n));
      expect(nextVenuePriceCents(n)).toBeLessThanOrEqual(ANCHOR_VENUE_PRICE_CENTS);
    }
  });

  it("handles a large chain without overflow or float drift", () => {
    expect(monthlyTotalCents(1000)).toBe(100000 + 985 * 4500);
    expect(Number.isInteger(monthlyTotalCents(1000))).toBe(true);
  });

  it("refuses zero, negative and fractional venue counts", () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() => monthlyTotalCents(bad)).toThrow(RangeError);
      expect(() => venuePriceCents(bad)).toThrow(RangeError);
      expect(() => tierBreakdown(bad)).toThrow(RangeError);
      expect(() => nextVenuePriceCents(bad)).toThrow(RangeError);
    }
  });

  it("breaks a bill down into the bands it uses", () => {
    expect(tierBreakdown(1)).toEqual([
      { fromVenue: 1, toVenue: 1, venues: 1, unitAmountCents: 10000, subtotalCents: 10000 },
    ]);
    expect(tierBreakdown(4).map((l) => [l.venues, l.unitAmountCents])).toEqual([
      [1, 10000],
      [3, 7500],
    ]);
    expect(tierBreakdown(16).map((l) => [l.fromVenue, l.toVenue, l.venues])).toEqual([
      [1, 1, 1],
      [2, 5, 4],
      [6, 15, 10],
      [16, 16, 1],
    ]);
    for (const n of [1, 2, 5, 6, 15, 16, 30]) {
      const lines = tierBreakdown(n);
      expect(lines.reduce((sum, l) => sum + l.subtotalCents, 0)).toBe(monthlyTotalCents(n));
      expect(lines.reduce((sum, l) => sum + l.venues, 0)).toBe(n);
    }
  });

  it("graduatedTotalCents accepts quantity 0 (an empty Stripe item) and any tier list", () => {
    expect(graduatedTotalCents(VENUE_PRICE_TIERS, 0)).toBe(0);
    expect(graduatedTotalCents([{ upTo: null, unitAmountCents: 1234 }], 3)).toBe(3702);
    expect(() => graduatedTotalCents(VENUE_PRICE_TIERS, -1)).toThrow(RangeError);
  });

  it("pins the tier constant and lookup key (a change needs a NEW Stripe Price, see the module header)", () => {
    expect(VENUE_PRICE_TIERS).toEqual([
      { upTo: 1, unitAmountCents: 10000 },
      { upTo: 5, unitAmountCents: 7500 },
      { upTo: 15, unitAmountCents: 6000 },
      { upTo: null, unitAmountCents: 4500 },
    ]);
    expect(GRADUATED_PRICE_LOOKUP_KEY).toBe("hightop_venue_graduated_monthly_v1");
  });
});
