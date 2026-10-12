import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

/**
 * Multi-venue volume billing Phase 1 — what the Stripe webhook mirrors.
 *
 *   - A row that already tracks a subscription is found by its Stripe subscription id, so the
 *     write stays on that row even when the metadata names another venue (Phase 5 re-anchoring).
 *   - amount_cents is the whole bill: flat price × quantity, or the graduated bands for a tiered
 *     price — whose unit_amount is null and would otherwise mirror as $0 (plan §7 trap 1).
 *   - quantity is mirrored; if the column is not there yet (code deployed before the migration),
 *     the write is retried without it instead of failing every billing event.
 */

type Row = { venue_id: string; stripe_subscription_id: string | null };

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  upsert: vi.fn(),
  rows: [] as Row[],
  upsertErrors: [] as Array<{ code?: string; message: string } | null>,
}));

vi.mock("@/lib/stripe", async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return {
    ...actual,
    stripe: {
      webhooks: { constructEvent: mocks.constructEvent },
      subscriptions: { retrieve: vi.fn() },
      invoices: { list: vi.fn(async () => ({ data: [] })) },
    },
    getStripeWebhookSecret: () => "whsec_test",
  };
});

vi.mock("@/lib/email/sendWelcomeEmail", () => ({ sendWelcomeEmail: vi.fn(async () => false) }));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: vi.fn(() => {
      const filters: Array<[string, unknown]> = [];
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return builder;
        },
        not: () => builder,
        or: () => builder,
        update: () => builder,
        returns: async () => ({ data: [], error: null }),
        maybeSingle: async () => ({
          data:
            mocks.rows.find((row) => filters.every(([c, v]) => (row as Record<string, unknown>)[c] === v)) ?? null,
          error: null,
        }),
        upsert: (payload: Record<string, unknown>, options: unknown) => {
          mocks.upsert(payload, options);
          return Promise.resolve({ error: mocks.upsertErrors.shift() ?? null });
        },
      };
      return builder;
    }),
  },
}));

import { POST } from "@/app/api/webhooks/stripe/route";

const makeSub = (
  id: string,
  item: { quantity?: number; price: Record<string, unknown> },
  venueId = "venue-1"
): Stripe.Subscription =>
  ({
    id,
    metadata: { venueId, ownerId: "owner-1" },
    customer: "cus_1",
    status: "active",
    cancel_at_period_end: false,
    items: {
      data: [{ ...item, current_period_start: 1_700_000_000, current_period_end: 1_702_600_000 }],
    },
  }) as unknown as Stripe.Subscription;

const FLAT = { id: "price_flat", nickname: "monthly", unit_amount: 10000, billing_scheme: "per_unit" };
const TIERED = { id: "price_graduated", nickname: "monthly", unit_amount: null, billing_scheme: "tiered", tiers_mode: "graduated" };

const deliver = async (sub: Stripe.Subscription) => {
  mocks.constructEvent.mockReturnValue({ type: "customer.subscription.updated", data: { object: sub } });
  return POST(
    new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "sig_test" },
      body: "{}",
    })
  );
};

const lastPayload = () => mocks.upsert.mock.calls.at(-1)?.[0] as Record<string, unknown>;

