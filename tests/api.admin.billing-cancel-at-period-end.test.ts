import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 2 of the billing/owner-teardown review fixes: GET /api/admin/billing
 * must surface cancel_at_period_end so the admin UI can tell a scheduled-but-
 * not-yet-finalized Stripe cancellation apart from "nothing happened" (Revoke
 * only sets cancel_at_period_end — status stays 'active' until the period
 * actually ends, see lib/billing.ts).
 */

vi.mock("@/lib/adminAuth", () => ({
  requireAdminAuth: vi.fn(async () => ({ ok: true, authUserId: "admin-1", adminUsername: "admin" })),
}));

vi.mock("@/lib/billing", () => ({ cancelSubscription: vi.fn() }));

type SubRow = {
  venue_id: string;
  plan_type: string;
  billing_method: string;
  status: string;
  amount_cents: number;
  current_period_start: string | null;
  current_period_end: string | null;
  stripe_subscription_id: string | null;
  slimcd_recurring_token: string | null;
  cancel_at_period_end: boolean | null;
};

vi.mock("@/lib/supabaseAdmin", () => {
  const links = [
    {
      owner_id: "owner-1",
      venue_id: "venue-1",
      venue_owners: { email: "owner@test.com", name: "Owner One" },
      venues: { id: "venue-1", name: "Venue One", display_name: null },
    },
  ];
  const subs: SubRow[] = [
    {
      venue_id: "venue-1",
      plan_type: "subscription",
      billing_method: "stripe",
      status: "active",
      amount_cents: 10000,
      current_period_start: "2026-06-01T00:00:00.000Z",
      current_period_end: "2026-07-01T00:00:00.000Z",
      stripe_subscription_id: "sub_stripe_1",
      slimcd_recurring_token: null,
      cancel_at_period_end: true,
    },
  ];

  return {
    supabaseAdmin: {
      from: vi.fn((table: string) => {
        if (table === "venue_owner_venues") {
          return { select: vi.fn(() => ({ returns: vi.fn(() => Promise.resolve({ data: links, error: null })) })) };
        }
        if (table === "billing_subscriptions") {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({ returns: vi.fn(() => Promise.resolve({ data: subs, error: null })) })),
            })),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    },
  };
});

import { GET } from "@/app/api/admin/billing/route";

describe("GET /api/admin/billing — cancelAtPeriodEnd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("round-trips cancel_at_period_end as cancelAtPeriodEnd on the subscription payload", async () => {
    const response = await GET(new Request("http://localhost/api/admin/billing"));
    const body = (await response.json()) as {
      ok: boolean;
      partners: Array<{ subscription: { cancelAtPeriodEnd: boolean; status: string } | null }>;
    };

    expect(body.ok).toBe(true);
    expect(body.partners).toHaveLength(1);
    expect(body.partners[0].subscription?.status).toBe("active");
    expect(body.partners[0].subscription?.cancelAtPeriodEnd).toBe(true);
  });
});
