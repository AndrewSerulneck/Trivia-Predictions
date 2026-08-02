import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Round-2 review finding 1 (docs/billing-review-round2-plan.md Phase 1).
 *
 * The round-1 fix detached the Stripe coupon before a venue converted to check
 * billing — but unconditionally, on any row still carrying a
 * stripe_subscription_id. cancelSubscription() retains that id on purpose, and
 * Stripe rejects updates on a canceled subscription, so the supported workflow
 * "card partner churns → admin converts them to check billing" 502'd with no way
 * for the admin to clear it. It failed even for a row with no discount at all.
 *
 * Unlike tests/api.admin.billing-grant-manual-clears-discount.test.ts, this suite
 * does NOT mock @/lib/billingDiscounts — it mocks the Stripe SDK underneath it,
 * so the real detach path (and its real failure modes) is what runs.
 */

const mocks = vi.hoisted(() => ({
  subscriptionUpdate: vi.fn(),
  upsert: vi.fn(),
  dbUpdate: vi.fn(),
  cancelSubscription: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({
  requireAdminAuth: vi.fn(async () => ({ ok: true, authUserId: "admin-1", adminUsername: "admin" })),
}));

vi.mock("@/lib/billing", () => ({
  cancelSubscription: mocks.cancelSubscription,
}));

vi.mock("@/lib/stripe", () => ({
  OFFLINE_BILLING_METHOD: "offline",
  stripe: {
    coupons: { retrieve: vi.fn(), create: vi.fn() },
    subscriptions: { update: mocks.subscriptionUpdate },
    prices: { retrieve: vi.fn() },
  },
}));

type ExistingSub = {
  id: string;
  billing_method: string;
  stripe_subscription_id: string | null;
  status: string;
  amount_cents: number;
  current_period_end: string | null;
  stripe_coupon_id: string | null;
  discount_label: string | null;
  discount_percent_off: number | null;
  discount_amount_off_cents: number | null;
  discount_ends_at: string | null;
};

vi.mock("@/lib/supabaseAdmin", () => {
  let existingSub: ExistingSub | null = null;
  return {
    supabaseAdmin: {
      from: vi.fn((table: string) => {
        if (table === "billing_subscriptions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: existingSub })),
              })),
            })),
            update: vi.fn((payload: Record<string, unknown>) => {
              mocks.dbUpdate(payload);
              return { eq: vi.fn(() => Promise.resolve({ error: null })) };
            }),
            upsert: vi.fn((...args: unknown[]) => {
              mocks.upsert(...args);
              return {
                select: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: { id: "sub-new" }, error: null })),
                })),
              };
            }),
          };
        }
        if (table === "venue_owner_venues") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(() => Promise.resolve({ data: { owner_id: "owner-1" } })),
                })),
              })),
            })),
          };
        }
        if (table === "billing_invoices") {
          return { insert: vi.fn(() => Promise.resolve({ error: null })) };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
      __setExistingSub: (row: ExistingSub | null) => {
        existingSub = row;
      },
    },
  };
});

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { POST } from "@/app/api/admin/billing/route";

const setExistingSub = (row: ExistingSub | null) => {
  (supabaseAdmin as unknown as { __setExistingSub: (r: ExistingSub | null) => void }).__setExistingSub(row);
};

const NO_DISCOUNT = {
  stripe_coupon_id: null,
  discount_label: null,
  discount_percent_off: null,
  discount_amount_off_cents: null,
  discount_ends_at: null,
} as const;

const WITH_DISCOUNT = {
  stripe_coupon_id: "hc-pct-25-forever",
  discount_label: "25% off",
  discount_percent_off: 25,
  discount_amount_off_cents: null,
  discount_ends_at: null,
} as const;

const row = (overrides: Partial<ExistingSub>): ExistingSub => ({
  id: "sub-1",
  billing_method: "stripe",
  stripe_subscription_id: "sub_stripe_1",
  status: "cancelled",
  amount_cents: 10000,
  current_period_end: null,
  ...NO_DISCOUNT,
  ...overrides,
});

