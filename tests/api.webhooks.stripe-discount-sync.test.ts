import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

/**
 * Phase 6 of docs/billing-discounts-plan.md — the webhook must re-sync the
 * discount mirror columns from Stripe's own state on every subscription event,
 * and on customer.discount.* events. Without it a repeating coupon that expired
 * at Stripe (or a discount removed straight from the Stripe Dashboard) would
 * keep being advertised to the admin and the partner forever.
 */

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  retrieveSubscription: vi.fn(),
  retrieveCoupon: vi.fn(),
  existingRow: null as { stripe_subscription_id: string | null } | null,
  /**
   * Rows a customer.discount.* event resolves to — by stripe_subscription_id, or
   * by stripe_customer_id for a customer-level discount. The handler reads the
   * mirror back before writing so a `deleted` event can check which coupon died.
   */
  mirrorRows: [] as Array<{ id: string; stripe_coupon_id: string | null; discount_label: string | null }>,
}));

vi.mock("@/lib/stripe", async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return {
    ...actual,
    stripe: {
      webhooks: { constructEvent: mocks.constructEvent },
      subscriptions: { retrieve: mocks.retrieveSubscription },
      coupons: { retrieve: mocks.retrieveCoupon },
    },
    getStripeWebhookSecret: () => "whsec_test",
  };
});

vi.mock("@/lib/email/sendWelcomeEmail", () => ({
  sendWelcomeEmail: vi.fn(async () => true),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: mocks.existingRow })),
          // Discount events resolve their target row(s) first.
          returns: vi.fn(() => Promise.resolve({ data: mocks.mirrorRows })),
        })),
      })),
      upsert: vi.fn((...args: unknown[]) => {
        mocks.upsert(...args);
        return Promise.resolve({ error: null });
      }),
      update: vi.fn((payload: unknown) => {
        mocks.update(payload);
        return {
          eq: vi.fn((column: string, value: unknown) => {
            mocks.updateEq(column, value);
            return Promise.resolve({ error: null });
          }),
        };
      }),
    })),
  },
}));

import { POST } from "@/app/api/webhooks/stripe/route";

const coupon = (overrides: Partial<Stripe.Coupon> = {}): Stripe.Coupon =>
  ({
    id: "hc-pct-25-forever",
    name: "25% off forever",
    percent_off: 25,
    amount_off: null,
    ...overrides,
  }) as unknown as Stripe.Coupon;

const discount = (
  couponRef: string | Stripe.Coupon,
  overrides: Partial<Stripe.Discount> = {}
): Stripe.Discount =>
  ({
    id: "di_1",
    object: "discount",
    subscription: "sub_current",
    customer: "cus_1",
    end: null,
    source: { type: "coupon", coupon: couponRef },
    ...overrides,
  }) as unknown as Stripe.Discount;

const makeSub = (
  id: string,
  discounts?: Array<string | Stripe.Discount>
): Stripe.Subscription =>
  ({
    id,
    metadata: { venueId: "venue-1", ownerId: "owner-1" },
    customer: "cus_1",
    status: "active",
    cancel_at_period_end: false,
    discounts: discounts ?? [],
    items: {
      data: [
        {
          price: { id: "price_1", nickname: "monthly", unit_amount: 10000 },
          current_period_start: 1_700_000_000,
          current_period_end: 1_702_600_000,
        },
      ],
    },
  }) as unknown as Stripe.Subscription;

const webhookRequest = () =>
  new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "sig_test" },
    body: "{}",
  });

type MirrorPayload = {
  stripe_coupon_id: string | null;
  discount_label: string | null;
  discount_percent_off: number | null;
  discount_amount_off_cents: number | null;
  discount_ends_at: string | null;
};

