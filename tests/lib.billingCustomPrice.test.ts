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
  getStripeGraduatedPriceId: vi.fn(),
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
  getStripeGraduatedPriceId: mocks.getStripeGraduatedPriceId,
}));

const dbState = vi.hoisted(() => ({
  error: null as { message: string } | null,
  /** claim_bill_price_change's answer (Phase 6.1); null = a fresh "claimed" row. */
  claim: null as null | { data?: unknown; error?: { code?: string; message: string } | null },
  /** finish_bill_price_change calls, and an optional error for them. */
  finishCalls: [] as Array<Record<string, unknown>>,
  finishError: null as null | { message: string },
  /** Every rpc call, in order. */
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  /** Rows a billing_venue_changes read returns, and its error (the settle tests). */
  changeRows: [] as Array<Record<string, unknown>>,
  changeReadError: null as null | { code?: string; message: string },
  /** The bill a settle reads. */
  bill: { id: "sub-row-1", stripe_subscription_id: "sub_123" } as Record<string, unknown> | null,
}));

vi.mock("@/lib/supabaseAdmin", () => {
  // A thenable chain: every filter returns the chain, awaiting it reads the table's rows.
  const reader = (table: string) => {
    const result = () =>
      table === "billing_venue_changes"
        ? { data: dbState.changeReadError ? null : dbState.changeRows, error: dbState.changeReadError }
        : { data: dbState.bill, error: null };
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "lt", "order", "limit", "returns"]) chain[method] = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => Promise.resolve(result()));
    chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject);
    return chain;
  };
  return {
    supabaseAdmin: {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => reader(table)),
        update: vi.fn((payload: unknown) => {
          mocks.dbUpdate(payload);
          return { eq: vi.fn(() => Promise.resolve({ error: dbState.error })) };
        }),
      })),
      rpc: vi.fn((name: string, args: Record<string, unknown>) => {
        dbState.rpcCalls.push({ name, args });
        if (name === "claim_bill_price_change") {
          if (dbState.claim) return Promise.resolve({ data: dbState.claim.data ?? null, error: dbState.claim.error ?? null });
          return Promise.resolve({ data: [{ outcome: "claimed", change_id: "chg-1", change_action: "price" }], error: null });
        }
        if (name === "finish_bill_price_change") {
          dbState.finishCalls.push(args);
          if (dbState.finishError) return Promise.resolve({ data: null, error: dbState.finishError });
          return Promise.resolve({ data: [{ outcome: args.p_outcome, change_status: args.p_outcome }], error: null });
        }
        return Promise.resolve({ data: null, error: { message: `unexpected rpc ${name}` } });
      }),
    },
  };
});

import {
  CUSTOM_PRICE_PRORATION_BEHAVIOR,
  MAX_CUSTOM_PRICE_DOLLARS,
  MIN_CUSTOM_PRICE_DOLLARS,
  customPriceLookupKey,
  reconcileStaleBillPriceChanges,
  resolveMonthlyPriceForAmount,
  setCustomPrice,
  setStandardPrice,
  settleBillPriceChange,
  settleStaleBillPriceChangesForBill,
  type BillPriceChangeRow,
} from "@/lib/billingCustomPrice";
import { VENUE_ADDITION_LEASE_MS } from "@/lib/venueAddition";

const row = { id: "sub-row-1", owner_id: "owner-1", stripe_subscription_id: "sub_123", amount_cents: 10000 };

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

const resetDb = () => {
  dbState.error = null;
  dbState.claim = null;
  dbState.finishCalls = [];
  dbState.finishError = null;
  dbState.rpcCalls = [];
  dbState.changeRows = [];
  dbState.changeReadError = null;
  dbState.bill = { id: "sub-row-1", stripe_subscription_id: "sub_123" };
};

/** Stripe's idempotency key on the swap = the ledger row's key: one fresh key per admin action. */
const KEY_OPTIONS = { idempotencyKey: expect.stringMatching(/^bill-price:sub-row-1:[0-9a-f-]{36}$/) };

