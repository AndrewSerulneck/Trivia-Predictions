import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: null }));
vi.mock("@/lib/stripe", () => ({ stripe: null }));

import { compareBillQuantities, type StripeQuantityView } from "@/lib/billingQuantityDrift";
import { billedVenueCountFromRows, type BillMembership } from "@/lib/venueBilling";

/**
 * Multi-venue billing Phase 6 — the daily, REPORT-ONLY Stripe quantity check. The comparison is
 * pure; these pin its rules.
 */

const member = (venue: string, bill: string, extra: Partial<BillMembership> = {}): BillMembership => ({
  venue_id: venue,
  subscription_id: bill,
  role: "added",
  added_at: null,
  remove_at: null,
  removed_at: null,
  ...extra,
});
const view = (quantity: number | null, extra: Partial<StripeQuantityView> = {}): StripeQuantityView => ({
  quantity,
  itemCount: 1,
  pendingUpdate: false,
  ...extra,
});

describe("billedVenueCountFromRows", () => {
  it("counts the anchor plus every billed venue; leaving and removed venues do not count", () => {
    expect(billedVenueCountFromRows("a", [])).toBe(1);
    expect(
      billedVenueCountFromRows("a", [
        member("a", "b1", { role: "anchor" }),
        member("v2", "b1"),
        member("v3", "b1", { remove_at: "2026-11-01T00:00:00Z" }),
        member("v4", "b1", { removed_at: "2026-10-01T00:00:00Z", remove_at: "2026-10-01T00:00:00Z" }),
      ])
    ).toBe(2);
    // An anchor set to leave (a failed re-anchor) is counted honestly, not assumed.
    expect(billedVenueCountFromRows("a", [member("a", "b1", { remove_at: "2026-11-01T00:00:00Z" }), member("v2", "b1")])).toBe(1);
  });
});

describe("compareBillQuantities", () => {
  const bills = [
    { id: "b1", venue_id: "a", stripe_subscription_id: "sub_1" },
    { id: "b2", venue_id: "c", stripe_subscription_id: "sub_2" },
  ];

  it("reports a bill whose Stripe quantity differs from the venues we bill", () => {
    const memberships = new Map([["b1", [member("a", "b1", { role: "anchor" }), member("v2", "b1")]]]);
    const stripe = new Map([
      ["sub_1", view(3)],
      ["sub_2", view(1)],
    ]);
    const result = compareBillQuantities(bills, memberships, stripe, new Set(), false);
    expect(result.checked).toBe(2);
    expect(result.drift).toEqual([{ billId: "b1", stripeSubscriptionId: "sub_1", stripeQuantity: 3, billedVenueCount: 2 }]);
  });

  it("skips bills with a change in flight (ledger or Stripe pending update)", () => {
    const stripe = new Map([
      ["sub_1", view(5, { pendingUpdate: true })],
      ["sub_2", view(9)],
    ]);
    const result = compareBillQuantities(bills, new Map(), stripe, new Set(["b2"]), false);
    expect(result).toMatchObject({ checked: 0, skippedInFlight: 2, drift: [] });
  });

  it("notes a live bill Stripe doesn't list — unless the listing was truncated", () => {
    expect(compareBillQuantities(bills, new Map(), new Map([["sub_1", view(1)]]), new Set(), false).missingAtStripe).toEqual(["b2"]);
    expect(compareBillQuantities(bills, new Map(), new Map([["sub_1", view(1)]]), new Set(), true).missingAtStripe).toEqual([]);
  });

  it("a subscription with other than one item is reported, not counted", () => {
    const result = compareBillQuantities(bills.slice(0, 1), new Map(), new Map([["sub_1", view(null, { itemCount: 2 })]]), new Set(), false);
    expect(result).toMatchObject({ unexpectedItems: ["b1"], drift: [] });
  });
});
