import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 3 of docs/billing-discounts-plan.md — POST /api/admin/billing
 * "apply-discount" / "remove-discount" actions.
 *
 * The route re-validates input before calling into lib/billingDiscounts.ts
 * (that module trusts its caller) so a fat-fingered "1000% off" or a
 * repeating discount with no duration_in_months never reaches the helper.
 */

const mocks = vi.hoisted(() => ({
  applyDiscountToSubscription: vi.fn(),
  removeDiscountFromSubscription: vi.fn(),
  setCustomPrice: vi.fn(),
  insertGrant: vi.fn(),
  requireAdminAuth: vi.fn(
    async (): Promise<
      { ok: true; authUserId: string; adminUsername: string } | { ok: false; status: number; error: string }
    > => ({ ok: true, authUserId: "admin-1", adminUsername: "admin" })
  ),
}));

vi.mock("@/lib/adminAuth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));

vi.mock("@/lib/billingDiscounts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/billingDiscounts")>("@/lib/billingDiscounts");
  return {
    ...actual,
    applyDiscountToSubscription: mocks.applyDiscountToSubscription,
    removeDiscountFromSubscription: mocks.removeDiscountFromSubscription,
  };
});

vi.mock("@/lib/billingCustomPrice", () => ({
  setCustomPrice: mocks.setCustomPrice,
}));

/**
 * Mirrors the route's `select()`. `billing_method` is required, not optional:
 * it is what routes a row down the offline path in lib/billingDiscounts.ts, so a
 * fixture that silently omits it would stop matching the real query.
 */
type SubRow = {
  id: string;
  billing_method: string;
  stripe_subscription_id: string | null;
  amount_cents: number;
  current_period_end: string | null;
};

const state = vi.hoisted(() => ({ row: null as SubRow | null }));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === "billing_subscriptions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: state.row })),
            })),
          })),
        };
      }
      if (table === "billing_discount_grants") {
        return {
          insert: vi.fn((...args: unknown[]) => {
            mocks.insertGrant(...args);
            return Promise.resolve({ error: null });
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  },
}));

import { POST } from "@/app/api/admin/billing/route";

const setRow = (row: SubRow | null) => {
  state.row = row;
};

const postRequest = (body: Record<string, unknown>) =>
  new Request("http://localhost/api/admin/billing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/admin/billing — apply-discount / remove-discount", () => {
  beforeEach(() => {
    mocks.applyDiscountToSubscription.mockReset();
    mocks.removeDiscountFromSubscription.mockReset();
    mocks.insertGrant.mockReset();
    mocks.requireAdminAuth.mockReset().mockResolvedValue({ ok: true, authUserId: "admin-1", adminUsername: "admin" });
    setRow({ id: "sub-1", billing_method: "stripe", stripe_subscription_id: "sub_stripe_1", amount_cents: 5000, current_period_end: null });
  });

  it("rejects apply-discount with 401 when admin auth fails, before touching the helper", async () => {
    mocks.requireAdminAuth.mockResolvedValue({ ok: false, error: "Unauthorized", status: 401 });

    const response = await POST(
      postRequest({ action: "apply-discount", venueId: "venue-1", discountType: "percent_off", percentOff: 25, duration: "forever" })
    );

    expect(response.status).toBe(401);
    expect(mocks.applyDiscountToSubscription).not.toHaveBeenCalled();
  });

  it("rejects remove-discount with 401 when admin auth fails", async () => {
    mocks.requireAdminAuth.mockResolvedValue({ ok: false, error: "Unauthorized", status: 401 });

    const response = await POST(postRequest({ action: "remove-discount", venueId: "venue-1" }));

    expect(response.status).toBe(401);
    expect(mocks.removeDiscountFromSubscription).not.toHaveBeenCalled();
  });

  it("rejects percent_off over 100 before calling the helper", async () => {
    const response = await POST(
      postRequest({
        action: "apply-discount",
        venueId: "venue-1",
        discountType: "percent_off",
        percentOff: 1000,
        duration: "forever",
      })
    );
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(mocks.applyDiscountToSubscription).not.toHaveBeenCalled();
    expect(mocks.insertGrant).not.toHaveBeenCalled();
  });

  it("rejects negative amount_off_cents before calling the helper", async () => {
    const response = await POST(
      postRequest({
        action: "apply-discount",
        venueId: "venue-1",
        discountType: "amount_off",
        amountOffCents: -500,
        duration: "once",
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.applyDiscountToSubscription).not.toHaveBeenCalled();
  });

  it("rejects a repeating duration with no duration_in_months", async () => {
    const response = await POST(
      postRequest({
        action: "apply-discount",
        venueId: "venue-1",
        discountType: "percent_off",
        percentOff: 25,
        duration: "repeating",
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.applyDiscountToSubscription).not.toHaveBeenCalled();
  });

  it("rejects a non-whole free_months before calling the helper", async () => {
    // free_months used to be the one type the route did NOT re-validate inline,
    // leaning entirely on the helper. Keep it symmetric with percent/amount.
    for (const months of [0, -3, 2.5, undefined]) {
      mocks.applyDiscountToSubscription.mockClear();
      const response = await POST(
        postRequest({ action: "apply-discount", venueId: "venue-1", discountType: "free_months", months })
      );

      expect(response.status).toBe(400);
      expect(mocks.applyDiscountToSubscription).not.toHaveBeenCalled();
    }
  });

  it("applies a valid discount and writes the audit grant row with the admin identity", async () => {
    mocks.applyDiscountToSubscription.mockResolvedValue({
      ok: true,
      mode: "stripe",
      couponId: "hc-pct-25-forever",
      label: "25% off forever",
      endsAt: null,
    });

    const response = await POST(
      postRequest({
        action: "apply-discount",
        venueId: "venue-1",
        discountType: "percent_off",
        percentOff: 25,
        duration: "forever",
        reason: "loyalty",
      })
    );
    const body = (await response.json()) as { ok: boolean };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.applyDiscountToSubscription).toHaveBeenCalledWith(
      state.row,
      { type: "percent_off", percentOff: 25, duration: "forever", durationInMonths: null }
    );
    expect(mocks.insertGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        venue_id: "venue-1",
        subscription_id: "sub-1",
        granted_by: "admin",
        discount_type: "percent_off",
        percent_off: 25,
        reason: "loyalty",
      })
    );
  });

  it("404s when the venue has no subscription row", async () => {
    setRow(null);

    const response = await POST(
      postRequest({
        action: "apply-discount",
        venueId: "venue-missing",
        discountType: "free_months",
        months: 2,
      })
    );

    expect(response.status).toBe(404);
    expect(mocks.applyDiscountToSubscription).not.toHaveBeenCalled();
  });

  it("remove-discount calls the helper with the subscription row", async () => {
    mocks.removeDiscountFromSubscription.mockResolvedValue({ ok: true, mode: "stripe" });

    const response = await POST(postRequest({ action: "remove-discount", venueId: "venue-1" }));
    const body = (await response.json()) as { ok: boolean };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.removeDiscountFromSubscription).toHaveBeenCalledWith(state.row);
  });
});

