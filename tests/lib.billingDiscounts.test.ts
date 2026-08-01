import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 2 of docs/billing-discounts-plan.md. Two properties carry the money risk
 * and are asserted hardest here:
 *   1. Each spec type maps to the RIGHT Stripe coupon parameters (a fat-fingered
 *      "1000% off" or a repeating coupon with no duration must never reach Stripe).
 *   2. Offline/check-billed rows (billing_method='offline') take the local path,
 *      NEVER call Stripe, and NEVER rewrite amount_cents — the mirror carries the
 *      discount so it stays reversible and can't compound. See the module header.
 */

const mocks = vi.hoisted(() => ({
  couponRetrieve: vi.fn(),
  couponCreate: vi.fn(),
  subscriptionUpdate: vi.fn(),
  dbUpdate: vi.fn((_payload: Record<string, unknown>) => undefined),
  eq: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  OFFLINE_BILLING_METHOD: "offline",
  stripe: {
    coupons: { retrieve: mocks.couponRetrieve, create: mocks.couponCreate },
    subscriptions: { update: mocks.subscriptionUpdate },
  },
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      update: vi.fn((payload: Record<string, unknown>) => {
        mocks.dbUpdate(payload);
        return { eq: mocks.eq };
      }),
    })),
  },
}));

import {
  applyDiscountToSubscription,
  couponIdForSpec,
  couponParamsForSpec,
  createOrReuseCoupon,
  describeDiscount,
  removeDiscountFromSubscription,
  validateDiscountSpec,
  type DiscountSpec,
} from "@/lib/billingDiscounts";

const resourceMissing = Object.assign(new Error("No such coupon"), { code: "resource_missing" });

const STRIPE_ROW = {
  id: "row-1",
  billing_method: "stripe",
  stripe_subscription_id: "sub_stripe_1",
  amount_cents: 10000,
  current_period_end: "2026-08-31T00:00:00.000Z",
};

const OFFLINE_ROW = {
  id: "row-2",
  billing_method: "offline",
  stripe_subscription_id: null,
  amount_cents: 10000,
  current_period_end: "2026-08-31T00:00:00.000Z",
};

describe("couponParamsForSpec", () => {
  it("maps N free months to a 100%-off repeating coupon", () => {
    expect(couponParamsForSpec({ type: "free_months", months: 3 })).toEqual({
      name: "3 free months",
      percent_off: 100,
      duration: "repeating",
      duration_in_months: 3,
    });
  });

  it("maps percent off with its duration", () => {
    expect(
      couponParamsForSpec({ type: "percent_off", percentOff: 25, duration: "forever" })
    ).toEqual({ name: "25% off forever", percent_off: 25, duration: "forever" });

    expect(
      couponParamsForSpec({
        type: "percent_off",
        percentOff: 50,
        duration: "repeating",
        durationInMonths: 6,
      })
    ).toEqual({
      name: "50% off for 6 months",
      percent_off: 50,
      duration: "repeating",
      duration_in_months: 6,
    });
  });

  it("maps fixed dollar off to amount_off in cents with a currency", () => {
    expect(
      couponParamsForSpec({ type: "amount_off", amountOffCents: 2500, duration: "once" })
    ).toEqual({ name: "$25 off for one month", amount_off: 2500, currency: "usd", duration: "once" });
  });

  it("derives a distinct, stable coupon id per spec so identical grants reuse one coupon", () => {
    const a: DiscountSpec = { type: "percent_off", percentOff: 25, duration: "forever" };
    expect(couponIdForSpec(a)).toBe(couponIdForSpec({ ...a }));
    expect(couponIdForSpec(a)).not.toBe(couponIdForSpec({ type: "free_months", months: 3 }));
    expect(couponIdForSpec({ type: "amount_off", amountOffCents: 2500, duration: "once" })).not.toBe(
      couponIdForSpec({ type: "amount_off", amountOffCents: 2500, duration: "forever" })
    );
  });

  it("labels each type for the mirror's discount_label", () => {
    expect(describeDiscount({ type: "free_months", months: 1 })).toBe("1 free month");
    expect(describeDiscount({ type: "free_months", months: 2 })).toBe("2 free months");
  });
});

