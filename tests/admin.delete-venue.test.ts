import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  stripeCancel: vi.fn(),
  stripeRetrieve: vi.fn(),
  deleteAuthUser: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: mocks.from,
    auth: { admin: { deleteUser: mocks.deleteAuthUser } },
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

type OwnerLink = { owner_id: string; venue_owners: { auth_id: string | null } | null } | null;

// Builds the `from(...)` chains deleteAdminVenue uses, in call order:
//   1. venue_owner_venues -> select -> eq -> maybeSingle       (owner link lookup)
//   2. billing_subscriptions -> select -> eq -> maybeSingle
//   3. venues -> delete -> eq (resolves)
//   4. venue_owner_venues -> delete -> eq (resolves)           (explicit link delete; only if owner)
//   5. venue_owner_venues -> select -> eq -> limit             (remaining links; only if owner)
//   6. venue_owners -> delete -> eq (resolves)                 (only if owner has no others)
function mockDeleteChains(
  subscriptionRow: Record<string, unknown> | null,
  deleteError: unknown = null,
  ownerLink: OwnerLink = null,
  remainingOwnerLinks: Array<{ id: string }> = [],
  linkDeleteError: unknown = null
) {
  // Owner link lookup (call 1)
  const ownerLinkMaybeSingle = vi.fn().mockResolvedValue({ data: ownerLink, error: null });
  const ownerLinkEq = vi.fn().mockReturnValue({ maybeSingle: ownerLinkMaybeSingle });
  // Remaining-links check (call 5)
  const remainingLimit = vi.fn().mockResolvedValue({ data: remainingOwnerLinks, error: null });
  const remainingEq = vi.fn().mockReturnValue({ limit: remainingLimit });
  // venue_owner_venues.select routes to lookup first, then remaining check
  const vovSelect = vi
    .fn()
    .mockReturnValueOnce({ eq: ownerLinkEq })
    .mockReturnValueOnce({ eq: remainingEq });
  // Explicit link delete (call 4)
  const linkDeleteEq = vi.fn().mockResolvedValue({ error: linkDeleteError });
  const linkDel = vi.fn().mockReturnValue({ eq: linkDeleteEq });

  const maybeSingle = vi.fn().mockResolvedValue({ data: subscriptionRow, error: null });
  const subEq = vi.fn().mockReturnValue({ maybeSingle });
  const subSelect = vi.fn().mockReturnValue({ eq: subEq });

  const deleteEq = vi.fn().mockResolvedValue({ error: deleteError });
  const del = vi.fn().mockReturnValue({ eq: deleteEq });

  const ownerDeleteEq = vi.fn().mockResolvedValue({ error: null });
  const ownerDel = vi.fn().mockReturnValue({ eq: ownerDeleteEq });

  mocks.from.mockImplementation((table: string) => {
    if (table === "venue_owner_venues") return { select: vovSelect, delete: linkDel };
    if (table === "billing_subscriptions") return { select: subSelect };
    if (table === "venues") return { delete: del };
    if (table === "venue_owners") return { delete: ownerDel };
    throw new Error(`Unexpected table ${table}`);
  });

  return { del, deleteEq, ownerDel, linkDel };
}

describe("deleteAdminVenue billing safety", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.stripeCancel.mockReset();
    mocks.stripeRetrieve.mockReset();
    mocks.deleteAuthUser.mockReset();
    mocks.deleteAuthUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  it("deletes a venue with no subscription without touching Stripe", async () => {
    const { del } = mockDeleteChains(null);

    const result = await deleteAdminVenue("plain-venue");

    expect(mocks.stripeRetrieve).not.toHaveBeenCalled();
    expect(mocks.stripeCancel).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ subscriptionCancelled: false, ownerAccountDeleted: false, authUserDeleted: false });
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
    expect(result).toEqual({ subscriptionCancelled: true, ownerAccountDeleted: false, authUserDeleted: false });
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
    expect(result).toEqual({ subscriptionCancelled: false, ownerAccountDeleted: false, authUserDeleted: false });
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
    expect(result).toEqual({ subscriptionCancelled: false, ownerAccountDeleted: false, authUserDeleted: false });
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
    expect(result).toEqual({ subscriptionCancelled: false, ownerAccountDeleted: false, authUserDeleted: false });
  });
});

