import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 7 of docs/billing-discounts-plan.md — GET/POST/PATCH
 * /api/admin/billing/promo-codes (create/list/deactivate Stripe Promotion
 * Codes for new signups). Validation mirrors Phase 3's apply-discount rules;
 * unit tests here cover only the parts specific to promo codes
 * (max_redemptions/expires_at input validation and the create/list/deactivate
 * Stripe calls) — the discount-spec validation itself is covered by
 * tests/lib.billingDiscounts.test.ts.
 */

const mocks = vi.hoisted(() => ({
  promoList: vi.fn(),
  promoCreate: vi.fn(),
  promoUpdate: vi.fn(),
  couponRetrieve: vi.fn(),
  couponCreate: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({
  requireAdminAuth: vi.fn(async () => ({ ok: true, authUserId: "admin-1", adminUsername: "admin" })),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    promotionCodes: { list: mocks.promoList, create: mocks.promoCreate, update: mocks.promoUpdate },
    coupons: { retrieve: mocks.couponRetrieve, create: mocks.couponCreate },
  },
}));

import { GET, POST, PATCH } from "@/app/api/admin/billing/promo-codes/route";

const post = (body: Record<string, unknown>) =>
  new Request("http://localhost/api/admin/billing/promo-codes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const patch = (body: Record<string, unknown>) =>
  new Request("http://localhost/api/admin/billing/promo-codes", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("admin billing promo codes", () => {
  beforeEach(() => {
    mocks.promoList.mockReset();
    mocks.promoCreate.mockReset();
    mocks.promoUpdate.mockReset();
    mocks.couponRetrieve.mockReset().mockRejectedValue({ code: "resource_missing" });
    mocks.couponCreate.mockReset().mockResolvedValue({ id: "hc-pct-10-once", name: "10% off for one month" });
  });

  it("GET lists codes with redemption counts, across every page", async () => {
    const page = (id: string, code: string, timesRedeemed: number) => ({
      id,
      code,
      active: true,
      times_redeemed: timesRedeemed,
      max_redemptions: 100,
      expires_at: null,
      promotion: { coupon: { id: "hc-pct-50-once", name: "50% off for one month" } },
    });
    // The route auto-pages: a code past the first page must still be listed, since
    // this panel is the only place a promo code can be deactivated.
    mocks.promoList.mockReturnValue({
      autoPagingToArray: vi.fn().mockResolvedValue([
        page("promo_1", "LAUNCH50", 3),
        page("promo_2", "PAGE2CODE", 7),
      ]),
    });

    const response = await GET(new Request("http://localhost/api/admin/billing/promo-codes"));
    const body = (await response.json()) as { ok: boolean; codes: Array<{ code: string; timesRedeemed: number }> };

    expect(response.status).toBe(200);
    expect(body.codes[0].code).toBe("LAUNCH50");
    expect(body.codes[0].timesRedeemed).toBe(3);
    expect(body.codes[1].code).toBe("PAGE2CODE");
  });

  it("POST rejects an invalid discount type before calling Stripe", async () => {
    const response = await POST(post({ discountType: "bogus" }));

    expect(response.status).toBe(400);
    expect(mocks.couponCreate).not.toHaveBeenCalled();
    expect(mocks.promoCreate).not.toHaveBeenCalled();
  });

  it("POST rejects a non-positive maxRedemptions", async () => {
    const response = await POST(
      post({ discountType: "percent_off", percentOff: 10, duration: "once", maxRedemptions: 0 })
    );

    expect(response.status).toBe(400);
    expect(mocks.promoCreate).not.toHaveBeenCalled();
  });

  it("POST rejects an expiresAt in the past", async () => {
    const response = await POST(
      post({
        discountType: "percent_off",
        percentOff: 10,
        duration: "once",
        expiresAt: "2020-01-01T00:00:00.000Z",
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.promoCreate).not.toHaveBeenCalled();
  });

  it("POST creates a promo code wrapping a (reused) coupon", async () => {
    mocks.promoCreate.mockResolvedValue({
      id: "promo_2",
      code: "LAUNCH50",
      active: true,
      times_redeemed: 0,
      max_redemptions: 100,
      expires_at: null,
    });

    const response = await POST(
      post({
        discountType: "percent_off",
        percentOff: 10,
        duration: "once",
        code: "launch50",
        maxRedemptions: 100,
      })
    );
    const body = (await response.json()) as { ok: boolean; code: { code: string } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.promoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        promotion: { type: "coupon", coupon: "hc-pct-10-once" },
        code: "LAUNCH50",
        max_redemptions: 100,
      })
    );
  });

  it("PATCH deactivates a promo code", async () => {
    mocks.promoUpdate.mockResolvedValue({ id: "promo_1", active: false });

    const response = await PATCH(patch({ id: "promo_1" }));
    const body = (await response.json()) as { ok: boolean; code: { active: boolean } };

    expect(response.status).toBe(200);
    expect(body.code.active).toBe(false);
    expect(mocks.promoUpdate).toHaveBeenCalledWith("promo_1", { active: false });
  });

  it("PATCH requires an id", async () => {
    const response = await PATCH(patch({}));

    expect(response.status).toBe(400);
    expect(mocks.promoUpdate).not.toHaveBeenCalled();
  });
});