describe("validateDiscountSpec", () => {
  it("rejects percent_off greater than 100", () => {
    expect(validateDiscountSpec({ type: "percent_off", percentOff: 1000, duration: "once" })).toMatch(
      /no more than 100/
    );
  });

  it("rejects zero/negative values", () => {
    expect(validateDiscountSpec({ type: "percent_off", percentOff: 0, duration: "once" })).toBeTruthy();
    expect(
      validateDiscountSpec({ type: "amount_off", amountOffCents: -500, duration: "once" })
    ).toBeTruthy();
    expect(validateDiscountSpec({ type: "free_months", months: 0 })).toBeTruthy();
  });

  it("rejects a repeating duration with no duration_in_months", () => {
    expect(
      validateDiscountSpec({ type: "percent_off", percentOff: 25, duration: "repeating" })
    ).toMatch(/whole number of months/);
    expect(
      validateDiscountSpec({
        type: "amount_off",
        amountOffCents: 500,
        duration: "repeating",
        durationInMonths: 0,
      })
    ).toBeTruthy();
  });

  it("rejects duration_in_months on a non-repeating duration", () => {
    expect(
      validateDiscountSpec({
        type: "percent_off",
        percentOff: 25,
        duration: "forever",
        durationInMonths: 3,
      })
    ).toBeTruthy();
  });

  it("accepts the three legal shapes", () => {
    expect(validateDiscountSpec({ type: "free_months", months: 3 })).toBeNull();
    expect(
      validateDiscountSpec({ type: "percent_off", percentOff: 100, duration: "once" })
    ).toBeNull();
    expect(
      validateDiscountSpec({
        type: "amount_off",
        amountOffCents: 2500,
        duration: "repeating",
        durationInMonths: 4,
      })
    ).toBeNull();
  });
});

describe("createOrReuseCoupon", () => {
  beforeEach(() => {
    mocks.couponRetrieve.mockReset();
    mocks.couponCreate.mockReset();
    mocks.subscriptionUpdate.mockReset();
    mocks.dbUpdate.mockReset();
    mocks.eq.mockReset().mockResolvedValue({ error: null });
  });

  it("creates the coupon under its deterministic id when none exists", async () => {
    mocks.couponRetrieve.mockRejectedValue(resourceMissing);
    mocks.couponCreate.mockResolvedValue({ id: "hc-free-3mo" });

    const spec: DiscountSpec = { type: "free_months", months: 3 };
    const result = await createOrReuseCoupon(spec);

    expect(result).toEqual({ ok: true, coupon: { id: "hc-free-3mo" }, reused: false });
    expect(mocks.couponCreate).toHaveBeenCalledWith({
      ...couponParamsForSpec(spec),
      id: couponIdForSpec(spec),
    });
  });

  it("reuses an equivalent existing coupon instead of minting a duplicate", async () => {
    mocks.couponRetrieve.mockResolvedValue({
      id: "hc-free-3mo",
      name: "3 free months",
      valid: true,
      percent_off: 100,
      amount_off: null,
      currency: null,
      duration: "repeating",
      duration_in_months: 3,
    });

    const result = await createOrReuseCoupon({ type: "free_months", months: 3 });

    expect(result.ok && result.reused).toBe(true);
    expect(mocks.couponCreate).not.toHaveBeenCalled();
  });

  it("does not reuse a same-math coupon sitting at our id under a different name", async () => {
    mocks.couponRetrieve.mockResolvedValue({
      id: "hc-free-3mo",
      name: "Q3 winback promo",
      valid: true,
      percent_off: 100,
      amount_off: null,
      currency: null,
      duration: "repeating",
      duration_in_months: 3,
    });
    mocks.couponCreate.mockResolvedValue({ id: "generated_1", name: "3 free months" });

    const result = await createOrReuseCoupon({ type: "free_months", months: 3 });

    // The webhook mirrors coupon.name into discount_label, so reusing this would
    // silently relabel what the partner sees. Mint a fresh Stripe-generated id.
    expect(result.ok && result.reused).toBe(false);
    expect(mocks.couponCreate).toHaveBeenCalledWith(
      expect.not.objectContaining({ id: expect.anything() })
    );
  });

  it("rejects an illegal spec before any Stripe call", async () => {
    const result = await createOrReuseCoupon({
      type: "percent_off",
      percentOff: 150,
      duration: "once",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Percent off must be greater than 0 and no more than 100.",
    });
    expect(mocks.couponRetrieve).not.toHaveBeenCalled();
    expect(mocks.couponCreate).not.toHaveBeenCalled();
  });
});