describe("POST /api/webhooks/stripe — discount mirror sync", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mocks.constructEvent.mockReset();
    mocks.upsert.mockReset();
    mocks.update.mockReset();
    mocks.updateEq.mockReset();
    mocks.retrieveSubscription.mockReset();
    mocks.retrieveCoupon.mockReset();
    mocks.existingRow = { stripe_subscription_id: "sub_current" };
    mocks.mirrorRows = [
      { id: "row-1", stripe_coupon_id: "hc-pct-25-forever", discount_label: "25% off forever" },
    ];
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("applies a customer-level discount to the one row that customer owns", async () => {
    mocks.constructEvent.mockReturnValue({
      type: "customer.discount.created",
      data: { object: discount(coupon(), { subscription: null }) },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.updateEq).toHaveBeenCalledWith("id", "row-1");
  });

  it("writes nothing when a customer-level discount matches more than one venue", async () => {
    // The update is unfiltered by subscription, so fanning out would overwrite a
    // sibling venue's own subscription-level discount with this one.
    mocks.mirrorRows = [
      { id: "row-1", stripe_coupon_id: null, discount_label: null },
      { id: "row-2", stripe_coupon_id: null, discount_label: null },
    ];
    mocks.constructEvent.mockReturnValue({
      type: "customer.discount.created",
      data: { object: discount(coupon(), { subscription: null }) },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.updateEq).not.toHaveBeenCalled();
  });

  it("clears the mirror when the subscription carries no discount", async () => {
    mocks.constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: { object: makeSub("sub_current", []) },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    const [payload] = mocks.upsert.mock.calls[0] as [MirrorPayload];
    expect(payload).toMatchObject({
      stripe_coupon_id: null,
      discount_label: null,
      discount_percent_off: null,
      discount_amount_off_cents: null,
      discount_ends_at: null,
    });
  });

  it("updates the mirror to a different coupon than the one currently mirrored", async () => {
    mocks.constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: makeSub("sub_current", [
          discount(coupon({ id: "hc-free-3mo", name: "3 free months", percent_off: 100 }), {
            end: 1_710_000_000,
          }),
        ]),
      },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    const [payload] = mocks.upsert.mock.calls[0] as [MirrorPayload];
    expect(payload).toMatchObject({
      stripe_coupon_id: "hc-free-3mo",
      discount_label: "3 free months",
      discount_percent_off: 100,
      discount_amount_off_cents: null,
      discount_ends_at: new Date(1_710_000_000 * 1000).toISOString(),
    });
  });

  it("expands an unexpanded discounts array before writing the mirror", async () => {
    mocks.retrieveSubscription.mockResolvedValue(
      makeSub("sub_current", [discount(coupon({ amount_off: 2500, percent_off: null, name: "$25 off" }))])
    );
    mocks.constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: { object: makeSub("sub_current", ["di_1"]) },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.retrieveSubscription).toHaveBeenCalledWith("sub_current", {
      expand: ["discounts.source.coupon"],
    });
    const [payload] = mocks.upsert.mock.calls[0] as [MirrorPayload];
    expect(payload).toMatchObject({
      stripe_coupon_id: "hc-pct-25-forever",
      discount_amount_off_cents: 2500,
      discount_percent_off: null,
    });
  });

  it("leaves the mirror untouched when Stripe is unreachable for the expansion", async () => {
    mocks.retrieveSubscription.mockRejectedValue(new Error("Stripe down"));
    mocks.constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: { object: makeSub("sub_current", ["di_1"]) },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    const [payload] = mocks.upsert.mock.calls[0] as [Record<string, unknown>];
    expect(payload).not.toHaveProperty("stripe_coupon_id");
    expect(payload).not.toHaveProperty("discount_label");
  });

  it("clears the mirror on customer.subscription.deleted", async () => {
    mocks.constructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: {
        object: makeSub("sub_current", [discount(coupon())]),
      },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    const [payload] = mocks.upsert.mock.calls[0] as [MirrorPayload & { status: string }];
    expect(payload.status).toBe("cancelled");
    expect(payload.stripe_coupon_id).toBeNull();
    expect(payload.discount_label).toBeNull();
  });

  it("clears the mirror on customer.discount.deleted for the coupon it actually holds", async () => {
    mocks.constructEvent.mockReturnValue({
      type: "customer.discount.deleted",
      data: { object: discount(coupon()) },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      stripe_coupon_id: null,
      discount_label: null,
      discount_percent_off: null,
      discount_amount_off_cents: null,
      discount_ends_at: null,
    });
    expect(mocks.updateEq).toHaveBeenCalledWith("id", "row-1");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("ignores a customer.discount.deleted for a coupon the mirror no longer holds", async () => {
    // Stripe replaces (not stacks) a discount, so swapping coupon A for B emits a
    // delete for A. Retried ~3 days later, that delete must not wipe B.
    mocks.mirrorRows = [
      { id: "row-1", stripe_coupon_id: "hc-free-3mo", discount_label: "3 free months" },
    ];
    mocks.constructEvent.mockReturnValue({
      type: "customer.discount.deleted",
      data: { object: discount(coupon({ id: "hc-pct-25-forever" })) },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("hc-pct-25-forever"));
  });

  it("survives the real replace-then-retry sequence", async () => {
    // 1. Coupon B replaces the mirrored coupon A.
    mocks.constructEvent.mockReturnValue({
      type: "customer.discount.created",
      data: { object: discount(coupon({ id: "hc-free-3mo", name: "3 free months", percent_off: 100 })) },
    });
    expect((await POST(webhookRequest())).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ stripe_coupon_id: "hc-free-3mo" })
    );

    // 2. The mirror now holds B, and Stripe redelivers the delete for A.
    mocks.mirrorRows = [
      { id: "row-1", stripe_coupon_id: "hc-free-3mo", discount_label: "3 free months" },
    ];
    mocks.update.mockClear();
    mocks.constructEvent.mockReturnValue({
      type: "customer.discount.deleted",
      data: { object: discount(coupon({ id: "hc-pct-25-forever" })) },
    });
    expect((await POST(webhookRequest())).status).toBe(200);

    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("never clears a locally-applied offline discount (stripe_coupon_id null)", async () => {
    mocks.mirrorRows = [
      { id: "row-1", stripe_coupon_id: null, discount_label: "25% off forever" },
    ];
    mocks.constructEvent.mockReturnValue({
      type: "customer.discount.deleted",
      data: { object: discount(coupon()) },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("leaves the mirror alone when the deleted event's own coupon is unresolvable", async () => {
    mocks.constructEvent.mockReturnValue({
      type: "customer.discount.deleted",
      // No source.coupon and no legacy `coupon` field: which coupon died is unknowable.
      data: { object: { ...discount(coupon()), source: null } as unknown as Stripe.Discount },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("applies the coupon identity check to the customer-level fallback too", async () => {
    mocks.mirrorRows = [
      { id: "row-1", stripe_coupon_id: "hc-free-3mo", discount_label: "3 free months" },
    ];
    mocks.constructEvent.mockReturnValue({
      type: "customer.discount.deleted",
      data: { object: discount(coupon({ id: "hc-pct-25-forever" }), { subscription: null }) },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("writes the new coupon on customer.discount.created, retrieving a bare coupon id", async () => {
    mocks.retrieveCoupon.mockResolvedValue(coupon({ id: "hc-pct-50-once", name: "50% off for one month", percent_off: 50 }));
    mocks.constructEvent.mockReturnValue({
      type: "customer.discount.created",
      data: { object: discount("hc-pct-50-once") },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.retrieveCoupon).toHaveBeenCalledWith("hc-pct-50-once");
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_coupon_id: "hc-pct-50-once",
        discount_label: "50% off for one month",
        discount_percent_off: 50,
      })
    );
    expect(mocks.updateEq).toHaveBeenCalledWith("id", "row-1");
  });

  /**
   * Round 4 Phase 6. A created/updated discount whose coupon can't be retrieved
   * must leave the mirror alone rather than write a valueless one — see the
   * comment at the write in syncDiscountFromEvent for the asymmetry.
   */
  it("leaves the mirror untouched when the created discount's coupon can't be retrieved", async () => {
    mocks.retrieveCoupon.mockRejectedValue(new Error("Stripe is down"));
    mocks.constructEvent.mockReturnValue({
      type: "customer.discount.created",
      data: { object: discount("hc-pct-50-once") },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.retrieveCoupon).toHaveBeenCalledWith("hc-pct-50-once");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("hc-pct-50-once"));
  });

  it("leaves the mirror untouched when an updated discount's coupon can't be retrieved", async () => {
    mocks.retrieveCoupon.mockRejectedValue(new Error("rate limited"));
    mocks.constructEvent.mockReturnValue({
      type: "customer.discount.updated",
      data: { object: discount("hc-free-3mo") },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  // The expanded-coupon payload has no retrieve and therefore no failure mode —
  // the new suppression must not catch these perfectly good writes.
  it("still writes when the coupon arrives expanded in the payload", async () => {
    mocks.constructEvent.mockReturnValue({
      type: "customer.discount.created",
      data: { object: discount(coupon({ id: "hc-pct-25-forever" })) },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.retrieveCoupon).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_coupon_id: "hc-pct-25-forever",
        discount_label: "25% off forever",
        discount_percent_off: 25,
      })
    );
  });

  // "No coupon reference at all" is a different thing from "resolution failed",
  // and keeps writing exactly as it did before this phase.
  it("still writes a discount that carries no coupon reference at all", async () => {
    mocks.constructEvent.mockReturnValue({
      type: "customer.discount.created",
      data: {
        object: {
          ...discount(coupon()),
          source: null,
          end: 1_702_600_000,
        } as unknown as Stripe.Discount,
      },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.retrieveCoupon).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_coupon_id: null,
        discount_label: null,
        discount_percent_off: null,
        discount_amount_off_cents: null,
        discount_ends_at: new Date(1_702_600_000 * 1000).toISOString(),
      })
    );
  });
});
