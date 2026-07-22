import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  stripeCancel: vi.fn(),
  stripeRetrieve: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: mocks.from,
  },
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    subscriptions: {
      cancel: mocks.stripeCancel,
      retrieve: mocks.stripeRetrieve,
    },
  },
}));

import { deleteAdminVenue } from "@/lib/admin";

// Builds the two `from(...)` chains deleteAdminVenue uses, in call order:
//   1. billing_subscriptions -> select -> eq -> maybeSingle
//   2. venues -> delete -> eq (resolves)
function mockDeleteChains(subscriptionRow: Record<string, unknown> | null, deleteError: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: subscriptionRow, error: null });
  const subEq = vi.fn().mockReturnValue({ maybeSingle });
  const subSelect = vi.fn().mockReturnValue({ eq: subEq });

  const deleteEq = vi.fn().mockResolvedValue({ error: deleteError });
  const del = vi.fn().mockReturnValue({ eq: deleteEq });

  mocks.from.mockImplementation((table: string) => {
    if (table === "billing_subscriptions") return { select: subSelect };
    if (table === "venues") return { delete: del };
    throw new Error(`Unexpected table ${table}`);
  });

  return { del, deleteEq };
}

describe("deleteAdminVenue billing safety", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.stripeCancel.mockReset();
    mocks.stripeRetrieve.mockReset();
  });

  it("deletes a venue with no subscription without touching Stripe", async () => {
    const { del } = mockDeleteChains(null);

    const result = await deleteAdminVenue("plain-venue");

    expect(mocks.stripeRetrieve).not.toHaveBeenCalled();
    expect(mocks.stripeCancel).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ subscriptionCancelled: false });
  });

  it("cancels the live Stripe subscription before deleting a partner venue", async () => {
    mocks.stripeRetrieve.mockResolvedValue({ id: "sub_123", status: "active" });
    mocks.stripeCancel.mockResolvedValue({ id: "sub_123", status: "canceled" });
    const { del } = mockDeleteChains({
      id: "row-1",
      status: "active",
      stripe_subscription_id: "sub_123",
    });

    const result = await deleteAdminVenue("partner-venue");

    expect(mocks.stripeRetrieve).toHaveBeenCalledWith("sub_123");
    expect(mocks.stripeCancel).toHaveBeenCalledWith("sub_123");
    expect(del).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ subscriptionCancelled: true });
  });

  it("does not delete the venue if Stripe cancellation fails", async () => {
    mocks.stripeRetrieve.mockResolvedValue({ id: "sub_123", status: "active" });
    mocks.stripeCancel.mockRejectedValue(new Error("network down"));
    const { del } = mockDeleteChains({
      id: "row-1",
      status: "active",
      stripe_subscription_id: "sub_123",
    });

    await expect(deleteAdminVenue("partner-venue")).rejects.toThrow(/network down/);
    expect(del).not.toHaveBeenCalled();
  });

  it("proceeds when Stripe reports the subscription is already gone", async () => {
    mocks.stripeRetrieve.mockRejectedValue(new Error("No such subscription: sub_123"));
    const { del } = mockDeleteChains({
      id: "row-1",
      status: "active",
      stripe_subscription_id: "sub_123",
    });

    const result = await deleteAdminVenue("partner-venue");

    expect(mocks.stripeCancel).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ subscriptionCancelled: false });
  });

  it("skips Stripe entirely for a subscription already marked cancelled locally", async () => {
    const { del } = mockDeleteChains({
      id: "row-1",
      status: "cancelled",
      stripe_subscription_id: "sub_123",
    });

    const result = await deleteAdminVenue("partner-venue");

    expect(mocks.stripeRetrieve).not.toHaveBeenCalled();
    expect(mocks.stripeCancel).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ subscriptionCancelled: false });
  });

  it("skips the cancel call when local status is stale 'active' but Stripe already shows canceled (webhook lag)", async () => {
    mocks.stripeRetrieve.mockResolvedValue({ id: "sub_123", status: "canceled" });
    const { del } = mockDeleteChains({
      id: "row-1",
      status: "active",
      stripe_subscription_id: "sub_123",
    });

    const result = await deleteAdminVenue("partner-venue");

    expect(mocks.stripeRetrieve).toHaveBeenCalledWith("sub_123");
    expect(mocks.stripeCancel).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ subscriptionCancelled: false });
  });
});
