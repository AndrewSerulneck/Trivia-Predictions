import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 2 of the offline-billing review fixes: cancelSubscription is the shared
 * helper behind both owner self-cancel and admin revoke. A live Stripe
 * subscription must be cancelled through Stripe (cancel_at_period_end), never
 * with a bare DB status flip — otherwise Stripe keeps charging the customer
 * while the dashboard shows no access. A tokenless offline/legacy row has
 * nothing to cancel at the processor, so it flips status='cancelled' directly.
 */

const mocks = vi.hoisted(() => ({
  stripeUpdate: vi.fn(),
  dbUpdate: vi.fn((_payload: Record<string, unknown>) => undefined),
  eq: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: { subscriptions: { update: mocks.stripeUpdate } },
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

import { cancelSubscription } from "@/lib/billing";

describe("cancelSubscription", () => {
  beforeEach(() => {
    mocks.stripeUpdate.mockReset().mockResolvedValue({});
    mocks.dbUpdate.mockReset();
    mocks.eq.mockReset().mockResolvedValue({ error: null });
  });

  it("cancels a Stripe-backed row through Stripe at period end (no bare status flip)", async () => {
    const result = await cancelSubscription({ id: "sub-1", stripe_subscription_id: "sub_stripe_123" });

    expect(result).toEqual({ ok: true, mode: "stripe" });
    expect(mocks.stripeUpdate).toHaveBeenCalledWith("sub_stripe_123", { cancel_at_period_end: true });
    // Local mirror is the flag, NOT a status='cancelled' write.
    expect(mocks.dbUpdate).toHaveBeenCalledWith({ cancel_at_period_end: true });
    expect(mocks.dbUpdate).not.toHaveBeenCalledWith({ status: "cancelled" });
  });

  it("flips a tokenless offline row to cancelled in the DB, never calling Stripe", async () => {
    const result = await cancelSubscription({ id: "sub-2", stripe_subscription_id: null });

    expect(result).toEqual({ ok: true, mode: "db" });
    expect(mocks.stripeUpdate).not.toHaveBeenCalled();
    expect(mocks.dbUpdate).toHaveBeenCalledWith({ status: "cancelled" });
  });

  it("surfaces a 502 when the Stripe cancel call fails", async () => {
    mocks.stripeUpdate.mockRejectedValue(new Error("stripe down"));

    const result = await cancelSubscription({ id: "sub-3", stripe_subscription_id: "sub_stripe_456" });

    expect(result).toEqual({ ok: false, status: 502, error: "stripe down" });
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });
});