/**
 * Phase 8 — "set-custom-price". A negotiated permanent rate is a Price swap,
 * not a discount, but it lands in the same audit table under 'custom_price'.
 */
describe("POST /api/admin/billing — set-custom-price", () => {
  beforeEach(() => {
    mocks.setCustomPrice.mockReset();
    mocks.insertGrant.mockReset();
    setRow({ id: "sub-1", billing_method: "stripe", stripe_subscription_id: "sub_stripe_1", amount_cents: 10000, current_period_end: null });
  });

  it("rejects a missing price id before touching the helper", async () => {
    const response = await POST(postRequest({ action: "set-custom-price", venueId: "venue-1" }));

    expect(response.status).toBe(400);
    expect(mocks.setCustomPrice).not.toHaveBeenCalled();
  });

  it("swaps the price and records a custom_price grant with the new amount", async () => {
    mocks.setCustomPrice.mockResolvedValue({
      ok: true,
      priceId: "price_new",
      amountCents: 7500,
      effective: "next_cycle",
    });

    const response = await POST(
      postRequest({
        action: "set-custom-price",
        venueId: "venue-1",
        stripePriceId: "  price_new  ",
        reason: "negotiated",
      })
    );
    const body = (await response.json()) as { ok: boolean; amountCents: number };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, amountCents: 7500 });
    expect(mocks.setCustomPrice).toHaveBeenCalledWith(state.row, "price_new");
    expect(mocks.insertGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        venue_id: "venue-1",
        subscription_id: "sub-1",
        granted_by: "admin",
        discount_type: "custom_price",
        custom_price_cents: 7500,
        reason: "negotiated",
      })
    );
  });

  it("surfaces the helper's refusal and writes no audit row", async () => {
    mocks.setCustomPrice.mockResolvedValue({ ok: false, status: 400, error: "That price is archived at Stripe." });

    const response = await POST(
      postRequest({ action: "set-custom-price", venueId: "venue-1", stripePriceId: "price_old" })
    );

    expect(response.status).toBe(400);
    expect(mocks.insertGrant).not.toHaveBeenCalled();
  });

  it("404s when the venue has no subscription row", async () => {
    setRow(null);

    const response = await POST(
      postRequest({ action: "set-custom-price", venueId: "venue-missing", stripePriceId: "price_new" })
    );

    expect(response.status).toBe(404);
    expect(mocks.setCustomPrice).not.toHaveBeenCalled();
  });
});
