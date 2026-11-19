import { beforeEach, describe, expect, it, vi } from "vitest";

/** Phase 3 of docs/partner-business-type-plan.md: admin sees and sets a partner's business type. */

vi.mock("@/lib/adminAuth", () => ({
  requireAdminAuth: vi.fn(async () => ({ ok: true, authUserId: "admin-1", adminUsername: "admin" })),
}));
vi.mock("@/lib/billing", () => ({ cancelSubscription: vi.fn() }));

vi.mock("@/lib/venueBilling", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/venueBilling")>()),
  loadBillingForVenues: vi.fn(async () => ({ ok: true, byVenue: new Map() })),
  billMembershipsForBills: vi.fn(async () => ({ ok: true, byBill: new Map() })),
  unbilledVenueStates: vi.fn(async () => ({ ok: true, byVenue: new Map() })),
}));

const state = vi.hoisted(() => ({
  updates: [] as Array<{ values: unknown; id: string }>,
  updateResult: { data: { id: "owner-1" } as { id: string } | null, error: null as { message: string } | null },
}));

vi.mock("@/lib/supabaseAdmin", () => {
  const links = [
    { owner_id: "owner-1", venue_id: "venue-1", venue_owners: { email: "a@test.com", name: "A", business_type: "trivia_dj" }, venues: { id: "venue-1", name: "V1", display_name: null } },
    { owner_id: "owner-2", venue_id: "venue-2", venue_owners: { email: "b@test.com", name: "B", business_type: null }, venues: { id: "venue-2", name: "V2", display_name: null } },
    { owner_id: "owner-3", venue_id: "venue-3", venue_owners: { email: "c@test.com", name: "C", business_type: "garbage" }, venues: { id: "venue-3", name: "V3", display_name: null } },
  ];
  return {
    supabaseAdmin: {
      from: vi.fn((table: string) => {
        if (table === "venue_owner_venues") {
          return { select: vi.fn(() => ({ returns: vi.fn(() => Promise.resolve({ data: links, error: null })) })) };
        }
        if (table === "billing_subscriptions" || table === "billing_bill_venues") {
          return { select: vi.fn(() => ({ in: vi.fn(() => ({ returns: vi.fn(() => Promise.resolve({ data: [], error: null })) })) })) };
        }
        if (table === "venue_owners") {
          return {
            update: vi.fn((values: unknown) => ({
              eq: vi.fn((_col: string, id: string) => {
                state.updates.push({ values, id });
                return { select: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve(state.updateResult)) })) };
              }),
            })),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    },
  };
});

import { GET, POST } from "@/app/api/admin/billing/route";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/admin/billing", { method: "POST", body: JSON.stringify(body) }));

describe("admin billing — business type", () => {
  beforeEach(() => {
    state.updates.length = 0;
    state.updateResult = { data: { id: "owner-1" }, error: null };
  });

  it("GET returns businessType; null and unrecognised stored values read as null", async () => {
    const response = await GET(new Request("http://localhost/api/admin/billing"));
    const body = (await response.json()) as { ok: boolean; partners: Array<{ ownerId: string; businessType: string | null }> };
    const byOwner = Object.fromEntries(body.partners.map((p) => [p.ownerId, p.businessType]));
    expect(byOwner).toEqual({ "owner-1": "trivia_dj", "owner-2": null, "owner-3": null });
  });

  it("POST set-business-type writes the partner row, no venue needed", async () => {
    const response = await post({ action: "set-business-type", ownerId: "owner-1", businessType: "hotel" });
    expect(response.status).toBe(200);
    expect(state.updates).toEqual([{ values: { business_type: "hotel" }, id: "owner-1" }]);
  });

  it.each([undefined, null, "", "Hotel!", "bar", 5])("rejects %j without writing", async (businessType) => {
    const response = await post({ action: "set-business-type", ownerId: "owner-1", businessType });
    expect(response.status).toBe(400);
    expect(state.updates).toEqual([]);
  });

  it("rejects a missing partner id", async () => {
    expect((await post({ action: "set-business-type", businessType: "hotel" })).status).toBe(400);
    expect(state.updates).toEqual([]);
  });

  it("404s an unknown partner", async () => {
    state.updateResult = { data: null, error: null };
    expect((await post({ action: "set-business-type", ownerId: "nope", businessType: "hotel" })).status).toBe(404);
  });
});
