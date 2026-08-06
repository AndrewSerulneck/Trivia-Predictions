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
  priceList: vi.fn(),
  priceCreate: vi.fn(),
  subRetrieve: vi.fn(),
  subUpdate: vi.fn(),
  dbUpdate: vi.fn(),
  getStripePriceId: vi.fn(),
}));

// priceRetrieve must answer for two different ids: the list price (looked up
// by resolveMonthlyPriceForAmount to find the Product) and whatever price id
// setCustomPrice is validating (pasted, or just-minted). Route by id so both
// callers get sane defaults without every test wiring its own switch.
const LIST_PRICE_ID = "price_list_100";

vi.mock("@/lib/stripe", () => ({
  stripe: {
    prices: { retrieve: mocks.priceRetrieve, list: mocks.priceList, create: mocks.priceCreate },
    subscriptions: { retrieve: mocks.subRetrieve, update: mocks.subUpdate },
  },
  getStripePriceId: mocks.getStripePriceId,
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

import {
  CUSTOM_PRICE_PRORATION_BEHAVIOR,
  MAX_CUSTOM_PRICE_DOLLARS,
  MIN_CUSTOM_PRICE_DOLLARS,
  customPriceLookupKey,
  resolveMonthlyPriceForAmount,
  setCustomPrice,
} from "@/lib/billingCustomPrice";

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
const stripeDuplicateKey = () =>
  Object.assign(new Error("lookup_key already taken"), { code: "resource_already_exists" });

describe("setCustomPrice", () => {
  beforeEach(() => {
    mocks.priceRetrieve.mockReset().mockResolvedValue(okPrice());
    mocks.priceList.mockReset().mockResolvedValue({ data: [] });
    mocks.priceCreate.mockReset().mockResolvedValue(okPrice());
    mocks.subRetrieve.mockReset().mockResolvedValue({ items: { data: [{ id: "si_1" }] } });
    mocks.subUpdate.mockReset().mockResolvedValue({});
    mocks.dbUpdate.mockReset();
    mocks.getStripePriceId.mockReset().mockReturnValue(LIST_PRICE_ID);
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
    // Round-2 review finding 3: a yearly price passed every other guard, flipped
    // the subscription to yearly at Stripe, and wrote the yearly figure into
    // amount_cents — which every surface renders as the MONTHLY rate.
    ["yearly", okPrice({ recurring: { interval: "year" } })],
    ["weekly", okPrice({ recurring: { interval: "week" } })],
    // A month-interval price that still isn't monthly — an interval-only check
    // would let this through and mis-state the rate by 3x.
    ["quarterly (interval_count 3)", okPrice({ recurring: { interval: "month", interval_count: 3 } })],
  ])("refuses a %s price without swapping", async (_label, price) => {
    mocks.priceRetrieve.mockResolvedValue(price);

    const result = await setCustomPrice(row, "price_new");

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(mocks.subUpdate).not.toHaveBeenCalled();
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });

  it("names the offending cadence so the admin knows what went wrong", async () => {
    mocks.priceRetrieve.mockResolvedValue(okPrice({ recurring: { interval: "year" } }));

    const result = await setCustomPrice(row, "price_new");

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect((result as { error: string }).error).toMatch(/yearly/i);
  });

  it("accepts an explicit interval_count of 1 — the positive case must not regress", async () => {
    mocks.priceRetrieve.mockResolvedValue(okPrice({ recurring: { interval: "month", interval_count: 1 } }));

    const result = await setCustomPrice(row, "price_new");

    expect(result).toMatchObject({ ok: true, amountCents: 7500 });
    expect(mocks.subUpdate).toHaveBeenCalled();
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

/**
 * resolveMonthlyPriceForAmount: reuse-vs-mint, the band, and the two ways a
 * duplicate lookup_key error can resolve (race vs. archived-price 409). See
 * docs/billing-dollar-rate-plan.md §1.3/§1.4 and the Phase 2 run-log deviations
 * in docs/billing-dollar-rate-run-log.md before touching this block.
 */
describe("resolveMonthlyPriceForAmount", () => {
  beforeEach(() => {
    mocks.priceRetrieve.mockReset().mockResolvedValue({ id: LIST_PRICE_ID, product: "prod_abc" });
    mocks.priceList.mockReset().mockResolvedValue({ data: [] });
    mocks.priceCreate.mockReset().mockResolvedValue(okPrice({ id: "price_minted_7500" }));
    mocks.getStripePriceId.mockReset().mockReturnValue(LIST_PRICE_ID);
  });

  it("reuses an existing lookup_key hit and never calls prices.create", async () => {
    mocks.priceList.mockResolvedValue({ data: [{ id: "price_existing_7500" }] });

    const result = await resolveMonthlyPriceForAmount(75);

    expect(result).toEqual({ ok: true, priceId: "price_existing_7500" });
    expect(mocks.priceList).toHaveBeenCalledWith({
      lookup_keys: [customPriceLookupKey(7500)],
      active: true,
      limit: 1,
    });
    expect(mocks.priceCreate).not.toHaveBeenCalled();
  });

  it("mints a new price on a miss with the exact unit_amount, currency, monthly recurring, and lookup_key", async () => {
    const result = await resolveMonthlyPriceForAmount(75);

    expect(result).toEqual({ ok: true, priceId: "price_minted_7500" });
    expect(mocks.priceCreate).toHaveBeenCalledWith({
      product: "prod_abc",
      unit_amount: 7500,
      currency: "usd",
      recurring: { interval: "month", interval_count: 1 },
      lookup_key: customPriceLookupKey(7500),
    });
  });

  it("resolves the Product from the configured list price, not a hardcoded id", async () => {
    await resolveMonthlyPriceForAmount(75);

    expect(mocks.priceRetrieve).toHaveBeenCalledWith(LIST_PRICE_ID);
  });

  it.each([
    [MIN_CUSTOM_PRICE_DOLLARS - 5, "below the band"],
    [MAX_CUSTOM_PRICE_DOLLARS + 4000, "above the band"],
  ])("rejects $%d dollars (%s)", async (dollars) => {
    const result = await resolveMonthlyPriceForAmount(dollars);

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(mocks.priceList).not.toHaveBeenCalled();
    expect(mocks.priceCreate).not.toHaveBeenCalled();
  });

  it.each([MIN_CUSTOM_PRICE_DOLLARS, MAX_CUSTOM_PRICE_DOLLARS])(
    "accepts the inclusive boundary $%d",
    async (dollars) => {
      const result = await resolveMonthlyPriceForAmount(dollars);

      expect(result.ok).toBe(true);
    }
  );

  it("rejects a non-integer dollar amount before touching Stripe", async () => {
    const result = await resolveMonthlyPriceForAmount(75.5);

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(mocks.priceList).not.toHaveBeenCalled();
    expect(mocks.priceCreate).not.toHaveBeenCalled();
  });

  it("catches a concurrent duplicate-lookup_key create and re-resolves onto the race winner's price", async () => {
    mocks.priceList
      .mockResolvedValueOnce({ data: [] }) // initial lookup: miss
      .mockResolvedValueOnce({ data: [{ id: "price_raced_7500" }] }); // re-resolve: the other admin's create won
    mocks.priceCreate.mockRejectedValue(stripeDuplicateKey());

    const result = await resolveMonthlyPriceForAmount(75);

    expect(result).toEqual({ ok: true, priceId: "price_raced_7500" });
  });

  it("returns a 409 naming the lookup_key when create fails and re-resolve still finds nothing (archived price holds the key)", async () => {
    mocks.priceList.mockResolvedValue({ data: [] }); // both the initial lookup and the re-resolve miss
    mocks.priceCreate.mockRejectedValue(stripeDuplicateKey());

    const result = await resolveMonthlyPriceForAmount(75);

    expect(result).toMatchObject({ ok: false, status: 409 });
    expect((result as { error: string }).error).toContain(customPriceLookupKey(7500));
  });

  // The archived-price 409 is a claim about the lookup_key specifically, so it
  // must be gated on resource_already_exists. Any other create failure that
  // happens to re-resolve empty is just a failure: surface Stripe's own message
  // instead of sending the admin hunting for a price that does not exist.
  it.each([
    ["rate_limit", "Too many requests. Please try again later."],
    ["api_error", "An unexpected error occurred at Stripe."],
    [undefined, "Invalid product id"],
  ])("502s with Stripe's own message when create fails with code %s", async (code, message) => {
    mocks.priceList.mockResolvedValue({ data: [] }); // re-resolve also finds nothing
    mocks.priceCreate.mockRejectedValue(
      code ? Object.assign(new Error(message), { code }) : new Error(message)
    );

    const result = await resolveMonthlyPriceForAmount(75);

    expect(result).toMatchObject({ ok: false, status: 502, error: message });
    expect((result as { error: string }).error).not.toContain(customPriceLookupKey(7500));
  });

  // The race branch runs ahead of the code check on purpose: a create that
  // failed for any reason is still satisfied if the Price now exists.
  it("still reuses a raced price when the create failed with a non-duplicate code", async () => {
    mocks.priceList
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ id: "price_raced_7500" }] });
    mocks.priceCreate.mockRejectedValue(
      Object.assign(new Error("Too many requests"), { code: "rate_limit" })
    );

    const result = await resolveMonthlyPriceForAmount(75);

    expect(result).toEqual({ ok: true, priceId: "price_raced_7500" });
  });
});

/**
 * setCustomPrice's amountDollars entry point: confirms the resolver plugs into
 * the unchanged swap path (CUSTOM_PRICE_PRORATION_BEHAVIOR still applies to a
 * minted price) and that the pasted price_… path is untouched by any of this.
 */
describe("setCustomPrice — amountDollars entry point", () => {
  beforeEach(() => {
    mocks.priceRetrieve.mockReset().mockImplementation((id: string) =>
      Promise.resolve(id === LIST_PRICE_ID ? { id: LIST_PRICE_ID, product: "prod_abc" } : okPrice({ id }))
    );
    mocks.priceList.mockReset().mockResolvedValue({ data: [] });
    mocks.priceCreate.mockReset().mockResolvedValue(okPrice({ id: "price_minted_7500" }));
    mocks.subRetrieve.mockReset().mockResolvedValue({ items: { data: [{ id: "si_1" }] } });
    mocks.subUpdate.mockReset().mockResolvedValue({});
    mocks.dbUpdate.mockReset();
    mocks.getStripePriceId.mockReset().mockReturnValue(LIST_PRICE_ID);
    dbState.error = null;
  });

  it("resolves a dollar amount to a minted price and swaps it with the existing proration invariant", async () => {
    const result = await setCustomPrice(row, { amountDollars: 75 });

    expect(result).toMatchObject({ ok: true, priceId: "price_minted_7500", amountCents: 7500 });
    expect(mocks.subUpdate).toHaveBeenCalledWith("sub_123", {
      items: [{ id: "si_1", price: "price_minted_7500" }],
      proration_behavior: CUSTOM_PRICE_PRORATION_BEHAVIOR,
    });
  });

  it("refuses an offline row before ever resolving a price (no orphan Price minted)", async () => {
    const result = await setCustomPrice({ ...row, stripe_subscription_id: null }, { amountDollars: 75 });

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(mocks.priceList).not.toHaveBeenCalled();
    expect(mocks.priceCreate).not.toHaveBeenCalled();
    expect(mocks.subUpdate).not.toHaveBeenCalled();
  });

  it("rejects an out-of-band dollar amount without touching Stripe or the DB", async () => {
    const result = await setCustomPrice(row, { amountDollars: 5000 });

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(mocks.priceCreate).not.toHaveBeenCalled();
    expect(mocks.subUpdate).not.toHaveBeenCalled();
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });

  it("still accepts the bare pasted-price_… string form unchanged", async () => {
    const result = await setCustomPrice(row, "price_new");

    expect(result).toMatchObject({ ok: true, priceId: "price_new", amountCents: 7500 });
    expect(mocks.priceList).not.toHaveBeenCalled();
    expect(mocks.priceCreate).not.toHaveBeenCalled();
  });

  it("still accepts the { priceId } object form", async () => {
    const result = await setCustomPrice(row, { priceId: "price_new" });

    expect(result).toMatchObject({ ok: true, priceId: "price_new", amountCents: 7500 });
    expect(mocks.priceList).not.toHaveBeenCalled();
  });
});
