import { describe, expect, it } from "vitest";
import { discountedAmountCents, effectiveAmountCents } from "@/lib/billingDisplay";

/**
 * Phase 1 of docs/billing-code-review-fixes-plan.md — the owner billing page
 * double-counted discounts on offline/check rows because `amount_cents` meant
 * "amount received" (already net) for those rows and "list rate" for card rows.
 * The fix made it mean the list rate everywhere; these tests pin that rule down
 * from the display side.
 */

describe("effectiveAmountCents — one rule for card and offline rows", () => {
  it("subtracts a percent discount from the list rate", () => {
    expect(effectiveAmountCents({ amountCents: 10000, discount: { percentOff: 25, amountOffCents: null } })).toBe(
      7500
    );
  });

  it("subtracts a fixed-dollar discount from the list rate", () => {
    expect(effectiveAmountCents({ amountCents: 10000, discount: { percentOff: null, amountOffCents: 1500 } })).toBe(
      8500
    );
  });

  it("returns the rate untouched when there is no discount", () => {
    expect(effectiveAmountCents({ amountCents: 10000, discount: null })).toBe(10000);
  });

  /**
   * The regression the code review caught. An offline row granted at a $100
   * list rate with 25% off must render $75 — the same as the identical card
   * row. Before the fix the admin entered $75 here (the check amount) and the
   * page rendered "$56 was $75".
   */
  it("prices an offline row identically to a card row on the same deal", () => {
    const discount = { percentOff: 25, amountOffCents: null };
    const card = effectiveAmountCents({ amountCents: 10000, discount });
    const offline = effectiveAmountCents({ amountCents: 10000, discount });
    expect(offline).toBe(card);
    expect(offline).toBe(7500);
  });

  it("never renders a negative price when the fixed discount exceeds the rate", () => {
    expect(effectiveAmountCents({ amountCents: 5000, discount: { percentOff: null, amountOffCents: 9900 } })).toBe(0);
  });

  it("rounds a percent discount to whole cents", () => {
    // 8999 * 0.75 = 6749.25
    expect(discountedAmountCents(8999, { percentOff: 25, amountOffCents: null })).toBe(6749);
  });

  it("prefers percent over amount when a row somehow carries both", () => {
    expect(discountedAmountCents(10000, { percentOff: 50, amountOffCents: 1000 })).toBe(5000);
  });

  it("treats a 100% discount as free", () => {
    expect(effectiveAmountCents({ amountCents: 10000, discount: { percentOff: 100, amountOffCents: null } })).toBe(0);
  });

  /**
   * Phase 3 — discount_percent_off widened from integer to numeric(5,2) so a
   * 12.5% grant no longer fails to write. Pin the arithmetic down for a
   * fractional value.
   */
  it("applies a fractional percent discount", () => {
    expect(discountedAmountCents(10000, { percentOff: 12.5, amountOffCents: null })).toBe(8750);
  });

  /**
   * supabase-js can return a `numeric` column as a string. The API routes
   * coerce with Number(...) before this ever runs, but the arithmetic itself
   * must not silently misbehave if a stringly-typed value slips through.
   */
  it("still computes correctly if percentOff arrives as a numeric string", () => {
    expect(
      discountedAmountCents(10000, { percentOff: "12.5" as unknown as number, amountOffCents: null })
    ).toBe(8750);
  });
});