describe("POST /api/webhooks/stripe — multi-venue mirror", () => {
  beforeEach(() => {
    mocks.constructEvent.mockReset();
    mocks.upsert.mockReset();
    mocks.rows = [];
    mocks.upsertErrors = [];
  });

  it("today's subscriber (flat $100, quantity 1) mirrors exactly what it always did, plus quantity 1", async () => {
    mocks.rows = [{ venue_id: "venue-1", stripe_subscription_id: "sub_1" }];

    const response = await deliver(makeSub("sub_1", { quantity: 1, price: FLAT }));

    expect(response.status).toBe(200);
    expect(lastPayload()).toMatchObject({ venue_id: "venue-1", amount_cents: 10000, quantity: 1 });
  });

  it("a tiered price mirrors the graduated total for its quantity, never $0", async () => {
    mocks.rows = [{ venue_id: "venue-1", stripe_subscription_id: "sub_1" }];

    await deliver(makeSub("sub_1", { quantity: 3, price: TIERED }));

    expect(lastPayload()).toMatchObject({ amount_cents: 25000, quantity: 3 });
  });

  // Phase 6.8 (review 6.5 #3): the lookup key rides beside the price id, so displays can tell a
  // custom_monthly_ per-venue rate from any other flat Price.
  it("mirrors the Price's lookup key beside its id (null when the Price has none)", async () => {
    mocks.rows = [{ venue_id: "venue-1", stripe_subscription_id: "sub_1" }];

    await deliver(makeSub("sub_1", { quantity: 2, price: { ...FLAT, id: "price_custom", unit_amount: 7000, lookup_key: "custom_monthly_7000" } }));
    expect(lastPayload()).toMatchObject({ stripe_price_id: "price_custom", stripe_price_lookup_key: "custom_monthly_7000", amount_cents: 14000 });

    await deliver(makeSub("sub_1", { quantity: 3, price: { ...TIERED, lookup_key: "hightop_venue_graduated_monthly_v1" } }));
    expect(lastPayload()).toMatchObject({ stripe_price_id: "price_graduated", stripe_price_lookup_key: "hightop_venue_graduated_monthly_v1" });

    await deliver(makeSub("sub_1", { quantity: 1, price: FLAT }));
    expect(lastPayload()).toMatchObject({ stripe_price_id: "price_flat", stripe_price_lookup_key: null });
  });

  it("uses the Price's own tiers when the payload carries them", async () => {
    mocks.rows = [{ venue_id: "venue-1", stripe_subscription_id: "sub_1" }];
    const withTiers = {
      ...TIERED,
      tiers: [
        { up_to: 1, unit_amount: 10000, flat_amount: null },
        { up_to: null, unit_amount: 5000, flat_amount: null },
      ],
    };

    await deliver(makeSub("sub_1", { quantity: 3, price: withTiers }));

    expect(lastPayload()).toMatchObject({ amount_cents: 20000 });
  });

  it("a tracked subscription stays on its own row even when the metadata names another venue", async () => {
    // Phase 5 can move a chain's anchor; the row tracking sub_chain is anchored on "anchor-venue".
    mocks.rows = [{ venue_id: "anchor-venue", stripe_subscription_id: "sub_chain" }];

    await deliver(makeSub("sub_chain", { quantity: 2, price: TIERED }, "venue-from-old-metadata"));

    expect(lastPayload()).toMatchObject({ venue_id: "anchor-venue", stripe_subscription_id: "sub_chain", amount_cents: 17500 });
  });

  it("retries without quantity when the column is not in the database yet (deploy skew), and succeeds", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.rows = [{ venue_id: "venue-1", stripe_subscription_id: "sub_1" }];
    mocks.upsertErrors = [
      { code: "PGRST204", message: "Could not find the 'quantity' column of 'billing_subscriptions' in the schema cache" },
    ];

    const response = await deliver(makeSub("sub_1", { quantity: 1, price: FLAT }));

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.upsert.mock.calls[0][0]).toHaveProperty("quantity", 1);
    expect(mocks.upsert.mock.calls[1][0]).not.toHaveProperty("quantity");
    expect(mocks.upsert.mock.calls[1][0]).toMatchObject({ amount_cents: 10000 });
    expect(String(warn.mock.calls[0]?.[0])).toContain("[MultiVenueBilling] quantity-column-missing");
    warn.mockRestore();
  });

  it("any other write error still 500s so Stripe retries", async () => {
    mocks.rows = [{ venue_id: "venue-1", stripe_subscription_id: "sub_1" }];
    mocks.upsertErrors = [{ code: "57014", message: "statement timeout" }];

    const response = await deliver(makeSub("sub_1", { quantity: 1, price: FLAT }));

    expect(response.status).toBe(500);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
});
