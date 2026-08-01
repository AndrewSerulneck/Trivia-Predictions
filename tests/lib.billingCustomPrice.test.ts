import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 8 of docs/billing-discounts-plan.md — the permanent negotiated rate.
 *
 * The two things that must never regress:
 *   1. The swap sends proration_behavior EXPLICITLY (never Stripe's default),
 *      so a negotiated deal can't surprise a partner with an immediate charge.
 *   2. amount_cents is mirrored to the new price — reporting the real rate
 *      everywhere is the entire reason this is a Price and not a coupon.
 */

const mocks = vi.hoisted(() => ({
  priceRetrieve: vi.fn(),
  subRetrieve: vi.fn(),
  subUpdate: vi.fn(),
  dbUpdate: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    prices: { retrieve: mocks.priceRetrieve },
    subscriptions: { retrieve: mocks.subRetrieve, update: mocks.subUpdate },
  },
}));

const dbState = vi.hoisted(() => ({ error: null as { message: string } | null }));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      update: vi.fn((payload: unknown) => {
        mocks.dbUpdate(payload);
        return { eq: vi.fn(() => Promise.resolve({ error: dbState.error })) };
      }),
    })),
  },
}));

import { CUSTOM_PRICE_PRORATION_BEHAVIOR, setCustomPrice } from "@/lib/billingCustomPrice";

const row = { id: "sub-row-1", stripe_subscription_id: "sub_123", amount_cents: 10000 };

const okPrice = (overrides: Record<string, unknown> = {}) => ({
  id: "price_new",
  active: true,
  type: "recurring",
  recurring: { interval: "month" },
  currency: "usd",
  unit_amount: 7500,
  ...overrides,
});

const stripeMissing = () => Object.assign(new Error("No such price"), { code: "resource_missing" });

describe("setCustomPrice", () => {
  beforeEach(() => {
    mocks.priceRetrieve.mockReset().mockResolvedValue(okPrice());
    mocks.subRetrieve.mockReset().mockResolvedValue({ items: { data: [{ id: "si_1" }] } });
    mocks.subUpdate.mockReset().mockResolvedValue({});
    mocks.dbUpdate.mockReset();
    dbState.error = null;
  });

  it("swaps the price on the existing item with an explicit proration_behavior of 'none'", async () => {
    const result = await setCustomPrice(row, "price_new");

    expect(result).toMatchObject({ ok: true, priceId: "price_new", effective: "next_cycle" });
    expect(mocks.subUpdate).toHaveBeenCalledWith("sub_123", {
      items: [{ id: "si_1", price: "price_new" }],
      proration_behavior: "none",
    });
    // The constant and the call must agree — the choice lives in code, not a comment.
    expect(mocks.subUpdate.mock.calls[0][1].proration_behavior).toBe(
      CUSTOM_PRICE_PRORATION_BEHAVIOR
    );
  });

  it("mirrors amount_cents and stripe_price_id to the new price", async () => {
    const result = await setCustomPrice(row, "price_new");

    expect(result).toMatchObject({ ok: true, amountCents: 7500 });
    expect(mocks.dbUpdate).toHaveBeenCalledWith({
      stripe_price_id: "price_new",
      amount_cents: 7500,
    });
  });

  it("reports a warning but still succeeds when the mirror write fails", async () => {
    dbState.error = { message: "db down" };

    const result = await setCustomPrice(row, "price_new");

    expect(result.ok).toBe(true);
    expect(result).toHaveProperty("warning");
  });

  it("rejects a malformed price id before touching Stripe", async () => {
    const result = await setCustomPrice(row, "prod_123");

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(mocks.priceRetrieve).not.toHaveBeenCalled();
  });

  it("refuses an offline row — there is no Stripe subscription to move", async () => {
    const result = await setCustomPrice({ ...row, stripe_subscription_id: null }, "price_new");

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(mocks.subUpdate).not.toHaveBeenCalled();
  });

  it("404s on a price that doesn't exist at Stripe", async () => {
    mocks.priceRetrieve.mockRejectedValue(stripeMissing());

    const result = await setCustomPrice(row, "price_gone");

    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(mocks.subUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ["archived", okPrice({ active: false })],
    ["one-time", okPrice({ type: "one_time", recurring: null })],
    ["non-USD", okPrice({ currency: "eur" })],
    ["tiered (no unit_amount)", okPrice({ unit_amount: null })],
  ])("refuses a %s price without swapping", async (_label, price) => {
    mocks.priceRetrieve.mockResolvedValue(price);

    const result = await setCustomPrice(row, "price_new");

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(mocks.subUpdate).not.toHaveBeenCalled();
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });

  it("refuses a multi-item subscription rather than guessing which item to swap", async () => {
    mocks.subRetrieve.mockResolvedValue({ items: { data: [{ id: "si_1" }, { id: "si_2" }] } });

    const result = await setCustomPrice(row, "price_new");

    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(mocks.subUpdate).not.toHaveBeenCalled();
  });

  it("does not mirror anything when the Stripe swap itself fails", async () => {
    mocks.subUpdate.mockRejectedValue(new Error("stripe exploded"));

    const result = await setCustomPrice(row, "price_new");

    expect(result).toMatchObject({ ok: false, status: 502 });
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });
});
