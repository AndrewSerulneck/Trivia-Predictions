import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 4 of the resubscribe-loops-to-dashboard fix (docs/resubscribe-fix-plan.md):
 * resumeSubscription reverses a scheduled cancel_at_period_end while the paid
 * period is still running. The load-bearing property is that it un-schedules the
 * EXISTING Stripe subscription and never mints a new one — a second subscription
 * on the same customer means double billing plus a venue_id-unique upsert
 * collision in the webhook. Tokenless offline/legacy rows have no
 * cancel_at_period_end concept at the processor and are refused here (admin
 * re-grant is their reactivation path).
 */

const mocks = vi.hoisted(() => ({
  stripeUpdate: vi.fn(),
  checkoutCreate: vi.fn(),
  dbUpdate: vi.fn((_payload: Record<string, unknown>) => undefined),
  eq: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    subscriptions: { update: mocks.stripeUpdate },
    checkout: { sessions: { create: mocks.checkoutCreate } },
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

import { resumeSubscription } from "@/lib/billing";

describe("resumeSubscription", () => {
  beforeEach(() => {
    mocks.stripeUpdate.mockReset().mockResolvedValue({});
    mocks.checkoutCreate.mockReset();
    mocks.dbUpdate.mockReset();
    mocks.eq.mockReset().mockResolvedValue({ error: null });
  });

  it("un-schedules the cancel on the existing Stripe subscription and mirrors the flag locally", async () => {
    const result = await resumeSubscription({ id: "sub-1", stripe_subscription_id: "sub_stripe_123" });

    expect(result).toEqual({ ok: true, mode: "stripe" });
    expect(mocks.stripeUpdate).toHaveBeenCalledWith("sub_stripe_123", { cancel_at_period_end: false });
    expect(mocks.dbUpdate).toHaveBeenCalledWith({ cancel_at_period_end: false });
  });

  it("never creates a second Stripe subscription", async () => {
    await resumeSubscription({ id: "sub-1", stripe_subscription_id: "sub_stripe_123" });

    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
    // Only the existing subscription id is ever touched.
    expect(mocks.stripeUpdate).toHaveBeenCalledTimes(1);
  });

  it("never flips status locally — Stripe stays authoritative and the webhook syncs back", async () => {
    await resumeSubscription({ id: "sub-1", stripe_subscription_id: "sub_stripe_123" });

    expect(mocks.dbUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.dbUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ status: expect.anything() }));
  });

  it("refuses a tokenless offline/legacy row with a 400 and never calls Stripe", async () => {
    const result = await resumeSubscription({ id: "sub-2", stripe_subscription_id: null });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "This subscription can't be resumed here. Please contact support.",
    });
    expect(mocks.stripeUpdate).not.toHaveBeenCalled();
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });

  it("surfaces a 502 when the Stripe resume call fails, without writing the local mirror", async () => {
    mocks.stripeUpdate.mockRejectedValue(new Error("stripe down"));

    const result = await resumeSubscription({ id: "sub-3", stripe_subscription_id: "sub_stripe_456" });

    expect(result).toEqual({ ok: false, status: 502, error: "stripe down" });
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });
});