describe("applyDiscountToSubscription — Stripe-backed rows", () => {
  beforeEach(() => {
    mocks.couponRetrieve.mockReset().mockRejectedValue(resourceMissing);
    mocks.couponCreate.mockReset().mockResolvedValue({
      id: "hc-pct-25-forever",
      percent_off: 25,
      amount_off: null,
    });
    mocks.subscriptionUpdate.mockReset().mockResolvedValue({ discounts: [] });
    mocks.dbUpdate.mockReset();
    mocks.eq.mockReset().mockResolvedValue({ error: null });
  });

  it("attaches the coupon via the discounts array and mirrors it locally", async () => {
    mocks.subscriptionUpdate.mockResolvedValue({
      discounts: [{ id: "di_1", end: 1798761600 }],
    });

    const result = await applyDiscountToSubscription(STRIPE_ROW, {
      type: "percent_off",
      percentOff: 25,
      duration: "forever",
    });

    expect(mocks.subscriptionUpdate).toHaveBeenCalledWith("sub_stripe_1", {
      discounts: [{ coupon: "hc-pct-25-forever" }],
      expand: ["discounts"],
    });
    expect(result).toEqual({
      ok: true,
      mode: "stripe",
      couponId: "hc-pct-25-forever",
      label: "25% off forever",
      endsAt: new Date(1798761600 * 1000).toISOString(),
    });
    expect(mocks.dbUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_coupon_id: "hc-pct-25-forever",
        discount_label: "25% off forever",
        discount_percent_off: 25,
      })
    );
  });

  it("never touches amount_cents or current_period_end for a Stripe row", async () => {
    await applyDiscountToSubscription(STRIPE_ROW, {
      type: "percent_off",
      percentOff: 25,
      duration: "forever",
    });

    const payload = mocks.dbUpdate.mock.calls[0][0];
    expect(payload).not.toHaveProperty("amount_cents");
    expect(payload).not.toHaveProperty("current_period_end");
  });

  it("returns a 502 and writes nothing when Stripe rejects the update", async () => {
    mocks.subscriptionUpdate.mockRejectedValue(new Error("stripe down"));

    const result = await applyDiscountToSubscription(STRIPE_ROW, {
      type: "percent_off",
      percentOff: 25,
      duration: "forever",
    });

    expect(result).toEqual({ ok: false, status: 502, error: "stripe down" });
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });
});