describe("deleteAdminVenue owner-account teardown", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.stripeCancel.mockReset();
    mocks.stripeRetrieve.mockReset();
    mocks.deleteAuthUser.mockReset();
    mocks.deleteAuthUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  it("removes the owner account and auth login when the deleted venue was its only venue", async () => {
    const { del, ownerDel } = mockDeleteChains(
      null,
      null,
      { owner_id: "owner-1", venue_owners: { auth_id: "auth-1" } },
      [] // no remaining links after the cascade
    );

    const result = await deleteAdminVenue("venue-test");

    expect(del).toHaveBeenCalledTimes(1);
    expect(mocks.deleteAuthUser).toHaveBeenCalledWith("auth-1");
    expect(ownerDel).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ subscriptionCancelled: false, ownerAccountDeleted: true, authUserDeleted: true });
  });

  it("keeps the owner account when the owner still owns another venue", async () => {
    const { del, ownerDel } = mockDeleteChains(
      null,
      null,
      { owner_id: "owner-1", venue_owners: { auth_id: "auth-1" } },
      [{ id: "other-link" }] // owner still linked elsewhere
    );

    const result = await deleteAdminVenue("venue-test");

    expect(del).toHaveBeenCalledTimes(1);
    expect(mocks.deleteAuthUser).not.toHaveBeenCalled();
    expect(ownerDel).not.toHaveBeenCalled();
    expect(result).toEqual({ subscriptionCancelled: false, ownerAccountDeleted: false, authUserDeleted: false });
  });

  it("still reports the venue deleted if the best-effort auth-user cleanup fails", async () => {
    mocks.deleteAuthUser.mockRejectedValue(new Error("auth service down"));
    const { del, ownerDel } = mockDeleteChains(
      null,
      null,
      { owner_id: "owner-1", venue_owners: { auth_id: "auth-1" } },
      []
    );

    const result = await deleteAdminVenue("venue-test");

    expect(del).toHaveBeenCalledTimes(1);
    // Owner row is still reaped even though the auth login could not be removed.
    expect(ownerDel).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ subscriptionCancelled: false, ownerAccountDeleted: true, authUserDeleted: false });
  });

  it("explicitly deletes the owner link so a broken FK cascade cannot leave it orphaned", async () => {
    // The remaining-links check returns [] BECAUSE the explicit delete removed
    // the only link. If the code trusted the cascade instead, a drifted DB would
    // leave the link behind and this owner would never be reaped.
    const { linkDel, ownerDel } = mockDeleteChains(
      null,
      null,
      { owner_id: "owner-1", venue_owners: { auth_id: "auth-1" } },
      []
    );

    const result = await deleteAdminVenue("venue-test");

    // The link is removed explicitly (by venue_id), not left to the cascade.
    expect(linkDel).toHaveBeenCalledTimes(1);
    expect(ownerDel).toHaveBeenCalledTimes(1);
    expect(result.ownerAccountDeleted).toBe(true);
  });

  it("skips owner teardown if the explicit link delete fails (cannot trust remaining count)", async () => {
    const { ownerDel } = mockDeleteChains(
      null,
      null,
      { owner_id: "owner-1", venue_owners: { auth_id: "auth-1" } },
      [],
      { message: "link delete failed" }
    );

    const result = await deleteAdminVenue("venue-test");

    expect(mocks.deleteAuthUser).not.toHaveBeenCalled();
    expect(ownerDel).not.toHaveBeenCalled();
    expect(result).toEqual({ subscriptionCancelled: false, ownerAccountDeleted: false, authUserDeleted: false });
  });
});