describe("setCustomPrice", () => {
  beforeEach(() => {
    mocks.priceRetrieve.mockReset().mockResolvedValue(okPrice());
    mocks.priceList.mockReset().mockResolvedValue({ data: [] });
    mocks.priceCreate.mockReset().mockResolvedValue(okPrice());
    mocks.subRetrieve.mockReset().mockResolvedValue({ items: { data: [{ id: "si_1" }] } });
    mocks.subUpdate.mockReset().mockResolvedValue({});
    mocks.dbUpdate.mockReset();
    mocks.getStripePriceId.mockReset().mockReturnValue(LIST_PRICE_ID);
    mocks.getStripeGraduatedPriceId.mockReset().mockReturnValue("price_graduated");
    resetDb();
  });

  it("swaps the price on the existing item with an explicit proration_behavior of 'none'", async () => {
    const result = await setCustomPrice(row, "price_new");

    expect(result).toMatchObject({ ok: true, priceId: "price_new", effective: "next_cycle" });
    expect(mocks.subUpdate).toHaveBeenCalledWith(
      "sub_123",
      {
        items: [{ id: "si_1", price: "price_new", quantity: 1 }],
        proration_behavior: "none",
      },
      KEY_OPTIONS
    );
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
      quantity: 1,
    });
  });

  // Multi-venue billing Phase 6 (Andrew, 2026-10-11: "per-venue rate").
  it("is a PER-VENUE rate: keeps the bill's venue count and mirrors rate × venues", async () => {
    mocks.subRetrieve.mockResolvedValue({ items: { data: [{ id: "si_1", quantity: 3 }] } });

    const result = await setCustomPrice(row, "price_new");

    expect(result).toMatchObject({ ok: true, amountCents: 7500, quantity: 3, monthlyTotalCents: 22500 });
    expect(mocks.subUpdate.mock.calls[0][1].items).toEqual([{ id: "si_1", price: "price_new", quantity: 3 }]);
    expect(mocks.dbUpdate).toHaveBeenCalledWith({ stripe_price_id: "price_new", amount_cents: 22500, quantity: 3 });
  });

  // Phase 6.1 (review fix #1): the swap is a claimed change under the bill's lock.
  it("claims the bill BEFORE reading Stripe, then closes the claim as done", async () => {
    await setCustomPrice(row, "price_new");

    const claim = dbState.rpcCalls.find((call) => call.name === "claim_bill_price_change");
    expect(claim?.args).toEqual({
      p_idempotency_key: expect.stringMatching(/^bill-price:sub-row-1:/),
      p_owner_id: "owner-1",
      p_subscription_id: "sub-row-1",
      p_price_id: "price_new",
    });
    // One key from the claim to Stripe: a retried request can never apply twice.
    expect(mocks.subUpdate.mock.calls[0][2]).toEqual({ idempotencyKey: claim?.args.p_idempotency_key });
    const rpc = (await import("@/lib/supabaseAdmin")).supabaseAdmin!.rpc as unknown as ReturnType<typeof vi.fn>;
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.subRetrieve.mock.invocationCallOrder[0]);
    expect(dbState.finishCalls).toEqual([{ p_change_id: "chg-1", p_outcome: "done", p_failure_reason: null }]);
  });

  it.each([
    ["busy_addition", "remove", /being added to or removed/],
    ["busy_change", "remove", /being added to or removed/],
    ["busy_change", "price", /Another price change/],
  ])("refuses while the bill is claimed (%s, a %s in flight) — never touches Stripe", async (outcome, action, message) => {
    dbState.claim = { data: [{ outcome, change_id: "other", change_action: action }] };

    const result = await setCustomPrice(row, "price_new");

    expect(result).toMatchObject({ ok: false, status: 409 });
    expect((result as { error: string }).error).toMatch(message);
    expect(mocks.subRetrieve).not.toHaveBeenCalled();
    expect(mocks.subUpdate).not.toHaveBeenCalled();
    expect(dbState.finishCalls).toEqual([]);
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });

  it("fails CLOSED when the claim RPC is missing (app deployed before the migration) — never swaps unlocked", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    dbState.claim = { error: { code: "PGRST202", message: "Could not find the function public.claim_bill_price_change" } };

    const result = await setCustomPrice(row, "price_new");

    expect(result).toMatchObject({ ok: false, status: 503 });
    expect(errorLog.mock.calls.flat().join(" ")).toContain("[CustomPrice] claim-rpc-missing");
    expect(mocks.subRetrieve).not.toHaveBeenCalled();
    expect(mocks.subUpdate).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it("refuses a bill whose owner changed (404 for a vanished bill)", async () => {
    dbState.claim = { data: [{ outcome: "not_owner", change_id: null }] };
    expect(await setCustomPrice(row, "price_new")).toMatchObject({ ok: false, status: 409 });
    dbState.claim = { data: [{ outcome: "no_bill", change_id: null }] };
    expect(await setCustomPrice(row, "price_new")).toMatchObject({ ok: false, status: 404 });
    expect(mocks.subUpdate).not.toHaveBeenCalled();
  });

  it("refuses while Stripe holds a pending update (an add waiting for 3-D Secure), closing its claim as failed", async () => {
    mocks.subRetrieve.mockResolvedValue({ items: { data: [{ id: "si_1", quantity: 2 }] }, pending_update: { expires_at: 1 } });

    const result = await setCustomPrice(row, "price_new");

    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(mocks.subUpdate).not.toHaveBeenCalled();
    expect(dbState.finishCalls).toEqual([{ p_change_id: "chg-1", p_outcome: "failed", p_failure_reason: "refused:pending-update" }]);
  });

  it("setStandardPrice moves the bill back onto the graduated bands, keeping its venues", async () => {
    mocks.subRetrieve.mockResolvedValue({ items: { data: [{ id: "si_1", quantity: 3 }] } });

    const result = await setStandardPrice(row);

    expect(result).toMatchObject({ ok: true, priceId: "price_graduated", quantity: 3, monthlyTotalCents: 25000 });
    expect(mocks.subUpdate).toHaveBeenCalledWith(
      "sub_123",
      {
        items: [{ id: "si_1", price: "price_graduated", quantity: 3 }],
        proration_behavior: "none",
      },
      KEY_OPTIONS
    );
    expect(mocks.dbUpdate).toHaveBeenCalledWith({ stripe_price_id: "price_graduated", amount_cents: 25000, quantity: 3 });
    expect(dbState.rpcCalls[0]).toMatchObject({ name: "claim_bill_price_change", args: { p_price_id: "price_graduated" } });
  });

  it("setStandardPrice refuses an offline bill and an unconfigured graduated price", async () => {
    expect(await setStandardPrice({ ...row, stripe_subscription_id: null })).toMatchObject({ ok: false, status: 400 });
    mocks.getStripeGraduatedPriceId.mockReturnValue("");
    expect(await setStandardPrice(row)).toMatchObject({ ok: false, status: 500 });
    expect(mocks.subUpdate).not.toHaveBeenCalled();
    expect(dbState.rpcCalls).toEqual([]);
  });

  it("reports a warning but still succeeds when the mirror write fails", async () => {
    dbState.error = { message: "db down" };

    const result = await setCustomPrice(row, "price_new");

    expect(result.ok).toBe(true);
    expect(result).toHaveProperty("warning");
  });

  it("still succeeds (with a warning) when Stripe took the swap but closing the claim failed — it settles later", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    dbState.finishError = { message: "db down" };

    const result = await setCustomPrice(row, "price_new");

    expect(result).toMatchObject({ ok: true, priceId: "price_new" });
    expect((result as { warning?: string }).warning).toMatch(/paused/);
    expect(mocks.dbUpdate).toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it("rejects a malformed price id before touching Stripe", async () => {
    const result = await setCustomPrice(row, "prod_123");

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(mocks.priceRetrieve).not.toHaveBeenCalled();
    expect(dbState.rpcCalls).toEqual([]);
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
    // Validated before the bill is claimed: a refused Price never locks the bill.
    expect(dbState.rpcCalls).toEqual([]);
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
    expect(dbState.finishCalls).toEqual([{ p_change_id: "chg-1", p_outcome: "failed", p_failure_reason: "refused:multiple-items" }]);
  });

  it("a failed subscription read closes the claim as failed (nothing reached Stripe)", async () => {
    mocks.subRetrieve.mockRejectedValue(Object.assign(new Error("Stripe down"), { type: "StripeAPIError", statusCode: 500 }));

    const result = await setCustomPrice(row, "price_new");

    expect(result).toMatchObject({ ok: false, status: 502 });
    expect(mocks.subUpdate).not.toHaveBeenCalled();
    expect(dbState.finishCalls).toEqual([{ p_change_id: "chg-1", p_outcome: "failed", p_failure_reason: "subscription-read-failed" }]);
  });

  it("a definite Stripe refusal (4xx) closes the claim as failed and mirrors nothing", async () => {
    mocks.subUpdate.mockRejectedValue(
      Object.assign(new Error("No such price"), { type: "StripeInvalidRequestError", statusCode: 400, code: "resource_missing" })
    );

    const result = await setCustomPrice(row, "price_new");

    expect(result).toMatchObject({ ok: false, status: 502 });
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
    expect(dbState.finishCalls).toEqual([
      { p_change_id: "chg-1", p_outcome: "failed", p_failure_reason: "stripe-rejected: resource_missing" },
    ]);
  });

  it("an AMBIGUOUS Stripe error leaves the claim pending (the bill stays locked until it is settled)", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.subUpdate.mockRejectedValue(Object.assign(new Error("socket hang up"), { type: "StripeConnectionError" }));

    const result = await setCustomPrice(row, "price_new");

    expect(result).toMatchObject({ ok: false, status: 503 });
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
    expect(dbState.finishCalls).toEqual([]);
    expect(errorLog.mock.calls.flat().join(" ")).toContain("[CustomPrice] stripe-update-ambiguous change=chg-1");
    errorLog.mockRestore();
  });
});