describe("applyDiscountToSubscription — offline/check-billed rows never call Stripe", () => {
  beforeEach(() => {
    mocks.couponRetrieve.mockReset();
    mocks.couponCreate.mockReset();
    mocks.subscriptionUpdate.mockReset();
    mocks.dbUpdate.mockReset();
    mocks.eq.mockReset().mockResolvedValue({ error: null });
  });

  const expectNoStripe = () => {
    expect(mocks.couponRetrieve).not.toHaveBeenCalled();
    expect(mocks.couponCreate).not.toHaveBeenCalled();
    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
  };

  it("pushes current_period_end forward for free months", async () => {
    const result = await applyDiscountToSubscription(OFFLINE_ROW, {
      type: "free_months",
      months: 3,
    });

    expect(result).toMatchObject({ ok: true, mode: "local", couponId: null, label: "3 free months" });
    const payload = mocks.dbUpdate.mock.calls[0][0];
    expect(payload.current_period_end).toBe("2026-11-30T00:00:00.000Z");
    expect(payload.discount_ends_at).toBe("2026-11-30T00:00:00.000Z");
    expect(payload).not.toHaveProperty("amount_cents");
    // Free months move the paid-through date, not the rate. Mirroring 100% here
    // would make every surface render this partner's rate as $0 forever.
    expect(payload.discount_percent_off).toBeNull();
    expectNoStripe();
  });

  it("mirrors percent off without touching amount_cents", async () => {
    await applyDiscountToSubscription(OFFLINE_ROW, {
      type: "percent_off",
      percentOff: 25,
      duration: "forever",
    });

    const payload = mocks.dbUpdate.mock.calls[0][0];
    // The list rate stays put: rewriting it made the discount compound on a
    // second apply, unrestorable on remove, and silently lost on the next
    // grant-manual. Readers compute the net from the mirror instead.
    expect(payload).not.toHaveProperty("amount_cents");
    expect(payload.discount_percent_off).toBe(25);
    expect(payload.stripe_coupon_id).toBeNull();
    expectNoStripe();
  });

  it("mirrors fixed dollar off without touching amount_cents", async () => {
    await applyDiscountToSubscription(
      { ...OFFLINE_ROW, amount_cents: 2000 },
      { type: "amount_off", amountOffCents: 2500, duration: "forever" }
    );

    const payload = mocks.dbUpdate.mock.calls[0][0];
    expect(payload).not.toHaveProperty("amount_cents");
    expect(payload.discount_amount_off_cents).toBe(2500);
    expectNoStripe();
  });

  it("applying twice cannot compound, because the base never moves", async () => {
    const spec: DiscountSpec = { type: "percent_off", percentOff: 25, duration: "forever" };
    await applyDiscountToSubscription(OFFLINE_ROW, spec);
    await applyDiscountToSubscription(OFFLINE_ROW, spec);

    for (const [payload] of mocks.dbUpdate.mock.calls) {
      expect(payload).not.toHaveProperty("amount_cents");
      expect(payload.discount_percent_off).toBe(25);
    }
  });

  it("refuses a duration nothing local can expire", async () => {
    for (const duration of ["once", "repeating"] as const) {
      const result = await applyDiscountToSubscription(OFFLINE_ROW, {
        type: "percent_off",
        percentOff: 25,
        duration,
        durationInMonths: duration === "repeating" ? 3 : null,
      });

      expect(result.ok).toBe(false);
      expect(result).toMatchObject({ status: 400 });
    }
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
    expectNoStripe();
  });

  it("refuses a card-billed row that has no subscription to discount yet", async () => {
    const result = await applyDiscountToSubscription(
      { ...STRIPE_ROW, stripe_subscription_id: null },
      { type: "percent_off", percentOff: 25, duration: "forever" }
    );

    // Must NOT fall through to the local path — that would rewrite a real Stripe
    // partner's billing behind Stripe's back.
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "This venue has no active Stripe subscription to discount yet.",
    });
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
    expectNoStripe();
  });

  it("surfaces a 500 when the only write fails", async () => {
    mocks.eq.mockResolvedValue({ error: { message: "nope" } });

    const result = await applyDiscountToSubscription(OFFLINE_ROW, {
      type: "percent_off",
      percentOff: 25,
      duration: "forever",
    });

    expect(result).toEqual({ ok: false, status: 500, error: "Failed to apply discount." });
  });

  it("rejects an illegal spec before writing anything", async () => {
    const result = await applyDiscountToSubscription(OFFLINE_ROW, {
      type: "percent_off",
      percentOff: 150,
      duration: "once",
    });

    expect(result.ok).toBe(false);
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
    expectNoStripe();
  });
});

describe("removeDiscountFromSubscription", () => {
  beforeEach(() => {
    mocks.subscriptionUpdate.mockReset().mockResolvedValue({});
    mocks.dbUpdate.mockReset();
    mocks.eq.mockReset().mockResolvedValue({ error: null });
  });

  it("clears the discount at Stripe with an empty string, not an empty array", async () => {
    const result = await removeDiscountFromSubscription(STRIPE_ROW);

    expect(mocks.subscriptionUpdate).toHaveBeenCalledWith("sub_stripe_1", { discounts: "" });
    expect(result).toEqual({ ok: true, mode: "stripe" });
    expect(mocks.dbUpdate).toHaveBeenCalledWith({
      stripe_coupon_id: null,
      discount_label: null,
      discount_percent_off: null,
      discount_amount_off_cents: null,
      discount_ends_at: null,
    });
  });

  it("clears only the local mirror for an offline row, without calling Stripe", async () => {
    const result = await removeDiscountFromSubscription(OFFLINE_ROW);

    expect(result).toEqual({ ok: true, mode: "local" });
    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
    expect(mocks.dbUpdate).toHaveBeenCalledTimes(1);
  });

  it("returns a 502 without clearing the mirror when Stripe fails", async () => {
    mocks.subscriptionUpdate.mockRejectedValue(new Error("stripe down"));

    const result = await removeDiscountFromSubscription(STRIPE_ROW);

    expect(result).toEqual({ ok: false, status: 502, error: "stripe down" });
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });
});