const futureDate = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
};

const grant = (venueId: string, extra: Record<string, unknown> = {}) =>
  POST(
    new Request("http://localhost/api/admin/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "grant-manual",
        venueId,
        paidThroughDate: futureDate(),
        amountDollars: 100,
        ...extra,
      }),
    })
  );

describe("POST /api/admin/billing — grant-manual on a churned card row", () => {
  beforeEach(() => {
    mocks.subscriptionUpdate.mockReset();
    mocks.upsert.mockReset();
    mocks.dbUpdate.mockReset();
    mocks.cancelSubscription.mockReset();
    mocks.subscriptionUpdate.mockResolvedValue({});
  });

  it("converts a cancelled card row with NO discount without touching Stripe", async () => {
    setExistingSub(row({ status: "cancelled" }));

    const response = await grant("venue-1");

    expect(response.status).toBe(200);
    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalled();
  });

  it("converts a cancelled card row that still carries a discount mirror", async () => {
    // Stripe would reject an update on a canceled subscription, so the detach is
    // skipped outright — a canceled subscription bills nothing, so its coupon is
    // inert and cannot be orphaned onto a live charge.
    setExistingSub(row({ status: "cancelled", ...WITH_DISCOUNT }));

    const response = await grant("venue-2");

    expect(response.status).toBe(200);
    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
    // The mirror is still cleared in our DB by the upsert payload.
    expect((mocks.upsert.mock.calls[0][0] as { discount_label: string | null }).discount_label).toBeNull();
  });

  it("skips the detach for a LIVE card row with no discount recorded", async () => {
    setExistingSub(row({ status: "past_due" }));
    mocks.cancelSubscription.mockResolvedValue({ ok: true, mode: "stripe" });

    const response = await grant("venue-3", { force: true });

    expect(response.status).toBe(200);
    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
  });

  it("still detaches for a LIVE card row that has a discount", async () => {
    setExistingSub(row({ status: "past_due", ...WITH_DISCOUNT }));
    mocks.cancelSubscription.mockResolvedValue({ ok: true, mode: "stripe" });

    const response = await grant("venue-4", { force: true });

    expect(response.status).toBe(200);
    expect(mocks.subscriptionUpdate).toHaveBeenCalledWith("sub_stripe_1", { discounts: "" });
  });

  it("still 502s when a LIVE discounted row's detach fails for a real reason", async () => {
    // The guardrail the round-1 fix existed for: a live coupon must not be left
    // attached to a subscription we are about to stop tracking.
    setExistingSub(row({ status: "past_due", ...WITH_DISCOUNT }));
    mocks.cancelSubscription.mockResolvedValue({ ok: true, mode: "stripe" });
    mocks.subscriptionUpdate.mockRejectedValue(
      Object.assign(new Error("Stripe is down"), { code: "api_error" })
    );

    const response = await grant("venue-5", { force: true });

    expect(response.status).toBe(502);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("proceeds when the detach fails because the subscription is already gone at Stripe", async () => {
    setExistingSub(row({ status: "past_due", ...WITH_DISCOUNT }));
    mocks.cancelSubscription.mockResolvedValue({ ok: true, mode: "stripe" });
    mocks.subscriptionUpdate.mockRejectedValue(
      Object.assign(new Error("No such subscription: 'sub_stripe_1'"), { code: "resource_missing" })
    );

    const response = await grant("venue-6", { force: true });

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalled();
  });

  it("proceeds when Stripe refuses the update because the subscription is canceled", async () => {
    setExistingSub(row({ status: "past_due", ...WITH_DISCOUNT }));
    mocks.cancelSubscription.mockResolvedValue({ ok: true, mode: "stripe" });
    mocks.subscriptionUpdate.mockRejectedValue(
      new Error("You cannot update a subscription that is canceled.")
    );

    const response = await grant("venue-7", { force: true });

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalled();
  });
});