/**
 * Phase 6.1: a swap whose request died (or whose Stripe answer was ambiguous) stays pending, keeping
 * the bill locked, until its lease runs out. Then Stripe's real Price decides it.
 */
describe("settling a price swap that never closed", () => {
  const NOW = Date.parse("2026-10-11T12:00:00Z");
  const stale = new Date(NOW - VENUE_ADDITION_LEASE_MS - 1000).toISOString();
  const pendingRow = (overrides: Partial<BillPriceChangeRow> = {}): BillPriceChangeRow => ({
    id: "chg-stale",
    idempotency_key: "bill-price:sub-row-1:k",
    owner_id: "owner-1",
    subscription_id: "sub-row-1",
    action: "price",
    status: "pending",
    price_id: "price_custom_7000",
    failure_reason: null,
    created_at: stale,
    updated_at: stale,
    ...overrides,
  });

  beforeEach(() => {
    mocks.subRetrieve.mockReset().mockResolvedValue({ items: { data: [{ id: "si_1", price: { id: "price_custom_7000" } }] } });
    resetDb();
  });

  it("leaves a row inside its lease alone (its request may still be running)", async () => {
    const fresh = new Date(NOW - 1000).toISOString();
    expect(await settleBillPriceChange(pendingRow({ updated_at: fresh }), NOW)).toBe("in_flight");
    expect(mocks.subRetrieve).not.toHaveBeenCalled();
    expect(dbState.finishCalls).toEqual([]);
  });

  it("done when Stripe's item is on the target Price (the swap landed)", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(await settleBillPriceChange(pendingRow(), NOW)).toBe("done");
    expect(mocks.subRetrieve).toHaveBeenCalledWith("sub_123");
    expect(dbState.finishCalls).toEqual([{ p_change_id: "chg-stale", p_outcome: "done", p_failure_reason: null }]);
    log.mockRestore();
  });

  it("failed when Stripe's item is on any other Price (the swap never landed)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.subRetrieve.mockResolvedValue({ items: { data: [{ id: "si_1", price: { id: "price_graduated" } }] } });
    expect(await settleBillPriceChange(pendingRow(), NOW)).toBe("failed");
    expect(dbState.finishCalls).toEqual([
      { p_change_id: "chg-stale", p_outcome: "failed", p_failure_reason: "stripe-price-not-applied" },
    ]);
    warn.mockRestore();
  });

  it("failed when the subscription is gone at Stripe, or the bill has none", async () => {
    mocks.subRetrieve.mockRejectedValue(Object.assign(new Error("No such subscription"), { code: "resource_missing" }));
    expect(await settleBillPriceChange(pendingRow(), NOW)).toBe("failed");
    dbState.bill = { id: "sub-row-1", stripe_subscription_id: null };
    expect(await settleBillPriceChange(pendingRow(), NOW)).toBe("failed");
    expect(dbState.finishCalls.map((call) => call.p_failure_reason)).toEqual(["subscription-missing", "bill-has-no-subscription"]);
  });

  it("stays pending when Stripe can't be read (the next pass tries again)", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.subRetrieve.mockRejectedValue(Object.assign(new Error("socket hang up"), { type: "StripeConnectionError" }));
    expect(await settleBillPriceChange(pendingRow(), NOW)).toBe("unknown");
    expect(dbState.finishCalls).toEqual([]);
    errorLog.mockRestore();
  });

  it("never settles a Remove / Undo row as a price swap", async () => {
    expect(await settleBillPriceChange(pendingRow({ action: "remove" }), NOW)).toBe("unknown");
    expect(mocks.subRetrieve).not.toHaveBeenCalled();
    expect(dbState.finishCalls).toEqual([]);
  });

  it("the daily job settles each stale row and counts them; dry run only counts", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    dbState.changeRows = [pendingRow(), pendingRow({ id: "chg-other", price_id: "price_graduated" })];

    expect(await reconcileStaleBillPriceChanges({ dryRun: true, nowMs: NOW })).toMatchObject({ scanned: 2, done: 0, failed: 0 });
    expect(dbState.finishCalls).toEqual([]);

    expect(await reconcileStaleBillPriceChanges({ nowMs: NOW })).toMatchObject({ scanned: 2, done: 1, failed: 1, errors: [] });
    log.mockRestore();
    warn.mockRestore();
  });

  it("before the migration (no price_id column) the settlers do nothing and report no error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    dbState.changeReadError = { code: "42703", message: "column billing_venue_changes.price_id does not exist" };

    expect(await reconcileStaleBillPriceChanges({ nowMs: NOW })).toMatchObject({ scanned: 0, errors: [] });
    await expect(settleStaleBillPriceChangesForBill("sub-row-1", NOW)).resolves.toBeUndefined();
    expect(mocks.subRetrieve).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("the per-bill settle never throws (its callers are routes that must carry on)", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    dbState.changeReadError = { code: "XX000", message: "db down" };
    await expect(settleStaleBillPriceChangesForBill("sub-row-1", NOW)).resolves.toBeUndefined();
    errorLog.mockRestore();
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
    resetDb();
  });

  it("resolves a dollar amount to a minted price and swaps it with the existing proration invariant", async () => {
    const result = await setCustomPrice(row, { amountDollars: 75 });

    expect(result).toMatchObject({ ok: true, priceId: "price_minted_7500", amountCents: 7500 });
    expect(mocks.subUpdate).toHaveBeenCalledWith(
      "sub_123",
      {
        items: [{ id: "si_1", price: "price_minted_7500", quantity: 1 }],
        proration_behavior: CUSTOM_PRICE_PRORATION_BEHAVIOR,
      },
      KEY_OPTIONS
    );
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
